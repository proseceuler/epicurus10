import { useEffect, useRef, useState } from 'react';
import type { PageId } from '@/components/AppLayout';
import type { ArrodesVoiceMode } from '@/components/ArrodesVoiceMirror';
import type { ChatAttachment } from '@/lib/assistant/media';
import { fileToAttachment } from '@/lib/assistant/media';
import { loadHistory, saveHistory, loadSearchEnabled, saveSearchEnabled } from '@/lib/assistant/session';
import { createRecognizer, speechRecognitionCtor } from '@/lib/assistant/voice';
import { dispatchTool } from '@/lib/assistant/registry';
import { undoLastWrite } from '@/lib/assistant/undo';
import { runTurn } from '@/lib/arrodes/turn';
import { speak, stopSpeak, takeSentences } from '@/lib/arrodes/speak';
import { getGroqKey, getOpenRouterKey } from '@/lib/apiKeys';
import { usePomodoro } from '@/context/PomodoroContext';
import type { SubjectKey } from '@/lib/types';
import { THINK_WORDS, newId, type Msg } from '@/components/assistant/arrodesBits';

/** Clean Arrodes engine with tools, attachments, and web search. */
export function useArrodes(page: PageId, navigate?: (p: PageId) => void) {
  const pomodoro = usePomodoro();
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory<Msg>([]));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchOn, setSearchOn] = useState(() => loadSearchEnabled());
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceLeaving, setVoiceLeaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [thinkWord, setThinkWord] = useState(THINK_WORDS[0]);

  const voiceOnRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const leaveTimer = useRef(0);
  const speakQueue = useRef<Promise<void>>(Promise.resolve());
  const searchOnRef = useRef(searchOn);
  const lastFinalRef = useRef('');
  searchOnRef.current = searchOn;

  useEffect(() => {
    saveHistory(messages.slice(-40));
  }, [messages]);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopSpeak();
      try {
        recRef.current?.abort?.();
      } catch {
        /* */
      }
      window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!busy) return;
    setThinkWord(THINK_WORDS[Math.floor(Math.random() * THINK_WORDS.length)]);
  }, [busy]);

  const focus = (subject: string | null) => {
    pomodoro.setSessionContext((subject as SubjectKey) ?? null, null);
    pomodoro.switchType('focus');
    pomodoro.start();
    navigate?.('pomodoro');
  };

  const interrupt = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopSpeak();
    speakQueue.current = Promise.resolve();
    speakingRef.current = false;
    setSpeaking(false);
    busyRef.current = false;
    setBusy(false);
    setInterim('');
  };

  const enqueueSpeak = (sentence: string, signal: AbortSignal) => {
    speakQueue.current = speakQueue.current.then(async () => {
      if (signal.aborted || !voiceOnRef.current) return;
      await speak(
        sentence,
        {
          onStart: () => {
            speakingRef.current = true;
            setSpeaking(true);
          },
          onEnd: () => {
            speakingRef.current = false;
            setSpeaking(false);
          },
        },
        signal,
      );
    });
  };

  const startListen = () => {
    try {
      recRef.current?.abort?.();
    } catch {
      /* */
    }
    const rec = createRecognizer({
      continuous: true,
      onStart: () => setListening(true),
      onEnd: () => {
        setListening(false);
        // Restart only when idle in voice mode
        if (voiceOnRef.current && !busyRef.current && !speakingRef.current) {
          window.setTimeout(() => {
            if (voiceOnRef.current && !busyRef.current && !speakingRef.current) {
              try {
                rec?.start();
              } catch {
                /* */
              }
            }
          }, 200);
        }
      },
      onError: (msg) => setError(msg),
      onInterim: (t) => {
        if (!busyRef.current) setInterim(t);
      },
      onFinal: (t) => {
        const text = t.trim();
        if (!text || busyRef.current || speakingRef.current) return;
        // Dedupe identical back-to-back finals
        if (text === lastFinalRef.current) return;
        lastFinalRef.current = text;
        setInterim('');
        void send(text);
      },
    });
    if (!rec) {
      setError('Voice needs Chrome or Edge (Web Speech).');
      return;
    }
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError('Could not start the microphone.');
    }
  };

  const stopListen = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    setListening(false);
    setInterim('');
  };

  const toggleVoice = () => {
    if (voiceOn && (speakingRef.current || busyRef.current)) {
      interrupt();
      return;
    }
    if (voiceOn) {
      voiceOnRef.current = false;
      stopListen();
      stopSpeak();
      setSpeaking(false);
      setInterim('');
      setVoiceLeaving(true);
      setVoiceOn(false);
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => setVoiceLeaving(false), 900);
      return;
    }
    if (!speechRecognitionCtor()) {
      setError('Voice needs Chrome or Edge.');
      return;
    }
    if (!getGroqKey() && !getOpenRouterKey()) {
      setError('Add a Groq key in Settings for fast voice (or OpenRouter).');
      return;
    }
    window.clearTimeout(leaveTimer.current);
    setVoiceLeaving(false);
    setVoiceOn(true);
    voiceOnRef.current = true;
    setError('');
    lastFinalRef.current = '';
    startListen();
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      try {
        next.push(await fileToAttachment(file));
      } catch {
        setError('Could not attach that file.');
      }
    }
    setAttachments((cur) => [...cur, ...next].slice(0, 6));
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    const pendingAtt = attachments;
    if ((!content && !pendingAtt.length) || busyRef.current) return;
    if (!getGroqKey() && !getOpenRouterKey()) {
      setError('Add a Groq or OpenRouter key in Settings.');
      return;
    }

    // Pause mic while we answer so it does not hear TTS / re-capture
    stopListen();
    stopSpeak();
    speakQueue.current = Promise.resolve();
    setError('');
    setInput('');
    setAttachments([]);

    const user: Msg = {
      id: newId(),
      role: 'user',
      content: content || 'Please look at this attachment.',
      attachments: pendingAtt.length ? pendingAtt : undefined,
    };
    const next = [...messages, user];
    setMessages(next);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    busyRef.current = true;
    setBusy(true);

    const assistantId = newId();
    setMessages([...next, { id: assistantId, role: 'assistant', content: '' }]);

    const voice = voiceOnRef.current;

    try {
      const reply = await runTurn({
        page,
        history: next.map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        })),
        voice,
        searchOn: searchOnRef.current,
        ctx: { startFocus: focus },
        signal: ac.signal,
        onFirstToken: () => {
          busyRef.current = false;
          setBusy(false);
        },
        onToken: (full) => {
          setMessages((list) =>
            list.map((m) => (m.id === assistantId ? { ...m, content: full } : m)),
          );
        },
      });

      if (ac.signal.aborted) return;

      const finalText = (reply.content || '').trim() || 'Hey — what do you need?';
      setMessages((list) =>
        list.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: finalText,
                pending: reply.pending,
                sources: reply.sources,
              }
            : m,
        ),
      );

      if (voice && finalText) {
        const { ready, rest } = takeSentences(finalText + ' ');
        const chunks = [...ready];
        if (rest.trim()) chunks.push(rest.trim());
        if (!chunks.length) chunks.push(finalText);
        for (const s of chunks) {
          if (ac.signal.aborted) break;
          enqueueSpeak(s, ac.signal);
        }
        await speakQueue.current;
      }
    } catch (err) {
      if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      // Keep a visible assistant line so voice mode is not a blank bubble
      setMessages((list) =>
        list.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `Sorry — ${msg}` }
            : m,
        ),
      );
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
      speakingRef.current = false;
      setSpeaking(false);
      // Resume listening after the turn
      if (voiceOnRef.current) {
        window.setTimeout(() => {
          if (voiceOnRef.current && !busyRef.current) startListen();
        }, 350);
      }
    }
  };

  const confirmWrite = async (index: number, accept: boolean) => {
    const msg = messages[index];
    if (!msg?.pending || msg.pending.done) return;
    if (!accept) {
      setMessages((list) =>
        list.map((m, i) =>
          i === index ? { ...m, pending: undefined, content: `${m.content}\n\nCancelled.` } : m,
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await dispatchTool(msg.pending.name, msg.pending.args, { startFocus: focus });
      setMessages((list) =>
        list.map((m, i) => (i === index ? { ...m, pending: { ...m.pending!, done: true } } : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const revertWrite = async (index: number) => {
    const msg = messages[index];
    if (!msg?.pending?.done) return;
    setBusy(true);
    try {
      const result = await undoLastWrite();
      if (!result.ok) {
        setError(result.error || 'Nothing to undo.');
        return;
      }
      setMessages((list) =>
        list.map((m, i) =>
          i === index
            ? {
                ...m,
                pending: undefined,
                content: `${m.content}\n\nUndid: ${result.summary ?? 'last change'}.`,
              }
            : m,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo that.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSearch = () => {
    const n = !searchOn;
    setSearchOn(n);
    saveSearchEnabled(n);
  };

  const voiceMode: ArrodesVoiceMode = speaking
    ? 'speaking'
    : busy
      ? 'thinking'
      : listening
        ? 'listening'
        : 'idle';

  return {
    messages,
    input,
    setInput,
    busy,
    error,
    searchOn,
    toggleSearch,
    attachments,
    setAttachments,
    voiceOn,
    voiceLeaving,
    listening,
    speaking,
    interim,
    voiceMode,
    hasDraft: Boolean(input.trim() || attachments.length),
    voiceTitle: voiceOn
      ? 'Voice on — tap to stop. Tap while speaking to interrupt.'
      : 'Start voice',
    thinkWord,
    send,
    confirmWrite,
    revertWrite,
    toggleVoice,
    pickFiles,
    stopGenerate: interrupt,
  };
}

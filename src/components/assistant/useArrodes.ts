import { useEffect, useRef, useState } from 'react';
import type { PageId } from '@/components/AppLayout';
import type { ArrodesVoiceMode } from '@/components/ArrodesVoiceMirror';
import { loadHistory, saveHistory, loadSearchEnabled, saveSearchEnabled } from '@/lib/assistant/session';
import { createRecognizer, speechRecognitionCtor } from '@/lib/assistant/voice';
import { streamChat, type ChatMessage } from '@/lib/arrodes/client';
import { systemPrompt } from '@/lib/arrodes/prompt';
import { speak, stopSpeak, takeSentences } from '@/lib/arrodes/speak';
import { getGroqKey, getOpenRouterKey } from '@/lib/apiKeys';
import { THINK_WORDS, newId, type Msg } from '@/components/assistant/arrodesBits';

/** Clean Arrodes engine — one stream path, no multi-layer router. */
export function useArrodes(page: PageId, _navigate?: (p: PageId) => void) {
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory<Msg>([]));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchOn, setSearchOn] = useState(() => loadSearchEnabled());
  const [attachments, setAttachments] = useState<Msg['attachments']>([] as never[] | undefined);
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
        if (voiceOnRef.current && !busyRef.current && !speakingRef.current) {
          try {
            rec?.start();
          } catch {
            /* */
          }
        }
      },
      onError: (msg) => setError(msg),
      onInterim: (t) => setInterim(t),
      onFinal: (t) => {
        setInterim('');
        if (t.trim()) void send(t);
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
    startListen();
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busyRef.current) return;
    if (!getGroqKey() && !getOpenRouterKey()) {
      setError('Add a Groq or OpenRouter key in Settings.');
      return;
    }

    stopSpeak();
    speakQueue.current = Promise.resolve();
    setError('');
    setInput('');

    const user: Msg = { id: newId(), role: 'user', content };
    const next = [...messages, user];
    setMessages(next);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    busyRef.current = true;
    setBusy(true);

    const assistantId = newId();
    setMessages([...next, { id: assistantId, role: 'assistant', content: '' }]);

    const history: ChatMessage[] = [
      { role: 'system', content: systemPrompt(page, voiceOnRef.current) },
      ...next.slice(-8).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    let spokenRest = '';
    const voice = voiceOnRef.current;

    try {
      const reply = await streamChat(history, {
        signal: ac.signal,
        maxTokens: voice ? 120 : 400,
        temperature: voice ? 0.45 : 0.5,
        onFirstToken: () => {
          busyRef.current = false;
          setBusy(false);
        },
        onToken: (full) => {
          setMessages((list) =>
            list.map((m) => (m.id === assistantId ? { ...m, content: full } : m)),
          );
          if (voice) {
            const { ready, rest } = takeSentences(spokenRest + full.slice(spokenRest.length > 0 ? 0 : 0));
            // Better: track only new text from last spoken offset
          }
        },
      });

      if (ac.signal.aborted) return;

      const finalText = reply || 'Hey — what do you need?';
      setMessages((list) =>
        list.map((m) => (m.id === assistantId ? { ...m, content: finalText } : m)),
      );

      if (voice && finalText) {
        // Speak full reply in sentence chunks
        const { ready, rest } = takeSentences(finalText + ' ');
        const chunks = ready.length ? ready : [finalText];
        if (rest.trim()) chunks.push(rest.trim());
        for (const s of chunks) {
          if (ac.signal.aborted) break;
          enqueueSpeak(s, ac.signal);
        }
        await speakQueue.current;
      }
    } catch (err) {
      if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setMessages((list) => list.filter((m) => m.id !== assistantId || m.content));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Fix sentence streaming during token updates — keep it simple: speak after full reply for reliability
  // (early TTS can return in a follow-up if needed)

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
    attachments: attachments ?? [],
    setAttachments: setAttachments as (v: never[]) => void,
    voiceOn,
    voiceLeaving,
    listening,
    speaking,
    interim,
    voiceMode,
    hasDraft: Boolean(input.trim()),
    voiceTitle: voiceOn
      ? 'Voice on — tap to stop. Tap while speaking to interrupt.'
      : 'Start voice',
    thinkWord,
    send,
    confirmWrite: async () => {},
    revertWrite: async () => {},
    toggleVoice,
    pickFiles: async () => {},
    stopGenerate: interrupt,
  };
}

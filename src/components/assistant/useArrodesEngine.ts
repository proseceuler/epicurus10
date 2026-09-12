import { useEffect, useRef, useState } from 'react';
import { getOpenRouterKey } from '@/lib/apiKeys';
import type { PageId } from '@/components/AppLayout';
import { loadHistory, saveHistory, loadSearchEnabled, saveSearchEnabled } from '@/lib/assistant/session';
import { fileToAttachment, isAudioFile, type ChatAttachment } from '@/lib/assistant/media';
import { createRecognizer, speechRecognitionCtor } from '@/lib/assistant/voice';
import { groqConfigured, startVoiceLoop, speakReply, stopReply, transcribeAudio, type VoiceLoop } from '@/lib/assistant/voiceCascade';
import { runAssistantTurn } from '@/lib/assistant/router';
import { harvestMemory } from '@/lib/assistant/memory';
import { dispatchTool } from '@/lib/assistant/registry';
import { undoLastWrite } from '@/lib/assistant/undo';
import { usePomodoro } from '@/context/PomodoroContext';
import type { SubjectKey } from '@/lib/types';
import type { ArrodesVoiceMode } from '@/components/ArrodesVoiceMirror';
import { attachmentPromptFallback, dataUrlToBlob, newId, type Msg } from '@/components/assistant/arrodesBits';

export function useArrodesEngine(page: PageId, navigate?: (p: PageId) => void) {
  const pomodoro = usePomodoro();
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory<Msg>([]));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchOn, setSearchOn] = useState(() => loadSearchEnabled());
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceLeaving, setVoiceLeaving] = useState(false);
  const voiceLeaveTimer = useRef(0);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const voiceOnRef = useRef(false);
  const loopRef = useRef<VoiceLoop | null>(null);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    const slim = messages.map((m, i) => {
      if (i >= messages.length - 6) return m;
      if (!m.attachments?.length) return m;
      return { ...m, attachments: m.attachments.map((a) => ({ ...a, dataUrl: a.kind === 'image' ? '' : a.dataUrl.slice(0, 32), posterUrl: undefined })) };
    });
    saveHistory(slim);
  }, [messages]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => () => { loopRef.current?.stop(); stopReply(); window.clearTimeout(voiceLeaveTimer.current); }, []);

  const focus = (subject: string | null) => {
    pomodoro.setSessionContext((subject as SubjectKey) ?? null, null);
    pomodoro.switchType('focus');
    pomodoro.start();
    navigate?.('pomodoro');
  };

  const speak = async (text: string) => {
    if (!voiceOnRef.current) return;
    speakingRef.current = true;
    setSpeaking(true);
    await speakReply(text, {
      onStart: () => { speakingRef.current = true; setSpeaking(true); },
      onEnd: () => { speakingRef.current = false; setSpeaking(false); },
    });
    speakingRef.current = false;
    setSpeaking(false);
  };

  const startListen = (continuous: boolean) => {
    recognitionRef.current?.abort?.();
    const rec = createRecognizer({
      continuous,
      onStart: () => setListening(true),
      onEnd: () => {
        setListening(false);
        if (voiceOnRef.current && continuous && !busyRef.current && !speakingRef.current) {
          try { rec?.start(); } catch { /* ignore */ }
        }
      },
      onError: (msg) => setError(msg),
      onInterim: (text) => setInterim(text),
      onFinal: (text) => {
        setInterim('');
        if (text.trim()) void send(text);
      },
    });
    if (!rec) { setError('Voice input is not available in this browser.'); return; }
    recognitionRef.current = rec;
    try { rec.start(); } catch { setError('Could not start the microphone.'); }
  };

  const stopListen = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
    setInterim('');
  };

  const startCascade = () => {
    loopRef.current?.stop();
    loopRef.current = startVoiceLoop({
      onListening: setListening,
      onCaption: setInterim,
      onTranscript: (text) => send(text),
      onError: setError,
      shouldContinue: () => voiceOnRef.current && !busyRef.current && !speakingRef.current,
    });
  };

  const toggleVoice = () => {
    if (voiceOn && (speakingRef.current || speaking)) {
      stopReply();
      speakingRef.current = false;
      setSpeaking(false);
      setInterim('Interrupted — still listening');
      return;
    }
    if (voiceOn) {
      voiceOnRef.current = false;
      loopRef.current?.stop();
      loopRef.current = null;
      stopListen();
      stopReply();
      setSpeaking(false);
      setInterim('');
      setVoiceLeaving(true);
      setVoiceOn(false);
      window.clearTimeout(voiceLeaveTimer.current);
      voiceLeaveTimer.current = window.setTimeout(() => setVoiceLeaving(false), 1120);
      return;
    }
    if (!groqConfigured() && !speechRecognitionCtor()) {
      setError('Add a Groq API key in Settings → Voice to start voice mode.');
      navigate?.('settings');
      return;
    }
    window.clearTimeout(voiceLeaveTimer.current);
    setVoiceLeaving(false);
    setVoiceOn(true);
    voiceOnRef.current = true;
    setError('');
    if (groqConfigured()) startCascade();
    else startListen(true);
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      try { next.push(await fileToAttachment(file)); }
      catch { setError('Could not attach that file.'); }
    }
    setAttachments((cur) => [...cur, ...next].slice(0, 6));
  };

  const send = async (text?: string) => {
    let content = (text ?? input).trim();
    const audioAtt = attachments.filter((a) => a.kind === 'audio' || isAudioFile(a));
    const pendingAtt = attachments.filter((a) => a.kind !== 'audio' && !isAudioFile(a));
    if (audioAtt.length) {
      if (!groqConfigured()) {
        setError('Audio files need a Groq key in Settings → Voice.');
        navigate?.('settings');
        return;
      }
      setInterim('Transcribing…');
      const spoken: string[] = [];
      for (const att of audioAtt) {
        if (!att.dataUrl) continue;
        const result = await transcribeAudio(dataUrlToBlob(att.dataUrl));
        if (result.text) spoken.push(result.text);
        else if (result.error) setError(result.error);
      }
      setInterim('');
      if (spoken.length) content = [content, `Transcript: ${spoken.join(' ')}`].filter(Boolean).join('\n').trim();
      else if (!content && !pendingAtt.length) {
        setError('Could not transcribe that audio. Use the waveform button to talk live.');
        return;
      }
    }
    if ((!content && !pendingAtt.length) || busyRef.current) return;
    const key = getOpenRouterKey();
    if (!key) { setError('Add an OpenRouter key in Settings first.'); return; }
    stopReply();
    setError(''); setInput('');
    const user: Msg = {
      id: newId(),
      role: 'user',
      content: content || attachmentPromptFallback(pendingAtt),
      attachments: pendingAtt.length ? pendingAtt : undefined,
    };
    setAttachments([]);
    const next = [...messages, user];
    setMessages(next);
    busyRef.current = true;
    setBusy(true);
    try {
      const reply = await runAssistantTurn({
        key, page, history: next, searchEnabled: searchOn, voice: voiceOnRef.current,
        ctx: { startFocus: focus },
      });
      const assistant: Msg = { id: newId(), role: 'assistant', content: reply.content, pending: reply.pending, sources: reply.sources };
      harvestMemory(user.content, reply.content);
      setMessages([...next, assistant]);
      if (voiceOnRef.current && reply.content) await speak(reply.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const confirmWrite = async (index: number, accept: boolean) => {
    const msg = messages[index];
    if (!msg?.pending || msg.pending.done) return;
    if (!accept) {
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, pending: undefined, content: `${m.content}\n\nCancelled.` } : m)));
      return;
    }
    setBusy(true);
    try {
      await dispatchTool(msg.pending.name, msg.pending.args, { startFocus: focus });
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, pending: { ...m.pending!, done: true } } : m)));
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
      if (!result.ok) { setError(result.error || 'Nothing to undo.'); return; }
      setMessages((list) => list.map((m, i) => (
        i === index ? { ...m, pending: undefined, content: `${m.content}\n\nUndid: ${result.summary ?? 'last change'}.` } : m
      )));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo that.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSearch = () => {
    const next = !searchOn;
    setSearchOn(next);
    saveSearchEnabled(next);
  };

  const voiceMode: ArrodesVoiceMode = speaking ? 'speaking' : busy ? 'thinking' : listening ? 'listening' : 'idle';
  const hasDraft = Boolean(input.trim() || attachments.length);
  const voiceTitle = voiceOn
    ? 'Voice is on — tap to stop. Tap while speaking to interrupt.'
    : 'Start Voice. Stays on until you turn it off.';

  return {
    messages, input, setInput, busy, error, searchOn, toggleSearch, attachments, setAttachments,
    voiceOn, voiceLeaving, listening, speaking, interim, voiceMode, hasDraft, voiceTitle,
    send, confirmWrite, revertWrite, toggleVoice, pickFiles,
  };
}

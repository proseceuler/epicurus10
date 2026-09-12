import { useEffect, useRef, useState } from 'react';
import { X, Send, Check, Ban, Mic, AudioLines, ExternalLink, Undo2, Paperclip, Globe } from 'lucide-react';
import { getOpenRouterKey } from '@/lib/apiKeys';
import Markdown from '@/components/Markdown';
import type { PageId } from '@/components/AppLayout';
import { loadHistory, saveHistory, loadSearchEnabled, saveSearchEnabled } from '@/lib/assistant/session';
import { fileToAttachment, isAudioFile, type ChatAttachment } from '@/lib/assistant/media';
import { createRecognizer, speechRecognitionCtor } from '@/lib/assistant/voice';
import { groqConfigured, startVoiceLoop, speakReply, stopReply, transcribeAudio, type VoiceLoop } from '@/lib/assistant/voiceCascade';
import { runAssistantTurn, type ChatTurn, type PendingWrite } from '@/lib/assistant/router';
import { harvestMemory } from '@/lib/assistant/memory';
import { dispatchTool, writeSummary, PAGE_FOR_WRITE } from '@/lib/assistant/registry';
import { undoLastWrite } from '@/lib/assistant/undo';
import { usePomodoro } from '@/context/PomodoroContext';
import type { SubjectKey } from '@/lib/types';
import ArrodesVoiceMirror, { type ArrodesVoiceMode } from '@/components/ArrodesVoiceMirror';

const SUGGESTS = [
  { label: 'Summarize this page', text: 'Summarize what I should focus on on this page.' },
  { label: "What's due this week?", text: "What's due this week on my tasks and calendar?" },
  { label: 'Add a task', text: 'Help me add a task for tomorrow.' },
];

interface Msg extends ChatTurn {
  id?: string;
  pending?: PendingWrite;
  sources?: { title: string; url: string }[];
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function GlobalAssistant({
  open, rail, page, width, onWidth, onClose, onRail, navigate,
}: {
  open: boolean; rail: boolean; page: PageId; width: number;
  onWidth: (n: number) => void; onClose: () => void; onRail: () => void;
  navigate?: (p: PageId) => void;
}) {
  const pomodoro = usePomodoro();
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory<Msg>([]));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchOn, setSearchOn] = useState(() => loadSearchEnabled());
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceLeaving, setVoiceLeaving] = useState(false);
  const voiceLeaveTimer = useRef<number>(0);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
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
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollPos.current; }, [open, page]);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [messages, busy, open, interim]);

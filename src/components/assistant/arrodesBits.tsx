import type { ChatAttachment } from '@/lib/assistant/media';
import type { ChatTurn, PendingWrite } from '@/lib/assistant/router';

export const SUGGESTS = [
  { label: 'Summarize this page', text: 'Summarize what I should focus on on this page.' },
  { label: "What's due this week?", text: "What's due this week on my tasks and calendar?" },
  { label: 'Add a task', text: 'Help me add a task for tomorrow.' },
];

export interface Msg extends ChatTurn {
  id?: string;
  pending?: PendingWrite;
  sources?: { title: string; url: string }[];
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function dataUrlToBlob(dataUrl: string) {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'audio/webm';
  const bin = atob(body || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function attachmentPromptFallback(attachments: ChatAttachment[]) {
  if (!attachments.length) return 'Please look at this attachment.';
  return `Please look at this ${attachments.map((a) => a.kind).join(', ')}.`;
}

export function MirrorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="6.5" y="2.5" width="11" height="16" rx="5.5" />
      <path d="M9 21h6" />
      <path d="M12 18.5V21" />
    </svg>
  );
}

export function AttachmentChip({ att, inverted }: { att: ChatAttachment; inverted?: boolean }) {
  return (
    <span className={`inline-flex max-w-[140px] truncate rounded-full px-2 py-1 text-[11px] ${inverted ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
      {att.kind} / {att.name}
    </span>
  );
}

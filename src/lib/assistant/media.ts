export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface ChatAttachment {
  id: string;
  kind: MediaKind;
  name: string;
  mime: string;
  dataUrl: string;
  posterUrl?: string;
  durationSec?: number;
}

function uid() {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function videoPoster(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    const done = (poster?: string) => {
      URL.revokeObjectURL(url);
      resolve(poster);
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.4, (video.duration || 1) / 4);
      } catch {
        done(undefined);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(960, video.videoWidth || 640);
        canvas.height = Math.min(540, video.videoHeight || 360);
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(undefined);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        done(undefined);
      }
    };
    video.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 2500);
  });
}

export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const mime = file.type || 'application/octet-stream';
  const kind: MediaKind = mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
        ? 'audio'
        : 'file';
  const dataUrl = await readAsDataUrl(file);
  const att: ChatAttachment = { id: uid(), kind, name: file.name, mime, dataUrl };
  if (kind === 'video') att.posterUrl = await videoPoster(file);
  return att;
}

export function visionParts(attachments: ChatAttachment[]) {
  const parts: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
  for (const att of attachments) {
    if (att.kind === 'image') parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
    else if (att.kind === 'video' && att.posterUrl) parts.push({ type: 'image_url', image_url: { url: att.posterUrl } });
  }
  return parts;
}

export function attachmentPrompt(attachments: ChatAttachment[]) {
  if (!attachments.length) return '';
  return attachments.map((a) => {
    if (a.kind === 'image') return `[Attached image: ${a.name}]`;
    if (a.kind === 'video') return `[Attached video still from ${a.name}]`;
    if (a.kind === 'audio') return `[Attached audio: ${a.name}${a.durationSec ? `, ${Math.round(a.durationSec)}s` : ''}]`;
    return `[Attached file: ${a.name}]`;
  }).join('\n');
}

export function createRecorder(onChunk?: (blob: Blob) => void) {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  const chunks: Blob[] = [];

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.length = 0;
      recorder.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          onChunk?.(e.data);
        }
      };
      recorder.start();
    },
    async stop(): Promise<ChatAttachment | null> {
      return new Promise((resolve) => {
        if (!recorder) return resolve(null);
        recorder.onstop = async () => {
          stream?.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
          resolve(await fileToAttachment(file));
        };
        try { recorder.stop(); } catch { resolve(null); }
      });
    },
    cancel() {
      try { recorder?.stop(); } catch { /* ignore */ }
      stream?.getTracks().forEach((t) => t.stop());
      recorder = null;
      stream = null;
    },
  };
}

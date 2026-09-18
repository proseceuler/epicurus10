# Voice latency improvements

## What caused latency
1. **VAD end-of-speech waited ~2000ms** of silence before submitting audio.
2. **Batch STT** used `whisper-large-v3` with no abort and full-blob wait.
3. **LLM was non-streaming** — TTS waited for the entire assistant reply.
4. **TTS was sequential** — synthesize chunk N, play, then start chunk N+1 (network gap between sentences).
5. **No barge-in** while speaking except a UI button tap; mic loop paused during speak/think.
6. **AbortController** was not wired through OpenRouter `complete()`.

## New pipeline
User speaks → VAD (~750ms silence, configurable) → Groq Whisper (`whisper-large-v3-turbo` by default) → OpenRouter stream (voice) → sentence boundaries → Kokoro/Fish TTS with prefetch of next chunk → continuous playback.

Barge-in: while speaking, RMS on the live mic triggers stop TTS + abort LLM → listening again.

## Config (localStorage or Vite env)
- `epicure-voice-silence-ms` / `VITE_VOICE_SILENCE_MS` — default 750 (range 400–2500)
- `epicure-whisper-model` / `VITE_WHISPER_MODEL` — `whisper-large-v3-turbo` | `whisper-large-v3` | `distil-whisper-large-v3-en`

## Files changed
- `src/lib/assistant/voiceCascade.ts`
- `src/lib/assistant/tts.ts`
- `src/lib/assistant/router.ts`
- `src/components/assistant/useArrodesEngine.ts`

## Limitations
- Groq Whisper is still batch (no true streaming STT on this API).
- Tool-heavy turns stay non-streaming for reliable tool_calls; simple voice chat streams.
- Kokoro via OpenRouter is still request/response per sentence (prefetch hides gap).
- Barge-in uses energy VAD, not a separate wake model — noisy rooms may false-trigger; raise gate if needed.

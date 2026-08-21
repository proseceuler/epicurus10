import { useEffect, useRef, useState } from 'react';
import { MODEL_KEY, getDefaultModel, getOpenRouterKey, getTavilyKey, saveKey } from '@/lib/apiKeys';
import Markdown from '@/components/Markdown';
import { DATA_TOOLS, SEARCH_TOOL, runTool, type ToolDef } from '@/lib/aiTools';
import type { SearchResponse } from '@/lib/webSearch';
import { usePomodoro } from '@/context/PomodoroContext';
import type { SubjectKey } from '@/lib/types';
import { Bot, Key, Globe, ExternalLink, Check, Wrench, Sun, Moon } from 'lucide-react';
import {
  MODES, FREE_MODELS, TOOL_PROMPT, SEARCH_PROMPT, SEARCH_MODES,
  type ModeId, type SubModeId,
} from '@/components/assistant/constants';
import DynamicHeadline from '@/components/assistant/DynamicHeadline';
import ModeSelector from '@/components/assistant/ModeSelector';
import ChatInputBar from '@/components/assistant/ChatInputBar';

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  image?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  actions?: { name: string; ok: boolean }[];
  searches?: SearchResponse[];
}

const HISTORY_KEY = 'epicure-ai-history';

export default function StudyAssistantPage() {
  const pomodoro = usePomodoro();
  const [mode, setMode] = useState<ModeId>('study');
  const [subMode, setSubMode] = useState<SubModeId>('qa');
  const [histories, setHistories] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [model, setModel] = useState(() => {
    const stored = getDefaultModel();
    return FREE_MODELS.some((m) => m.value === stored) ? stored : FREE_MODELS[0].value;
  });
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState('');
  const [error, setError] = useState('');
  const [webSearchOn, setWebSearchOn] = useState(true);
  const [dark, setDark] = useState(() => localStorage.getItem('epicure-assistant-theme') !== 'light');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(Boolean(SR));
  }, []);

  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('Voice input is not supported in this browser.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    let base = '';
    recognition.onstart = () => {
      base = input ? input.trimEnd() + ' ' : '';
      setError('');
      setListening(true);
    };
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setInput(base + transcript);
    };
    recognition.onerror = (event: any) => {
      setError(
        event.error === 'not-allowed'
          ? 'Microphone access was blocked. Allow it in your browser settings.'
          : 'Voice input stopped unexpectedly.',
      );
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const [apiKey, setApiKey] = useState(() => getOpenRouterKey());
  const [tavilyKey, setTavilyKey] = useState(() => getTavilyKey());

  useEffect(() => {
    const sync = () => {
      setApiKey(getOpenRouterKey());
      setTavilyKey(getTavilyKey());
    };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const activeMode = MODES.find((m) => m.id === mode)!;
  const messages = histories[mode] ?? [];
  const visibleMessages = messages.filter((m) => m.role !== 'tool');
  const visionModel = FREE_MODELS.find((m) => m.value === model)?.vision ?? false;
  const searchAllowed = SEARCH_MODES.includes(mode);
  const searchActive = searchAllowed && webSearchOn && Boolean(tavilyKey);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(histories));
  }, [histories]);

  useEffect(() => {
    saveKey(MODEL_KEY, model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem('epicure-assistant-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!visionModel) setImage(null);
  }, [visionModel]);

  const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) =>
    setHistories((prev) => ({ ...prev, [mode]: updater(prev[mode] ?? []) }));

  const pickImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setToolStatus('');
  };

  const toApiMessage = (m: ChatMessage): Record<string, unknown> => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, name: m.name, content: m.content };
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls };
    }
    if (m.image) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content || 'Describe and help with this image.' },
          { type: 'image_url', image_url: { url: m.image } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  };

  const handleMode = (m: ModeId) => {
    setMode(m);
    const def = MODES.find((x) => x.id === m)!;
    setInput(def.starter);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !image) || streaming) return;
    if (!apiKey) {
      setError('Add your OpenRouter API key in Settings first.');
      return;
    }
    setError('');

    const userMessage: ChatMessage = { role: 'user', content: text, ...(image ? { image } : {}) };
    let history: ChatMessage[] = [...messages, userMessage];
    setMessages(() => [...history, { role: 'assistant', content: '' }]);
    setInput('');
    setImage(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const tools: ToolDef[] = [...DATA_TOOLS, ...(searchActive ? [SEARCH_TOOL] : [])];
    const subModeSystem = activeMode.subModes && subMode ? activeMode.subModes.find((s) => s.id === subMode)?.system ?? '' : '';
    const system =
      activeMode.system +
      (subModeSystem ? '\n\n' + subModeSystem : '') +
      TOOL_PROMPT +
      (searchActive ? SEARCH_PROMPT : '') +
      `\n\nToday's date is ${new Date().toLocaleDateString('en-CA')}.`;

    try {
      for (let round = 0; round < 5; round++) {
        const payload = {
          model,
          stream: true,
          tools,
          tool_choice: 'auto',
          messages: [{ role: 'system', content: system }, ...history.map(toApiMessage)],
        };

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => '');
          throw new Error(detail?.slice(0, 300) || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = '';
        const calls: ToolCall[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta;
              if (delta?.content) {
                content += delta.content;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { ...next[next.length - 1], role: 'assistant', content };
                  return next;
                });
              }
              for (const tc of delta?.tool_calls ?? []) {
                const idx = tc.index ?? 0;
                calls[idx] ??= { id: tc.id ?? `call_${idx}`, type: 'function', function: { name: '', arguments: '' } };
                if (tc.id) calls[idx].id = tc.id;
                if (tc.function?.name) calls[idx].function.name += tc.function.name;
                if (tc.function?.arguments) calls[idx].function.arguments += tc.function.arguments;
              }
            } catch {
              /* ignore malformed keep-alive chunks */
            }
          }
        }

        const pending = calls.filter(Boolean);
        if (!pending.length) {
          history = [...history, { role: 'assistant', content }];
          setMessages(() => history);
          break;
        }

        const assistantMsg: ChatMessage = { role: 'assistant', content, tool_calls: pending };
        const toolMsgs: ChatMessage[] = [];
        const actions: { name: string; ok: boolean }[] = [];
        const searches: SearchResponse[] = [];

        for (const call of pending) {
          setToolStatus(call.function.name.replace(/_/g, ' '));
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = {};
          }
          const result = await runTool(call.function.name, args, {
            startFocus: (subject) => {
              pomodoro.setSessionContext((subject as SubjectKey) ?? null, null);
              pomodoro.switchType('focus');
              pomodoro.start();
              pomodoro.setDockOpen(true);
            },
            onSearch: (r) => searches.push(r),
          });
          const ok = !(result && typeof result === 'object' && (result as any).ok === false);
          actions.push({ name: call.function.name, ok });
          toolMsgs.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(result).slice(0, 8000),
          });
        }
        setToolStatus('');

        assistantMsg.actions = actions;
        if (searches.length) assistantMsg.searches = searches;
        history = [...history, assistantMsg, ...toolMsgs];
        setMessages(() => [...history, { role: 'assistant', content: '' }]);
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError') {
        setError(err.message || 'Something went wrong talking to OpenRouter.');
        setMessages((prev) => {
          const next = [...prev];
          if (!next[next.length - 1]?.content && !next[next.length - 1]?.tool_calls) next.pop();
          return next;
        });
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setToolStatus('');
    }
  };

  const themeClass = dark ? 'sa-dark' : 'sa-light';
  const searchLabel = searchActive ? 'Web search on' : tavilyKey ? 'Web search off' : 'Web search — no key';

  return (
    <div className={`${themeClass} min-h-[calc(100vh-2rem)] rounded-2xl flex flex-col`}>
      {/* Theme toggle */}
      <div className="flex justify-end p-3">
        <button
          onClick={() => setDark((v) => !v)}
          className="sa-icon-btn w-8 h-8 flex items-center justify-center"
          title="Toggle theme"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {!apiKey && (
        <div className="mx-4 mb-2 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--sa-surface)] border border-[var(--sa-border)]">
          <Key className="w-4 h-4 text-[var(--sa-text-dim)] mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--sa-text-muted)]">
            No OpenRouter API key found. Open <span className="font-medium text-[var(--sa-text)]">Settings</span> and paste your key to start chatting. All models listed here are free tiers.
          </p>
        </div>
      )}

      {visibleMessages.length === 0 ? (
        /* ===== Idle / empty state ===== */
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
          {/* Centered icon */}
          <div className="w-14 h-14 rounded-2xl bg-[var(--sa-surface)] border border-[var(--sa-border)] flex items-center justify-center mb-6">
            <Bot className="w-7 h-7 text-[var(--sa-text)]" />
          </div>

          {/* Dynamic headline */}
          <DynamicHeadline mode={mode} />

          {/* Input bar */}
          <div className="mt-8 w-full max-w-4xl mx-auto flex flex-col items-center gap-5">
            <ChatInputBar
              input={input}
              onInput={setInput}
              onSend={send}
              onStop={stop}
              streaming={streaming}
              models={FREE_MODELS}
              model={model}
              onModelChange={setModel}
              visionModel={visionModel}
              speechSupported={speechSupported}
              listening={listening}
              onToggleListening={toggleListening}
              onPickImage={pickImage}
              image={image}
              onClearImage={() => setImage(null)}
              placeholder="How can I help you today?"
              searchActive={searchActive}
              searchAllowed={searchAllowed}
              searchLabel={searchLabel}
              onToggleSearch={() => setWebSearchOn((v) => !v)}
            />

            {/* Mode pills */}
            <ModeSelector
              mode={mode}
              subMode={subMode}
              onMode={handleMode}
              onSubMode={setSubMode}
              onSuggestion={(text) => setInput(text)}
            />
          </div>

          {error && <p className="mt-4 text-xs text-rose-500">{error}</p>}
        </div>
      ) : (
        /* ===== Active conversation state ===== */
        <div className="flex-1 flex flex-col px-4 pb-4 min-h-0" style={{ marginBottom: '5rem' }}>
          <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0">
          {/* Mode pills bar */}
          <div className="py-3 border-b border-[var(--sa-border)]">
            <ModeSelector
              mode={mode}
              subMode={subMode}
              onMode={(m) => setMode(m)}
              onSubMode={setSubMode}
              onSuggestion={(text) => setInput(text)}
            />
          </div>

          {/* Chat messages */}
          <div ref={scrollRef} className="sa-chat-scroll flex-1 overflow-y-auto py-4 space-y-4">
            {visibleMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'sa-chat-bubble-user whitespace-pre-wrap'
                      : 'sa-chat-bubble-assistant min-w-0'
                  }`}
                >
                  {m.image && (
                    <img src={m.image} alt="Uploaded attachment" className="rounded-xl mb-2 max-h-56 object-contain" />
                  )}

                  {m.actions?.length ? (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {m.actions.map((a, ai) => (
                        <span
                          key={ai}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-[var(--sa-surface)] text-[var(--sa-text-muted)]"
                        >
                          {a.name === 'web_search' ? <Globe className="w-3 h-3" /> : a.ok ? <Check className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                          {a.name.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {m.searches?.map((s, si) => (
                    <div key={si} className="rounded-xl p-3 mb-2 space-y-2 bg-[var(--sa-surface)] border border-[var(--sa-border)]">
                      <p className="text-[11px] font-semibold text-[var(--sa-text-muted)] flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Sources for "{s.query}"
                      </p>
                      {s.error && <p className="text-[11px] text-rose-500">{s.error}</p>}
                      {s.results.map((r, ri) => (
                        <a
                          key={ri}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg px-2 py-1.5 hover:bg-[var(--sa-surface-hover)] transition-colors"
                        >
                          <p className="text-xs font-medium text-[var(--sa-text)] flex items-center gap-1">
                            {r.title}
                            <ExternalLink className="w-3 h-3 text-[var(--sa-text-dim)]" />
                          </p>
                          <p className="text-[11px] text-[var(--sa-text-dim)] line-clamp-2">{r.snippet}</p>
                        </a>
                      ))}
                    </div>
                  ))}

                  {m.role === 'assistant' ? (
                    m.content ? (
                      <Markdown content={m.content} />
                    ) : streaming && i === visibleMessages.length - 1 ? (
                      <span className="text-[var(--sa-text-dim)]">{toolStatus ? `Running ${toolStatus}…` : 'Thinking…'}</span>
                    ) : null
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="px-1 pb-2 text-xs text-rose-500">{error}</p>}

          {/* Composer */}
          <div className="pt-3 border-t border-[var(--sa-border)]">
            <ChatInputBar
              input={input}
              onInput={setInput}
              onSend={send}
              onStop={stop}
              streaming={streaming}
              models={FREE_MODELS}
              model={model}
              onModelChange={setModel}
              visionModel={visionModel}
              speechSupported={speechSupported}
              listening={listening}
              onToggleListening={toggleListening}
              onPickImage={pickImage}
              image={image}
              onClearImage={() => setImage(null)}
              placeholder={listening ? 'Listening… speak now' : `Ask ${activeMode.agentName}… (Enter to send, Shift+Enter for new line)`}
              searchActive={searchActive}
              searchAllowed={searchAllowed}
              searchLabel={searchLabel}
              onToggleSearch={() => setWebSearchOn((v) => !v)}
            />
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

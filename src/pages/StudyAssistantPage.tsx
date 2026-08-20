import { useEffect, useRef, useState } from 'react';
import { MODEL_KEY, getDefaultModel, getOpenRouterKey, getTavilyKey, saveKey } from '@/lib/apiKeys';
import { PageHeader, Card, Button } from '@/components/ui';
import Markdown from '@/components/Markdown';
import { DATA_TOOLS, SEARCH_TOOL, runTool, type ToolDef } from '@/lib/aiTools';
import type { SearchResponse } from '@/lib/webSearch';
import { usePomodoro } from '@/context/PomodoroContext';
import type { SubjectKey } from '@/lib/types';
import {
  Bot, Send, Square, Trash2, Image as ImageIcon, X, Code2,
  PenLine, Sigma, FileText, Layers, GraduationCap, Key, Mic, MicOff,
  Globe, Wrench, ExternalLink, Check,
} from 'lucide-react';

const FREE_MODELS = [
  { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B — strongest', vision: false },
  { value: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning — fastest', vision: false },
  { value: 'poolside/laguna-s-2.1:free', label: 'Laguna S 2.1 — great for code', vision: false },
  { value: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B — vision', vision: true },
  { value: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron Nano Omni — multimodal reasoning', vision: true },
];

type ModeId = 'study' | 'coding' | 'writing' | 'math' | 'summarize' | 'flashcards';

const TOOL_PROMPT =
  '\n\nYou are connected to the student\'s own epicure app and can use tools to read and change their data (tasks, notes, calendar, flashcards, grades, habits, focus timer, baon/expenses). Prefer reading real data with the get_* tools before answering questions about "my" tasks, grades, schedule or spending. When the student asks you to add, log, schedule or start something, actually call the matching tool instead of only describing it, then confirm what you did in one short line. Dates must be YYYY-MM-DD.';

const SEARCH_PROMPT =
  ' You also have web_search. Call it whenever the answer depends on current, factual or external information you are unsure about, then cite the sources you used by title.';

const MODES: {
  id: ModeId;
  label: string;
  icon: typeof Bot;
  hint: string;
  system: string;
  starter: string;
}[] = [
  {
    id: 'study',
    label: 'Study Assistant',
    icon: GraduationCap,
    hint: 'General academic help for Grade 10 subjects',
    system:
      'You are a patient Grade 10 study tutor. Explain concepts clearly with simple language, short paragraphs and concrete examples from the student\'s subjects (Math, Science, English, Filipino, Araling Panlipunan, MAPEH, TLE, ESP). Ask a short clarifying question when the request is vague. Use markdown-style headings and bullet lists. Never just give an answer to graded work without explaining the reasoning.',
    starter: 'Explain the law of conservation of energy with a real-life example.',
  },
  {
    id: 'coding',
    label: 'Coding Agent',
    icon: Code2,
    hint: 'Code, debugging, explanations and small projects',
    system:
      'You are a precise senior software engineer helping a Grade 10 student. Give working, runnable code in fenced code blocks with the language tag, then a short explanation of the key lines. When debugging, first state the likely cause, then the fix. Prefer small, readable solutions over clever ones. Mention edge cases briefly.',
    starter: 'Write a Python program that checks if a number is prime and explain it.',
  },
  {
    id: 'writing',
    label: 'Writing Helper',
    icon: PenLine,
    hint: 'Essays, paragraphs, grammar and better writing',
    system:
      'You are a supportive writing coach. Improve clarity, grammar, structure and tone while keeping the student\'s own voice. When rewriting, show the improved version first, then a short bullet list of what you changed and why. Never write an entire graded essay from scratch without offering an outline and guidance first.',
    starter: 'Improve this paragraph and tell me what you changed: ',
  },
  {
    id: 'math',
    label: 'Math Solver',
    icon: Sigma,
    hint: 'Step-by-step solutions and explanations',
    system:
      'You are a meticulous math tutor. Solve problems step by step, numbering every step and stating the rule or formula used. Show the final answer clearly on its own line as **Answer:** ... Then add one short "Why this works" note. Use plain-text math notation that is easy to read.',
    starter: 'Solve step by step: 2x² - 5x - 3 = 0',
  },
  {
    id: 'summarize',
    label: 'Summarizer',
    icon: FileText,
    hint: 'Condense notes, lessons or long text',
    system:
      'You are a summarizing expert for students. Produce: a one-sentence TL;DR, then 5-8 bullet key points, then a short "Terms to remember" list with quick definitions. Keep every bullet under 20 words. Preserve numbers, dates and names exactly.',
    starter: 'Summarize these notes:\n\n',
  },
  {
    id: 'flashcards',
    label: 'Flashcard Generator',
    icon: Layers,
    hint: 'Turn topics or notes into flashcards',
    system:
      'You generate study flashcards. Output ONLY a numbered list where each item is formatted exactly as:\nQ: <question>\nA: <answer>\nMake 10 cards unless the user asks for a different number. Questions must be short and specific; answers must be one or two sentences. No intro or closing text. If the student asks you to save them, call add_flashcard for each card instead.',
    starter: 'Make flashcards about the parts of the cell.',
  },
];

const SEARCH_MODES: ModeId[] = ['study', 'coding'];

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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    const system =
      activeMode.system +
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

  return (
    <div className="max-w-4xl mx-auto relative min-h-[calc(100vh-8rem)] flex flex-col">
      {/* Top bar: model + clear — only when chatting */}
      {visibleMessages.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-800 truncate">{activeMode.label}</p>
              <p className="text-[11px] text-zinc-500 truncate">{activeMode.hint}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="glass-input rounded-xl px-3 py-2 text-xs text-zinc-700 max-w-[200px]"
            >
              {FREE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {searchAllowed && (
              <button
                onClick={() => setWebSearchOn((v) => !v)}
                title={tavilyKey ? 'Toggle live web search' : 'Add a Tavily API key in Settings'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  searchActive ? 'bg-zinc-900 text-white' : 'glass glass-hover text-zinc-500'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                {searchActive ? 'Web' : 'Web off'}
              </button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setMessages(() => [])}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {!apiKey && (
        <Card className="p-4 mb-4 flex items-start gap-3 shrink-0">
          <Key className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
          <p className="text-sm text-zinc-600">
            No OpenRouter API key found. Open <span className="font-medium">Settings</span> and paste your key to start
            chatting. All models listed here are free tiers.
          </p>
        </Card>
      )}

      {/* ── Claude-style empty state ── */}
      {visibleMessages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center mb-5 shadow-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif text-zinc-800 tracking-tight mb-8 text-center">
            What shall we think through?
          </h1>

          {/* Main input card — Claude style */}
          <div className="w-full max-w-2xl glass glass-shadow-lg rounded-2xl p-1.5 mb-6">
            <div className="rounded-xl bg-white/40 px-4 pt-3 pb-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={3}
                placeholder={listening ? 'Listening… speak now' : 'How can I help you today?'}
                className="w-full bg-transparent text-sm text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none min-h-[72px]"
              />
              {image && (
                <div className="flex items-center gap-2 mb-2">
                  <img src={image} alt="Attachment preview" className="w-12 h-12 rounded-lg object-cover" />
                  <button onClick={() => setImage(null)} className="p-1 rounded-lg hover:bg-zinc-200/60">
                    <X className="w-4 h-4 text-zinc-500" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-200/50">
                <div className="flex items-center gap-1.5">
                  {/* Chat / mode indicator */}
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-100 text-zinc-600">
                    <Bot className="w-3 h-3" />
                    {activeMode.label}
                  </span>
                  {visionModel && (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) pickImage(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        onClick={() => fileRef.current?.click()}
                        title="Attach an image"
                        className="w-8 h-8 rounded-lg hover:bg-zinc-200/60 flex items-center justify-center"
                      >
                        <ImageIcon className="w-4 h-4 text-zinc-500" />
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="text-[11px] text-zinc-500 bg-transparent border-0 focus:outline-none max-w-[140px] cursor-pointer"
                  >
                    {FREE_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label.split('—')[0].trim()}
                      </option>
                    ))}
                  </select>
                  {speechSupported && (
                    <button
                      onClick={toggleListening}
                      title={listening ? 'Stop voice input' : 'Voice mode'}
                      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        listening ? 'bg-zinc-900 animate-pulse text-white' : 'hover:bg-zinc-200/60 text-zinc-500'
                      }`}
                    >
                      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  )}
                  {streaming ? (
                    <button
                      onClick={stop}
                      className="w-8 h-8 rounded-lg bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center"
                      title="Stop generating"
                    >
                      <Square className="w-3.5 h-3.5 text-zinc-700" />
                    </button>
                  ) : (
                    <button
                      onClick={send}
                      disabled={!input.trim() && !image}
                      className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center"
                      title="Send"
                    >
                      <Send className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Suggestion chips — Claude style */}
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setMode(m.id);
                    if (!input) setInput(m.starter);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                    active
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : 'glass glass-hover text-zinc-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label.replace(' Assistant', '').replace(' Agent', '').replace(' Coach', '').replace(' Helper', '')}
                </button>
              );
            })}
          </div>

          {error && <p className="mt-4 text-xs text-rose-600 text-center">{error}</p>}
        </div>
      ) : (
        /* ── Active chat view ── */
        <Card className="flex flex-col flex-1 min-h-[420px] overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {visibleMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-zinc-900 text-white whitespace-pre-wrap' : 'text-zinc-800 min-w-0'
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
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium ${
                            a.ok ? 'bg-zinc-200/70 text-zinc-600' : 'bg-rose-100 text-rose-600'
                          }`}
                        >
                          {a.name === 'web_search' ? <Globe className="w-3 h-3" /> : a.ok ? <Check className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                          {a.name.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {m.searches?.map((s, si) => (
                    <div key={si} className="glass rounded-xl p-3 mb-2 space-y-2">
                      <p className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Sources for “{s.query}”
                      </p>
                      {s.error && <p className="text-[11px] text-rose-600">{s.error}</p>}
                      {s.results.map((r, ri) => (
                        <a
                          key={ri}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg px-2 py-1.5 hover:bg-white/60 transition-colors"
                        >
                          <p className="text-xs font-medium text-zinc-800 flex items-center gap-1">
                            {r.title}
                            <ExternalLink className="w-3 h-3 text-zinc-400" />
                          </p>
                          <p className="text-[11px] text-zinc-500 line-clamp-2">{r.snippet}</p>
                        </a>
                      ))}
                    </div>
                  ))}

                  {m.role === 'assistant' ? (
                    m.content ? (
                      <Markdown content={m.content} />
                    ) : streaming && i === visibleMessages.length - 1 ? (
                      toolStatus ? `Running ${toolStatus}…` : 'Thinking…'
                    ) : null
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="px-4 pb-2 text-xs text-rose-600">{error}</p>}

          {image && (
            <div className="px-4 pb-2 flex items-center gap-2">
              <img src={image} alt="Attachment preview" className="w-12 h-12 rounded-lg object-cover" />
              <button onClick={() => setImage(null)} className="p-1 rounded-lg hover:bg-zinc-200/60">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
          )}

          {/* Mode chips row while chatting */}
          <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-white/40">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-200/50'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {m.label.replace(' Assistant', '').replace(' Agent', '').replace(' Coach', '').replace(' Helper', '')}
                </button>
              );
            })}
          </div>

          <div className="p-3 flex items-end gap-2">
            {visionModel && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) pickImage(file);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  title="Attach an image"
                  className="w-10 h-10 rounded-xl glass glass-hover flex items-center justify-center shrink-0"
                >
                  <ImageIcon className="w-4 h-4 text-zinc-600" />
                </button>
              </>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={listening ? 'Listening… speak now' : `Ask ${activeMode.label}… (Enter to send)`}
              className="glass-input flex-1 rounded-xl px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 resize-none"
            />
            {speechSupported && (
              <button
                onClick={toggleListening}
                title={listening ? 'Stop voice input' : 'Voice mode'}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                  listening ? 'bg-zinc-900 animate-pulse' : 'glass glass-hover'
                }`}
              >
                {listening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-zinc-600" />}
              </button>
            )}
            {streaming ? (
              <button
                onClick={stop}
                className="w-10 h-10 rounded-xl bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center shrink-0"
                title="Stop generating"
              >
                <Square className="w-4 h-4 text-zinc-700" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() && !image}
                className="w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center shrink-0"
                title="Send"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

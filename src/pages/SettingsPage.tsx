import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, PageHeader, Button, Input, Select } from '@/components/kit';
import {
  Key, Database, Download, Check, Cpu, Smartphone, Keyboard,
  CloudSun, Mic, BookOpen, Info, Sparkles, Eye, EyeOff,
} from 'lucide-react';
import {
  OPENROUTER_KEY, MW_KEY, MODEL_KEY, TAVILY_KEY, PINECONE_KEY, PINECONE_HOST,
  getOpenRouterKey, getMwKey, getTavilyKey, getPineconeKey, getPineconeHost,
  getDefaultModel, saveKey,
} from '@/lib/apiKeys';
import { ingestEpicure } from '@/lib/assistant/rag';
import { VoiceKeysCard } from '@/components/VoiceKeysCard';
import {
  getShortcuts, setShortcut, resetShortcuts, formatShortcut,
  SHORTCUT_LABELS, type ShortcutId, type ShortcutMap,
} from '@/lib/shortcuts';
import { getWeatherKey, setWeatherKey, getWeatherCity, setWeatherCity } from '@/lib/weather';
import { getReduceMotionPref, setReduceMotionPref, type ReduceMotionPref } from '@/lib/prefs';
import { clearMemory, loadMemory } from '@/lib/assistant/memory';
import { clearHistory } from '@/lib/assistant/session';

const AI_MODELS = [
  { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B', desc: 'Strongest reasoning (free)' },
  { value: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', desc: 'Fastest responses (free)' },
  { value: 'poolside/laguna-s-2.1:free', label: 'Laguna S 2.1', desc: 'Great for code (free)' },
  { value: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', desc: 'Vision-capable (free)' },
  { value: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron Nano Omni', desc: 'Multimodal reasoning (free)' },
];

type SectionId = 'general' | 'arrodes' | 'voice' | 'dictionary' | 'shortcuts' | 'data' | 'about';

const SECTIONS: { id: SectionId; label: string; icon: typeof Key }[] = [
  { id: 'general', label: 'General', icon: CloudSun },
  { id: 'arrodes', label: 'Arrodes', icon: Sparkles },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'dictionary', label: 'Dictionary', icon: BookOpen },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'about', label: 'About', icon: Info },
];

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
      ok ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
    }`}>
      {ok ? 'Connected' : 'Not set'}
    </span>
  );
}

function FieldLabel({ children, status }: { children: ReactNode; status?: boolean }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <label className="block text-sm font-medium text-zinc-600">{children}</label>
      {typeof status === 'boolean' && <StatusPill ok={status} />}
    </div>
  );
}

function SecretInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-700"
        aria-label={show ? 'Hide' : 'Show'}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, hint }: {
  title: string; icon?: typeof Key; children: ReactNode; hint?: string;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>('general');
  const [openRouterKey, setOpenRouterKey] = useState(() => getOpenRouterKey());
  const [mwKey, setMwKey] = useState(() => getMwKey());
  const [tavilyKey, setTavilyKey] = useState(() => getTavilyKey());
  const [pineconeKey, setPineconeKey] = useState(() => getPineconeKey());
  const [pineconeHost, setPineconeHost] = useState(() => getPineconeHost());
  const [indexMsg, setIndexMsg] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [defaultModel, setDefaultModel] = useState(() => getDefaultModel() || AI_MODELS[0].value);
  const [saved, setSaved] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => getShortcuts());
  const [listening, setListening] = useState<ShortcutId | null>(null);
  const [owKey, setOwKey] = useState(() => getWeatherKey());
  const [wCity, setWCity] = useState(() => getWeatherCity());
  const [motionPref, setMotionPref] = useState<ReduceMotionPref>(() => getReduceMotionPref());
  const [memCount, setMemCount] = useState(() => loadMemory().length);
  const [note, setNote] = useState('');

  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1400); };

  useEffect(() => {
    const sync = () => setShortcuts(getShortcuts());
    window.addEventListener('epicure-shortcuts-changed', sync);
    return () => window.removeEventListener('epicure-shortcuts-changed', sync);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;
      setShortcut(listening, { mod: e.metaKey || e.ctrlKey, shift: e.shiftKey, key: e.key.toLowerCase() });
      setListening(null);
      flash();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);

  const updateOpenRouter = (v: string) => { setOpenRouterKey(v); saveKey(OPENROUTER_KEY, v.trim()); flash(); };
  const updateMw = (v: string) => { setMwKey(v); saveKey(MW_KEY, v.trim()); flash(); };
  const updateTavily = (v: string) => { setTavilyKey(v); saveKey(TAVILY_KEY, v.trim()); flash(); };
  const updatePineconeKey = (v: string) => { setPineconeKey(v); saveKey(PINECONE_KEY, v.trim()); flash(); };
  const updatePineconeHost = (v: string) => { setPineconeHost(v); saveKey(PINECONE_HOST, v.trim()); flash(); };
  const updateModel = (v: string) => { setDefaultModel(v); saveKey(MODEL_KEY, v); flash(); };

  const reindex = async () => {
    setIndexing(true);
    setIndexMsg('');
    const result = await ingestEpicure();
    setIndexing(false);
    setIndexMsg(result.ok ? `Indexed ${result.upserted} chunks.` : (result.error || 'Index failed.'));
    flash();
  };

  const exportData = async () => {
    const tables = ['assessments', 'class_hub', 'class_hub_links', 'todos', 'kanban_tasks',
      'pomodoro_sessions', 'pomodoro_settings', 'habits', 'habit_completions',
      'finance_settings', 'finance_transactions', 'finance_goals', 'notes',
      'timetable_entries', 'class_attendance', 'flashcard_decks', 'flashcards',
      'todo_subtasks', 'forecast_scenarios', 'scratchpad', 'whiteboard'];
    const dump: Record<string, unknown> = {};
    for (const table of tables) {
      const { data } = await supabase.from(table).select('*');
      dump[table] = data;
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epicure-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash();
  };

  const statusStrip = useMemo(() => ([
    { label: 'OpenRouter', ok: Boolean(openRouterKey.trim()) },
    { label: 'Groq', ok: Boolean((typeof window !== 'undefined' && localStorage.getItem('epicure-groq-key')) || '') },
    { label: 'Tavily', ok: Boolean(tavilyKey.trim()) },
    { label: 'Pinecone', ok: Boolean(pineconeKey.trim()) },
    { label: 'Dictionary', ok: Boolean(mwKey.trim()) },
    { label: 'Weather', ok: Boolean(owKey.trim()) },
  ]), [openRouterKey, tavilyKey, pineconeKey, mwKey, owKey]);

  const content = (() => {
    switch (section) {
      case 'general':
        return (
          <div className="space-y-4">
            <InstallTip />
            <SectionCard title="Weather" icon={CloudSun} hint="Dashboard clock card. Free key at openweathermap.org.">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel status={Boolean(owKey.trim())}>API key</FieldLabel>
                  <SecretInput value={owKey} onChange={(v) => { setOwKey(v); setWeatherKey(v); flash(); }} placeholder="OpenWeatherMap API key" />
                </div>
                <div>
                  <FieldLabel>City</FieldLabel>
                  <Input value={wCity} onChange={(v) => { setWCity(v); setWeatherCity(v); flash(); }} placeholder="Manila" />
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Motion" icon={Sparkles} hint="Overrides system preference for animations and the edge accent.">
              <div className="flex flex-wrap gap-2">
                {([{
                  id: 'system' as const, label: 'Match system',
                }, {
                  id: 'on' as const, label: 'Reduce motion',
                }, {
                  id: 'off' as const, label: 'Full motion',
                }]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setMotionPref(opt.id); setReduceMotionPref(opt.id); flash(); }}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      motionPref === opt.id
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>
        );
      case 'arrodes':
        return (
          <div className="space-y-4">
            <Card className="p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Integrations</p>
              <div className="flex flex-wrap gap-2">
                {statusStrip.map((s) => (
                  <span key={s.label} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200/80">
                    {s.label}
                    <StatusPill ok={s.ok} />
                  </span>
                ))}
              </div>
            </Card>
            <SectionCard title="Default model" icon={Cpu} hint="Used for Study Assistant turns when you haven’t picked another model.">
              <div className="space-y-2">
                {AI_MODELS.map((m) => {
                  const active = defaultModel === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => updateModel(m.value)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                        active ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200/80 bg-white/50 hover:bg-white'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        active ? 'border-zinc-900' : 'border-zinc-300'
                      }`}>
                        {active && <span className="h-2 w-2 rounded-full bg-zinc-900" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-800">{m.label}</span>
                        <span className="block text-xs text-zinc-400">{m.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
            <SectionCard title="API keys" icon={Key} hint="Saved as you type. Keys stay on this device.">
              <div className="space-y-4">
                <div>
                  <FieldLabel status={Boolean(openRouterKey.trim())}>OpenRouter</FieldLabel>
                  <SecretInput value={openRouterKey} onChange={updateOpenRouter} placeholder="sk-or-v1-..." />
                  <p className="mt-1 text-xs text-zinc-400">Study Assistant + optional Kokoro via OpenRouter.</p>
                </div>
                <div>
                  <FieldLabel status={Boolean(tavilyKey.trim())}>Tavily Search</FieldLabel>
                  <SecretInput value={tavilyKey} onChange={updateTavily} placeholder="tvly-..." />
                  <p className="mt-1 text-xs text-zinc-400">Live web search in Arrodes. Free at tavily.com.</p>
                </div>
                <div>
                  <FieldLabel status={Boolean(pineconeKey.trim())}>Pinecone API key</FieldLabel>
                  <SecretInput value={pineconeKey} onChange={updatePineconeKey} placeholder="pcsk_..." />
                </div>
                <div>
                  <FieldLabel>Pinecone index host</FieldLabel>
                  <Input value={pineconeHost} onChange={updatePineconeHost} placeholder="epicure-xxxx.svc….pinecone.io" />
                  <p className="mt-1 text-xs text-zinc-400">If blocked, Arrodes still searches notes locally.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void reindex()} disabled={indexing}>
                    {indexing ? 'Indexing…' : 'Reindex help + notes'}
                  </Button>
                  {indexMsg && <span className="text-xs text-zinc-500">{indexMsg}</span>}
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Memory & history" hint="Local facts Arrodes remembers about you, plus chat history.">
              <p className="mb-3 text-xs text-zinc-500">{memCount} memory fact{memCount === 1 ? '' : 's'} stored.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => {
                  clearMemory();
                  setMemCount(0);
                  setNote('Memory cleared.');
                  flash();
                }}>
                  Clear memory
                </Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  clearHistory();
                  setNote('Chat history cleared.');
                  flash();
                }}>
                  Clear chat history
                </Button>
              </div>
              {note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}
            </SectionCard>
          </div>
        );
      case 'voice':
        return <VoiceKeysCard />;
      case 'dictionary':
        return (
          <SectionCard title="Merriam-Webster" icon={BookOpen} hint="Dictionary widget on the dashboard.">
            <FieldLabel status={Boolean(mwKey.trim())}>Collegiate API key</FieldLabel>
            <SecretInput value={mwKey} onChange={updateMw} placeholder="Your MW Collegiate API key" />
            <p className="mt-1 text-xs text-zinc-400">Saved as you type.</p>
          </SectionCard>
        );
      case 'shortcuts':
        return (
          <SectionCard title="Keyboard shortcuts" icon={Keyboard} hint="Click a row, then press the new combo.">
            <div className="space-y-2">
              {(Object.keys(SHORTCUT_LABELS) as ShortcutId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setListening(id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    listening === id ? 'border-zinc-900 bg-zinc-100' : 'border-zinc-200/80 bg-white/60 hover:bg-white'
                  }`}
                >
                  <span className="text-sm text-zinc-700">{SHORTCUT_LABELS[id]}</span>
                  <kbd className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-800 ring-1 ring-zinc-200/80">
                    {listening === id ? 'Press keys…' : formatShortcut(shortcuts[id])}
                  </kbd>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { resetShortcuts(); setShortcuts(getShortcuts()); flash(); }}
              className="mt-3 text-xs text-zinc-500 underline hover:text-zinc-800"
            >
              Reset to defaults
            </button>
          </SectionCard>
        );
      case 'data':
        return (
          <SectionCard title="Backup" icon={Database} hint="Download a JSON snapshot of your local tables.">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/60">
              <div>
                <p className="text-sm font-medium text-zinc-700">Export data</p>
                <p className="text-xs text-zinc-400">Todos, habits, notes, grades, and more</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void exportData()}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
          </SectionCard>
        );
      case 'about':
        return (
          <SectionCard title="epicure" icon={Info} hint="Local-first study OS for Grade 10.">
            <ul className="space-y-2 text-sm text-zinc-600">
              <li>Data stays on this device unless you export it.</li>
              <li>Keys are stored in localStorage — never sent to our servers.</li>
              <li>Arrodes uses the keys you provide (OpenRouter, Groq, etc.).</li>
            </ul>
          </SectionCard>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        action={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity ${
            saved ? 'bg-zinc-900 text-white opacity-100' : 'bg-transparent text-zinc-400 opacity-70'
          }`}>
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Saved automatically'}
          </span>
        }
      />

      {/* Mobile / tablet: chip tabs */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 xl:hidden">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? 'bg-zinc-900 text-white' : 'bg-white/70 text-zinc-600 ring-1 ring-zinc-200/80 hover:bg-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Desktop: side rail */}
        <nav className="hidden w-44 shrink-0 xl:block">
          <div className="sticky top-3 space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-white/80 hover:text-zinc-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 flex-1">{content}</div>
      </div>
    </div>
  );
}

function InstallTip() {
  const [installed, setInstalled] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
  }, []);
  if (installed) return null;
  return (
    <SectionCard title="Install epicure" icon={Smartphone} hint="Full-screen, app-like experience on your home screen.">
      <ul className="space-y-1.5 text-xs text-zinc-500">
        <li><span className="font-medium text-zinc-700">iPhone / iPad:</span> Share → Add to Home Screen.</li>
        <li><span className="font-medium text-zinc-700">Android Chrome:</span> menu → Add to Home screen / Install app.</li>
        <li><span className="font-medium text-zinc-700">Desktop:</span> install icon in the address bar.</li>
      </ul>
    </SectionCard>
  );
}

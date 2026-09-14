import { useState, useEffect, useRef } from 'react';
import { usePomodoro } from '@/context/PomodoroContext';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type PomodoroSettings, type SubjectKey } from '@/lib/types';
import { Card, PageHeader, Button, Select } from '@/components/kit';
import AnalyticsPage from '@/pages/AnalyticsPage';
import { MotionSwap } from '@/components/MotionUI';
import { AmbientMixer, AMBIENT_LIBRARY, type AmbientId } from '@/lib/ambientSounds';
import { Play, Pause, RotateCcw, Settings, Volume2, VolumeX, Coffee, Brain, BarChart3, Layers, CloudRain, AudioLines, Music, Trees, Waves, Flame, CloudLightning, BookOpen, House } from 'lucide-react';

const SOUND_ICONS: Record<AmbientId, typeof CloudRain> = {
  rain: CloudRain,
  white: AudioLines,
  lofi: Music,
  forest: Trees,
  ocean: Waves,
  cafe: Coffee,
  fire: Flame,
  thunder: CloudLightning,
  library: BookOpen,
  cabin: House,
};

type SessionType = 'focus' | 'short_break' | 'long_break';

export default function PomodoroPage() {
  const pomo = usePomodoro();
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey | ''>('math');
  const [section, setSection] = useState<'timer' | 'analytics'>('timer');
  const [showSettings, setShowSettings] = useState(false);
  const [mixMode, setMixMode] = useState(false);
  const [playing, setPlaying] = useState<Partial<Record<AmbientId, boolean>>>({});
  const [volume, setVolume] = useState(70);
  const [selected, setSelected] = useState<AmbientId>('rain');
  const mixerRef = useRef<AmbientMixer | null>(null);
  if (!mixerRef.current) mixerRef.current = new AmbientMixer();
  const soundOn = Object.values(playing).some(Boolean);

  useEffect(() => () => mixerRef.current?.dispose(), []);

  useEffect(() => {
    if (!pomo.lastCompletedAt) return;
    const mixer = mixerRef.current;
    if (!mixer || !mixer.playingIds().length) return;
    void mixer.fadeAllToZero(3000).then(() => setPlaying({}));
  }, [pomo.lastCompletedAt]);

  const toggleSound = (id: AmbientId) => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    if (playing[id]) {
      mixer.stop(id);
      setPlaying((cur) => ({ ...cur, [id]: false }));
      return;
    }
    if (!mixMode) {
      mixer.stopAll();
      setPlaying({ [id]: true });
    } else {
      setPlaying((cur) => ({ ...cur, [id]: true }));
    }
    void mixer.play(id, volume / 100);
    setSelected(id);
  };

  const changeVolume = (next: number) => {
    setVolume(next);
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.playingIds().forEach((id) => mixer.setVolume(id, next / 100));
  };

  const silenceAll = () => {
    mixerRef.current?.stopAll();
    setPlaying({});
  };

  const saveSettings = async (newSettings: Partial<PomodoroSettings>) => {
    if (!pomo.settings) return;
    await supabase.from('pomodoro_settings').update(newSettings).eq('id', pomo.settings.id);
  };

  const minutes = Math.floor(pomo.timeLeft / 60);
  const seconds = pomo.timeLeft % 60;
  const totalTime = pomo.getDuration(pomo.sessionType);
  const progress = totalTime > 0 ? ((totalTime - pomo.timeLeft) / totalTime) * 100 : 0;

  const sessionConfig = {
    focus: { label: 'Focus', icon: Brain },
    short_break: { label: 'Short Break', icon: Coffee },
    long_break: { label: 'Long Break', icon: Coffee },
  } as const;

  const currentConfig = sessionConfig[pomo.sessionType];
  const Icon = currentConfig.icon;
  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div>
      <PageHeader
        title="Focus"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {section === 'timer' && (
              <>
                <Button variant="secondary" size="sm" onClick={() => soundOn ? silenceAll() : toggleSound('rain')}>
                  {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  {soundOn ? 'Sound On' : 'Sound Off'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowSettings(!showSettings)}>
                  <Settings className="w-4 h-4" /> Settings
                </Button>
              </>
            )}
            <div className="flex gap-1 rounded-xl p-1 glass">
              <button type="button" onClick={() => setSection('timer')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${section === 'timer' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-800'}`}>
                <Brain className="h-3.5 w-3.5" /> Timer
              </button>
              <button type="button" onClick={() => setSection('analytics')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${section === 'analytics' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-800'}`}>
                <BarChart3 className="h-3.5 w-3.5" /> Analytics
              </button>
            </div>
          </div>
        }
      />
      <MotionSwap id={section}>
      {section === 'analytics' ? <AnalyticsPage embedded /> : null}
      {section === 'timer' && (

      <div className="grid lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <div className="lg:col-span-2">
          <Card className="p-8 flex flex-col items-center">
            <div className="flex gap-2 mb-8 p-1 glass rounded-xl">
              {(Object.keys(sessionConfig) as SessionType[]).map((type) => {
                const cfg = sessionConfig[type];
                const SIcon = cfg.icon;
                return (
                  <button
                    key={type}
                    onClick={() => pomo.switchType(type)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      pomo.sessionType === type ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <SIcon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-72 h-72 mb-8">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 280 280">
                <circle cx="140" cy="140" r="120" fill="none" stroke="currentColor" className="text-zinc-200" strokeWidth="12" />
                <circle
                  cx="140" cy="140" r="120" fill="none" stroke="currentColor"
                  className="text-zinc-900"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Icon className="w-8 h-8 text-zinc-900 mb-2" />
                <div className="text-5xl font-bold text-zinc-800 tabular-nums">
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
                <p className="text-sm text-zinc-400 mt-1">{currentConfig.label}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <Button onClick={() => pomo.isRunning ? pomo.pause() : pomo.start()} className="px-8">
                {pomo.isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {pomo.isRunning ? 'Pause' : 'Start'}
              </Button>
              <Button variant="secondary" onClick={pomo.reset}>
                <RotateCcw className="w-4 h-4" /> Reset
              </Button>
            </div>

            <div className="w-full max-w-xs">
              <label className="text-xs font-medium text-zinc-500 mb-1 block text-center">Studying for</label>
              <Select
                value={selectedSubject}
                onChange={(v) => setSelectedSubject(v as SubjectKey)}
                options={[{ value: '', label: 'General Study' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.name }))]}
              />
            </div>

            <div className="flex items-center gap-4 mt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-800">{pomo.completedFocus}</div>
                <div className="text-xs text-zinc-400">Focus Sessions</div>
              </div>
              <div className="w-px h-8 bg-zinc-200" />
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-800">{pomo.completedFocus * (pomo.settings?.focus_duration ?? 25)}</div>
                <div className="text-xs text-zinc-400">Minutes Focused</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-zinc-800 flex items-center gap-1.5 text-sm">
                <Volume2 className="w-3.5 h-3.5" /> Ambient
              </h3>
              <button
                type="button"
                onClick={() => {
                  setMixMode((on) => {
                    if (on) {
                      const keep = AMBIENT_LIBRARY.find((s) => playing[s.id])?.id;
                      if (keep) {
                        AMBIENT_LIBRARY.forEach((s) => {
                          if (s.id !== keep && playing[s.id]) mixerRef.current?.stop(s.id);
                        });
                        setPlaying({ [keep]: true });
                      }
                    }
                    return !on;
                  });
                }}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium ${
                  mixMode ? 'bg-zinc-900 text-white' : 'glass text-zinc-600'
                }`}
              >
                <Layers className="h-3 w-3" /> Mix
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {AMBIENT_LIBRARY.map((s) => {
                const active = Boolean(playing[s.id]);
                const Icon = SOUND_ICONS[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSound(s.id)}
                    className={`aspect-square rounded-xl border px-0.5 text-center transition-all ${
                      active ? 'border-zinc-800 bg-zinc-900 text-white' : 'glass border-transparent text-zinc-600'
                    }`}
                  >
                    <Icon className={`mx-auto h-3.5 w-3.5 ${active ? 'text-white' : 'text-zinc-700'}`} />
                    <span className="mt-0.5 block truncate text-[9px] font-medium leading-tight">{s.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-xl glass px-2 py-1">
              {(() => {
                const PlayerIcon = SOUND_ICONS[selected];
                const live = Boolean(playing[selected]);
                return (
                  <>
                    <PlayerIcon className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-700">
                      {AMBIENT_LIBRARY.find((s) => s.id === selected)?.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSound(selected)}
                      className="rounded-md p-1 text-zinc-600 hover:bg-white/50"
                      aria-label={live ? 'Pause' : 'Play'}
                    >
                      {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      onChange={(e) => changeVolume(Number(e.target.value))}
                      className="h-1.5 min-w-0 flex-1 accent-zinc-900"
                    />
                    <span className="w-7 text-right text-[10px] tabular-nums text-zinc-500">{volume}%</span>
                  </>
                );
              })()}
            </div>
          </Card>

          {showSettings && pomo.settings && (
            <Card className="p-3">
              <h3 className="font-semibold text-zinc-800 mb-2 text-sm">Timer Settings</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'focus_duration', label: 'Focus (min)', min: 1, max: 120, def: 25 },
                  { key: 'short_break_duration', label: 'Short (min)', min: 1, max: 60, def: 5 },
                  { key: 'long_break_duration', label: 'Long (min)', min: 1, max: 60, def: 15 },
                  { key: 'sessions_before_long_break', label: 'Sessions', min: 1, max: 10, def: 4 },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-[10px] font-medium text-zinc-500 mb-0.5 block">{field.label}</label>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={(pomo.settings as PomodoroSettings)[field.key as keyof PomodoroSettings] as number}
                      onChange={(e) => saveSettings({ [field.key]: parseInt(e.target.value) || field.def } as Partial<PomodoroSettings>)}
                      className="w-full px-2 py-1.5 glass-input rounded-xl text-sm"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      )}
      </MotionSwap>
    </div>
  );
}

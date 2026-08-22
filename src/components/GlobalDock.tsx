import { useState, useRef, useEffect } from 'react';
import { usePomodoro } from '@/context/PomodoroContext';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import ScientificCalculator from '@/components/ScientificCalculator';
import DictionaryWidget from '@/components/DictionaryWidget';
import QuickImportModal from '@/components/QuickImportModal';
import CodsworthPanel from '@/components/CodsworthPanel';
import {
  Calculator, BookOpen, Plus, Timer, Play, Pause, Square,
  GripHorizontal, X, StickyNote, Bot, Sparkles,
} from 'lucide-react';

type DockTab = 'main' | 'pomodoro' | 'calculator' | 'dictionary' | 'quicktask' | 'quicknote';

const TASKS_PAGES: PageId[] = ['todos', 'kanban', 'calendar', 'notes'];

/**
 * Global dock — same bar height/padding as the original epicure dock.
 * Collapsed: FAB with +. Expanded: horizontal tool bar above the FAB.
 * No portal, no full-screen overlay — plain fixed positioning like the old dock.
 */
export default function GlobalDock({ navigate, page }: { navigate: (p: PageId) => void; page: PageId }) {
  const pomodoro = usePomodoro();
  const [open, setOpen] = useState(false);
  const [codsworthOpen, setCodsworthOpen] = useState(false);
  const showCodsworth = TASKS_PAGES.includes(page);
  const onTasksPage = TASKS_PAGES.includes(page);
  const [codsworthVisible, setCodsworthVisible] = useState(onTasksPage);
  const [codsworthLeaving, setCodsworthLeaving] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>('main');
  const [calcDetached, setCalcDetached] = useState(false);
  const [dictDetached, setDictDetached] = useState(false);
  const [quickTask, setQuickTask] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const onTasksPage = TASKS_PAGES.includes(page);
  const [codsworthVisible, setCodsworthVisible] = useState(onTasksPage);
  const [codsworthLeaving, setCodsworthLeaving] = useState(false);

// Mitosis in on tasks pages; reverse merge when leaving
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (onTasksPage) {
      setCodsworthLeaving(false);
      setCodsworthVisible(true);
    } else {
      setCodsworthOpen(false);
      setCodsworthLeaving(true);
      timer = setTimeout(() => {
        setCodsworthVisible(false);
        setCodsworthLeaving(false);
      }, 320);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [onTasksPage]);

  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
      )}

      {showCodsworth && codsworthOpen && (
      {codsworthVisible && codsworthOpen && (
        <CodsworthPanel page={page} onClose={() => setCodsworthOpen(false)} />
      )}
   )}
            </button>

            {showCodsworth && (
            {codsworthVisible && (
              <button
                key="codsworth-fab"
                type="button"
                (codsworthOpen
                    ? 'relative flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-transform active:scale-95'
                    : 'relative flex h-14 w-14 items-center justify-center rounded-full glass glass-shadow-lg text-zinc-800 transition-transform active:scale-95') +
                  ' codsworth-split-in'
                   (codsworthLeaving ? ' codsworth-split-out' : ' codsworth-split-in')
                }
                title="Codsworth — drag the panel header to move it"
              >
                <Bot className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DockButton({
  icon: Icon,
  label,
  onClick,
  active,
  badge,
}: {
  icon: typeof Calculator;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[56px] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-all ${
        active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-200/50'
      }`}
      title={label}
    
      <Icon className="h-5 w-5" />
      {badge ? (
        <span className="text-[10px] font-bold tabular-nums">{badge}</span>
      ) : (
        <span className="text-[10px] font-medium">{label}</span>
      )}
    </button>
  );
}

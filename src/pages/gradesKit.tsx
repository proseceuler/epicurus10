import { AnimatePresence, motion } from 'motion/react';
import { Button, Input } from '@/components/kit';
import { SUBJECT_MAP, EX_BREAKDOWN, type Assessment, type SubjectKey, type ComponentType, type ExType } from '@/lib/types';
import { componentPercentage, exComponentPercentage, transmuteGrade } from '@/lib/gradeUtils';
import { Plus, Trash2 } from 'lucide-react';

export const COMPONENT_LABELS: Record<ComponentType, string> = { ww: 'Written works', pt: 'Performance tasks', ex: 'Examinations' };
export const COMPONENT_SHORT: Record<ComponentType, string> = { ww: 'WW', pt: 'PT', ex: 'EX' };
export const EX_LABELS: Record<ExType, string> = { st1: 'Summative Test 1', st2: 'Summative Test 2', te: 'Term Examination' };
export const PASSING = 75;
export const DEFAULT_TARGET = 90;
export const PILL = 'px-3 py-1.5 rounded-xl text-sm font-medium border transition-all';
export const PILL_ON = 'bg-zinc-900 text-white border-zinc-900';
export const PILL_OFF = 'glass text-zinc-600 border-transparent glass-hover';

export interface Hypo {
  id: string;
  component: ComponentType;
  exType?: ExType;
  name: string;
  score: number;
  maxScore: number;
}

export function ringLabel(grade: number | null) {
  if (grade === null) return null;
  if (grade >= 90) return 'Outstanding';
  if (grade >= 85) return 'Borderline';
  if (grade >= 75) return 'Passing';
  return 'Needs work';
}

export function asInt(n: number | null) {
  return n === null ? null : Math.round(n);
}

export function hypoAsAssessments(items: Hypo[], subject: SubjectKey, term: number): Assessment[] {
  return items.map((item) => ({
    id: item.id,
    subject_key: subject,
    quarter: term,
    component: item.component,
    ex_type: item.exType ?? null,
    name: item.name || 'Hypothetical',
    score: item.score,
    max_score: item.maxScore,
  }));
}

function initialForTarget(target: number) {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (transmuteGrade(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function neededOnRemaining(
  subjectKey: SubjectKey,
  term: number,
  assessments: Assessment[],
  current: number | null,
) {
  const target = current !== null && current >= DEFAULT_TARGET ? Math.min(100, Math.ceil((current + 1) / 5) * 5) : DEFAULT_TARGET;
  if (current !== null && current >= 100) {
    return { text: 'Term exam and components are already maxed.', target: 100, need: null as number | null };
  }
  const subject = SUBJECT_MAP[subjectKey];
  const tA = assessments.filter((a) => a.subject_key === subjectKey && a.quarter === term);
  const hasWw = tA.some((a) => a.component === 'ww');
  const hasPt = tA.some((a) => a.component === 'pt');
  const hasSt1 = tA.some((a) => a.component === 'ex' && a.ex_type === 'st1');
  const hasSt2 = tA.some((a) => a.component === 'ex' && a.ex_type === 'st2');
  const hasTe = tA.some((a) => a.component === 'ex' && a.ex_type === 'te');
  const wwPct = hasWw ? componentPercentage(tA, 'ww') : 0;
  const ptPct = hasPt ? componentPercentage(tA, 'pt') : 0;
  const st1Pct = hasSt1 ? exComponentPercentage(tA, 'st1') : 0;
  const st2Pct = hasSt2 ? exComponentPercentage(tA, 'st2') : 0;
  const tePct = hasTe ? exComponentPercentage(tA, 'te') : 0;
  const w = subject.weights;
  const want = initialForTarget(target);

  const solve = (label: string, addInitial: (score: number) => number) => {
    const need = (() => {
      let lo = 0;
      let hi = 100;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        if (addInitial(mid) >= want) hi = mid;
        else lo = mid;
      }
      return hi;
    })();
    if (addInitial(100) + 0.05 < want) {
      return { text: `Even 100 on the ${label} will not reach ${target}.`, target, need: 100 };
    }
    if (addInitial(0) >= want) {
      return { text: `Already on track for ${target}.`, target, need: 0 };
    }
    return { text: `Need ${Math.ceil(need)} on the ${label} to reach ${target}.`, target, need: Math.ceil(need) };
  };

  const baseEx = (te: number, st2 = st2Pct, st1 = st1Pct) =>
    st1 * (EX_BREAKDOWN.st1 / 100) + st2 * (EX_BREAKDOWN.st2 / 100) + te * (EX_BREAKDOWN.te / 100);

  const initialOf = (ww: number, pt: number, ex: number) =>
    (hasWw || ww > 0 ? (ww * w.ww) / 100 : 0) +
    (hasPt || pt > 0 ? (pt * w.pt) / 100 : 0) +
    (ex * w.ex) / 100;

  if (!hasTe) return solve('Term Exam', (te) => initialOf(wwPct, ptPct, baseEx(te)));
  if (!hasSt2) return solve('Summative Test 2', (st2) => initialOf(wwPct, ptPct, baseEx(tePct, st2)));
  if (!hasSt1) return solve('Summative Test 1', (st1) => initialOf(wwPct, ptPct, baseEx(tePct, st2Pct, st1)));
  if (!hasPt) return solve('Performance Tasks', (pt) => initialOf(wwPct, pt, baseEx(tePct)));
  if (!hasWw) return solve('Written Works', (ww) => initialOf(ww, ptPct, baseEx(tePct)));
  return { text: `No remaining items this term — standing is ${asInt(current) ?? '—'}.`, target, need: null };
}

function termPoints(values: (number | null)[], w: number, h: number) {
  const nums = values.map((v) => (v === null ? null : Math.max(60, Math.min(100, v))));
  const lo = 70;
  const hi = 100;
  return nums.map((v, i) => {
    const x = (i / Math.max(nums.length - 1, 1)) * w;
    const y = v === null ? h / 2 : h - ((v - lo) / (hi - lo)) * h;
    return { x, y, v };
  });
}

export function TermSparkWide({ values }: { values: (number | null)[] }) {
  const w = 220;
  const h = 14;
  const known = values.filter((v): v is number => v !== null);
  const pts = termPoints(values, w, h);
  if (!known.length) {
    return <span className="block h-3 w-full rounded-sm bg-zinc-100" />;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-3.5 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" stroke="#18181b" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={p.v === null ? '#d4d4d8' : '#18181b'} />
      ))}
    </svg>
  );
}

export function TermTrendLine({ values }: { values: (number | null)[] }) {
  const w = 300;
  const h = 28;
  const known = values.filter((v): v is number => v !== null);
  const pts = termPoints(values, w, h);
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="#f4f4f5" strokeWidth="1" />
        {known.length ? (
          <motion.polyline
            fill="none"
            stroke="#18181b"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45 }}
          />
        ) : (
          <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#e4e4e7" strokeWidth="1.4" />
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.2" fill={p.v === null ? '#d4d4d8' : '#18181b'} />
        ))}
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-zinc-400">
        <span>T1</span>
        <span>T2</span>
        <span>T3</span>
      </div>
    </div>
  );
}

export function termVolatility(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) {
    return { range: 0, mad: 0, sd: 0, label: 'Need another term', hint: 'Two terms needed to judge swing.', nums };
  }
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length);
  let steps = 0;
  for (let i = 1; i < nums.length; i++) steps += Math.abs(nums[i] - nums[i - 1]);
  const mad = steps / (nums.length - 1);
  const range = Math.max(...nums) - Math.min(...nums);
  const score = Math.max(sd, mad);
  const label = score < 2 ? 'Steady' : score < 5 ? 'Mild swing' : 'Volatile';
  const hint = score < 2
    ? `T1–T3 stay within ${Math.round(range)} pts.`
    : `Range ${Math.round(range)} pts · typical step ${mad.toFixed(1)}.`;
  return { range, mad, sd, label, hint, nums };
}

export function VolatilityMeter({ values }: { values: (number | null)[] }) {
  const v = termVolatility(values);
  const lo = 70;
  const hi = 100;
  const xOf = (n: number) => `${((Math.max(lo, Math.min(hi, n)) - lo) / (hi - lo)) * 100}%`;
  const min = v.nums.length ? Math.min(...v.nums) : null;
  const max = v.nums.length ? Math.max(...v.nums) : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pl-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Consistency</p>
      <p className="mt-1 text-[18px] font-semibold tracking-tight text-zinc-800">{v.label}</p>
      <div className="relative mt-3 h-2 rounded-full bg-zinc-100">
        {min !== null && max !== null ? (
          <motion.span
            className="absolute top-0 h-full rounded-full bg-zinc-300"
            initial={false}
            animate={{ left: xOf(min), width: `calc(${xOf(max)} - ${xOf(min)})` }}
            transition={{ duration: 0.4 }}
          />
        ) : null}
        {values.map((g, i) => (
          g === null ? null : (
            <motion.span
              key={i}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900"
              initial={false}
              animate={{ left: xOf(g) }}
              transition={{ duration: 0.4 }}
            />
          )
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-zinc-400">
        <span>70</span>
        <span>100</span>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-zinc-500">{v.hint}</p>
      <p className="mt-1 text-[11px] tabular-nums text-zinc-400">
        {values.map((g, i) => `T${i + 1} ${g === null ? '—' : Math.round(g)}`).join('  ·  ')}
      </p>
    </div>
  );
}

export function GradeRing({
  value,
  caption,
  chip,
  dashed = false,
}: {
  value: number | null;
  caption: string;
  chip?: string | null;
  dashed?: boolean;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - pct / 100);
  return (
    <div className="flex shrink-0 flex-col items-center justify-center py-2">
      <div className="relative h-[132px] w-[132px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#e4e4e7" strokeWidth="12" />
          <motion.circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={dashed ? '#3f3f46' : '#18181b'}
            strokeWidth="12"
            strokeLinecap="butt"
            strokeDasharray={dashed ? '7 5' : c}
            animate={{ strokeDashoffset: dash }}
            initial={false}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={value === null ? 'empty' : Math.round(value)}
            className="text-[34px] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums"
            initial={{ opacity: 0.35, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            {value === null ? '—' : Math.round(value)}
          </motion.span>
          <span className="mt-1 text-[11px] text-zinc-400">{caption}</span>
        </div>
      </div>
      {chip ? (
        <span className={`mt-2 rounded-full border px-2.5 py-0.5 text-[11px] text-zinc-500 ${
          dashed ? 'border-dashed border-zinc-400' : 'border-zinc-200 bg-zinc-50'
        }`}>
          {chip}
        </span>
      ) : null}
    </div>
  );
}

export function ItemRow({
  name, score, max, ghost, onDelete,
}: {
  name: string; score: number; max: number; ghost?: boolean; onDelete: () => void;
}) {
  return (
    <div className={`group flex items-center gap-3 py-1 text-[13px] ${
      ghost ? 'rounded border border-dashed border-zinc-300 px-2 text-zinc-500' : 'text-zinc-600'
    }`}>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="tabular-nums text-zinc-500">{score}/{max}</span>
      <span className="w-10 text-right tabular-nums text-zinc-400">{max ? Math.round((score / max) * 100) : 0}%</span>
      <button type="button" onClick={onDelete} className="text-zinc-300 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function AddRow({
  active, simulate, name, score, max, setName, setScore, setMax, onOpen, onCancel, onSubmit,
}: {
  active: boolean;
  simulate: boolean;
  name: string; score: string; max: string;
  setName: (v: string) => void; setScore: (v: string) => void; setMax: (v: string) => void;
  onOpen: () => void; onCancel: () => void; onSubmit: () => void;
}) {
  return (
    <div className="mt-1">
      <AnimatePresence initial={false} mode="wait">
        {active ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Input value={name} onChange={setName} placeholder="Name" className="min-w-[120px] flex-1" />
              <Input value={score} onChange={setScore} placeholder="Score" type="number" className="w-20" />
              <Input value={max} onChange={setMax} placeholder="Max" type="number" className="w-20" />
              <Button size="sm" onClick={onSubmit}>Add</Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="open"
            type="button"
            onClick={onOpen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <Plus className="h-3 w-3" /> {simulate ? 'Add hypothetical' : 'Add'}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

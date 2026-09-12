import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, SUBJECT_MAP, EX_BREAKDOWN, NUM_TERMS, type Assessment, type SubjectKey, type ComponentType, type ExType } from '@/lib/types';
import { computeTermGrade, computeFinalGrade, componentPercentage, exComponentPercentage } from '@/lib/gradeUtils';
import { Button, Input } from '@/components/kit';
import ScientificCalculator from '@/components/ScientificCalculator';
import { onDataChanged } from '@/lib/assistant/sync';
import { Calculator, Plus, Trash2, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

const COMPONENT_LABELS: Record<ComponentType, string> = { ww: 'Written works', pt: 'Performance tasks', ex: 'Examinations' };
const COMPONENT_SHORT: Record<ComponentType, string> = { ww: 'WW', pt: 'PT', ex: 'EX' };
const EX_LABELS: Record<ExType, string> = { st1: 'Summative Test 1', st2: 'Summative Test 2', te: 'Term Examination' };
const SY_LABEL = 'Grade 10 · S.Y. 2026-2027';

interface Hypo {
  id: string;
  component: ComponentType;
  exType?: ExType;
  name: string;
  score: number;
  maxScore: number;
}

function ringLabel(grade: number | null) {
  if (grade === null) return null;
  if (grade >= 90) return 'Outstanding';
  if (grade >= 85) return 'Borderline';
  if (grade >= 75) return 'Passing';
  return 'Needs work';
}

function asInt(n: number | null) {
  return n === null ? null : Math.round(n);
}

function hypoAsAssessments(items: Hypo[], subject: SubjectKey, term: number): Assessment[] {
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

function GradeRing({
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
  const r = 58;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative h-[168px] w-[168px]">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r={r} fill="none" stroke="#e4e4e7" strokeWidth="14" />
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={dashed ? '#3f3f46' : '#18181b'}
            strokeWidth="14"
            strokeLinecap="butt"
            strokeDasharray={c}
            strokeDashoffset={dash}
            style={dashed ? { strokeDasharray: '7 5', strokeDashoffset: dash } : undefined}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[42px] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums">
            {value === null ? '—' : Math.round(value)}
          </span>
          <span className="mt-1 text-[11px] text-zinc-400">{caption}</span>
        </div>
      </div>
      {chip ? (
        <span className={`mt-3 rounded-full border px-2.5 py-0.5 text-[11px] text-zinc-500 ${
          dashed ? 'border-dashed border-zinc-400' : 'border-zinc-200 bg-zinc-50'
        }`}>
          {chip}
        </span>
      ) : null}
    </div>
  );
}

export default function GradesPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('math');
  const [selectedTerm, setSelectedTerm] = useState(1);
  const [simulate, setSimulate] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [expanded, setExpanded] = useState<ComponentType | null>(null);
  const [adding, setAdding] = useState<{ component: ComponentType; exType?: ExType } | null>(null);
  const [newName, setNewName] = useState('');
  const [newScore, setNewScore] = useState('');
  const [newMax, setNewMax] = useState('');
  const [hypos, setHypos] = useState<Hypo[]>([]);

  const loadAssessments = useCallback(async () => {
    const { data, error } = await supabase.from('assessments').select('*').order('created_at', { ascending: true });
    if (!error && data) setAssessments(data as Assessment[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadAssessments(); }, [loadAssessments]);
  useEffect(() => onDataChanged(() => { void loadAssessments(); }), [loadAssessments]);
  useEffect(() => {
    setHypos([]);
    setAdding(null);
    setExpanded(null);
  }, [selectedSubject, selectedTerm]);

  const subject = SUBJECT_MAP[selectedSubject];
  const realTerm = computeTermGrade(selectedSubject, selectedTerm, assessments);
  const merged = useMemo(
    () => (simulate ? [...assessments, ...hypoAsAssessments(hypos, selectedSubject, selectedTerm)] : assessments),
    [simulate, assessments, hypos, selectedSubject, selectedTerm],
  );
  const shownTerm = computeTermGrade(selectedSubject, selectedTerm, merged);
  const finalGrade = computeFinalGrade(selectedSubject, assessments);
  const delta = shownTerm !== null && realTerm !== null ? Math.round(shownTerm) - Math.round(realTerm) : 0;

  const subjectAssessments = merged.filter(
    (a) => a.subject_key === selectedSubject && a.quarter === selectedTerm,
  );

  const addReal = async (component: ComponentType, exType?: ExType) => {
    if (!newName.trim() || !newScore || !newMax) return;
    const score = parseFloat(newScore);
    const maxScore = parseFloat(newMax);
    if (isNaN(score) || isNaN(maxScore) || maxScore <= 0) return;
    const { data } = await supabase
      .from('assessments')
      .insert({
        subject_key: selectedSubject,
        quarter: selectedTerm,
        component,
        ex_type: exType ?? null,
        name: newName.trim(),
        score,
        max_score: maxScore,
      })
      .select()
      .single();
    if (data) setAssessments([...assessments, data as Assessment]);
    setNewName(''); setNewScore(''); setNewMax(''); setAdding(null);
  };

  const addHypo = (component: ComponentType, exType?: ExType) => {
    if (!newScore || !newMax) return;
    const score = parseFloat(newScore);
    const maxScore = parseFloat(newMax);
    if (isNaN(score) || isNaN(maxScore) || maxScore <= 0) return;
    setHypos((cur) => [...cur, {
      id: crypto.randomUUID(),
      component,
      exType,
      name: newName.trim() || 'Hypothetical',
      score,
      maxScore,
    }]);
    setNewName(''); setNewScore(''); setNewMax(''); setAdding(null);
  };

  const deleteAssessment = async (id: string) => {
    await supabase.from('assessments').delete().eq('id', id);
    setAssessments(assessments.filter((a) => a.id !== id));
  };

  const submitAdd = (component: ComponentType, exType?: ExType) => {
    if (simulate) addHypo(component, exType);
    else void addReal(component, exType);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-xs text-zinc-400">Loading grades…</div>;
  }

  const ringChip = simulate
    ? (delta !== 0 ? `${delta > 0 ? '+' : ''}${delta} vs current` : 'projected')
    : ringLabel(shownTerm);

  return (
    <div className="pb-16">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[28px] font-semibold leading-none tracking-tight text-zinc-900">Grades</h1>
          <p className="mt-2 text-[13px] text-zinc-400">{SY_LABEL}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSimulate((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${
              simulate
                ? 'border-dashed border-zinc-500 bg-white text-zinc-700'
                : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {simulate ? 'Simulating' : 'Simulate'}
          </button>
          <button
            type="button"
            onClick={() => setShowCalc((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[13px] text-zinc-600 hover:border-zinc-300"
          >
            <Calculator className="h-3.5 w-3.5" />
            Calculator
          </button>
        </div>
      </div>

      {simulate ? (
        <div className="mb-5 mt-4 inline-flex rounded-full border border-dashed border-zinc-300 bg-white px-3 py-1.5 text-[12px] text-zinc-400">
          Simulated scores shown with dashed outlines — not saved to your record.
        </div>
      ) : <div className="h-4" />}

      <div className="border-b border-zinc-200">
        <div className="flex gap-5 overflow-x-auto">
          {SUBJECTS.map((s) => {
            const on = selectedSubject === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSelectedSubject(s.key)}
                className={`relative shrink-0 pb-2.5 text-[13px] ${
                  on ? 'font-medium text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                {s.shortName}
                {on ? <span className="absolute inset-x-0 -bottom-px h-px bg-zinc-900" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 mb-5 inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-zinc-200/80">
        {Array.from({ length: NUM_TERMS }, (_, i) => i + 1).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedTerm(t)}
            className={`rounded-full px-3.5 py-1 text-[13px] ${
              selectedTerm === t ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Term {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200/70">
          <p className="text-[12px] text-zinc-400">{subject.shortName}</p>
          <GradeRing
            value={asInt(shownTerm)}
            caption={simulate ? 'projected' : 'term grade'}
            chip={ringChip}
            dashed={simulate}
          />
        </div>

        <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-zinc-200/70">
          <div className="space-y-5">
            {(['ww', 'pt', 'ex'] as ComponentType[]).map((comp) => {
              const realItems = assessments.filter((a) => a.subject_key === selectedSubject && a.quarter === selectedTerm && a.component === comp);
              const allItems = subjectAssessments.filter((a) => a.component === comp);
              const realPct = componentPercentage(
                assessments.filter((a) => a.subject_key === selectedSubject && a.quarter === selectedTerm),
                comp,
              );
              const shownPct = componentPercentage(subjectAssessments, comp);
              const open = expanded === comp;
              return (
                <div key={comp}>
                  <button type="button" onClick={() => setExpanded(open ? null : comp)} className="flex w-full items-center justify-between gap-3 text-left">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-5 items-center rounded bg-zinc-900 px-1.5 text-[10px] font-semibold tracking-wide text-white">{COMPONENT_SHORT[comp]}</span>
                      <span className="text-[13px] text-zinc-800">{COMPONENT_LABELS[comp]}</span>
                      <span className="text-[12px] text-zinc-400">{subject.weights[comp]}% weight</span>
                    </div>
                    <span className="shrink-0 text-[12px] text-zinc-400">{allItems.length} items</span>
                  </button>
                  <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-zinc-100">
                    <div className="relative h-full">
                      <div className="h-full bg-zinc-900" style={{ width: `${Math.min(100, realItems.length ? realPct : 0)}%` }} />
                      {simulate && shownPct > realPct ? (
                        <div
                          className="absolute top-0 h-full border-y border-dashed border-zinc-400 bg-zinc-300/40"
                          style={{ left: `${Math.min(100, realPct)}%`, width: `${Math.min(100 - realPct, shownPct - realPct)}%` }}
                        />
                      ) : null}
                    </div>
                  </div>
                  {open ? (
                    <div className="mt-3 space-y-1.5">
                      {comp === 'ex' ? (Object.keys(EX_LABELS) as ExType[]).map((exType) => {
                        const exItems = allItems.filter((a) => a.ex_type === exType);
                        const exPct = exComponentPercentage(subjectAssessments, exType);
                        return (
                          <div key={exType} className="rounded-lg bg-zinc-50 px-3 py-2">
                            <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                              <span>{EX_LABELS[exType]} · {EX_BREAKDOWN[exType]}% of EX</span>
                              <span>{exItems.length ? `${exPct.toFixed(0)}%` : '—'}</span>
                            </div>
                            {exItems.map((a) => (
                              <ItemRow
                                key={a.id}
                                name={a.name}
                                score={a.score}
                                max={a.max_score}
                                ghost={simulate && hypos.some((h) => h.id === a.id)}
                                onDelete={() => {
                                  if (hypos.some((h) => h.id === a.id)) setHypos((cur) => cur.filter((h) => h.id !== a.id));
                                  else void deleteAssessment(a.id);
                                }}
                              />
                            ))}
                            <AddRow
                              active={adding?.component === 'ex' && adding.exType === exType}
                              simulate={simulate}
                              name={newName} score={newScore} max={newMax}
                              setName={setNewName} setScore={setNewScore} setMax={setNewMax}
                              onOpen={() => { setAdding({ component: 'ex', exType }); setNewName(''); setNewScore(''); setNewMax(''); }}
                              onCancel={() => setAdding(null)}
                              onSubmit={() => submitAdd('ex', exType)}
                            />
                          </div>
                        );
                      }) : (
                        <>
                          {allItems.map((a) => (
                            <ItemRow
                              key={a.id}
                              name={a.name}
                              score={a.score}
                              max={a.max_score}
                              ghost={simulate && hypos.some((h) => h.id === a.id)}
                              onDelete={() => {
                                if (hypos.some((h) => h.id === a.id)) setHypos((cur) => cur.filter((h) => h.id !== a.id));
                                else void deleteAssessment(a.id);
                              }}
                            />
                          ))}
                          <AddRow
                            active={adding?.component === comp && !adding.exType}
                            simulate={simulate}
                            name={newName} score={newScore} max={newMax}
                            setName={setNewName} setScore={setNewScore} setMax={setNewMax}
                            onOpen={() => { setAdding({ component: comp }); setNewName(''); setNewScore(''); setNewMax(''); }}
                            onCancel={() => setAdding(null)}
                            onSubmit={() => submitAdd(comp)}
                          />
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setExpanded(expanded ?? 'ww');
                setAdding({ component: expanded ?? 'ww' });
                setNewName(''); setNewScore(''); setNewMax('');
              }}
              className="text-[13px] text-zinc-500 hover:text-zinc-800"
            >
              {simulate ? 'Add hypothetical +' : 'Add item +'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-zinc-200/70">
          <p className="text-[12px] text-zinc-400">Final grade, average of terms</p>
          <p className="mt-3 font-serif text-[44px] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums">
            {asInt(finalGrade) ?? '—'}
          </p>
          <div className="mt-5 divide-y divide-zinc-100">
            {Array.from({ length: NUM_TERMS }, (_, i) => i + 1).map((t) => {
              const tg = computeTermGrade(selectedSubject, t, assessments);
              return (
                <div key={t} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-zinc-500">Term {t}</span>
                  <span className="tabular-nums text-zinc-800">{asInt(tg) ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70">
          <p className="px-6 pt-5 text-[12px] text-zinc-400">All subjects overview</p>
          <div className="mt-2">
            {SUBJECTS.map((s) => {
              const fg = computeFinalGrade(s.key, assessments);
              const latest = [3, 2, 1].map((t) => computeTermGrade(s.key, t, assessments)).find((g) => g !== null) ?? null;
              const prevTerms = [1, 2, 3].map((t) => computeTermGrade(s.key, t, assessments)).filter((g): g is number => g !== null);
              const trend = prevTerms.length >= 2 ? Math.round(prevTerms[prevTerms.length - 1] - prevTerms[prevTerms.length - 2]) : 0;
              const active = selectedSubject === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelectedSubject(s.key)}
                  className={`flex w-full items-center gap-3 border-t border-zinc-100 px-6 py-3 text-left first:border-t-0 ${
                    active ? 'bg-zinc-50/80' : 'hover:bg-zinc-50/60'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${fg === null ? 'bg-zinc-300' : 'bg-zinc-900'}`} />
                  <span className="flex-1 text-[14px] text-zinc-800">{s.shortName}</span>
                  <span className="inline-flex w-10 items-center justify-end gap-0.5 text-[12px] tabular-nums text-zinc-400">
                    {fg === null ? '—' : trend > 0 ? <><TrendingUp className="h-3 w-3" /> {trend}</> : trend < 0 ? <><TrendingDown className="h-3 w-3" /> {Math.abs(trend)}</> : '—'}
                  </span>
                  <span className="w-8 text-right text-[14px] tabular-nums text-zinc-800">{asInt(latest) ?? '—'}</span>
                  <ChevronRight className="h-4 w-4 text-zinc-300" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showCalc ? (
        <ScientificCalculator
          detached
          onDetach={() => undefined}
          onSnapBack={() => setShowCalc(false)}
          onClose={() => setShowCalc(false)}
        />
      ) : null}
    </div>
  );
}

function ItemRow({
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

function AddRow({
  active, simulate, name, score, max, setName, setScore, setMax, onOpen, onCancel, onSubmit,
}: {
  active: boolean;
  simulate: boolean;
  name: string; score: string; max: string;
  setName: (v: string) => void; setScore: (v: string) => void; setMax: (v: string) => void;
  onOpen: () => void; onCancel: () => void; onSubmit: () => void;
}) {
  if (!active) {
    return (
      <button type="button" onClick={onOpen} className="mt-1 inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-zinc-700">
        <Plus className="h-3 w-3" /> {simulate ? 'Add hypothetical' : 'Add'}
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Input value={name} onChange={setName} placeholder="Name" className="min-w-[120px] flex-1" />
      <Input value={score} onChange={setScore} placeholder="Score" type="number" className="w-20" />
      <Input value={max} onChange={setMax} placeholder="Max" type="number" className="w-20" />
      <Button size="sm" onClick={onSubmit}>Add</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

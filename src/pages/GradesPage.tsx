import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, SUBJECT_MAP, EX_BREAKDOWN, NUM_TERMS, type Assessment, type SubjectKey, type ComponentType, type ExType } from '@/lib/types';
import { computeTermGrade, computeFinalGrade, componentPercentage, exComponentPercentage } from '@/lib/gradeUtils';
import { PageHeader } from '@/components/kit';
import ScientificCalculator from '@/components/ScientificCalculator';
import { onDataChanged } from '@/lib/assistant/sync';
import { MotionCollapse } from '@/components/MotionUI';
import { Calculator, ChevronRight, TrendingUp } from 'lucide-react';
import {
  COMPONENT_LABELS, COMPONENT_SHORT, EX_LABELS, PASSING, PILL, PILL_ON, PILL_OFF,
  type Hypo, ringLabel, asInt, hypoAsAssessments, neededOnRemaining,
  TermSparkWide, TermTrendLine, GradeRing, ItemRow, AddRow, VolatilityMeter,
} from '@/pages/gradesKit';

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
  const termValues = [1, 2, 3].map((t) => computeTermGrade(selectedSubject, t, assessments));

  const subjectAssessments = merged.filter(
    (a) => a.subject_key === selectedSubject && a.quarter === selectedTerm,
  );

  const termSeries = SUBJECTS.map((s) => ({
    key: s.key,
    name: s.shortName,
    terms: [1, 2, 3].map((t) => computeTermGrade(s.key, t, assessments)),
    current: computeTermGrade(s.key, selectedTerm, assessments),
    final: computeFinalGrade(s.key, assessments),
  }));
  const ranked = termSeries.filter((s) => s.current !== null).sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
  const highest = ranked[0] ?? null;
  const lowest = ranked.length ? ranked[ranked.length - 1] : null;
  const atRisk = termSeries.filter((s) => s.current !== null && (s.current as number) < PASSING);
  const watch = termSeries.filter((s) => s.current !== null && (s.current as number) >= PASSING && (s.current as number) < 80);
  const needed = neededOnRemaining(selectedSubject, selectedTerm, merged, shownTerm);

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
      <PageHeader
        title="Grades"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSimulate((v) => !v)}
              className={`${PILL} inline-flex items-center gap-1.5 ${simulate ? PILL_ON : PILL_OFF}`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              {simulate ? 'Simulating' : 'Simulate'}
            </button>
            <button
              type="button"
              onClick={() => setShowCalc((v) => !v)}
              className={`${PILL} inline-flex items-center gap-1.5 ${showCalc ? PILL_ON : PILL_OFF}`}
            >
              <Calculator className="h-3.5 w-3.5" />
              Calculator
            </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {Array.from({ length: NUM_TERMS }, (_, i) => i + 1).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedTerm(t)}
            className={`${PILL} ${selectedTerm === t ? PILL_ON : PILL_OFF}`}
          >
            Term {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200/70 lg:col-span-5">
          <TermTrendLine values={termValues} />
          <p className="mt-2 text-[12px] text-zinc-400">{subject.shortName}</p>
          <div className="mt-1 flex items-center gap-3">
            <GradeRing
              value={asInt(shownTerm)}
              caption={simulate ? 'projected' : 'term grade'}
              chip={ringChip}
              dashed={simulate}
            />
            <VolatilityMeter values={termValues} />
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <div className="flex-1 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200/70">
            <p className="text-[11px] text-zinc-400">Final grade</p>
            <motion.p
              key={asInt(finalGrade) ?? 'none'}
              className="mt-2 text-[36px] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums"
              initial={{ opacity: 0.4, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
            >
              {asInt(finalGrade) ?? '—'}
            </motion.p>
            <div className="mt-4 space-y-2">
              {Array.from({ length: NUM_TERMS }, (_, i) => i + 1).map((t) => {
                const tg = computeTermGrade(selectedSubject, t, assessments);
                return (
                  <div key={t} className="flex items-center justify-between text-[13px]">
                    <span className="text-zinc-400">T{t}</span>
                    <span className="tabular-nums text-zinc-700">{asInt(tg) ?? '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <motion.div
            key={`${simulate}-${needed.text}`}
            className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200/70"
            initial={{ opacity: 0.5, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <p className="text-[11px] text-zinc-400">To hit {needed.target}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-zinc-800">{needed.text}</p>
          </motion.div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-3">
          <div className="flex-1 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200/70">
            <p className="text-[11px] text-zinc-400">This term</p>
            <div className="mt-3 flex items-baseline justify-between gap-3 text-[14px]">
              <span className="text-zinc-500">Highest</span>
              <span className="tabular-nums text-zinc-800">{highest ? `${highest.name} ${asInt(highest.current)}` : '—'}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-[14px]">
              <span className="text-zinc-500">Lowest</span>
              <span className="tabular-nums text-zinc-800">{lowest ? `${lowest.name} ${asInt(lowest.current)}` : '—'}</span>
            </div>
          </div>
          <div className="flex-1 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200/70">
            <p className="text-[11px] text-zinc-400">Subjects at risk</p>
            {atRisk.length ? (
              <p className="mt-1.5 text-[14px] text-zinc-800">
                {atRisk.length} below {PASSING}: {atRisk.map((s) => s.name).join(', ')}
              </p>
            ) : watch.length ? (
              <p className="mt-1.5 text-[14px] text-zinc-600">None below {PASSING}. Watch: {watch.map((s) => s.name).join(', ')}</p>
            ) : (
              <p className="mt-1.5 text-[14px] text-zinc-600">None below {PASSING} this term.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-3 lg:grid-cols-12">
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/70 lg:col-span-5">
          <div className="space-y-3">
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
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(open ? null : comp);
                      if (open) setAdding(null);
                    }}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-5 items-center rounded bg-zinc-900 px-1.5 text-[10px] font-semibold tracking-wide text-white">{COMPONENT_SHORT[comp]}</span>
                      <span className="text-[13px] text-zinc-800">{COMPONENT_LABELS[comp]}</span>
                      <span className="text-[12px] text-zinc-400">{subject.weights[comp]}%</span>
                    </div>
                    <span className="shrink-0 text-[12px] text-zinc-400">{allItems.length}</span>
                  </button>
                  <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-zinc-100">
                    <div className="relative h-full">
                      <motion.div
                        className="h-full bg-zinc-900"
                        initial={false}
                        animate={{ width: `${Math.min(100, realItems.length ? realPct : 0)}%` }}
                        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                      />
                      {simulate && shownPct > realPct ? (
                        <motion.div
                          className="absolute top-0 h-full border-y border-dashed border-zinc-400 bg-zinc-300/40"
                          initial={false}
                          animate={{ left: `${Math.min(100, realPct)}%`, width: `${Math.min(100 - realPct, shownPct - realPct)}%` }}
                          transition={{ duration: 0.4 }}
                        />
                      ) : null}
                    </div>
                  </div>
                  <MotionCollapse open={open}>
                    <div className="mt-2 space-y-1.5">
                      {comp === 'ex' ? (Object.keys(EX_LABELS) as ExType[]).map((exType) => {
                        const exItems = allItems.filter((a) => a.ex_type === exType);
                        const exPct = exComponentPercentage(subjectAssessments, exType);
                        return (
                          <div key={exType} className="rounded-lg bg-zinc-50 px-2.5 py-1.5">
                            <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                              <span>{EX_LABELS[exType]} · {EX_BREAKDOWN[exType]}%</span>
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
                  </MotionCollapse>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 lg:col-span-7">
          <p className="px-4 pt-2.5 text-[11px] text-zinc-400">All subjects</p>
          <div className="mt-1">
            {termSeries.map((s) => {
              const active = selectedSubject === s.key;
              const prev = s.terms.filter((g): g is number => g !== null);
              const trend = prev.length >= 2 ? Math.round(prev[prev.length - 1] - prev[prev.length - 2]) : 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelectedSubject(s.key)}
                  className={`w-full border-t border-zinc-100 px-4 py-1.5 text-left first:border-t-0 ${
                    active ? 'bg-zinc-50/80' : 'hover:bg-zinc-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.current === null ? 'bg-zinc-300' : s.current < PASSING ? 'bg-zinc-400' : 'bg-zinc-900'}`} />
                    <span className="w-16 shrink-0 truncate text-[13px] text-zinc-800">{s.name}</span>
                    <span className="min-w-0 flex-1">
                      <TermSparkWide values={s.terms} />
                    </span>
                    <span className="inline-flex w-8 items-center justify-end text-[11px] tabular-nums text-zinc-400">
                      {s.final === null ? '—' : trend > 0 ? `↗${trend}` : trend < 0 ? `↘${Math.abs(trend)}` : '—'}
                    </span>
                    <span className="w-7 text-right text-[13px] tabular-nums text-zinc-800">{asInt(s.final) ?? '—'}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
                  </div>
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

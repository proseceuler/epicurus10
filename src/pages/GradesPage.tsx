import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, SUBJECT_MAP, EX_BREAKDOWN, NUM_TERMS, type Assessment, type SubjectKey, type ComponentType, type ExType } from '@/lib/types';
import { computeTermGrade, computeFinalGrade, componentPercentage, exComponentPercentage, transmuteGrade } from '@/lib/gradeUtils';
import { Button, Input, PageHeader } from '@/components/kit';
import ScientificCalculator from '@/components/ScientificCalculator';
import { onDataChanged } from '@/lib/assistant/sync';
import { AnimatePresence, motion } from 'motion/react';
import { MotionCollapse } from '@/components/MotionUI';
import { Calculator, Plus, Trash2, ChevronRight, TrendingUp } from 'lucide-react';

const COMPONENT_LABELS: Record<ComponentType, string> = { ww: 'Written works', pt: 'Performance tasks', ex: 'Examinations' };
const COMPONENT_SHORT: Record<ComponentType, string> = { ww: 'WW', pt: 'PT', ex: 'EX' };
const EX_LABELS: Record<ExType, string> = { st1: 'Summative Test 1', st2: 'Summative Test 2', te: 'Term Examination' };
const PASSING = 75;
const DEFAULT_TARGET = 90;

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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  type FinanceSettings, type FinanceTransaction, type FinanceGoal,
  type ExpenseCategory, EXPENSE_CATEGORIES,
} from '@/lib/types';
import { Card, PageHeader, Button, Input, Select, EmptyState } from '@/components/kit';
import { Wallet, Plus, Trash2, Target, TrendingDown, PiggyBank, ArrowRight, TrendingUp, ExternalLink } from 'lucide-react';

function normalizeGoalUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function faviconFor(url?: string | null): string | null {
  const href = url ? normalizeGoalUrl(url) : null;
  if (!href) return null;
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(href).hostname}&sz=32`;
  } catch {
    return null;
  }
}

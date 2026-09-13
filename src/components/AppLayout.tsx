import { useState, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import GlobalDock from '@/components/GlobalDock';
import GlobalAssistant from '@/components/GlobalAssistant';
import { fadeMotion, motionTransition } from '@/lib/motion';
import { getXP, xpForNextLevel } from '@/lib/xp';
import { getShortcuts, matchShortcut, type ShortcutMap } from '@/lib/shortcuts';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, Calculator, FolderTree, SquareCheck as CheckSquare, Calendar,
  Timer, CalendarHeart, StickyNote, Wallet, Menu, X,
  Layers, Bot, Settings as SettingsIcon, Columns3, Cloud, FunctionSquare,
} from 'lucide-react';

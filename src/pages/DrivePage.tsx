import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Folder,
  FileText,
  Film,
  Music,
  Code2,
  Search,
  Plus,
  LayoutGrid,
  List,
  MoreVertical,
  Download,
  Trash2,
  Upload,
  ChevronRight,
  ChevronLeft,
  X,
  RefreshCw,
  FolderPlus,
  FilePlus,
  FolderUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Info,
  Rows3,
} from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MotionOverlay } from '@/components/MotionUI';
import {
  type DriveItem,
  type ViewMode,
  type Density,
  type NewMode,
  formatSize,
  formatDate,
  previewKind,
  iconFor,
  middleTruncate,
  parentPrefix,
  fetchSignedUrl,
  GridThumb,
  SkeletonGrid,
} from './driveKit';

// Full page is large — load from assembled parts if present, else show message.
// TEMP: re-export approach replaced by full file in next commits.
export { default } from './DrivePage.impl';

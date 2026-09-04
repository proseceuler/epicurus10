import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type ClassHub, type ClassHubLink, type TimetableEntry, type ClassAttendance, type SubjectKey } from '@/lib/types';
import { Card, Button, Input, Select, EmptyState, Badge } from '@/components/kit';
import { FolderTree, Plus, Trash2, Link2, Clock, MapPin, User, Save, ExternalLink, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SCHOOL_DAYS = [1, 2, 3, 4, 5];

export default function ClassHubPage() {
  return (
    <div className="space-y-8 pb-16">
      <ClassInfoTab />
      <TimetableTab />
    </div>
  );
}

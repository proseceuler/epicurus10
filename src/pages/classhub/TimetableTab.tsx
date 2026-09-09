import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { addCalendarEvent, getCalendarEvents, deleteCalendarEvent } from '@/lib/calendarStore';
import { SUBJECTS, type TimetableEntry, type ClassAttendance, type SubjectKey } from '@/lib/types';
import { Card, Button, Input, Select, EmptyState, Badge } from '@/components/kit';
import { Plus, Trash2, Clock, MapPin, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SCHOOL_DAYS = [1, 2, 3, 4, 5];

async function syncTimetableToCalendar(entries: TimetableEntry[]) {
  const subjects = Object.fromEntries(SUBJECTS.map((s) => [s.key, s]));
  const existing = getCalendarEvents().filter((e) => (e.description || '').includes('epicure:timetable'));
  for (const e of existing) deleteCalendarEvent(e.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let w = 0; w < 4; w++) {
    for (const entry of entries) {
      const d = new Date(today);
      const day = d.getDay();
      const delta = (entry.day_of_week - day + 7) % 7;
      d.setDate(d.getDate() + delta + w * 7);
      if (d < today) continue;
      const iso = d.toLocaleDateString('en-CA');
      const sub = subjects[entry.subject_key];
      addCalendarEvent({
        title: sub ? sub.shortName + ' class' : 'Class',
        description: 'epicure:timetable \u00b7 ' + (entry.room || 'Room TBA'),
        start_date: iso,
        end_date: iso,
        all_day: false,
        start_time: (entry.start_time || '08:00').slice(0, 5),
        end_time: (entry.end_time || '09:00').slice(0, 5),
        kind: 'event',
        subject_key: (entry.subject_key as SubjectKey) || null,
        linked_todo_id: null,
        linked_note_id: null,
        linked_habit_id: null,
        linked_kanban_id: null,
      });
    }
  }
}

export function TimetableTab() {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [attendance, setAttendance] = useState<ClassAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [newSubject, setNewSubject] = useState<SubjectKey>('math');
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState('08:00');
  const [newEnd, setNewEnd] = useState('09:00');
  const [newRoom, setNewRoom] = useState('');

  const loadData = useCallback(async () => {
    const [{ data: entryData }, { data: attData }] = await Promise.all([
      supabase.from('timetable_entries').select('*').order('day_of_week').order('start_time'),
      supabase.from('class_attendance').select('*'),
    ]);
    if (entryData) setEntries(entryData as TimetableEntry[]);
    if (attData) setAttendance(attData as ClassAttendance[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const weekStart = getWeekStart();
  const weekDates = SCHOOL_DAYS.map((dayIdx) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIdx);
    return { idx: dayIdx, date: d };
  });

  const entriesByDay = (day: number) => entries.filter((e) => e.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const addEntry = async () => {
    if (!newSubject || !newStart || !newEnd) return;
    const { data } = await supabase.from('timetable_entries').insert({
      subject_key: newSubject, day_of_week: newDay, start_time: newStart, end_time: newEnd, room: newRoom,
    }).select().single();
    if (data) setEntries([...entries, data as TimetableEntry]);
    setShowAddModal(false);
    setNewRoom('');
  };

  const updateEntry = async (id: string, updates: Partial<TimetableEntry>) => {
    await supabase.from('timetable_entries').update(updates).eq('id', id);
    setEntries(entries.map((e) => e.id === id ? { ...e, ...updates } : e));
  };

  const deleteEntry = async (id: string) => {
    await supabase.from('timetable_entries').delete().eq('id', id);
    setEntries(entries.filter((e) => e.id !== id));
  };

  const formatDateKey = (d: Date) => d.toISOString().split('T')[0];
  const getAttendanceFor = (entryId: string, date: Date) => attendance.find((a) => a.timetable_entry_id === entryId && a.class_date === formatDateKey(date));

  const markAttendance = async (entryId: string, date: Date, status: 'attended' | 'skipped') => {
    const dateKey = formatDateKey(date);
    const existing = getAttendanceFor(entryId, date);
    if (existing) {
      await supabase.from('class_attendance').update({ status }).eq('id', existing.id);
      setAttendance(attendance.map((a) => a.id === existing.id ? { ...a, status } : a));
    } else {
      const { data } = await supabase.from('class_attendance').insert({ timetable_entry_id: entryId, class_date: dateKey, status }).select().single();
      if (data) setAttendance([...attendance, data as ClassAttendance]);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Clock className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;

  return (
    <div id="timetable" className="scroll-mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-800">Timetable</h3>
          <button type="button" onClick={() => void syncTimetableToCalendar(entries)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50">Push to Calendar</button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(weekOffset - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(0)}>This Week</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(weekOffset + 1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4" /> Add Class</Button>
        </div>
      </div>
      {entries.length === 0 && !showAddModal ? (
        <Card className="p-6"><EmptyState icon={Clock} title="No classes scheduled" subtitle="Add your first class to build your weekly timetable." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {weekDates.map(({ idx, date }) => {
            const dayEntries = entriesByDay(idx);
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <Card key={idx} className={`p-4 ${isToday ? 'border-2 border-zinc-800' : ''}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-zinc-800">{DAYS[idx].slice(0, 3)}</p>
                    <p className="text-xs text-zinc-400">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  {isToday && <Badge tone="high">Today</Badge>}
                </div>
                {dayEntries.length === 0 ? <p className="py-4 text-center text-xs text-zinc-300">No classes</p> : (
                  <div className="space-y-2">
                    {dayEntries.map((entry) => {
                      const subject = SUBJECTS.find((s) => s.key === entry.subject_key);
                      const att = getAttendanceFor(entry.id, date);
                      return (
                        <div key={entry.id} className="rounded-xl glass border border-zinc-200/30 p-2.5">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-700">{subject?.shortName || entry.subject_key}</span>
                            {entry.room && <span className="flex items-center gap-0.5 text-xs text-zinc-400"><MapPin className="w-3 h-3" /> {entry.room}</span>}
                          </div>
                          <p className="mb-2 text-xs text-zinc-400">{entry.start_time} — {entry.end_time}</p>
                          <div className="flex items-center gap-1">
                            <button onClick={() => markAttendance(entry.id, date, 'attended')} className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1 text-xs font-medium ${att?.status === 'attended' ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-emerald-50'}`}><Check className="w-3 h-3" /> Attended</button>
                            <button onClick={() => markAttendance(entry.id, date, 'skipped')} className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1 text-xs font-medium ${att?.status === 'skipped' ? 'bg-red-500 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-red-50'}`}><X className="w-3 h-3" /> Skipped</button>
                          </div>
                          <button onClick={() => setEditingEntry(entry)} className="mt-1.5 w-full text-xs text-zinc-400 hover:text-zinc-600">Edit</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="glass glass-shadow-lg w-full max-w-md rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-semibold text-zinc-800">Add Class to Timetable</h3>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-zinc-500">Subject</label><Select value={newSubject} onChange={(v) => setNewSubject(v as SubjectKey)} options={SUBJECTS.map((s) => ({ value: s.key, label: s.name }))} /></div>
              <div><label className="mb-1 block text-xs font-medium text-zinc-500">Day</label><Select value={String(newDay)} onChange={(v) => setNewDay(parseInt(v))} options={SCHOOL_DAYS.map((d) => ({ value: String(d), label: DAYS[d] }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="mb-1 block text-xs font-medium text-zinc-500">Start Time</label><Input type="time" value={newStart} onChange={setNewStart} /></div>
                <div><label className="mb-1 block text-xs font-medium text-zinc-500">End Time</label><Input type="time" value={newEnd} onChange={setNewEnd} /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-zinc-500">Room</label><Input value={newRoom} onChange={setNewRoom} placeholder="e.g. Room 201" /></div>
              <div className="flex gap-2 pt-2"><Button onClick={addEntry}><Plus className="w-4 h-4" /> Add Class</Button><Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button></div>
            </div>
          </div>
        </div>
      )}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm" onClick={() => setEditingEntry(null)}>
          <div className="glass glass-shadow-lg w-full max-w-md rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-semibold text-zinc-800">Edit Class</h3>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-zinc-500">Start Time</label><Input type="time" value={editingEntry.start_time} onChange={(v) => setEditingEntry({ ...editingEntry, start_time: v })} /></div>
              <div><label className="mb-1 block text-xs font-medium text-zinc-500">End Time</label><Input type="time" value={editingEntry.end_time} onChange={(v) => setEditingEntry({ ...editingEntry, end_time: v })} /></div>
              <div><label className="mb-1 block text-xs font-medium text-zinc-500">Room</label><Input value={editingEntry.room} onChange={(v) => setEditingEntry({ ...editingEntry, room: v })} /></div>
              <div className="flex gap-2 pt-2">
                <Button onClick={async () => { await updateEntry(editingEntry.id, { start_time: editingEntry.start_time, end_time: editingEntry.end_time, room: editingEntry.room }); setEditingEntry(null); }}>Save</Button>
                <Button variant="danger" onClick={async () => { await deleteEntry(editingEntry.id); setEditingEntry(null); }}><Trash2 className="w-4 h-4" /> Delete</Button>
                <Button variant="ghost" onClick={() => setEditingEntry(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { addCalendarEvent, getCalendarEvents, deleteCalendarEvent } from '@/lib/calendarStore';
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


const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OFFICE_DAY_OPTS = [1, 2, 3, 4, 5];

function parseOfficeHours(raw: string): { days: number[]; start: string; end: string } {
  const days: number[] = [];
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  for (const [k, v] of Object.entries(map)) {
    if (new RegExp('\\b' + k, 'i').test(raw)) days.push(v);
  }
  const tm = raw.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  const pad = (s: string) => {
    const [h, m] = s.split(':');
    return String(h).padStart(2, '0') + ':' + String(m || '00').padStart(2, '0');
  };
  return {
    days: days.length ? days : [],
    start: tm ? pad(tm[1]) : '14:00',
    end: tm ? pad(tm[2]) : '15:00',
  };
}

function formatOfficeHours(days: number[], start: string, end: string) {
  if (!days.length) return '';
  const labels = days.slice().sort((a, b) => a - b).map((d) => DAY_SHORT[d]);
  return labels.join(', ') + ' ' + start + '\u2013' + end;
}

function ClassInfoTab() {
  const [hubs, setHubs] = useState<Record<string, ClassHub>>({});
  const [links, setLinks] = useState<ClassHubLink[]>([]);
  const [selected, setSelected] = useState<SubjectKey>('math');
  const [loading, setLoading] = useState(true);
  const [editForm, setEditForm] = useState({ teacher_name: '', office_hours: '', room: '', notes: '' });
  const [officeDays, setOfficeDays] = useState<number[]>([]);
  const [officeStart, setOfficeStart] = useState('14:00');
  const [officeEnd, setOfficeEnd] = useState('15:00');
  const [newLink, setNewLink] = useState({ title: '', url: '' });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const loadData = useCallback(async () => {
    const [{ data: hubData }, { data: linkData }] = await Promise.all([
      supabase.from('class_hub').select('*'),
      supabase.from('class_hub_links').select('*').order('created_at', { ascending: true }),
    ]);
    if (hubData) {
      const map: Record<string, ClassHub> = {};
      (hubData as ClassHub[]).forEach((h) => { map[h.subject_key] = h; });
      setHubs(map);
    }
    if (linkData) setLinks(linkData as ClassHubLink[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const hub = hubs[selected];
    setEditForm({
      teacher_name: hub?.teacher_name ?? '',
      office_hours: hub?.office_hours ?? '',
      room: hub?.room ?? '',
      notes: hub?.notes ?? '',
    });
    const parsed = parseOfficeHours(hub?.office_hours ?? '');
    setOfficeDays(parsed.days);
    setOfficeStart(parsed.start);
    setOfficeEnd(parsed.end);
    setDirty(false);
  }, [selected, hubs]);

  const subject = SUBJECTS.find((s) => s.key === selected)!;
  const subjectLinks = links.filter((l) => l.subject_key === selected);

  const saveHub = async (form = editForm) => {
    setSaving(true);
    const existing = hubs[selected];
    if (existing) {
      const { data } = await supabase
        .from('class_hub')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (data) setHubs({ ...hubs, [selected]: data as ClassHub });
    } else {
      const { data } = await supabase
        .from('class_hub')
        .insert({ subject_key: selected, ...form })
        .select()
        .single();
      if (data) setHubs({ ...hubs, [selected]: data as ClassHub });
    }
    setSaving(false);
    setDirty(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  const markField = (patch: Partial<typeof editForm>) => {
    setEditForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      void saveHub({
        ...editForm,
        office_hours: formatOfficeHours(officeDays, officeStart, officeEnd) || editForm.office_hours,
      });
    }, 700);
    return () => window.clearTimeout(t);
  }, [dirty, editForm, officeDays, officeStart, officeEnd]);

  const addLink = async () => {
    if (!newLink.title.trim() || !newLink.url.trim()) return;
    const { data } = await supabase
      .from('class_hub_links')
      .insert({ subject_key: selected, title: newLink.title.trim(), url: newLink.url.trim() })
      .select()
      .single();
    if (data) {
      setLinks([...links, data as ClassHubLink]);
      setNewLink({ title: '', url: '' });
    }
  };

  const deleteLink = async (id: string) => {
    await supabase.from('class_hub_links').delete().eq('id', id);
    setLinks(links.filter((l) => l.id !== id));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><FolderTree className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {SUBJECTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelected(s.key)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              selected === s.key ? 'bg-zinc-900 text-white border-zinc-900' : 'glass text-zinc-600 border-transparent glass-hover'
            }`}
          >
            {s.shortName}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold text-zinc-800">{subject.name} · Class Info</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1">
                <User className="w-3.5 h-3.5" /> Teacher Name
              </label>
              <Input value={editForm.teacher_name} onChange={(v) => markField({ teacher_name: v })} placeholder="e.g. Mrs. Reyes" />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1">
                <Clock className="w-3.5 h-3.5" /> Office Hours
              </label>
              <div className="mb-2 flex flex-wrap gap-1">
                {OFFICE_DAY_OPTS.map((d) => {
                  const on = officeDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setOfficeDays((prev) => {
                          const next = on ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b);
                          setDirty(true);
                          return next;
                        });
                      }}
                      className={`rounded-lg px-2 py-1 text-[11px] font-medium ${on ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                    >
                      {DAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input type="time" value={officeStart} onChange={(e) => { setOfficeStart(e.target.value); setDirty(true); }} className="glass-input rounded-xl px-2 py-1.5 text-sm" />
                <span className="text-xs text-zinc-400">to</span>
                <input type="time" value={officeEnd} onChange={(e) => { setOfficeEnd(e.target.value); setDirty(true); }} className="glass-input rounded-xl px-2 py-1.5 text-sm" />
              </div>
              {officeDays.length > 0 && (
                <p className="mt-1 text-[10px] text-zinc-400">{formatOfficeHours(officeDays, officeStart, officeEnd)}</p>
              )}
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1">
                <MapPin className="w-3.5 h-3.5" /> Room
              </label>
              <Input value={editForm.room} onChange={(v) => markField({ room: v })} placeholder="e.g. Room 204" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => markField({ notes: e.target.value })}
                rows={3}
                placeholder="Any extra notes about this class..."
                className="w-full px-3 py-2 glass-input rounded-xl text-sm text-zinc-800 placeholder-zinc-400 resize-none"
              />
            </div>
            <div className="flex min-h-[28px] items-center justify-between gap-2">
              <a href="#timetable" className="text-[11px] text-zinc-500 hover:text-zinc-800">→ Timetable</a>
              <div className="flex items-center gap-2">
                {dirty && (
                  <button
                    type="button"
                    onClick={() =>
                      void saveHub({
                        ...editForm,
                        office_hours: formatOfficeHours(officeDays, officeStart, officeEnd) || editForm.office_hours,
                      })
                    }
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white"
                  >
                    <Save className="h-3.5 w-3.5" /> {saving ? '…' : 'Save'}
                  </button>
                )}
                {savedFlash && !dirty && <span className="text-[11px] text-emerald-600">Saved</span>}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-zinc-200 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-zinc-700" />
            </div>
            <h3 className="font-semibold text-zinc-800">Quick Links</h3>
          </div>

          <div className="flex gap-2 mb-4">
            <Input value={newLink.title} onChange={(v) => setNewLink({ ...newLink, title: v })} placeholder="Link title" className="flex-1" />
            <Input value={newLink.url} onChange={(v) => setNewLink({ ...newLink, url: v })} placeholder="https://..." className="flex-1" />
            <Button onClick={addLink} size="sm"><Plus className="w-3.5 h-3.5" /></Button>
          </div>

          {subjectLinks.length === 0 ? (
            <EmptyState icon={Link2} title="No links yet" subtitle="Add links to course materials, Google Classroom, etc." />
          ) : (
            <div className="space-y-2">
              {subjectLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-2 group p-2 rounded-lg hover:bg-white/40 transition-colors">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {link.title}
                  </a>
                  <button onClick={() => deleteLink(link.id)} className="text-zinc-300 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}


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
        description: 'epicure:timetable · ' + (entry.room || 'Room TBA'),
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

function TimetableTab() {
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

  useEffect(() => { loadData(); }, [loadData]);

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
      subject_key: newSubject,
      day_of_week: newDay,
      start_time: newStart,
      end_time: newEnd,
      room: newRoom,
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

  const getAttendanceFor = (entryId: string, date: Date) => {
    return attendance.find((a) => a.timetable_entry_id === entryId && a.class_date === formatDateKey(date));
  };

  const markAttendance = async (entryId: string, date: Date, status: 'attended' | 'skipped') => {
    const dateKey = formatDateKey(date);
    const existing = getAttendanceFor(entryId, date);
    if (existing) {
      await supabase.from('class_attendance').update({ status }).eq('id', existing.id);
      setAttendance(attendance.map((a) => a.id === existing.id ? { ...a, status } : a));
    } else {
      const { data } = await supabase.from('class_attendance').insert({
        timetable_entry_id: entryId,
        class_date: dateKey,
        status,
      }).select().single();
      if (data) setAttendance([...attendance, data as ClassAttendance]);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Clock className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  return (
    <div id="timetable" >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-zinc-800">Timetable</h3><button type="button" onClick={() => void syncTimetableToCalendar(entries)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50">Push to Calendar</button></div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(weekOffset - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(0)}>This Week</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(weekOffset + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4" /> Add Class</Button>
        </div>
      </div>

      {entries.length === 0 && !showAddModal ? (
        <Card className="p-6">
          <EmptyState icon={Clock} title="No classes scheduled" subtitle="Add your first class to build your weekly timetable." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {weekDates.map(({ idx, date }) => {
            const dayEntries = entriesByDay(idx);
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <Card key={idx} className={`p-4 ${isToday ? 'border-2 border-zinc-800' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-zinc-800">{DAYS[idx].slice(0, 3)}</p>
                    <p className="text-xs text-zinc-400">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  {isToday && <Badge tone="high">Today</Badge>}
                </div>

                {dayEntries.length === 0 ? (
                  <p className="text-xs text-zinc-300 py-4 text-center">No classes</p>
                ) : (
                  <div className="space-y-2">
                    {dayEntries.map((entry) => {
                      const subject = SUBJECTS.find((s) => s.key === entry.subject_key);
                      const att = getAttendanceFor(entry.id, date);
                      return (
                        <div key={entry.id} className="p-2.5 rounded-xl glass border border-zinc-200/30">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-zinc-700">{subject?.shortName || entry.subject_key}</span>
                            {entry.room && (
                              <span className="flex items-center gap-0.5 text-xs text-zinc-400">
                                <MapPin className="w-3 h-3" /> {entry.room}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 mb-2">{entry.start_time} — {entry.end_time}</p>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => markAttendance(entry.id, date, 'attended')}
                              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-xs font-medium transition-all ${
                                att?.status === 'attended' ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-emerald-50'
                              }`}
                            >
                              <Check className="w-3 h-3" /> Attended
                            </button>
                            <button
                              onClick={() => markAttendance(entry.id, date, 'skipped')}
                              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-xs font-medium transition-all ${
                                att?.status === 'skipped' ? 'bg-red-500 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-red-50'
                              }`}
                            >
                              <X className="w-3 h-3" /> Skipped
                            </button>
                          </div>

                          <button
                            onClick={() => setEditingEntry(entry)}
                            className="w-full text-xs text-zinc-400 hover:text-zinc-600 mt-1.5"
                          >
                            Edit
                          </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/30 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="glass glass-shadow-lg rounded-3xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-zinc-800 mb-4">Add Class to Timetable</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Subject</label>
                <Select value={newSubject} onChange={(v) => setNewSubject(v as SubjectKey)} options={SUBJECTS.map((s) => ({ value: s.key, label: s.name }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Day</label>
                <Select value={String(newDay)} onChange={(v) => setNewDay(parseInt(v))} options={SCHOOL_DAYS.map((d) => ({ value: String(d), label: DAYS[d] }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Start Time</label>
                  <Input type="time" value={newStart} onChange={setNewStart} />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">End Time</label>
                  <Input type="time" value={newEnd} onChange={setNewEnd} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Room</label>
                <Input value={newRoom} onChange={setNewRoom} placeholder="e.g. Room 201" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={addEntry}><Plus className="w-4 h-4" /> Add Class</Button>
                <Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/30 backdrop-blur-sm" onClick={() => setEditingEntry(null)}>
          <div className="glass glass-shadow-lg rounded-3xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-zinc-800 mb-4">Edit Class</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Start Time</label>
                <Input type="time" value={editingEntry.start_time} onChange={(v) => setEditingEntry({ ...editingEntry, start_time: v })} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">End Time</label>
                <Input type="time" value={editingEntry.end_time} onChange={(v) => setEditingEntry({ ...editingEntry, end_time: v })} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Room</label>
                <Input value={editingEntry.room} onChange={(v) => setEditingEntry({ ...editingEntry, room: v })} />
              </div>
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

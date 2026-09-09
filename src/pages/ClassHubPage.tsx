import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type ClassHub, type ClassHubLink, type SubjectKey } from '@/lib/types';
import { Card, Button, Input, EmptyState, TimeField } from '@/components/kit';
import { FolderTree, Plus, Trash2, Link2, Clock, MapPin, User, Save, ExternalLink } from 'lucide-react';
import { TimetableTab } from '@/pages/classhub/TimetableTab';

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
  const tm = raw.match(/(\d{1,2}:\d{2})\s*[-\u2013\u2014]\s*(\d{1,2}:\d{2})/);
  const pad = (s: string) => {
    const [h, m] = s.split(':');
    return String(h).padStart(2, '0') + ':' + String(m || '00').padStart(2, '0');
  };
  return { days: days.length ? days : [], start: tm ? pad(tm[1]) : '14:00', end: tm ? pad(tm[2]) : '15:00' };
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

  useEffect(() => { void loadData(); }, [loadData]);

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
      const { data } = await supabase.from('class_hub').update({ ...form, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single();
      if (data) setHubs({ ...hubs, [selected]: data as ClassHub });
    } else {
      const { data } = await supabase.from('class_hub').insert({ subject_key: selected, ...form }).select().single();
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
      void saveHub({ ...editForm, office_hours: formatOfficeHours(officeDays, officeStart, officeEnd) || editForm.office_hours });
    }, 700);
    return () => window.clearTimeout(t);
  }, [dirty, editForm, officeDays, officeStart, officeEnd]);

  const addLink = async () => {
    if (!newLink.title.trim() || !newLink.url.trim()) return;
    const { data } = await supabase.from('class_hub_links').insert({ subject_key: selected, title: newLink.title.trim(), url: newLink.url.trim() }).select().single();
    if (data) { setLinks([...links, data as ClassHubLink]); setNewLink({ title: '', url: '' }); }
  };

  const deleteLink = async (id: string) => {
    await supabase.from('class_hub_links').delete().eq('id', id);
    setLinks(links.filter((l) => l.id !== id));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><FolderTree className="w-8 h-8 animate-pulse text-zinc-300" /></div>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {SUBJECTS.map((s) => (
          <button key={s.key} onClick={() => setSelected(s.key)} className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-all ${selected === s.key ? 'border-zinc-900 bg-zinc-900 text-white' : 'glass border-transparent text-zinc-600 glass-hover'}`}>{s.shortName}</button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900"><User className="h-4 w-4 text-white" /></div>
            <h3 className="font-semibold text-zinc-800">{subject.name} \u00b7 Class Info</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500"><User className="h-3.5 w-3.5" /> Teacher Name</label>
              <Input value={editForm.teacher_name} onChange={(v) => markField({ teacher_name: v })} placeholder="e.g. Mrs. Reyes" />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500"><Clock className="h-3.5 w-3.5" /> Office Hours</label>
              <div className="mb-2 flex flex-wrap gap-1">
                {OFFICE_DAY_OPTS.map((d) => {
                  const on = officeDays.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => { setOfficeDays((prev) => { const next = on ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b); setDirty(true); return next; }); }} className={`rounded-lg px-2 py-1 text-[11px] font-medium ${on ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{DAY_SHORT[d]}</button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <TimeField value={officeStart} onChange={(v) => { setOfficeStart(v); setDirty(true); }} className="w-[9.5rem]" />
                <span className="text-xs text-zinc-400">to</span>
                <TimeField value={officeEnd} onChange={(v) => { setOfficeEnd(v); setDirty(true); }} className="w-[9.5rem]" />
              </div>
              {officeDays.length > 0 && <p className="mt-1 text-[10px] text-zinc-400">{formatOfficeHours(officeDays, officeStart, officeEnd)}</p>}
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500"><MapPin className="h-3.5 w-3.5" /> Room</label>
              <Input value={editForm.room} onChange={(v) => markField({ room: v })} placeholder="e.g. Room 204" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Notes</label>
              <textarea value={editForm.notes} onChange={(e) => markField({ notes: e.target.value })} rows={3} placeholder="Any extra notes about this class..." className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400" />
            </div>
            <div className="flex min-h-[28px] items-center justify-between gap-2">
              <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-800" onClick={() => { const el = document.getElementById('timetable'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>→ Timetable</button>
              <div className="flex items-center gap-2">
                {dirty && <button type="button" onClick={() => void saveHub({ ...editForm, office_hours: formatOfficeHours(officeDays, officeStart, officeEnd) || editForm.office_hours })} disabled={saving} className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white"><Save className="h-3.5 w-3.5" /> {saving ? '\u2026' : 'Save'}</button>}
                {savedFlash && !dirty && <span className="text-[11px] text-emerald-600">Saved</span>}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-200"><Link2 className="h-4 w-4 text-zinc-700" /></div>
            <h3 className="font-semibold text-zinc-800">Quick Links</h3>
          </div>
          <div className="mb-4 flex gap-2">
            <Input value={newLink.title} onChange={(v) => setNewLink({ ...newLink, title: v })} placeholder="Link title" className="flex-1" />
            <Input value={newLink.url} onChange={(v) => setNewLink({ ...newLink, url: v })} placeholder="https://..." className="flex-1" />
            <Button onClick={addLink} size="sm"><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          {subjectLinks.length === 0 ? (
            <EmptyState icon={Link2} title="No links yet" subtitle="Add links to course materials, Google Classroom, etc." />
          ) : (
            <div className="space-y-2">
              {subjectLinks.map((link) => (
                <div key={link.id} className="group flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/40">
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"><ExternalLink className="h-3.5 w-3.5" />{link.title}</a>
                  <button onClick={() => deleteLink(link.id)} className="text-zinc-300 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

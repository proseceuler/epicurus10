const KEY = 'epicure-arrodes-memory';
const MAX = 24;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean).slice(-MAX) : [];
  } catch {
    return [];
  }
}

function write(facts: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(facts.slice(-MAX))); } catch { /* quota */ }
}

export function loadMemory(): string[] {
  return read();
}

export function memoryBlock(): string {
  const facts = read();
  if (!facts.length) return '';
  return `Things you already know about this student (use them; do not re-ask):\n- ${facts.join('\n- ')}`;
}

export function rememberFact(fact: string) {
  const t = fact.replace(/\s+/g, ' ').trim();
  if (t.length < 4 || t.length > 160) return;
  const cur = read().filter((f) => f.toLowerCase() !== t.toLowerCase());
  cur.push(t);
  write(cur);
}

export function harvestMemory(userText: string, assistantText = '') {
  const blob = `${userText}\n${assistantText}`.replace(/\s+/g, ' ').trim();
  if (!blob) return;
  const lines: string[] = [];
  const remember = blob.match(/(?:remember(?: that)?|don't forget|note that)\s*[:\-–]?\s*(.{8,120})/i);
  if (remember?.[1]) lines.push(remember[1].replace(/[.?!]+$/, ''));
  const name = blob.match(/\b(?:my name is|i'm|i am)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)/);
  if (name?.[1] && !/^(going|doing|just|not|the|a)\b/i.test(name[1])) lines.push(`Name: ${name[1]}`);
  const grade = blob.match(/\b(?:i'm in|i am in|grade)\s*(grade\s*)?(\d{1,2})\b/i);
  if (grade?.[2]) lines.push(`Grade ${grade[2]}`);
  const likes = blob.match(/\b(?:i (?:like|love|prefer|hate|need to))\s+(.{6,80})/i);
  if (likes?.[0]) lines.push(likes[0].replace(/[.?!]+$/, ''));
  for (const line of lines) rememberFact(line);
}

export interface ParsedWhen {
  title: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toHm(h: number, m: number) {
  return `${pad(Math.min(23, Math.max(0, h)))}:${pad(Math.min(59, Math.max(0, m)))}`;
}

function parseClock(hRaw: string, mRaw: string | undefined, mer: string | undefined) {
  let h = Number(hRaw);
  const m = mRaw ? Number(mRaw) : 0;
  const merL = (mer || '').toLowerCase();
  if (merL === 'pm' && h < 12) h += 12;
  if (merL === 'am' && h === 12) h = 0;
  return toHm(h, m);
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function nextWeekday(from: Date, target: number) {
  const d = new Date(from);
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function parseNaturalWhen(input: string, now = new Date()): ParsedWhen {
  let text = input.trim();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let date = new Date(today);
  let allDay = true;
  let startTime: string | null = null;
  let endTime: string | null = null;

  const timeRange = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  );
  if (timeRange) {
    const mer2 = timeRange[6] || timeRange[3];
    startTime = parseClock(timeRange[1], timeRange[2], timeRange[3] || mer2);
    endTime = parseClock(timeRange[4], timeRange[5], mer2);
    allDay = false;
    text = text.replace(timeRange[0], ' ');
  } else {
    const oneTime = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (oneTime) {
      startTime = parseClock(oneTime[1], oneTime[2], oneTime[3]);
      const [h, m] = startTime.split(':').map(Number);
      const endH = Math.min(23, h + 1);
      endTime = toHm(endH, m);
      allDay = false;
      text = text.replace(oneTime[0], ' ');
    }
  }

  if (/\btomorrow\b/i.test(text)) {
    date.setDate(date.getDate() + 1);
    text = text.replace(/\btomorrow\b/i, ' ');
  } else if (/\btoday\b/i.test(text)) {
    text = text.replace(/\btoday\b/i, ' ');
  } else {
    const wd = text.match(/\b(?:on\s+)?(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (wd) {
      const target = WEEKDAYS.indexOf(wd[2].toLowerCase());
      date = nextWeekday(today, target);
      if (!wd[1] && date.getDay() === today.getDay()) date = new Date(today);
      text = text.replace(wd[0], ' ');
    } else {
      const named = text.match(/\b(?:on\s+)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/);
      if (named && MONTHS[named[1].toLowerCase()] !== undefined) {
        const month = MONTHS[named[1].toLowerCase()];
        const day = Number(named[2]);
        const year = named[3] ? Number(named[3]) : today.getFullYear();
        date = new Date(year, month, day);
        if (!named[3] && date < today) date.setFullYear(year + 1);
        text = text.replace(named[0], ' ');
      } else {
        const slash = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
        if (slash) {
          const a = Number(slash[1]);
          const b = Number(slash[2]);
          const year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : today.getFullYear();
          date = new Date(year, a - 1, b);
          text = text.replace(slash[0], ' ');
        }
      }
    }
  }

  text = text.replace(/\b(on|at|from|until|to)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const title = text || input.trim();
  const start = iso(date);
  return {
    title,
    start_date: start,
    end_date: start,
    all_day: allDay,
    start_time: startTime,
    end_time: endTime,
  };
}

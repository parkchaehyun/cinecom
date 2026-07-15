// Title parser for 씨네꼼 reservation posts.
// Pattern-extraction (not slash-splitting): titles swap field order and omit fields.
import type { ParsedSlot, RawRoom } from "../types";

const ROOM_RE = /(대상영실|소상영실|상영실|꼼방)/;
const DATE_RE = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const TIME_HINT = /\d{1,2}\s*[:시]/;
const WEEKDAY: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

export interface ParseResult {
  isReservation: boolean;
  slots: ParsedSlot[];
}

// Content-based classifier: a post is a reservation if it names a room, a date, and a time.
export function isReservation(subject: string): boolean {
  return ROOM_RE.test(subject) && DATE_RE.test(subject) && TIME_HINT.test(subject);
}

export function parseTitle(subject: string, writeTs: number): ParseResult {
  if (!isReservation(subject)) return { isReservation: false, slots: [] };

  const canceled = /\(?\s*취소\s*\)?/.test(subject);
  // Strip (취소)/(수정) markers before field extraction; keep `canceled` from above.
  const cleaned = subject.replace(/\(?\s*(?:취소|수정)\s*\)?/g, " ").trim();

  const dm = cleaned.match(DATE_RE)!;
  const month = Number(dm[1]);
  const day = Number(dm[2]);
  const { year, weekdayOk } = inferYear(month, day, writeTs, cleaned);
  const date = ymd(year, month, day);

  const room = cleaned.match(ROOM_RE)![1] as RawRoom;
  // Only bare "상영실" is genuinely ambiguous (대? 소?); 꼼방 is a definite non-theater room.
  const ambiguousRoom = room === "상영실";

  let confidence = 1;
  if (!weekdayOk) confidence *= 0.85;

  const { person, movie } = extractPersonMovie(cleaned);
  const ranges = extractRanges(cleaned);

  if (ranges.length === 0) {
    return {
      isReservation: true,
      slots: [
        { room, date, startMin: NaN, endMin: NaN, movie, person, canceled, needsReview: true, confidence: 0.3 },
      ],
    };
  }

  const slots = ranges.map<ParsedSlot>((r) => ({
    room,
    date,
    startMin: r.startMin,
    endMin: r.endMin,
    movie,
    person,
    canceled,
    needsReview: ambiguousRoom || r.needsReview,
    confidence: r.needsReview ? Math.min(confidence, 0.4) : ambiguousRoom ? Math.min(confidence, 0.7) : confidence,
  }));
  return { isReservation: true, slots };
}

// --- helpers ---

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// No year in titles → pick the year making the showing nearest to (and preferably after) the post date.
function inferYear(month: number, day: number, writeTs: number, cleaned: string) {
  const wy = new Date(writeTs).getFullYear();
  const cands = [wy - 1, wy, wy + 1].map((y) => ({ y, t: new Date(y, month - 1, day).getTime() }));
  // Pick the year whose showing date is nearest the post date (handles year boundaries naturally).
  const chosen = cands.sort((a, b) => Math.abs(a.t - writeTs) - Math.abs(b.t - writeTs))[0];

  const token = weekdayToken(cleaned);
  const actual = new Date(chosen.y, month - 1, day).getDay();
  return { year: chosen.y, weekdayOk: token === null || token === actual };
}

function weekdayToken(s: string): number | null {
  let m = s.match(/([일월화수목금토])\s*요일/);
  if (!m) m = s.match(/\d{1,2}\s*일\s*([월화수목금토일])(?![가-힣])/);
  return m ? WEEKDAY[m[1]] : null;
}

// Normalize Korean times to HH:MM and unify separators.
function normalizeTimes(s: string): string {
  return s
    .replace(/(\d{1,2})\s*시\s*(\d{1,2})\s*분/g, "$1:$2")
    .replace(/(\d{1,2})\s*시\s*반/g, "$1:30")
    .replace(/(\d{1,2})\s*시/g, "$1:00")
    .replace(/[~–—]/g, "-")
    .replace(/-{2,}/g, "-");
}

const RANGE_RE = /(\d{1,2})(?::(\d{1,2}))?\s*-\s*(\d{1,2})(?::(\d{1,2}))?/g;
const SINGLE_RE = /(\d{1,2}):(\d{1,2})/;

interface Range {
  startMin: number;
  endMin: number;
  needsReview: boolean;
}

function extractRanges(cleaned: string): Range[] {
  const t = normalizeTimes(cleaned);
  const out: Range[] = [];
  for (const m of t.matchAll(RANGE_RE)) {
    const sh = Number(m[1]);
    const sm = m[2] ? Number(m[2]) : 0;
    const eh = Number(m[3]);
    const em = m[4] ? Number(m[4]) : 0;
    if (sh > 30 || eh > 30 || sm > 59 || em > 59) continue;
    let start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end <= start) end += 1440; // overnight (e.g., 23:00-1:00)
    out.push({ startMin: start, endMin: end, needsReview: false });
  }
  if (out.length) return out;

  // No range → a lone time (missing/unknown endpoint): keep but flag for review.
  const sm = t.match(SINGLE_RE);
  if (sm) {
    const h = Number(sm[1]);
    const mm = Number(sm[2]);
    if (h <= 30 && mm <= 59) {
      const start = h * 60 + mm;
      return [{ startMin: start, endMin: start, needsReview: true }];
    }
  }
  return [];
}

// Person/movie = the slash-fields that aren't date, room, or time.
function extractPersonMovie(cleaned: string): { person: string | null; movie: string | null } {
  const fields = cleaned
    .split("/")
    .map((f) => f.trim())
    .filter(Boolean);
  const rest = fields.filter((f) => {
    if (DATE_RE.test(f) || ROOM_RE.test(f)) return false;
    const n = normalizeTimes(f);
    if (/\d{1,2}:\d{1,2}/.test(n) || /^\d{1,2}(?::\d{1,2})?\s*-/.test(n)) return false;
    return true;
  });

  let person: string | null = null;
  let movie: string | null = null;
  if (rest.length >= 2) {
    person = rest[0];
    movie = rest[rest.length - 1];
  } else if (rest.length === 1) {
    movie = rest[0];
  }
  if (movie === "미정") movie = null;
  return { person, movie };
}

// KST (Asia/Seoul) calendar helpers. The DB stores plain KST dates, and the server may run in UTC,
// so "today" must be computed in KST — never from the host's local clock.
import type { DayInfo } from "./types";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayKST(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

const toUTC = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  return toISO(toUTC(iso) + n * DAY_MS);
}

/** Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const dow = new Date(toUTC(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

export function dayInfo(iso: string): DayInfo {
  const d = new Date(toUTC(iso));
  return {
    date: iso,
    md: `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`,
    wd: `${WD[d.getUTCDay()]}요일`,
  };
}

/** Contiguous DayInfo list, inclusive of both ends. */
export function buildDates(fromISO: string, toISO_: string): DayInfo[] {
  const out: DayInfo[] = [];
  for (let iso = fromISO; iso <= toISO_; iso = addDays(iso, 1)) out.push(dayInfo(iso));
  return out;
}

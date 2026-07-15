import { addDays } from "./dates";
import type { UISlot } from "./types";

export const DAY_MINUTES = 1440;

/** Cancelled bookings never occupy anything — the slot is genuinely free again. */
const live = (s: UISlot) => s.status !== "canceled";

export interface DayBlock {
  slot: UISlot;
  /** Position within THIS day, 0..1440. May differ from slot.startMin/endMin for overnight. */
  from: number;
  to: number;
  /** This block is the tail of a booking that started yesterday. */
  continuedPrev: boolean;
  /** This booking runs past midnight into tomorrow. */
  continuesNext: boolean;
}

/**
 * What occupies `room` on `date`, in that day's own 0..1440 coordinates.
 *
 * The club books overnight regularly (`22:30-25:30`, `23:30-26:00`), which the parser stores
 * as endMin > 1440. Such a booking occupies TWO days, so it appears twice: as a head on its
 * own date, and as a tail on the following morning. Without the tail, the next day's early
 * hours look free when they aren't — the same double-booking bug as hiding them entirely.
 */
export function dayBlocks(date: string, room: string, slots: UISlot[]): DayBlock[] {
  const prev = addDays(date, -1);
  const out: DayBlock[] = [];
  for (const s of slots) {
    if (s.room !== room || !live(s)) continue;
    if (s.date === date) {
      out.push({
        slot: s,
        from: s.startMin,
        to: Math.min(s.endMin, DAY_MINUTES),
        continuedPrev: false,
        continuesNext: s.endMin > DAY_MINUTES,
      });
    } else if (s.date === prev && s.endMin > DAY_MINUTES) {
      out.push({
        slot: s,
        from: 0,
        to: s.endMin - DAY_MINUTES,
        continuedPrev: true,
        continuesNext: false,
      });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * The booking that clashes with [start, end) on `date`, or null.
 * Handles both directions across midnight: an existing overnight booking spilling into
 * `date`, and a request that itself runs past midnight into the next day.
 */
export function findClash(
  date: string,
  room: string,
  start: number,
  end: number,
  slots: UISlot[],
): DayBlock | null {
  for (const b of dayBlocks(date, room, slots)) {
    if (b.from < end && start < b.to) return b;
  }
  if (end > DAY_MINUTES) {
    const spill = end - DAY_MINUTES;
    for (const b of dayBlocks(addDays(date, 1), room, slots)) {
      if (b.from < spill && b.to > 0 && !b.continuedPrev) return b;
    }
  }
  return null;
}

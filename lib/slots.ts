import { supabaseAdmin } from "./supabase";
import { ROOMS, type UISlot } from "./types";

export interface SlotRow {
  article_id: number;
  room: string;
  date: string;
  start_min: number | null;
  end_min: number | null;
  movie: string | null;
  person: string | null;
  needs_review: boolean;
  // Embedded via the article_id FK. PostgREST returns an object for many-to-one, but the
  // client types it as an array without generated types — accept both.
  posts: { writer_nick: string } | { writer_nick: string }[] | null;
}

/**
 * When a poster gives no end time we must still block SOMETHING: rendering a zero-length
 * sliver left the rest of the evening looking free, which is how a collision happens — the
 * same "booked time shown as free" bug as hiding a booking entirely. So assume the median
 * real booking length (2h; 46% of 231 bookings, the single most common). It can hide up to
 * an hour of genuinely free time ~twice a year, which is far cheaper than a double-booking.
 * The UI still shows "19:00–?" — we block defensively without pretending to know.
 */
const ASSUMED_DUR = 120;

const nickOf = (p: SlotRow["posts"]): string | null =>
  (Array.isArray(p) ? p[0]?.writer_nick : p?.writer_nick) ?? null;

/**
 * Parsed showings for the two theaters between `from` and `to` (inclusive, KST dates).
 * Cancelled bookings are excluded at the source — the slot is free again.
 */
export async function getSlots(from: string, to: string): Promise<UISlot[]> {
  const { data, error } = await supabaseAdmin()
    .from("slots")
    // writer_nick comes from the post itself and is always present, unlike the name in the
    // title (only 11% of slots) — so it's the reliable answer to "who booked this?".
    .select("article_id, room, date, start_min, end_min, movie, person, needs_review, posts(writer_nick)")
    .eq("canceled", false)
    .in("room", ROOMS as unknown as string[])
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("start_min", { nullsFirst: true });
  if (error) throw new Error(`slots query: ${error.message}`);

  return (data as unknown as SlotRow[]).map(rowToSlot).filter((s): s is UISlot => s !== null);
}

/** Exported for tests: the row → view mapping, including the defensive end-time policy. */
export function rowToSlot(r: SlotRow): UISlot | null {
  // No start at all → nothing to place on a grid. A missing END is recoverable.
  if (r.start_min === null) return null;
  const endAssumed = r.end_min === null;
  return {
    articleId: r.article_id,
    date: r.date,
    room: r.room,
    startMin: r.start_min,
    endMin: endAssumed ? r.start_min + ASSUMED_DUR : (r.end_min as number),
    endAssumed,
    movie: r.movie,
    person: r.person,
    // An explicit name in the title wins — it's often a group ("수영모"), which says more
    // than an individual's nick. Otherwise fall back to whoever posted.
    who: r.person ?? nickOf(r.posts) ?? null,
    status: r.needs_review ? "needs_review" : "booked",
  };
}

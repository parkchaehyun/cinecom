import { supabaseAdmin } from "./supabase";
import { ROOMS, type UISlot } from "./types";

interface SlotRow {
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
    .select("room, date, start_min, end_min, movie, person, needs_review, posts(writer_nick)")
    .eq("canceled", false)
    .in("room", ROOMS as unknown as string[])
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("start_min", { nullsFirst: true });
  if (error) throw new Error(`slots query: ${error.message}`);

  return (data as unknown as SlotRow[])
    // A null time means the poster never typed one; it can't be placed on a grid.
    .filter((r) => r.start_min !== null && r.end_min !== null)
    .map((r) => ({
      date: r.date,
      room: r.room,
      startMin: r.start_min as number,
      endMin: r.end_min as number,
      movie: r.movie,
      person: r.person,
      // An explicit name in the title wins — it's often a group ("수영모"), which says more
      // than an individual's nick. Otherwise fall back to whoever posted.
      who: r.person ?? nickOf(r.posts) ?? null,
      status: r.needs_review ? "needs_review" : "booked",
    }));
}

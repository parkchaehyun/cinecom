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
}

/**
 * Parsed showings for the two theaters between `from` and `to` (inclusive, KST dates).
 * Cancelled bookings are excluded at the source — the slot is free again.
 */
export async function getSlots(from: string, to: string): Promise<UISlot[]> {
  const { data, error } = await supabaseAdmin()
    .from("slots")
    .select("room, date, start_min, end_min, movie, person, needs_review")
    .eq("canceled", false)
    .in("room", ROOMS as unknown as string[])
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("start_min", { nullsFirst: true });
  if (error) throw new Error(`slots query: ${error.message}`);

  return (data as SlotRow[])
    // A null time means the poster never typed one; it can't be placed on a grid.
    .filter((r) => r.start_min !== null && r.end_min !== null)
    .map((r) => ({
      date: r.date,
      room: r.room,
      startMin: r.start_min as number,
      endMin: r.end_min as number,
      movie: r.movie,
      person: r.person,
      status: r.needs_review ? "needs_review" : "booked",
    }));
}

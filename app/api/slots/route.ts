import { NextResponse } from "next/server";
import { getSlots } from "@/lib/slots";
import { addDays, todayKST } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Parsed showings for the timeline. Excludes cancelled; keeps needs_review (flagged).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const today = todayKST();
  const from = searchParams.get("from") ?? today;
  const to = searchParams.get("to") ?? addDays(today, 30);
  try {
    return NextResponse.json({ slots: await getSlots(from, to) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

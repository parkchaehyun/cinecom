import { buildCalendar } from "@/lib/calendar";
import { getSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

/**
 * Public iCalendar subscription. It is generated from the DB on every request, so a calendar
 * client's next refresh sees the same edits and deletions as the website.
 */
export async function GET() {
  try {
    // Ingest already enforces the 90-day retention window. No upper bound: a long-lead booking
    // must appear even when it sits beyond the board's compact month-ahead browsing window.
    const slots = await getSlots("1900-01-01", "9999-12-31");
    return new Response(buildCalendar(slots), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
        "Content-Disposition": 'inline; filename="cinecom-reservations.ics"',
        "Content-Language": "ko",
        // Calendar clients may cache locally, but neither Next nor the CDN should serve stale DB data.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("calendar feed:", error);
    return new Response("Calendar feed unavailable", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

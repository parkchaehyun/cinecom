import { describe, it, expect } from "vitest";
import { crawlAndParse } from "./ingest";
import { ROOMS } from "./types";

// Hits the live cafe — opt-in only (LIVE=1) so `npm test` stays hermetic.
describe.skipIf(!process.env.LIVE)("live crawl+parse smoke", () => {
  it("returns current theater bookings", async () => {
    const parsed = await crawlAndParse(3);
    const theaterSlots = parsed
      .flatMap((p) => p.slots)
      .filter((s) => (ROOMS as readonly string[]).includes(s.room));
    console.log(
      `posts ${parsed.length} · reservations ${parsed.filter((p) => p.isReservation).length} · theater slots ${theaterSlots.length}`,
    );
    for (const s of theaterSlots.slice(0, 12)) {
      console.log(`  ${s.date} ${s.room} ${s.startMin}-${s.endMin} ${s.movie ?? ""}${s.needsReview ? " [review]" : ""}`);
    }
    expect(parsed.length).toBeGreaterThan(0);
    expect(theaterSlots.length).toBeGreaterThan(0);
  }, 30_000);
});

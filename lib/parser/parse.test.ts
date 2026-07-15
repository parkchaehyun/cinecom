import { describe, it, expect } from "vitest";
import fixtures from "./__fixtures__/reservations.json";
import { parseTitle } from "./parse";

type Fixture = { subject: string; writeTs: number };

const results = (fixtures as Fixture[]).map((f) => ({ f, r: parseTitle(f.subject, f.writeTs) }));

const isReview = (x: (typeof results)[number]) =>
  x.r.slots.length === 0 || x.r.slots.some((s) => s.needsReview || Number.isNaN(s.startMin));

describe("parseTitle on 2-yr corpus", () => {
  it("classifies every fixture as a reservation", () => {
    expect(results.filter((x) => !x.r.isReservation)).toHaveLength(0);
  });

  it("cleanly parses ≥99.5% into slots (rest → review bucket)", () => {
    const total = results.length;
    const review = results.filter(isReview);
    const cleanPct = ((total - review.length) / total) * 100;
    if (review.length) {
      console.log(`\nreview bucket ${review.length}/${total} (clean ${cleanPct.toFixed(2)}%):`);
      for (const x of review) console.log("   ", x.f.subject);
    }
    expect(cleanPct).toBeGreaterThanOrEqual(99.5);
  });

  it("marks (취소) canceled and (수정) still-valid", () => {
    for (const { f, r } of results) {
      if (/취소/.test(f.subject)) {
        expect(r.slots.every((s) => s.canceled)).toBe(true);
      } else if (/수정/.test(f.subject)) {
        expect(r.slots.length > 0 && r.slots.some((s) => !s.canceled)).toBe(true);
      }
    }
  });

  it("infers a plausible year (all slots within ~1yr of post date)", () => {
    for (const { f, r } of results) {
      for (const s of r.slots) {
        if (Number.isNaN(s.startMin)) continue;
        const showing = new Date(s.date + "T00:00:00").getTime();
        expect(Math.abs(showing - f.writeTs)).toBeLessThan(300 * 86_400_000);
      }
    }
  });
});

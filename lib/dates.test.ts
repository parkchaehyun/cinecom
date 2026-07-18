import { describe, expect, it } from "vitest";
import { minutesSinceMidnightKST } from "./dates";

describe("minutesSinceMidnightKST", () => {
  it("converts UTC to KST minutes", () => {
    expect(minutesSinceMidnightKST(new Date("2026-07-18T04:35:30Z"))).toBe(13 * 60 + 35.5);
  });

  it("wraps across KST midnight", () => {
    expect(minutesSinceMidnightKST(new Date("2026-07-18T16:05:00Z"))).toBe(65);
  });
});

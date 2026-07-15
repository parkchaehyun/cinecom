import { describe, it, expect } from "vitest";
import { dayBlocks, findClash } from "./occupancy";
import type { UISlot } from "./types";

const slot = (p: Partial<UISlot>): UISlot => ({
  date: "2026-05-08",
  room: "대상영실",
  startMin: 19 * 60,
  endMin: 21 * 60,
  movie: null,
  person: null,
  status: "booked",
  ...p,
});

// Real bookings from the cafe — the club screens overnight regularly.
const AIM_NOT_THERE = slot({ date: "2026-05-08", startMin: 1350, endMin: 1530, movie: "아임 낫 데어" }); // 22:30–25:30
const GIRIGO = slot({ date: "2026-05-17", startMin: 60, endMin: 240, movie: "기리고 1-4화" }); // 01:00–04:00

describe("dayBlocks", () => {
  it("keeps an ordinary booking on its own day", () => {
    const b = dayBlocks("2026-05-17", "대상영실", [GIRIGO]);
    expect(b).toHaveLength(1);
    expect([b[0].from, b[0].to]).toEqual([60, 240]);
    expect(b[0].continuesNext).toBe(false);
  });

  it("clips an overnight booking at midnight on its own day", () => {
    const b = dayBlocks("2026-05-08", "대상영실", [AIM_NOT_THERE]);
    expect(b).toHaveLength(1);
    expect([b[0].from, b[0].to]).toEqual([1350, 1440]); // drawn 22:30 → 24:00
    expect(b[0].continuesNext).toBe(true);
    // the label still shows what the club wrote: 22:30–25:30
    expect(b[0].slot.endMin).toBe(1530);
  });

  it("shows the overnight tail on the NEXT morning", () => {
    const b = dayBlocks("2026-05-09", "대상영실", [AIM_NOT_THERE]);
    expect(b).toHaveLength(1);
    expect([b[0].from, b[0].to]).toEqual([0, 90]); // 00:00 → 01:30
    expect(b[0].continuedPrev).toBe(true);
  });

  it("does not leak a tail onto an unrelated day or room", () => {
    expect(dayBlocks("2026-05-10", "대상영실", [AIM_NOT_THERE])).toHaveLength(0);
    expect(dayBlocks("2026-05-09", "소상영실", [AIM_NOT_THERE])).toHaveLength(0);
  });

  it("ignores cancelled bookings entirely", () => {
    const cancelled = { ...AIM_NOT_THERE, status: "canceled" as const };
    expect(dayBlocks("2026-05-08", "대상영실", [cancelled])).toHaveLength(0);
    expect(dayBlocks("2026-05-09", "대상영실", [cancelled])).toHaveLength(0);
  });
});

describe("findClash", () => {
  const all = [AIM_NOT_THERE];

  it("blocks the next morning against yesterday's overnight booking", () => {
    // 00:30–02:00 on the 9th sits inside 아임 낫 데어's tail (00:00–01:30)
    expect(findClash("2026-05-09", "대상영실", 30, 120, all)?.slot.movie).toBe("아임 낫 데어");
  });

  it("allows the next morning once the tail has ended", () => {
    expect(findClash("2026-05-09", "대상영실", 90, 240, all)).toBeNull(); // 01:30 onwards
  });

  it("blocks a request that itself runs past midnight into an existing booking", () => {
    const morning = slot({ date: "2026-05-09", startMin: 60, endMin: 180 }); // 01:00–03:00
    // request 23:00 → 25:00 on the 8th spills to 00:00–01:00 on the 9th, which is free…
    expect(findClash("2026-05-08", "대상영실", 1380, 1500, [morning])).toBeNull();
    // …but 23:00 → 26:00 spills to 02:00 and hits it
    expect(findClash("2026-05-08", "대상영실", 1380, 1560, [morning])).not.toBeNull();
  });

  it("still catches a plain same-day overlap", () => {
    expect(findClash("2026-05-08", "대상영실", 1380, 1440, all)).not.toBeNull(); // 23:00–24:00
    expect(findClash("2026-05-08", "대상영실", 600, 720, all)).toBeNull(); // 10:00–12:00
  });

  it("does not treat touching bookings as clashing", () => {
    expect(findClash("2026-05-08", "대상영실", 1230, 1350, all)).toBeNull(); // ends exactly at 22:30
  });
});

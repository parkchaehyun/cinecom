import { describe, it, expect } from "vitest";
import { buildTitle } from "./title";
import { parseTitle } from "./parser/parse";

describe("buildTitle", () => {
  it("matches the canonical shape", () => {
    expect(buildTitle({ date: "2026-06-25", room: "대상영실", startMin: 18 * 60 + 30, endMin: 20 * 60 + 30, person: "박채현", movie: "리플렉션 인 데드 다이아몬드" })).toBe(
      "6월 25일 목요일 / 대상영실 / 18:30 - 20:30 / 박채현 / 리플렉션 인 데드 다이아몬드",
    );
  });

  it("drops the name segment when blank (the majority of real posts omit it)", () => {
    expect(buildTitle({ date: "2026-07-16", room: "대상영실", startMin: 20 * 60 + 30, endMin: 22 * 60 + 10, movie: "베로니카의 이중생활" })).toBe(
      "7월 16일 목요일 / 대상영실 / 20:30 - 22:10 / 베로니카의 이중생활",
    );
    expect(buildTitle({ date: "2026-07-16", room: "소상영실", startMin: 600, endMin: 720, person: "   ", movie: "하라키리" })).toBe(
      "7월 16일 목요일 / 소상영실 / 10:00 - 12:00 / 하라키리",
    );
  });

  it("falls back to 미정 for an empty movie, like members do", () => {
    expect(buildTitle({ date: "2026-07-14", room: "소상영실", startMin: 19 * 60, endMin: 21 * 60, movie: "" })).toBe(
      "7월 14일 화요일 / 소상영실 / 19:00 - 21:00 / 미정",
    );
  });

  it("zero-pads and handles a midnight end", () => {
    expect(buildTitle({ date: "2026-07-14", room: "대상영실", startMin: 9 * 60 + 30, endMin: 24 * 60, movie: "곡성" })).toBe(
      "7월 14일 화요일 / 대상영실 / 09:30 - 24:00 / 곡성",
    );
  });

  // The strongest guarantee: whatever we post must be readable by our own parser,
  // so a slot we create round-trips back onto the board identically.
  it("round-trips through parseTitle", () => {
    const cases = [
      { date: "2026-07-16", room: "대상영실", startMin: 1230, endMin: 1330, movie: "베로니카의 이중생활", person: null },
      { date: "2026-07-14", room: "소상영실", startMin: 1140, endMin: 1260, movie: "대부 2", person: "박채현" },
      { date: "2026-07-14", room: "대상영실", startMin: 570, endMin: 1440, movie: "곡성", person: null },
    ];
    for (const c of cases) {
      const title = buildTitle(c);
      const writeTs = Date.parse(`${c.date}T00:00:00+09:00`);
      const { isReservation, slots } = parseTitle(title, writeTs);
      expect(isReservation, title).toBe(true);
      expect(slots, title).toHaveLength(1);
      const s = slots[0];
      expect(s.needsReview, title).toBe(false);
      expect(s.date, title).toBe(c.date);
      expect(s.room, title).toBe(c.room);
      expect(s.startMin, title).toBe(c.startMin);
      expect(s.endMin, title).toBe(c.endMin);
      expect(s.movie, title).toBe(c.movie);
      expect(s.person, title).toBe(c.person);
    }
  });
});

import { describe, it, expect } from "vitest";
import { rowToSlot, type SlotRow } from "./slots";
import { findClash } from "./occupancy";

const row = (p: Partial<SlotRow>): SlotRow => ({
  article_id: 8115,
  room: "대상영실",
  date: "2026-06-05",
  start_min: 19 * 60,
  end_min: 21 * 60,
  movie: null,
  person: null,
  needs_review: false,
  posts: { writer_nick: "김선혁" },
  ...p,
});

describe("rowToSlot — who booked it", () => {
  it("prefers the name in the title (often a group, which says more)", () => {
    expect(rowToSlot(row({ person: "수영모" }))?.who).toBe("수영모");
  });

  it("falls back to the poster — the title name is on only 11% of slots", () => {
    expect(rowToSlot(row({ person: null }))?.who).toBe("김선혁");
  });

  it("handles the embed arriving as an array (client types it that way)", () => {
    expect(rowToSlot(row({ person: null, posts: [{ writer_nick: "오지은" }] }))?.who).toBe("오지은");
  });

  it("survives a missing post rather than throwing", () => {
    expect(rowToSlot(row({ person: null, posts: null }))?.who).toBeNull();
  });

  // The board links every block to cafe.naver.com/cinecom/{articleId}. That link is the only route
  // to cancelling a booking — Naver's Cafe API can't delete — so losing the id silently would
  // strand members with no way back to their own post.
  it("carries the article id through, so the block can link to the source post", () => {
    expect(rowToSlot(row({ article_id: 8115 }))?.articleId).toBe(8115);
  });
});

describe("rowToSlot — the defensive end-time policy", () => {
  // Real case: `6월 5일 목요일 / 대상영실 / 19:00 / 초여름` — no end time given.
  const noEnd = row({ start_min: 19 * 60, end_min: null, needs_review: true, movie: "초여름" });

  it("blocks the median 2h when the poster gave no end time", () => {
    const s = rowToSlot(noEnd)!;
    expect(s.startMin).toBe(19 * 60);
    expect(s.endMin).toBe(21 * 60); // assumed, not written
    expect(s.endAssumed).toBe(true);
  });

  it("leaves a real end time alone", () => {
    const s = rowToSlot(row({ end_min: 20 * 60 }))!;
    expect(s.endMin).toBe(20 * 60);
    expect(s.endAssumed).toBe(false);
  });

  it("drops a slot with no start — it cannot be placed on a grid", () => {
    expect(rowToSlot(row({ start_min: null, end_min: null }))).toBeNull();
  });

  // The whole point: a zero-length sliver left the evening looking free, so someone would
  // book straight over a real screening. The assumption must actually block.
  it("makes an end-less booking block the evening against a clashing request", () => {
    const s = rowToSlot(noEnd)!;
    expect(findClash("2026-06-05", "대상영실", 19 * 60, 21 * 60, [s])).not.toBeNull();
    expect(findClash("2026-06-05", "대상영실", 20 * 60, 22 * 60, [s])).not.toBeNull();
    // …but it doesn't over-block beyond the assumption
    expect(findClash("2026-06-05", "대상영실", 21 * 60, 23 * 60, [s])).toBeNull();
  });
});

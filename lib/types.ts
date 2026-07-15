// Shared domain types for the 씨네꼼 reservation app.

export const ROOMS = ["대상영실", "소상영실"] as const;
export type Room = (typeof ROOMS)[number];
// Rooms as they may literally appear in titles (before normalization).
export type RawRoom = Room | "상영실" | "꼼방";

// A raw cafe post as returned by the boardlist API (already flattened).
export interface RawPost {
  articleId: number;
  menuId: number;
  menuName: string;
  subject: string;
  writerNick: string;
  writeTs: number; // epoch milliseconds (original write time)
  blindArticle: boolean;
}

// ── View models (what the board renders) ──
export type SlotStatus = "booked" | "needs_review" | "canceled";

export interface UISlot {
  date: string; // YYYY-MM-DD (KST)
  room: string;
  startMin: number;
  endMin: number;
  movie: string | null;
  person: string | null;
  status: SlotStatus;
}

export interface DayInfo {
  date: string;
  md: string; // "7월 13일"
  wd: string; // "월요일"
}

// One parsed showing extracted from a post title.
export interface ParsedSlot {
  room: RawRoom;
  date: string; // YYYY-MM-DD (KST)
  startMin: number; // minutes from midnight; may exceed 1440 for overnight
  endMin: number;
  movie: string | null;
  person: string | null;
  canceled: boolean;
  needsReview: boolean;
  confidence: number; // 0..1
}

import { describe, expect, it } from "vitest";
import { buildCalendar, CALENDAR_URL } from "./calendar";
import type { UISlot } from "./types";

const slot = (overrides: Partial<UISlot> = {}): UISlot => ({
  articleId: 8115,
  date: "2026-07-16",
  room: "대상영실",
  startMin: 20 * 60 + 30,
  endMin: 22 * 60 + 30,
  movie: "베로니카의 이중생활",
  person: null,
  who: "박채현",
  endAssumed: false,
  status: "booked",
  ...overrides,
});

const generatedAt = new Date("2026-07-16T03:04:05.000Z");
const unfold = (calendar: string) => calendar.replace(/\r\n[ \t]/g, "");

describe("buildCalendar", () => {
  it("publishes a live Seoul-time calendar with source links", () => {
    const calendar = unfold(buildCalendar([slot()], generatedAt));

    expect(calendar).toContain("METHOD:PUBLISH\r\n");
    expect(calendar).toContain(`SOURCE;VALUE=URI:${CALENDAR_URL}\r\n`);
    expect(calendar).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT10M\r\n");
    expect(calendar).toContain("UID:8115-1@cinecom.chaepark.com\r\n");
    expect(calendar).toContain("DTSTAMP:20260716T030405Z\r\n");
    expect(calendar).toContain(`SEQUENCE:${Math.floor(generatedAt.getTime() / 60_000)}\r\n`);
    expect(calendar).toContain("ORGANIZER:mailto:cinecom@chaepark.com\r\n");
    expect(calendar).toContain("DTSTART;TZID=Asia/Seoul:20260716T203000\r\n");
    expect(calendar).toContain("DTEND;TZID=Asia/Seoul:20260716T223000\r\n");
    expect(calendar).toContain("SUMMARY;LANGUAGE=ko:베로니카의 이중생활 [대상영실]\r\n");
    expect(calendar).toContain("URL:https://cafe.naver.com/cinecom/8115\r\n");
    // Subscribing to the room board must not make every club booking block the member's time.
    expect(calendar).toContain("TRANSP:TRANSPARENT\r\n");
  });

  it("carries 25:30-style overnight bookings into the next KST day", () => {
    const calendar = unfold(
      buildCalendar([slot({ startMin: 22 * 60 + 30, endMin: 25 * 60 + 30 })], generatedAt),
    );
    expect(calendar).toContain("DTSTART;TZID=Asia/Seoul:20260716T223000\r\n");
    expect(calendar).toContain("DTEND;TZID=Asia/Seoul:20260717T013000\r\n");
  });

  it("also reads an end clock at/before the start as overnight", () => {
    const calendar = unfold(buildCalendar([slot({ startMin: 23 * 60, endMin: 60 })], generatedAt));
    expect(calendar).toContain("DTEND;TZID=Asia/Seoul:20260717T010000\r\n");
  });

  it("uses deterministic per-post UIDs and excludes canceled slots", () => {
    const later = slot({ articleId: 99, date: "2026-07-18", startMin: 1200, endMin: 1320 });
    const earlier = slot({ articleId: 99, date: "2026-07-17", startMin: 1140, endMin: 1260 });
    const canceled = slot({ articleId: 100, status: "canceled" });
    const calendar = unfold(buildCalendar([later, canceled, earlier], generatedAt));

    const first = calendar.indexOf("UID:99-1@cinecom.chaepark.com");
    const second = calendar.indexOf("UID:99-2@cinecom.chaepark.com");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(calendar).not.toContain("UID:100-");
  });

  it("escapes TEXT and folds every physical line at 75 UTF-8 octets", () => {
    const movie = `${"가".repeat(35)}, 세미;역슬래시\\줄\n둘`;
    const calendar = buildCalendar([slot({ movie, who: "홍길동, 수영모" })], generatedAt);
    const unfolded = unfold(calendar);

    expect(unfolded).toContain(`SUMMARY;LANGUAGE=ko:${"가".repeat(35)}\\, 세미\\;역슬래시\\\\줄\\n둘 [대상영실]`);
    expect(unfolded).toContain("DESCRIPTION;LANGUAGE=ko:카페 원글:");
    expect(unfolded).not.toContain("홍길동");
    for (const line of calendar.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
    }
    expect(calendar.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("marks uncertain and assumed-end reservations without dropping them", () => {
    const calendar = unfold(
      buildCalendar([slot({ status: "needs_review", endAssumed: true })], generatedAt),
    );
    expect(calendar).toContain("SUMMARY;LANGUAGE=ko:베로니카의 이중생활 [대상영실 · 확인 필요]");
    expect(calendar).toContain("상태: 원글 확인 필요\\n종료 시간: 원글에 없어 2시간으로 표시");
  });
});

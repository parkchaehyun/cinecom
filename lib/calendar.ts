import { addDays } from "./dates";
import type { UISlot } from "./types";

export const CALENDAR_URL = "https://cinecom.chaepark.com/calendar.ics";

const SITE_URL = "https://cinecom.chaepark.com";
const CALENDAR_NAME = "씨네꼼 상영실 예약";
const encoder = new TextEncoder();

const pad = (n: number) => String(n).padStart(2, "0");

/** RFC 5545 TEXT escaping. Do this before folding so escaped bytes count toward the line limit. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold at 75 UTF-8 octets without splitting a Hangul code point (RFC 5545 section 3.1). */
function foldLine(line: string): string {
  const parts: string[] = [];
  let part = "";
  let bytes = 0;
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (part && bytes + size > limit) {
      parts.push(part);
      part = char;
      bytes = size;
      // Continuation lines start with one space, leaving 74 octets for their content.
      limit = 74;
    } else {
      part += char;
      bytes += size;
    }
  }
  parts.push(part);
  return parts.join("\r\n ");
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** A DB date plus minutes-from-midnight as an iCalendar local time, including 25:30-style ends. */
function localDateTime(date: string, minutes: number): string {
  const dayOffset = Math.floor(minutes / 1440);
  const clock = ((minutes % 1440) + 1440) % 1440;
  return `${addDays(date, dayOffset).replace(/-/g, "")}T${pad(Math.floor(clock / 60))}${pad(clock % 60)}00`;
}

const textOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function slotOrder(a: UISlot, b: UISlot): number {
  return (
    textOrder(a.date, b.date) ||
    a.startMin - b.startMin ||
    textOrder(a.room, b.room) ||
    a.endMin - b.endMin ||
    textOrder(a.movie ?? "", b.movie ?? "")
  );
}

/**
 * Build a read-only subscription feed from the same view models as the booking board.
 *
 * Slot table IDs cannot be event IDs: ingest deletes and recreates those rows every ten minutes.
 * The cafe article ID plus a deterministic position inside that article stays stable instead, so
 * a title/time edit updates the existing calendar event rather than duplicating it.
 */
export function buildCalendar(slots: UISlot[], generatedAt = new Date()): string {
  const active = slots.filter((slot) => slot.status !== "canceled");
  const ordinals = new Map<number, number>();
  const identified = [...active]
    .sort((a, b) => a.articleId - b.articleId || slotOrder(a, b))
    .map((slot) => {
      const ordinal = (ordinals.get(slot.articleId) ?? 0) + 1;
      ordinals.set(slot.articleId, ordinal);
      return { slot, ordinal };
    });

  const stamp = utcStamp(generatedAt);
  // iTIP revisions are integers. Epoch minutes are monotonic, compact, and advance between the
  // refreshes requested by this feed without requiring revision state in the database.
  const sequence = Math.floor(generatedAt.getTime() / 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cinecom//Room Reservations//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME;LANGUAGE=ko:${escapeText(CALENDAR_NAME)}`,
    `X-WR-CALNAME:${escapeText(CALENDAR_NAME)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
    "REFRESH-INTERVAL;VALUE=DURATION:PT10M",
    "X-PUBLISHED-TTL:PT10M",
    `SOURCE;VALUE=URI:${CALENDAR_URL}`,
    `URL:${SITE_URL}`,
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Seoul",
    "X-LIC-LOCATION:Asia/Seoul",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const { slot, ordinal } of identified.sort((a, b) => slotOrder(a.slot, b.slot))) {
    const sourceUrl = `https://cafe.naver.com/cinecom/${slot.articleId}`;
    const review = slot.status === "needs_review";
    const summary = `[${review ? "확인 필요 · " : ""}${slot.room}] ${slot.movie ?? "미정"}`;
    const description = [
      review ? "상태: 원글 확인 필요" : null,
      slot.endAssumed ? "종료 시간: 원글에 없어 2시간으로 표시" : null,
      // Do not syndicate member nicknames into third-party calendar accounts. The public source
      // post remains one tap away for someone who needs the author or full title.
      `카페 원글: ${sourceUrl}`,
    ]
      .filter((line): line is string => !!line)
      .join("\n");
    // An explicit end at/before the start is an overnight clock time (23:00 → 01:00), matching
    // the reservation sheet's policy. Parsed 25:00-style values already pass through unchanged.
    const endMin = slot.endMin <= slot.startMin ? slot.endMin + 1440 : slot.endMin;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${slot.articleId}-${ordinal}@cinecom.chaepark.com`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `SEQUENCE:${sequence}`,
      "ORGANIZER:mailto:cinecom@chaepark.com",
      `DTSTART;TZID=Asia/Seoul:${localDateTime(slot.date, slot.startMin)}`,
      `DTEND;TZID=Asia/Seoul:${localDateTime(slot.date, endMin)}`,
      `SUMMARY;LANGUAGE=ko:${escapeText(summary)}`,
      `DESCRIPTION;LANGUAGE=ko:${escapeText(description)}`,
      `LOCATION;LANGUAGE=ko:${escapeText(`씨네꼼 ${slot.room}`)}`,
      `URL:${sourceUrl}`,
      "CLASS:PUBLIC",
      "STATUS:CONFIRMED",
      // These are room reservations, not proof that every subscriber is attending.
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { DayInfo, UISlot } from "@/lib/types";
import { addDays, mondayOf } from "@/lib/dates";
import { dayBlocks, type DayBlock } from "@/lib/occupancy";

const ROOMS = ["대상영실", "소상영실"] as const;
// The full day: the club books overnight (22:30-25:30) and pre-dawn (01:00-04:00 마라톤),
// so a 09:00-start grid rendered those above the top edge and showed booked time as free.
const DAY_START = 0;
const DAY_END = 1440; // 24:00
const SPAN = DAY_END - DAY_START;
const PXPM = 0.85; // pixels per minute (day view)
const PAD_TOP = 10; // keeps the 00:00 tick off the top edge
const PAD_BOTTOM = 12;
const GRID_H = SPAN * PXPM + PAD_TOP + PAD_BOTTOM;
const DEFAULT_DUR = 120;
const MIN_GAP = 20; // gaps shorter than this aren't worth offering
const MIN_BOOKING = 30;
const SNAP = 30; // tap-to-place granularity — 81% of real bookings already start on :00/:30
// Durations members actually book: these four cover 91% of 231 real bookings (2h alone is 46%).
// The native time picker still handles the other 9%.
const DURATIONS = [90, 120, 150, 180];
const WEEK_TICKS = [360, 720, 1080, 1440]; // 6 / 12 / 18 / 24 — enough to read "is the evening free?"

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const fmtDur = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
};
const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const y = (min: number) => (min - DAY_START) * PXPM + PAD_TOP;
const pct = (min: number) => ((min - DAY_START) / SPAN) * 100;

type Item = { kind: "free"; startMin: number; endMin: number } | { kind: "block"; block: DayBlock };

function buildItems(blocks: DayBlock[]): Item[] {
  const items: Item[] = [];
  let cursor = DAY_START;
  for (const b of blocks) {
    if (b.from - cursor >= MIN_GAP) items.push({ kind: "free", startMin: cursor, endMin: b.from });
    items.push({ kind: "block", block: b });
    cursor = Math.max(cursor, b.to);
  }
  if (DAY_END - cursor >= MIN_GAP) items.push({ kind: "free", startMin: cursor, endMin: DAY_END });
  return items;
}

interface Sheet {
  room: string;
  day: DayInfo;
  startMin: number;
  endMin: number;
  /** Where the free gap ends (next booking, or midnight) — bounds the duration chips. */
  maxEnd: number;
  movie: string;
}

export default function BookingBoard({ slots, dates, today, initialIdx, loggedIn }: { slots: UISlot[]; dates: DayInfo[]; today: string; initialIdx: number; loggedIn: boolean }) {
  const [local, setLocal] = useState<UISlot[]>(slots);
  const [dateIdx, setDateIdx] = useState(initialIdx);
  const [view, setView] = useState<"day" | "week">("day");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const day = dates[dateIdx];

  // Adopt fresh server data after router.refresh() (e.g. once a new post is ingested).
  useEffect(() => setLocal(slots), [slots]);

  // The grid spans the whole 24h for correctness, but 00:00-08:00 is nearly always empty
  // (3 bookings in 232), so anchor on the day's first booking — or 09:00 on an empty day,
  // which is where bookings actually start. Tails from an overnight booking count.
  useEffect(() => {
    if (view !== "day") return;
    const el = scrollRef.current;
    if (!el) return;
    const blocks = ROOMS.flatMap((r) => dayBlocks(day.date, r, local));
    const anchor = blocks.length ? Math.min(...blocks.map((b) => b.from)) - 60 : 9 * 60;
    el.scrollTop = Math.max(0, y(anchor) - PAD_TOP);
    // Re-anchor on day/view change only, not on every local edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.date, view]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  function openPicker() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through to focus */
      }
    }
    el.focus();
    el.click();
  }

  function onDateInput(value: string) {
    if (!value) return;
    let idx = dates.findIndex((d) => d.date === value);
    if (idx < 0) idx = value < dates[0].date ? 0 : dates.length - 1;
    setDateIdx(idx);
    setView("day");
  }

  function openFrom(e: React.MouseEvent<HTMLButtonElement>, room: string, gapStart: number, gapEnd: number) {
    // Keyboard activation (detail 0) has no pointer position → start at the gap.
    let start = gapStart;
    if (e.detail > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      start = Math.round((gapStart + (e.clientY - rect.top) / PXPM) / SNAP) * SNAP;
    }
    // Snapping can land outside the gap, so the gap always wins.
    start = Math.max(gapStart, Math.min(start, Math.max(gapStart, gapEnd - MIN_BOOKING)));
    setSheet({ room, day, startMin: start, endMin: Math.min(start + DEFAULT_DUR, gapEnd), maxEnd: gapEnd, movie: "" });
  }

  /** Editing the start MOVES the booking (duration held); editing the end RESIZES it. */
  function setStart(v: string) {
    if (!sheet) return;
    const startMin = parseTime(v);
    const dur = sheet.endMin - sheet.startMin;
    setSheet({ ...sheet, startMin, endMin: Math.min(startMin + dur, sheet.maxEnd) });
  }

  const preview = (s: Sheet) =>
    `${s.day.md} ${s.day.wd} / ${s.room} / ${fmt(s.startMin)} - ${fmt(s.endMin)} / ${s.movie || "미정"}`;

  async function submit() {
    if (!sheet || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: sheet.day.date,
          room: sheet.room,
          startMin: sheet.startMin,
          endMin: sheet.endMin,
          movie: sheet.movie,
        }),
      });
      if (res.status === 401) {
        // Not signed in (or the token expired) — send them to Naver, then back here.
        await signIn("naver", { callbackUrl: window.location.href });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "예약글 작성에 실패했습니다.");
        return;
      }
      setSheet(null);
      router.refresh(); // pull the freshly-ingested booking back from the server
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const todayIdx = dates.findIndex((d) => d.date === today);
  function goToday() {
    setView("day");
    setDateIdx(todayIdx >= 0 ? todayIdx : 0);
  }

  // `dates` spans a month, so slice the Mon–Sun week containing the selected day for the week view.
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(day.date), i))
    .map((iso) => dates.find((d) => d.date === iso))
    .filter((d): d is DayInfo => !!d);

  function pickDate(iso: string) {
    const i = dates.findIndex((d) => d.date === iso);
    if (i >= 0) setDateIdx(i);
    setView("day");
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--page)", display: "flex", justifyContent: "center", padding: "20px 12px" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-card)", overflow: "hidden", alignSelf: "flex-start" }}>
        <header style={{ padding: "14px 16px 14px" }}>
          {/* Club mark: projector beam + cinecom wordmark, lifted off the logo's yellow block.
              Identity, not chrome — small, black, and quiet above the controls. */}
          <img src="/cinecom-mark.png" alt="씨네꼼" width={104} height={39} style={{ display: "block", marginBottom: 10 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <NavBtn label="이전 날짜" glyph="‹" onClick={() => setDateIdx((i) => Math.max(0, i - 1))} disabled={view === "week" || dateIdx === 0} />

            {/* The date is the date-picker trigger (design's calendar affordance). */}
            <button onClick={openPicker} className="datebtn" aria-label={`날짜 선택, 현재 ${day.md} ${day.wd}`} style={{ display: "flex", alignItems: "center", gap: 7, border: "none", background: "none", padding: "4px 8px", borderRadius: "var(--r-sm)", cursor: "pointer" }}>
              <CalendarIcon />
              {/* Centred, not left-aligned: the date is the widest thing here, so centring the
                  block puts 수요일 on the date's own axis rather than against its left edge. */}
              <span style={{ textAlign: "center" }}>
                <span style={{ display: "block", font: `700 var(--text-xl)/1.15 var(--font-sans)`, letterSpacing: "-0.02em", color: "var(--ink)" }}>{day.md}</span>
                <span style={{ display: "block", font: `500 var(--text-xs)/1.3 var(--font-sans)`, color: "var(--ink-faint)" }}>{day.wd}</span>
              </span>
            </button>
            <input ref={dateInputRef} type="date" value={day.date} min={dates[0].date} max={dates[dates.length - 1].date} onChange={(e) => onDateInput(e.target.value)} tabIndex={-1} aria-hidden style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }} />

            <NavBtn label="다음 날짜" glyph="›" onClick={() => setDateIdx((i) => Math.min(dates.length - 1, i + 1))} disabled={view === "week" || dateIdx === dates.length - 1} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
            {/* Only the two states whose blocks carry no text need explaining. A 확인 필요
                block literally says "확인 필요", so a legend entry for it was permanent chrome
                teaching nothing — for something that appears about twice a year. */}
            <Legend swatch={<DashSwatch />} text="예약가능" />
            <Legend swatch={<Dot color="var(--accent)" />} text="예약됨" />
          </div>
        </header>

        {view === "day" ? (
          <>
            <div style={{ display: "flex", padding: "0 12px" }}>
              <div style={{ width: 44, flex: "none" }} />
              {ROOMS.map((r) => (
                <h2 key={r} style={{ flex: 1, textAlign: "center", padding: "8px 0", margin: "0 3px", background: "var(--surface)", borderRadius: "var(--r-sm) var(--r-sm) 0 0", font: `700 var(--text-sm)/1.2 var(--font-sans)` }}>
                  {r}
                </h2>
              ))}
            </div>

            <div ref={scrollRef} style={{ height: 500, overflowY: "auto", background: "var(--surface)", margin: "0 12px", borderRadius: "0 0 var(--r-md) var(--r-md)" }}>
              <div style={{ display: "flex", position: "relative", height: GRID_H }}>
                <div style={{ width: 44, flex: "none", position: "relative" }}>
                  {hourTicks().map((t) => (
                    <div key={t.label} style={{ position: "absolute", left: 0, right: 6, top: t.top, textAlign: "right", font: `500 var(--text-xs)/1 ui-monospace, Menlo, monospace`, color: "var(--ink-faint)", transform: "translateY(-50%)" }}>
                      {t.label}
                    </div>
                  ))}
                </div>

                {ROOMS.map((room) => (
                  <div key={room} style={{ flex: 1, position: "relative", borderLeft: "1px solid var(--line-soft)" }}>
                    {hourTicks().map((t) => (
                      <div key={t.label} aria-hidden style={{ position: "absolute", left: 0, right: 0, top: t.top, borderTop: "1px solid var(--grid-line)" }} />
                    ))}
                    {buildItems(dayBlocks(day.date, room, local)).map((item) =>
                      item.kind === "free" ? (
                        // No "예약가능" label: the legend teaches dashed = 예약가능 once, and
                        // repeating it in every gap is noise against the bookings, which are the
                        // content. On tall gaps the label sat at the top and scrolled out of view
                        // anyway, so the dashed box was already carrying the meaning alone. The
                        // aria-label keeps it announced for screen readers.
                        <button key={`f${item.startMin}`} onClick={(e) => openFrom(e, room, item.startMin, item.endMin)} aria-label={`${room} ${fmt(item.startMin)}부터 ${fmt(item.endMin)}까지 예약 가능`} className="free-slot" style={{ position: "absolute", left: 4, right: 4, top: y(item.startMin), height: (item.endMin - item.startMin) * PXPM, borderRadius: "var(--r-sm)", border: "1.5px dashed var(--free-border)", background: "transparent", cursor: "pointer", display: "block" }} />
                      ) : (
                        <SlotBlock key={`s${item.block.slot.date}-${item.block.from}`} block={item.block} />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <WeekView dates={weekDates} slots={local} todayDate={today} onPickDate={pickDate} />
        )}

        {/* View switcher */}
        <div style={{ display: "flex", gap: 8, padding: "14px 16px 16px" }}>
          <Pill label="오늘" active={view === "day"} onClick={goToday} />
          <Pill label="이번주" active={view === "week"} onClick={() => setView("week")} />
        </div>
      </div>

      {sheet && (
        <>
          <div onClick={() => setSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,14,.32)", zIndex: "var(--z-backdrop)" as unknown as number, animation: `fade-in var(--dur) var(--ease-out-quart)` }} />
          <div role="dialog" aria-modal="true" aria-label="예약글 작성" style={{ position: "fixed", left: "50%", bottom: 0, transform: "translateX(-50%)", width: "100%", maxWidth: 440, zIndex: "var(--z-sheet)" as unknown as number, animation: `sheet-in var(--dur) var(--ease-out-quart)` }}>
            <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg) var(--r-lg) 0 0", boxShadow: "var(--shadow-sheet)", padding: "16px 18px 22px" }}>
              <div aria-hidden style={{ width: 32, height: 4, borderRadius: 2, background: "rgba(0,0,0,.14)", margin: "0 auto 14px" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <h2 style={{ font: `700 var(--text-base) var(--font-sans)`, margin: 0 }}>예약글 작성</h2>
                <button onClick={() => setSheet(null)} aria-label="닫기" style={{ width: 44, height: 44, marginRight: -10, borderRadius: "var(--r-sm)", border: "none", background: "transparent", color: "var(--ink-muted)", cursor: "pointer", fontSize: 16 }}>
                  ✕
                </button>
              </div>
              <p style={{ font: `500 var(--text-xs) var(--font-sans)`, color: "var(--ink-muted)", margin: "0 0 14px" }}>
                {sheet.room} · {sheet.day.md} {sheet.day.wd}
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <TimeField id="start" label="시작" value={fmt(sheet.startMin)} onChange={setStart} />
                <TimeField id="end" label="종료" value={fmt(Math.min(sheet.endMin, 1439))} onChange={(v) => setSheet({ ...sheet, endMin: parseTime(v) })} />
              </div>

              {/* Duration is derived from the times, and the chips write back to the end —
                  so the two stay in sync whichever the member touches. */}
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: "block", font: `600 var(--text-xs) var(--font-sans)`, color: "var(--ink-muted)", marginBottom: 5 }}>
                  길이 · {fmtDur(Math.max(0, sheet.endMin - sheet.startMin))}
                </span>
                <div style={{ display: "flex", gap: 5 }}>
                  {DURATIONS.map((d) => {
                    const active = sheet.endMin - sheet.startMin === d;
                    const fits = sheet.startMin + d <= sheet.maxEnd;
                    return (
                      <button
                        key={d}
                        onClick={() => setSheet({ ...sheet, endMin: sheet.startMin + d })}
                        disabled={!fits}
                        aria-pressed={active}
                        title={fits ? undefined : "다음 예약과 겹칩니다"}
                        style={{
                          flex: 1,
                          padding: "8px 0",
                          borderRadius: "var(--r-sm)",
                          border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                          background: active ? "var(--booked-bg)" : "var(--surface)",
                          color: !fits ? "var(--ink-faint)" : active ? "var(--booked-meta)" : "var(--ink-muted)",
                          font: `${active ? 700 : 500} var(--text-xs) var(--font-sans)`,
                          cursor: fits ? "pointer" : "default",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtDur(d)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field id="movie" label="영화 제목" placeholder="예: 베로니카의 이중생활" value={sheet.movie} onChange={(v) => setSheet({ ...sheet, movie: v })} />
              {/* Mirrors the real post title — same family the cafe shows, not mono (no Hangul in mono). */}
              <p style={{ font: `500 var(--text-xs)/1.6 var(--font-sans)`, color: "var(--ink-muted)", background: "var(--page)", borderRadius: "var(--r-sm)", padding: "10px 12px", margin: "4px 0 14px", wordBreak: "keep-all" }}>
                {preview(sheet)}
              </p>
              {error && (
                <p role="alert" style={{ font: `600 var(--text-xs)/1.5 var(--font-sans)`, color: "var(--review-meta)", background: "var(--review-bg)", border: "1px solid var(--review-border)", borderRadius: "var(--r-sm)", padding: "9px 11px", margin: "0 0 10px" }}>
                  {error}
                </p>
              )}
              <button onClick={submit} disabled={busy} className="primary" style={{ width: "100%", padding: 14, borderRadius: "var(--r-md)", border: "none", background: "var(--accent)", color: "#fff", font: `700 var(--text-sm) var(--font-sans)`, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
                {busy ? "작성 중…" : loggedIn ? "예약글 작성" : "네이버로 로그인하고 예약글 작성"}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        .free-slot { transition: background var(--dur) var(--ease-out-quart), border-color var(--dur) var(--ease-out-quart); }
        .free-slot:hover { background: rgba(59,110,246,.06); border-color: var(--accent); }
        .free-slot:active { background: rgba(59,110,246,.12); }
        .primary { transition: background var(--dur) var(--ease-out-quart); }
        .primary:hover { background: var(--accent-press); }
        .nav:hover:not(:disabled) { background: var(--sunken); }
        /* Disabled via a real colour, not an opacity stack (which crushed contrast to 1.1:1). */
        .nav:disabled { color: rgba(0,0,0,.5); background: var(--sunken); border-color: var(--line-soft); cursor: default; }
        .datebtn:hover { background: var(--sunken); }
        .weekrow { transition: background var(--dur) var(--ease-out-quart); }
        .weekrow:hover { background: var(--sunken); }
      `}</style>
    </div>
  );
}

/* ── Week overview: 7 days × 2 room tracks ─────────────────────────────────
   Density alone can't answer "is Thursday *evening* free?", so the tracks carry
   a 12/18/24 scale. Rows are buttons: overview → tap → that day's detail. */
function WeekView({ dates, slots, todayDate, onPickDate }: { dates: DayInfo[]; slots: UISlot[]; todayDate: string; onPickDate: (iso: string) => void }) {
  return (
    <div style={{ maxHeight: 500, overflowY: "auto", padding: "4px 16px 8px" }}>
      <div style={{ display: "flex", gap: 8, paddingLeft: 60, marginBottom: 6 }}>
        {ROOMS.map((room) => (
          <div key={room} style={{ flex: 1 }}>
            <div style={{ textAlign: "center", font: `700 var(--text-xs)/1.4 var(--font-sans)`, color: "var(--ink-muted)" }}>{room}</div>
            <div style={{ position: "relative", height: 12 }}>
              {WEEK_TICKS.map((t) => (
                <span key={t} style={{ position: "absolute", left: `${pct(t)}%`, transform: "translateX(-100%)", font: `500 9px/1 ui-monospace, Menlo, monospace`, color: "var(--ink-faint)" }}>
                  {Math.floor(t / 60)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {dates.map((d) => (
        <button key={d.date} onClick={() => onPickDate(d.date)} className="weekrow" aria-label={`${d.md} ${d.wd} 자세히 보기`} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 4px", border: "none", borderBottom: "1px solid var(--line-soft)", background: "none", cursor: "pointer", borderRadius: "var(--r-sm)" }}>
          <span style={{ width: 56, flex: "none", textAlign: "left" }}>
            <span style={{ display: "block", font: `700 var(--text-xs)/1.2 var(--font-sans)`, color: d.date === todayDate ? "var(--accent)" : "var(--ink)", whiteSpace: "nowrap" }}>{d.md}</span>
            <span style={{ display: "block", font: `500 9px/1.3 var(--font-sans)`, color: "var(--ink-faint)" }}>{d.wd}</span>
          </span>
          {ROOMS.map((room) => (
            <span key={room} style={{ flex: 1, height: 18, borderRadius: 5, background: "var(--sunken)", position: "relative", overflow: "hidden", display: "block" }}>
              {WEEK_TICKS.slice(0, -1).map((t) => (
                <span key={t} aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(t)}%`, borderLeft: "1px solid var(--grid-line)" }} />
              ))}
              {dayBlocks(d.date, room, slots).map((b, k) => (
                <span key={k} style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(b.from)}%`, width: `${Math.max(1.2, ((b.to - b.from) / SPAN) * 100)}%`, background: b.slot.status === "needs_review" ? "var(--review-border)" : "var(--accent)" }} />
              ))}
            </span>
          ))}
        </button>
      ))}
    </div>
  );
}

function SlotBlock({ block }: { block: DayBlock }) {
  const { slot, from, to, continuedPrev, continuesNext } = block;
  const review = slot.status === "needs_review";
  const r = "var(--r-sm)";
  return (
    <div
      style={{
        position: "absolute",
        left: 4,
        right: 4,
        // Positioned by the block's place in THIS day; an overnight booking is clipped at
        // midnight here and continues as a tail on the next day.
        top: y(from),
        height: Math.max(26, (to - from) * PXPM),
        // Square off the edge that runs into the adjacent day, so it reads as continuing.
        borderRadius: `${continuedPrev ? "0 0" : `${r} ${r}`} ${continuesNext ? "0 0" : `${r} ${r}`}`,
        padding: "6px 8px",
        boxSizing: "border-box",
        overflow: "hidden",
        background: review ? "var(--review-bg)" : "var(--booked-bg)",
        border: review ? "1.5px dashed var(--review-border)" : "1px solid var(--booked-border)",
      }}
    >
      <div style={{ font: `700 var(--text-sm)/1.3 var(--font-sans)`, color: review ? "var(--review-ink)" : "var(--booked-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {continuedPrev ? "↳ " : ""}
        {slot.movie ?? "미정"}
      </div>
      <div style={{ font: `500 var(--text-xs)/1.4 var(--font-sans)`, color: review ? "var(--review-meta)" : "var(--booked-meta)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {/* "예약됨" was redundant — a filled block already means booked — so the line carries
            who booked it instead. Review slots keep the warning: it outranks the name.
            Times are always what the club wrote (22:30–25:30), not the midnight-clipped ones. */}
        {review ? "확인 필요" : (slot.who ?? "예약됨")} · {fmt(slot.startMin)}–
        {slot.endAssumed ? "?" : fmt(slot.endMin)}
      </div>
    </div>
  );
}

function hourTicks() {
  const out: { label: string; top: number }[] = [];
  for (let h = 0; h <= 24; h++) out.push({ label: `${pad(h)}:00`, top: y(h * 60) });
  return out;
}

// Sized to sit against the 24px date rather than look like an afterthought; stroke is
// scaled down so it stays a hairline at the larger size instead of thickening with it.
function CalendarIcon() {
  return (
    <svg width="17" height="18" viewBox="0 0 13 14" fill="none" aria-hidden style={{ flex: "none" }}>
      <rect x="0.75" y="2.75" width="11.5" height="10.5" rx="2" stroke="var(--ink-faint)" strokeWidth="1.2" />
      <path d="M3.5 0.75v3M9.5 0.75v3M0.75 6.25h11.5" stroke="var(--ink-faint)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{ flex: 1, padding: "11px 0", borderRadius: "var(--r-md)", border: "none", background: active ? "var(--ink)" : "rgba(0,0,0,.05)", color: active ? "var(--surface)" : "var(--ink-muted)", font: `700 var(--text-sm) var(--font-sans)`, cursor: "pointer" }}>
      {label}
    </button>
  );
}

function NavBtn({ label, glyph, onClick, disabled }: { label: string; glyph: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="nav" style={{ width: 44, height: 44, flex: "none", borderRadius: "50%", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 18, lineHeight: 1, cursor: "pointer" }}>
      {glyph}
    </button>
  );
}

/**
 * A CSS dashed border can't render at legend size: an 8px box has only ~32px of perimeter,
 * the corner radii eat half of it, and Chrome's dash period (~3x border-width) is longer
 * than the straight run on each side — so it came out as 3-4 disconnected marks rather than
 * a dashed box. SVG lets us set the dash array explicitly and fit ~8 dashes around it.
 */
function DashSwatch() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ flex: "none", display: "block" }}>
      <rect x="1" y="1" width="8" height="8" rx="1.5" fill="none" stroke="var(--free-border)" strokeWidth="1.2" strokeDasharray="2 1.6" />
    </svg>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "block", flex: "none" }} />;
}

function Legend({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, font: `500 var(--text-xs)/1 var(--font-sans)`, color: "var(--ink-muted)" }}>
      {swatch}
      {text}
    </span>
  );
}

function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label htmlFor={id} style={{ display: "block", font: `600 var(--text-xs) var(--font-sans)`, color: "var(--ink-muted)", marginBottom: 4 }}>
        {label}
      </label>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--sunken)", font: `600 var(--text-base) var(--font-sans)`, color: "var(--ink)" }} />
    </div>
  );
}

function Field({ id, label, placeholder, value, onChange }: { id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={{ display: "block", font: `600 var(--text-xs) var(--font-sans)`, color: "var(--ink-muted)", marginBottom: 4 }}>
        {label}
      </label>
      <input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--sunken)", font: `500 var(--text-base) var(--font-sans)`, color: "var(--ink)" }} />
    </div>
  );
}

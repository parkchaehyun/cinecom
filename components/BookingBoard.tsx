"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
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

export default function BookingBoard({ slots, dates, today, initialIdx, loggedIn, userName }: { slots: UISlot[]; dates: DayInfo[]; today: string; initialIdx: number; loggedIn: boolean; userName: string | null }) {
  const [local, setLocal] = useState<UISlot[]>(slots);
  const [dateIdx, setDateIdx] = useState(initialIdx);
  const [view, setView] = useState<"day" | "week">("day");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Logged in, but the token has no 카페 permission — recoverable by re-consenting, so the CTA
  // becomes that instead of a submit that we know will fail again.
  const [needsConsent, setNeedsConsent] = useState(false);
  // Drag-to-dismiss: the grab handle promises it, so it has to work.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const day = dates[dateIdx];
  // The focus trap keys off *whether* the sheet is open, never the sheet object: every keystroke
  // makes a new `sheet` object, so depending on the object re-ran the trap on each character and
  // it stole focus back out of whatever you were typing in. See the effect below.
  const sheetOpen = !!sheet;

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

  /**
   * `aria-modal="true"` promises assistive tech that everything behind the sheet is
   * unreachable, so we have to actually honour it: move focus in, keep Tab inside, make
   * the background inert, and hand focus back on close. Without this a screen reader is
   * told the board is hidden while a keyboard user can still tab straight into it.
   */
  useEffect(() => {
    if (!sheetOpen) {
      // Restore focus to whatever opened the sheet (the free-slot button).
      // preventScroll is load-bearing: focus() scrolls its target into view by default, and a
      // free-slot button can be ~900px tall (00:00 → the evening) inside a 500px scroller —
      // too tall to fit, so the browser scrolled to its top and the grid jumped to 00:00.
      // The button was on screen when it was tapped; restoring focus shouldn't move the view.
      returnFocusRef.current?.focus?.({ preventScroll: true });
      returnFocusRef.current = null;
      return;
    }
    const focusables = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    // Focus the dialog itself, not focusables()[0] — that was the ✕ button, so opening the sheet
    // pointed the member at "close" as the first thing. Focusing the container also keeps the
    // mobile keyboard shut (focusing an input would summon it over the sheet you just opened),
    // and screen readers announce the dialog's label on entry. WAI-ARIA's dialog pattern.
    dialogRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setSheet(null);
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const [first, last] = [f[0], f[f.length - 1]];
      // Wrap at both ends so focus can never escape into the inert background.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `sheetOpen`, NOT `sheet`: see the note where it's declared.
  }, [sheetOpen]);

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
    returnFocusRef.current = e.currentTarget; // hand focus back here when the sheet closes
    // A dismissing drag leaves dragY at the sheet's height to carry it off-screen; clear it here
    // so the next sheet can't mount already translated away. Opening is the one path in, so this
    // holds however the last one closed.
    setDragY(0);
    // Errors belong to an attempt, not to the member — a conflict from the last booking has no
    // business greeting them on a fresh one. `needsConsent` deliberately survives: it's a fact
    // about their Naver grant, still true on the next sheet, and the CTA says so itself.
    setError(null);
    setSheet({ room, day, startMin: start, endMin: Math.min(start + DEFAULT_DUR, gapEnd), maxEnd: gapEnd, movie: "" });
  }

  /* Swipe-down-to-dismiss. Pointer events so mouse and touch share one path; the drag zone
     sets touch-action:none, without which the browser claims the gesture for scrolling and
     pointermove never fires. Downward only — dragging a bottom sheet upward means nothing. */
  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    dragFrom.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragFrom.current === null) return;
    setDragY(Math.max(0, e.clientY - dragFrom.current));
  }
  function onDragEnd() {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    setDragging(false);
    const h = dialogRef.current?.offsetHeight ?? 400;
    if (dragY > Math.min(120, h * 0.25)) {
      setDragY(h); // carry it the rest of the way out, then unmount
      setTimeout(() => setSheet(null), 180);
    } else {
      setDragY(0); // didn't travel far enough — snap back
    }
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

  /**
   * Re-run Naver consent so the member can tick 카페, which they declined at login.
   *
   * auth_type=reprompt makes Naver show the consent screen again rather than silently reusing the
   * existing grant — without it Naver hands back the same scope-less token and the member loops
   * forever on the same error with no way out. Verified end-to-end against a real account that had
   * declined 카페: the consent screen reappears with 카페 tickable, and the write then succeeds.
   * (developers.naver.com is unreachable from CI, and probing authorize() proves nothing — Naver
   * returns 200 for a bogus auth_type too — so this behaviour rests on that manual test.)
   */
  function reconsent() {
    signIn("naver", { callbackUrl: window.location.href }, { auth_type: "reprompt" });
  }

  async function submit() {
    if (!sheet || busy) return;
    if (needsConsent) return reconsent();
    // Logged out: go straight to Naver. We already know the answer, so POSTing first only bought a
    // round trip to be told 401 — and it flashed "작성 중…" while doing it, claiming to write a
    // post when it was really about to leave for a login screen. The 401 branch below still
    // covers the case this can't: a session that expired after the page rendered.
    if (!loggedIn) return void signIn("naver", { callbackUrl: window.location.href });
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
      const data = (await res.json().catch(() => ({}))) as { error?: string; needsCafeConsent?: boolean };
      if (!res.ok) {
        setNeedsConsent(!!data.needsCafeConsent);
        setError(data.error ?? "예약글 작성에 실패했습니다.");
        // 409 means the server crawled the cafe and found a booking we don't have drawn. Telling
        // the member "그 시간은 이미 예약됨" while the grid behind them still shows the slot empty
        // is asking them to disbelieve their own eyes. The server just refreshed the DB, so pull it.
        if (res.status === 409) router.refresh();
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
    /* One screen, no page scroll. The card is exactly the viewport minus its margin and the footer,
       and the only thing that scrolls is the grid — so the date, the room headers and the view
       switcher are always reachable without scrolling past them. Before this the page AND the grid
       both scrolled: two nested scrollers, where a drag near the edge moved the wrong one. dvh (not
       vh) because mobile Safari's vh assumes the URL bar is hidden and overshoots by ~60px.
       The card is a full screen and the policy link sits BELOW the fold: minHeight (not height) on
       the wrapper lets the page grow by exactly the footer, so 오늘/이번주 keep the bottom of the
       screen — where a thumb reaches — and the link is found by scrolling, like any site's footer.
       제30조 asks that the policy be 공개, not that it occupy a screen it never earns. */
    <div style={{ minHeight: "100dvh", background: "var(--page)", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 12px", boxSizing: "border-box" }}>
      {/* inert while the sheet is open: aria-modal only *claims* the background is gone —
          this is what actually removes it from focus and the a11y tree. */}
      {/* Exactly one screen minus its margin — the card can't shrink to make room for the footer,
          which is the whole point: the footer goes below the fold instead. */}
      <main ref={cardRef} inert={!!sheet} className="card" style={{ width: "100%", flex: "none", height: "calc(100dvh - 32px)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-card)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <header style={{ padding: "12px 16px 10px", flex: "none" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            {/* Club mark: projector beam + cinecom wordmark, lifted off the logo's yellow block.
                Identity, not chrome — small, black, and quiet above the controls. */}
            <h1 style={{ margin: 0 }}>
              <img src="/cinecom-mark.png" alt="씨네꼼 상영실 예약" width={104} height={39} style={{ display: "block" }} />
            </h1>
            <AuthButton loggedIn={loggedIn} userName={userName} />
          </div>

          {/* Arrows sit next to the date, not pinned to the card's edges. Pinned, they read as
              "previous/next screen"; grouped, they read as "step this date" — the relationship is
              the point, and it's how Google Calendar, Fantastical and Cal.com all place them. The
              legend that used to live under this row is gone: it cost a permanent line of vertical
              space to teach two things the board already says (a filled block names who booked it;
              a dashed empty box is the only tappable thing on the grid). */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
            <NavBtn label="이전 날짜" glyph="‹" onClick={() => setDateIdx((i) => Math.max(0, i - 1))} disabled={view === "week" || dateIdx === 0} />
            <DateField day={day} dates={dates} onPick={onDateInput} inputRef={dateInputRef} onOpen={openPicker} />
            <NavBtn label="다음 날짜" glyph="›" onClick={() => setDateIdx((i) => Math.min(dates.length - 1, i + 1))} disabled={view === "week" || dateIdx === dates.length - 1} />
          </div>
        </header>

        {view === "day" ? (
          <>
            <div style={{ display: "flex", padding: "0 12px", flex: "none" }}>
              <div style={{ width: 44, flex: "none" }} />
              {ROOMS.map((r) => (
                <h2 key={r} style={{ flex: 1, textAlign: "center", padding: "8px 0", margin: "0 3px", background: "var(--surface)", borderRadius: "var(--r-sm) var(--r-sm) 0 0", font: `700 var(--text-sm)/1.2 var(--font-sans)` }}>
                  {r}
                </h2>
              ))}
            </div>

            {/* flex:1 + minHeight:0 — the grid takes whatever height is left and scrolls inside it.
                minHeight:0 is load-bearing: a flex item won't shrink below its content by default,
                so without it the 1236px grid would push the card past the viewport. */}
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--surface)", margin: "0 12px", borderRadius: "0 0 var(--r-md) var(--r-md)" }}>
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
        <div style={{ display: "flex", gap: 8, padding: "12px 16px 14px", flex: "none" }}>
          <Pill label="오늘" active={view === "day"} onClick={goToday} />
          <Pill label="이번주" active={view === "week"} onClick={() => setView("week")} />
        </div>
      </main>

      {/* Outside the card on purpose: it's the page's furniture, not the app's chrome. Sharing the
          view switcher's row made a legal link compete with the two controls that matter, and it
          isn't a control. Also inert with the sheet — the background is unreachable, all of it. */}
      <footer inert={!!sheet} style={{ flex: "none", padding: "16px 0 4px" }}>
        <a href="/privacy" className="policy-link" style={{ font: `500 var(--text-xs) var(--font-sans)`, color: "var(--ink-faint)", textDecoration: "none" }}>
          개인정보처리방침
        </a>
      </footer>

      {sheet && (
        <>
          <div onClick={() => setSheet(null)} style={{ position: "fixed", inset: 0, background: "var(--scrim)", zIndex: "var(--z-backdrop)" as unknown as number, animation: `fade-in var(--dur) var(--ease-out-quart)` }} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="예약글 작성"
            tabIndex={-1} // focus target on open; not in the tab order itself
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              margin: "0 auto", // centring must NOT live in `transform` — the animation owns that
              width: "100%",
              maxWidth: 440,
              zIndex: "var(--z-sheet)" as unknown as number,
              transform: `translateY(${dragY}px)`,
              transition: dragging ? "none" : "transform var(--dur) var(--ease-out-quart)",
              animation: `sheet-in var(--dur) var(--ease-out-quart)`,
            }}
          >
            <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg) var(--r-lg) 0 0", boxShadow: "var(--shadow-sheet)", padding: "16px 18px 22px" }}>
              <div
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab", margin: "-16px -18px 0", padding: "16px 18px 0" }}
              >
                {/* Grabbable padding around a 4px line — the visual stays hairline while the
                    target stays thumb-sized. */}
                <div aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: "var(--handle)", margin: "0 auto 14px" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <h2 style={{ font: `700 var(--text-base) var(--font-sans)`, margin: 0 }}>예약글 작성</h2>
                  {/* The close button sits inside the drag zone, so stop the gesture claiming its tap. */}
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setSheet(null)} aria-label="닫기" style={{ width: 44, height: 44, marginRight: -10, borderRadius: "var(--r-sm)", border: "none", background: "transparent", color: "var(--ink-muted)", cursor: "pointer", fontSize: 16 }}>
                    ✕
                  </button>
                </div>
                <p style={{ font: `500 var(--text-xs) var(--font-sans)`, color: "var(--ink-muted)", margin: "0 0 14px" }}>
                  {sheet.room} · {sheet.day.md} {sheet.day.wd}
                </p>
              </div>
              {/* flexWrap is the safety net, not the fix: if a native time control still refuses to
                  shrink on some device I can't test, the fields stack onto two lines instead of
                  painting over each other. Wrapping is ugly; overlapping is broken. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
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
              {/* Placeholder is 미정 because that is literally what an empty field posts — the
                  title preview below already renders 미정. An example title implied the field was
                  required and that a real one had to be invented; the club posts 미정 all the time. */}
              <Field id="movie" label="영화 제목" placeholder="미정" value={sheet.movie} onChange={(v) => setSheet({ ...sheet, movie: v })} />
              {/* Mirrors the real post title — same family the cafe shows, not mono (no Hangul in mono). */}
              <p style={{ font: `500 var(--text-xs)/1.6 var(--font-sans)`, color: "var(--ink-muted)", background: "var(--page)", borderRadius: "var(--r-sm)", padding: "10px 12px", margin: "4px 0 14px", wordBreak: "keep-all" }}>
                {preview(sheet)}
              </p>
              {error && (
                <p role="alert" style={{ font: `600 var(--text-xs)/1.5 var(--font-sans)`, color: "var(--review-meta)", background: "var(--review-bg)", border: "1px solid var(--review-border)", borderRadius: "var(--r-sm)", padding: "9px 11px", margin: "0 0 10px" }}>
                  {error}
                </p>
              )}
              {/* Logged out, this IS the login button, so it wears Naver's green and mark: it's the
                  one place the member hands credentials to Naver, and it's the screen 네아로 검수
                  will be looking at. Logged in, login is over and it returns to our own accent. */}
              {(() => {
                // Three states, one button: log in · re-consent to 카페 · post. The first two both
                // hand off to Naver, so they wear Naver's green; only the last is our own action.
                const toNaver = !loggedIn || needsConsent;
                return (
                  <button onClick={submit} disabled={busy} className={toNaver ? "naverbtn" : "primary"} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: 14, borderRadius: "var(--r-md)", border: "none", background: toNaver ? "var(--naver)" : "var(--accent-ink)", color: "var(--on-accent)", font: `700 var(--text-sm) var(--font-sans)`, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
                    {!busy && toNaver && <NaverMark size={13} />}
                    {busy ? "작성 중…" : needsConsent ? "'카페' 동의하고 다시 시도" : loggedIn ? "예약글 작성" : "네이버 아이디로 로그인"}
                  </button>
                );
              })()}
            </div>
          </div>
        </>
      )}

      <style>{`
        /* Phone-first: the card IS the screen. On a desktop it stays a single centred column
           rather than stretching two room columns across 1400px of empty space — but at 440×870
           it read as a phone on a stretcher, so give it width to breathe and cap the height so a
           tall monitor doesn't draw a ribbon. A real desktop layout is a horizontal week grid
           (7 days × the time axis), which is a different build and not worth it while essentially
           everyone books from a phone. */
        .card { max-width: 440px; }
        @media (min-width: 680px) and (min-height: 640px) {
          .card { max-width: 560px; max-height: 860px; }
        }
        /* Booked blocks are links to the cafe post. No underline or link colour — the block is
           already a distinct object, and 24 blue underlined titles would wreck the grid. */
        .slot-link { transition: filter var(--dur) var(--ease-out-quart); }
        .slot-link:hover { filter: brightness(0.965); }
        .slot-link:active { filter: brightness(0.93); }
        .free-slot { transition: background var(--dur) var(--ease-out-quart), border-color var(--dur) var(--ease-out-quart); }
        .free-slot:hover { background: var(--accent-tint); border-color: var(--accent); }
        .free-slot:active { background: var(--accent-tint-strong); }
        .primary { transition: background var(--dur) var(--ease-out-quart); }
        .primary:hover { background: var(--accent-press); }
        .nav:hover:not(:disabled) { background: var(--sunken); }
        /* Disabled via a real colour, not an opacity stack (which crushed contrast to 1.1:1). */
        .nav:disabled { color: var(--ink-disabled); background: var(--sunken); border-color: var(--line-soft); cursor: default; }
        .datewrap:hover { background: var(--sunken); }
        /* The real input is transparent, so its own focus ring would be invisible — put the ring
           on the wrapper that's actually drawn. */
        .datewrap:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
        .naverbtn { transition: filter var(--dur) var(--ease-out-quart); }
        .naverbtn:hover { filter: brightness(0.93); }
        .authbtn:hover { background: var(--sunken); }
        .policy-link:hover { color: var(--ink-muted); text-decoration: underline; }
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
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px 8px" }}>
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
            <span style={{ display: "block", font: `700 var(--text-xs)/1.2 var(--font-sans)`, color: d.date === todayDate ? "var(--accent-ink)" : "var(--ink)", whiteSpace: "nowrap" }}>{d.md}</span>
            <span style={{ display: "block", font: `500 9px/1.3 var(--font-sans)`, color: "var(--ink-faint)" }}>{d.wd}</span>
          </span>
          {ROOMS.map((room) => (
            // A bounded rail, not a tint: the hairline is what actually answers "where does this
            // room's day end?", which a fill can't do without out-shouting the bookings it holds.
            <span key={room} style={{ flex: 1, height: 18, borderRadius: 5, background: "var(--track)", border: "1px solid var(--track-line)", boxSizing: "border-box", position: "relative", overflow: "hidden", display: "block" }}>
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

/**
 * A booked block, linking to the cafe post it was parsed from.
 *
 * This is also the only honest answer to "let me cancel my booking". Naver's Cafe API has exactly
 * two endpoints — join a cafe, and write an article — so there is no delete or edit to call, and
 * nothing that maps a Naver account to its per-cafe nickname, so the app cannot even tell which
 * bookings are yours. Both problems dissolve here: tap through and Naver's own UI shows 삭제/수정
 * on your posts and not on anyone else's, enforced by Naver rather than guessed at by us. It's
 * useful for everyone else too — "who booked this and why" is one tap from the block.
 */
function SlotBlock({ block }: { block: DayBlock }) {
  const { slot, from, to, continuedPrev, continuesNext } = block;
  const review = slot.status === "needs_review";
  const r = "var(--r-sm)";
  const when = `${fmt(slot.startMin)}부터 ${slot.endAssumed ? "종료 시간 미상" : `${fmt(slot.endMin)}까지`}`;
  return (
    <a
      href={`https://cafe.naver.com/cinecom/${slot.articleId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="slot-link"
      aria-label={`${slot.movie ?? "미정"}, ${slot.who ?? "예약됨"}, ${when}. 카페 원글 열기`}
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
        display: "block",
        textDecoration: "none",
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
    </a>
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

/**
 * The date, doubling as the picker trigger.
 *
 * The input is a real, full-size element laid transparently over the visual rather than a 0×0
 * `opacity:0` field driven by `showPicker()`. Safari refuses `showPicker()` on a zero-size input
 * (and the old `.click()` fallback can't rescue one either), so the calendar did nothing on iPhone
 * while Chrome's laxer handling made it look fine on Android. Given a real box, a plain tap opens
 * the native picker with no JS at all, and `showPicker()` becomes a desktop convenience on top —
 * where a click otherwise only opens the picker from the input's own tiny calendar glyph.
 */
function DateField({ day, dates, onPick, inputRef, onOpen }: { day: DayInfo; dates: DayInfo[]; onPick: (v: string) => void; inputRef: React.RefObject<HTMLInputElement | null>; onOpen: () => void }) {
  return (
    <span className="datewrap" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 8px", borderRadius: "var(--r-sm)" }}>
      <CalendarIcon />
      {/* Centred, not left-aligned: the date is the widest thing here, so centring the block puts
          수요일 on the date's own axis rather than against its left edge. */}
      <span style={{ textAlign: "center" }}>
        <span style={{ display: "block", font: `700 var(--text-xl)/1.15 var(--font-sans)`, letterSpacing: "-0.02em", color: "var(--ink)" }}>{day.md}</span>
        <span style={{ display: "block", font: `500 var(--text-xs)/1.3 var(--font-sans)`, color: "var(--ink-faint)" }}>{day.wd}</span>
      </span>
      <input
        ref={inputRef}
        type="date"
        value={day.date}
        min={dates[0].date}
        max={dates[dates.length - 1].date}
        onChange={(e) => onPick(e.target.value)}
        onClick={onOpen}
        aria-label={`날짜 선택, 현재 ${day.md} ${day.wd}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", padding: 0, margin: 0, background: "none", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}
      />
    </span>
  );
}

/**
 * Auth state, top-right — deliberately quiet in both states.
 *
 * Reading the board is the common case and needs no login at all; posting is the rare one, and the
 * sheet's own CTA is the full Naver-green button that starts it. A saturated green button up here
 * would be the loudest thing on a screen whose entire job is showing a schedule — the same mistake
 * as the yellow 오늘 pill that pulled the eye off the calendar. So brand green appears exactly
 * where the brand action is taken, and this stays a status readout you can act on.
 *
 * The nickname renders only if Naver actually sends one, and we ask for nothing by default. It's
 * the NAVER account's 별명, not the cafe nickname the post appears under — Naver keeps those
 * separate and exposes no way to read the cafe one — and most people have never looked at their
 * 별명, so for many members it would show an unfamiliar auto-generated string that is neither
 * their name nor their cafe name. Absent, the button says the one true thing: you're logged in.
 */
function AuthButton({ loggedIn, userName }: { loggedIn: boolean; userName: string | null }) {
  if (loggedIn)
    return (
      <button onClick={() => signOut()} className="authbtn" style={{ display: "flex", alignItems: "center", gap: 5, minHeight: 36, padding: "0 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--surface)", font: `600 var(--text-xs) var(--font-sans)`, cursor: "pointer", maxWidth: 160 }}>
        {userName && (
          <>
            {/* The N frames it as "the Naver account you're signed in with" — all it can honestly
                claim, since it isn't the cafe identity. */}
            <NaverMark color="var(--naver)" size={10} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>{userName}</span>
          </>
        )}
        <span style={{ flex: "none", color: userName ? "var(--ink-faint)" : "var(--ink)" }}>로그아웃</span>
      </button>
    );
  return (
    <button onClick={() => signIn("naver")} className="authbtn" style={{ display: "flex", alignItems: "center", gap: 5, minHeight: 36, padding: "0 11px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", font: `600 var(--text-xs) var(--font-sans)`, cursor: "pointer", whiteSpace: "nowrap" }}>
      <NaverMark color="var(--naver)" />
      로그인
    </button>
  );
}

/** Naver's N, drawn to their mark rather than approximated with a letter N in a box. */
function NaverMark({ color = "#fff", size = 11 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flex: "none", display: "block" }}>
      <path fill={color} d="M13.56 10.7 6.2 0H0v20h6.44V9.3L13.8 20H20V0h-6.44z" />
    </svg>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    // minHeight 44: the only controls that fell under the 44px touch target (they were 38).
    <button onClick={onClick} aria-pressed={active} style={{ flex: 1, minHeight: 44, padding: "11px 0", borderRadius: "var(--r-md)", border: "none", background: active ? "var(--ink)" : "var(--sunken-strong)", color: active ? "var(--surface)" : "var(--ink-muted)", font: `700 var(--text-sm) var(--font-sans)`, cursor: "pointer" }}>
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

function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    // flex-basis 130px + minWidth 0: the basis is what lets the row wrap instead of overlapping if
    // the control won't shrink (two of them plus the 8px gap fit any phone ≥ 304px). minWidth:0
    // frees the wrapper from min-width:auto. Neither is the real fix for iOS — see the
    // input[type=time] rule in globals.css; the native control's own minimum was the culprit.
    <div style={{ flex: "1 1 130px", minWidth: 0 }}>
      <label htmlFor={id} style={{ display: "block", font: `600 var(--text-xs) var(--font-sans)`, color: "var(--ink-muted)", marginBottom: 4 }}>
        {label}
      </label>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", padding: "10px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--sunken)", font: `600 var(--text-base) var(--font-sans)`, color: "var(--ink)" }} />
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

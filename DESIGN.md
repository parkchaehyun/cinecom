# DESIGN.md — 씨네꼼 상영실 예약

Design system for the film-club room-booking board. Tokens live in `app/globals.css` (`:root`);
nothing downstream hard-codes values.

## Register & intent

**Product register** — design serves the task. This is a utility members open on a phone to answer
one question: *"is this room free, and can I grab it?"* The tool should disappear into the task.
Reference points: Linear · Cal.com · Things. Explicitly **not** flashy or maximalist.

Direction came from an approved Claude Design handoff (a 1a/1b hybrid): **1a's** two-room grid + time
axis (the function) with **1b's** chrome — centered date nav, room tab-cards, soft palette, pill footer.

## Color

Approved palette, preserved deliberately (identity over defaults). Semantic tokens only.

| Token | Value | Use |
|---|---|---|
| `--page` / `--card` / `--surface` | `#f0eee9` / `#faf9f6` / `#fff` | page, card, grid |
| `--ink` / `--ink-muted` / `--ink-faint` | `#1a1a1a` / 55% / 45% | text ramp |
| `--accent` / `--accent-press` | `#3b6ef6` / `#2a55c9` | primary action, selection |
| `--booked-*` | bg `#eef2ff`, ink `#1a2547`, meta `#1d4ed8` | 예약됨 |
| `--review-*` | bg `#fef6e7`, border `#b45309`, meta `#92400e` | 확인 필요 |
| `--free-border` | `rgba(0,0,0,.22)` dashed | 예약가능 |

**The club's yellow (`#EEF700`) is deliberately absent from the UI.** Two experiments settled it:
a brand-tinted lemon page was too subtle to read as ours *and* still tripped the cream detector; and
putting the yellow on the `오늘` pill / sheet CTA failed a real test — the eye went straight to `오늘`,
a *nav convenience*, instead of the calendar, which is the content. **The loudest colour belongs on the
content or the primary action, never on secondary chrome.** Identity is carried by the mark instead.

- `--booked-meta` is `#1d4ed8`, **not** the accent: `#3b6ef6` on `#eef2ff` measured **4.0:1** and failed
  WCAG AA. It's now 6.9:1.
- Never disable via an opacity stack — it crushed the nav glyph to **1.1:1**. Disabled uses a real colour.

## Type

One family (**Pretendard**). Four committed steps, 2:1 range — replacing 7 sizes crammed into 1.7:1.

| Token | px | Use |
|---|---|---|
| `--text-xs` | 12 | ticks, legend, block meta |
| `--text-sm` | 14 | block titles, room headers, buttons |
| `--text-base` | 16 | inputs (also prevents iOS zoom-on-focus), sheet title |
| `--text-xl` | 24 | the date — the single anchor |

Mono (`ui-monospace`) **only** for the time axis (digits, tabular alignment). Never for Korean text —
it has no Hangul and falls back to badly-spaced glyphs.

## Layout & states

- Grid: `DAY_START` 00:00 → `DAY_END` 24:00 at `PXPM` 0.85 px/min; `y(min)` is the single mapping.
  Spans the whole day so overnight bookings (22:30–25:30) render in the right place.
- Grid auto-anchors to one hour before the day's first booking (bookings are overwhelmingly evening;
  otherwise the empty pre-dawn hours waste the viewport).
- **Three slot states only**: `예약가능` / `예약됨` / `확인 필요`. A **cancelled booking is not drawn** —
  the slot is genuinely free again, so it renders as `예약가능` and is bookable. A struck-through
  "취소됨" block would occupy the grid and hide the one fact a booker needs.
- Free slots are real `<button>`s: keyboard-reachable, with an `aria-label` announcing the open
  range. The legend was **removed** — a filled block already names who booked it and a dashed empty
  box is the only tappable thing on the grid, so it taught nothing for permanent vertical cost.

## The mark

`public/cinecom-mark.png` — the **projector beam + `cinecom` wordmark**, extracted from the club logo
(`design/cinecom-logo.jpg`) and lifted off its yellow block: black art on transparency, 241×91, rendered
at 104×39 in the card header. The logo's yellow field, the 씨네꼼 Hangul, and the vertical side text are
all deliberately dropped — a yellow block in the header would repeat the "loudest colour on chrome"
mistake, and the beam is the distinctive part.

Provenance: 300×300 is the largest source Naver serves (no higher-res exists), so the mark is a cleaned
raster — luma-thresholded to kill JPEG fringing, then trimmed to the ink bounds. At 104px wide it's a
~2.3× asset, fine for retina. If it ever needs recolouring (dark mode), trace it to SVG or drive it
through a CSS `mask` with `currentColor`.

## Views

Two views behind the `오늘` / `이번주` pills (`aria-pressed` carries the state):

- **Day** — the two-room grid above. `오늘` also jumps to today.
- **Week** — 7 rows × 2 room tracks; bookings drawn as proportional segments across 00:00→24:00.
  The arrows step whole weeks and the header shows the week's date range (day view shows the single
  date). Deliberate departures from the mock:
  1. **Tracks carry a 6/12/18/24 scale + gridlines, on bounded rails.** Density alone can't answer
     *"is Thursday **evening** free?"* — nearly every booking is 19:00+. The rails have a hairline
     border: the fill (`--track`) alone was invisible against the card, so the two rooms merged.
  2. **Rows are buttons → tap jumps to that day's detail.** Overview without a path to detail is a
     dead end; the mock's rows were read-only.
  3. **Cancelled segments are omitted**, matching the day view. Drawing them would show phantom
     occupancy on a slot that's actually bookable.

## Interaction

- **Calendar subscription** is a quiet outlined `구독` control beside auth in the header. It opens
  a focused setup page rather than downloading a one-time snapshot: native apps receive a `webcal:`
  handoff, while Google Calendar/Outlook users can copy the HTTPS feed URL. The page explicitly says
  the subscription is read-only and updates on the external app's next poll. Feed events are
  transparent to personal free/busy because a room booking does not mean every subscriber attends;
  member nicknames are omitted so third-party calendar accounts receive no identity data.
- **Tap-to-place**: the start time comes from the tapped Y position (snapped to 10 min), default 2h
  clamped to the next booking. Keyboard activation (`e.detail === 0`) has no pointer position, so it
  falls back to the gap start. This is why tapping an empty day doesn't force 09:00.
- **The date is the date-picker trigger** (calendar glyph + date): it calls `showPicker()` on a hidden
  `<input type="date">`, falling back to focus+click. Essential once real data spans arbitrary dates —
  stepping ‹ › to a date three weeks out is unusable.
- Sheet is `position: fixed` — it **must not** live inside the card, whose `overflow: hidden` (rounded
  corners) clipped it. Escape, backdrop tap, or a downward drag on the handle all close it; there is
  **no ✕** (four dismiss paths already, and it sat where the title should).
- **Reservation sheet fields**: 시작/종료 (native time picker with a drawn clock affordance;
  overnight ends read 25:00 under a `종료 · 익일` label), 길이 chips, 영화 제목 (**required** — an
  empty title tells a browsing member nothing about a room held for free), 게시판 (board selector,
  read live from the cafe menu — standing boards + the current-year 소모임s), 이름·소모임 (optional,
  prefilled 수영모 only on 정기 영화 모임 where the club's own titles are unanimous). The live
  preview mirrors the posted title exactly (`lib/title.ts`).
- Native form controls get `-webkit-appearance: none` + a drawn glyph (clock, chevron): the platform
  affordance differs across engines (Chrome draws one, iOS none), so we own it. Verify on a **real
  phone** — headless Chrome can't show the iOS rendering.
- Z-scale is semantic: `--z-backdrop` 40 → `--z-sheet` 50. No magic numbers.
- Motion: `--dur` 200ms on `--ease-out-quart`. Global `prefers-reduced-motion` reset in `globals.css`.
- Touch targets ≥44px (nav arrows, pills, duration chips).

## Known detector exceptions

- **`clipped-overflow-container`** — accepted false positive. Verified in-browser: the only two clip
  containers are the card (rounded corners) and the grid scroll area, and their 58 absolute children
  are the *time grid itself* (ticks, gridlines, slot blocks) which must be clipped and scrolled. The
  rule's one real instance (the sheet) is fixed. **The rule is deliberately not muted** so it still
  catches genuine regressions.
- **`cream-palette`** — flagged as the 2026 AI-default surface. Kept on purpose: it's the approved
  design direction, and identity-preservation beats a generic default. **Open question for the team** —
  see below.

## Open

- **Cream page background** — kept after prototyping the alternatives (`design/palette-*.png`). A
  brand-tinted lemon was the worst of both: too subtle to read as ours, still inside the detector's
  cream band (hue 40–100, low chroma). A true neutral cleared the flag but the decision was to keep the
  approved direction. Revisit alongside adding the logo.
- Drag-to-select a range is a possible enhancement on top of tap-to-place (desktop-first; on touch
  it fights scrolling). Horizontal-swipe day/week navigation was considered and declined — iOS
  edge-swipe-back would eat it, and the grid already owns vertical scroll + tap.

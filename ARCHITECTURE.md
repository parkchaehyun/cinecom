# ARCHITECTURE.md — 씨네꼼 상영실 예약

Onboarding + architecture for the next developer (and their agent). Read this before touching
code; it front-loads the non-obvious invariants and the hard-won facts, so you don't rediscover
them the expensive way. Design system lives in [DESIGN.md](DESIGN.md); coding-behavior guidance in
[CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md).

**Live:** https://cinecom.chaepark.com

---

## 1. What this is

A Korean web app for the 씨네꼼 university film club (Naver Cafe `cafe.naver.com/cinecom`, clubId
**26859626**). The club books two screening rooms — 대상영실, 소상영실 — by posting to the cafe.
Posts aren't sorted by showtime and span many boards, so "is this room free tonight?" means
manually searching. This app crawls every reservation post, shows a per-room availability
timeline, and lets a logged-in member pick a free slot → generates the canonical post title →
posts to the cafe as that member via Naver login.

Single cafe, forever. `clubId` is hardcoded; there is no multi-cafe support and never will be.

---

## 2. Stack & where it runs

| | |
|---|---|
| Framework | **Next.js (App Router)** + React + TypeScript |
| Styling | **Tailwind v4** + CSS custom properties (design tokens in `app/globals.css`) |
| DB | **Supabase Postgres**, region **AWS ap-northeast-2 (Seoul)** |
| Auth | **Auth.js v5** (`next-auth@beta`), Naver provider |
| Hosting | **Vercel**, pinned to region **icn1 (Seoul)** via `vercel.json` |
| Scheduled ingest | **Supabase pg_cron** → `POST /api/ingest` every 10 min |
| Tests | **Vitest** (unit) + **puppeteer-core** driving system Chrome (visual/a11y) |

**Compute and data are both in Seoul on purpose.** The default Vercel region (iad1, Virginia) put
every DB round trip across the Pacific twice; `vercel.json` pins `icn1`. This also means personal
data never leaves Korea → no 국외 이전 to disclose in the privacy policy. Don't change the region.

---

## 3. Data flow — three independent loops

```
INGEST (every 10 min, pg_cron)
  pg_cron ──► POST /api/ingest (x-ingest-secret) ──► runIngest()
     crawl cafe menus/0 (all boards) ──► parse titles ──► upsert reservations ──► reconcile deletes ──► purge >90d
                                                                          │
BROWSE (no login)                                                         ▼
  Browser ──► app/page.tsx (server) ──► getSlots() ◄────────────── Supabase (posts, slots)
     BookingBoard renders the day/week timeline

POST (login required, only at the moment of booking)
  pick free slot ──► POST /api/post ──► [crawl 2 pages first, re-check clash] ──► Naver write API ──► shallow re-ingest
```

The board reads **our DB**, not the cafe. The cron keeps the DB fresh for *display*. Correctness
(no double-booking) is handled separately at submit time — see §7.

---

## 4. File map

Everything under `lib/` is pure/testable and isolated from Next. The unofficial cafe API is
quarantined in `lib/naver.ts`.

| Path | Purpose |
|---|---|
| `app/page.tsx` | Server component: loads slots + board list + session, renders `BookingBoard`. |
| `app/layout.tsx` | Root layout, metadata, **OpenGraph** (share-card) tags. `metadataBase` is load-bearing. |
| `app/privacy/page.tsx` | 개인정보처리방침 (개인정보보호법 제30조). Required for Naver review. |
| `app/api/ingest/route.ts` | Crawl+parse+persist. Guarded by `INGEST_SECRET`. Called by pg_cron. |
| `app/api/post/route.ts` | Auth'd. Validates, re-checks freshness, writes to the cafe. The write path. |
| `app/api/slots/route.ts` | Read API for parsed slots (JSON). |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js handler. |
| `auth.ts` | Auth.js config: Naver provider, JWT + access-token refresh. |
| `components/BookingBoard.tsx` | **The entire UI** (~980 lines): day grid, week view, reservation sheet, all state. |
| `lib/naver.ts` | Cafe read client, write client (`postArticle`), `fetchBoards`. **All the API quirks live here.** |
| `lib/parser/parse.ts` | Title → structured reservation. Pattern-extraction, 99.55% on the 2-yr corpus. |
| `lib/ingest.ts` | `runIngest` / `crawlAndParse` / `purgeExpired`. Retention + reconciliation logic. |
| `lib/occupancy.ts` | `dayBlocks` (overnight clipping), `findClash` (cross-midnight overlap). |
| `lib/slots.ts` | `getSlots` (DB → view models), `rowToSlot` (defensive end-time policy). |
| `lib/title.ts` | Builds the canonical post title. Mirror of the sheet's live preview. |
| `lib/dates.ts` | KST date helpers (server runs UTC — always convert). |
| `lib/types.ts` | Shared domain types. |
| `lib/supabase.ts` | `supabaseAdmin()` — service-role client. |
| `supabase/schema.sql` | Tables (`posts`, `slots`). Apply with `node scripts/migrate.mjs`. |
| `supabase/cron.sql` | pg_cron + pg_net + Vault setup for scheduled ingest. |
| `scripts/*.mjs` | `migrate` (apply schema), `dbcheck` (connectivity), `measure` (screenshot/overflow), `og` (render share card). |

---

## 5. Environment (`.env.local`)

Transferred to you separately (never in git — `.env*` is gitignored). **Every value is
project-scoped** — none reaches the Vercel or Supabase *account*. The same vars are set in Vercel
production, so deploys need nothing extra.

| Var | What | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | service role | **secret** — bypasses RLS, this project only |
| `SUPABASE_DB_URL` | direct Postgres connection | used by `scripts/*` for migrations/queries |
| `AUTH_NAVER_ID` / `AUTH_NAVER_SECRET` | Naver app OAuth creds | **secret** |
| `AUTH_SECRET` | Auth.js JWT signing key | **secret** |
| `INGEST_SECRET` | shared secret for `POST /api/ingest` | **secret**; also stored in Supabase Vault for cron |
| `NAVER_CLUB_ID` | 26859626 | not really secret |
| `VERCEL_OIDC_TOKEN` | short-lived, auto-injected by `vercel env pull` | **ignore/drop** — it rotates itself |

---

## 6. Local dev & deploy

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest, 38 tests
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

**Deploy = `git push` to `main`.** The repo is connected to Vercel's Git integration, which builds
and ships on push (~30s). **Do not use `vercel deploy` with a personal token** — tokens are
account-wide, not project-scoped, and the git-push flow needs no token at all. There is no GitHub
Actions pipeline and you don't need one; Vercel's integration is the CI/CD.

> ⚠️ **The dev server serves stale CSS.** Editing `app/globals.css` sometimes doesn't reach the
> browser (the rule is simply absent from the served stylesheet). It has burned us 3× this project.
> When a CSS change "doesn't work," verify against a **production build** (`npm run build` then grep
> the emitted `.next/static/chunks/*.css`) or `touch app/globals.css` and restart, before assuming
> the CSS is wrong. Lightning CSS also minifies `[type="time"]` → `[type=time]`; grep accordingly.

---

## 7. Non-obvious invariants — change these carefully

These are load-bearing. Each was a real bug; the comments in-code explain more.

- **Cafe writes must be double-URL-encoded.** `doubleEncode()` in `lib/naver.ts` —
  `encodeURIComponent(encodeURIComponent(s))`. Naver percent-decodes twice with a mangle in
  between; single-encoding produces garbled Hangul. Charset is irrelevant; also fold `"` → `'`
  (the API rejects double quotes) and don't hammer it (it 403s on rapid calls).

- **`HORIZON_DAYS` (60) MUST stay below `RETAIN_DAYS` (90).** `lib/ingest.ts`. The crawl looks back
  60 days; the purge deletes showings >90 days past. If the crawl horizon ≥ retention, the crawl
  re-adds the exact rows the purge just deleted, every run, forever — silently defeating retention.

- **`/api/post` crawls the cafe before its clash check.** `getSlots()` reads our DB, which is only
  as fresh as the last cron — so a booking posted straight to the cafe two minutes ago is invisible
  to it. The submit path does a 2-page crawl first (`reconcile: false`) so the freshness race
  closes at submit time. **Do not** re-check against the DB alone. Tightening the cron does not fix
  this; only crawling-at-submit does.

- **`reconcile: false` on shallow crawls.** A shallow crawl (2 pages) can't tell "deleted" from
  "further down the list," so it must never free bookings it didn't fetch. Only the full cron
  ingest reconciles deletions.

- **Retention is keyed on the SHOWING date, not write time.** A long-lead booking is kept while any
  of its showings is still in-window.

- **A deleted cafe post is hard-deleted here immediately** (reconcile), not soft-marked — so we
  don't hold a member's nickname 90 extra days. 개인정보보호법 제21조.

- **Only reservations are stored.** `menus/0` returns *every* post in the cafe; storing
  non-reservations would collect strangers' nicknames for nothing.

- **`-webkit-appearance: none` on `<input type=time>` and `select.board-select`.** iOS gives these
  native controls an intrinsic minimum width (time fields overlapped) and platform-specific
  affordances (a clock on Chrome, nothing on iOS). We strip the native appearance and draw our own
  clock/chevron so every device looks identical. Chrome *also* keeps painting its picker indicator
  — killed with `display:none !important` on `::-webkit-calendar-picker-indicator`.

- **The board list is read from the cafe, never hardcoded.** `fetchBoards()` in `lib/naver.ts`
  reads the cafe's menu tree (`SideMenuList`), returns the standing boards + everything under the
  **current-year** folder (`menuType:"F"` + `indent`). The 소모임 list is rewritten yearly; this
  follows it. Names arrive HTML-escaped — unescape them.

- **KST everywhere.** Server runs UTC. Always go through `lib/dates.ts`. Overnight bookings use
  minutes >1440 (25:30 = 01:30 next day), which is how the club writes them.

---

## 8. Verifying UI work

We drive **system Chrome** via `puppeteer-core` (see `scripts/measure.mjs` for the pattern):
`executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. `axe-core` runs
WCAG AA audits; the board holds **0 violations** (the one known exception is white-on-Naver-green,
documented in `globals.css`).

> ⚠️ **Headless Chrome cannot render iOS Safari.** Every native-form quirk (time picker, select,
> overlap, the clock indicator) behaves differently on iPhone and was only ever caught on a real
> device. When you touch the reservation sheet's inputs, **test on an actual phone** — a green
> puppeteer run is necessary, not sufficient. Multiple bugs this project shipped "verified" and
> were broken on iOS.

---

## 9. Naver integration specifics

- **Read (unofficial, public, no auth):**
  `GET apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/26859626/menus/0/articles?page=N` —
  `type=="ARTICLE"` is on the **outer** object, not `item`. `menus/0` = 전체글보기 (all boards).
- **Write (official):** `POST openapi.naver.com/v1/cafe/{clubId}/menu/{menuId}/articles` with the
  member's Bearer token → posts **as that member**. Default `menuId=13` (꼼인 상영실 예약).
- **Scopes:** the app requests **no 제공 정보** — not name, email, nothing. Only 이용자 식별자
  (basic, always provided, not stored) + the 카페 write permission. A declined 카페 consent surfaces
  as `errorCode 024` on write; the UI recovers via `auth_type=reprompt`.
- **Tokens:** Naver access token ~1h, refreshed a minute early in `auth.ts`. Auth.js session cookie
  is 30 days. Naver's token response has no `scope` field — you cannot detect a partial grant until
  the write fails.

---

## 10. Status

**Live and fully open.** Read + write proven end-to-end on the real cafe. Parser 99.55%. Privacy
policy live. Retention + reconciliation verified against live data. **네아로 검수 passed** — the
Naver login is in 서비스 state, so any club member can log in and post (no test-ID allowlist).

No open tasks. Next work is whatever the club surfaces in real use.

---

## 11. Ground rules

- **One cafe, hardcoded clubId.** No multi-tenant anything.
- **The unofficial read endpoint can change shape** → keep ingest defensive and isolated in
  `lib/naver.ts`.
- **Can't hard-lock a slot** (source of truth is the cafe) — mitigated by crawl-then-recheck at
  submit + a 409 that names the conflict.
- **No editing/deleting cafe posts from the app** (the Cafe API has only join + write — no delete,
  no edit, no way to read a member's per-cafe nickname). Bookings link back to the cafe post, where
  Naver enforces who may edit/delete.
- Match existing style; the codebase favors small, pure, well-commented modules over abstraction.

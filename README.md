# 씨네꼼 상영실 예약

Room-availability + auto-posting web app for the 씨네꼼 university film club
([cafe.naver.com/cinecom](https://cafe.naver.com/cinecom)). Crawls every reservation post in the
club's Naver Cafe, shows a per-room timeline for the two screening rooms (대상영실 · 소상영실), and
lets a member pick a free slot and post the booking back to the cafe under their own Naver account.

**Live:** https://cinecom.chaepark.com

---

## Start here

Read these in order; each has one job, so you won't find the same thing twice.

| Doc | Read it for |
|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | **Start here.** The whole system: data flow, file map, env vars, deploy, and the load-bearing invariants + gotchas that cost real debugging. |
| [DESIGN.md](DESIGN.md) | The visual system — tokens, type, states, the mark. Read before touching UI. |
| [CLAUDE.md](CLAUDE.md) | How to make changes here: think first, keep it simple, touch only what you must. |
| [AGENTS.md](AGENTS.md) | One agent-specific gotcha about this Next.js version. |

## Quickstart

```bash
npm install
# put .env.local in place (transferred separately — never committed)
npm run dev        # http://localhost:3000
npm test           # vitest, 38 tests
npm run typecheck
npm run build
```

**Deploy is `git push` to `main`** — the repo is wired to Vercel's Git integration, which builds
and ships in ~30s. No token, no CLI, no GitHub Actions needed. See ARCHITECTURE.md §6.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind v4 · Supabase Postgres · Auth.js (Naver) ·
Vercel — everything runs in Seoul (`icn1` + `ap-northeast-2`). Details and the *why* in
ARCHITECTURE.md.

## Status

Live and fully open — Naver 검수 passed, so any club member can log in and post. No open tasks;
next work is whatever real use surfaces. See ARCHITECTURE.md §10.

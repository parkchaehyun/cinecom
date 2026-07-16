# Agent guide

**Read [ARCHITECTURE.md](ARCHITECTURE.md) first** — it's the map of the whole system and the
invariants you must not break. Then [DESIGN.md](DESIGN.md) before any UI work, and follow
[CLAUDE.md](CLAUDE.md) for how to make changes here (think first, simplest thing, surgical diffs).

Two hard-won habits this project enforces, spelled out in ARCHITECTURE.md but worth repeating:

- **Verify UI on a real phone, not just headless Chrome.** Headless Chrome cannot render iOS
  Safari, and several native-form bugs shipped "verified" and were broken on iPhone.
- **Distrust the dev server's CSS.** Edits to `app/globals.css` sometimes don't reach the browser;
  confirm against a production build before concluding a rule is wrong.

The one Next.js-version note below is real — heed it.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

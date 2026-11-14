# Alook Fork — TASKS.md (NativeLayer)

Fork of alookai/alook, owned by NativeLayer / Rashad Durrand Smith.
Upstream: https://github.com/alookai/alook — Apache-2.0, TypeScript.
Fork: https://github.com/9ether530-byte/alook — public, main.
Fork point: `d668f7382a950d96db5cc47dde78e0874b2d2239`
  "feat(daemon): replace nap with memory review commits (#1302)", 2026-11-14 06:35 UTC.
  Fork and upstream were both at this head on 2026-11-14; local clone
  ~/workspace/alook-fork matches it, git-clean before this file.

Source: Avi Chawla, Nov 13, 2026 — "How to Deploy Agent Teams Across Your
Company That Work Like Actual Employees" (Nimble hosted + Alook open-source).

## Verified 2026-11-14 (most-necessary set — no new features, no deploy)
- Fork live and in sync with upstream at the fork point above.
- Secrets scan: clean. Only `.env.example` and `src/web/.dev.vars.example`
  (placeholders). No real keys, no `.dev.vars`, no private keys.
- Toolchain: Node v24.22.1, pnpm 10.33.0 via `npx -y pnpm@10.33.0`
  (corepack is missing in this sandbox; do not assume `pnpm` is on PATH).
- Install: `pnpm install --frozen-lockfile` — exit 0, 4m 27s, 1,842 packages.
  Warnings only: ignored build scripts for @openrouter/sdk and @swc/core,
  plus a better-sqlite3 DEP0176 deprecation warning.
- Scoped test: `pnpm --filter @alook/shared test` — exit 0, 159s,
  162 test files passed, 1,988 tests passed, 0 failed.
  Full turbo test suite NOT run (too heavy for this 2-core sandbox).
- Disk: node_modules 1.9G, repo total 2.1G after install (was 186M before).
- No dev server, onboard, deploy, commit, or source edits done.
  Push: this file itself was pushed to the fork's main on 2026-11-14
  at Rashad's tap (see "Pushing this file" below).

## Backlog — saved for later, each needs its own tap
1. First real use: run the fork locally on a real machine (his PC once back,
   not this sandbox) — `npx @alook/app onboard`, one room, one agent,
   one real task, and prove a handoff end to end.
2. Upstream sync policy: decide how often to pull alookai/alook main into
   this fork, and whether NativeLayer changes live on a branch or on main.
3. First NativeLayer change (scope before building): fork note / branding
   in README, plus a seed room with a Researcher → Writer pair mirroring
   the article's diagram. Keep the Alook name and Apache-2.0 attribution.
   DONE 2026-11-14: README fork note pushed as b65d3d4; Codex launch
   tightened first (approvalPolicy "on-request", sandbox "workspace-write",
   fail-closed decline responder) pushed as d2e7b0a; seed room built and
   pushed as 199c46e — idempotent owner-local seed (seedResearcherWriterRoom)
   + Bun runner src/shared/scripts/seed-researcher-writer-room.ts, 9/9 module
   tests green, runner proven twice against a real local D1 file. Runtime QA
   journeys (live @mention → draft → human approval) UNRUN — PC-side only.
4. Gemini path: Gemini arrives via the Antigravity adapter
   (gemini-3.8-flash models, GEMINI_API_KEY / GEMINI_HOME). Verify that
   adapter with his Gemini key on a real machine before depending on it.
   No standalone Gemini API adapter exists in-tree.
5. Approval-gate audit: confirm where the fork requires human approval
   before external actions (email/send) and document it — do not weaken it.
6. Deploy decision (his-side): self-host vs. Cloudflare Workers deploy
   (`pnpm deploy:web` / `deploy:ws-do` / `deploy:email` / `deploy:queue-worker`).
   No deploy attempted here; Wrangler / Cloudflare account is his call.
7. Full verification on a real machine: `pnpm check` / full test suite and
   a local dev run, since only the @alook/shared package was tested here.

## Explicitly NOT in scope
- No auto-send, no scraping, no synthetic personas, no fake submissions.
- No rebranding as a new product, no removal of upstream attribution.
- No merging upstream changes blindly; no pushing to upstream.
- No deployment, no hosted signup, no billing.

## Pushing this file
Pushed to the fork's main branch on 2026-11-14 at Rashad's tap
("Push TASKS.md to fork"), as its own commit. Before that it was
local-only.

## Fork house rules (from the fork's AGENTS.md — read 2026-11-14)
- Dev plans go in `plans/` (gitignored, local only) before implementing
  anything; a plan needs features/showcase, design overview, new deps,
  TODOS with files to modify, test cases, and QA tests.
- Run `pnpm check` before delivery (`pnpm check:full` for a complete check).
- Services must be stateless — state in DB or local files, never in memory.
- Scope queries by workspace id up front; never query then check ownership.
- Never reset / stash anyone else's git changes without asking.

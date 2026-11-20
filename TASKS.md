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

## Synced 2026-11-18 (upstream catch-up, at Rashad's tap)
- Upstream was 59 commits ahead (948 files, +35,262/−15,836). Merged
  via GitHub "Sync fork": `e2059f1` "Merge branch 'alookai:main' into
  main" (parents `5bcef59` + `685253f`). Fork is now 7 commits ahead
  of upstream, 0 behind. No conflicts; only `README.md` and
  `queries-index.ts` overlapped the fork's files, in different hunks.
  Zero upstream commits touched the Codex adapter files.
- One upstream break repaired in the same pass: upstream retired the
  plain `codex` bot backend (`BACKEND_RETIRED`). Seed default moved
  `codex` → `codex-cli` (`baea59e`), plus the seed test fixture
  (`model_observation` column added to its hand-rolled DDL — upstream
  added that column to `community_bot_binding`, and the test failed
  4/9 without it).
- Scoped checks here (full `pnpm check` still OOMs in this sandbox,
  PC-side): seed tests 9/9; `@alook/shared` suite 157 files,
  1,880 tests, all passed; shared typecheck exit 0; daemon typecheck
  exit 0 (needed a rebuild of the stale Nov 14 `@alook/agent-driver`
  `dist/` first — the 2 errors were stale declarations, not code);
  shared knip exit 0. `pnpm` is not on PATH here; the local
  `node_modules/.bin` binaries were used instead.
- Item 2 (sync policy) — DONE 2026-11-20: adopted as `SYNC-POLICY.md`
  (`6428d866`, at Rashad's tap) — weekly upstream check, merge-not-rebase,
  re-verify the Codex tighten + seed-room guard after every sync, scoped
  checks here, `pnpm check` PC-side, record in TASKS.md, deploy stays a
  separate tap.

## Backlog — saved for later, each needs its own tap
1. First real use: run the fork locally on a real machine (his PC once back,
   not this sandbox) — `npx @alook/app onboard`, one room, one agent,
   one real task, and prove a handoff end to end.
2. Upstream sync policy — DONE 2026-11-20: adopted as `SYNC-POLICY.md`
   (`6428d866`). Weekly upstream check, merge-not-rebase; NativeLayer
   changes live on main (all fork commits to date are on main, and merges
   preserve them as parents).
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

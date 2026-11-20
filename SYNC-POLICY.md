# Upstream sync policy — 9ether530-byte/alook fork

Adopted 2026-11-20, at Rashad's tap. Governs keeping this fork current
with upstream alookai/alook while preserving the fork's divergences.

1. Cadence — check upstream weekly and before any runtime QA run; never sync mid-run.
2. Method — merge upstream/main into the fork (never rebase), so the fork's commits stay visible as parents.
3. Preserve the divergence — after every sync, re-verify the Codex tighten (approvalPolicy 'on-request', sandbox_mode 'workspace-write', fail-closed responder) is intact; upstream has not fixed the approval gap, so the tighten is a real divergence, not a leftover.
4. Seed-room guard — after every sync, re-check the seed default runtime (now codex-cli, after upstream retired plain codex) and the seed test DDL against upstream schema changes (the model_observation column broke 4 of 9 tests post-merge).
5. Checks that run here — seed tests 9/9, shared suite, shared + daemon typechecks, knip; full `pnpm check` stays PC-side (OOMs in this sandbox).
6. Record — update TASKS.md with each sync's merge commit and any fix, as was done for a4d3b4c8.
7. Deploy — no deploy decision is implied by a sync; deploy stays a separate tap.

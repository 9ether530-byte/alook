# Approval-gate audit — NativeLayer fork of Alook

Date: 2026-11-14. Fork point: `d668f738`. Auditor: Orion (Muse).
Scope: where this fork already requires human approval before an
external or irreversible action, and where it does not. Evidence is
from the code in this fork; nothing here was changed to make the
audit look better. Do not weaken any gate listed here without a
separate, explicit decision.

## What IS gated

### 1. Bot creation — approval card in the owner's DM
- `src/daemon/src/drivers/systemPrompt.ts:327-328`: the bot-creation
  command "submits one approval card to the DM between you and your
  owner. It creates no bots until your human owner approves the request."
- Same file, line 422: "Only request bot creation when your owner
  explicitly asks. The later approval card does not authorize you to
  initiate requests on your own."
- Backed by the `community_bot_approval_request` table
  (`src/shared/src/db/community-schema.ts:518`): `bot_id`,
  `requested_by_user_id`, `dm_message_id`, `status` default `pending`,
  `resolved_at`. A pending request is a row, not just a message.

### 2. Friend requests / addressing a bot — owner approval
- `src/daemon/src/cli/index.ts:1012`: friend requests by handle are
  "owner-approval required".
- `src/daemon/src/cli/proxyServerApi.ts:405`: "The credential owns
  requester identity; bot requests retain owner approval."
- Friendship rows carry `needsOwnerApproval`
  (`src/shared/src/db/community-schema.ts:300-302`): "Whose
  owner-approval this row is currently waiting on. Null for
  human↔human (no gate)."
- The queries in `src/shared/src/db/queries/community/friendship.ts`
  enforce a target-consent guardrail: requests are decided via the DM
  approval card, and a stranger→owner's-bot request is not actioned
  outside that card.

### 3. Automation access codes — scoped, capped, expiring permissions
- `src/shared/src/automation.ts`: write permissions are only
  `bot.create`, `server.create`, `server.invite`, `message.send`;
  read permissions are only `machine.read`, `friend.read`,
  `server.read`. There is no permission for sending email or for
  unrestricted tool use.
- Per-permission limits are capped in code: at most 64/hour and
  1,536/day (`AUTOMATION_PERMISSION_LIMITS`). Expiry is 1h / 24h /
  7d / 30d / forever. `authenticateAccessCode`
  (`src/shared/src/db/queries/automation.ts:84`) checks the requested
  permission against the code's policy before acting.
- Audit trail: `community_bot_activity_event` retains the last 500
  audit events per bot (`src/shared/src/db/community-schema.ts`).

### 4. Local-mode email is off
- The onboard flow prints: "Local mode: email send/receive is not
  available. To enable email, connect to alook.ai cloud."
  (`src/app/src/commands/onboard.ts`). Nothing in local mode sends
  email on an agent's behalf.

## What is NOT gated — the gaps

### A. Coding-agent tool calls are not individually approval-gated
- The Codex adapter launches Codex with `approvalPolicy: "never"` and
  `sandbox: "danger-full-access"`
  (`src/daemon/agent-driver/src/adapters/codex/index.ts:299-301`).
  In-session, the coding agent's tool calls run without a per-action
  human approval step. This is the largest gap in the audit.
- Do not claim "human approval before external actions" as a blanket
  property of this fork. It holds for bot creation, addressing, and
  automation-code scope (sections 1–3 above). It does not hold for
  in-session agent tool use.

### B. No generic per-message approval card before an agent sends
- `message.send` is a capped automation permission (section 3), not a
  per-message approval card. No code was found that requires a human
  to approve each individual agent message before it is sent in-room.
- The Writer draft in the planned seed room must therefore stay
  in-room by design (see `plans/seed-researcher-writer-room.md`),
  not by relying on a per-message gate that does not exist.

## Recommendations (not implemented — each needs its own tap)
1. Keep gates 1–3 as they are. Do not add a permission, raise a cap,
   or extend an expiry without recording why.
2. Decide explicitly, before the seed room is built, whether the
   Codex `approvalPolicy: "never"` / `danger-full-access` launch is
   acceptable for NativeLayer use — and if not, what replaces it.
   Do not change it quietly inside another change.
3. When the seed room is built, prove the Writer draft stays in-room
   without human approval (test case in the seed-room plan).
4. Re-run this audit after any upstream sync, since upstream may move
   any of these gates.

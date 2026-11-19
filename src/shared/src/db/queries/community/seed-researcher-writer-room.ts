import { and, eq, isNull } from "drizzle-orm"
import type { Database } from "../../index"
import { communityChannel, communityServer } from "../../community-schema"
import { communityBotBinding } from "../../community-machine-schema"
import { user } from "../../schema"
import { BotCreationError, resolveBotCreationConfiguration } from "../../../community-bot-creation"
import { createServer } from "./server"
import { createChannel, createChannelMember } from "./channel"
import { addMember, getMember } from "./member"
import { createBot, getMachineForOwner, updateBot } from "./bot"
import { getBotCapacitySummary } from "../product-plan"

export const SEED_SERVER_NAME = "NativeLayer — Research → Write"
export const SEED_CHANNEL_NAME = "research-write"
export const SEED_RESEARCHER_NAME = "Researcher"
export const SEED_WRITER_NAME = "Writer"
export const SEED_RUNTIME_DEFAULT = "codex-cli"

export const RESEARCHER_INSTRUCTION =
  "You are the Researcher in the room 'NativeLayer — Research → Write'. " +
  "Your job: take a topic the human gives you, make a short research plan, " +
  "search the web with the webSearch tool, and post your findings in-thread " +
  "as a structured summary. Rules: every factual claim cites its source " +
  "with a URL — prices and plans especially; never state a price, plan, or " +
  "limit you did not read from a source. If sources disagree, say so and " +
  "show both. When you finish, end with one line suggesting the human " +
  "mention @Writer to draft from your findings. You never send anything " +
  "outside this room. If the topic is ambiguous, ask the human one " +
  "clarifying question before researching."

export const WRITER_INSTRUCTION =
  "You are the Writer in the room 'NativeLayer — Research → Write'. Your " +
  "job: when the human mentions you, take the Researcher's findings in this " +
  "same room and draft the piece from them, then post the draft in this " +
  "room marked as a DRAFT. Rules: draft only from the Researcher's cited " +
  "findings — do not invent facts, prices, or claims; keep the draft in " +
  "this room; never email it, publish it, post it elsewhere, or act on it " +
  "in any way. After posting the draft, wait: only a human reply of " +
  "'approved' in this room authorizes any next step, and a revision request " +
  "means you revise the draft in-room. No human approval ever arrives by " +
  "any other channel."

export interface SeedResearcherWriterRoomInput {
  ownerId: string
  machineId: string
  runtime?: string
  modelName?: string | null
  serverName?: string
  channelName?: string
}

export interface SeedResearcherWriterRoomResult {
  serverId: string
  channelId: string
  researcher: { botId: string; created: boolean }
  writer: { botId: string; created: boolean }
  serverCreated: boolean
  channelCreated: boolean
  created: boolean
}

interface SeedBotSpec {
  name: string
  instruction: string
}

const SEED_BOTS: SeedBotSpec[] = [
  { name: SEED_RESEARCHER_NAME, instruction: RESEARCHER_INSTRUCTION },
  { name: SEED_WRITER_NAME, instruction: WRITER_INSTRUCTION },
]

async function findSeedServer(db: Database, ownerId: string, name: string) {
  const rows = await db
    .select({ id: communityServer.id })
    .from(communityServer)
    .where(and(eq(communityServer.ownerId, ownerId), eq(communityServer.name, name)))
    .limit(1)
  return rows[0] ?? null
}

async function findSeedChannel(db: Database, serverId: string, name: string) {
  const rows = await db
    .select({ id: communityChannel.id })
    .from(communityChannel)
    .where(
      and(
        eq(communityChannel.serverId, serverId),
        eq(communityChannel.name, name),
        isNull(communityChannel.parentChannelId),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

async function findOwnedBot(db: Database, ownerId: string, name: string) {
  const rows = await db
    .select({ id: user.id, instruction: communityBotBinding.instruction })
    .from(user)
    .leftJoin(communityBotBinding, eq(communityBotBinding.userId, user.id))
    .where(
      and(
        eq(user.ownerUserId, ownerId),
        eq(user.name, name),
        eq(user.isBot, true),
        isNull(user.deletedAt),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

async function ensureChannelAccess(db: Database, channelId: string, userId: string, addedBy: string) {
  // createChannelMember is itself idempotent (ON CONFLICT DO NOTHING on
  // channel_id + user_id + relation), so this is safe to call on re-runs.
  await createChannelMember(db, { channelId, userId, addedBy, relation: "access", source: "added" })
}

/**
 * Idempotent first-run seed for the "NativeLayer — Research → Write" room.
 *
 * Runs as the owner (the same authority as the web UI's create-bot button):
 * it uses the owner-direct `createBot` path and never submits or decides a
 * bot-creation request, so the agent-initiated approval card flow is
 * untouched. A second run reuses the server, channel, and bots it finds and
 * repairs a drifted bot instruction; it creates zero new rows.
 *
 * Local-only: call with the local D1 handle after onboard. Never run
 * against the hosted service.
 */
export async function seedResearcherWriterRoom(
  db: Database,
  input: SeedResearcherWriterRoomInput,
): Promise<SeedResearcherWriterRoomResult> {
  const runtime = input.runtime ?? SEED_RUNTIME_DEFAULT
  const serverName = input.serverName ?? SEED_SERVER_NAME
  const channelName = input.channelName ?? SEED_CHANNEL_NAME

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, input.ownerId), eq(user.isBot, false), isNull(user.deletedAt)))
    .limit(1)
  if (!owner) throw new Error(`seed owner not found: ${input.ownerId}`)

  const machine = await getMachineForOwner(db, input.machineId, input.ownerId)
  if (!machine) throw new Error(`seed machine not found: ${input.machineId}`)
  const backend = machine.availableRuntimes.find((candidate) => candidate.id === runtime)
  const effort = resolveBotCreationConfiguration(machine, backend, {
    backendId: runtime,
    model: input.modelName ?? null,
    reasoningEffort: null,
  })

  const existingServer = await findSeedServer(db, input.ownerId, serverName)
  let serverId: string
  let serverCreated = false
  if (existingServer) {
    serverId = existingServer.id
  } else {
    const created = await createServer(db, {
      name: serverName,
      description: "Researcher finds it, Writer drafts it, the human approves it — all in this room.",
      ownerId: input.ownerId,
    })
    serverId = created.server.id
    serverCreated = true
  }

  const existingChannel = await findSeedChannel(db, serverId, channelName)
  let channelId: string
  let channelCreated = false
  if (existingChannel) {
    channelId = existingChannel.id
  } else {
    const created = await createChannel(db, {
      serverId,
      name: channelName,
      type: "text",
      topic: "Researcher → Writer: @Researcher to research, @Writer to draft, human approves in-room.",
      creatorId: input.ownerId,
    })
    channelId = created.id
    channelCreated = true
  }

  const missing = (
    await Promise.all(
      SEED_BOTS.map(async (spec) => (await findOwnedBot(db, input.ownerId, spec.name)) ? null : spec),
    )
  ).filter((spec): spec is SeedBotSpec => spec !== null)
  if (missing.length > 0) {
    const capacity = await getBotCapacitySummary(db, input.ownerId)
    const available = Math.max(0, capacity.limit - capacity.ownedCount)
    if (available < missing.length) {
      throw new BotCreationError("BOT_LIMIT_REACHED", "Not enough bot slots for the seed room", 409, {
        required: missing.length,
        available,
        plan: capacity.plan.id,
        limit: capacity.limit,
        ownedCount: capacity.ownedCount,
      })
    }
  }

  const bots: SeedResearcherWriterRoomResult["researcher"][] = []
  let anyBotCreated = false
  for (const spec of SEED_BOTS) {
    const existing = await findOwnedBot(db, input.ownerId, spec.name)
    let botId: string
    let created = false
    if (existing) {
      botId = existing.id
      if (existing.instruction !== spec.instruction) {
        await updateBot(db, botId, input.ownerId, { description: spec.instruction })
      }
    } else {
      const made = await createBot(db, {
        ownerId: input.ownerId,
        name: spec.name,
        description: spec.instruction,
        machineId: input.machineId,
        runtime,
        modelName: input.modelName ?? null,
        reasoningEffort: effort.canonicalEffort,
      })
      botId = made.botId
      created = true
      anyBotCreated = true
    }
    if (!(await getMember(db, serverId, botId))) {
      await addMember(db, { serverId, userId: botId })
    }
    await ensureChannelAccess(db, channelId, botId, input.ownerId)
    bots.push({ botId, created })
  }

  return {
    serverId,
    channelId,
    researcher: bots[0]!,
    writer: bots[1]!,
    serverCreated,
    channelCreated,
    created: serverCreated || channelCreated || anyBotCreated,
  }
}

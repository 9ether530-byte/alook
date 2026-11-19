import Sqlite from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as userSchema from "../../schema"
import * as communitySchema from "../../community-schema"
import * as communityMachineSchema from "../../community-machine-schema"
import * as productPlanSchema from "../../product-plan-schema"
import * as botCreationSchema from "../../bot-creation-schema"
import type { Database } from "../../index"
import { communityBotBinding } from "../../community-machine-schema"
import { communityChannel, communityChannelMember, communityServer, communityServerMember } from "../../community-schema"
import { user } from "../../schema"
import { BotCreationError } from "../../../community-bot-creation"
import {
  RESEARCHER_INSTRUCTION,
  SEED_CHANNEL_NAME,
  SEED_SERVER_NAME,
  WRITER_INSTRUCTION,
  seedResearcherWriterRoom,
} from "./seed-researcher-writer-room"

type BatchStatement = { all(): unknown; run(): unknown }

function createTestDb(sqlite: Sqlite.Database): Database {
  const db = drizzle(sqlite, {
    schema: {
      ...userSchema,
      ...communitySchema,
      ...communityMachineSchema,
      ...productPlanSchema,
      ...botCreationSchema,
    },
  })
  // D1's batch maps every statement through its result mapper, so a
  // RETURNING statement yields rows at any index. better-sqlite3's
  // `.all()` throws before executing when a statement returns no data,
  // so fall back to `.run()` for plain writes — that is the faithful
  // equivalent (the funnel tests' index-0-only shim cannot run
  // createServer, whose 7th statement also returns rows).
  Object.assign(db, {
    batch: async (statements: BatchStatement[]) => sqlite.transaction(() =>
      statements.map((statement) => {
        try {
          return statement.all()
        } catch (error) {
          if (error instanceof TypeError && /does not return data/.test(error.message)) return statement.run()
          throw error
        }
      }),
    )(),
  })
  return db as unknown as Database
}

const DDL = `
CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER,
  image TEXT,
  avatarVersion INTEGER NOT NULL DEFAULT 0,
  avatarObjectKey TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isBot INTEGER NOT NULL DEFAULT 0,
  ownerUserId TEXT,
  deletedAt TEXT,
  discriminator TEXT NOT NULL DEFAULT '0000',
  lastRefreshContextAt TEXT
);
CREATE TABLE community_server (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  discriminator TEXT NOT NULL DEFAULT '0000',
  description TEXT DEFAULT '',
  icon TEXT,
  official INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE community_category (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  private INTEGER DEFAULT 0,
  creator_id TEXT,
  UNIQUE(server_id, name)
);
CREATE TABLE community_channel (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  category_id TEXT,
  name TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  topic TEXT DEFAULT '',
  position INTEGER DEFAULT 0,
  parent_channel_id TEXT,
  creator_id TEXT,
  message_count INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  parent_message_id TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE community_channel_member (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'access',
  source TEXT NOT NULL DEFAULT 'added',
  added_by TEXT,
  added_at TEXT NOT NULL,
  UNIQUE(channel_id, user_id, relation)
);
CREATE TABLE community_server_member (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TEXT NOT NULL,
  UNIQUE(server_id, user_id)
);
CREATE TABLE community_bot_binding (
  user_id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL,
  runtime TEXT NOT NULL,
  instruction TEXT NOT NULL DEFAULT '',
  model_name TEXT,
  model_observation TEXT,
  reasoning_effort TEXT,
  runtime_config_revision INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE community_user_profile (
  user_id TEXT PRIMARY KEY NOT NULL,
  about_me TEXT DEFAULT '',
  banner_color TEXT,
  status_emoji TEXT,
  status_text TEXT DEFAULT ''
);
CREATE TABLE community_machine (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  hostname TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  arch TEXT NOT NULL DEFAULT '',
  os_release TEXT NOT NULL DEFAULT '',
  daemon_version TEXT NOT NULL DEFAULT '',
  time_zone TEXT,
  metadata TEXT,
  available_runtimes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE product_plan (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE product_plan_entitlement (
  plan_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE user_product_plan (
  user_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  is_founder INTEGER NOT NULL DEFAULT 0,
  assigned_at TEXT NOT NULL
);
CREATE TABLE community_bot_creation_request (
  id TEXT PRIMARY KEY NOT NULL,
  requester_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bots TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  decision_nonce TEXT
);
`

describe("seedResearcherWriterRoom", () => {
  let sqlite: Sqlite.Database
  let db: Database

  beforeEach(() => {
    sqlite = new Sqlite(":memory:")
    sqlite.exec(DDL)
    const now = "2026-11-14T00:00:00.000Z"
    sqlite.prepare("INSERT INTO user (id, name, email, isBot, ownerUserId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("owner_1", "Rashad", "owner@example.test", 0, null, now, now)
    sqlite.prepare("INSERT INTO community_machine (id, user_id, display_name, status, available_runtimes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("machine_1", "owner_1", "PC", "online", JSON.stringify([{ id: "codex-cli", status: "healthy" }]), now, now)
    sqlite.prepare("INSERT INTO product_plan (id, display_name, is_default, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("free", "Free", 1, 1, now, now)
    sqlite.prepare("INSERT INTO product_plan_entitlement (plan_id, entitlement_key, value_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("free", "bots.max", "10", now, now)
    db = createTestDb(sqlite)
  })

  afterEach(() => sqlite.close())

  async function count(table: "server" | "channel" | "bot" | "creation_request") {
    if (table === "server") {
      return (await db.select().from(communityServer).where(eq(communityServer.name, SEED_SERVER_NAME))).length
    }
    if (table === "channel") {
      return (await db.select().from(communityChannel).where(eq(communityChannel.name, SEED_CHANNEL_NAME))).length
    }
    if (table === "bot") {
      return (await db.select().from(user).where(and(eq(user.ownerUserId, "owner_1"), eq(user.isBot, true)))).length
    }
    const rows = sqlite.prepare("SELECT COUNT(*) AS n FROM community_bot_creation_request").all() as Array<{ n: number }>
    return rows[0]!.n
  }

  it("seeds the room, channel, and both bots on first run", async () => {
    const result = await seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" })

    expect(result.created).toBe(true)
    expect(result.serverCreated).toBe(true)
    expect(result.channelCreated).toBe(true)
    expect(result.researcher.created).toBe(true)
    expect(result.writer.created).toBe(true)

    const [server] = await db.select().from(communityServer).where(eq(communityServer.id, result.serverId))
    expect(server?.name).toBe(SEED_SERVER_NAME)
    expect(server?.ownerId).toBe("owner_1")

    const [channel] = await db.select().from(communityChannel).where(eq(communityChannel.id, result.channelId))
    expect(channel?.serverId).toBe(result.serverId)
    expect(channel?.name).toBe(SEED_CHANNEL_NAME)
    expect(channel?.type).toBe("text")

    for (const [bot, name, instruction] of [
      [result.researcher, "Researcher", RESEARCHER_INSTRUCTION],
      [result.writer, "Writer", WRITER_INSTRUCTION],
    ] as const) {
      const [botUser] = await db.select().from(user).where(eq(user.id, bot.botId))
      expect(botUser?.name).toBe(name)
      expect(botUser?.isBot).toBe(true)
      const [binding] = await db.select().from(communityBotBinding).where(eq(communityBotBinding.userId, bot.botId))
      expect(binding?.runtime).toBe("codex-cli")
      expect(binding?.machineId).toBe("machine_1")
      expect(binding?.instruction).toBe(instruction)
      const [serverMember] = await db.select().from(communityServerMember).where(
        and(eq(communityServerMember.serverId, result.serverId), eq(communityServerMember.userId, bot.botId)),
      )
      expect(serverMember).toBeDefined()
      const [channelMember] = await db.select().from(communityChannelMember).where(
        and(eq(communityChannelMember.channelId, result.channelId), eq(communityChannelMember.userId, bot.botId)),
      )
      expect(channelMember?.relation).toBe("access")
    }
  })

  it("second run creates no duplicates and returns the same ids", async () => {
    const first = await seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" })
    const second = await seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" })

    expect(second.created).toBe(false)
    expect(second.serverCreated).toBe(false)
    expect(second.channelCreated).toBe(false)
    expect(second.serverId).toBe(first.serverId)
    expect(second.channelId).toBe(first.channelId)
    expect(second.researcher.botId).toBe(first.researcher.botId)
    expect(second.writer.botId).toBe(first.writer.botId)
    expect(second.researcher.created).toBe(false)
    expect(second.writer.created).toBe(false)

    expect(await count("server")).toBe(1)
    expect(await count("channel")).toBe(1)
    expect(await count("bot")).toBe(2)
  })

  it("repairs a drifted bot instruction on re-run without duplicating the bot", async () => {
    const first = await seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" })
    await db
      .update(communityBotBinding)
      .set({ instruction: "stale instructions" })
      .where(eq(communityBotBinding.userId, first.researcher.botId))

    const second = await seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" })

    expect(second.researcher.botId).toBe(first.researcher.botId)
    expect(second.researcher.created).toBe(false)
    expect(await count("bot")).toBe(2)
    const [binding] = await db.select().from(communityBotBinding).where(eq(communityBotBinding.userId, first.researcher.botId))
    expect(binding?.instruction).toBe(RESEARCHER_INSTRUCTION)
  })

  it("never creates a bot-creation request", async () => {
    await seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" })
    await seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" })
    expect(await count("creation_request")).toBe(0)
  })

  it("rejects an unknown owner", async () => {
    await expect(
      seedResearcherWriterRoom(db, { ownerId: "ghost", machineId: "machine_1" }),
    ).rejects.toThrow("seed owner not found")
  })

  async function expectBotError(promise: Promise<unknown>, code: string) {
    let caught: unknown
    try {
      await promise
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(BotCreationError)
    expect((caught as BotCreationError).code).toBe(code)
  }

  it("rejects an offline machine", async () => {
    sqlite.prepare("UPDATE community_machine SET status = 'offline' WHERE id = 'machine_1'").run()
    await expectBotError(
      seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" }),
      "MACHINE_OFFLINE",
    )
  })

  it("rejects a machine without the requested runtime", async () => {
    sqlite.prepare("UPDATE community_machine SET available_runtimes = ? WHERE id = 'machine_1'")
      .run(JSON.stringify([{ id: "claude", status: "healthy" }]))
    await expectBotError(
      seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" }),
      "BACKEND_NOT_FOUND",
    )
  })

  it("rejects when bot capacity is exhausted", async () => {
    sqlite.prepare("UPDATE product_plan_entitlement SET value_json = '0' WHERE entitlement_key = 'bots.max'").run()
    await expectBotError(
      seedResearcherWriterRoom(db, { ownerId: "owner_1", machineId: "machine_1" }),
      "BOT_LIMIT_REACHED",
    )
  })

  it("instructions forbid any external send", () => {
    expect(RESEARCHER_INSTRUCTION).toContain("never send anything outside this room")
    expect(WRITER_INSTRUCTION).toContain("never email it, publish it, post it elsewhere")
    expect(WRITER_INSTRUCTION).toContain("only a human reply of 'approved'")
  })
})

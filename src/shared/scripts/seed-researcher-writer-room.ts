// Local-only runner for the Researcher → Writer seed room.
// Run with Bun from the repo root:
//   bun src/shared/scripts/seed-researcher-writer-room.ts [--state-dir <dir>] [--owner-id <id>] [--machine-id <id>] [--runtime <id>] [--model <name>]
//
// It opens the LOCAL D1 SQLite file under the wrangler state dir, resolves
// the owner and the online machine, and calls seedResearcherWriterRoom.
// It never touches the hosted service, needs no secrets, and creates
// nothing when the seed already exists (run it twice to prove it).
//
// Why Bun (not Node): the local D1 file is SQLite; Bun's built-in
// `bun:sqlite` reads it directly. better-sqlite3's native binding does
// not load under Bun, and Node cannot run this repo's extensionless
// TypeScript imports — so the runner lives here, next to the shared
// package whose node_modules resolve `drizzle-orm/bun-sqlite`.

import { Database as BunDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { and, eq, isNull } from "drizzle-orm";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as schema from "../src/db/schema";
import * as communitySchema from "../src/db/community-schema";
import * as communityMachineSchema from "../src/db/community-machine-schema";
import * as billingSchema from "../src/db/billing-schema";
import * as productPlanSchema from "../src/db/product-plan-schema";
import * as communityFunnelAnalyticsSchema from "../src/db/community-funnel-analytics-schema";
import * as botCreationSchema from "../src/db/bot-creation-schema";
import * as automationSchema from "../src/db/automation-schema";
import * as feedbackSchema from "../src/db/feedback-schema";
import { user } from "../src/db/schema";
import { communityMachine } from "../src/db/community-machine-schema";
import type { Database } from "../src/db/index";
import {
  SEED_RUNTIME_DEFAULT,
  seedResearcherWriterRoom,
} from "../src/db/queries/community/seed-researcher-writer-room";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function findSqliteFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) findSqliteFiles(path, out);
    else if (entry.endsWith(".sqlite")) out.push(path);
  }
  return out;
}

function findLocalD1(stateDirs: string[]): string {
  for (const dir of stateDirs) {
    for (const file of findSqliteFiles(dir)) {
      let probe: BunDatabase | null = null;
      try {
        probe = new BunDatabase(file, { readonly: true });
        const row = probe.query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'community_server'",
        ).get() as { name: string } | null;
        if (row) return file;
      } catch {
        // not a D1 file — try the next one
      } finally {
        probe?.close();
      }
    }
  }
  throw new Error(
    `no local D1 sqlite file found under: ${stateDirs.join(", ")} — is the local web app migrated (pnpm db:migrate)?`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stateDirs = [
    flagValue(args, "--state-dir"),
    join(REPO_ROOT, "src/web/.wrangler/state"),
    join(homedir(), ".alook/self-hosted/web/.wrangler/state"),
  ].filter((dir): dir is string => Boolean(dir));

  const dbPath = findLocalD1(stateDirs);
  console.log(`Local D1: ${dbPath}`);

  const sqlite = new BunDatabase(dbPath);
  const db = drizzle(sqlite, {
    schema: {
      ...schema,
      ...communitySchema,
      ...communityMachineSchema,
      ...productPlanSchema,
      ...billingSchema,
      ...communityFunnelAnalyticsSchema,
      ...botCreationSchema,
      ...automationSchema,
      ...feedbackSchema,
    },
  });
  // drizzle's bun-sqlite session has no batch(); D1's batch maps every
  // statement through its result mapper, and bun:sqlite's `.all()` returns
  // rows for RETURNING statements and [] for plain writes — so `.all()` on
  // every statement is the faithful equivalent here.
  Object.assign(db, {
    batch: async (statements: Array<{ all(): unknown }>) =>
      sqlite.transaction(() => statements.map((statement) => statement.all()))(),
  });
  const typedDb = db as unknown as Database;

  let ownerId = flagValue(args, "--owner-id");
  if (!ownerId) {
    const owners = await typedDb
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.isBot, false), isNull(user.deletedAt)));
    if (owners.length !== 1) {
      throw new Error(
        `expected exactly one human owner in the local DB, found ${owners.length} — pass --owner-id explicitly`,
      );
    }
    ownerId = owners[0]!.id;
  }

  let machineId = flagValue(args, "--machine-id");
  if (!machineId) {
    const machines = await typedDb
      .select({ id: communityMachine.id })
      .from(communityMachine)
      .where(and(eq(communityMachine.userId, ownerId), eq(communityMachine.status, "online")));
    if (machines.length !== 1) {
      throw new Error(
        `expected exactly one online machine for this owner, found ${machines.length} — pass --machine-id explicitly`,
      );
    }
    machineId = machines[0]!.id;
  }

  const result = await seedResearcherWriterRoom(typedDb, {
    ownerId,
    machineId,
    runtime: flagValue(args, "--runtime") ?? SEED_RUNTIME_DEFAULT,
    modelName: flagValue(args, "--model") ?? null,
  });

  console.log("Seed room ready:");
  console.log(`  server:     ${result.serverId} (created: ${result.serverCreated})`);
  console.log(`  channel:    ${result.channelId} (created: ${result.channelCreated})`);
  console.log(`  Researcher: ${result.researcher.botId} (created: ${result.researcher.created})`);
  console.log(`  Writer:     ${result.writer.botId} (created: ${result.writer.created})`);
  console.log(result.created ? "  (something was created)" : "  (already seeded — nothing created)");
  sqlite.close();
}

main().catch((error) => {
  console.error(`seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

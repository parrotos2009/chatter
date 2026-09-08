import { and, desc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { callSignals, chatMessages, chatPresence, InsertCallSignal, InsertChatMessage, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getRecentChatMessages(roomId: string, limit = 80) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chatMessages).where(eq(chatMessages.roomId, roomId)).orderBy(desc(chatMessages.createdAt)).limit(limit);
}

export async function insertChatMessage(message: InsertChatMessage) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(chatMessages).values(message);
  const id = Number(result[0].insertId);
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.id, id)).limit(1);
  return rows[0];
}

export async function upsertPresence(input: { clientId: string; displayName: string; roomId: string; isTyping: boolean }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatPresence).values({ ...input, isTyping: input.isTyping ? 1 : 0, lastSeenAt: new Date() }).onDuplicateKeyUpdate({
    set: { displayName: input.displayName, roomId: input.roomId, isTyping: input.isTyping ? 1 : 0, lastSeenAt: new Date() },
  });
}

export async function getActivePresence(roomId: string) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - 25_000);
  return db.select().from(chatPresence).where(and(eq(chatPresence.roomId, roomId), gt(chatPresence.lastSeenAt, cutoff)));
}

export async function insertCallSignal(signal: InsertCallSignal) {
  const db = await getDb();
  if (!db) return;
  await db.insert(callSignals).values(signal);
}

export async function getCallSignals(roomId: string, toClientId: string, after: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callSignals).where(and(eq(callSignals.roomId, roomId), eq(callSignals.toClientId, toClientId), gt(callSignals.createdAt, after))).orderBy(callSignals.createdAt).limit(40);
}

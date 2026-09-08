import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: varchar("roomId", { length: 64 }).notNull().default("lobby"),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  text: text("text"),
  attachmentUrl: text("attachmentUrl"),
  attachmentName: varchar("attachmentName", { length: 255 }),
  attachmentType: varchar("attachmentType", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

export const chatPresence = mysqlTable("chatPresence", {
  clientId: varchar("clientId", { length: 64 }).primaryKey(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  roomId: varchar("roomId", { length: 64 }).notNull().default("lobby"),
  isTyping: int("isTyping").notNull().default(0),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
});

export type ChatPresence = typeof chatPresence.$inferSelect;
export type InsertChatPresence = typeof chatPresence.$inferInsert;

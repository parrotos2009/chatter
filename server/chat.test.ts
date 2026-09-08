import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getActivePresence: vi.fn(async () => []),
  getRecentChatMessages: vi.fn(async () => []),
  insertChatMessage: vi.fn(),
  upsertPresence: vi.fn(async () => undefined),
}));

import { appRouter } from "./routers";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describe("chat room", () => {
  it("rejects messages without text or an attachment", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.chat.send({ roomId: "lobby", clientId: "guest-1", displayName: "Guest" })).rejects.toThrow("message or attachment");
  });

  it("accepts a presence heartbeat for a guest without touching the database", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.chat.presence({ roomId: "lobby", clientId: "guest-1", displayName: "Guest", isTyping: true })).resolves.toEqual({ ok: true });
  });
});

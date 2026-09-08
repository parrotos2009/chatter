import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  clearRoomMessages: vi.fn(async () => undefined),
  getActivePresence: vi.fn(async () => []),
  getCallSignals: vi.fn(async () => []),
  getRecentChatMessages: vi.fn(async () => []),
  insertCallSignal: vi.fn(async () => undefined),
  insertChatMessage: vi.fn(),
  insertChatRoom: vi.fn(async (room) => room),
  listChatRooms: vi.fn(async () => []),
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

  it("accepts a WebRTC offer signal", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.rtc.sendSignal({ roomId: "lobby", fromClientId: "guest-1", toClientId: "guest-2", kind: "offer", payload: "{}" })).resolves.toEqual({ ok: true });
  });

  it("returns pending signals for a client", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.rtc.signals({ roomId: "lobby", toClientId: "guest-2", after: new Date(0) });
    expect(result).toEqual([]);
  });

  it("creates a shareable room identifier", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.rooms.create({ name: "Weekend plans", createdBy: "guest-1" });
    expect(result.name).toBe("Weekend plans");
    expect(result.id).toMatch(/^weekend-plans-/);
  });

  it("lists public rooms without authentication", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.rooms.list()).resolves.toEqual([]);
  });

  it("requires the explicit CLEAR confirmation", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.rooms.clear({ roomId: "lobby", confirmation: "NO" as "CLEAR" })).rejects.toThrow();
  });
});

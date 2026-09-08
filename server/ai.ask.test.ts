import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: "Here is a concise summary." } }],
  })),
}));

import { appRouter } from "./routers";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("ai.ask", () => {
  it("returns a concise assistant response with public access", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.ai.ask({
      prompt: "Summarize this chat",
      context: "Maya: The launch notes look great",
    });

    expect(result).toEqual({ text: "Here is a concise summary." });
  });

  it("rejects an empty prompt", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.ai.ask({ prompt: "", context: "" })).rejects.toThrow();
  });
});

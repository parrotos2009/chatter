import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getActivePresence, getCallSignals, getRecentChatMessages, insertCallSignal, insertChatMessage, upsertPresence } from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

const roomInput = z.object({ roomId: z.string().min(1).max(64).default("lobby") });
const identityInput = z.object({ clientId: z.string().min(1).max(64), displayName: z.string().min(1).max(120) });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  chat: router({
    recent: publicProcedure.input(roomInput).query(async ({ input }) => {
      const messages = await getRecentChatMessages(input.roomId);
      return messages.reverse();
    }),
    send: publicProcedure.input(z.object({
      roomId: z.string().min(1).max(64).default("lobby"),
      clientId: z.string().min(1).max(64),
      displayName: z.string().min(1).max(120),
      text: z.string().max(4000).optional(),
      attachmentUrl: z.string().max(1000).optional(),
      attachmentName: z.string().max(255).optional(),
      attachmentType: z.string().max(120).optional(),
    })).mutation(async ({ input }) => {
      if (!input.text?.trim() && !input.attachmentUrl) throw new Error("A message or attachment is required");
      const message = await insertChatMessage({ ...input, text: input.text?.trim() || null });
      return message;
    }),
    presence: publicProcedure.input(identityInput.merge(roomInput).extend({ isTyping: z.boolean().default(false) })).mutation(async ({ input }) => {
      await upsertPresence(input);
      return { ok: true } as const;
    }),
    activePresence: publicProcedure.input(roomInput).query(async ({ input }) => getActivePresence(input.roomId)),
    upload: publicProcedure.input(z.object({ clientId: z.string().min(1).max(64), fileName: z.string().min(1).max(255), mimeType: z.string().max(120), base64: z.string().max(12_000_000) })).mutation(async ({ input }) => {
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const buffer = Buffer.from(input.base64, "base64");
      const { url } = await storagePut(`${input.clientId}-shared/${nanoid(10)}-${safeName}`, buffer, input.mimeType || "application/octet-stream");
      return { url, fileName: input.fileName, mimeType: input.mimeType };
    }),
  }),
  rtc: router({
    sendSignal: publicProcedure.input(z.object({ roomId: z.string().min(1).max(64).default("lobby"), fromClientId: z.string().min(1).max(64), toClientId: z.string().min(1).max(64), kind: z.enum(["offer", "answer", "candidate", "hangup"]), payload: z.string().max(20_000) })).mutation(async ({ input }) => {
      await insertCallSignal(input);
      return { ok: true } as const;
    }),
    signals: publicProcedure.input(z.object({ roomId: z.string().min(1).max(64).default("lobby"), toClientId: z.string().min(1).max(64), after: z.coerce.date() })).query(async ({ input }) => getCallSignals(input.roomId, input.toClientId, input.after)),
  }),
});

export type AppRouter = typeof appRouter;

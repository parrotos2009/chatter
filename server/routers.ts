import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

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
  ai: router({
    ask: publicProcedure
      .input(z.object({ prompt: z.string().min(1).max(500), context: z.string().max(8000).optional() }))
      .mutation(async ({ input }) => {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are Chatter Intelligence, a concise, warm assistant inside a private chat app. Use the conversation context when present. Keep responses under 100 words, use plain text, and never claim to have taken actions you did not take." },
            { role: "user", content: `Conversation context:\n${input.context || "No prior context."}\n\nRequest: ${input.prompt}` },
          ],
        });
        const content = response.choices?.[0]?.message?.content;
        const text = typeof content === "string" ? content : "I couldn't find a clear answer yet. Try asking me in a different way.";
        return { text };
      }),
  }),
});

export type AppRouter = typeof appRouter;

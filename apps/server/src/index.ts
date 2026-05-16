import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import {
  addMessage,
  createConversation,
  getConversationTitleSeed,
  getProvider,
  listConversations,
  listMessages,
  listProviders,
  migrate,
  storagePaths,
  touchConversation,
  updateMessage,
  upsertProvider
} from "./db.js";
import { streamDemoResponse, streamOpenAiCompatible } from "./chat.js";

migrate();

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
});

const providerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  kind: z.enum(["openai-compatible", "anthropic-compatible"]),
  baseUrl: z.string().min(1),
  apiKey: z.string(),
  model: z.string().min(1)
});

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  providerId: z.string().optional(),
  content: z.string().min(1)
});

app.get("/api/health", async () => ({
  ok: true,
  dataRoot: storagePaths.dataRoot
}));

app.get("/api/providers", async () => listProviders());

app.post("/api/providers", async (request) => {
  const input = providerSchema.parse(request.body);
  return upsertProvider(input);
});

app.get("/api/conversations", async () => listConversations());

app.post("/api/conversations", async () => createConversation());

app.get("/api/conversations/:id/messages", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return listMessages(params.id);
});

app.post("/api/chat/stream", async (request, reply) => {
  const input = sendMessageSchema.parse(request.body);
  const userMessage = addMessage({
    conversationId: input.conversationId,
    role: "user",
    content: input.content
  });

  const firstUserText = getConversationTitleSeed(input.conversationId);
  if (firstUserText) {
    touchConversation(input.conversationId, firstUserText.slice(0, 28));
  }

  const assistantMessage = addMessage({
    conversationId: input.conversationId,
    role: "assistant",
    content: "",
    status: "streaming"
  });

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const send = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send("message", userMessage);
  send("message", assistantMessage);

  let fullText = "";

  try {
    const history = listMessages(input.conversationId).filter((message) => message.id !== assistantMessage.id);
    const provider = input.providerId ? getProvider(input.providerId) : null;
    const stream =
      provider && provider.kind === "openai-compatible"
        ? streamOpenAiCompatible(provider, history)
        : streamDemoResponse(input.content);

    for await (const chunk of stream) {
      fullText += chunk.text;
      send("delta", {
        id: assistantMessage.id,
        text: chunk.text
      });
    }

    updateMessage(assistantMessage.id, fullText, "complete");
    send("done", {
      id: assistantMessage.id,
      content: fullText
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat error";
    updateMessage(assistantMessage.id, fullText || message, "error");
    send("error", {
      id: assistantMessage.id,
      message
    });
  } finally {
    reply.raw.end();
  }
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });

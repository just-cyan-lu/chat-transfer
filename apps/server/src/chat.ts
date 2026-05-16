import type { Message, Provider } from "@chat-transfer/shared";

export type ChatChunk = {
  text: string;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function endpointFor(provider: Provider) {
  const base = normalizeBaseUrl(provider.baseUrl);
  if (base.endsWith("/chat/completions")) {
    return base;
  }
  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

export async function* streamOpenAiCompatible(provider: Provider, messages: Message[]): AsyncGenerator<ChatChunk> {
  const response = await fetch(endpointFor(provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      messages: messages
        .filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role,
          content: message.content
        }))
    })
  });

  if (!response.ok || !response.body) {
    const details = await response.text().catch(() => "");
    throw new Error(`Provider request failed: ${response.status} ${details}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
            };
          }>;
        };
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield { text };
      } catch {
        continue;
      }
    }
  }
}

export async function* streamDemoResponse(userText: string): AsyncGenerator<ChatChunk> {
  const text = [
    "我已经收到这条消息。现在还没有配置真实模型 Provider，所以这是本地演示回复。\n\n",
    "等你在左侧的模型设置里填入 baseURL、API Key 和 model 后，我会通过本地服务端代理请求模型，并把会话保存进 SQLite。",
    userText ? `\n\n你刚才说的是：${userText}` : ""
  ].join("");

  for (const char of text) {
    await new Promise((resolve) => setTimeout(resolve, 8));
    yield { text: char };
  }
}

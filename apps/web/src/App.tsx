import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  ChevronsUp,
  KeyRound,
  MessageSquarePlus,
  PanelRight,
  Send,
  Settings2,
  Sparkles,
  UserRound
} from "lucide-react";
import type { Conversation, Message, ProviderKind, ProviderSummary } from "@chat-transfer/shared";

type ProviderForm = {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
};

const emptyProviderForm: ProviderForm = {
  name: "OpenAI Compatible",
  kind: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1"
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function upsertMessage(messages: Message[], next: Message): Message[] {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) return [...messages, next];
  return messages.map((message) => (message.id === next.id ? next : message));
}

export default function App() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(emptyProviderForm);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [statusText, setStatusText] = useState("本地服务连接中");

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations]
  );

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [providerList, conversationList] = await Promise.all([
          api<ProviderSummary[]>("/api/providers"),
          api<Conversation[]>("/api/conversations")
        ]);
        if (cancelled) return;

        setProviders(providerList);
        setSelectedProviderId(providerList[0]?.id ?? "");

        let nextConversations = conversationList;
        if (nextConversations.length === 0) {
          const created = await api<Conversation>("/api/conversations", { method: "POST" });
          nextConversations = [created];
        }

        if (cancelled) return;
        setConversations(nextConversations);
        const firstId = nextConversations[0]?.id ?? "";
        setActiveConversationId(firstId);
        if (firstId) {
          setMessages(await api<Message[]>(`/api/conversations/${firstId}/messages`));
        }
        setStatusText("本地服务已就绪");
      } catch {
        if (!cancelled) setStatusText("本地服务未连接");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshConversations() {
    setConversations(await api<Conversation[]>("/api/conversations"));
  }

  async function createNewConversation() {
    const created = await api<Conversation>("/api/conversations", { method: "POST" });
    setConversations((current) => [created, ...current]);
    setActiveConversationId(created.id);
    setMessages([]);
  }

  async function openConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setMessages(await api<Message[]>(`/api/conversations/${conversationId}/messages`));
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProvider(true);
    try {
      const saved = await api<ProviderSummary>("/api/providers", {
        method: "POST",
        body: JSON.stringify(providerForm)
      });
      const nextProviders = await api<ProviderSummary[]>("/api/providers");
      setProviders(nextProviders);
      setSelectedProviderId(saved.id);
      setProviderForm((current) => ({ ...current, apiKey: "" }));
    } finally {
      setIsSavingProvider(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !activeConversationId || isSending) return;

    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          providerId: selectedProviderId || undefined,
          content
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.split("\n");
          const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
          const dataLine = lines.find((line) => line.startsWith("data:"));
          if (!eventName || !dataLine) continue;
          const payload = JSON.parse(dataLine.slice(5).trim()) as unknown;

          if (eventName === "message") {
            setMessages((current) => upsertMessage(current, payload as Message));
          }

          if (eventName === "delta") {
            const chunk = payload as { id: string; text: string };
            setMessages((current) =>
              current.map((message) =>
                message.id === chunk.id
                  ? {
                      ...message,
                      content: message.content + chunk.text,
                      status: "streaming"
                    }
                  : message
              )
            );
          }

          if (eventName === "done") {
            const donePayload = payload as { id: string; content: string };
            setMessages((current) =>
              current.map((message) =>
                message.id === donePayload.id
                  ? {
                      ...message,
                      content: donePayload.content,
                      status: "complete"
                    }
                  : message
              )
            );
          }

          if (eventName === "error") {
            const errorPayload = payload as { id: string; message: string };
            setMessages((current) =>
              current.map((message) =>
                message.id === errorPayload.id
                  ? {
                      ...message,
                      content: errorPayload.message,
                      status: "error"
                    }
                  : message
              )
            );
          }
        }
      }

      await refreshConversations();
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <h1>Chat Transfer</h1>
            <p>{statusText}</p>
          </div>
        </div>

        <button className="new-chat" type="button" onClick={createNewConversation}>
          <MessageSquarePlus size={18} />
          <span>新会话</span>
        </button>

        <nav className="conversation-list" aria-label="会话列表">
          {conversations.map((conversation) => (
            <button
              className={conversation.id === activeConversationId ? "conversation active" : "conversation"}
              key={conversation.id}
              type="button"
              onClick={() => void openConversation(conversation.id)}
            >
              <span>{conversation.title}</span>
              <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>{activeConversation?.title ?? "新的对话"}</h2>
          </div>
          <div className="model-pill">
            <Bot size={16} />
            <span>{selectedProvider?.model ?? "Demo"}</span>
          </div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <ChevronsUp size={28} />
              </div>
              <h3>开始一段本地会话</h3>
              <p>配置模型后直接聊天；会话和消息会保存到本地 SQLite。</p>
            </div>
          ) : (
            messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="avatar">{message.role === "user" ? <UserRound size={17} /> : <Bot size={17} />}</div>
                <div className="message-body">
                  <div className="message-meta">
                    <strong>{message.role === "user" ? "你" : "助手"}</strong>
                    {message.status === "streaming" && <span>生成中</span>}
                    {message.status === "error" && <span>出错</span>}
                  </div>
                  <p>{message.content}</p>
                </div>
              </article>
            ))
          )}
        </div>

        <form className="composer" onSubmit={(event) => void sendMessage(event)}>
          <textarea
            aria-label="输入消息"
            value={draft}
            placeholder="输入消息，按发送开始..."
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button className="send-button" type="submit" disabled={isSending || !draft.trim()}>
            <Send size={18} />
          </button>
        </form>
      </section>

      <aside className="settings-panel">
        <header className="settings-header">
          <div>
            <span className="eyebrow">Provider</span>
            <h2>模型配置</h2>
          </div>
          <PanelRight size={20} />
        </header>

        <form className="provider-form" onSubmit={(event) => void saveProvider(event)}>
          <label>
            <span>名称</span>
            <input value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} />
          </label>

          <label>
            <span>接口类型</span>
            <select
              value={providerForm.kind}
              onChange={(event) => setProviderForm({ ...providerForm, kind: event.target.value as ProviderKind })}
            >
              <option value="openai-compatible">OpenAI Compatible</option>
              <option value="anthropic-compatible">Anthropic Compatible</option>
            </select>
          </label>

          <label>
            <span>Base URL</span>
            <input
              value={providerForm.baseUrl}
              onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })}
            />
          </label>

          <label>
            <span>API Key</span>
            <input
              type="password"
              value={providerForm.apiKey}
              onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })}
            />
          </label>

          <label>
            <span>Model</span>
            <input value={providerForm.model} onChange={(event) => setProviderForm({ ...providerForm, model: event.target.value })} />
          </label>

          <button className="save-provider" type="submit" disabled={isSavingProvider}>
            {isSavingProvider ? <Settings2 size={17} /> : <KeyRound size={17} />}
            <span>{isSavingProvider ? "保存中" : "保存配置"}</span>
          </button>
        </form>

        <div className="provider-list">
          {providers.map((provider) => (
            <button
              className={provider.id === selectedProviderId ? "provider-item active" : "provider-item"}
              key={provider.id}
              type="button"
              onClick={() => setSelectedProviderId(provider.id)}
            >
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.model}</span>
              </div>
              {provider.id === selectedProviderId && <Check size={18} />}
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}

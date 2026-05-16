import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  KeyRound,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
  X
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
  const headers: Record<string, string> = {};
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    ...init,
    headers
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string>("");
  const [editingConversationTitle, setEditingConversationTitle] = useState("");
  const [statusText, setStatusText] = useState("本地服务连接中");

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
    const nextConversations = await api<Conversation[]>("/api/conversations");
    setConversations(nextConversations);
    return nextConversations;
  }

  async function createNewConversation() {
    cancelRenamingConversation();
    const created = await api<Conversation>("/api/conversations", { method: "POST" });
    const nextConversations = await refreshConversations();
    if (!nextConversations.some((conversation) => conversation.id === created.id)) {
      setConversations((current) => [created, ...current]);
    }
    setActiveConversationId(created.id);
    setMessages([]);
  }

  async function openConversation(conversationId: string) {
    if (editingConversationId) return;
    setActiveConversationId(conversationId);
    setMessages(await api<Message[]>(`/api/conversations/${conversationId}/messages`));
  }

  function startRenamingConversation(conversation: Conversation) {
    setEditingConversationId(conversation.id);
    setEditingConversationTitle(conversation.title);
  }

  function cancelRenamingConversation() {
    setEditingConversationId("");
    setEditingConversationTitle("");
  }

  async function saveConversationTitle(conversationId: string) {
    const title = editingConversationTitle.trim();
    if (!title) {
      cancelRenamingConversation();
      return;
    }

    const updated = await api<Conversation>(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ title })
    });
    setConversations((current) =>
      current.map((conversation) => (conversation.id === conversationId ? updated : conversation))
    );
    cancelRenamingConversation();
  }

  async function deleteConversationItem(conversationId: string) {
    if (editingConversationId === conversationId) {
      cancelRenamingConversation();
    }
    await api<{ ok: boolean }>(`/api/conversations/${conversationId}`, { method: "DELETE" });
    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    setConversations(remaining);

    if (conversationId !== activeConversationId) return;

    const nextConversation = remaining[0] ?? (await api<Conversation>("/api/conversations", { method: "POST" }));
    if (remaining.length === 0) {
      setConversations([nextConversation]);
    }
    setActiveConversationId(nextConversation.id);
    setMessages(await api<Message[]>(`/api/conversations/${nextConversation.id}/messages`));
  }

  async function deleteMessageItem(messageId: string) {
    await api<{ ok: boolean }>(`/api/messages/${messageId}`, { method: "DELETE" });
    setMessages((current) => current.filter((message) => message.id !== messageId));
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
    <main className={isSidebarCollapsed ? "shell sidebar-collapsed" : "shell"}>
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-mark">
            <Sparkles size={16} />
          </div>
          <div>
            <h1>Chat Transfer</h1>
            <p>{statusText}</p>
          </div>
          <button
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            className="collapse-button"
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </header>

        <button
          className="new-chat"
          type="button"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void createNewConversation();
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            void createNewConversation();
          }}
        >
          <MessageSquarePlus size={16} />
          <span>新建对话</span>
        </button>

        <div className="sidebar-label">对话历史</div>
        <nav className="conversation-list" aria-label="会话列表">
          {conversations.map((conversation) => (
            <div
              className={conversation.id === activeConversationId ? "conversation active" : "conversation"}
              key={conversation.id}
              title={conversation.title}
            >
              {editingConversationId === conversation.id ? (
                <div className="conversation-main editing">
                  <MessageSquare size={16} />
                  <input
                    aria-label="修改对话名称"
                    autoFocus
                    className="conversation-title-input"
                    value={editingConversationTitle}
                    onChange={(event) => setEditingConversationTitle(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveConversationTitle(conversation.id);
                      }
                      if (event.key === "Escape") {
                        cancelRenamingConversation();
                      }
                    }}
                  />
                  <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
                </div>
              ) : (
                <button className="conversation-main" type="button" onClick={() => void openConversation(conversation.id)}>
                  <MessageSquare size={16} />
                  <span>{conversation.title}</span>
                  <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
                </button>
              )}
              <div className="conversation-actions">
                {editingConversationId === conversation.id ? (
                  <>
                    <button
                      aria-label="保存对话名称"
                      className="mini-icon-button"
                      type="button"
                      onClick={() => void saveConversationTitle(conversation.id)}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      aria-label="取消修改"
                      className="mini-icon-button"
                      type="button"
                      onClick={cancelRenamingConversation}
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      aria-label="修改对话名称"
                      className="mini-icon-button"
                      type="button"
                      onClick={() => startRenamingConversation(conversation)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label="删除对话"
                      className="mini-icon-button danger"
                      type="button"
                      onClick={() => void deleteConversationItem(conversation.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </nav>

        <footer className="sidebar-footer">
          <button className="settings-button" type="button" onClick={() => setIsSettingsOpen(true)}>
            <Settings2 size={16} />
            <span>模型设置</span>
          </button>
          <div className="selected-model">
            <Bot size={15} />
            <span>{selectedProvider?.model ?? "Demo 模式"}</span>
          </div>
        </footer>
      </aside>

      <section className="chat-panel">
        <div className="messages">
          <div className="message-stack">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Sparkles size={24} />
                </div>
                <h3>开始一段对话</h3>
                <p>配置模型后直接聊天；会话和消息会保存到本地 SQLite。</p>
              </div>
            ) : (
              messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="avatar">{message.role === "user" ? <UserRound size={15} /> : <Bot size={15} />}</div>
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>{message.role === "user" ? "你" : "助手"}</strong>
                      {message.status === "streaming" && <span>生成中</span>}
                      {message.status === "error" && <span>出错</span>}
                    </div>
                    <p>{message.content}</p>
                  </div>
                  <div className="message-actions">
                    <button
                      aria-label="删除消息"
                      className="mini-icon-button danger"
                      type="button"
                      onClick={() => void deleteMessageItem(message.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={(event) => void sendMessage(event)}>
            <textarea
              aria-label="输入消息"
              value={draft}
              placeholder="输入消息..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button className="send-button" type="submit" disabled={isSending || !draft.trim()}>
              <Send size={16} />
              <span>发送</span>
            </button>
          </form>
          <div className="composer-tips">
            <span>
              <kbd>Enter</kbd> 发送
            </span>
            <span>
              <kbd>Shift</kbd> + <kbd>Enter</kbd> 换行
            </span>
          </div>
        </div>
      </section>

      {isSettingsOpen && (
        <div className="settings-backdrop" role="presentation" onClick={() => setIsSettingsOpen(false)}>
          <section
            aria-label="模型配置"
            className="settings-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="settings-header">
              <div>
                <span className="eyebrow">Provider</span>
                <h2>模型设置</h2>
              </div>
              <button className="icon-button" type="button" aria-label="关闭模型设置" onClick={() => setIsSettingsOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <form className="provider-form" onSubmit={(event) => void saveProvider(event)}>
              <label>
                <span>名称</span>
                <input
                  value={providerForm.name}
                  onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })}
                />
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
                <input
                  value={providerForm.model}
                  onChange={(event) => setProviderForm({ ...providerForm, model: event.target.value })}
                />
              </label>

              <button className="save-provider" type="submit" disabled={isSavingProvider}>
                {isSavingProvider ? <Settings2 size={16} /> : <KeyRound size={16} />}
                <span>{isSavingProvider ? "保存中" : "保存配置"}</span>
              </button>
            </form>

            {providers.length > 0 && (
              <div className="provider-list">
                <div className="sidebar-label">已有配置</div>
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
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export type ProviderKind = "openai-compatible" | "anthropic-compatible";

export type Provider = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderSummary = Omit<Provider, "apiKey"> & {
  hasApiKey: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: "complete" | "streaming" | "error";
  createdAt: string;
};

export type Attachment = {
  id: string;
  conversationId: string | null;
  messageId: string | null;
  kind: "image" | "screenshot" | "artifact" | "log" | "file";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
};

export type ToolRun = {
  id: string;
  conversationId: string;
  messageId: string | null;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  inputJson: string;
  outputText: string;
  createdAt: string;
  updatedAt: string;
};

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

export type MessageRole = "system" | "user" | "assistant";

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: "complete" | "streaming" | "error";
  createdAt: string;
};

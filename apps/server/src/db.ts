import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type { Conversation, Message, Provider, ProviderSummary } from "@chat-transfer/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const dataRoot = path.resolve(process.env.CHAT_TRANSFER_DATA_DIR ?? path.join(projectRoot, "data"));

export const storagePaths = {
  dataRoot,
  database: path.join(dataRoot, "chat-transfer.sqlite"),
  attachments: path.join(dataRoot, "files", "attachments"),
  screenshots: path.join(dataRoot, "files", "screenshots"),
  artifacts: path.join(dataRoot, "files", "artifacts"),
  logs: path.join(dataRoot, "files", "logs")
};

for (const folder of Object.values(storagePaths)) {
  if (folder.endsWith(".sqlite")) continue;
  fs.mkdirSync(folder, { recursive: true });
}

export const db = new Database(storagePaths.database);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function nowIso() {
  return new Date().toISOString();
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
      ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

type ProviderRow = {
  id: string;
  name: string;
  kind: Provider["kind"];
  base_url: string;
  api_key: string;
  model: string;
  created_at: string;
  updated_at: string;
};

type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: Message["role"];
  content: string;
  status: Message["status"];
  created_at: string;
};

function providerFromRow(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function providerSummaryFromRow(row: ProviderRow): ProviderSummary {
  const provider = providerFromRow(row);
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    model: provider.model,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    hasApiKey: provider.apiKey.length > 0
  };
}

function conversationFromRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function messageFromRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at
  };
}

export function listProviders(): ProviderSummary[] {
  const rows = db.prepare("SELECT * FROM providers ORDER BY updated_at DESC").all() as ProviderRow[];
  return rows.map(providerSummaryFromRow);
}

export function getProvider(id: string): Provider | null {
  const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | undefined;
  return row ? providerFromRow(row) : null;
}

export function upsertProvider(input: {
  id?: string;
  name: string;
  kind: Provider["kind"];
  baseUrl: string;
  apiKey: string;
  model: string;
}): ProviderSummary {
  const timestamp = nowIso();
  const existing = input.id ? getProvider(input.id) : null;
  const id = existing?.id ?? input.id ?? nanoid();

  if (existing) {
    db.prepare(`
      UPDATE providers
      SET name = ?, kind = ?, base_url = ?, api_key = ?, model = ?, updated_at = ?
      WHERE id = ?
    `).run(input.name, input.kind, input.baseUrl, input.apiKey, input.model, timestamp, id);
  } else {
    db.prepare(`
      INSERT INTO providers (id, name, kind, base_url, api_key, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.kind, input.baseUrl, input.apiKey, input.model, timestamp, timestamp);
  }

  const provider = getProvider(id);
  if (!provider) {
    throw new Error("Provider was not persisted.");
  }
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    model: provider.model,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    hasApiKey: provider.apiKey.length > 0
  };
}

export function listConversations(): Conversation[] {
  const rows = db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all() as ConversationRow[];
  return rows.map(conversationFromRow);
}

export function createConversation(title = "新的对话"): Conversation {
  const timestamp = nowIso();
  const id = nanoid();
  db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, title, timestamp, timestamp);
  return { id, title, createdAt: timestamp, updatedAt: timestamp };
}

export function touchConversation(id: string, title?: string) {
  const timestamp = nowIso();
  if (title) {
    db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(title, timestamp, id);
    return;
  }
  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(timestamp, id);
}

export function listMessages(conversationId: string): Message[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(conversationId) as MessageRow[];
  return rows.map(messageFromRow);
}

export function addMessage(input: {
  conversationId: string;
  role: Message["role"];
  content: string;
  status?: Message["status"];
}): Message {
  const timestamp = nowIso();
  const id = nanoid();
  const status = input.status ?? "complete";
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.conversationId, input.role, input.content, status, timestamp);
  touchConversation(input.conversationId);
  return {
    id,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    status,
    createdAt: timestamp
  };
}

export function updateMessage(id: string, content: string, status: Message["status"]) {
  db.prepare("UPDATE messages SET content = ?, status = ? WHERE id = ?").run(content, status, id);
}

export function getConversationTitleSeed(conversationId: string): string | null {
  const row = db
    .prepare("SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1")
    .get(conversationId) as { content: string } | undefined;
  return row?.content ?? null;
}

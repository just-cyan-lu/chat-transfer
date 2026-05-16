# Architecture

Chat Transfer 是一个极简本地聊天 Web App，不把 API Key 暴露给纯前端。

## 模块

- `apps/web`: React + Vite + TypeScript 前端。
- `apps/server`: 本地 Node.js 服务，负责数据库和模型代理。
- `packages/shared`: 前后端共享类型。

## 数据策略

SQLite 保存文字类数据和结构化配置：

- provider 配置
- conversations
- messages

默认目录：

```text
data/
  chat-transfer.sqlite
```

## 第一阶段目标

1. 可配置 OpenAI-compatible provider。
2. 本地 SQLite 会话存储。
3. ChatGPT 风格流式聊天。
4. 简洁两栏聊天界面。

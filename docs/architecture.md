# Architecture

Chat Transfer 是一个本地 Web App，不把核心能力做成纯前端。

## 模块

- `apps/web`: React + Vite + TypeScript 前端。
- `apps/server`: 本地 Node.js 服务，负责数据库、模型代理、文件索引和后续 agent 工具。
- `packages/shared`: 前后端共享类型。

## 数据策略

SQLite 只保存文字类数据和结构化元数据：

- provider 配置
- conversations
- messages
- tool runs
- attachments 的路径、mime、大小、hash、归属关系

文件系统保存非文字内容：

- 图片
- 截图
- 上传附件
- 任务产物
- 长日志
- 临时代码快照

默认目录：

```text
data/
  chat-transfer.sqlite
  files/
    attachments/
    screenshots/
    artifacts/
    logs/
```

## 第一阶段目标

1. 可配置 OpenAI-compatible provider。
2. 本地 SQLite 会话存储。
3. ChatGPT 风格流式聊天。
4. 简洁三栏工作台界面。
5. 预留工具调用和附件索引表。

# Chat Transfer

一个本地优先的聊天与 Agent 工作台。前端使用 React + Vite + TypeScript，服务端使用 Node.js + SQLite。

## 设计原则

- SQLite 只保存文字类和结构化数据。
- 图片、截图、附件、长日志等文件内容保存到本地文件目录，SQLite 只保存路径和元数据。
- API Key 由本地服务端代理使用，浏览器端不直接请求模型服务。
- 第一版先实现可配置 Provider、会话存储、流式聊天和可扩展的工具调用记录。

## 开发

```bash
npm install
npm run dev
```

默认地址：

- Web: http://localhost:5173
- Server: http://localhost:8787

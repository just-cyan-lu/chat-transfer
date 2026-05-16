# Chat Transfer

一个极简的本地聊天网站。前端使用 React + Vite + TypeScript，服务端使用 Node.js + SQLite。

## 设计原则

- SQLite 保存模型配置、会话和消息。
- API Key 由本地服务端代理使用，浏览器端不直接请求模型服务。
- 第一版只做可配置 Provider、会话存储和流式聊天。

## 开发

```bash
npm install
npm run dev
```

默认地址：

- Web: http://localhost:5173
- Server: http://localhost:8787

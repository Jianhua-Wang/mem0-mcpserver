# mem0-mcpserver

无服务器 MCP 记忆服务，基于 Cloudflare Workers + D1 + Vectorize 构建。

为 AI 助手（如 Claude Code）提供持久化记忆能力——自动提取事实、语义去重、向量搜索。全部运行在 Cloudflare 免费额度内。

## 架构

```
Client (Claude Code / MCP Client)
  │
  ▼
Cloudflare Worker (MCP Server)
  ├── D1        — 存储记忆文本和 metadata（SQLite）
  ├── Vectorize — 存储向量嵌入，支持语义搜索（cosine similarity）
  └── OpenAI API
       ├── text-embedding-3-small — 生成 1536 维向量
       └── gpt-4.1-nano — 事实提取 & 去重决策
```

## 功能

- **智能事实提取** — 自动从输入文本中提取 1-5 条关键事实（偏好、计划、决策等）
- **语义去重** — 新事实与已有记忆相似度 > 0.85 时，由 LLM 决定更新、删除或跳过
- **向量搜索** — 基于余弦相似度的语义检索
- **多用户** — 通过 `user_id` 隔离，默认 `claude-code`
- **完整 CRUD** — 增删改查 + 批量删除

## 部署

### 前置条件

- Node.js 18+
- Cloudflare 账号
- OpenAI API Key

### 步骤

```bash
# 克隆项目
git clone <repo-url> && cd mem0-mcpserver
npm install

# 1. 创建 D1 数据库
npx wrangler d1 create mem0
# 将返回的 database_id 填入 wrangler.toml

# 2. 运行数据库迁移
npx wrangler d1 migrations apply mem0 --remote

# 3. 创建 Vectorize 索引
npx wrangler vectorize create memories --dimensions=1536 --metric=cosine

# 4. 创建 metadata 索引（用于按 user_id 过滤）
npx wrangler vectorize create-metadata-index memories --property-name=user_id --type=string

# 5. 设置 secrets
wrangler secret put OPENAI_API_KEY
wrangler secret put MCP_AUTH_TOKEN

# 6. 部署
npm run deploy
```

### 本地开发

在 `.dev.vars` 中配置环境变量：

```
MCP_AUTH_TOKEN=dev-token
OPENAI_API_KEY=sk-xxx
```

```bash
npm run dev
```

## 接入 Claude Code

```bash
claude mcp add -t http \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -s user mem0-memory https://mem0-mcpserver.<YOUR_SUBDOMAIN>.workers.dev/mcp
```

添加后 Claude Code 即可自动使用 `add_memory`、`search_memories` 等工具。

## MCP 工具

### add_memory

存储记忆，自动提取事实并去重。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | 是 | 要记住的内容 |
| user_id | string | 否 | 用户标识，默认 `claude-code` |
| metadata | object | 否 | 附加的键值对元数据 |

### search_memories

语义搜索记忆。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 自然语言搜索查询 |
| user_id | string | 否 | 用户标识 |
| limit | number | 否 | 最大返回数量，默认 10 |

### list_memories

列出用户的所有记忆，按更新时间倒序。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 否 | 用户标识 |

### get_memory

按 ID 获取单条记忆。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| memory_id | string | 是 | 记忆 ID |

### update_memory

更新记忆内容，同时重新生成向量嵌入。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| memory_id | string | 是 | 记忆 ID |
| text | string | 是 | 新内容 |

### delete_memory

删除单条记忆。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| memory_id | string | 是 | 记忆 ID |

### delete_all_memories

删除用户的所有记忆。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 否 | 用户标识，默认 `claude-code` |

## 验证

```bash
# 健康检查
curl https://mem0-mcpserver.<YOUR_SUBDOMAIN>.workers.dev/health

# MCP 初始化测试
curl -X POST https://mem0-mcpserver.<YOUR_SUBDOMAIN>.workers.dev/mcp \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```

## 免费额度参考

| 服务 | 免费额度 | 大约可用量 |
|------|----------|-----------|
| Workers | 10 万次请求/天 | 足够 |
| D1 | 5GB 存储，500 万行读/天 | ~3200 条记忆 |
| Vectorize | 3 万维度查询单元/月 | ~19500 次搜索/月 |

## License

MIT

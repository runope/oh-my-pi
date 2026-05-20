# OpenCode Zen API

## 快速开始

```bash
OPENCODE_KEY="public" node packages/opencode/zen-free.mjs
```

或用 curl（需要 Node 生成 ID）：

```bash
SESSION=$(node -e "
const c=require('crypto');
function id(p){const ts=Date.now(),cnt=1;let n=~(BigInt(ts)*BigInt(0x1000)+BigInt(cnt));
const b=Buffer.alloc(6);for(let i=0;i<6;i++)b[i]=Number((n>>BigInt(40-8*i))&BigInt(0xff));
const ch='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const bb=c.randomBytes(14);let r='';for(let i=0;i<14;i++)r+=ch[bb[i]%62];
process.stdout.write('ses_'+b.toString('hex')+r);}id('ses')")
REQUEST=$(node -e "
const c=require('crypto');
function id(p){const ts=Date.now(),cnt=1;let n=~(BigInt(ts)*BigInt(0x1000)+BigInt(cnt));
const b=Buffer.alloc(6);for(let i=0;i<6;i++)b[i]=Number((n>>BigInt(40-8*i))&BigInt(0xff));
const ch='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const bb=c.randomBytes(14);let r='';for(let i=0;i<14;i++)r+=ch[bb[i]%62];
process.stdout.write('msg_'+b.toString('hex')+r);}id('msg')")

curl https://opencode.ai/zen/v1/chat/completions \
  -H "Authorization: Bearer $OPENCODE_KEY" \
  -H "Content-Type: application/json" \
  -H "User-Agent: opencode/1.14.19" \
  -H "x-opencode-project: $PWD" \
  -H "x-opencode-session: $SESSION" \
  -H "x-opencode-request: $REQUEST" \
  -H "x-opencode-client: cli" \
  -d '{"model":"deepseek-v4-flash-free","messages":[{"role":"user","content":"hi"}],"max_tokens":50}'
```

---

## API 端点

```
POST https://opencode.ai/zen/v1/chat/completions
```

OpenAI Chat Completions 格式。

---

## 鉴权

### 免费模式（无 key）

```
Authorization: Bearer public
```

- 共享配额，可能有全局限流
- 需配合 `x-opencode-*` headers 做设备级限流（见下文）
- 仅可访问免费模型（cost.input === 0）

### 付费模式（有 key）

从 https://opencode.ai/zen 注册获取 API key：

```
Authorization: Bearer sk-xxx...
```

或设置环境变量：

```bash
export OPENCODE_API_KEY=sk-xxx...
```

---

## Headers（精确复刻 CLI）

源码位置：`packages/opencode/src/session/llm.ts:208-222`

| Header | 说明 | 来源 | 示例 |
|---|---|---|---|
| `User-Agent` | 客户端标识 | 固定 `opencode/<version>` | `opencode/1.14.19` |
| `x-opencode-project` | 项目/设备标识 | `project/project.ts` — git root 路径或 `"global"` | `/Users/me/my-project` |
| `x-opencode-session` | 会话 ID，同一会话不变 | `Identifier.create("session", true)` | `ses_1c434b952ffe8oP2DexzV1FZD9` |
| `x-opencode-request` | 请求 ID，每条消息不同 | `Identifier.create("message", true)` | `msg_1c434b952ffefA0CCekOFq8sfb` |
| `x-opencode-client` | 客户端类型 | `process.env["OPENCODE_CLIENT"] ?? "cli"` | `cli` |

> **重要**：必须复刻 CLI 的**全部** headers，缺任意一个都可能触发更严格的限流策略。
> `User-Agent` 尤其容易被忽略，但服务端用它区分真实 CLI 和第三方客户端。

### 各 header 的生命周期

在一个对话会话中：

```
第1条消息:  x-opencode-session=ses_xxx   x-opencode-request=msg_aaa
第2条消息:  x-opencode-session=ses_xxx   x-opencode-request=msg_bbb
新会话:     x-opencode-session=ses_yyy   x-opencode-request=msg_ccc
```

- `User-Agent`：**不变**（固定值）
- `x-opencode-project`：**不变**（同一设备/项目）
- `x-opencode-session`：同一会话**不变**，新会话重新生成
- `x-opencode-request`：**每次请求都变**
- `x-opencode-client`：**不变**（固定值）

---

## ID 生成算法

源码位置：`packages/opencode/src/id/id.ts:54-68`

### 格式

```
{prefix}_{12hex倒序时间戳}{14随机base62}
```

| 组件 | 长度 | 说明 |
|---|---|---|
| prefix | 3 | `ses`（会话）或 `msg`（请求） |
| `_` | 1 | 分隔符 |
| hex 时间戳 | 12 | 6 字节倒序毫秒时间戳（hex） |
| 随机后缀 | 14 | base62 随机字符 |

总长：3 + 1 + 12 + 14 = **30 字符**

### 算法

```javascript
function generateID(prefix) {
  const ts = Date.now()               // 毫秒时间戳
  const counter = 1                    // 单调计数器
  let now = BigInt(ts) * BigInt(0x1000) + BigInt(counter)
  now = ~now                           // 倒序：新 ID 排序靠前

  // 取低 6 字节转 hex
  const buf = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) {
    buf[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  }

  // 14 位随机 base62
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let rand = ''
  const bytes = crypto.randomBytes(14)
  for (let i = 0; i < 14; i++) {
    rand += chars[bytes[i] % 62]
  }

  return prefix + '_' + buf.toString('hex') + rand
}
```

### 跨语言实现要点

1. **时间戳**：毫秒级，使用 `Date.now()`
2. **倒序**：取 `~(ts * 4096 + counter)` 的低 48 位（6 字节）
3. **hex 编码**：6 字节 → 12 hex 字符
4. **随机后缀**：14 字符，字符集 `0-9A-Za-z`
5. **会话场景**：`counter` 在同一毫秒内递增（源码中同一毫秒自增），外部调用设 1 即可

### Python 实现

```python
import secrets
import time

def generate_opencode_id(prefix: str) -> str:
    ts = int(time.time() * 1000)
    counter = 1
    n = ~(ts * 0x1000 + counter) & ((1 << 48) - 1)
    hex_part = format(n, "012x")
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    rand = "".join(secrets.choice(chars) for _ in range(14))
    return f"{prefix}_{hex_part}{rand}"
```

---

## 免费模型

从 models.dev 数据中 `cost.input === 0` 的模型，实际在端点可用的：

| 模型 ID | 名称 | 上下文 | ToolCall | Reasoning |
|---|---|---|---|---|
| `deepseek-v4-flash-free` | DeepSeek V4 Flash Free | 200K | ✅ | ✅ |
| `nemotron-3-super-free` | Nemotron 3 Super Free | 205K | ✅ | ✅ |
| `qwen3.6-plus-free` | Qwen3.6 Plus Free | 262K | ✅ | ✅ |
| `minimax-m2.5-free` | MiniMax M2.5 Free | 205K | ✅ | ✅ |
| `big-pickle` | Big Pickle | 200K | ✅ | ✅ |

> 注：`/zen/v1/models` 列出的是实际可用模型列表。models.dev 中的一些免费模型（如 `kimi-k2.5-free`）端点未公开。

### Reasoning 模型说明

DeepSeek 系免费模型（`deepseek-v4-flash-free` 等）启用 reasoning 时，API 返回的内容在
`reasoning_content` 字段中，`content` 可能为 `null`。使用时需同时读取两个字段：

```python
choice = response.choices[0]
content = choice.message.content or ""
reasoning = getattr(choice.message, "reasoning_content", None) or ""
```

---

## 速率限制

- **`public` key**：全局限流（所有无 key 用户共享）。带上 `x-opencode-*` headers 后走**设备级配额**
- **真实 API key**：按用户独立配额，不受全局影响
- **缺少 `User-Agent`**：可能被判定为非 CLI 客户端，触发更严格限流
- 限流响应：`HTTP 429`，`{"type":"error","error":{"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."}}`

---

## 完整脚本

### Node.js

`packages/opencode/zen-free.mjs`：

```javascript
#!/usr/bin/env node
import crypto from "crypto"

const MODEL = process.argv[2] || "deepseek-v4-flash-free"
const MSG = process.argv[3] || "Say hello in one word"
const KEY = process.env.OPENCODE_API_KEY || "public"

// 从环境变量读取 session ID（同一会话复用）
const SESSION = process.env.OPENCODE_ZEN_SESSION || id("ses")

function id(prefix) {
  const ts = Date.now(), counter = 1
  let n = ~(BigInt(ts) * BigInt(0x1000) + BigInt(counter))
  const b = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) b[i] = Number((n >> BigInt(40 - 8 * i)) & BigInt(0xff))
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  const bb = crypto.randomBytes(14)
  let r = ""
  for (let i = 0; i < 14; i++) r += chars[bb[i] % 62]
  return prefix + "_" + b.toString("hex") + r
}

const res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "User-Agent": "opencode/1.14.19",
    "x-opencode-project": process.cwd(),
    "x-opencode-session": SESSION,
    "x-opencode-request": id("msg"),
    "x-opencode-client": "cli",
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: MSG }],
    max_tokens: 50,
  }),
})

const text = await res.text()
console.log(`HTTP ${res.status}`)
try { console.log(JSON.stringify(JSON.parse(text), null, 2)) } catch { console.log(text) }
```

单次调用：

```bash
node zen-free.mjs deepseek-v4-flash-free "hello"
```

模拟多轮对话（同一 session）：

```bash
export OPENCODE_ZEN_SESSION=$(node -e "...生成 ses_...")

node zen-free.mjs deepseek-v4-flash-free "first message"
node zen-free.mjs deepseek-v4-flash-free "second message"  # 同一 session
```

### Python

```python
#!/usr/bin/env python3
"""Test opencode-zen API using openai library"""
import os
import secrets
import time
from openai import OpenAI

def generate_opencode_id(prefix: str) -> str:
    ts = int(time.time() * 1000)
    counter = 1
    n = ~(ts * 0x1000 + counter) & ((1 << 48) - 1)
    hex_part = format(n, "012x")
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    rand = "".join(secrets.choice(chars) for _ in range(14))
    return f"{prefix}_{hex_part}{rand}"

session_id = os.environ.get("OPENCODE_ZEN_SESSION") or generate_opencode_id("ses")
request_id = generate_opencode_id("msg")

client = OpenAI(
    api_key=os.environ.get("OPENCODE_API_KEY", "public"),
    base_url="https://opencode.ai/zen/v1",
    default_headers={
        "User-Agent": "opencode/1.14.19",
        "x-opencode-project": os.getcwd(),
        "x-opencode-session": session_id,
        "x-opencode-request": request_id,
        "x-opencode-client": "cli",
    },
)

response = client.chat.completions.create(
    model="deepseek-v4-flash-free",
    messages=[{"role": "user", "content": "Say hello in one word"}],
    max_tokens=50,
)
choice = response.choices[0]
content = choice.message.content or ""
reasoning = getattr(choice.message, "reasoning_content", None) or ""
print(f"Reasoning: {reasoning[:200]}")
print(f"Response: {content}")
```

---

## 关键文件索引

| 文件 | 内容 |
|---|---|
| `packages/opencode/src/session/llm.ts:208-222` | Header 构造 |
| `packages/opencode/src/id/id.ts:54-68` | ID 生成算法 |
| `packages/opencode/src/provider/provider.ts:159-180` | opencode custom loader（无 key 逻辑） |
| `packages/opencode/src/provider/models.ts` | 模型数据获取 |
| `https://models.dev/api.json` | 模型定义数据源 |

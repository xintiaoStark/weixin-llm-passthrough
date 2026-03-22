# 微信 LLM 透传插件
### WeChat → Any LLM Passthrough Plugin for OpenClaw

> 把微信消息**直接透传**给任意 OpenAI 兼容接口（ChatGPT / Claude / 文心 / 豆包 / FastGPT / Dify / 扣子……），无任何中间 agent 逻辑。
>
> Passthrough WeChat messages **directly** to any OpenAI-compatible LLM API — no agent logic, no prompt injection, just raw messages in and replies out.

---

## ✨ 特性 / Features

- 🔌 **零改造接入**：填 Base URL + API Key 即可，支持所有 OpenAI 兼容接口
- 🚀 **热更新**：修改配置无需重启，立即生效
- 🖼️ **图片支持**：收到图片自动上传图床，转为 URL 发给 LLM（支持视觉模型）
- 🔒 **数据安全**：对话数据直接从本机到你的 API，不经过任何第三方
- 🌐 **配置页面**：内置 Web UI，浏览器里填写和修改配置
- 💬 **适配广泛**：FastGPT / Dify / 扣子 / Coze / 自建 Agent / 任何工作流均可接入

---

## 📋 前置要求 / Requirements

- Node.js >= 22（[下载](https://nodejs.org)）
- npm
- 一个**微信账号**（用于绑定）
- 一个 **OpenAI 兼容的 API**（Base URL + API Key）

---

## 🚀 快速开始 / Quick Start

### 第一步：安装 OpenClaw

```bash
npm install -g openclaw
```

### 第二步：安装本插件

```bash
# 克隆仓库
git clone https://github.com/你的用户名/weixin-llm-passthrough.git
cd weixin-llm-passthrough

# 安装插件依赖
cd weixin-passthrough && npm install && cd ..

# 注册插件到 OpenClaw
openclaw plugins install ./weixin-passthrough
```

### 第三步：填写 API 配置

启动配置页面：

```bash
node config-ui/server.js
```

打开浏览器访问 **http://localhost:3456**，填写：

| 字段 | 说明 | 示例 |
|------|------|------|
| Base URL | API 基础地址 | `https://api.openai.com/v1` |
| API Key | 你的密钥 | `sk-xxxxxxxx` |
| 模型名 | model 参数 | `gpt-4o` |
| imgbb Key | 图片上传（可选） | [免费获取](https://api.imgbb.com) |

### 第四步：扫码绑定微信

```bash
npx -y @tencent-weixin/openclaw-weixin-cli@latest install
```

用微信扫描终端里的二维码，完成账号绑定。

### 第五步：启动网关

```bash
openclaw gateway
```

✅ 完成！现在发给绑定微信号的消息会直接由你的 LLM 回复。

---

## 🖼️ 图片识别配置（可选）

收到图片时，插件会把图片上传到图床，拿到 URL 后发给 LLM。

**方式一（推荐）：imgbb**

1. 访问 https://api.imgbb.com 免费注册
2. 复制 API Key
3. 填入配置页面的「imgbb API Key」字段

**方式二：无需配置**

插件会自动尝试匿名图床（0x0.st / litterbox），无需任何 key。
国内网络可能不稳定，建议配置 imgbb。

---

## 🔄 消息流 / Message Flow

```
微信用户
   │ 发消息
   ▼
OpenClaw（本地运行）
   │ 收消息、处理协议
   ▼
weixin-passthrough 插件
   │ 直接 POST /chat/completions
   ▼
你的 LLM API（FastGPT / OpenAI / Claude / Dify…）
   │ 返回回复
   ▼
OpenClaw → 微信用户
```

**完全绕过**：无 system prompt 注入、无历史记录、无工具调用、无 OpenClaw agent 逻辑。

---

## ⚙️ 支持的接口 / Compatible APIs

只要是 OpenAI Chat Completions 格式（`POST /chat/completions`），都可以接入：

| 平台 | Base URL 示例 |
|------|--------------|
| OpenAI | `https://api.openai.com/v1` |
| Anthropic Claude | 通过 OpenRouter 或兼容层 |
| FastGPT | `https://你的域名/api/v1` |
| Dify | `https://你的域名/v1` |
| 扣子 / Coze | `https://api.coze.cn/v1` |
| 本地 Ollama | `http://localhost:11434/v1` |
| 任何中转/代理 | 填对应地址即可 |

---

## 🔧 常用命令 / Commands

```bash
# 查看插件状态
openclaw plugins list

# 查看微信账号状态
openclaw channels status

# 重新扫码登录
openclaw channels login --channel openclaw-weixin

# 停止网关
openclaw gateway stop

# 安装为系统服务（开机自启，需管理员权限）
openclaw gateway install
openclaw gateway start
```

---

## ❓ 常见问题 / FAQ

**Q：修改 API Key 后需要重启吗？**
A：不需要。配置文件保存后下条消息立即生效。

**Q：支持群聊吗？**
A：目前仅支持私聊（直接消息）。

**Q：发的消息 LLM 看不到历史怎么办？**
A：本插件是纯透传，没有历史记录。如需多轮对话，请在你的 LLM API 端（如 FastGPT）配置对话记忆。

**Q：微信重新登录了怎么办？**
A：重新运行 `openclaw channels login --channel openclaw-weixin` 扫码即可。

**Q：网关关闭了怎么让它自动运行？**
A：用管理员权限运行 `openclaw gateway install` 安装为系统服务，之后开机自启。

---

## 📁 项目结构 / Structure

```
weixin-llm-passthrough/
├── weixin-passthrough/          # OpenClaw 插件（核心）
│   ├── src/
│   │   ├── messaging/
│   │   │   └── process-message.ts   # 透传逻辑（核心改动）
│   │   ├── cdn/
│   │   │   └── image-upload.ts      # 图床上传
│   │   └── config/
│   │       └── llm-config.ts        # 配置读取（热更新）
│   ├── config/
│   │   ├── llm-config.json          # 你的配置（不提交到 git）
│   │   └── llm-config.example.json  # 示例配置
│   └── package.json
├── config-ui/
│   ├── server.js                # 配置页面后端
│   └── index.html               # 配置页面前端
├── .gitignore
└── README.md
```

---

## 🤝 贡献 / Contributing

欢迎提 Issue 和 PR！

---

## 📄 License

MIT

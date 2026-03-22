# 微信 LLM 透传插件
### WeChat → Any LLM / Claude Code Plugin for OpenClaw

> 把微信消息**直接透传**给任意 OpenAI 兼容接口（ChatGPT / Claude / 文心 / 豆包 / FastGPT / Dify / 扣子……），或直接接入本机 **Claude Code**，让 AI 在你的电脑上读写文件、执行代码。对话数据直连你的 API，安全可控。

---

## ✨ 特性

- 🔌 **零改造接入**：填 Base URL + API Key 即可，支持所有 OpenAI 兼容接口
- 🤖 **Claude Code 模式**：接入本机 Claude Code CLI，可读写项目文件、执行命令
- 🔀 **双模式随时切换**：每个用户独立模式，微信发 `/mode claude` 或 `/mode agent` 即可切换
- 🚀 **热更新**：修改配置无需重启，立即生效
- 🖼️ **图片支持**：收到图片自动上传图床，转 URL 发给 LLM（支持视觉模型）
- 🔒 **数据安全**：对话数据从本机直接到你的 API，不经过任何第三方
- 🌐 **配置页面**：内置 Web UI，浏览器里填写和修改配置
- 💬 **适配广泛**：FastGPT / Dify / 扣子 / Coze / 自建 Agent / 任何工作流均可接入

---

## 📋 前置要求

| 要求 | 说明 |
|------|------|
| **操作系统** | Windows 10/11、macOS、Linux 均可 |
| **Node.js** | 版本 >= 22，[点击下载](https://nodejs.org) |
| **微信账号** | 用于绑定的微信号（建议用小号） |
| **LLM API** | 任意 OpenAI 兼容接口的 Base URL + API Key |
| **Claude Code**（可选） | 使用 Claude Code 模式时需要，[安装说明](https://claude.ai/code) |

---

## 🚀 完整部署教程

### 第一步：安装 Node.js

1. 打开 https://nodejs.org
2. 下载 **LTS 版本**（长期支持版，推荐）
3. 双击安装包，一路点 Next，全部默认选项即可
4. 安装完成后，打开命令提示符（Win+R 输入 `cmd` 回车），输入：

```
node --version
```

看到类似 `v22.x.x` 的版本号说明安装成功。

---

### 第二步：安装 OpenClaw

OpenClaw 是微信消息收发的核心网关，本插件依赖它工作。

在命令提示符中运行：

```bash
npm install -g openclaw
```

安装完成后验证：

```bash
openclaw --version
```

看到版本号（如 `OpenClaw 2026.x.x`）说明安装成功。

---

### 第三步：下载本插件

**方式一：直接下载 zip（推荐新手）**

1. 打开 https://github.com/xintiaoStark/weixin-llm-passthrough
2. 点绿色的 **Code** 按钮 → **Download ZIP**
3. 解压到任意目录，例如 `D:\weixin-llm-passthrough`

**方式二：Git 克隆**

```bash
git clone https://github.com/xintiaoStark/weixin-llm-passthrough.git
cd weixin-llm-passthrough
```

---

### 第四步：安装插件依赖

进入插件目录，安装依赖包：

```bash
# 进入插件目录（把路径替换成你实际的路径）
cd D:\weixin-llm-passthrough\weixin-passthrough

npm install
```

看到 `added X packages` 说明成功。

---

### 第五步：注册插件到 OpenClaw

```bash
# 回到项目根目录
cd D:\weixin-llm-passthrough

# 注册插件（把路径替换成你实际的路径）
openclaw plugins install D:\weixin-llm-passthrough\weixin-passthrough
```

验证插件是否加载成功：

```bash
openclaw plugins list
```

在列表中看到 `Weixin | openclaw-weixin | loaded` 说明成功。

---

### 第六步：填写 API 配置

**启动配置页面：**

```bash
node D:\weixin-llm-passthrough\config-ui\server.js
```

看到 `✅ 配置页面已启动：http://localhost:3456` 后，**打开浏览器访问 http://localhost:3456**

在配置页面填写以下信息：

| 字段 | 说明 | 示例 |
|------|------|------|
| **Base URL** | 你的 API 地址（末尾不含斜杠） | `https://api.openai.com/v1` |
| **API Key** | 你的密钥 | `sk-xxxxxxxxxxxxxxxx` |
| **模型名** | 调用的模型 | `gpt-4o` |
| **imgbb Key** | 图片识别用（可选） | [免费获取](https://api.imgbb.com) |
| **默认模式** | agent（LLM）或 claude（本地 Claude Code） | `agent` |
| **Claude Code 工作目录** | 使用 Claude Code 模式时的项目路径 | `D:\my-project` |

填完后点 **「保存配置」**，再点 **「测试 Agent 连接」**，看到 `✅ 连接成功` 说明 API 配置正确。

> **常见 Base URL 示例：**
> - OpenAI：`https://api.openai.com/v1`
> - FastGPT：`http://你的服务器地址:3000/api/v1`
> - Dify：`https://api.dify.ai/v1`
> - 扣子(Coze)：`https://api.coze.cn/v1`
> - Ollama 本地：`http://localhost:11434/v1`
> - 任何中转/代理：填对应地址

---

### 第七步：扫码绑定微信

在**新的命令提示符窗口**中运行：

```bash
npx -y @tencent-weixin/openclaw-weixin-cli@latest install
```

终端会显示一个二维码，**用微信扫描**，然后在手机上点确认授权。

看到 `✅ 与微信连接成功！` 说明绑定完成。

> ⚠️ **注意**：建议使用**微信小号**绑定，不建议用主号，避免影响日常使用。

---

### 第八步：启动网关

```bash
openclaw gateway
```

看到类似以下日志说明网关启动成功：

```
[gateway] listening on ws://127.0.0.1:18789 (PID xxxxx)
[openclaw-weixin] weixin monitor started
```

✅ **全部完成！** 现在发消息给绑定的微信号，就会收到 LLM 的回复。

---

## 🤖 Claude Code 模式

> 让微信直接控制本机的 Claude Code CLI，可以读写项目文件、执行代码、分析报错。

### 前置条件

1. 本机已安装 Claude Code CLI：参考 [claude.ai/code](https://claude.ai/code)
2. 已完成 Claude Code 登录（运行一次 `claude` 确认可用）
3. 在配置页面填写 **Claude Code 工作目录**（Claude 读写文件的根目录）

### 切换方式（微信内发送）

| 命令 | 效果 |
|------|------|
| `/mode` | 查看当前模式 |
| `/mode claude` | 切换到 Claude Code 模式 |
| `/mode agent` | 切换回 LLM API 透传模式 |
| `/new` | 清除 Claude Code 会话，开启新对话 |

### 消息流（Claude Code 模式）

```
微信用户发消息
      │
      ▼
OpenClaw 网关
      │
      ▼
weixin-passthrough 插件
      │  检查用户当前模式
      ▼
Claude Code CLI（本地子进程）
      │  读写 claudeCodeCwd 目录下的文件
      │  执行命令、分析代码
      ▼
回复内容 → 发回微信用户
```

### 使用示例

```
你：/mode claude
Bot：✅ 已切换到 Claude Code 模式

你：帮我看看 src/index.ts 有没有 bug
Bot：我来看一下...（Claude Code 读取文件，分析代码，给出回复）

你：帮我写一个 utils/format.ts
Bot：好的，我来创建这个文件...（Claude Code 实际写入文件）

你：/new
Bot：✅ Claude Code 会话已重置，下条消息将开启全新对话。
```

---

## 🔄 开机自启（可选但推荐）

每次重启电脑后需要重新运行网关。如果希望开机自动启动，用**管理员权限**运行以下命令（右键命令提示符 → 以管理员身份运行）：

```bash
openclaw gateway install
openclaw gateway start
```

之后开机会自动启动，无需手动操作。

验证服务状态：

```bash
openclaw gateway status
```

---

## 🖼️ 开启图片识别（可选）

默认情况下，插件会尝试通过匿名图床（0x0.st / litterbox）上传图片。**国内网络建议配置 imgbb**：

1. 打开 https://api.imgbb.com 免费注册
2. 登录后首页直接显示 API Key，复制
3. 在配置页面 http://localhost:3456 填入 **imgbb API Key** 并保存

配置后发送图片，视觉模型（GPT-4o、Claude 等）即可识别图片内容。

---

## 🔧 日常管理

### 查看运行状态

```bash
openclaw channels status
```

### 修改 API 配置

打开配置页面重新填写并保存，**无需重启**，下条消息立即生效：

```bash
node D:\weixin-llm-passthrough\config-ui\server.js
```

然后访问 http://localhost:3456

### 重新扫码（微信 token 过期时）

```bash
openclaw channels login --channel openclaw-weixin
```

### 手动重启网关

```bash
openclaw gateway stop
openclaw gateway
```

---

## 🔄 消息流（Agent 模式）

```
微信用户发消息
      │
      ▼
OpenClaw 网关（本地运行）
      │  处理微信协议，收发消息
      ▼
weixin-passthrough 插件
      │  直接 POST /chat/completions
      │  { model, messages: [{role:"user", content:"消息内容"}], user:"微信用户ID" }
      ▼
你的 LLM API（FastGPT / OpenAI / Dify / 扣子…）
      │  返回回复内容
      ▼
OpenClaw → 发回微信用户
```

**完全绕过**：无 system prompt 注入、无历史记录管理、无工具调用、无 OpenClaw agent 逻辑。上下文维护完全由你的 AI 服务端负责。

---

## ❓ 常见问题

**Q：修改 API Key 后需要重启吗？**
A：不需要。配置文件保存后下条消息立即生效。

**Q：微信二维码扫了但连接失败？**
A：确认微信版本是最新版，或换一个微信账号试试。

**Q：发消息没有回复？**
A：检查步骤：
1. `openclaw channels status` 确认状态为 `running`
2. 打开配置页面测试连接是否正常
3. 检查 API Key 和 Base URL 是否填写正确

**Q：图片发过去识别失败？**
A：配置 imgbb API Key 后重试（见上方图片识别章节）。

**Q：怎么让 AI 记住上下文（多轮对话）？**
A：Agent 模式下，在你的 AI 服务端开启对话记忆功能：
- **FastGPT**：应用设置 → 对话记忆轮数（设置为大于 0 的数字）
- **Dify**：开启对话变量/记忆功能
- **扣子**：Bot 设置里开启记忆插件

Claude Code 模式天然支持多轮对话，上下文由 Claude Code 本地维护。

**Q：Claude Code 模式提示"未找到 claude 命令"？**
A：确认已安装 Claude Code CLI（`claude --version` 可以运行），Windows 用户需确保 npm 全局 bin 目录在 PATH 中。

**Q：支持群聊吗？**
A：目前仅支持私聊。

**Q：网关关了怎么重新启动？**
A：运行 `openclaw gateway`，或安装系统服务后自动管理（见「开机自启」章节）。

---

## 📁 项目结构

```
weixin-llm-passthrough/
├── weixin-passthrough/              # OpenClaw 插件（核心）
│   ├── src/
│   │   ├── messaging/
│   │   │   ├── process-message.ts  # 核心逻辑：双模式分发
│   │   │   └── slash-commands.ts   # 斜杠指令（/mode、/new 等）
│   │   ├── claude-code/
│   │   │   └── claude-runner.ts    # Claude Code CLI 子进程调用
│   │   ├── mode/
│   │   │   └── user-mode-store.ts  # 用户模式持久化
│   │   ├── cdn/
│   │   │   └── image-upload.ts     # 图床上传（imgbb / 0x0.st / litterbox）
│   │   └── config/
│   │       └── llm-config.ts       # 配置读取（热更新）
│   ├── config/
│   │   ├── llm-config.json         # 你的配置（不提交到 git，需自行创建）
│   │   └── llm-config.example.json # 示例配置，复制改名为 llm-config.json
│   └── package.json
├── config-ui/
│   ├── server.js                   # 配置页面后端（Node.js 内置模块，无需安装）
│   └── index.html                  # 配置页面前端
├── .gitignore
└── README.md
```

---

## 🤝 贡献

欢迎提 Issue 和 PR！如果对你有帮助，欢迎点个 ⭐

---

## 📄 License

MIT — 基于 [@tencent-weixin/openclaw-weixin](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin)（MIT）改造

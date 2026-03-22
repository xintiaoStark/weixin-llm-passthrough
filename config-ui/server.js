import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../weixin-passthrough/config/llm-config.json");
const HTML_PATH = path.resolve(__dirname, "index.html");
const PORT = 3456;

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { baseUrl: "", apiKey: "", model: "", defaultMode: "agent", claudeCodeCwd: "" };
  }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function testConnection(cfg) {
  const url = `${cfg.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 5,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  }
  return data?.choices?.[0]?.message?.content ?? "(ok)";
}

/** Check if claude CLI is installed and return version string. */
function checkClaudeCli() {
  return new Promise((resolve) => {
    execFile("claude", ["--version"], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: "未找到 claude 命令。请先安装 Claude Code CLI：https://claude.ai/code" });
      } else {
        const version = (stdout || stderr).trim().split("\n")[0] ?? "unknown";
        resolve({ ok: true, version });
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve static HTML
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(HTML_PATH, "utf-8"));
    return;
  }

  // GET /api/config — return config (apiKey masked)
  if (req.method === "GET" && url.pathname === "/api/config") {
    const cfg = readConfig();
    const masked = {
      ...cfg,
      apiKey: cfg.apiKey ? cfg.apiKey.slice(0, 6) + "****" + cfg.apiKey.slice(-4) : "",
      // imgbbApiKey and claudeCodeCwd not masked — shown in full
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(masked));
    return;
  }

  // POST /api/config — save config
  if (req.method === "POST" && url.pathname === "/api/config") {
    try {
      const body = await parseBody(req);
      const existing = readConfig();
      // If apiKey contains **** it means user didn't change it — keep original
      const apiKey = body.apiKey?.includes("****") ? existing.apiKey : body.apiKey;
      const imgbbApiKey = body.imgbbApiKey?.includes("****") ? existing.imgbbApiKey : body.imgbbApiKey;
      const newCfg = {
        baseUrl: String(body.baseUrl ?? "").trim().replace(/\/$/, ""),
        apiKey: String(apiKey ?? "").trim(),
        model: String(body.model ?? "").trim(),
        imgbbApiKey: String(imgbbApiKey ?? "").trim(),
        defaultMode: body.defaultMode === "claude" ? "claude" : "agent",
        claudeCodeCwd: String(body.claudeCodeCwd ?? "").trim(),
      };
      if (!newCfg.baseUrl || !newCfg.apiKey || !newCfg.model) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "baseUrl, apiKey, model 均为必填" }));
        return;
      }
      writeConfig(newCfg);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // POST /api/test — test LLM API connection
  if (req.method === "POST" && url.pathname === "/api/test") {
    try {
      const body = await parseBody(req);
      const existing = readConfig();
      const apiKey = body.apiKey?.includes("****") ? existing.apiKey : body.apiKey;
      const cfg = {
        baseUrl: String(body.baseUrl ?? "").trim().replace(/\/$/, ""),
        apiKey: String(apiKey ?? "").trim(),
        model: String(body.model ?? "").trim(),
      };
      const reply = await testConnection(cfg);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, reply }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  // GET /api/test-claude — check if claude CLI is installed
  if (req.method === "GET" && url.pathname === "/api/test-claude") {
    const result = await checkClaudeCli();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n✅ 配置页面已启动：http://localhost:${PORT}\n`);
  console.log(`   配置文件路径：${CONFIG_PATH}\n`);
});

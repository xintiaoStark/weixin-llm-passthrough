/**
 * Claude Code CLI subprocess runner.
 *
 * Calls `claude -p "<message>" --output-format stream-json [--resume <sessionId>]`
 * and parses the streaming JSON output to extract the text result and session ID.
 *
 * Requires Claude Code CLI (`claude`) to be installed and authenticated on the host machine.
 * Install: https://claude.ai/code
 */
import { spawn } from "node:child_process";
import { logger } from "../util/logger.js";

export type ClaudeRunResult = {
  /** The assistant's text reply. */
  result: string;
  /** Session ID for resuming conversation context in next call. */
  sessionId: string;
};

// ── Stream-JSON message shapes ──────────────────────────────────────────────

type StreamMessage =
  | { type: "system"; subtype: "init"; session_id: string }
  | { type: "assistant"; message: { role: "assistant"; content: ContentBlock[] } }
  | { type: "result"; subtype: "success"; result: string; session_id: string; is_error: false }
  | { type: "result"; subtype: "error_during_execution"; result: string; session_id: string; is_error: true }
  | { type: string; [key: string]: unknown };

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: string };

// ── Runner ───────────────────────────────────────────────────────────────────

/**
 * Run Claude Code CLI with a single prompt and return the text result.
 *
 * @param message   User's message text
 * @param sessionId Existing session ID to resume (undefined = new session)
 * @param cwd       Working directory for Claude Code (the project directory)
 * @returns         { result, sessionId } where sessionId can be passed to next call
 */
export async function runClaudeCode(params: {
  message: string;
  sessionId?: string;
  cwd: string;
}): Promise<ClaudeRunResult> {
  const { message, sessionId, cwd } = params;

  const args: string[] = ["-p", message, "--output-format", "stream-json", "--dangerously-skip-permissions"];
  if (sessionId) {
    args.push("--resume", sessionId);
  }

  logger.info(`claude-runner: spawn claude cwd=${cwd} resume=${sessionId ?? "new"}`);

  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn("claude", args, {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (spawnErr) {
      reject(new Error(`无法启动 Claude Code CLI：${String(spawnErr)}\n请确保已安装并登录：https://claude.ai/code`));
      return;
    }

    const outputLines: string[] = [];
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      for (const line of chunk.split("\n")) {
        if (line.trim()) outputLines.push(line.trim());
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("未找到 claude 命令。请先安装 Claude Code CLI：https://claude.ai/code"));
      } else {
        reject(new Error(`Claude Code 启动失败：${String(err)}`));
      }
    });

    proc.on("close", (code) => {
      logger.info(`claude-runner: process exited code=${code} lines=${outputLines.length}`);

      // Parse stream-json output lines
      let resultText = "";
      let resultSessionId = "";

      for (const line of outputLines) {
        try {
          const msg = JSON.parse(line) as StreamMessage;
          if (msg.type === "result") {
            const r = msg as Extract<StreamMessage, { type: "result" }>;
            resultText = r.result ?? "";
            resultSessionId = r.session_id ?? "";
            if (r.is_error) {
              logger.warn(`claude-runner: result is_error=true result=${resultText.slice(0, 200)}`);
            }
            break;
          }
        } catch {
          // Non-JSON line (e.g. debug output), skip
        }
      }

      if (resultText && resultSessionId) {
        resolve({ result: resultText, sessionId: resultSessionId });
        return;
      }

      // Fallback: try to extract text from assistant messages
      if (!resultText) {
        for (const line of outputLines) {
          try {
            const msg = JSON.parse(line) as StreamMessage;
            if (msg.type === "assistant") {
              const a = msg as Extract<StreamMessage, { type: "assistant" }>;
              const textBlock = a.message?.content?.find((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text");
              if (textBlock?.text) {
                resultText = textBlock.text;
              }
            }
            if (msg.type === "system" && (msg as Extract<StreamMessage, { type: "system" }>).session_id) {
              resultSessionId = (msg as Extract<StreamMessage, { type: "system" }>).session_id;
            }
          } catch {
            // skip
          }
        }
      }

      if (resultText && resultSessionId) {
        resolve({ result: resultText, sessionId: resultSessionId });
        return;
      }

      // Process failed
      const errDetails = stderr.slice(0, 300) || `(exit code ${code})`;
      if (code !== 0) {
        reject(new Error(`Claude Code 执行失败 (exit ${code})：${errDetails}`));
      } else {
        reject(new Error(`Claude Code 返回了空结果。stderr: ${errDetails}`));
      }
    });
  });
}

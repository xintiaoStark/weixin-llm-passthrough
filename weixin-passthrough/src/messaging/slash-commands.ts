/**
 * Weixin 斜杠指令处理模块
 *
 * 支持的指令：
 * - /echo <message>         直接回复消息（不经过 AI），并附带通道耗时统计
 * - /toggle-debug           开关 debug 模式，启用后每条 AI 回复追加全链路耗时
 * - /mode                   查看当前对话模式
 * - /mode agent             切换到 Agent 模式（LLM API 透传）
 * - /mode claude            切换到 Claude Code 模式（本地执行）
 * - /new                    清除当前 Claude Code 会话，开启新对话
 */
import type { WeixinApiOptions } from "../api/api.js";
import { logger } from "../util/logger.js";

import { toggleDebugMode } from "./debug-mode.js";
import { sendMessageWeixin } from "./send.js";
import { getUserMode, setUserMode, clearClaudeSession } from "../mode/user-mode-store.js";

export interface SlashCommandResult {
  /** 是否是斜杠指令（true 表示已处理，不需要继续走 AI） */
  handled: boolean;
}

export interface SlashCommandContext {
  to: string;
  contextToken?: string;
  baseUrl: string;
  token?: string;
  accountId: string;
  log: (msg: string) => void;
  errLog: (msg: string) => void;
}

/** 发送回复消息 */
async function sendReply(ctx: SlashCommandContext, text: string): Promise<void> {
  const opts: WeixinApiOptions & { contextToken?: string } = {
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    contextToken: ctx.contextToken,
  };
  await sendMessageWeixin({ to: ctx.to, text, opts });
}

/** 处理 /echo 指令 */
async function handleEcho(
  ctx: SlashCommandContext,
  args: string,
  receivedAt: number,
  eventTimestamp?: number,
): Promise<void> {
  const message = args.trim();
  if (message) {
    await sendReply(ctx, message);
  }
  const eventTs = eventTimestamp ?? 0;
  const platformDelay = eventTs > 0 ? `${receivedAt - eventTs}ms` : "N/A";
  const timing = [
    "⏱ 通道耗时",
    `├ 事件时间: ${eventTs > 0 ? new Date(eventTs).toISOString() : "N/A"}`,
    `├ 平台→插件: ${platformDelay}`,
    `└ 插件处理: ${Date.now() - receivedAt}ms`,
  ].join("\n");
  await sendReply(ctx, timing);
}

/** 处理 /mode 指令 */
async function handleMode(
  ctx: SlashCommandContext,
  args: string,
): Promise<void> {
  const target = args.trim().toLowerCase();

  if (!target) {
    const current = getUserMode(ctx.accountId, ctx.to);
    const label = current === "claude"
      ? "🤖 Claude Code 模式（本地执行）"
      : "💬 Agent 模式（LLM API 透传）";
    await sendReply(
      ctx,
      `当前模式：${label}\n\n切换命令：\n/mode agent  — LLM API 透传\n/mode claude — Claude Code 本地执行`,
    );
    return;
  }

  if (target === "agent") {
    setUserMode(ctx.accountId, ctx.to, "agent");
    await sendReply(ctx, "✅ 已切换到 Agent 模式\n后续消息将直接透传到你配置的 LLM API。");
    return;
  }

  if (target === "claude") {
    setUserMode(ctx.accountId, ctx.to, "claude");
    await sendReply(
      ctx,
      "✅ 已切换到 Claude Code 模式\n后续消息将由本机的 Claude Code CLI 处理，可读写项目文件、执行命令。\n\n发送 /new 可清除当前会话、开启全新对话。",
    );
    return;
  }

  await sendReply(ctx, `❌ 未知模式 "${args.trim()}"。可用：agent / claude`);
}

/**
 * 尝试处理斜杠指令
 *
 * @returns handled=true 表示该消息已作为指令处理，不需要继续走 AI 管道
 */
export async function handleSlashCommand(
  content: string,
  ctx: SlashCommandContext,
  receivedAt: number,
  eventTimestamp?: number,
): Promise<SlashCommandResult> {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/")) {
    return { handled: false };
  }

  const spaceIdx = trimmed.indexOf(" ");
  const command = spaceIdx === -1 ? trimmed.toLowerCase() : trimmed.slice(0, spaceIdx).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

  logger.info(`[weixin] Slash command: ${command}, args: ${args.slice(0, 50)}`);

  try {
    switch (command) {
      case "/echo":
        await handleEcho(ctx, args, receivedAt, eventTimestamp);
        return { handled: true };
      case "/toggle-debug": {
        const enabled = toggleDebugMode(ctx.accountId);
        await sendReply(
          ctx,
          enabled ? "Debug 模式已开启" : "Debug 模式已关闭",
        );
        return { handled: true };
      }
      case "/mode":
        await handleMode(ctx, args);
        return { handled: true };
      case "/new": {
        const currentMode = getUserMode(ctx.accountId, ctx.to);
        if (currentMode === "claude") {
          clearClaudeSession(ctx.accountId, ctx.to);
          await sendReply(ctx, "✅ Claude Code 会话已重置，下条消息将开启全新对话。");
        } else {
          await sendReply(ctx, "ℹ️ /new 仅在 Claude Code 模式下有效。当前为 Agent 模式。");
        }
        return { handled: true };
      }
      default:
        return { handled: false };
    }
  } catch (err) {
    logger.error(`[weixin] Slash command error: ${String(err)}`);
    try {
      await sendReply(ctx, `❌ 指令执行失败: ${String(err).slice(0, 200)}`);
    } catch {
      // 发送错误消息也失败了，只能记日志
    }
    return { handled: true };
  }
}

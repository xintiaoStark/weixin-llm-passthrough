import {
  resolveSenderCommandAuthorizationWithRuntime,
  resolveDirectDmAuthorizationOutcome,
  resolvePreferredOpenClawTmpDir,
} from "openclaw/plugin-sdk";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import path from "node:path";

import { sendTyping } from "../api/api.js";
import type { WeixinMessage } from "../api/types.js";
import { MessageItemType, TypingStatus } from "../api/types.js";
import { loadWeixinAccount } from "../auth/accounts.js";
import { readFrameworkAllowFromList } from "../auth/pairing.js";
import { downloadMediaFromItem } from "../media/media-download.js";
import { logger } from "../util/logger.js";

import { isDebugMode } from "./debug-mode.js";
import { sendWeixinErrorNotice } from "./error-notice.js";
import {
  setContextToken,
  weixinMessageToMsgContext,
  getContextTokenFromMsgContext,
  isMediaItem,
} from "./inbound.js";
import type { WeixinInboundMediaOpts } from "./inbound.js";
import { markdownToPlainText, sendMessageWeixin } from "./send.js";
import { handleSlashCommand } from "./slash-commands.js";
import { loadLlmConfig } from "../config/llm-config.js";
import { uploadImageToHost } from "../cdn/image-upload.js";

const MEDIA_OUTBOUND_TEMP_DIR = path.join(resolvePreferredOpenClawTmpDir(), "weixin/media/outbound-temp");

/** Dependencies for processOneMessage, injected by the monitor loop. */
export type ProcessMessageDeps = {
  accountId: string;
  config: import("openclaw/plugin-sdk/core").OpenClawConfig;
  channelRuntime: PluginRuntime["channel"];
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  typingTicket?: string;
  log: (msg: string) => void;
  errLog: (m: string) => void;
};

/** Extract text body from item_list. */
function extractTextBody(itemList?: import("../api/types.js").MessageItem[]): string {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      return String(item.text_item.text);
    }
  }
  return "";
}

/**
 * Process a single inbound message: authorize → passthrough to LLM → reply.
 * All OpenClaw agent logic (routing, history, tools) is bypassed.
 */
export async function processOneMessage(
  full: WeixinMessage,
  deps: ProcessMessageDeps,
): Promise<void> {
  if (!deps?.channelRuntime) {
    logger.error(
      `processOneMessage: channelRuntime is undefined, skipping message from=${full.from_user_id}`,
    );
    deps.errLog("processOneMessage: channelRuntime is undefined, skip");
    return;
  }

  const receivedAt = Date.now();

  const textBody = extractTextBody(full.item_list);

  // Handle slash commands (/echo, /toggle-debug) — these bypass LLM entirely.
  if (textBody.startsWith("/")) {
    const slashResult = await handleSlashCommand(textBody, {
      to: full.from_user_id ?? "",
      contextToken: full.context_token,
      baseUrl: deps.baseUrl,
      token: deps.token,
      accountId: deps.accountId,
      log: deps.log,
      errLog: deps.errLog,
    }, receivedAt, full.create_time_ms);
    if (slashResult.handled) {
      logger.info(`[weixin] Slash command handled, skipping LLM passthrough`);
      return;
    }
  }

  // Download media if present.
  const mediaOpts: WeixinInboundMediaOpts = {};
  const mainMediaItem =
    full.item_list?.find(
      (i) => i.type === MessageItemType.IMAGE && i.image_item?.media?.encrypt_query_param,
    ) ??
    full.item_list?.find(
      (i) => i.type === MessageItemType.VIDEO && i.video_item?.media?.encrypt_query_param,
    ) ??
    full.item_list?.find(
      (i) => i.type === MessageItemType.FILE && i.file_item?.media?.encrypt_query_param,
    ) ??
    full.item_list?.find(
      (i) =>
        i.type === MessageItemType.VOICE &&
        i.voice_item?.media?.encrypt_query_param &&
        !i.voice_item.text,
    );
  const refMediaItem = !mainMediaItem
    ? full.item_list?.find(
        (i) =>
          i.type === MessageItemType.TEXT &&
          i.ref_msg?.message_item &&
          isMediaItem(i.ref_msg.message_item!),
      )?.ref_msg?.message_item
    : undefined;
  const mediaItem = mainMediaItem ?? refMediaItem;
  if (mediaItem) {
    const downloaded = await downloadMediaFromItem(mediaItem, {
      cdnBaseUrl: deps.cdnBaseUrl,
      saveMedia: deps.channelRuntime.media.saveMediaBuffer,
      log: deps.log,
      errLog: deps.errLog,
      label: refMediaItem ? "ref" : "inbound",
    });
    Object.assign(mediaOpts, downloaded);
  }

  const ctx = weixinMessageToMsgContext(full, deps.accountId, mediaOpts);

  // --- Authorization (required: framework pairing) ---
  const rawBody = ctx.Body?.trim() ?? "";
  ctx.CommandBody = rawBody;
  const senderId = full.from_user_id ?? "";

  const { senderAllowedForCommands, commandAuthorized } =
    await resolveSenderCommandAuthorizationWithRuntime({
      cfg: deps.config,
      rawBody,
      isGroup: false,
      dmPolicy: "pairing",
      configuredAllowFrom: [],
      configuredGroupAllowFrom: [],
      senderId,
      isSenderAllowed: (id: string, list: string[]) => list.length === 0 || list.includes(id),
      readAllowFromStore: async () => {
        const fromStore = readFrameworkAllowFromList(deps.accountId);
        if (fromStore.length > 0) return fromStore;
        const uid = loadWeixinAccount(deps.accountId)?.userId?.trim();
        return uid ? [uid] : [];
      },
      runtime: deps.channelRuntime.commands,
    });

  const directDmOutcome = resolveDirectDmAuthorizationOutcome({
    isGroup: false,
    dmPolicy: "pairing",
    senderAllowedForCommands,
  });

  if (directDmOutcome === "disabled" || directDmOutcome === "unauthorized") {
    logger.info(
      `authorization: dropping message from=${senderId} outcome=${directDmOutcome}`,
    );
    return;
  }

  ctx.CommandAuthorized = commandAuthorized;

  // Capture contextToken (required for outbound sendMessageWeixin).
  const contextToken = getContextTokenFromMsgContext(ctx);
  if (contextToken) {
    setContextToken(deps.accountId, full.from_user_id ?? "", contextToken);
  }

  if (!contextToken) {
    logger.warn(`processOneMessage: no contextToken, cannot reply to from=${senderId}`);
    deps.errLog(`processOneMessage: no contextToken for from=${senderId}, skipping`);
    return;
  }

  logger.info(
    `inbound: from=${ctx.From} bodyLen=${(ctx.Body ?? "").length} hasMedia=${Boolean(ctx.MediaPath)}`,
  );

  // --- Start typing indicator ---
  let typingInterval: ReturnType<typeof setInterval> | undefined;
  if (deps.typingTicket) {
    const startTyping = () =>
      sendTyping({
        baseUrl: deps.baseUrl,
        token: deps.token,
        body: {
          ilink_user_id: ctx.To,
          typing_ticket: deps.typingTicket!,
          status: TypingStatus.TYPING,
        },
      }).catch((e) => deps.log(`[weixin] typing start error: ${String(e)}`));
    const stopTyping = () =>
      sendTyping({
        baseUrl: deps.baseUrl,
        token: deps.token,
        body: {
          ilink_user_id: ctx.To,
          typing_ticket: deps.typingTicket!,
          status: TypingStatus.CANCEL,
        },
      }).catch((e) => deps.log(`[weixin] typing stop error: ${String(e)}`));

    void startTyping();
    typingInterval = setInterval(() => void startTyping(), 5000);

    // Register cleanup on process exit for safety.
    const cleanup = () => {
      clearInterval(typingInterval);
      void stopTyping();
    };
    process.once("exit", cleanup);
    // We'll clear manually below too.
  }

  try {
    // --- Load LLM config (hot-reload: reads file on every message) ---
    let llmCfg;
    try {
      llmCfg = loadLlmConfig();
    } catch (cfgErr) {
      const msg = `⚠️ LLM 配置错误：${String(cfgErr)}\n请打开 http://localhost:3456 填写配置。`;
      logger.error(`loadLlmConfig failed: ${String(cfgErr)}`);
      await sendMessageWeixin({ to: ctx.To, text: msg, opts: { baseUrl: deps.baseUrl, token: deps.token, contextToken } });
      return;
    }

    // --- Build LLM request messages ---
    let userContent: string | Array<Record<string, unknown>>;

    const textPart = ctx.Body ?? "";

    if (ctx.MediaPath && ctx.MediaType?.startsWith("image")) {
      // Image: upload to public image host, then send as image_url to LLM
      let imageUrl: string | null = null;
      try {
        imageUrl = await uploadImageToHost(ctx.MediaPath, {
          imgbbApiKey: llmCfg.imgbbApiKey,
          expirationSeconds: 3600,
        });
        logger.info(`llm-passthrough: image uploaded url=${imageUrl}`);
      } catch (uploadErr) {
        logger.warn(`llm-passthrough: image upload failed, falling back to text. err=${String(uploadErr)}`);
      }

      if (imageUrl) {
        const parts: Array<Record<string, unknown>> = [];
        if (textPart) parts.push({ type: "text", text: textPart });
        parts.push({ type: "image_url", image_url: { url: imageUrl } });
        userContent = parts;
      } else {
        // Upload failed — give actionable hint
        userContent = textPart
          ? `${textPart}\n[图片无法上传，请在配置页面 http://localhost:3456 填入 imgbb API Key 后重试]`
          : `[图片无法上传到图床。请访问 https://api.imgbb.com 免费获取 API Key，填入配置页面后即可支持图片识别]`;
      }
    } else if (ctx.MediaPath && ctx.MediaType) {
      // Non-image media (voice already converted to text in Body; video/file described)
      const mediaLabel = ctx.MediaType.startsWith("audio") ? "语音" :
                         ctx.MediaType.startsWith("video") ? "视频" : "文件";
      userContent = textPart
        ? `${textPart}\n[附件: ${mediaLabel}，暂不支持处理]`
        : `[${mediaLabel}消息，暂不支持处理]`;
    } else {
      userContent = textPart;
    }

    if (!userContent || (Array.isArray(userContent) && userContent.length === 0)) {
      logger.info(`processOneMessage: empty content from=${senderId}, skipping LLM call`);
      return;
    }

    const messages = [{ role: "user", content: userContent }];

    // --- Call LLM API ---
    logger.info(`llm-passthrough: POST ${llmCfg.baseUrl}/chat/completions model=${llmCfg.model}`);
    const llmResponse = await fetch(`${llmCfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${llmCfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llmCfg.model,
        messages,
        stream: false,
        user: senderId,       // OpenAI 标准字段，通用
        chatId: senderId,     // FastGPT 专用：固定 chatId 让 FastGPT 自动维护历史
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text().catch(() => "(no body)");
      throw new Error(`LLM API returned ${llmResponse.status}: ${errorText.slice(0, 300)}`);
    }

    const llmData = await llmResponse.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (llmData.error?.message) {
      throw new Error(`LLM API error: ${llmData.error.message}`);
    }

    const replyText = llmData.choices?.[0]?.message?.content;
    if (!replyText) {
      throw new Error(`LLM API returned empty content: ${JSON.stringify(llmData).slice(0, 200)}`);
    }

    logger.info(`llm-passthrough: got reply len=${replyText.length}`);

    // --- Send reply to WeChat ---
    const plainText = markdownToPlainText(replyText);
    await sendMessageWeixin({
      to: ctx.To,
      text: plainText,
      opts: { baseUrl: deps.baseUrl, token: deps.token, contextToken },
    });
    logger.info(`outbound: sent OK to=${ctx.To} len=${plainText.length}`);

  } catch (err) {
    logger.error(`processOneMessage: error from=${senderId} err=${String(err)}`);
    const errMsg = err instanceof Error ? err.message : String(err);
    await sendWeixinErrorNotice({
      to: ctx.To,
      contextToken,
      message: `⚠️ 消息处理失败：${errMsg.slice(0, 200)}`,
      baseUrl: deps.baseUrl,
      token: deps.token,
      errLog: deps.errLog,
    });
  } finally {
    // Stop typing indicator.
    if (typingInterval !== undefined) {
      clearInterval(typingInterval);
      if (deps.typingTicket) {
        void sendTyping({
          baseUrl: deps.baseUrl,
          token: deps.token,
          body: {
            ilink_user_id: ctx.To,
            typing_ticket: deps.typingTicket!,
            status: TypingStatus.CANCEL,
          },
        }).catch((e) => deps.log(`[weixin] typing stop error: ${String(e)}`));
      }
    }
  }
}

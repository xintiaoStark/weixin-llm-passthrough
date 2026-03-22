import fs from "node:fs";
import path from "node:path";
import { logger } from "../util/logger.js";

/**
 * Upload a local image file to a public image host and return the URL.
 *
 * Strategy (in order):
 * 1. imgbb (if imgbbApiKey configured) — reliable, 1 hour expiry by default
 * 2. 0x0.st — anonymous, no key needed, 365-day expiry for small files
 * 3. litterbox.catbox.moe — anonymous, 1h/12h/24h/72h expiry
 *
 * Throws if all providers fail.
 */
export async function uploadImageToHost(
  filePath: string,
  opts: { imgbbApiKey?: string; expirationSeconds?: number } = {},
): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace(".", "") || "jpg";
  const mimeType = extToMime(ext);

  // 1. Try imgbb if API key is configured
  if (opts.imgbbApiKey?.trim()) {
    try {
      const url = await uploadToImgbb(fileBuffer, opts.imgbbApiKey.trim(), opts.expirationSeconds ?? 3600);
      logger.info(`image-upload: imgbb success url=${url}`);
      return url;
    } catch (err) {
      logger.warn(`image-upload: imgbb failed err=${String(err)}`);
    }
  }

  // 2. Try 0x0.st (no key needed)
  try {
    const url = await uploadTo0x0(fileBuffer, ext, mimeType);
    logger.info(`image-upload: 0x0.st success url=${url}`);
    return url;
  } catch (err) {
    logger.warn(`image-upload: 0x0.st failed err=${String(err)}`);
  }

  // 3. Try litterbox.catbox.moe
  try {
    const url = await uploadToLitterbox(fileBuffer, ext, mimeType);
    logger.info(`image-upload: litterbox success url=${url}`);
    return url;
  } catch (err) {
    logger.warn(`image-upload: litterbox failed err=${String(err)}`);
  }

  throw new Error(
    opts.imgbbApiKey?.trim()
      ? "图床上传全部失败（imgbb + 0x0.st + litterbox），请检查网络"
      : "匿名图床上传失败（0x0.st + litterbox），建议在配置页面填入 imgbb API Key（https://api.imgbb.com 免费注册）"
  );
}

/** Upload to imgbb — returns direct image URL. Expiry in seconds (0 = permanent). */
async function uploadToImgbb(buf: Buffer, apiKey: string, expirationSec: number): Promise<string> {
  const base64 = buf.toString("base64");
  const form = new URLSearchParams();
  form.set("image", base64);
  if (expirationSec > 0) form.set("expiration", String(expirationSec));

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json() as { success?: boolean; data?: { url?: string; display_url?: string }; error?: { message?: string } };
  if (!data.success || !data.data?.url) {
    throw new Error(`imgbb error: ${data.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  return data.data.display_url ?? data.data.url;
}

/** Upload to 0x0.st — returns URL as plain text. */
async function uploadTo0x0(buf: Buffer, ext: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([buf], { type: mimeType });
  formData.append("file", blob, `image.${ext}`);

  const res = await fetch("https://0x0.st", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`0x0.st HTTP ${res.status}`);
  const url = (await res.text()).trim();
  if (!url.startsWith("http")) throw new Error(`0x0.st unexpected response: ${url.slice(0, 100)}`);
  return url;
}

/** Upload to litterbox.catbox.moe — returns URL as plain text. */
async function uploadToLitterbox(buf: Buffer, ext: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("time", "1h");
  const blob = new Blob([buf], { type: mimeType });
  formData.append("fileToUpload", blob, `image.${ext}`);

  const res = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`litterbox HTTP ${res.status}`);
  const url = (await res.text()).trim();
  if (!url.startsWith("http")) throw new Error(`litterbox unexpected response: ${url.slice(0, 100)}`);
  return url;
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  };
  return map[ext] ?? "image/jpeg";
}

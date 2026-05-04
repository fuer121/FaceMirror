import fs from "node:fs/promises";
import path from "node:path";
import OSS from "ali-oss";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { ensureDir } from "./fs.js";

type SaveUploadInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

type SaveRenderInput = {
  jobId: string;
  buffer: Buffer;
  extension: string;
  mimeType: string;
};

type StoredMedia = {
  key: string;
  url: string;
  localPath?: string;
};

let ossClient: OSS | null = null;

function isOssEnabled() {
  return config.storageDriver === "oss";
}

function getOssClient() {
  if (!isOssEnabled()) {
    return null;
  }

  if (!config.aliyunOssRegion || !config.aliyunOssBucket || !config.aliyunOssAccessKeyId || !config.aliyunOssAccessKeySecret) {
    throw new Error("OSS storage requires ALIYUN_OSS_REGION, ALIYUN_OSS_BUCKET, ALIYUN_OSS_ACCESS_KEY_ID and ALIYUN_OSS_ACCESS_KEY_SECRET.");
  }

  if (!ossClient) {
    ossClient = new OSS({
      region: config.aliyunOssRegion,
      bucket: config.aliyunOssBucket,
      accessKeyId: config.aliyunOssAccessKeyId,
      accessKeySecret: config.aliyunOssAccessKeySecret
    });
  }

  return ossClient;
}

function normalizePrefix(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function safeExt(fileName: string, mimeType: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" || ext === ".svg") {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/svg+xml") {
    return ".svg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".jpg";
}

function mediaUrl(type: "uploads" | "renders", key: string) {
  if (isOssEnabled() && config.aliyunOssPublicBaseUrl) {
    return `${config.aliyunOssPublicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }
  return `${config.publicBaseUrl}/media/${type}/${path.basename(key)}`;
}

function objectKey(type: "uploads" | "renders", fileName: string) {
  const prefix = normalizePrefix(config.aliyunOssPrefix);
  return prefix ? `${prefix}/${type}/${fileName}` : `${type}/${fileName}`;
}

async function saveLocal(type: "uploads" | "renders", fileName: string, buffer: Buffer): Promise<StoredMedia> {
  const dir = type === "uploads" ? config.uploadsDir : config.rendersDir;
  await ensureDir(dir);
  const localPath = path.join(dir, fileName);
  await fs.writeFile(localPath, buffer);
  return {
    key: fileName,
    url: mediaUrl(type, fileName),
    localPath
  };
}

async function saveOss(type: "uploads" | "renders", fileName: string, buffer: Buffer, mimeType: string): Promise<StoredMedia> {
  const client = getOssClient();
  if (!client) {
    return saveLocal(type, fileName, buffer);
  }

  const key = objectKey(type, fileName);
  await client.put(key, buffer, {
    headers: {
      "Content-Type": mimeType
    }
  });
  return {
    key,
    url: mediaUrl(type, key)
  };
}

export async function saveUpload(input: SaveUploadInput): Promise<StoredMedia> {
  const ext = safeExt(input.originalName, input.mimeType);
  const fileName = `${Date.now()}-${nanoid(8)}${ext}`;
  if (isOssEnabled()) {
    return saveOss("uploads", fileName, input.buffer, input.mimeType);
  }
  return saveLocal("uploads", fileName, input.buffer);
}

export async function saveRender(input: SaveRenderInput): Promise<StoredMedia> {
  const ext = input.extension.startsWith(".") ? input.extension : `.${input.extension}`;
  const fileName = `${input.jobId}${ext}`;
  if (isOssEnabled()) {
    return saveOss("renders", fileName, input.buffer, input.mimeType);
  }
  return saveLocal("renders", fileName, input.buffer);
}

export async function getImageReference(record: { sourceKey?: string; localSourcePath?: string; imagePreviewUrl: string }) {
  if (isOssEnabled() && record.sourceKey) {
    const client = getOssClient();
    if (!client) {
      return record.imagePreviewUrl;
    }
    return client.signatureUrl(record.sourceKey, {
      expires: config.aliyunOssSignedUrlTtlSeconds
    });
  }

  if (!record.localSourcePath) {
    return record.imagePreviewUrl;
  }

  const buffer = await fs.readFile(record.localSourcePath);
  const ext = path.extname(record.localSourcePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function removeMedia(record: { sourceKey?: string; posterKey?: string; localSourcePath?: string; localPosterPath?: string }) {
  if (isOssEnabled()) {
    const client = getOssClient();
    if (client) {
      if (record.sourceKey) {
        await client.delete(record.sourceKey).catch(() => undefined);
      }
      if (record.posterKey) {
        await client.delete(record.posterKey).catch(() => undefined);
      }
    }
  }

  if (record.localSourcePath) {
    await fs.rm(record.localSourcePath, { force: true }).catch(() => undefined);
  }
  if (record.localPosterPath) {
    await fs.rm(record.localPosterPath, { force: true }).catch(() => undefined);
  }
}

export async function ensureLocalMediaDirs() {
  if (isOssEnabled()) {
    return;
  }
  await ensureDir(config.uploadsDir);
  await ensureDir(config.rendersDir);
}

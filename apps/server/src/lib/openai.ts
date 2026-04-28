import fs from "node:fs";
import OpenAI from "openai";
import { config, resolveImageOpenAIApiKey, resolveOpenAIApiKey } from "../config.js";

let client: OpenAI | null = null;
let imageClient: OpenAI | null = null;
let resolvedCredentialSource = "none";

type CodexAuthFile = {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
};

function readCodexAccessToken() {
  try {
    if (!fs.existsSync(config.codexAuthFile)) {
      return undefined;
    }

    const raw = fs.readFileSync(config.codexAuthFile, "utf8");
    const parsed = JSON.parse(raw) as CodexAuthFile;
    return parsed.OPENAI_API_KEY || parsed.tokens?.access_token;
  } catch {
    return undefined;
  }
}

export function resolveAuthToken() {
  const explicitKey = resolveOpenAIApiKey();
  if (explicitKey) {
    resolvedCredentialSource = "env";
    return explicitKey;
  }

  const codexToken = readCodexAccessToken();
  if (codexToken) {
    resolvedCredentialSource = "codex-auth";
    return codexToken;
  }

  resolvedCredentialSource = "none";
  return undefined;
}

export function getOpenAIClient() {
  if (client) {
    return client;
  }

  const apiKey = resolveAuthToken();

  if (!apiKey) {
    return null;
  }

  client = new OpenAI({
    apiKey,
    baseURL: config.openAIBaseUrl
  });
  return client;
}

export function getImageOpenAIClient() {
  if (imageClient) {
    return imageClient;
  }

  const apiKey = resolveImageOpenAIApiKey();
  if (!apiKey) {
    return null;
  }

  imageClient = new OpenAI({
    apiKey,
    baseURL: config.imageOpenAIBaseUrl
  });
  return imageClient;
}

export function hasOpenAIAccess() {
  return Boolean(resolveAuthToken());
}

export function hasImageOpenAIAccess() {
  return Boolean(resolveImageOpenAIApiKey());
}

export function getModelConfig() {
  return {
    openAIBaseUrl: config.openAIBaseUrl,
    imageOpenAIBaseUrl: config.imageOpenAIBaseUrl,
    analysisModel: config.analysisModel,
    imageModel: config.imageModel
  };
}

export function getCredentialSource() {
  resolveAuthToken();
  return resolvedCredentialSource;
}

export class OpenAICredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAICredentialError";
  }
}

export class UpstreamProtocolError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UpstreamProtocolError";
    this.code = code;
  }
}

export function normalizeOpenAIError(error: unknown) {
  if (error instanceof OpenAICredentialError || error instanceof UpstreamProtocolError) {
    return error;
  }

  const source = getCredentialSource();
  const message = error instanceof Error ? error.message : String(error);

  if (source === "codex-auth" && /insufficient permissions|Missing scopes|401|403/i.test(message)) {
    return new OpenAICredentialError(
      "已读取到 Codex 本地登录态，但当前 ChatGPT 登录不具备可用的 OpenAI API scopes，无法直接完成真实模型调用。请改为在 apps/server/.env 中配置 OPENAI_API_KEY。"
    );
  }

  if (/timed out|timeout/i.test(message)) {
    return new OpenAICredentialError("模型请求超时，请检查网络连接、代理设置，或稍后重试。");
  }

  return error;
}

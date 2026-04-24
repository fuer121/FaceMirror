import fs from "node:fs";
import { config } from "../config.js";
import { getCredentialSource, resolveAuthToken } from "../lib/openai.js";

type CodexAuthFile = {
  auth_mode?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
};

function summarizeCodexAuth() {
  if (!fs.existsSync(config.codexAuthFile)) {
    return {
      found: false
    };
  }

  const raw = fs.readFileSync(config.codexAuthFile, "utf8");
  const parsed = JSON.parse(raw) as CodexAuthFile;
  return {
    found: true,
    authMode: parsed.auth_mode ?? "unknown",
    hasAccessToken: Boolean(parsed.tokens?.access_token),
    hasRefreshToken: Boolean(parsed.tokens?.refresh_token),
    lastRefresh: parsed.last_refresh ?? null
  };
}

async function main() {
  const authSummary = summarizeCodexAuth();
  const token = resolveAuthToken();
  const source = getCredentialSource();

  console.log(JSON.stringify({
    credentialSource: source,
    codexAuth: authSummary
  }, null, 2));

  if (!token) {
    console.log("No credential found. Set OPENAI_API_KEY or sign in through Codex first.");
    process.exit(1);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.analysisModel,
        input: "Reply with the single word ok."
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const payload = await response.json();

    if (!response.ok) {
      console.error("Auth probe failed.");
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }

    console.log("Auth probe succeeded.");
    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Auth probe failed.");
    console.error(message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

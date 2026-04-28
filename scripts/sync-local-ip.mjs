import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");

function normalizePath(filePath) {
  return decodeURIComponent(filePath);
}

function isPrivateIPv4(ip) {
  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return false;
  }
  return ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function pickLanIPv4() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, values] of Object.entries(interfaces)) {
    for (const entry of values ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      if (!isPrivateIPv4(entry.address)) {
        continue;
      }
      candidates.push({ name, address: entry.address });
    }
  }

  const preferred = candidates.find((item) => /^(en0|en1|wlan0|eth0)$/i.test(item.name));
  return (preferred ?? candidates[0])?.address ?? null;
}

function upsertEnvVar(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return content.endsWith("\n") ? `${content}${line}\n` : `${content}\n${line}\n`;
}

async function patchEnvFile(filePath, replacements) {
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    content = "";
  }

  let next = content;
  for (const [key, value] of Object.entries(replacements)) {
    next = upsertEnvVar(next, key, value);
  }

  if (next !== content) {
    await fs.writeFile(filePath, next, "utf8");
  }
}

async function main() {
  const ip = pickLanIPv4();
  if (!ip) {
    console.error("sync-local-ip: no private LAN IPv4 found");
    process.exit(1);
  }

  const webEnvPath = path.join(normalizePath(repoRoot), "apps/web/.env");
  const serverEnvPath = path.join(normalizePath(repoRoot), "apps/server/.env");

  await patchEnvFile(webEnvPath, {
    VITE_API_BASE_URL: `http://${ip}:8787`
  });
  await patchEnvFile(serverEnvPath, {
    CORS_ORIGIN: `http://${ip}:5173`,
    PUBLIC_BASE_URL: `http://${ip}:8787`
  });

  console.log(`sync-local-ip: updated env host to ${ip}`);
}

main().catch((error) => {
  console.error("sync-local-ip: failed", error);
  process.exit(1);
});

const ipHits = new Map<string, number[]>();

export function checkRateLimit(ip: string, windowMs: number, max: number) {
  const now = Date.now();
  const list = ipHits.get(ip) ?? [];
  const fresh = list.filter((timestamp) => timestamp > now - windowMs);
  fresh.push(now);
  ipHits.set(ip, fresh);

  return {
    ok: fresh.length <= max,
    remaining: Math.max(0, max - fresh.length)
  };
}


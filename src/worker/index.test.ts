import { describe, it, expect, beforeEach } from "vitest";
import {
  isPrivateHostname,
  hashIp,
  checkRateLimit,
  checkRateLimitKV,
  corsHeaders,
  validateTargetUrl,
  rateLimitMap,
  RATE_LIMIT_MAX,
  RATE_LIMIT_KV_PREFIX,
  RATE_LIMIT_SPEED_BURST,
} from "./index";

// ─── isPrivateHostname ───────────────────────────────────────────────

describe("isPrivateHostname", () => {
  describe("blocks private/reserved hostnames", () => {
    it.each([
      ["localhost"],
      ["test.localhost"],
      ["sub.example.local"],
      ["example.internal"],
      ["example.test"],
      ["example.example"],
      ["singleword"],
    ])("blocks %s", (hostname) => {
      expect(isPrivateHostname(hostname)).toBe(true);
    });
  });

  describe("blocks private IP addresses", () => {
    it.each([
      ["10.0.0.1"],
      ["10.255.255.255"],
      ["172.16.0.1"],
      ["172.31.255.255"],
      ["192.168.1.1"],
      ["192.168.0.100"],
      ["127.0.0.1"],
      ["127.0.0.53"],
      ["0.0.0.0"],
      ["169.254.169.254"],
      ["100.64.0.1"],
    ])("blocks %s", (hostname) => {
      expect(isPrivateHostname(hostname)).toBe(true);
    });
  });

  describe("blocks IPv6 loopback", () => {
    it("blocks [::1]", () => {
      expect(isPrivateHostname("[::1]")).toBe(true);
    });
    it("blocks bracketed IPv6 addresses", () => {
      expect(isPrivateHostname("[fe80::1]")).toBe(true);
    });
  });

  describe("allows public hostnames", () => {
    it.each([
      ["example.com"],
      ["cloudflare-dns.com"],
      ["dns.google"],
      ["github.com"],
      ["1.1.1.1"],
      ["8.8.8.8"],
      ["9.9.9.9"],
      ["208.67.222.222"],
      ["sub.domain.example.com"],
    ])("allows %s", (hostname) => {
      expect(isPrivateHostname(hostname)).toBe(false);
    });
  });

  describe("SSRF edge cases — decimal/octal/hex IPs", () => {
    it("blocks decimal IP 2130706433 (= 127.0.0.1)", () => {
      expect(isPrivateHostname("2130706433")).toBe(true);
    });

    it("blocks octal IP 0177.0.0.1 (ambiguous — could be 127.0.0.1)", () => {
      expect(isPrivateHostname("0177.0.0.1")).toBe(true);
    });

    it("blocks hex IP 0x7f.0.0.1 (ambiguous — could be 127.0.0.1)", () => {
      expect(isPrivateHostname("0x7f.0.0.1")).toBe(true);
    });

    it("blocks hex IP 0x7f000001 (single-label)", () => {
      expect(isPrivateHostname("0x7f000001")).toBe(true);
    });

    it("blocks 010.0.0.1 (leading zero — ambiguous octal)", () => {
      expect(isPrivateHostname("010.0.0.1")).toBe(true);
    });

    it("blocks 0300.0250.0.1 (leading zeros — ambiguous octal)", () => {
      expect(isPrivateHostname("0300.0250.0.1")).toBe(true);
    });

    it("blocks 0172.020.0.1 (leading zeros — ambiguous octal)", () => {
      expect(isPrivateHostname("0172.020.0.1")).toBe(true);
    });

    it("allows public IP 8.8.8.8 with no ambiguous segments", () => {
      expect(isPrivateHostname("8.8.8.8")).toBe(false);
    });

    it("allows 108.177.15.83 (no leading zeros)", () => {
      expect(isPrivateHostname("108.177.15.83")).toBe(false);
    });

    it("allows 0.0.0.0 edge case — already caught by private range check", () => {
      // 0.0.0.0 is blocked by the a === 0 check, not by ambiguous segments
      // (bare "0" segments don't trigger the ambiguous check)
      expect(isPrivateHostname("0.0.0.0")).toBe(true);
    });
  });

  describe("SSRF edge cases — cloud metadata and special IPs", () => {
    it("blocks 169.254.169.254 (AWS/GCP metadata)", () => {
      expect(isPrivateHostname("169.254.169.254")).toBe(true);
    });

    it("blocks 0.0.0.0", () => {
      expect(isPrivateHostname("0.0.0.0")).toBe(true);
    });

    it("blocks .internal TLD (AWS internal)", () => {
      expect(isPrivateHostname("ec2.internal")).toBe(true);
    });

    it("blocks .test TLD", () => {
      expect(isPrivateHostname("myapp.test")).toBe(true);
    });

    it("blocks .local TLD", () => {
      expect(isPrivateHostname("myprinter.local")).toBe(true);
    });
  });

  describe("case insensitivity", () => {
    it("blocks LOCALHOST in uppercase", () => {
      expect(isPrivateHostname("LOCALHOST")).toBe(true);
    });

    it("blocks LocalHost mixed case", () => {
      expect(isPrivateHostname("LocalHost")).toBe(true);
    });
  });
});

// ─── hashIp ──────────────────────────────────────────────────────────

describe("hashIp", () => {
  it("returns a deterministic 16-char hex string", async () => {
    const hash = await hashIp("1.2.3.4");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces different hashes for different IPs", async () => {
    expect(await hashIp("1.2.3.4")).not.toBe(await hashIp("5.6.7.8"));
  });

  it("produces the same hash for the same IP", async () => {
    expect(await hashIp("1.2.3.4")).toBe(await hashIp("1.2.3.4"));
  });

  it("handles unknown IP", async () => {
    expect(await hashIp("unknown")).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ─── checkRateLimit ───────────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    rateLimitMap.clear();
  });

  function makeRequest(path: string, ip = "1.2.3.4"): Request {
    return new Request(`https://netcheck-site.oilygold.workers.dev${path}`, {
      headers: { "cf-connecting-ip": ip },
    });
  }

  it("allows requests under the general limit", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(checkRateLimit(makeRequest("/api/ip"))).toBeNull();
    }
  });

  it("blocks requests over the general limit", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimit(makeRequest("/api/ip"));
    }
    const result = checkRateLimit(makeRequest("/api/ip"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("allows requests under the speed test limit", () => {
    for (let i = 0; i < RATE_LIMIT_SPEED_BURST; i++) {
      expect(checkRateLimit(makeRequest("/api/speedtest/down"))).toBeNull();
    }
  });

  it("blocks requests over the speed test limit", () => {
    for (let i = 0; i < RATE_LIMIT_SPEED_BURST; i++) {
      checkRateLimit(makeRequest("/api/speedtest/down"));
    }
    const result = checkRateLimit(makeRequest("/api/speedtest/down"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("tracks general and speed limits independently", () => {
    for (let i = 0; i < RATE_LIMIT_SPEED_BURST; i++) {
      checkRateLimit(makeRequest("/api/speedtest/down"));
    }
    expect(checkRateLimit(makeRequest("/api/ip"))).toBeNull();
  });

  it("tracks different IPs independently", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimit(makeRequest("/api/ip", "1.2.3.4"));
    }
    expect(checkRateLimit(makeRequest("/api/ip", "5.6.7.8"))).toBeNull();
  });

  it("includes CORS headers in rate limit response", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimit(makeRequest("/api/ip"));
    }
    const result = checkRateLimit(makeRequest("/api/ip"));
    expect(result!.headers.has("Access-Control-Allow-Origin")).toBe(true);
  });
});

// ─── corsHeaders ──────────────────────────────────────────────────────

describe("corsHeaders", () => {
  it("returns the production origin for unknown origins", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://netcheck-site.oilygold.workers.dev"
    );
  });

  it("allows localhost:8787", () => {
    const req = new Request("https://example.com", {
      headers: { Origin: "http://localhost:8787" },
    });
    const headers = corsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:8787");
  });

  it("allows the production workers.dev origin", () => {
    const req = new Request("https://example.com", {
      headers: { Origin: "https://netcheck-site.oilygold.workers.dev" },
    });
    const headers = corsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://netcheck-site.oilygold.workers.dev"
    );
  });

  it("allows the pages.dev origin", () => {
    const req = new Request("https://example.com", {
      headers: { Origin: "https://7b64681b.netcheck-site.pages.dev" },
    });
    const headers = corsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://7b64681b.netcheck-site.pages.dev"
    );
  });

  it("rejects arbitrary origins", () => {
    const req = new Request("https://example.com", {
      headers: { Origin: "https://evil.com" },
    });
    const headers = corsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://netcheck-site.oilygold.workers.dev"
    );
  });

  it("includes required CORS headers", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ─── validateTargetUrl ────────────────────────────────────────────────

describe("validateTargetUrl", () => {
  it("accepts valid HTTPS URLs", () => {
    const result = validateTargetUrl("https://example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe("https://example.com/");
  });

  it("accepts valid HTTP URLs", () => {
    const result = validateTargetUrl("http://example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe("http://example.com/");
  });

  it("prepends https:// to bare hostnames", () => {
    const result = validateTargetUrl("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe("https://example.com/");
  });

  it("rejects null input", () => {
    const result = validateTargetUrl(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Missing");
  });

  it("rejects invalid URLs", () => {
    const result = validateTargetUrl("://bad");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid URL");
  });

  it("rejects non-HTTP protocols", () => {
    const result = validateTargetUrl("ftp://example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("HTTP");
  });

  it("rejects URLs with credentials", () => {
    const result = validateTargetUrl("https://user:pass@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("credentials");
  });

  it("rejects private hostnames via SSRF check", () => {
    expect(validateTargetUrl("https://127.0.0.1").ok).toBe(false);
    expect(validateTargetUrl("https://localhost").ok).toBe(false);
    expect(validateTargetUrl("https://10.0.0.1").ok).toBe(false);
    expect(validateTargetUrl("https://192.168.1.1").ok).toBe(false);
    expect(validateTargetUrl("https://169.254.169.254").ok).toBe(false);
  });

  it("rejects octal IP representations", () => {
    expect(validateTargetUrl("https://0177.0.0.1").ok).toBe(false);
  });

  it("rejects .internal TLD", () => {
    expect(validateTargetUrl("https://ec2.internal").ok).toBe(false);
  });

  it("accepts public hostnames", () => {
    expect(validateTargetUrl("https://github.com").ok).toBe(true);
    expect(validateTargetUrl("https://cloudflare.com").ok).toBe(true);
    expect(validateTargetUrl("https://1.1.1.1").ok).toBe(true);
  });
});
// ─── checkRateLimitKV ──────────────────────────────────────────────


function makeKvMock(initialValue?: string): KVNamespace {
  let stored = initialValue ?? null;
  return {
    get: async () => stored,
    put: async (_key: string, value: string) => { stored = value; },
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async () => ({ value: stored, metadata: null }),
  } as unknown as KVNamespace;
}

describe("checkRateLimitKV", () => {
  it("returns null when under limit", async () => {
    const kv = makeKvMock("5");
    const req = new Request("https://netcheck-site.oilygold.workers.dev/api/ip", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    const result = await checkRateLimitKV(req, kv);
    expect(result).toBeNull();
  });

  it("returns 429 when at limit", async () => {
    const kv = makeKvMock(String(RATE_LIMIT_MAX));
    const req = new Request("https://netcheck-site.oilygold.workers.dev/api/ip", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    const result = await checkRateLimitKV(req, kv);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("returns null when KV key does not exist", async () => {
    const kv = makeKvMock(); // no value
    const req = new Request("https://netcheck-site.oilygold.workers.dev/api/ip", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    const result = await checkRateLimitKV(req, kv);
    expect(result).toBeNull();
  });

  it("uses speed test limit for speedtest routes", async () => {
    const kv = makeKvMock("60"); // at speed burst limit
    const req = new Request("https://netcheck-site.oilygold.workers.dev/api/speedtest/down?bytes=1024", {
      headers: { "cf-connecting-ip": "5.6.7.8" },
    });
    const result = await checkRateLimitKV(req, kv);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("includes CORS headers in KV rate limit response", async () => {
    const kv = makeKvMock(String(RATE_LIMIT_MAX));
    const req = new Request("https://netcheck-site.oilygold.workers.dev/api/ip", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    const result = await checkRateLimitKV(req, kv);
    expect(result!.headers.has("Access-Control-Allow-Origin")).toBe(true);
  });
});

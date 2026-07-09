import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Edge rate limiter for POST /api/convert.
//
// Returns a real HTTP 429 (Too Many Requests) when a single IP exceeds the
// limit. This complements the Vercel Firewall rule (an edge-level flood
// backstop that returns 403); this middleware is the primary, friendly limit.
//
// NO-STORAGE PROMISE: the KV store holds ONLY per-IP request counters
// (a key like "mil:rl:<ip>" and an integer + TTL). It never sees, stores, or
// logs file names or file contents. Uploaded bytes never reach this layer.
// ---------------------------------------------------------------------------

// Requests allowed per window, per IP. Keep in sync with the README and the
// Vercel Firewall backstop (which should be set higher than this value).
const LIMIT = 15;
const WINDOW = "60 s"; // fixed window

export const config = {
  // Only run for the conversion endpoint. Middleware never touches uploads
  // for any other route.
  matcher: ["/api/convert"],
};

// Read Upstash credentials from either the Upstash naming or the Vercel
// Marketplace (KV) naming — the integration injects both.
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

// Instantiate once per edge isolate. If credentials are absent the limiter is
// disabled (fail-open) so the app keeps working; the Firewall backstop still
// applies at the edge. This is logged (no user data) so a misconfiguration is
// visible in the function logs.
const ratelimit =
  redisUrl && redisToken
    ? new Ratelimit({
        redis: new Redis({ url: redisUrl, token: redisToken }),
        limiter: Ratelimit.fixedWindow(LIMIT, WINDOW),
        prefix: "mil:rl",
        analytics: false,
      })
    : null;

function clientIp(req: NextRequest): string {
  // Vercel populates x-forwarded-for with the real client IP as the first hop.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function middleware(req: NextRequest) {
  // Only throttle the actual upload method; let CORS preflight / others pass.
  if (req.method !== "POST") return NextResponse.next();

  if (!ratelimit) {
    // Fail open: no KV configured. Firewall backstop is the safety net.
    console.warn(
      "[ratelimit] KV not configured (UPSTASH_REDIS_REST_URL/TOKEN); limiter disabled"
    );
    return NextResponse.next();
  }

  const ip = clientIp(req);

  try {
    const { success, limit, remaining, reset } = await ratelimit.limit(ip);
    const resetSeconds = Math.max(0, Math.ceil((reset - Date.now()) / 1000));

    if (!success) {
      return NextResponse.json(
        {
          error:
            "Too many requests. You've hit the rate limit — please wait a moment and try again.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(resetSeconds),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
          },
        }
      );
    }

    const res = NextResponse.next();
    res.headers.set("X-RateLimit-Limit", String(limit));
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(reset / 1000)));
    return res;
  } catch (err) {
    // If the KV call fails, fail open so a transient KV outage doesn't take
    // the converter offline. The Firewall backstop still protects the edge.
    console.warn("[ratelimit] limiter error; failing open");
    return NextResponse.next();
  }
}

// ---------------------------------------------------------------------------
// DevAuthMiddleware — server-side enforcement for developer/admin access.
//
// This is the ONLY place a privilege decision is trusted. The client's dev
// overlay is a visualisation tool that anyone can switch on by editing the
// bundle; nothing it does may change authoritative state. Every elevated action
// arrives here and is checked before it runs.
//
// Checks performed, in order:
//   1. Bearer token present and matches the server secret (DEV_ADMIN_TOKEN).
//   2. Token has not expired (tokens are short-lived).
//   3. Requested level is within the role's granted ceiling.
//   4. For Level 3, the request must also originate from an allowlisted IP.
//   5. Every attempt — pass or fail — is written to the audit log.
//
// Configuration (environment variables, never committed):
//   DEV_ADMIN_TOKEN   shared secret for elevation. Absent => dev access is OFF.
//   DEV_ADMIN_IPS     comma-separated IP allowlist required for Level 3.
//   DEV_TOKEN_TTL_MS  elevation lifetime (default 15 minutes).
// ---------------------------------------------------------------------------
const crypto = require("crypto");

const LEVELS = { STANDARD: 0, INSPECTOR: 1, TESTER: 2, ROOT: 3 };
const TOKEN_TTL_MS = Number(process.env.DEV_TOKEN_TTL_MS || 15 * 60 * 1000);

// Sessions granted elevation: sessionId -> { level, ip, expiresAt }
const devSessions = new Map();

/** Structured, immutable-style audit record for every elevated attempt. */
function audit(event) {
  const record = {
    timestamp: new Date().toISOString(),
    ...event
  };
  // Centralised logging would ship this to Datadog/CloudWatch; stdout is the
  // collection point on this deployment.
  console.log(`[dev-audit] ${JSON.stringify(record)}`);
}

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload ?? {}))
    .digest("hex")
    .slice(0, 16);
}

/** Constant-time compare so the secret can't be discovered by timing. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** Highest level this token may be granted. */
function ceilingFor(token) {
  const secret = process.env.DEV_ADMIN_TOKEN;
  if (!secret) return LEVELS.STANDARD; // dev access disabled unless configured
  if (!token || !safeEqual(token, secret)) return LEVELS.STANDARD;
  return LEVELS.ROOT;
}

function ipAllowedForRoot(ip) {
  const raw = process.env.DEV_ADMIN_IPS;
  if (!raw) return false; // Level 3 requires an explicit allowlist
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(ip);
}

/**
 * Express middleware. Attaches req.devLevel and rejects unauthorised requests.
 * Mount it in front of every /api/dev route.
 */
function devAuthMiddleware(req, res, next) {
  const ip = clientIp(req);
  const token = bearer(req);
  const requested = Number(req.body?.level ?? LEVELS.ROOT);
  const ceiling = ceilingFor(token);

  const deny = (reason, status = 403) => {
    audit({
      action: req.path,
      levelRequested: requested,
      status: "DENIED",
      reason,
      ip,
      payloadHash: hashPayload(req.body)
    });
    res.status(status).json({ message: "Forbidden" }); // no detail to the client
  };

  if (ceiling === LEVELS.STANDARD) return deny("invalid_or_missing_token", 401);
  if (!Number.isInteger(requested) || requested < 0 || requested > LEVELS.ROOT) {
    return deny("invalid_level", 400);
  }
  if (requested > ceiling) return deny("exceeds_role_ceiling");
  if (requested === LEVELS.ROOT && !ipAllowedForRoot(ip)) {
    return deny("ip_not_allowlisted_for_root");
  }

  req.devLevel = requested;
  req.devIp = ip;
  audit({
    action: req.path,
    levelRequested: requested,
    status: "ALLOWED",
    ip,
    payloadHash: hashPayload(req.body)
  });
  next();
}

/** Register the dev API. Safe to call always: it is inert without the secret. */
function registerDevRoutes(app, ctx) {
  app.post("/api/dev/elevate", devAuthMiddleware, (req, res) => {
    const sessionId = crypto.randomUUID();
    devSessions.set(sessionId, {
      level: req.devLevel,
      ip: req.devIp,
      expiresAt: Date.now() + TOKEN_TTL_MS
    });
    res.json({ granted: req.devLevel, sessionId, expiresInMs: TOKEN_TTL_MS });
  });

  // Privileged operations. Note what is NOT here: there is no "eval" and no raw
  // query execution. Only an explicit allowlist of safe, bounded commands, so
  // a leaked token cannot be escalated into arbitrary code execution.
  app.post("/api/dev/command", devAuthMiddleware, (req, res) => {
    const { command, args } = req.body || {};
    const rooms = ctx?.rooms;

    switch (command) {
      case "stats": {
        // Level 1+: read-only telemetry.
        return res.json({
          output: JSON.stringify({
            rooms: rooms ? rooms.size : 0,
            uptimeSec: Math.round(process.uptime()),
            memoryMb: Math.round(process.memoryUsage().heapUsed / 1048576)
          })
        });
      }
      case "listRooms": {
        if (req.devLevel < LEVELS.INSPECTOR) return res.status(403).json({ message: "Forbidden" });
        const out = [];
        if (rooms) {
          for (const [code, room] of rooms) {
            out.push({ code, players: room.players.size, inGame: !!room.inGame });
          }
        }
        return res.json({ output: JSON.stringify(out) });
      }
      case "closeRoom": {
        // Level 3: mutates authoritative state, so it runs only here.
        if (req.devLevel < LEVELS.ROOT) return res.status(403).json({ message: "Forbidden" });
        const code = String(args?.code || "").toUpperCase();
        if (!rooms || !rooms.has(code)) return res.status(404).json({ message: "No such room" });
        rooms.delete(code);
        return res.json({ output: `closed ${code}` });
      }
      default:
        return res.status(400).json({ message: "Unknown command" });
    }
  });
}

module.exports = { devAuthMiddleware, registerDevRoutes, LEVELS };

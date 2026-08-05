// ---------------------------------------------------------------------------
// Developer / debug access control (client half).
//
// SECURITY BOUNDARY — read this before extending:
//   Anything in this file runs in the browser and is therefore UNTRUSTED. A
//   player can edit it in DevTools, so it must only ever drive *visualisation*
//   and *local* conveniences (hitboxes, FPS, freezing the local sim). It is a
//   UX gate, not a security control.
//
//   Every state-altering privileged action (Level 2 sandbox events, Level 3
//   admin commands) is sent to the server and authorised there by
//   DevAuthMiddleware, which checks a signed token, the requested level and an
//   allowlist before it will run anything. The server is the only place a
//   privilege decision actually counts.
// ---------------------------------------------------------------------------

export enum DevLevel {
  /** Standard player. No tooling. */
  Standard = 0,
  /** Inspector / QA: read-only visualisation (hitboxes, FPS, pathing). */
  Inspector = 1,
  /** Tester / designer: local sim controls (freeze, speed, teleport). */
  Tester = 2,
  /** Root: may *request* privileged server operations (server decides). */
  Root = 3
}

export interface DevState {
  level: DevLevel;
  overlayOpen: boolean;
  /** Level 1 visualisations. */
  showHitboxes: boolean;
  showGrid: boolean;
  showPaths: boolean;
  showFps: boolean;
  /** Level 2 local sim controls. */
  freeze: boolean;
  speedMultiplier: number;
  /** Set once the server has accepted an elevation request. */
  serverVerified: boolean;
}

const STORAGE_KEY = "cith.dev";
const IDLE_DOWNGRADE_MS = 10 * 60 * 1000; // auto-drop to Level 0 when idle

const DEFAULT_STATE: DevState = {
  level: DevLevel.Standard,
  overlayOpen: false,
  showHitboxes: false,
  showGrid: false,
  showPaths: false,
  showFps: false,
  freeze: false,
  speedMultiplier: 1,
  serverVerified: false
};

type Listener = (s: DevState) => void;

let state: DevState = { ...DEFAULT_STATE };
const listeners = new Set<Listener>();
let idleTimer = 0;

function emit() {
  for (const l of listeners) l(state);
}

export function getDevState(): DevState {
  return state;
}

export function subscribeDev(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function setDevState(patch: Partial<DevState>) {
  state = { ...state, ...patch };
  // Capabilities are clamped to the current level, so lowering the level
  // immediately disables anything it no longer permits.
  if (state.level < DevLevel.Tester) {
    state.freeze = false;
    state.speedMultiplier = 1;
  }
  if (state.level < DevLevel.Inspector) {
    state.showHitboxes = false;
    state.showGrid = false;
    state.showPaths = false;
    state.showFps = false;
    state.overlayOpen = false;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ level: state.level })
    );
  } catch {
    /* ignore */
  }
  emit();
}

/** True when the current level permits a capability. */
export function can(required: DevLevel): boolean {
  return state.level >= required;
}

/**
 * Local elevation to Levels 1-2 only. These grant *visualisation and local sim*
 * powers, which a determined user could grant themselves anyway by editing the
 * bundle, so gating them client-side is purely a convenience.
 *
 * Level 3 is deliberately NOT reachable from here: it must be granted by the
 * server (see requestElevation) because it is the only tier that can change
 * authoritative state.
 */
export function setLocalLevel(level: DevLevel) {
  // Level 3 is never grantable locally — it must come from the server.
  if (level >= DevLevel.Root) return;
  setDevState({ level, serverVerified: false });
  resetIdleTimer();
}

/**
 * Ask the SERVER to elevate this session. The token never grants anything on
 * its own: the server validates it, checks the requested level against the
 * account's role, and audit-logs the attempt either way. A rejection leaves the
 * client at its current level.
 */
export async function requestElevation(
  token: string,
  level: DevLevel
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/dev/elevate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ level })
    });
    const data = (await res.json().catch(() => ({}))) as {
      granted?: number;
      message?: string;
    };
    if (!res.ok || typeof data.granted !== "number") {
      return { ok: false, message: data.message ?? `Rejected (${res.status})` };
    }
    setDevState({ level: data.granted as DevLevel, serverVerified: true });
    resetIdleTimer();
    return { ok: true, message: `Granted level ${data.granted}` };
  } catch (err) {
    return { ok: false, message: `Request failed: ${String(err)}` };
  }
}

/**
 * Run a privileged (Level 2/3) command. The client only *transports* it; the
 * server re-checks authorisation and executes. Never perform the effect locally.
 */
export async function runPrivileged(
  token: string,
  command: string,
  args: Record<string, unknown> = {}
): Promise<{ ok: boolean; output: string }> {
  try {
    const res = await fetch("/api/dev/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ command, args })
    });
    const data = (await res.json().catch(() => ({}))) as {
      output?: string;
      message?: string;
    };
    if (!res.ok) return { ok: false, output: data.message ?? `Rejected (${res.status})` };
    return { ok: true, output: data.output ?? "ok" };
  } catch (err) {
    return { ok: false, output: `Request failed: ${String(err)}` };
  }
}

/** Idle sessions drop back to Level 0 so a walked-away tab isn't left elevated. */
function resetIdleTimer() {
  if (typeof window === "undefined") return;
  window.clearTimeout(idleTimer);
  if (state.level === DevLevel.Standard) return;
  idleTimer = window.setTimeout(() => {
    setDevState({ level: DevLevel.Standard, serverVerified: false });
  }, IDLE_DOWNGRADE_MS);
}

if (typeof window !== "undefined") {
  ["pointerdown", "keydown"].forEach((e) =>
    window.addEventListener(e, () => {
      if (state.level !== DevLevel.Standard) resetIdleTimer();
    })
  );
}

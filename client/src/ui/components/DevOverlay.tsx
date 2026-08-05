import { useEffect, useState } from "react";
import { useGame } from "../GameContext";
import {
  DevLevel,
  can,
  getDevState,
  requestElevation,
  runPrivileged,
  setDevState,
  setLocalLevel,
  subscribeDev,
  type DevState
} from "../../game/devAccess";

/**
 * Developer overlay. Opens with Cmd/Ctrl + Shift + D (or `~`).
 *
 * Everything toggled here is a local visualisation or a local sim control —
 * safe to expose, because none of it changes authoritative state. The console
 * at the bottom does NOT execute anything in the browser: it forwards the
 * command to the server, which re-checks authorisation and runs it there.
 */
export function DevOverlay() {
  const { floor, floorTotal, jumpToFloor, hostId, connected } = useGame();
  const isMultiplayer = !!hostId && connected;
  const [dev, setDev] = useState<DevState>(getDevState());
  const [token, setToken] = useState("");
  const [cmd, setCmd] = useState("stats");
  const [log, setLog] = useState<string[]>([]);
  const [fps, setFps] = useState(0);

  useEffect(() => subscribeDev(setDev), []);

  // Shortcut: Cmd/Ctrl+Shift+D, or the tilde key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d";
      const tilde = e.key === "~" || e.key === "`";
      if (!combo && !tilde) return;
      // Don't hijack the tilde while the user is typing a name / room code.
      const el = document.activeElement;
      if (tilde && el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      e.preventDefault();
      const s = getDevState();
      if (s.level === DevLevel.Standard) setLocalLevel(DevLevel.Inspector);
      setDevState({ overlayOpen: !s.overlayOpen });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lightweight FPS meter, only while it's being displayed.
  useEffect(() => {
    if (!dev.overlayOpen || !dev.showFps) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dev.overlayOpen, dev.showFps]);

  if (!dev.overlayOpen) return null;

  const append = (line: string) => setLog((l) => [line, ...l].slice(0, 8));

  const elevate = async () => {
    const res = await requestElevation(token, DevLevel.Root);
    append(`${res.ok ? "✓" : "✗"} elevate: ${res.message}`);
  };

  const send = async () => {
    const res = await runPrivileged(token, cmd.trim());
    append(`${res.ok ? "✓" : "✗"} ${cmd}: ${res.output}`);
  };

  return (
    <div className="dev-overlay" role="dialog" aria-label="Developer tools">
      <div className="dev-overlay__head">
        <strong>Dev Tools</strong>
        <span className={`dev-badge dev-badge--l${dev.level}`}>
          L{dev.level}
          {dev.serverVerified ? " • server" : " • local"}
        </span>
        <button className="dev-x" onClick={() => setDevState({ overlayOpen: false })}>
          ✕
        </button>
      </div>

      <div className="dev-row">
        <span className="dev-label">Level</span>
        {[DevLevel.Standard, DevLevel.Inspector, DevLevel.Tester].map((l) => (
          <button
            key={l}
            className={`dev-chip ${dev.level === l ? "is-on" : ""}`}
            onClick={() => setLocalLevel(l)}
          >
            {l}
          </button>
        ))}
        <span className="dev-note">3 = server only</span>
      </div>

      {can(DevLevel.Inspector) && (
        <div className="dev-row dev-row--wrap">
          <span className="dev-label">View</span>
          {(
            [
              ["showHitboxes", "Hitboxes"],
              ["showGrid", "Grid"],
              ["showPaths", "Cat path"],
              ["showFps", "FPS"]
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className={`dev-chip ${dev[k] ? "is-on" : ""}`}
              onClick={() => setDevState({ [k]: !dev[k] } as Partial<DevState>)}
            >
              {label}
            </button>
          ))}
          {dev.showFps && <span className="dev-note">{fps} fps</span>}
        </div>
      )}

      {can(DevLevel.Tester) && (
        <div className="dev-row dev-row--wrap">
          <span className="dev-label">Level</span>
          {Array.from({ length: floorTotal }).map((_, i) => (
            <button
              key={i}
              className={`dev-chip ${floor === i + 1 ? "is-on" : ""}`}
              onClick={() => jumpToFloor(i + 1)}
              disabled={isMultiplayer}
              title={
                isMultiplayer
                  ? "Solo only — jumping would desync the other players"
                  : `Jump to level ${i + 1}`
              }
            >
              {i + 1}
            </button>
          ))}
          {isMultiplayer && <span className="dev-note">solo only</span>}
        </div>
      )}

      {can(DevLevel.Tester) && (
        <div className="dev-row dev-row--wrap">
          <span className="dev-label">Sim</span>
          <button
            className={`dev-chip ${dev.freeze ? "is-on" : ""}`}
            onClick={() => setDevState({ freeze: !dev.freeze })}
          >
            Freeze
          </button>
          {[0.5, 1, 2].map((m) => (
            <button
              key={m}
              className={`dev-chip ${dev.speedMultiplier === m ? "is-on" : ""}`}
              onClick={() => setDevState({ speedMultiplier: m })}
            >
              {m}x
            </button>
          ))}
        </div>
      )}

      <div className="dev-row dev-row--wrap">
        <span className="dev-label">Admin</span>
        <input
          className="dev-input"
          type="password"
          placeholder="admin token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="dev-chip" onClick={elevate} disabled={!token}>
          Elevate
        </button>
      </div>

      <div className="dev-row dev-row--wrap">
        <span className="dev-label">Cmd</span>
        <input
          className="dev-input dev-input--wide"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="stats | listRooms | closeRoom"
          onKeyDown={(e) => e.key === "Enter" && token && send()}
        />
        <button className="dev-chip" onClick={send} disabled={!token}>
          Run
        </button>
      </div>

      {log.length > 0 && (
        <pre className="dev-log">{log.join("\n")}</pre>
      )}
      <p className="dev-foot">
        Toggles are local visualisation only. Commands execute on the server
        after it re-checks authorisation.
      </p>
    </div>
  );
}

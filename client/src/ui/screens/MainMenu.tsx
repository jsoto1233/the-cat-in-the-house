import { useEffect, useState } from "react";
import { useGame, type Difficulty } from "../GameContext";
import { Button } from "../components/Button";
import { playCatScratch } from "../../game/sfx";
import { SkinPicker } from "../components/SkinPicker";

// Scratch-mark lifecycle on the menu.
const SCRATCH_FIRST_DELAY_MS = 1800; // screen stays blank this long on load
const SCRATCH_LIFETIME_MS = 60000; // marks hold, then fade (CSS tail)
const SCRATCH_GAP_MS = 2500; // blank gap before it claws somewhere new

interface Scratch {
  id: number;
  left: number; // % from the left edge
  top: number; // % from the top
  flip: boolean; // mirror the rake for right-side spawns
}

export function MainMenu() {
  const {
    connected,
    playerName,
    setPlayerName,
    createRoom,
    joinRoom,
    startSinglePlayer
  } = useGame();
  const [name, setName] = useState(playerName);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  const handleName = (value: string) => {
    setName(value);
    setPlayerName(value);
  };

  // One scratch "event" at a time: the screen starts blank, the cat claws a
  // random spot (slash + hiss + a small screen shake), the marks linger for
  // ~60s while its eyes watch from beside them, everything fades out, then it
  // happens again somewhere else. Audio only sounds after a user gesture and
  // when not muted.
  const [scratch, setScratch] = useState<Scratch | null>(null);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    let timer = 0;
    let cancelled = false;
    let n = 0;

    const spawn = () => {
      if (cancelled) return;
      n += 1;
      // Keep the marks in the empty side bands so they never sit on the panel.
      const onRight = Math.random() < 0.5;
      const band = 5 + Math.random() * 17; // 5-22% in from the edge
      setScratch({
        id: n,
        left: onRight ? 100 - band : band,
        top: 14 + Math.random() * 58,
        flip: onRight
      });
      playCatScratch();
      setShaking(true);
      timer = window.setTimeout(() => setShaking(false), 420);

      timer = window.setTimeout(() => {
        if (cancelled) return;
        setScratch(null); // fade-out is the tail of the CSS lifetime animation
        timer = window.setTimeout(spawn, SCRATCH_GAP_MS);
      }, SCRATCH_LIFETIME_MS);
    };

    // Blank screen first, then the first scratch.
    timer = window.setTimeout(spawn, SCRATCH_FIRST_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`screen ${shaking ? "is-shaking" : ""}`}>
      <div className="menu-decor" aria-hidden="true">
        {scratch && (
          <div
            key={scratch.id}
            className={`scratch-mark ${scratch.flip ? "scratch-mark--flip" : ""}`}
            style={{ left: `${scratch.left}%`, top: `${scratch.top}%` }}
          >
            <div className="claws">
              <i />
              <i />
              <i />
            </div>
            {/* The cat's eyes belong to this scratch, right beside the marks. */}
            <div className="cat-eyes">
              <span />
              <span />
            </div>
          </div>
        )}
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="mote"
            style={{
              left: `${(i * 61 + 7) % 100}%`,
              animationDelay: `${(i * 0.9) % 11}s`,
              animationDuration: `${10 + (i % 6) * 2}s`
            }}
          />
        ))}
      </div>
      <div className="menu-shell">
        <div className="brand brand--bleed">
          <h1 className="brand__title brand__title--bleed">The Cat in the House</h1>
          <svg
            className="brand__drips"
            viewBox="0 0 400 64"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="blood-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e0294a" />
                <stop offset="55%" stopColor="#c41e3a" />
                <stop offset="100%" stopColor="#7d0f22" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="400" height="6" fill="url(#blood-grad)" />
            <path d="M22 0 h12 v30 a6 6 0 0 1 -12 0 z" fill="url(#blood-grad)" />
            <path d="M70 0 h9 v16 a4.5 4.5 0 0 1 -9 0 z" fill="url(#blood-grad)" />
            <path d="M118 0 h12 v44 a6 6 0 0 1 -12 0 z" fill="url(#blood-grad)" />
            <path d="M168 0 h8 v12 a4 4 0 0 1 -8 0 z" fill="url(#blood-grad)" />
            <path d="M214 0 h13 v52 a6.5 6.5 0 0 1 -13 0 z" fill="url(#blood-grad)" />
            <path d="M262 0 h9 v22 a4.5 4.5 0 0 1 -9 0 z" fill="url(#blood-grad)" />
            <path d="M312 0 h11 v34 a5.5 5.5 0 0 1 -11 0 z" fill="url(#blood-grad)" />
            <path d="M360 0 h8 v18 a4 4 0 0 1 -8 0 z" fill="url(#blood-grad)" />
            <ellipse className="brand__droplet" cx="220" cy="60" rx="4" ry="5" fill="#a01730" />
            <ellipse className="brand__droplet brand__droplet--slow" cx="124" cy="58" rx="3.4" ry="4.4" fill="#a01730" />
          </svg>
          <p className="brand__subtitle">Escape together. Don&apos;t get caught.</p>
        </div>

        <div className="menu-layout">
          <SkinPicker />
          <div className="panel menu-panel">
          <div className="field">
            <label className="field__label" htmlFor="player-name">
              Player name
            </label>
            <input
              id="player-name"
              className="field__input"
              value={name}
              maxLength={16}
              onChange={(e) => handleName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          {joining ? (
            <>
              <div className="field">
                <label className="field__label" htmlFor="room-code">
                  Room code
                </label>
                <input
                  id="room-code"
                  className="field__input field__input--code"
                  value={code}
                  maxLength={8}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                />
              </div>
              <div className="btn-row">
                <Button variant="secondary" onClick={() => setJoining(false)}>
                  Back
                </Button>
                <Button
                  disabled={code.trim().length < 4}
                  onClick={() => joinRoom(name, code)}
                >
                  Join
                </Button>
              </div>
            </>
          ) : (
            <div className="btn-stack">
              <div className="difficulty">
                <span className="difficulty__label">Difficulty</span>
                <div className="difficulty__toggle" role="group" aria-label="Difficulty">
                  <button
                    type="button"
                    className={`difficulty__opt ${difficulty === "normal" ? "is-active" : ""}`}
                    aria-pressed={difficulty === "normal"}
                    onClick={() => setDifficulty("normal")}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    className={`difficulty__opt difficulty__opt--ludicrous ${
                      difficulty === "ludicrous" ? "is-active" : ""
                    }`}
                    aria-pressed={difficulty === "ludicrous"}
                    onClick={() => setDifficulty("ludicrous")}
                  >
                    Ludicrous
                  </button>
                </div>
              </div>
              <Button onClick={() => startSinglePlayer(difficulty)}>Single Player</Button>
              <Button variant="secondary" onClick={() => createRoom(name)}>
                Create lobby
              </Button>
              <Button variant="secondary" onClick={() => setJoining(true)}>
                Join lobby
              </Button>
            </div>
          )}

          <div className="divider" />
          <div className="center">
            <span className="status-pill">
              <span
                className={`status-dot ${
                  connected ? "status-dot--online" : "status-dot--offline"
                }`}
              />
              {connected ? "Connected to server" : "Offline (demo mode)"}
            </span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

import type { CatMood, PlayerState } from "../../types";

interface HUDProps {
  objective: string;
  timeLeftMs: number;
  cluesFound: number;
  cluesTotal: number;
  lives: number;
  livesTotal: number;
  graceMs: number;
  lethal: boolean;
  players: PlayerState[];
  catMood: CatMood;
  localId: string;
  onPause: () => void;
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const MOOD_LABEL: Record<CatMood, string> = {
  calm: "Cat: calm",
  warning: "Cat: alert",
  aggressive: "Cat: hunting"
};

export function HUD({
  objective,
  timeLeftMs,
  cluesFound,
  cluesTotal,
  lives,
  livesTotal,
  graceMs,
  lethal,
  players,
  catMood,
  localId,
  onPause
}: HUDProps) {
  const low = timeLeftMs <= 30_000;
  const inGrace = graceMs > 0;

  return (
    <div className="hud">
      <div className="hud__row">
        <div className="hud__card hud__objective">
          <span className="hud__label">Objective</span>
          <p>{objective}</p>
        </div>
        <div className="hud__row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
          {inGrace ? (
            <div className="hud__card hud__grace" aria-live="polite">
              <span className="hud__label">Cat wakes in</span>
              <strong>{formatTime(graceMs)}</strong>
            </div>
          ) : (
            <div className={`hud__card hud__awake ${lethal ? "is-lethal" : ""}`}>
              <span className="hud__label">Cat</span>
              <strong>AWAKE</strong>
            </div>
          )}
          <div className={`hud__card hud__timer ${low ? "is-low" : ""}`}>
            <span className="hud__label">Time</span>
            <strong aria-live="polite">{formatTime(timeLeftMs)}</strong>
          </div>
          <button className="icon-btn" onClick={onPause} aria-label="Pause">
            II
          </button>
        </div>
      </div>

      <div className="hud__bottom">
        <div className="hud__bottom-left">
          <div className="hud__card">
            <span className="hud__label">Clues</span>
            <span className="clue">
              <strong>{cluesFound}</strong>
              <span className="dim">/ {cluesTotal}</span>
            </span>
          </div>
          <div className="hud__card">
            <span className="hud__label">Lives</span>
            <span className="hearts" aria-label={`${lives} of ${livesTotal} lives`}>
              {Array.from({ length: livesTotal }).map((_, i) => (
                <span key={i} className={`heart ${i < lives ? "" : "heart--lost"}`}>
                  {"\u2665"}
                </span>
              ))}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-end" }}>
          <span className={`cat-mood cat-mood--${catMood}`}>{MOOD_LABEL[catMood]}</span>
          <div className="players-strip">
            {players.map((p) => (
              <span
                key={p.id}
                className={`player-chip ${p.alive ? "" : "player-chip--down"}`}
              >
                {p.name}
                {p.id === localId ? " (you)" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

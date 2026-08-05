import { useEffect, useRef, useState } from "react";

interface HUDProps {
  timeLeftMs: number;
  cashFound: number;
  cashTotal: number;
  hasKey: boolean;
  lives: number;
  livesTotal: number;
  floor: number;
  floorTotal: number;
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

export function HUD({
  timeLeftMs,
  cashFound,
  cashTotal,
  hasKey,
  lives,
  livesTotal,
  floor,
  floorTotal,
  onPause
}: HUDProps) {
  const low = timeLeftMs <= 30_000;
  const topFloor = floor >= floorTotal;

  // Briefly flag hearts that were just granted (e.g. the outdoor top-up) so
  // they pop in instead of silently appearing when the zone changes.
  const prevLives = useRef(lives);
  const [gainedFrom, setGainedFrom] = useState<number | null>(null);
  useEffect(() => {
    if (lives > prevLives.current) {
      setGainedFrom(prevLives.current);
      const id = window.setTimeout(() => setGainedFrom(null), 700);
      prevLives.current = lives;
      return () => window.clearTimeout(id);
    }
    prevLives.current = lives;
  }, [lives]);

  return (
    <header className="hud" aria-label="Game status">
      <div className="hud__slot">
        <div className={`hud__cell hud__card hud__floor ${topFloor ? "is-top" : ""}`}>
          <span className="hud__label">Level</span>
          <span className="hud__stat-value" aria-label={`Level ${floor} of ${floorTotal}`}>
            <strong>{floor}</strong>
            <span className="dim">/ {floorTotal}</span>
            {topFloor && <span className="hud__floor-flag" aria-hidden="true"> ⌂</span>}
          </span>
        </div>
      </div>

      <div className="hud__slot">
        <div className="hud__cell hud__card hud__loot">
          <span className="hud__label">Loot</span>
          <span className="hud__stat-value cash-counter" aria-label={`${cashFound} of ${cashTotal} valuables collected`}>
            <span className="cash-counter__sign" aria-hidden="true">
              $
            </span>
            <strong>{cashFound}</strong>
            <span className="dim">/ {cashTotal}</span>
          </span>
        </div>
      </div>

      <div className="hud__slot">
        <div className={`hud__cell hud__card hud__key ${hasKey ? "has-key" : ""}`}>
          <span className="hud__label">Key</span>
          <span className="hud__stat-value" aria-label={hasKey ? "Chest key found" : "No key yet"}>
            {hasKey ? "\u{1F511}" : "\u2014"}
          </span>
        </div>
      </div>

      <div className="hud__slot">
        <div className="hud__cell hud__card hud__lives">
          <span className="hud__label">Lives</span>
          <span className="hud__stat-value hearts" aria-label={`${lives} of ${livesTotal} lives`}>
            {Array.from({ length: livesTotal }).map((_, i) => (
              <span
                key={i}
                className={`heart ${i < lives ? "" : "heart--lost"} ${
                  gainedFrom !== null && i >= gainedFrom && i < lives
                    ? "heart--gained"
                    : ""
                }`}
              >
                {"\u2665"}
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className="hud__slot">
        <div className={`hud__cell hud__card hud__timer ${low ? "is-low" : ""}`}>
          <span className="hud__label">Time</span>
          <strong aria-live="polite">{formatTime(timeLeftMs)}</strong>
        </div>
      </div>

      <div className="hud__slot">
        <button className="hud__cell hud__pause-btn" type="button" onClick={onPause} aria-label="Pause">
          <span className="hud__pause-icon" aria-hidden="true">
            II
          </span>
        </button>
      </div>
    </header>
  );
}

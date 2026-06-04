interface HUDProps {
  objective: string;
  showObjectivePanel: boolean;
  objectivePanelActive: boolean;
  onObjectiveToggle: () => void;
  timeLeftMs: number;
  cashFound: number;
  cashTotal: number;
  lives: number;
  livesTotal: number;
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
  objective,
  showObjectivePanel,
  objectivePanelActive,
  onObjectiveToggle,
  timeLeftMs,
  cashFound,
  cashTotal,
  lives,
  livesTotal,
  onPause
}: HUDProps) {
  const low = timeLeftMs <= 30_000;

  return (
    <div className="hud">
      <div className="hud__row">
        <div className="hud__objective-wrap">
          <button
            type="button"
            className={`hud__objective-btn ${objectivePanelActive ? "is-active" : ""}`}
            onClick={onObjectiveToggle}
            aria-expanded={showObjectivePanel}
            aria-controls="hud-objective-panel"
          >
            Objective
          </button>
          {showObjectivePanel && (
            <div
              id="hud-objective-panel"
              className="hud__objective-panel"
              role="region"
              aria-label="Mission objective"
            >
              <p>{objective}</p>
            </div>
          )}
        </div>
        <div className="hud__row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
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
          <div className="hud__card hud__stat hud__loot">
            <span className="hud__label">Loot</span>
            <span className="hud__stat-value cash-counter" aria-label={`${cashFound} of ${cashTotal} valuables collected`}>
              <span className="cash-counter__sign" aria-hidden="true">
                $
              </span>
              <strong>{cashFound}</strong>
              <span className="dim">/ {cashTotal}</span>
            </span>
          </div>
          <div className="hud__card hud__stat hud__lives">
            <span className="hud__label">Lives</span>
            <span className="hud__stat-value hearts" aria-label={`${lives} of ${livesTotal} lives`}>
              {Array.from({ length: livesTotal }).map((_, i) => (
                <span key={i} className={`heart ${i < lives ? "" : "heart--lost"}`}>
                  {"\u2665"}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

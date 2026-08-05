import { PLAYER_COLORS, playerColorCss } from "../../game/house/houseLayout";

/**
 * Shared pre-game directions content. Rendered two ways:
 *  - solo: as a full-screen overlay in GameView, which holds the match paused
 *    (timer, entities and floor spawning) until the player dismisses it.
 *  - multiplayer: inline in the Lobby, which already owns the readiness state,
 *    so everyone reads the rules and readies up before the host starts.
 */
export function Briefing({ mode }: { mode: "solo" | "multiplayer" }) {
  return (
    <div className="briefing">
      <section className="briefing__block">
        <h3 className="briefing__h">Objective</h3>
        <ol className="briefing__list">
          <li>Grab all the loot scattered through the floor.</li>
          <li>Search cabinets and boxes (glowing blue) to find the key.</li>
          <li>Use the key on the locked chest (glowing gold) for bonus loot.</li>
          <li>Reach the exit before the timer runs out.</li>
        </ol>
      </section>

      <section className="briefing__block">
        <h3 className="briefing__h">Controls</h3>
        <ul className="briefing__keys">
          <li>
            <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <span>or</span>{" "}
            <kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd>
            <em>Move</em>
          </li>
          <li>
            <kbd>E</kbd>
            <em>Search / open</em>
          </li>
          <li>
            <kbd>Esc</kbd>
            <em>Pause</em>
          </li>
          <li>
            <kbd>~</kbd> <span>or</span> <kbd>⌘/Ctrl</kbd>+<kbd>⇧</kbd>+<kbd>D</kbd>
            <em>Debug overlay</em>
          </li>
        </ul>
      </section>

      <section className="briefing__block">
        <h3 className="briefing__h">Win &amp; lose</h3>
        <ul className="briefing__list">
          <li>
            <span className="briefing__win">Win</span> — collect everything and
            reach the exit. Clear all 8 floors to escape for good.
          </li>
          <li>
            <span className="briefing__lose">Lose</span> — the cat catches you
            and you drop a life. Run out of lives, or let the timer hit zero, and
            the run is over.
          </li>
          <li>Big furniture blocks you and the cat: use it to break line of sight.</li>
          {mode === "solo" ? (
            <li>Head outside after floor 4 — you&apos;ll pick up extra lives.</li>
          ) : (
            <li>The cat chases whoever it can see, so split up and cover more ground.</li>
          )}
        </ul>
      </section>

      {mode === "multiplayer" && (
        <section className="briefing__block">
          <h3 className="briefing__h">Your crew</h3>
          <div className="briefing__crew">
            {PLAYER_COLORS.map((_, i) => (
              <span key={i} className="briefing__crew-item">
                <span
                  className="briefing__dot"
                  style={{ backgroundColor: playerColorCss(i) }}
                />
                P{i + 1}
              </span>
            ))}
          </div>
          <p className="briefing__note">
            Loot is shared — the counter is the whole crew&apos;s total. Everyone
            must ready up before the host can start.
          </p>
        </section>
      )}
    </div>
  );
}

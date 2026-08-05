import { PLAYER_COLORS, playerColorCss } from "../../game/house/houseLayout";

/**
 * Pre-game directions. Kept deliberately terse — players skim this, so it's the
 * four steps, the keys, and nothing else. Rendered as a full-screen overlay for
 * solo and as a side card in the Lobby for multiplayer.
 */
export function Briefing({ mode }: { mode: "solo" | "multiplayer" }) {
  return (
    <div className="briefing">
      <section className="briefing__block">
        <h3 className="briefing__h">Objective</h3>
        <ol className="briefing__list">
          <li>Grab all the loot.</li>
          <li>
            Search <span className="briefing__cue briefing__cue--search">blue</span>{" "}
            containers for the key.
          </li>
          <li>
            Unlock the <span className="briefing__cue briefing__cue--chest">gold</span>{" "}
            chest.
          </li>
          <li>Reach the exit before time runs out.</li>
        </ol>
      </section>

      <section className="briefing__block">
        <h3 className="briefing__h">Controls</h3>
        <ul className="briefing__keys">
          <li>
            {/* Laid out like the real keys: one on top, three beneath. */}
            <span className="keypad">
              <kbd>W</kbd>
              <span className="keypad__row">
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
              </span>
            </span>
            <span className="keypad__or">or</span>
            <span className="keypad">
              <kbd>↑</kbd>
              <span className="keypad__row">
                <kbd>←</kbd>
                <kbd>↓</kbd>
                <kbd>→</kbd>
              </span>
            </span>
            <em>Move</em>
          </li>
          <li>
            <kbd>E</kbd>
            <em>Search</em>
          </li>
          <li>
            <kbd>Esc</kbd>
            <em>Pause</em>
          </li>
        </ul>
      </section>

      <section className="briefing__block">
        <h3 className="briefing__h">Tips</h3>
        <ul className="briefing__list">
          <li>Hide behind big furniture.</li>
          <li>10 levels to escape.</li>
          {mode === "multiplayer" && <li>Loot is shared. Split up.</li>}
        </ul>
        {mode === "multiplayer" && (
          <div className="briefing__crew">
            {PLAYER_COLORS.map((_, i) => (
              <span
                key={i}
                className="briefing__dot"
                style={{ backgroundColor: playerColorCss(i) }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

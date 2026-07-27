import { useState } from "react";

/**
 * Full-screen "click to enter" gate shown on load. Browsers won't let audio
 * play until the user interacts, so this turns that first click into the act of
 * entering — the same click unlocks the background music (MusicPlayer listens
 * for it on the window), so the track starts the instant the splash is dismissed
 * instead of after an awkward silent moment.
 */
export function StartSplash() {
  const [entered, setEntered] = useState(false);
  if (entered) return null;

  const enter = () => setEntered(true);

  return (
    <div
      className="start-splash"
      role="button"
      tabIndex={0}
      aria-label="Click to enter"
      onClick={enter}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") enter();
      }}
    >
      <div className="start-splash__inner">
        <h1 className="start-splash__title">The Cat in the House</h1>
        <p className="start-splash__hint">Click to enter</p>
      </div>
    </div>
  );
}

import { Button } from "./Button";

interface PauseOverlayProps {
  open: boolean;
  /** When false, this client is waiting on another player to unpause. */
  canResume?: boolean;
  onResume: () => void;
  onLeave: () => void;
}

export function PauseOverlay({
  open,
  canResume = true,
  onResume,
  onLeave
}: PauseOverlayProps) {
  if (!open) return null;

  if (!canResume) {
    return (
      <div
        className="overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Game paused by another player"
      >
        <div className="panel overlay__panel">
          <h2 className="overlay__title">Paused</h2>
          <p className="overlay__wait">A player has paused the game</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="panel overlay__panel">
        <h2 className="overlay__title">Paused</h2>
        <div className="btn-stack">
          <Button onClick={onResume}>Resume</Button>
          <Button variant="ghost" onClick={onLeave}>
            Leave to menu
          </Button>
        </div>
      </div>
    </div>
  );
}

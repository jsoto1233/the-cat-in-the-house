import { Button } from "./Button";

interface PauseOverlayProps {
  open: boolean;
  onResume: () => void;
  onSettings: () => void;
  onLeave: () => void;
}

export function PauseOverlay({
  open,
  onResume,
  onSettings,
  onLeave
}: PauseOverlayProps) {
  if (!open) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="panel overlay__panel">
        <h2 className="overlay__title">Paused</h2>
        <div className="btn-stack">
          <Button onClick={onResume}>Resume</Button>
          <Button variant="secondary" onClick={onSettings}>
            Settings
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            Leave to menu
          </Button>
        </div>
      </div>
    </div>
  );
}

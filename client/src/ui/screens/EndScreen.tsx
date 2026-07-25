import { useGame } from "../GameContext";
import { Button } from "../components/Button";

const COPY = {
  escaped: {
    title: "Got away with the loot",
    className: "outcome-escaped",
    blurb: "All floors cleared. You slipped out the window with the loot and vanished into the night."
  },
  caught: {
    title: "The cat caught you",
    className: "outcome-caught",
    blurb: "The house wasn't empty after all. The possessed cat stopped every intruder."
  },
  timeout: {
    title: "Time's up",
    className: "outcome-timeout"
  }
} as const;

export function EndScreen() {
  const { outcome, leaveToMenu, startSinglePlayer, returnToLobby, difficulty, roomId, connected } =
    useGame();
  const data = COPY[outcome ?? "timeout"];
  const wasMultiplayer = !!(roomId && connected);

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="panel center">
          <h2 className={`overlay__title ${data.className}`}>{data.title}</h2>
          {"blurb" in data && <p>{data.blurb}</p>}
          <div className="divider" />
          <div className="btn-stack">
            {wasMultiplayer ? (
              <>
                <Button onClick={returnToLobby}>Return to Lobby</Button>
                <Button variant="secondary" onClick={leaveToMenu}>
                  Leave Lobby
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => startSinglePlayer(difficulty)}>Try Again</Button>
                <Button variant="secondary" onClick={leaveToMenu}>
                  Main Menu
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

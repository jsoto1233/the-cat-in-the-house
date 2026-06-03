import { useGame } from "../GameContext";
import { Button } from "../components/Button";

const COPY = {
  escaped: {
    title: "You Escaped",
    className: "outcome-escaped",
    blurb: "The team unlocked the attic and slipped out before the cat closed in."
  },
  caught: {
    title: "Caught",
    className: "outcome-caught",
    blurb: "The cat hunted the team down. Nobody made it out this time."
  },
  timeout: {
    title: "Out of Time",
    className: "outcome-timeout",
    blurb: "The clock ran out before the house gave up its secrets."
  }
} as const;

export function EndScreen() {
  const { outcome, leaveToMenu } = useGame();
  const data = COPY[outcome ?? "timeout"];

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="panel center">
          <h2 className={`overlay__title ${data.className}`}>{data.title}</h2>
          <p>{data.blurb}</p>
          <div className="divider" />
          <div className="btn-stack">
            <Button onClick={leaveToMenu}>Play again</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useGame } from "../GameContext";
import { Button } from "../components/Button";

export function Lobby() {
  const { roomId, players, maxPlayers, leaveToMenu } = useGame();
  const [ready, setReady] = useState(false);
  const [launching, setLaunching] = useState(false);

  const isHost = players.find((p) => p.id === "you")?.host ?? true;

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="brand">
          <h1 className="brand__title">Lobby</h1>
          <p className="brand__subtitle">Gather your team before you enter.</p>
        </div>

        <div className="panel">
          <div className="room-code">
            <div>
              <span className="hud__label">Room code</span>
              <span className="room-code__value">{roomId || "—"}</span>
            </div>
            <span className="dim">
              {players.length}/{maxPlayers}
            </span>
          </div>

          <ul className="slots">
            {Array.from({ length: maxPlayers }).map((_, i) => {
              const player = players[i];
              if (!player) {
                return (
                  <li key={i} className="slot slot--empty">
                    Empty slot
                  </li>
                );
              }
              const isYou = player.id === "you";
              const isReady = isYou ? ready : true;
              return (
                <li key={player.id} className="slot">
                  <span className="slot__name">
                    {player.name}
                    {player.host && <span className="tag">Host</span>}
                    {isYou && <span className="tag">You</span>}
                  </span>
                  <span className={isReady ? "ready-yes" : "ready-no"}>
                    {isReady ? "Ready" : "Not ready"}
                  </span>
                </li>
              );
            })}
          </ul>

          {launching ? (
            <p className="center" style={{ color: "var(--warning)" }}>
              Starting match… gameplay hooks up in Phase 2.
            </p>
          ) : (
            <div className="btn-stack">
              <Button variant="secondary" onClick={() => setReady((r) => !r)}>
                {ready ? "Unready" : "Ready up"}
              </Button>
              {isHost && (
                <Button disabled={!ready} onClick={() => setLaunching(true)}>
                  Start game
                </Button>
              )}
            </div>
          )}

          <div className="back-row">
            <button className="link" onClick={leaveToMenu}>
              ← Leave lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

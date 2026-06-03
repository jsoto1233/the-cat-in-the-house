import { useMemo, useState } from "react";
import { useGame } from "../GameContext";
import { Button } from "../components/Button";
import type { PlayerState } from "../../types";

const MAX_PLAYERS = 4;

export function Lobby() {
  const { room, roomId, localId, playerName, startGame, leaveToMenu, connected } =
    useGame();
  const [ready, setReady] = useState(false);

  // Use live room players when connected; otherwise show a local demo roster.
  const players: PlayerState[] = useMemo(() => {
    if (room) return Object.values(room.players);
    return [
      {
        id: localId || "you",
        name: playerName || "You",
        x: 0,
        y: 0,
        alive: true,
        clues: []
      }
    ];
  }, [room, localId, playerName]);

  const isHost = !room || players[0]?.id === (localId || "you");

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="brand">
          <h1 className="brand__title">Lobby</h1>
          <p className="brand__subtitle">
            {connected ? "Waiting for players…" : "Demo lobby — start when ready"}
          </p>
        </div>

        <div className="panel">
          <div className="room-code">
            <div>
              <span className="hud__label">Room code</span>
              <span className="room-code__value">{roomId || "—"}</span>
            </div>
            <span className="dim">
              {players.length}/{MAX_PLAYERS}
            </span>
          </div>

          <ul className="slots">
            {Array.from({ length: MAX_PLAYERS }).map((_, i) => {
              const player = players[i];
              if (!player) {
                return (
                  <li key={i} className="slot slot--empty">
                    Empty slot
                  </li>
                );
              }
              const isYou = player.id === (localId || "you");
              const isReady = isYou ? ready : true;
              return (
                <li key={player.id} className="slot">
                  <span className="slot__name">
                    {player.name}
                    {i === 0 && <span className="tag">Host</span>}
                    {isYou && <span className="tag">You</span>}
                  </span>
                  <span className={isReady ? "ready-yes" : "ready-no"}>
                    {isReady ? "Ready" : "Not ready"}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="btn-stack">
            <Button variant="secondary" onClick={() => setReady((r) => !r)}>
              {ready ? "Unready" : "Ready up"}
            </Button>
            {isHost && (
              <Button disabled={!ready} onClick={startGame}>
                Start game
              </Button>
            )}
          </div>

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

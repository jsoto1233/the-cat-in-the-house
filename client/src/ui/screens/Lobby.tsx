import { useMemo } from "react";
import { useGame, type Difficulty } from "../GameContext";
import { Button } from "../components/Button";
import { playerColorCss } from "../../game/house/houseLayout";
import type { PlayerState } from "../../types";

const MAX_PLAYERS = 4;

export function Lobby() {
  const {
    room,
    roomId,
    localId,
    playerName,
    startGame,
    leaveToMenu,
    connected,
    setReady,
    difficulty,
    setDifficulty
  } = useGame();

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

  const isHost = room ? room.hostId === localId : players[0]?.id === (localId || "you");
  const you = room?.players[localId];
  const ready = you?.ready ?? false;
  const allReady = players.length > 0 && players.every((p) => p.ready);
  const lobbyDifficulty = room?.difficulty ?? difficulty;

  const pickDifficulty = (mode: Difficulty) => {
    if (isHost) setDifficulty(mode);
  };

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="brand">
          <h1 className="brand__title">Heist lobby</h1>
          <p className="brand__subtitle">
            {connected ? "Crew assembling. Share the room code" : "Practice crew. Ready up when you are"}
          </p>
        </div>

        <div className="panel">
          <div className="room-code">
            <div>
              <span className="hud__label">Room code</span>
              <span className="room-code__value">{roomId || "..."}</span>
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
                    Robber slot (open)
                  </li>
                );
              }
              const isYou = player.id === localId;
              const isReady = !!player.ready;
              return (
                <li key={player.id} className="slot">
                  <span className="slot__name">
                    <span
                      className="slot__color"
                      style={{ backgroundColor: playerColorCss(i) }}
                      aria-hidden="true"
                    />
                    {player.name}
                    {player.id === room?.hostId && <span className="tag">Host</span>}
                    {isYou && <span className="tag">You</span>}
                  </span>
                  <span className={isReady ? "ready-yes" : "ready-no"}>
                    {isReady ? "Ready" : "Not ready"}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="difficulty">
            <span className="difficulty__label">Difficulty</span>
            <div className="difficulty__toggle" role="group" aria-label="Difficulty">
              <button
                type="button"
                className={`difficulty__opt ${lobbyDifficulty === "normal" ? "is-active" : ""}`}
                aria-pressed={lobbyDifficulty === "normal"}
                disabled={!isHost}
                onClick={() => pickDifficulty("normal")}
              >
                Normal
                <small>60s · fair pace</small>
              </button>
              <button
                type="button"
                className={`difficulty__opt difficulty__opt--ludicrous ${
                  lobbyDifficulty === "ludicrous" ? "is-active" : ""
                }`}
                aria-pressed={lobbyDifficulty === "ludicrous"}
                disabled={!isHost}
                onClick={() => pickDifficulty("ludicrous")}
              >
                Ludicrous
                <small>30s · no mercy</small>
              </button>
            </div>
          </div>

          <p className="lobby-note dim">Rob the house and slip out before the cat catches you. Up to 4 robbers.</p>

          <div className="btn-stack">
            <Button variant="secondary" onClick={() => setReady(!ready)}>
              {ready ? "Unready" : "Ready up"}
            </Button>
            {isHost && (
              <Button disabled={!allReady} onClick={startGame}>
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

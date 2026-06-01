import { useState } from "react";
import { useGame } from "../GameContext";
import { Button } from "../components/Button";

export function MainMenu() {
  const { playerName, setPlayerName, createRoom, joinRoom } = useGame();
  const [name, setName] = useState(playerName);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");

  const handleName = (value: string) => {
    setName(value);
    setPlayerName(value);
  };

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="brand">
          <h1 className="brand__title">The Cat in the House</h1>
          <p className="brand__subtitle">Escape together. Don&apos;t get caught.</p>
        </div>

        <div className="panel">
          <div className="field">
            <label className="field__label" htmlFor="player-name">
              Player name
            </label>
            <input
              id="player-name"
              className="field__input"
              value={name}
              maxLength={16}
              onChange={(e) => handleName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          {joining ? (
            <>
              <div className="field">
                <label className="field__label" htmlFor="room-code">
                  Room code
                </label>
                <input
                  id="room-code"
                  className="field__input field__input--code"
                  value={code}
                  maxLength={8}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                />
              </div>
              <div className="btn-row">
                <Button variant="secondary" onClick={() => setJoining(false)}>
                  Back
                </Button>
                <Button
                  disabled={code.trim().length < 4}
                  onClick={() => joinRoom(name, code)}
                >
                  Join
                </Button>
              </div>
            </>
          ) : (
            <div className="btn-stack">
              <Button onClick={() => createRoom(name)}>Create lobby</Button>
              <Button variant="secondary" onClick={() => setJoining(true)}>
                Join lobby
              </Button>
            </div>
          )}

          <div className="divider" />
          <p className="center dim" style={{ margin: 0, fontSize: "0.82rem" }}>
            Week 2 prototype — gameplay arrives in Phase 2
          </p>
        </div>
      </div>
    </div>
  );
}

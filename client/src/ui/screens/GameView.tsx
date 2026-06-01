import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../GameContext";
import { HUD } from "../components/HUD";
import { PauseOverlay } from "../components/PauseOverlay";
import { Button } from "../components/Button";
import type { CatMood, PlayerState } from "../../types";

const DEMO_TOTAL_MS = 8 * 60 * 1000;
const CLUES_TOTAL = 5;

interface DemoState {
  timeLeftMs: number;
  cluesFound: number;
  players: PlayerState[];
}

function moodFor(timeLeftMs: number, total: number): CatMood {
  const ratio = timeLeftMs / total;
  if (ratio > 0.66) return "calm";
  if (ratio > 0.33) return "warning";
  return "aggressive";
}

export function GameView() {
  const { client, room, localId, playerName, navigate, setOutcome } = useGame();
  const [paused, setPaused] = useState(false);
  const endedRef = useRef(false);

  const [demo, setDemo] = useState<DemoState>(() => ({
    timeLeftMs: DEMO_TOTAL_MS,
    cluesFound: 1,
    players: [
      { id: localId || "you", name: playerName || "You", x: 0, y: 0, alive: true, clues: [] },
      { id: "ai-1", name: "Teammate", x: 0, y: 0, alive: true, clues: [] }
    ]
  }));

  // Mount the Phaser canvas once this screen is shown.
  useEffect(() => {
    client.mountGame("game-container");
    return () => client.unmountGame();
  }, [client]);

  // Pause with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Offline demo loop drives the HUD when there is no live room.
  useEffect(() => {
    if (room || paused) return;
    const interval = window.setInterval(() => {
      setDemo((prev) => {
        const timeLeftMs = Math.max(0, prev.timeLeftMs - 1000);
        const elapsed = DEMO_TOTAL_MS - timeLeftMs;
        const cluesFound = Math.min(
          CLUES_TOTAL,
          1 + Math.floor(elapsed / 14000)
        );
        return { ...prev, timeLeftMs, cluesFound };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [room, paused]);

  // Derive HUD values from the live room when available, else from the demo.
  const hud = useMemo(() => {
    if (room) {
      const players = Object.values(room.players);
      return {
        timeLeftMs: room.timeLeftMs,
        cluesFound: room.cluesFound.length,
        players,
        catMood: room.cat.mood,
        atticUnlocked: room.atticUnlocked
      };
    }
    return {
      timeLeftMs: demo.timeLeftMs,
      cluesFound: demo.cluesFound,
      players: demo.players,
      catMood: moodFor(demo.timeLeftMs, DEMO_TOTAL_MS),
      atticUnlocked: demo.cluesFound >= CLUES_TOTAL
    };
  }, [room, demo]);

  // End conditions.
  useEffect(() => {
    if (endedRef.current) return;
    const allDown =
      hud.players.length > 0 && hud.players.every((p) => !p.alive);
    if (allDown) {
      endedRef.current = true;
      setOutcome("caught");
      navigate("end");
    } else if (hud.timeLeftMs <= 0) {
      endedRef.current = true;
      setOutcome("timeout");
      navigate("end");
    }
  }, [hud, navigate, setOutcome]);

  const objective =
    hud.cluesFound >= CLUES_TOTAL
      ? "The attic is unlocked — escape the house!"
      : `Search the house for clues (${hud.cluesFound}/${CLUES_TOTAL})`;

  return (
    <div className="game">
      <div className="game__stage">
        <div id="game-container" className="game__canvas" />

        <HUD
          objective={objective}
          timeLeftMs={hud.timeLeftMs}
          cluesFound={hud.cluesFound}
          cluesTotal={CLUES_TOTAL}
          players={hud.players}
          catMood={hud.catMood}
          localId={localId || "you"}
          onPause={() => setPaused(true)}
        />

        {/* Pitch-demo shortcut: jump straight to the win screen. */}
        {!room && (
          <div style={{ position: "absolute", bottom: 12, left: 12, pointerEvents: "auto" }}>
            <Button
              variant="ghost"
              onClick={() => {
                endedRef.current = true;
                setOutcome("escaped");
                navigate("end");
              }}
            >
              Demo: escape
            </Button>
          </div>
        )}

        <PauseOverlay
          open={paused}
          onResume={() => setPaused(false)}
          onSettings={() => navigate("settings")}
          onLeave={() => navigate("menu")}
        />
      </div>
    </div>
  );
}

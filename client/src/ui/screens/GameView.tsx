import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useGame } from "../GameContext";
import { HUD } from "../components/HUD";
import { PauseOverlay } from "../components/PauseOverlay";
import { HousePreviewScene, type PreviewState } from "../preview/HousePreviewScene";
import type { PlayerState } from "../../types";

const DEMO_TOTAL_MS = 8 * 60 * 1000;

export function GameView() {
  const { playerName, localId, navigate, difficulty } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const difficultyRef = useRef(difficulty);

  const [paused, setPaused] = useState(false);
  const [timeLeftMs] = useState(DEMO_TOTAL_MS);
  const [preview, setPreview] = useState<PreviewState>({
    cluesFound: 0,
    cluesTotal: 4,
    mood: "calm",
    atticUnlocked: false,
    lives: 3,
    livesTotal: 3,
    graceMs: difficulty === "ludicrous" ? 0 : 15000,
    lethal: difficulty === "ludicrous",
    difficulty
  });

  const players: PlayerState[] = [
    { id: localId || "you", name: playerName || "You", x: 0, y: 0, alive: true, clues: [] },
    { id: "ai-1", name: "Teammate", x: 0, y: 0, alive: true, clues: [] }
  ];

  // Mount a self-contained Phaser preview (visual layout only — game logic deferred).
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    const chosen = difficultyRef.current;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: "#08080c",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      callbacks: {
        preBoot: (g) => g.registry.set("difficulty", chosen)
      },
      scene: [HousePreviewScene]
    });
    gameRef.current = game;

    game.events.on("preview:update", (state: PreviewState) => setPreview(state));

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Pause with Escape; also pause/resume the Phaser scene.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const scene = gameRef.current?.scene;
    if (!scene) return;
    if (paused) scene.pause("HousePreview");
    else scene.resume("HousePreview");
  }, [paused]);

  const objective = "House layout preview — movement, cat AI, and collision await game logic integration";

  return (
    <div className="game">
      <div className="game__stage">
        <div ref={containerRef} id="game-container" className="game__canvas" />

        {preview.difficulty === "ludicrous" && (
          <>
            <div className="ludicrous-fx" aria-hidden="true" />
            <div className="ludicrous-badge">Ludicrous</div>
          </>
        )}

        <HUD
          objective={objective}
          timeLeftMs={timeLeftMs}
          cluesFound={preview.cluesFound}
          cluesTotal={preview.cluesTotal}
          lives={preview.lives}
          livesTotal={preview.livesTotal}
          graceMs={preview.graceMs}
          lethal={preview.lethal}
          players={players}
          catMood={preview.mood}
          localId={localId || "you"}
          onPause={() => setPaused(true)}
        />

        <div className="game__hint">
          Visual preview only — game logic (CatAI, CollisionMap) integration pending
        </div>

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

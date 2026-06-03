import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useGame } from "../GameContext";
import { HUD } from "../components/HUD";
import { PauseOverlay } from "../components/PauseOverlay";
import { HousePreviewScene, type PreviewState } from "../preview/HousePreviewScene";
import type { PlayerState } from "../../types";

const DEMO_TOTAL_MS = 8 * 60 * 1000;

export function GameView() {
  const { playerName, localId, navigate, setOutcome, difficulty } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const endedRef = useRef(false);
  const difficultyRef = useRef(difficulty);

  const [paused, setPaused] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(DEMO_TOTAL_MS);
  const [hitKey, setHitKey] = useState(0);
  const [awakeKey, setAwakeKey] = useState(0);
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

  // Mount a self-contained Phaser preview (independent of team game logic).
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
    game.events.on("preview:hit", () => setHitKey((k) => k + 1));
    game.events.on("preview:awake", () => setAwakeKey((k) => k + 1));
    game.events.on("preview:escaped", () => {
      if (endedRef.current) return;
      endedRef.current = true;
      setOutcome("escaped");
      navigate("end");
    });
    game.events.on("preview:caught", () => {
      if (endedRef.current) return;
      endedRef.current = true;
      setOutcome("caught");
      // Let the final scratch flash play before switching screens.
      window.setTimeout(() => navigate("end"), 480);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [navigate, setOutcome]);

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

  // Match timer (local demo).
  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => {
      setTimeLeftMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [paused]);

  // Timeout end condition.
  useEffect(() => {
    if (endedRef.current || timeLeftMs > 0) return;
    endedRef.current = true;
    setOutcome("timeout");
    navigate("end");
  }, [timeLeftMs, navigate, setOutcome]);

  const objective = preview.atticUnlocked
    ? "The attic is unlocked — reach it to escape!"
    : `Search the house for clues (${preview.cluesFound}/${preview.cluesTotal})`;

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
          WASD / arrows to move · find 4 clues · reach the attic · avoid the cat
        </div>

        {hitKey > 0 && (
          <div className="scratch" key={hitKey} aria-hidden="true">
            <span className="scratch__slash" />
            <span className="scratch__slash" />
            <span className="scratch__slash" />
          </div>
        )}

        {awakeKey > 0 && (
          <div className="awake-banner" key={`awake-${awakeKey}`} aria-hidden="true">
            The cat is awake
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

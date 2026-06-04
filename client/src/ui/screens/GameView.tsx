import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useGame } from "../GameContext";
import { HUD } from "../components/HUD";
import { PauseOverlay } from "../components/PauseOverlay";
import { HousePreviewScene, type PreviewState } from "../preview/HousePreviewScene";
const MATCH_MS_NORMAL = 1 * 60 * 1000;
const MATCH_MS_LUDICROUS = 30 * 1000;
const MATCH_MS_NORMAL_FAST_THRESHOLD = 30 * 1000;
const MATCH_MS_TICK = 1000;
const MATCH_MS_NORMAL_FAST_INTERVAL = 500; // 2 ticks/s → 2× pace, every second shown
const OBJECTIVE_INTRO_MS = 7000;

function matchMsForDifficulty(difficulty: string) {
  return difficulty === "ludicrous" ? MATCH_MS_LUDICROUS : MATCH_MS_NORMAL;
}

export function GameView() {
  const { navigate, difficulty, setOutcome, matchTimeLeftMs, setMatchTimeLeftMs, leaveToMenu } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const difficultyRef = useRef(difficulty);

  const [paused, setPaused] = useState(false);
  const [objectiveVisible, setObjectiveVisible] = useState(true);
  const [objectivePanelOpen, setObjectivePanelOpen] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(
    () => matchTimeLeftMs ?? matchMsForDifficulty(difficulty)
  );

  useEffect(() => {
    setMatchTimeLeftMs(timeLeftMs);
  }, [timeLeftMs, setMatchTimeLeftMs]);
  const [gameOver, setGameOver] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    cashFound: 0,
    cashTotal: 4,
    mood: "calm",
    atticUnlocked: false,
    lives: 3,
    livesTotal: 3,
    difficulty
  });

  const showObjectivePanel = objectiveVisible || objectivePanelOpen;
  const gameplayPaused = paused || objectivePanelOpen || gameOver;

  // Intro: show objective panel briefly, then hide text (button stays).
  useEffect(() => {
    const id = window.setTimeout(() => setObjectiveVisible(false), OBJECTIVE_INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Match timer — one displayed second per tick; normal last 30s uses 500ms interval (2×).
  const normalFastPhase =
    difficulty === "normal" && timeLeftMs <= MATCH_MS_NORMAL_FAST_THRESHOLD;
  useEffect(() => {
    if (gameplayPaused || timeLeftMs <= 0) return;
    const intervalMs = normalFastPhase ? MATCH_MS_NORMAL_FAST_INTERVAL : MATCH_MS_TICK;
    const id = window.setInterval(() => {
      setTimeLeftMs((t) => Math.max(0, t - MATCH_MS_TICK));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [gameplayPaused, difficulty, normalFastPhase, timeLeftMs <= 0]);

  // Time's up — pause gameplay and show the end screen.
  useEffect(() => {
    if (timeLeftMs > 0 || gameOver) return;
    setGameOver(true);
    setOutcome("timeout");
    navigate("end");
  }, [timeLeftMs, gameOver, setOutcome, navigate]);

  // Mount a self-contained Phaser preview (visual layout only — game logic deferred).
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    const chosen = difficultyRef.current;
    const displayDpr = Math.min(window.devicePixelRatio || 1, 2);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: "#08080c",
      render: {
        antialias: true
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        zoom: displayDpr
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
      if (e.key === "Escape" && !gameOver) setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameOver]);

  useEffect(() => {
    const scene = gameRef.current?.scene;
    if (!scene) return;
    if (gameplayPaused) scene.pause("HousePreview");
    else scene.resume("HousePreview");
  }, [gameplayPaused]);

  const handleObjectiveToggle = () => {
    setObjectivePanelOpen((open) => !open);
  };

  const objective = "Solo heist: search the house, collect $ valuables, and escape.";

  return (
    <div className="game">
      <div className="game__panel">
        <HUD
          objective={objective}
          showObjectivePanel={showObjectivePanel}
          objectivePanelActive={objectivePanelOpen}
          onObjectiveToggle={handleObjectiveToggle}
          timeLeftMs={timeLeftMs}
          cashFound={preview.cashFound}
          cashTotal={preview.cashTotal}
          lives={preview.lives}
          livesTotal={preview.livesTotal}
          onPause={() => setPaused(true)}
        />

        <div className="game__stage">
          <div ref={containerRef} id="game-container" className="game__canvas" />

          {preview.difficulty === "ludicrous" && (
            <>
              <div className="ludicrous-fx" aria-hidden="true" />
              <div className="ludicrous-badge">Ludicrous</div>
            </>
          )}

          <PauseOverlay
            open={paused}
            onResume={() => setPaused(false)}
            onSettings={() => navigate("settings")}
            onLeave={leaveToMenu}
          />
        </div>
      </div>
    </div>
  );
}

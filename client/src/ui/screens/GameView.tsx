import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useGame, type Outcome } from "../GameContext";
import { HUD } from "../components/HUD";
import { PauseOverlay } from "../components/PauseOverlay";
import {
  PlayableHouseScene,
  type PreviewState,
  type MatchOutcome
} from "../../game/scenes/PlayableHouseScene";
import type { GameSyncState } from "../../game/GameClient";
import { LIVES_TOTAL } from "../../game/house/houseLayout";

const MATCH_MS_NORMAL = 1 * 60 * 1000;
const MATCH_MS_LUDICROUS = 30 * 1000;
const MATCH_MS_NORMAL_FAST_THRESHOLD = 30 * 1000;
const MATCH_MS_TICK = 1000;
const MATCH_MS_NORMAL_FAST_INTERVAL = 500;
const OBJECTIVE_INTRO_MS = 7000;

function matchMsForDifficulty(difficulty: string) {
  return difficulty === "ludicrous" ? MATCH_MS_LUDICROUS : MATCH_MS_NORMAL;
}

export function GameView() {
  const {
    navigate,
    difficulty,
    setOutcome,
    matchTimeLeftMs,
    setMatchTimeLeftMs,
    leaveToMenu,
    client,
    localId,
    hostId,
    gamePlayerIds,
    connected,
    gameSessionKey,
    floor,
    floorTotal,
    advanceFloor,
    playerLives,
    setPlayerLives
  } = useGame();

  const isTopFloor = floor >= floorTotal;

  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const timeLeftRef = useRef(matchTimeLeftMs ?? matchMsForDifficulty(difficulty));
  const setTimeLeftRef = useRef<(ms: number) => void>(() => {});
  const setPlayerLivesRef = useRef(setPlayerLives);

  const isMultiplayer = !!hostId && connected;
  const isHost = !isMultiplayer || client.localId === hostId;

  const [paused, setPaused] = useState(false);
  const [objectiveVisible, setObjectiveVisible] = useState(true);
  const [objectivePanelOpen, setObjectivePanelOpen] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(
    () => matchTimeLeftMs ?? matchMsForDifficulty(difficulty)
  );
  const [gameOver, setGameOver] = useState(false);
  // Brief "Floor N" splash shown at the start of every floor after the first.
  const [floorSplash, setFloorSplash] = useState(floor > 1);
  const [preview, setPreview] = useState<PreviewState>({
    cashFound: 0,
    cashTotal: 10,
    mood: "calm",
    atticUnlocked: false,
    hasKey: false,
    lives: 3,
    livesTotal: 3,
    difficulty
  });

  setTimeLeftRef.current = setTimeLeftMs;
  setPlayerLivesRef.current = setPlayerLives;

  useEffect(() => {
    timeLeftRef.current = timeLeftMs;
    setMatchTimeLeftMs(timeLeftMs);
  }, [timeLeftMs, setMatchTimeLeftMs]);

  const showObjectivePanel = objectiveVisible || objectivePanelOpen;
  const gameplayPaused = paused || objectivePanelOpen || gameOver;

  useEffect(() => {
    const id = window.setTimeout(() => setObjectiveVisible(false), OBJECTIVE_INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!floorSplash) return;
    const id = window.setTimeout(() => setFloorSplash(false), 1700);
    return () => window.clearTimeout(id);
  }, [floorSplash]);

  const normalFastPhase =
    difficulty === "normal" && timeLeftMs <= MATCH_MS_NORMAL_FAST_THRESHOLD;

  useEffect(() => {
    if (!isHost || gameplayPaused || timeLeftMs <= 0) return;
    const intervalMs = normalFastPhase ? MATCH_MS_NORMAL_FAST_INTERVAL : MATCH_MS_TICK;
    const id = window.setInterval(() => {
      setTimeLeftMs((t) => Math.max(0, t - MATCH_MS_TICK));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isHost, gameplayPaused, difficulty, normalFastPhase, timeLeftMs <= 0]);

  useEffect(() => {
    if (!isHost || timeLeftMs > 0 || gameOver) return;
    setGameOver(true);
    setOutcome("timeout");
    if (isMultiplayer) client.socket.sendGameOver("timeout");
    navigate("end");
  }, [timeLeftMs, gameOver, isHost, isMultiplayer, client, setOutcome, navigate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setGameOver(false);
    setTimeLeftMs(matchTimeLeftMs ?? matchMsForDifficulty(difficulty));
    if (floor > 1) setFloorSplash(true);

    const mp = !!hostId && connected;
    const host = !mp || client.localId === hostId;
    const ids =
      mp && gamePlayerIds.length > 0 ? gamePlayerIds : [client.localId || localId || "p1"];
    const initialPlayerLives: Record<string, number> = { ...playerLives };
    for (const id of ids) {
      if (initialPlayerLives[id] === undefined) {
        initialPlayerLives[id] = LIVES_TOTAL;
      }
    }
    const displayDpr = Math.min(window.devicePixelRatio || 1, 2);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: container,
      backgroundColor: "#08080c",
      render: { antialias: true },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        zoom: displayDpr
      },
      callbacks: {
        preBoot: (g) => {
          g.registry.set("difficulty", difficulty);
          g.registry.set("floor", floor);
          g.registry.set("floorTotal", floorTotal);
          g.registry.set("multiplayer", mp);
          g.registry.set("localId", client.localId || localId || "p1");
          g.registry.set("isHost", host);
          g.registry.set("playerIds", ids);
          g.registry.set("playerLives", initialPlayerLives);
          g.registry.set(
            "onPlayerLivesUpdate",
            (lives: Record<string, number>) => setPlayerLivesRef.current(lives)
          );
          g.registry.set("getTimeLeftMs", () => timeLeftRef.current);
          g.registry.set(
            "onMove",
            mp ? (x: number, y: number) => client.socket.sendMove(x, y) : undefined
          );
          g.registry.set("onInteract", mp ? () => client.socket.sendInteract() : undefined);
          g.registry.set("onHostSync", (state: GameSyncState) => client.socket.sendGameState(state));
          g.registry.set("onMatchOver", (outcome: string) => client.socket.sendGameOver(outcome));
          g.registry.set(
            "onFloorAdvance",
            (lives: Record<string, number>) => {
              client.socket.sendAdvanceFloor({
                floor: Math.min(floorTotal, floor + 1),
                playerLives: lives
              });
            }
          );
          g.registry.set("attachNetwork", (scene: PlayableHouseScene) => {
            client.attachScene(scene, {
              isHost: host,
              onTimeSync: (ms) => setTimeLeftRef.current(ms),
              onGameOver: (outcome) => {
                setGameOver(true);
                setOutcome(outcome as Outcome);
                navigate("end");
              }
            });
          });
          g.registry.set("detachNetwork", () => client.detachScene());
        }
      },
      scene: [PlayableHouseScene]
    });

    gameRef.current = game;

    const onPreview = (state: PreviewState) => setPreview(state);
    const onMatchOver = ({ outcome }: { outcome: MatchOutcome }) => {
      if (outcome === "escaped" && floor < floorTotal) {
        setGameOver(true);
        if (!mp) advanceFloor();
        return;
      }
      setGameOver(true);
      setOutcome(outcome);
      navigate("end");
    };

    game.events.on("preview:update", onPreview);
    game.events.on("match:over", onMatchOver);

    return () => {
      game.events.off("preview:update", onPreview);
      game.events.off("match:over", onMatchOver);
      client.detachScene();
      game.destroy(true);
      gameRef.current = null;
    };
  }, [gameSessionKey]);

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

  const exitLine = isTopFloor
    ? "escape through the window on this top floor."
    : `reach the stairs up to Floor ${floor + 1}.`;
  const objective = isMultiplayer
    ? `Co-op heist (Floor ${floor} of ${floorTotal}): collect all $ valuables, search cabinets for a chest key, then ${exitLine}`
    : `Solo heist (Floor ${floor} of ${floorTotal}): collect $ valuables, search cabinets and boxes (E) for a key, open the locked chest, then ${exitLine}`;

  return (
    <div className="game">
      <div className="game__panel">
        <HUD
          objective={objective}
          showObjectivePanel={showObjectivePanel}
          objectivePanelActive={objectivePanelOpen}
          onObjectiveToggle={() => setObjectivePanelOpen((open) => !open)}
          timeLeftMs={timeLeftMs}
          cashFound={preview.cashFound}
          cashTotal={preview.cashTotal}
          hasKey={preview.hasKey}
          lives={preview.lives}
          livesTotal={preview.livesTotal}
          floor={floor}
          floorTotal={floorTotal}
          onPause={() => setPaused(true)}
        />

        <div className="game__stage">
          <div ref={containerRef} id="game-container" className="game__canvas" />

          {isTopFloor && (
            <div className="floor-badge floor-badge--window" aria-hidden="true">
              Top floor · escape through the window
            </div>
          )}

          {floorSplash && (
            <div className="floor-splash" role="status">
              <div className="floor-splash__num">Floor {floor}</div>
              <div className="floor-splash__sub">
                {isTopFloor ? "Find the window and get out" : "Grab the loot, then head up"}
              </div>
            </div>
          )}

          {preview.difficulty === "ludicrous" && (
            <>
              <div className="ludicrous-fx" aria-hidden="true" />
              <div className="ludicrous-badge">Ludicrous</div>
            </>
          )}

          <PauseOverlay
            open={paused}
            onResume={() => setPaused(false)}
            onLeave={leaveToMenu}
          />
        </div>
      </div>
    </div>
  );
}

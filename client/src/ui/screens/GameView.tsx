import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useGame, type Outcome } from "../GameContext";
import { HUD } from "../components/HUD";
import { PauseOverlay } from "../components/PauseOverlay";
import { Briefing } from "../components/Briefing";
import {
  PlayableHouseScene,
  type PreviewState,
  type MatchOutcome
} from "../../game/scenes/PlayableHouseScene";
import type { GameSyncState } from "../../game/GameClient";
import { loadSkinChoice } from "../../game/skins";
import { recordRun } from "../../game/progress";
import {
  SOLO_ID,
  WORLD_H,
  WORLD_W,
  startingLives
} from "../../game/house/houseLayout";

const MATCH_MS_NORMAL = 1 * 60 * 1000;
const MATCH_MS_LUDICROUS = 30 * 1000;
const MATCH_MS_TICK = 1000;
// Ludicrous burns the clock at double speed; Normal always ticks real seconds.
const MATCH_MS_LUDICROUS_INTERVAL = 500;

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
    setPlayerLives,
    room,
    playerName
  } = useGame();

  const isTopFloor = floor >= floorTotal;

  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const timeLeftRef = useRef(matchTimeLeftMs ?? matchMsForDifficulty(difficulty));
  const setTimeLeftRef = useRef<(ms: number) => void>(() => {});
  const setPlayerLivesRef = useRef(setPlayerLives);
  const roomRef = useRef(room);
  const playerNameRef = useRef(playerName);

  const isMultiplayer = !!hostId && connected;
  const isHost = !isMultiplayer || client.localId === hostId;

  const [paused, setPaused] = useState(false);
  const [pausedBy, setPausedBy] = useState<string | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(
    () => matchTimeLeftMs ?? matchMsForDifficulty(difficulty)
  );
  const [gameOver, setGameOver] = useState(false);
  const [escapeToast, setEscapeToast] = useState<string | null>(null);
  const [spectating, setSpectating] = useState(false);
  // Brief "Level N" splash shown at the start of every level after the first.
  const [floorSplash, setFloorSplash] = useState(floor > 1);

  roomRef.current = room;
  playerNameRef.current = playerName;
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
  // Live view of the run for progression bookkeeping at match end.
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const floorRef = useRef(floor);
  floorRef.current = floor;

  useEffect(() => {
    timeLeftRef.current = timeLeftMs;
    setMatchTimeLeftMs(timeLeftMs);
  }, [timeLeftMs, setMatchTimeLeftMs]);

  // Pre-game directions. Solo only, and only on the first floor of a run: the
  // multiplayer briefing lives in the Lobby, which already owns readiness.
  // While it's open the match is held paused (timer, entities, spawning).
  const [briefingOpen, setBriefingOpen] = useState(!isMultiplayer && floor === 1);

  const gameplayPaused = paused || gameOver || briefingOpen;
  const canResume = !isMultiplayer || !pausedBy || pausedBy === (client.localId || localId);

  const requestPause = () => {
    if (gameOver) return;
    if (isMultiplayer) client.socket.sendPause();
    else setPaused(true);
  };

  const requestResume = () => {
    if (gameOver) return;
    if (isMultiplayer) {
      if (canResume) client.socket.sendResume();
      return;
    }
    setPaused(false);
  };

  useEffect(() => {
    if (!isMultiplayer) return;
    return client.onPauseState(({ paused: isPaused, pausedBy: by }) => {
      setPaused(isPaused);
      setPausedBy(isPaused ? by : null);
    });
  }, [isMultiplayer, client]);

  useEffect(() => {
    if (!floorSplash) return;
    const id = window.setTimeout(() => setFloorSplash(false), 1700);
    return () => window.clearTimeout(id);
  }, [floorSplash]);

  useEffect(() => {
    if (!escapeToast) return;
    const id = window.setTimeout(() => setEscapeToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [escapeToast]);

  useEffect(() => {
    if (!isHost || gameplayPaused || timeLeftMs <= 0) return;
    const intervalMs =
      difficulty === "ludicrous" ? MATCH_MS_LUDICROUS_INTERVAL : MATCH_MS_TICK;
    const id = window.setInterval(() => {
      setTimeLeftMs((t) => Math.max(0, t - MATCH_MS_TICK));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isHost, gameplayPaused, difficulty, timeLeftMs <= 0]);

  useEffect(() => {
    if (!isHost || timeLeftMs > 0 || gameOver) return;
    const scene = gameRef.current?.scene.getScene("HousePreview") as PlayableHouseScene | undefined;
    if (scene) {
      // Scene decides: advance with escapees if anyone left, else full timeout.
      scene.handleTimeExpired();
      return;
    }
    setGameOver(true);
    setOutcome("timeout");
    if (isMultiplayer) client.socket.sendGameOver("timeout");
    navigate("end");
  }, [timeLeftMs, gameOver, isHost, isMultiplayer, client, setOutcome, navigate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Frame-flash fix: don't boot Phaser at all while the directions overlay is
    // up. Previously the engine mounted immediately and painted a frame of the
    // floor behind the overlay before the first pause landed.
    if (briefingOpen) return;

    setGameOver(false);
    setPaused(false);
    setPausedBy(null);
    setEscapeToast(null);
    setSpectating(false);
    setTimeLeftMs(matchTimeLeftMs ?? matchMsForDifficulty(difficulty));
    if (floor > 1) setFloorSplash(true);

    const mp = !!hostId && connected;
    const host = !mp || client.localId === hostId;
    // Identity used to key per-player state (lives). In multiplayer this is the
    // socket id, but a SOLO run must use a stable id: the socket id changes on
    // every reconnect, which orphaned the saved lives and made them look like
    // they reset when a new floor loaded.
    const selfId = mp ? client.localId || localId || "p1" : SOLO_ID;
    const ids = mp && gamePlayerIds.length > 0 ? gamePlayerIds : [selfId];
    const initialPlayerLives: Record<string, number> = { ...playerLives };
    // Safety net: if the saved lives were keyed under a previous id (an old
    // socket), carry the value over instead of silently handing back a full bar.
    const savedValues = Object.values(initialPlayerLives);
    for (const id of ids) {
      if (initialPlayerLives[id] === undefined) {
        initialPlayerLives[id] =
          !mp && savedValues.length === 1 ? savedValues[0] : startingLives(difficulty);
      }
    }
    const displayDpr = Math.min(window.devicePixelRatio || 1, 2);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: WORLD_W,
      height: WORLD_H,
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
          const skin = loadSkinChoice();
          g.registry.set("skinId", skin.skinId);
          g.registry.set("skinColorId", skin.colorId);
          g.registry.set("difficulty", difficulty);
          g.registry.set("floor", floor);
          g.registry.set("floorTotal", floorTotal);
          g.registry.set("multiplayer", mp);
          g.registry.set("localId", selfId);
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
            mp
              ? (() => {
                  let lastSentAt = 0;
                  let lastX = Number.NaN;
                  let lastY = Number.NaN;
                  return (x: number, y: number) => {
                    const now = performance.now();
                    const moved = Number.isNaN(lastX) || Math.hypot(x - lastX, y - lastY) >= 1.5;
                    if (!moved && now - lastSentAt < 33) return;
                    lastSentAt = now;
                    lastX = x;
                    lastY = y;
                    client.socket.sendMove(x, y);
                  };
                })()
              : undefined
          );
          g.registry.set("onInteract", mp ? () => client.socket.sendInteract() : undefined);
          g.registry.set(
            "onCoinPickup",
            mp && !host ? (coinIndex: number) => client.socket.sendCoinPickup(coinIndex) : undefined
          );
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
      // Bank what was collected and remember how deep this run got. Cosmetic
      // progression only — it just unlocks skins.
      recordRun(previewRef.current.cashFound, floorRef.current);
      if (outcome === "escaped" && floor < floorTotal) {
        setGameOver(true);
        setSpectating(false);
        if (!mp) advanceFloor();
        return;
      }
      setGameOver(true);
      setSpectating(false);
      setOutcome(outcome);
      navigate("end");
    };
    const onPlayerEscaped = ({ playerId, floor: escapedFloor }: { playerId: string; floor: number }) => {
      const selfId = client.localId || localId;
      const name =
        roomRef.current?.players[playerId]?.name ||
        (playerId === selfId ? playerNameRef.current : null) ||
        "A player";
      setEscapeToast(`${name} has escaped level ${escapedFloor}.`);
      if (playerId === selfId) setSpectating(true);
    };

    game.events.on("preview:update", onPreview);
    game.events.on("match:over", onMatchOver);
    game.events.on("player:escaped", onPlayerEscaped);

    return () => {
      game.events.off("preview:update", onPreview);
      game.events.off("match:over", onMatchOver);
      game.events.off("player:escaped", onPlayerEscaped);
      client.detachScene();
      game.destroy(true);
      gameRef.current = null;
    };
  }, [gameSessionKey, briefingOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (briefingOpen || e.key !== "Escape" || gameOver) return;
      if (paused) requestResume();
      else requestPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameOver, paused, isMultiplayer, canResume, client, localId, briefingOpen]);

  // "Press any key to begin" — ignoring bare modifiers and the debug shortcut.
  useEffect(() => {
    if (!briefingOpen) return;
    const start = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) return; // dev overlay combo
      if (e.key === "~" || e.key === "`") return;
      e.preventDefault();
      setBriefingOpen(false);
    };
    window.addEventListener("keydown", start);
    return () => window.removeEventListener("keydown", start);
  }, [briefingOpen]);

  useEffect(() => {
    const scene = gameRef.current?.scene;
    if (!scene) return;
    if (gameplayPaused) scene.pause("HousePreview");
    else scene.resume("HousePreview");
  }, [gameplayPaused]);

  return (
    <div className="game">
      <div className="game__panel">
        <HUD
          timeLeftMs={timeLeftMs}
          cashFound={preview.cashFound}
          cashTotal={preview.cashTotal}
          hasKey={preview.hasKey}
          lives={preview.lives}
          livesTotal={preview.livesTotal}
          floor={floor}
          floorTotal={floorTotal}
          onPause={requestPause}
        />

        <div className="game__stage">
          <div ref={containerRef} id="game-container" className="game__canvas" />

          {briefingOpen && (
            <div
              className="briefing-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="How to play"
              onClick={() => setBriefingOpen(false)}
            >
              <div className="briefing-overlay__inner" onClick={(e) => e.stopPropagation()}>
                <h2 className="briefing-overlay__title">How to play</h2>
                <Briefing mode="solo" />
                <button className="btn btn--primary" onClick={() => setBriefingOpen(false)}>
                  Start Game
                </button>
                <p className="briefing-overlay__hint">or press any key to begin</p>
              </div>
            </div>
          )}

          {floorSplash && (
            <div className="floor-splash" role="status">
              <div className="floor-splash__num">Level {floor}</div>
              <div className="floor-splash__sub">
                {isTopFloor ? "Grab the loot and get out" : "Grab the loot, then move on"}
              </div>
            </div>
          )}

          {escapeToast && (
            <div className="escape-toast" role="status">
              {escapeToast}
            </div>
          )}

          {spectating && !gameOver && (
            <div className="spectate-banner" role="status">
              Waiting for other players…
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
            canResume={canResume}
            onResume={requestResume}
            onLeave={leaveToMenu}
          />
        </div>
      </div>
    </div>
  );
}

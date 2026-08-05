import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { GameClient } from "../game/GameClient";
import {
  SOLO_ID,
  applyOutsideBonus,
  maxLives,
  startingLives
} from "../game/house/houseLayout";
import type { RoomState } from "../types";

export type Screen =
  | "menu"
  | "lobby"
  | "game"
  | "end";

export type Outcome = "escaped" | "caught" | "timeout" | null;

export type Difficulty = "normal" | "ludicrous";

export interface Settings {
  master: number;
  sfx: number;
  music: number;
}

const SETTINGS_KEY = "cith.settings";

// Number of floors (levels) the player climbs before escaping out the top-floor
// window. Floor 1 is the ground floor. This is UI-side progression only. Each
// floor is a fresh run of the house. Change this one number to add/remove floors.
export const FLOOR_TOTAL = 10;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { master: 80, sfx: 70, music: 60, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { master: 80, sfx: 70, music: 60 };
}

function randomRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

interface GameContextValue {
  client: GameClient;
  connected: boolean;
  room?: RoomState;
  localId: string;
  screen: Screen;
  navigate: (screen: Screen) => void;
  back: () => void;
  playerName: string;
  setPlayerName: (name: string) => void;
  roomId: string;
  outcome: Outcome;
  setOutcome: (outcome: Outcome) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  createRoom: (name: string) => void;
  joinRoom: (name: string, roomId: string) => void;
  setReady: (ready: boolean) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  startGame: () => void;
  difficulty: Difficulty;
  startSinglePlayer: (difficulty?: Difficulty) => void;
  returnToLobby: () => void;
  leaveToMenu: () => void;
  matchTimeLeftMs: number | null;
  setMatchTimeLeftMs: (ms: number | null) => void;
  hostId: string;
  gamePlayerIds: string[];
  gameSessionKey: number;
  floor: number;
  floorTotal: number;
  advanceFloor: () => void;
  jumpToFloor: (floor: number) => void;
  playerLives: Record<string, number>;
  setPlayerLives: (lives: Record<string, number>) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<GameClient | null>(null);
  if (clientRef.current === null) clientRef.current = new GameClient();
  const client = clientRef.current as GameClient;

  const [connected, setConnected] = useState(client.connected);
  const [room, setRoom] = useState<RoomState | undefined>(client.latestRoom);
  const [localId, setLocalId] = useState(client.localId);
  const [screen, setScreen] = useState<Screen>("menu");
  const prevScreenRef = useRef<Screen>("menu");
  const [playerName, setPlayerName] = useState("Player");
  const [roomId, setRoomId] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  // Socket handlers are registered once; a ref keeps them reading the live value.
  const difficultyRef = useRef<Difficulty>("normal");
  difficultyRef.current = difficulty;
  const [matchTimeLeftMs, setMatchTimeLeftMs] = useState<number | null>(null);
  const [hostId, setHostId] = useState("");
  const [gamePlayerIds, setGamePlayerIds] = useState<string[]>([]);
  const [gameSessionKey, setGameSessionKey] = useState(0);
  const [floor, setFloor] = useState(1);
  const [playerLives, setPlayerLives] = useState<Record<string, number>>({});

  useEffect(() => {
    const offConnect = client.onConnected((id) => {
      setConnected(true);
      setLocalId(id);
    });
    const offRoom = client.onRoom((state) => {
      setRoom(state);
      if (state.difficulty) setDifficulty(state.difficulty);
    });
    const offGameStart = client.onGameStart(({ hostId: h, playerIds, difficulty: mode }) => {
      setHostId(h);
      setGamePlayerIds(playerIds);
      setDifficulty(mode);
      setOutcome(null);
      setMatchTimeLeftMs(null);
      setFloor(1);
      setPlayerLives(
        Object.fromEntries(playerIds.map((id) => [id, startingLives(mode)]))
      );
      setGameSessionKey((k) => k + 1);
      setScreen("game");
    });
    const offAdvanceFloor = client.onAdvanceFloor(({ floor: nextFloor, playerLives: lives }) => {
      setFloor((prevFloor) => {
        setPlayerLives((prev) => {
          // Never wipe lives because the server sent nothing useful.
          const incoming = lives && Object.keys(lives).length > 0 ? lives : prev;
          // The multiplayer path doesn't go through advanceFloor(), so the
          // outdoor top-up has to be applied here too.
          return applyOutsideBonus(incoming, prevFloor, nextFloor, difficultyRef.current);
        });
        return nextFloor;
      });
      setOutcome(null);
      setMatchTimeLeftMs(null);
      setGameSessionKey((k) => k + 1);
    });
    client.socket.onDisconnected(() => setConnected(false));
    return () => {
      offConnect();
      offRoom();
      offGameStart();
      offAdvanceFloor();
    };
  }, [client]);

  const navigate = useCallback((next: Screen) => {
    setScreen((current) => {
      prevScreenRef.current = current;
      return next;
    });
  }, []);

  const back = useCallback(() => {
    setScreen(prevScreenRef.current ?? "menu");
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const createRoom = useCallback(
    (name: string) => {
      const code = randomRoomCode();
      setPlayerName(name || "Player");
      setRoomId(code);
      client.socket.createRoom(name || "Player", code);
      setScreen("lobby");
    },
    [client]
  );

  const joinRoom = useCallback(
    (name: string, code: string) => {
      const normalized = code.trim().toUpperCase();
      setPlayerName(name || "Player");
      setRoomId(normalized);
      client.socket.joinRoom(name || "Player", normalized);
      setScreen("lobby");
    },
    [client]
  );

  const startGame = useCallback(() => {
    client.socket.startGame();
  }, [client]);

  const setReady = useCallback(
    (ready: boolean) => {
      client.socket.setReady(ready);
    },
    [client]
  );

  const setDifficultyMode = useCallback(
    (mode: Difficulty) => {
      setDifficulty(mode);
      client.socket.setDifficulty(mode);
    },
    [client]
  );

  // Offline single-player: jump straight to the local preview, no lobby/socket.
  const startSinglePlayer = useCallback((mode: Difficulty = "normal") => {
    setDifficulty(mode);
    setHostId("");
    setGamePlayerIds([]);
    setOutcome(null);
    setMatchTimeLeftMs(null);
    setFloor(1);
    setPlayerLives({});
    setGameSessionKey((k) => k + 1);
    setScreen("game");
  }, []);

  // Clear the current floor and start the next one up. Each floor is a fresh
  // run of the house (new gameSessionKey remounts GameView), with the timer
  // reset to full. Stops at the top floor; the caller handles the actual win.
  const advanceFloor = useCallback(() => {
    setFloor((f) => {
      const next = Math.min(FLOOR_TOTAL, f + 1);
      // Stepping outside for the first time tops everyone up (Normal only —
      // Ludicrous keeps its 4 starting lives for the whole run).
      setPlayerLives((prev) => applyOutsideBonus(prev, f, next, difficulty));
      return next;
    });
    setOutcome(null);
    setMatchTimeLeftMs(null);
    setGameSessionKey((k) => k + 1);
  }, [difficulty]);

  /**
   * Dev/testing: jump straight to any floor. Solo only — it re-seeds the local
   * run, so firing it mid-multiplayer would desync the other clients. Lives are
   * refilled to that floor's maximum so the level can actually be played/tested.
   */
  const jumpToFloor = useCallback(
    (target: number) => {
      const next = Math.min(FLOOR_TOTAL, Math.max(1, Math.floor(target)));
      setFloor(next);
      setPlayerLives({ [SOLO_ID]: maxLives(difficulty, next) });
      setOutcome(null);
      setMatchTimeLeftMs(null);
      setGameSessionKey((k) => k + 1);
      setScreen("game");
    },
    [difficulty]
  );

  const returnToLobby = useCallback(() => {
    client.detachScene();
    setOutcome(null);
    setMatchTimeLeftMs(null);
    setFloor(1);
    setPlayerLives({});
    setHostId("");
    setGamePlayerIds([]);
    setScreen("lobby");
    client.socket.returnToLobby();
  }, [client]);

  const leaveToMenu = useCallback(() => {
    client.socket.leaveRoom();
    client.unmountGame();
    setRoom(undefined);
    setRoomId("");
    setHostId("");
    setGamePlayerIds([]);
    setOutcome(null);
    setMatchTimeLeftMs(null);
    setFloor(1);
    setPlayerLives({});
    setScreen("menu");
  }, [client]);

  const value = useMemo<GameContextValue>(
    () => ({
      client,
      connected,
      room,
      localId,
      screen,
      navigate,
      back,
      playerName,
      setPlayerName,
      roomId,
      outcome,
      setOutcome,
      settings,
      updateSettings,
      createRoom,
      joinRoom,
      startGame,
      difficulty,
      startSinglePlayer,
      returnToLobby,
      leaveToMenu,
      matchTimeLeftMs,
      setMatchTimeLeftMs,
      hostId,
      setReady,
      setDifficulty: setDifficultyMode,
      gamePlayerIds,
      gameSessionKey,
      floor,
      floorTotal: FLOOR_TOTAL,
      advanceFloor,
      jumpToFloor,
      playerLives,
      setPlayerLives
    }),
    [
      client,
      connected,
      room,
      localId,
      screen,
      navigate,
      back,
      playerName,
      roomId,
      outcome,
      settings,
      updateSettings,
      createRoom,
      joinRoom,
      startGame,
      difficulty,
      startSinglePlayer,
      returnToLobby,
      leaveToMenu,
      matchTimeLeftMs,
      setMatchTimeLeftMs,
      hostId,
      setReady,
      setDifficultyMode,
      gamePlayerIds,
      gameSessionKey,
      floor,
      advanceFloor,
      jumpToFloor,
      playerLives
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

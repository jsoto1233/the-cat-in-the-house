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
import type { RoomState } from "../types";

export type Screen =
  | "menu"
  | "lobby"
  | "game"
  | "settings"
  | "credits"
  | "end";

export type Outcome = "escaped" | "caught" | "timeout" | null;

export type Difficulty = "normal" | "ludicrous";

export interface Settings {
  master: number;
  sfx: number;
  music: number;
}

const SETTINGS_KEY = "cith.settings";

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
  startGame: () => void;
  difficulty: Difficulty;
  startSinglePlayer: (difficulty?: Difficulty) => void;
  leaveToMenu: () => void;
  matchTimeLeftMs: number | null;
  setMatchTimeLeftMs: (ms: number | null) => void;
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
  const [matchTimeLeftMs, setMatchTimeLeftMs] = useState<number | null>(null);

  useEffect(() => {
    const offConnect = client.onConnected((id) => {
      setConnected(true);
      setLocalId(id);
    });
    const offRoom = client.onRoom((state) => setRoom(state));
    client.socket.onDisconnected(() => setConnected(false));
    return () => {
      offConnect();
      offRoom();
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
    setOutcome(null);
    setMatchTimeLeftMs(null);
    setScreen("game");
  }, [client]);

  // Offline single-player: jump straight to the local preview, no lobby/socket.
  const startSinglePlayer = useCallback((mode: Difficulty = "normal") => {
    setDifficulty(mode);
    setOutcome(null);
    setMatchTimeLeftMs(null);
    setScreen("game");
  }, []);

  const leaveToMenu = useCallback(() => {
    client.unmountGame();
    setOutcome(null);
    setMatchTimeLeftMs(null);
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
      leaveToMenu,
      matchTimeLeftMs,
      setMatchTimeLeftMs
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
      leaveToMenu,
      matchTimeLeftMs,
      setMatchTimeLeftMs
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

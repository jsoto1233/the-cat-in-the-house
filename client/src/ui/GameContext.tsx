import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

// Week 2 UI prototype state. Gameplay/networking integration arrives in Phase 2.
export type Screen = "menu" | "lobby";

export interface LobbyPlayer {
  id: string;
  name: string;
  host: boolean;
}

const MAX_PLAYERS = 4;

function randomRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

interface GameContextValue {
  screen: Screen;
  navigate: (screen: Screen) => void;
  playerName: string;
  setPlayerName: (name: string) => void;
  roomId: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  createRoom: (name: string) => void;
  joinRoom: (name: string, code: string) => void;
  leaveToMenu: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [playerName, setPlayerName] = useState("Player");
  const [roomId, setRoomId] = useState("");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);

  const navigate = useCallback((next: Screen) => setScreen(next), []);

  const createRoom = useCallback((name: string) => {
    const me = name.trim() || "Player";
    setPlayerName(me);
    setRoomId(randomRoomCode());
    setPlayers([{ id: "you", name: me, host: true }]);
    setScreen("lobby");
  }, []);

  const joinRoom = useCallback((name: string, code: string) => {
    const me = name.trim() || "Player";
    setPlayerName(me);
    setRoomId(code.trim().toUpperCase());
    // Prototype roster: an existing host plus the local player.
    setPlayers([
      { id: "host", name: "Host", host: true },
      { id: "you", name: me, host: false }
    ]);
    setScreen("lobby");
  }, []);

  const leaveToMenu = useCallback(() => {
    setPlayers([]);
    setRoomId("");
    setScreen("menu");
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      screen,
      navigate,
      playerName,
      setPlayerName,
      roomId,
      players,
      maxPlayers: MAX_PLAYERS,
      createRoom,
      joinRoom,
      leaveToMenu
    }),
    [screen, navigate, playerName, roomId, players, createRoom, joinRoom, leaveToMenu]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

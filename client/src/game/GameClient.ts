import { io, type Socket } from "socket.io-client";
import type { RoomState } from "../types";
import type { MatchOutcome, PlayableHouseScene } from "./scenes/PlayableHouseScene";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

type ConnectedHandler = (id: string) => void;
type RoomHandler = (state: RoomState) => void;
type GameStartHandler = (payload: {
  hostId: string;
  playerIds: string[];
  difficulty: "normal" | "ludicrous";
}) => void;
type GameStateHandler = (state: GameSyncState) => void;
type GameOverHandler = (payload: { outcome: string }) => void;
type PlayerMoveHandler = (payload: { id: string; x: number; y: number }) => void;
type PlayerInteractHandler = (payload: { id: string }) => void;

export interface GameSyncState {
  players: Record<string, { x: number; y: number; alive: boolean }>;
  cashFound: number;
  collectedLoot: number[];
  hasKey?: boolean;
  openedInteractables?: string[];
  cat: { x: number; y: number; mood: string };
  lives: number;
  timeLeftMs: number;
  matchEnded?: boolean;
  outcome?: string;
}

export interface SceneNetCallbacks {
  isHost: boolean;
  onTimeSync?: (ms: number) => void;
  onGameOver?: (outcome: string) => void;
}

class GameSocket {
  constructor(private ioSocket: Socket) {}

  onDisconnected(cb: () => void): void {
    this.ioSocket.on("disconnect", cb);
  }

  createRoom(name: string, code: string): void {
    this.ioSocket.emit("create_room", { name, code });
  }

  joinRoom(name: string, code: string): void {
    this.ioSocket.emit("join_room", { name, code });
  }

  leaveRoom(): void {
    this.ioSocket.emit("leave_room");
  }

  setReady(ready: boolean): void {
    this.ioSocket.emit("set_ready", { ready });
  }

  setDifficulty(difficulty: "normal" | "ludicrous"): void {
    this.ioSocket.emit("set_difficulty", { difficulty });
  }

  startGame(): void {
    this.ioSocket.emit("start_game");
  }

  sendMove(x: number, y: number): void {
    this.ioSocket.emit("player_move", { x, y });
  }

  sendInteract(): void {
    this.ioSocket.emit("player_interact");
  }

  sendGameState(state: GameSyncState): void {
    this.ioSocket.emit("game_state", state);
  }

  sendGameOver(outcome: string): void {
    this.ioSocket.emit("game_over", { outcome });
  }
}

export class GameClient {
  readonly socket: GameSocket;

  connected = false;
  localId = "";
  latestRoom: RoomState | undefined;

  private ioSocket: Socket;
  private connectHandlers = new Set<ConnectedHandler>();
  private roomHandlers = new Set<RoomHandler>();
  private gameStartHandlers = new Set<GameStartHandler>();
  private gameStateHandlers = new Set<GameStateHandler>();
  private gameOverHandlers = new Set<GameOverHandler>();
  private playerMoveHandlers = new Set<PlayerMoveHandler>();
  private playerInteractHandlers = new Set<PlayerInteractHandler>();
  private sceneUnsubs: Array<() => void> = [];

  constructor() {
    this.ioSocket = io(SERVER_URL, { transports: ["websocket", "polling"] });
    this.socket = new GameSocket(this.ioSocket);

    this.ioSocket.on("connect", () => {
      this.connected = true;
      this.localId = this.ioSocket.id ?? "";
      this.connectHandlers.forEach((cb) => cb(this.localId));
    });

    this.ioSocket.on("disconnect", () => {
      this.connected = false;
    });

    this.ioSocket.on("room_update", (state: RoomState) => {
      this.latestRoom = state;
      this.roomHandlers.forEach((cb) => cb(state));
    });

    this.ioSocket.on(
      "game_start",
      (payload: { hostId: string; playerIds: string[]; difficulty: "normal" | "ludicrous" }) => {
        this.gameStartHandlers.forEach((cb) => cb(payload));
      }
    );

    this.ioSocket.on("game_state", (state: GameSyncState) => {
      this.gameStateHandlers.forEach((cb) => cb(state));
    });

    this.ioSocket.on("game_over", (payload: { outcome: string }) => {
      this.gameOverHandlers.forEach((cb) => cb(payload));
    });

    this.ioSocket.on("player_move", (payload: { id: string; x: number; y: number }) => {
      this.playerMoveHandlers.forEach((cb) => cb(payload));
    });

    this.ioSocket.on("player_interact", (payload: { id: string }) => {
      this.playerInteractHandlers.forEach((cb) => cb(payload));
    });

    this.ioSocket.on("room_error", ({ message }: { message: string }) => {
      console.warn("[GameClient]", message);
    });
  }

  attachScene(scene: PlayableHouseScene, callbacks: SceneNetCallbacks): void {
    this.detachScene();

    this.sceneUnsubs.push(
      this.onPlayerMove(({ id, x, y }) => {
        if (id === this.localId) return;
        scene.setRemotePosition(id, x, y);
      })
    );

    if (callbacks.isHost) {
      this.sceneUnsubs.push(
        this.onPlayerInteract(({ id }) => {
          if (id === this.localId) return;
          const pos = scene.getPlayerPosition(id);
          if (pos) scene.tryInteractAt(id, pos.x, pos.y);
        })
      );
    }

    if (!callbacks.isHost) {
      this.sceneUnsubs.push(
        this.onGameState((state) => {
          scene.applyGameState({
            ...state,
            outcome: state.outcome as MatchOutcome | undefined
          });
          callbacks.onTimeSync?.(state.timeLeftMs);
        })
      );
    }

    this.sceneUnsubs.push(
      this.onGameOver(({ outcome }) => {
        callbacks.onGameOver?.(outcome);
      })
    );
  }

  detachScene(): void {
    for (const unsub of this.sceneUnsubs) unsub();
    this.sceneUnsubs = [];
  }

  onConnected(cb: ConnectedHandler): () => void {
    this.connectHandlers.add(cb);
    if (this.connected) cb(this.localId);
    return () => this.connectHandlers.delete(cb);
  }

  onRoom(cb: RoomHandler): () => void {
    this.roomHandlers.add(cb);
    if (this.latestRoom) cb(this.latestRoom);
    return () => this.roomHandlers.delete(cb);
  }

  onGameStart(cb: GameStartHandler): () => void {
    this.gameStartHandlers.add(cb);
    return () => this.gameStartHandlers.delete(cb);
  }

  onGameState(cb: GameStateHandler): () => void {
    this.gameStateHandlers.add(cb);
    return () => this.gameStateHandlers.delete(cb);
  }

  onGameOver(cb: GameOverHandler): () => void {
    this.gameOverHandlers.add(cb);
    return () => this.gameOverHandlers.delete(cb);
  }

  onPlayerMove(cb: PlayerMoveHandler): () => void {
    this.playerMoveHandlers.add(cb);
    return () => this.playerMoveHandlers.delete(cb);
  }

  onPlayerInteract(cb: PlayerInteractHandler): () => void {
    this.playerInteractHandlers.add(cb);
    return () => this.playerInteractHandlers.delete(cb);
  }

  mountGame(_containerId: string): void {}

  unmountGame(): void {
    this.detachScene();
    this.socket.leaveRoom();
  }
}

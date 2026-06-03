// Minimal UI-only stub of the game client so the client builds standalone.
//
// The real networked client (socket.io transport + Phaser scene) is part of the
// teammates' in-progress gameplay work and is intentionally NOT included in this
// commit. The menu/lobby UI keeps a reference to a client for future online play,
// but the shipping single-player experience runs entirely offline via the
// self-contained HousePreviewScene. This no-op stub satisfies the interface the
// UI consumes and lets the client type-check and build on its own.

import type { RoomState } from "../types";

type ConnectedHandler = (id: string) => void;
type RoomHandler = (state: RoomState) => void;

class StubSocket {
  onDisconnected(_cb: () => void): void {}
  createRoom(_name: string, _code: string): void {}
  joinRoom(_name: string, _code: string): void {}
  startGame(): void {}
}

export class GameClient {
  readonly connected = false;
  readonly localId = "";
  readonly latestRoom: RoomState | undefined = undefined;
  readonly socket = new StubSocket();

  onConnected(_cb: ConnectedHandler): () => void {
    return () => {};
  }

  onRoom(_cb: RoomHandler): () => void {
    return () => {};
  }

  mountGame(_containerId: string): void {}

  unmountGame(): void {}
}

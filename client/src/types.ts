// Minimal UI-only type definitions so the client builds standalone.
//
// The richer gameplay/network types live in the teammates' in-progress work
// (client/src/game/**, client/src/network/**) which is intentionally NOT part
// of this commit. These shapes only describe what the UI components read so the
// client can type-check and build on its own. See client/src/game/GameClient.ts.
//
// The shippable in-game experience is the self-contained offline preview in
// client/src/ui/preview/HousePreviewScene.ts, which does not use these types.

export type CatMood = "calm" | "warning" | "aggressive";

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  alive: boolean;
  clues: string[];
  ready?: boolean;
}

export interface CatState {
  mood: CatMood;
}

export type RoomDifficulty = "normal" | "ludicrous";

export interface RoomState {
  players: Record<string, PlayerState>;
  hostId?: string;
  difficulty?: RoomDifficulty;
  timeLeftMs: number;
  cluesFound: string[];
  cat: CatState;
  atticUnlocked: boolean;
}

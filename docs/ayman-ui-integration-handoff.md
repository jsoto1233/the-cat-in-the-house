# Ayman ↔ Jose UI integration handoff

**Project:** The Cat in the House  
**Audience:** Ayman (game logic / Phaser)  
**Author:** Jose (React UI shell)  
**Repo (canonical):** `Documents - Pepe's MacBook Air/the-cat-in-the-house`  
**Last verified:** 2026-06-04 (from live `client/src/ui/**` and `HousePreviewScene.ts`)

---

## 1. Ownership boundaries

| Owner | Paths / responsibility |
|--------|-------------------------|
| **Jose** | `client/src/ui/**` (screens, HUD, styles, routing), `client/src/ui/preview/HousePreviewScene.ts` (visual house layout + placeholder HUD state), `client/src/types.ts` (minimal shapes the UI reads today), `client/src/game/GameClient.ts` (UI-only stub until online play lands) |
| **Ayman** | `client/src/game/**` (Phaser scenes, entities, systems), repo-root **`Gamelogic.js`**, **`CatAI.js`**, **`CollisionMap.js`** — do not edit these from Jose’s UI PRs; wire *into* them from a scene |
| **Vincent** | `server/**` (Socket.io rooms, authoritative room state, multiplayer sync) |

**Rule of thumb:** Jose owns React + the match timer/HUD/orchestration in `GameView.tsx`. Ayman owns simulation (movement, cat AI, pickups, win/lose rules inside Phaser/JS). Vincent owns server truth for lobby multiplayer.

---

## 2. Current UI behavior (accurate from code)

### Screens (`client/src/ui/App.tsx`)

React routing is **not** `react-router`; it is `GameContext.screen`:

| Screen key | Component | Notes |
|------------|-----------|--------|
| `menu` | `MainMenu` | Single-player difficulty toggle, offline stub client |
| `lobby` | `Lobby` | Up to 4 robbers; host starts via `startGame()` (socket stub today) |
| `game` | `GameView` | Phaser canvas + HUD + pause |
| `settings` | `Settings` | SFX/music sliders; `back()` returns to previous screen |
| `end` | `EndScreen` | Shown after `setOutcome` + `navigate("end")` |
| `credits` | `Credits` | Exists but not in Jose’s core loop list |

Entry paths:

- **Single-player:** `startSinglePlayer(difficulty)` → `screen = "game"` (no socket).
- **Multiplayer (future):** `createRoom` / `joinRoom` → `lobby` → `startGame()` → `game`.

### Match timers (`GameView.tsx`)

| Difficulty | Duration | Constant |
|------------|----------|----------|
| `normal` | **60 seconds** | `MATCH_MS_NORMAL = 60_000` |
| `ludicrous` | **30 seconds** | `MATCH_MS_LUDICROUS = 30_000` |

Timer runs in **React** (`setInterval` every 1s). It **stops** when `gameplayPaused` is true (see below).

### Objective panel

- **Exact objective string** (HUD + intro):

  > `Solo heist: search the house, collect $ valuables, and escape.`

- On mount: objective text panel is shown for **7 seconds** (`OBJECTIVE_INTRO_MS = 7000`), then auto-hides; the **Objective** button stays.
- Toggling the button opens/closes the panel manually.
- While the objective panel is **open**, gameplay is treated as paused (timer + Phaser).

### Game over (timeout only — wired today)

When `timeLeftMs` hits `0`:

1. `setGameOver(true)`
2. `setOutcome("timeout")`
3. `navigate("end")`

`EndScreen` buttons: **Try Again** (`startSinglePlayer(difficulty)`), **Main Menu** (`leaveToMenu()`).

Win (`escaped`) and lose (`caught`) copy exist on `EndScreen` but are **not** triggered from Phaser yet.

### HUD (`HUD.tsx`) — what players see

| Element | Behavior |
|---------|----------|
| **Loot** | `$ {cashFound} / {cashTotal}` — default total **4** |
| **Lives** | Heart row `{lives}` of `{livesTotal}` — default **3** |
| **Time** | `MM:SS`, turns low style at ≤ 30s remaining |
| **Objective** | Button + collapsible panel |
| **Pause** | `II` button → `PauseOverlay` |

**Explicitly removed / not in HUD:** crew chips, dev hint bar, clue counter (UI language is **valuables / loot**, not “clues”).

### Pause

- **Escape** toggles pause (unless `gameOver`).
- Pause overlay: Resume, Settings, Leave to menu.
- `gameplayPaused = paused || objectivePanelOpen || gameOver`
- Phaser: `scene.pause("HousePreview")` / `scene.resume("HousePreview")` when paused state changes.

### Ludicrous mode visuals

If `preview.difficulty === "ludicrous"`, `GameView` adds `ludicrous-fx` overlay and a **Ludicrous** badge (from preview state).

---

## 3. Integration contract — what Ayman should wire

### 3.1 How `GameView` mounts Phaser today

```ts
// GameView.tsx (simplified)
new Phaser.Game({
  width: 800, height: 600,
  parent: containerRef.current,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  callbacks: { preBoot: (g) => g.registry.set("difficulty", chosen) },
  scene: [HousePreviewScene],  // key: "HousePreview"
});
game.events.on("preview:update", (state: PreviewState) => setPreview(state));
```

**Future swap:** Replace `HousePreviewScene` with Ayman’s playable scene (e.g. extend layout from preview + hook `Gamelogic.js`), **or** drive logic inside `HousePreviewScene` and rename the scene key. If the scene key changes, Jose must update pause lines:

```ts
scene.pause("HousePreview");   // → your scene key
scene.resume("HousePreview");
```

Recommended: keep scene key **`HousePreview`** during integration, or export a shared constant both sides import.

### 3.2 Custom events (today)

| Event | Emitter | Listener | Payload |
|-------|---------|----------|---------|
| `preview:update` | `HousePreviewScene` via `this.game.events.emit` | `GameView` `game.events.on` | `PreviewState` (see below) |

**Not wired in UI yet:** `Gamelogic.js` events (`tick`, `clue_collected`, `game_over`, `local-move`, socket events). Map these to `preview:update` and/or a thin bridge Jose adds in `GameView`.

`GameClient` is a **stub** (`connected = false`); no live socket events reach `GameView` in the shipping single-player path.

### 3.3 State shape the HUD expects (`PreviewState`)

Defined in `client/src/ui/preview/HousePreviewScene.ts`:

```ts
export interface PreviewState {
  cashFound: number;      // 0..cashTotal
  cashTotal: number;      // 4
  mood: "calm" | "warning" | "aggressive";
  atticUnlocked: boolean;
  lives: number;
  livesTotal: number;     // 3
  difficulty: "normal" | "ludicrous";
}
```

Emit whenever loot, lives, mood, attic gate, or difficulty-relevant state changes:

```ts
this.game.events.emit("preview:update", state);
```

**Naming alignment:** Ayman’s `Gamelogic.js` uses `cluesFound` / `clue_collected`. The UI displays **Loot `$ X / 4`**. Map `cluesFound → cashFound` in the bridge (same count: **4** to win).

`client/src/types.ts` `RoomState` still has `cluesFound: string[]` for lobby/multiplayer stubs — multiplayer should eventually align with `cashFound` semantics.

### 3.4 Ending the match (`setOutcome` + `navigate("end")`)

`GameContext` outcomes:

```ts
type Outcome = "escaped" | "caught" | "timeout" | null;
```

| Outcome | When | `Gamelogic.js` analogue |
|---------|------|-------------------------|
| `timeout` | React timer hits 0 | `GAME_STATE.TIMEOUT` / already wired in UI |
| `escaped` | All valuables + successful escape | `GAME_STATE.ESCAPED` / `attemptEscape()` |
| `caught` | Cat catches player (lives exhausted) | `GAME_STATE.CAUGHT` / `player_caught` |

**Ayman should trigger** (via callback or event bridge Jose adds):

```ts
setOutcome("escaped");  // or "caught"
navigate("end");
```

Do **not** only emit Phaser-side game over without updating React context — `EndScreen` reads `outcome` from context.

### 3.5 Pause / resume API

Owned by **Jose** in `GameView`:

- React pause flag + objective panel + `gameOver` gate the **timer**.
- Phaser `SceneManager.pause/resume` on scene key **`HousePreview`**.

Ayman’s `update()` should respect Phaser’s paused scene (no simulation while paused). No separate pause API on the scene is required unless you add one for partial pause (e.g. cutscenes).

### 3.6 Who owns the countdown?

| Layer | Owner today | Notes |
|-------|-------------|--------|
| Match timer (60s / 30s) | **Jose (`GameView`)** | Pauses when `gameplayPaused` |
| `Gamelogic.js` timer | **Ayman** | Default **300s** in `GAME_DURATION_SECONDS` — **does not match UI** until unified |
| `TimerSystem.ts` | Legacy in `client/src/game` | Default 8 min — not used by UI |

**Recommendation for single-player integration (pick one):**

1. **Option A (minimal):** Ayman does not run a separate match timer; Jose’s React timer is authoritative. Game logic only handles loot/lives/cat/escape.
2. **Option B:** Ayman drives time in `tick` → emit `timeLeftMs` on `preview:update` → Jose replaces local timer with synced value (needed for multiplayer/Vincent).

Until Option B, **pause in UI already freezes the countdown** — Ayman should not advance a parallel timer while Phaser is paused.

---

## 4. House / world data from preview (canonical layout)

Source: `client/src/ui/preview/HousePreviewScene.ts`  
**Visual only today** — comments state collision/movement deferred to `CollisionMap.js`, `CatAI.js`, `Gamelogic.js`.

### World bounds

| Constant | Value |
|----------|--------|
| `WORLD` | x=30, y=30, w=740, h=540 |
| Canvas | 800×600 (Phaser game size) |

### Rooms (`ROOMS`)

| key | Label | x | y | w | h | Notes |
|-----|-------|---|---|---|---|--------|
| `living` | Living Room | 30 | 30 | 330 | 230 | |
| `kitchen` | Kitchen | 380 | 30 | 390 | 230 | |
| `hallway` | Hallway | 30 | 270 | 740 | 60 | |
| `bedroom` | Bedroom | 30 | 340 | 290 | 230 | |
| `bathroom` | Bathroom | 340 | 340 | 200 | 230 | |
| `attic` | **Back door** | 560 | 340 | 210 | 230 | `isAttic: true`, back door escape placeholder |

### Doorway gaps (floor-colored bridges into hallway)

| x | y | w | h |
|---|---|---|---|
| 190 | 260 | 46 | 14 |
| 540 | 260 | 46 | 14 |
| 170 | 330 | 46 | 14 |
| 430 | 330 | 46 | 14 |
| 650 | 330 | 46 | 14 |

### Spawns

| Entity | Position |
|--------|----------|
| Player | `PLAYER_SPAWN` **(400, 300)** |
| Cat | `CAT_SPAWN` **(440, 150)** |
| Back door | Center of attic room — labeled **Back door** |

### Valuable locations (`MONEY_SPOTS` — use for pickups)

| # | x | y | Room (comment) |
|---|-----|-----|----------------|
| 1 | 195 | 159 | living |
| 2 | 575 | 159 | kitchen |
| 3 | 175 | 469 | bedroom |
| 4 | 440 | 469 | bathroom |

### Walkability

Not encoded in the preview scene. Build `CollisionMap` grid from this layout (walls = room strokes minus door gaps). `CollisionMap.js` expects `boolean[][]` with `true` = walkable.

### Alignment warning vs `Gamelogic.js`

Root `Gamelogic.js` `ROOMS` = `['hallway', 'bedroom', 'basement', 'attic']` and procedural clue coords — **different from Jose’s floor plan**. For integrated art/collision, treat **`HousePreviewScene` coordinates as canonical** and update clue placement / task rooms accordingly.

---

## 5. Loot model

| Concept | UI | Preview / logic |
|---------|-----|-----------------|
| Total valuables | `cashTotal = 4` | `CASH_TOTAL` |
| Collected | HUD `$ X / 4` | `cashFound` in `PreviewState` |
| Markers | Gold `$` tweens at `MONEY_SPOTS` | `spawnMoneyMarker()` |

On pickup: increment `cashFound`, hide/remove marker, re-emit `preview:update`.  
Win condition (UI copy): collect valuables and escape — wire `attemptEscape` / attic zone when `cashFound >= 4` and `atticUnlocked` (if you gate the attic).

`atticUnlocked: false` in placeholder state — expose when the back door is reachable.

---

## 6. Build / known blockers

### Client build

```bash
# repo root
npm run build          # runs client + server workspaces

# client only
cd client && npm run build   # tsc --noEmit && vite build
```

**Current failure** (`npm run build` in `client`):

```
src/game/scenes/HouseScene.ts(58,38): Property 'x' does not exist on type 'CatState'.
src/game/scenes/HouseScene.ts(58,51): Property 'y' does not exist on type 'CatState'.
src/game/scenes/HouseScene.ts(59,46): Property 'ignoredTasks' does not exist on type 'CatState'.
```

`client/src/types.ts` today:

```ts
export interface CatState {
  mood: CatMood;
}
```

`HouseScene.syncFromRoom` expects `state.cat.x`, `state.cat.y`, `state.cat.ignoredTasks`. **Extend `CatState` (and server `RoomState` if needed)** — Ayman/Vincent own that fix; Jose’s UI stub types are minimal on purpose.

**Workaround for UI-only CI:** not recommended long-term; fix types so `tsc --noEmit` passes.

`vite build` alone is not the npm `build` script — root `npm run build` always runs `tsc` first.

### Files at repo root (Ayman)

- `Gamelogic.js` — session rules, `cluesFound`, 300s default timer, `GAME_STATE.*`
- `CatAI.js` — cat FSM, catches, tasks
- `CollisionMap.js` — grid walkability

These are **not** imported by `GameView` yet.

---

## 7. Copy / strings — do not contradict

| Location | String |
|----------|--------|
| Main menu title | `The Cat in the House` |
| Main menu subtitle | `Escape together. Don't get caught.` |
| Main menu — Normal | `Normal` / `15s grace · fair` |
| Main menu — Ludicrous | `Ludicrous` / `no mercy · chaos` |
| Main menu status | `Connected to server` / `Offline — demo mode` |
| Lobby title | `Heist lobby` |
| Lobby subtitle (connected) | `Crew assembling — share the room code` |
| Lobby subtitle (offline) | `Practice crew — ready up when you are` |
| Lobby note | `Co-op: search rooms, collect $ valuables, and escape. Multiplayer supports 4 robbers + 1 cat (asymmetric role soon).` |
| Game objective | `Solo heist: search the house, collect $ valuables, and escape.` |
| HUD labels | `Objective`, `Time`, `Loot`, `Lives` |
| Pause | `Paused`, `Resume`, `Settings`, `Leave to menu` |
| End — escaped | `Got away with the loot` + blurb about crew / back door |
| End — caught | `The cat caught you` + possessed cat blurb |
| End — timeout | `Time's up` (no blurb) |
| End actions | `Try Again`, `Main Menu` |
| Attic visual | `Back door` |
| Ludicrous badge | `Ludicrous` |

Use **valuables / loot / $** in player-facing text, not “clues,” unless referring to legacy code symbols.

---

## 8. Step-by-step integration checklist (Ayman)

1. **Read** `HousePreviewScene.ts` room/money/spawn constants — build `CollisionMap` to match door gaps and walls.
2. **Instantiate** `GameLogic` (+ `CatAI`, `CollisionMap`) from your playable scene `create()` using `PLAYER_SPAWN` / `CAT_SPAWN` / `WORLD` dimensions.
3. **Replace** static player/cat placeholders with driven sprites; keep depth/layering similar to preview if possible.
4. **Wire pickups** at `MONEY_SPOTS` → increment loot count → emit `preview:update` with `cashFound`.
5. **Wire lives** — cat catch reduces `lives`; at 0 emit outcome `caught` (bridge to React).
6. **Wire escape** — attic / back door zone + `cashFound >= 4` → `escaped` (bridge to React).
7. **Emit** `preview:update` on mood/cat aggression changes (`mood` maps from cat behavior).
8. **Set** `atticUnlocked` when escape route is valid (if gated).
9. **Respect pause** — no simulation while Phaser scene paused; do not run a second 300s timer unless coordinated with Jose.
10. **Map** `Gamelogic` `cluesFound` ↔ `cashFound` in events.
11. **Align** room names/tasks with Jose’s floor plan (living/kitchen/bathroom vs basement).
12. **Extend** `CatState` / `RoomState` for `HouseScene.ts` + Vincent server sync.
13. **Swap** `GameView` scene array from preview-only to your scene when ready; keep `preview:update` contract stable.
14. **Run** `cd client && npm run build` — fix TS errors before merge.
15. **Coordinate** with Vincent for multiplayer: `RoomState.timeLeftMs`, player positions, authoritative `game_over`.

---

## 9. Slack copy-paste for Ayman

```
Hey Ayman — Jose’s UI handoff for integrating your game logic is in:
docs/ayman-ui-integration-handoff.md

TL;DR:
• You own client/src/game/** + Gamelogic.js / CatAI.js / CollisionMap.js; I own client/src/ui/**.
• GameView currently mounts HousePreviewScene (800×600) and listens for game.events "preview:update" with { cashFound, cashTotal: 4, lives, mood, atticUnlocked, difficulty }.
• Match timer is in React: 60s normal / 30s ludicrous; pauses when pause menu or objective panel is open; Phaser scene key "HousePreview" is pause/resumed with it.
• End screens: call setOutcome("escaped"|"caught") + navigate("end") — only timeout is wired today.
• Canonical house layout + $ spots + spawns are in HousePreviewScene.ts (not Gamelogic’s basement room list).
• client build fails until CatState gets x/y/ignoredTasks — see doc §6.

Ping me when you emit preview:update from real pickups and I’ll help wire win/lose from your game_over events.
```

---

## Reference file index

| File | Role |
|------|------|
| `client/src/ui/screens/GameView.tsx` | Phaser mount, timer, pause, `preview:update` |
| `client/src/ui/components/HUD.tsx` | Loot / lives / time / objective |
| `client/src/ui/GameContext.tsx` | Screens, `setOutcome`, `navigate`, difficulty |
| `client/src/ui/screens/EndScreen.tsx` | Outcome copy |
| `client/src/ui/preview/HousePreviewScene.ts` | Layout + `PreviewState` |
| `client/src/game/scenes/HouseScene.ts` | Multiplayer-oriented scene (TS errors) |
| `Gamelogic.js` / `CatAI.js` / `CollisionMap.js` | Core logic (not yet wired to UI) |
| `package.json` | `npm run build` → client `tsc && vite build` + server |

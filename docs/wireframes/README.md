# UI Wireframes (Week 2)

The working React prototype in `client/src/ui/` implements these screens. Export
PNG/PDF sketches here for the pitch deck if a static version is needed.

| Screen | Suggested file | Key elements |
|--------|----------------|--------------|
| Main menu | `main-menu.png` | Title, Create lobby, Join lobby, Settings, Credits |
| Lobby | `lobby.png` | Room code, player slots (up to 4), Ready, Host Start |
| In-game HUD | `hud.png` | Objective, clue counter, match timer, player list, cat mood |
| Pause | `pause.png` | Resume, Settings, Leave to menu |
| End screen | `end.png` | Outcome (escaped/caught/timeout), Play again |

## Socket events the UI relies on (align with backend)

- `room:join` `{ name, roomId }`
- `game:start`
- `player:move` `{ x, y }`
- `room:update` → `RoomState` (players, timer, clues, cat mood)

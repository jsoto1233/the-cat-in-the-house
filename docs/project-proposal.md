# Cat in the House — Project Proposal (Week 1)

## Concept

A real-time cooperative horror escape game. Players explore a house, collect clues,
solve puzzles, and escape while an AI-driven cat escalates the tension.

## UI Scope (Jose Soldevilla)

### Screen map (MVP)

1. **Main menu** — Create lobby, Join lobby, Settings, Credits
2. **Lobby** — Room code, player list (up to 4), Ready, Host start
3. **Game** — Phaser canvas + React HUD overlay
4. **Pause** — Resume, Settings, Leave
5. **End** — Escaped / Caught / Time out

### Stack

- React + Vite for all menus and HUD chrome
- Phaser.js for the game world
- Socket.io events for lobby/game sync (backend: Vincent)

### UX goals

- Dark horror aesthetic; readable co-op objectives
- Three clicks or fewer from menu to match start
- Clear shared state: clue count, objective, and timer visible to all

## Out of scope (Weeks 1–2)

Full puzzle content, finished cat AI, production audio.

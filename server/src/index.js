const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const MAX_PLAYERS = 4;
const rooms = new Map();

function getRoom(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function roomPayload(room) {
  const players = {};
  for (const [id, p] of room.players) {
    players[id] = { id, name: p.name, x: p.x, y: p.y, alive: p.alive, clues: p.clues, ready: p.ready };
  }
  return {
    players,
    hostId: room.hostId,
    difficulty: room.difficulty ?? "normal",
    timeLeftMs: room.timeLeftMs ?? 60000,
    cluesFound: room.cluesFound ?? [],
    cat: room.cat ?? { mood: "calm" },
    atticUnlocked: room.atticUnlocked ?? false
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit("room_update", roomPayload(room));
}

function removeFromRoom(socket) {
  const room = getRoom(socket);
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(room.code);
  delete socket.data.roomCode;
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }
  broadcastRoom(room);
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on("create_room", ({ name, code }) => {
    const id = String(code || "").trim().toUpperCase();
    if (!id || rooms.has(id)) {
      socket.emit("room_error", { message: "Room code unavailable" });
      return;
    }
    const room = {
      code: id,
      hostId: socket.id,
      inGame: false,
      difficulty: "normal",
      players: new Map(),
      timeLeftMs: 60000,
      cluesFound: [],
      cat: { mood: "calm" },
      atticUnlocked: false
    };
    room.players.set(socket.id, {
      id: socket.id,
      name: name || "Player",
      ready: false,
      x: 0,
      y: 0,
      alive: true,
      clues: []
    });
    rooms.set(id, room);
    socket.data.roomCode = id;
    socket.join(id);
    broadcastRoom(room);
  });

  socket.on("join_room", ({ name, code }) => {
    const id = String(code || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) {
      socket.emit("room_error", { message: "Room not found" });
      return;
    }
    if (room.inGame) {
      socket.emit("room_error", { message: "Game already started" });
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      socket.emit("room_error", { message: "Room is full" });
      return;
    }
    room.players.set(socket.id, {
      id: socket.id,
      name: name || "Player",
      ready: false,
      x: 0,
      y: 0,
      alive: true,
      clues: []
    });
    socket.data.roomCode = id;
    socket.join(id);
    broadcastRoom(room);
  });

  socket.on("leave_room", () => removeFromRoom(socket));

  socket.on("set_ready", ({ ready }) => {
    const room = getRoom(socket);
    const player = room?.players.get(socket.id);
    if (!player || room.inGame) return;
    player.ready = !!ready;
    broadcastRoom(room);
  });

  socket.on("set_difficulty", ({ difficulty }) => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId || room.inGame) return;
    room.difficulty = difficulty === "ludicrous" ? "ludicrous" : "normal";
    broadcastRoom(room);
  });

  socket.on("start_game", () => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId || room.inGame) return;
    if (room.players.size < 1) return;
    for (const p of room.players.values()) {
      if (!p.ready) return;
    }
    room.inGame = true;
    room.floor = 1;
    room.timeLeftMs = room.difficulty === "ludicrous" ? 30000 : 60000;
    io.to(room.code).emit("game_start", {
      hostId: room.hostId,
      playerIds: [...room.players.keys()],
      difficulty: room.difficulty ?? "normal"
    });
  });

  socket.on("player_move", ({ x, y }) => {
    const room = getRoom(socket);
    const player = room?.players.get(socket.id);
    if (!room?.inGame || !player) return;
    player.x = x;
    player.y = y;
    io.in(room.code).emit("player_move", { id: socket.id, x, y });
  });

  socket.on("player_interact", () => {
    const room = getRoom(socket);
    if (!room?.inGame) return;
    io.in(room.code).emit("player_interact", { id: socket.id });
  });

  socket.on("game_state", (state) => {
    const room = getRoom(socket);
    if (!room?.inGame || socket.id !== room.hostId) return;
    room.timeLeftMs = state.timeLeftMs ?? room.timeLeftMs;
    room.cluesFound = state.cluesFound ?? room.cluesFound;
    room.cat = state.cat ?? room.cat;
    room.atticUnlocked = !!state.atticUnlocked;
    io.in(room.code).emit("game_state", state);
  });

  socket.on("game_over", ({ outcome }) => {
    const room = getRoom(socket);
    if (!room?.inGame || socket.id !== room.hostId) return;
    io.to(room.code).emit("game_over", { outcome });
    room.inGame = false;
  });

  socket.on("return_to_lobby", () => {
    const room = getRoom(socket);
    if (!room || room.inGame) return;
    if (!room.players.has(socket.id)) return;
    for (const p of room.players.values()) {
      p.ready = false;
    }
    broadcastRoom(room);
  });

  socket.on("advance_floor", (payload) => {
    const room = getRoom(socket);
    if (!room?.inGame || socket.id !== room.hostId) return;
    const floor = Number(payload?.floor);
    if (!Number.isFinite(floor) || floor < 1) return;
    room.floor = floor;
    room.playerLives = payload.playerLives ?? room.playerLives;
    io.to(room.code).emit("advance_floor", {
      floor,
      playerLives: room.playerLives ?? {}
    });
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    removeFromRoom(socket);
  });
});

const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

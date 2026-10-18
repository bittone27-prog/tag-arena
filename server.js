const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// ---------- Serveur HTTP statique ----------
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  filePath = path.join(__dirname, 'public', path.normalize(filePath));
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

// ---------- Serveur WebSocket (jeu temps réel) ----------
const wss = new WebSocket.Server({ server });

const rooms = {}; // code -> { players: Map, state, it, roundTime, interval, lastTagAt }
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
const ROUND_SECONDS = 90;
const TAG_COOLDOWN_MS = 1000;  // cooldown de 1 seconde entre 2 transferts de bombe
const TAG_DISTANCE = 42;

function createRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms[code]);
  return code;
}

function broadcast(room, message, exceptId = null) {
  room.players.forEach((p) => {
    if (p.id !== exceptId && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(message));
    }
  });
}

function playerList(room) {
  return [...room.players.entries()].map(([id, p]) => ({
    id, name: p.name, color: p.color, x: p.x, y: p.y, score: p.score
  }));
}

function startGame(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.players.size < 2) return;
  room.state = 'playing';

  // Choisir qui porte la bombe au départ
  const ids = [...room.players.keys()];
  room.it = ids[Math.floor(Math.random() * ids.length)];
  room.lastTagAt = 0; // pas de cooldown au début

  // Répartir les joueurs sur la carte
  let i = 0;
  room.players.forEach((p) => {
    p.x = 120 + (i % 4) * 220;
    p.y = 120 + Math.floor(i / 4) * 180;
    p.score = p.score || 0;
    p.color = COLORS[i % COLORS.length];
    i++;
  });

  room.roundTime = ROUND_SECONDS;

  broadcast(room, {
    type: 'game_start',
    players: playerList(room),
    it: room.it,
    roundTime: room.roundTime
  });

  room.interval = setInterval(() => {
    room.roundTime--;
    if (room.roundTime <= 0) {
      endRound(roomCode);
    } else {
      broadcast(room, { type: 'tick', roundTime: room.roundTime });
    }
  }, 1000);
}

function endRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearInterval(room.interval);

  // 🔥 Le dernier joueur qui avait la bombe PERD : -1 point
  const itPlayer = room.players.get(room.it);
  if (itPlayer) itPlayer.score -= 1;

  broadcast(room, {
    type: 'round_end',
    loser: room.it,
    scores: [...room.players.entries()].map(([id, p]) => ({ id, name: p.name, score: p.score }))
  });

  setTimeout(() => {
    if (rooms[roomCode] && rooms[roomCode].players.size >= 2) startGame(roomCode);
    else if (rooms[roomCode]) endRoom(roomCode);
  }, 5000);
}

function endRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearInterval(room.interval);
  room.players.forEach((p) => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({ type: 'room_closed' }));
    }
  });
  delete rooms[roomCode];
}

wss.on('connection', (ws) => {
  const player = { id: Math.random().toString(36).slice(2, 10), ws, roomCode: null, name: 'Joueur' };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create_room') {
      const code = createRoomCode();
      rooms[code] = { players: new Map(), state: 'waiting' };
      player.roomCode = code;
      player.name = String(msg.name || 'Joueur').slice(0, 16);
      rooms[code].players.set(player.id, player);
      ws.send(JSON.stringify({ type: 'room_created', code, yourId: player.id }));
    }

    else if (msg.type === 'join_room') {
      const room = rooms[msg.code];
      if (!room) return ws.send(JSON.stringify({ type: 'error', message: 'Salon introuvable 😢' }));
      if (room.state !== 'waiting') return ws.send(JSON.stringify({ type: 'error', message: 'Partie déjà en cours !' }));
      player.roomCode = msg.code;
      player.name = String(msg.name || 'Joueur').slice(0, 16);
      room.players.set(player.id, player);
      ws.send(JSON.stringify({
        type: 'joined',
        yourId: player.id,
        players: [...room.players.values()].map(p => ({ id: p.id, name: p.name }))
      }));
      broadcast(room, { type: 'player_joined', player: { id: player.id, name: player.name } }, player.id);
    }

    else if (msg.type === 'start_game') {
      const room = rooms[player.roomCode];
      if (room) startGame(player.roomCode);
    }

    else if (msg.type === 'move') {
      const room = rooms[player.roomCode];
      if (!room || room.state !== 'playing') return;
      player.x = Math.max(25, Math.min(775, Number(msg.x) || 0));
      player.y = Math.max(25, Math.min(535, Number(msg.y) || 0));

      // 💣 Le porteur de la bombe essaie de la refiler à quelqu'un
      if (player.id === room.it) {
        const now = Date.now();
        // ⏱️ COOLDOWN : on ne peut pas refiler la bombe plus d'une fois par seconde
        if (now - (room.lastTagAt || 0) >= TAG_COOLDOWN_MS) {
          let tagged = null;
          room.players.forEach((p, id) => {
            if (id !== player.id && !tagged) {
              const dist = Math.hypot((p.x || 0) - player.x, (p.y || 0) - player.y);
              if (dist < TAG_DISTANCE) {
                tagged = id;
              }
            }
          });
          if (tagged) {
            room.lastTagAt = now;          // active le cooldown
            room.it = tagged;              // la bombe change de main
            broadcast(room, { type: 'tagged', newIt: tagged, tagged: player.id, by: tagged });
          }
        }
      }

      broadcast(room, { type: 'player_moved', id: player.id, x: player.x, y: player.y }, player.id);
    }

    else if (msg.type === 'chat') {
      const room = rooms[player.roomCode];
      if (room) broadcast(room, { type: 'chat', name: player.name, text: String(msg.text).slice(0, 200) });
    }
  });

  ws.on('close', () => {
    const room = rooms[player.roomCode];
    if (!room) return;
    room.players.delete(player.id);
    broadcast(room, { type: 'player_left', id: player.id, name: player.name });
    if (room.players.size === 0) {
      endRoom(player.roomCode);
    } else if (room.state === 'playing' && player.id === room.it) {
      // Si le porteur de la bombe quitte, on la donne à quelqu'un d'autre
      room.it = [...room.players.keys()][0];
      room.lastTagAt = Date.now(); // cooldown pour éviter un transfert instantané
      broadcast(room, { type: 'tagged', newIt: room.it, tagged: null, by: room.it });
    }
  });
});

server.listen(PORT, () => {
  console.log(`💣 Tag Arena (Hot Potato) lancé sur http://localhost:${PORT}`);
});

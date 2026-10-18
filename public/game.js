// ---------- Connexion WebSocket ----------
const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${protocol}://${location.host}`);

let myId = null;
let isHost = false;
const players = new Map(); // id -> {name, color, x, y, score}
let itId = null;
let roundTime = 90;
const keys = {};

// ---------- Éléments DOM ----------
const $ = (id) => document.getElementById(id);
const screens = { menu: $('menu'), lobby: $('lobby'), game: $('game') };

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.add('hidden'), 2500);
}

// ---------- Menu ----------
$('btnCreate').onclick = () => {
  const name = $('playerName').value.trim() || 'Joueur';
  isHost = true;
  ws.send(JSON.stringify({ type: 'create_room', name }));
};

$('btnJoinToggle').onclick = () => {
  const box = $('joinBox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) $('roomCode').focus();
};

function joinRoom() {
  const name = $('playerName').value.trim() || 'Joueur';
  const code = $('roomCode').value.trim().toUpperCase();
  if (code.length < 4) return toast('⚠️ Entre un code valide !');
  ws.send(JSON.stringify({ type: 'join_room', name, code }));
}
$('btnJoin').onclick = joinRoom;
$('roomCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

$('btnCopy').onclick = () => {
  const code = $('lobbyCode').textContent;
  navigator.clipboard?.writeText(code).then(() => toast('📋 Code copié !'));
};

$('btnStart').onclick = () => ws.send(JSON.stringify({ type: 'start_game' }));

$('btnLeaveLobby').onclick = () => location.reload();

// ---------- WebSocket ----------
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  switch (msg.type) {
    case 'room_created':
      myId = msg.yourId;
      $('lobbyCode').textContent = msg.code;
      showScreen('lobby');
      addLobbyPlayer({ id: myId, name: $('playerName').value.trim() || 'Joueur' }, true);
      break;

    case 'joined':
      myId = msg.yourId;
      showScreen('lobby');
      msg.players.forEach(p => addLobbyPlayer(p, p.id === myId && isHost));
      break;

    case 'player_joined':
      addLobbyPlayer(msg.player, false);
      toast(`👋 ${msg.player.name} a rejoint le salon !`);
      break;

    case 'player_left':
      players.delete(msg.id);
      $(`lobby-${msg.id}`)?.remove();
      updatePlayerCount();
      toast(`👋 ${msg.name} a quitté le salon`);
      break;

    case 'game_start':
      players.clear();
      msg.players.forEach(p => players.set(p.id, p));
      itId = msg.it;
      roundTime = msg.roundTime;
      $('chatLog').innerHTML = '';
      showScreen('game');
      updateHud();
      toast('🚀 La partie commence !');
      break;

    case 'player_moved':
      if (players.has(msg.id)) {
        players.get(msg.id).x = msg.x;
        players.get(msg.id).y = msg.y;
      }
      break;

    case 'tick':
      roundTime = msg.roundTime;
      $('timer').textContent = `⏱ ${roundTime}`;
      break;

    case 'tagged':
      itId = msg.newIt;
      updateHud();
      if (msg.newIt === myId) toast('😱 TU ES LE CHAT ! Cours après les autres !');
      break;

    case 'round_end':
      showRoundEnd(msg.scores);
      break;

    case 'chat':
      addChat(msg.name, msg.text);
      break;

    case 'room_closed':
      toast('🚪 Le salon a été fermé');
      setTimeout(() => location.reload(), 2000);
      break;

    case 'error':
      toast(`⚠️ ${msg.message}`);
      break;
  }
};

// ---------- Lobby ----------
function addLobbyPlayer(p, host) {
  if ($(`lobby-${p.id}`)) return;
  const li = document.createElement('li');
  li.id = `lobby-${p.id}`;
  li.textContent = p.name + (p.id === myId ? ' (toi)' : '');
  if (host) li.classList.add('host');
  if (p.id === myId) li.classList.add('me');
  $('playerList').appendChild(li);
  updatePlayerCount();
}

function updatePlayerCount() {
  const count = document.querySelectorAll('#playerList li').length;
  $('playerCount').textContent = count;
  if (count >= 2) {
    $('btnStart').classList.remove('hidden');
    $('lobbyHint').classList.add('hidden');
  } else {
    $('btnStart').classList.add('hidden');
    $('lobbyHint').classList.remove('hidden');
  }
}

// ---------- HUD ----------
function updateHud() {
  const badge = $('roleBadge');
  if (itId === myId) {
    badge.textContent = '😱 TU ES LE CHAT !';
    badge.className = 'badge it';
  } else {
    const it = players.get(itId);
    badge.textContent = `🏃 ${it ? it.name : '???'} est le chat`;
    badge.className = 'badge runner';
  }
  const sb = $('scoreboard');
  sb.innerHTML = '';
  players.forEach((p, id) => {
    const chip = document.createElement('span');
    chip.className = 'score-chip' + (id === myId ? ' me' : '');
    chip.textContent = `${p.name} ${p.score}`;
    sb.appendChild(chip);
  });
}

// ---------- Fin de manche ----------
function showRoundEnd(scores) {
  const ul = $('roundScores');
  ul.innerHTML = '';
  [...scores].sort((a, b) => b.score - a.score).forEach((s, i) => {
    const li = document.createElement('li');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🔸';
    li.textContent = `${medal}  ${s.name} — ${s.score} pts`;
    ul.appendChild(li);
  });
  players.forEach((p, id) => {
    const s = scores.find(x => x.id === id);
    if (s) p.score = s.score;
  });
  $('roundOverlay').classList.remove('hidden');
  setTimeout(() => $('roundOverlay').classList.add('hidden'), 5000);
}

// ---------- Chat ----------
function addChat(name, text) {
  const li = document.createElement('li');
  const b = document.createElement('b');
  b.textContent = `${name}: `;
  li.appendChild(b);
  li.appendChild(document.createTextNode(text));
  const log = $('chatLog');
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

function sendChat() {
  const input = $('chatInput');
  if (input.value.trim()) {
    ws.send(JSON.stringify({ type: 'chat', text: input.value.trim() }));
    input.value = '';
  }
}
$('btnSend').onclick = sendChat;
$('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

// ---------- Contrôles clavier ----------
const SPEED = 6;
const KEYMAP = {
  arrowleft: [-1, 0], a: [-1, 0], q: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1], z: [0, -1],
  arrowdown: [0, 1], s: [0, 1]
};
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) e.preventDefault();
  keys[k] = true;
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ---------- Boucle de jeu ----------
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

function gameLoop() {
  // Envoi du mouvement
  const me = players.get(myId);
  if (me) {
    let dx = 0, dy = 0;
    Object.entries(KEYMAP).forEach(([k, [mx, my]]) => {
      if (keys[k]) { dx += mx * SPEED; dy += my * SPEED; }
    });
    if (dx || dy) {
      me.x = Math.max(30, Math.min(canvas.width - 30, me.x + dx));
      me.y = Math.max(30, Math.min(canvas.height - 30, me.y + dy));
      ws.send(JSON.stringify({ type: 'move', x: me.x, y: me.y }));
    }
  }

  draw();
  requestAnimationFrame(gameLoop);
}

// ---------- Rendu ----------
function draw() {
  // Fond + grille
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(148,163,184,.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Halo pulsant du chat
  if (itId && players.has(itId)) {
    const it = players.get(itId);
    const pulse = 26 + Math.sin(Date.now() / 200) * 6;
    ctx.beginPath();
    ctx.arc(it.x, it.y, pulse + 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239,68,68,.07)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(it.x, it.y, pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239,68,68,.15)';
    ctx.fill();
  }

  // Joueurs
  players.forEach((p, id) => {
    const isMe = id === myId;
    const isIt = id === itId;

    // Ombre
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 22, 22, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fill();

    // Corps
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = p.color || '#8b5cf6';
    ctx.fill();
    ctx.lineWidth = isIt ? 4 : 2;
    ctx.strokeStyle = isIt ? '#ef4444' : (isMe ? '#fff' : 'rgba(255,255,255,.4)');
    ctx.stroke();

    // Yeux
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x - 6, p.y - 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + 6, p.y - 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(p.x - 5, p.y - 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + 7, p.y - 3, 2, 0, Math.PI * 2); ctx.fill();

    // Bouche (grimace si chat, sourire sinon)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (isIt) ctx.arc(p.x, p.y + 7, 7, Math.PI + 0.2, Math.PI * 2 - 0.2);
    else ctx.arc(p.x, p.y + 4, 7, 0, Math.PI);
    ctx.stroke();

    // Nom avec fond arrondi
    ctx.font = 'bold 13px Outfit, sans-serif';
    ctx.textAlign = 'center';
    const label = p.name + (isMe ? ' (toi)' : '');
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(11,6,32,.75)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2, p.y - 42, w, 20, 8);
      ctx.fill();
    } else {
      ctx.fillRect(p.x - w / 2, p.y - 42, w, 20);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(label, p.x, p.y - 28);

    // Couronne du chat
    if (isIt) {
      ctx.font = '20px serif';
      ctx.fillText('👑', p.x, p.y - 52);
    }
  });
}

gameLoop();

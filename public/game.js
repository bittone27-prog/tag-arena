// ============================================================
// TAG ARENA — Client (en ligne + mode 2 joueurs local)
// ============================================================

// ---------- Connexion WebSocket (mode en ligne) ----------
const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${protocol}://${location.host}`);

let myId = null;
let isHost = false;
let localMode = false;   // true = 2 joueurs sur le même PC
let localP2Id = null;    // id du joueur 2 en local
const players = new Map(); // id -> {name, color, x, y, score}
let itId = null;
let roundTime = 90;
let localTimer = null;   // interval du timer en local
const keys = {};         // état des touches (partagé par les 2 joueurs)

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

// ---------- Menu : Créer / Rejoindre ----------
$('btnCreate').onclick = () => {
  const name = $('playerName').value.trim() || 'Joueur';
  isHost = true;
  ws.send(JSON.stringify({ type: 'create_room', name }));
};

$('btnJoinToggle').onclick = () => {
  const box = $('joinBox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    $('localBox').classList.add('hidden');
    $('roomCode').focus();
  }
};

function joinRoom() {
  const name = $('playerName').value.trim() || 'Joueur';
  const code = $('roomCode').value.trim().toUpperCase();
  if (code.length < 4) return toast('⚠️ Entre un code valide !');
  ws.send(JSON.stringify({ type: 'join_room', name, code }));
}
$('btnJoin').onclick = joinRoom;
$('roomCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

// ---------- Menu : Mode 2 joueurs local ----------
$('btnLocalToggle').onclick = () => {
  const box = $('localBox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    $('joinBox').classList.add('hidden');
    $('localName1').focus();
  }
};

$('btnLocalStart').onclick = () => startLocalGame();
['localName1', 'localName2'].forEach(id => {
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter') startLocalGame(); });
});

function startLocalGame() {
  const n1 = $('localName1').value.trim() || 'Joueur 1';
  const n2 = $('localName2').value.trim() || 'Joueur 2';

  localMode = true;
  myId = 'local-p1';
  localP2Id = 'local-p2';

  players.clear();
  players.set('local-p1', { id: 'local-p1', name: n1, color: '#8b5cf6', x: 250, y: 280, score: 0 });
  players.set('local-p2', { id: 'local-p2', name: n2, color: '#22d3ee', x: 550, y: 280, score: 0 });

  // Le joueur 1 est le chat au départ
  itId = 'local-p1';
  roundTime = 90;

  // Pas de chat en local, on cache la boîte de chat
  $('chatBox').classList.add('hidden');
  $('controlsLabel').innerHTML =
    `🕹️ <b>${n1}</b> (violet) : <b>ZQSD</b> &nbsp;•&nbsp; <b>${n2}</b> (cyan) : <b>Flèches</b> &nbsp;•&nbsp; Le chat 👑 attrape l'autre !`;

  showScreen('game');
  updateHud();
  toast('🕹️ Mode local : la partie commence !');

  // Timer local
  clearInterval(localTimer);
  localTimer = setInterval(() => {
    roundTime--;
    $('timer').textContent = `⏱ ${roundTime}`;
    if (roundTime <= 0) endLocalRound();
  }, 1000);
}

function endLocalRound() {
  clearInterval(localTimer);
  // Le chat gagne 1 point par manche jouée (il doit attraper l'autre)
  const it = players.get(itId);
  if (it) it.score += 1;
  showRoundEnd([...players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })));
  setTimeout(() => {
    // Relance une manche : on inverse les positions et on change le chat
    itId = itId === 'local-p1' ? 'local-p2' : 'local-p1';
    players.get('local-p1').x = 250; players.get('local-p1').y = 280;
    players.get('local-p2').x = 550; players.get('local-p2').y = 280;
    roundTime = 90;
    updateHud();
    localTimer = setInterval(() => {
      roundTime--;
      $('timer').textContent = `⏱ ${roundTime}`;
      if (roundTime <= 0) endLocalRound();
    }, 1000);
  }, 5000);
}

// Vérifie si le chat local attrape l'autre joueur
function checkLocalTag() {
  const p1 = players.get('local-p1');
  const p2 = players.get('local-p2');
  if (!p1 || !p2) return;
  const it = players.get(itId);
  const other = itId === 'local-p1' ? p2 : p1;
  const dist = Math.hypot(it.x - other.x, it.y - other.y);
  if (dist < 42) {
    // L'autre devient le chat, il gagne un point d'esquive
    other.score += 1;
    itId = other.id;
    updateHud();
    toast(`😱 ${other.name} est le nouveau chat !`);
  }
}

// ---------- Lobby (en ligne) ----------
$('btnCopy').onclick = () => {
  const code = $('lobbyCode').textContent;
  navigator.clipboard?.writeText(code).then(() => toast('📋 Code copié !'));
};

$('btnStart').onclick = () => ws.send(JSON.stringify({ type: 'start_game' }));

$('btnLeaveLobby').onclick = () => location.reload();

// ---------- WebSocket (mode en ligne) ----------
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
      $('chatBox').classList.remove('hidden');
      $('controlsLabel').innerHTML = '🎮 Déplace-toi avec les <b>flèches</b> ou <b>ZQSD / WASD</b> — le chat 👑 doit attraper tout le monde !';
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

// ---------- Lobby helpers ----------
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
  if (localMode) {
    const it = players.get(itId);
    if (itId === myId) {
      badge.textContent = `😱 ${it.name} : TU ES LE CHAT !`;
    } else {
      badge.textContent = `😱 ${it ? it.name : '???'} est le chat`;
    }
    badge.className = 'badge it';
  } else if (itId === myId) {
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
    const isMe = localMode ? (id === myId || id === localP2Id) : (id === myId);
    chip.className = 'score-chip' + (isMe ? ' me' : '');
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

// ---------- Chat (en ligne uniquement) ----------
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
// Joueur 1 (en ligne ou local) : ZQSD / WASD
// Joueur 2 (local uniquement)    : Flèches
const SPEED = 6;
const P1_KEYS = { z: [0, -1], q: [-1, 0], s: [0, 1], d: [1, 0], w: [0, -1], a: [-1, 0] };
const P2_KEYS = { arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0] };

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (P1_KEYS[k] || P2_KEYS[k]) e.preventDefault();
  keys[k] = true;
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function computeMove(keyMap) {
  let dx = 0, dy = 0;
  Object.entries(keyMap).forEach(([k, [mx, my]]) => {
    if (keys[k]) { dx += mx * SPEED; dy += my * SPEED; }
  });
  return [dx, dy];
}

function clampPos(p) {
  p.x = Math.max(30, Math.min(canvas.width - 30, p.x));
  p.y = Math.max(30, Math.min(canvas.height - 30, p.y));
}

// ---------- Boucle de jeu ----------
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

function gameLoop() {
  if (localMode) {
    // Joueur 1 local
    const p1 = players.get('local-p1');
    if (p1) {
      const [dx, dy] = computeMove(P1_KEYS);
      if (dx || dy) { p1.x += dx; p1.y += dy; clampPos(p1); }
    }
    // Joueur 2 local
    const p2 = players.get('local-p2');
    if (p2) {
      const [dx, dy] = computeMove(P2_KEYS);
      if (dx || dy) { p2.x += dx; p2.y += dy; clampPos(p2); }
    }
    checkLocalTag();
  } else {
    // Mode en ligne : un seul joueur contrôlé par ce client
    const me = players.get(myId);
    if (me) {
      const [dx, dy] = computeMove(P1_KEYS);
      if (dx || dy) {
        me.x += dx; me.y += dy;
        clampPos(me);
        ws.send(JSON.stringify({ type: 'move', x: me.x, y: me.y }));
      }
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
    const isMe = localMode ? (id === myId || id === localP2Id) : (id === myId);
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
    const label = localMode ? p.name : (p.name + (isMe ? ' (toi)' : ''));
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

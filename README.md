# 🏃 Tag Arena

Jeu de **tag multijoueur en ligne** — crée un salon, partage le code à tes amis et jouez ensemble en temps réel !

![Tag Arena](https://img.shields.io/badge/multiplayer-realtime-8b5cf6) ![Node](https://img.shields.io/badge/node-%3E%3D18-22c55e) ![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Fonctionnalités

- 🌐 **Multijoueur temps réel** (WebSocket)
- 🎮 **Salons privés** avec code à 6 caractères
- 😱 Un joueur est le **chat** (👑) et doit attraper les autres
- 🏃 Les autres doivent **fuir** — touché = tu deviens le chat
- ⏱ **Manches de 90 secondes** avec scores en direct
- 💬 **Chat en direct** intégré
- 🎨 Interface moderne néon avec personnages animés

## 🚀 Installation

```bash
# Cloner le repo
git clone https://github.com/bittone27-prog/tag-arena.git
cd tag-arena

# Installer les dépendances
npm install

# Lancer le serveur
npm start
```

Puis ouvre **http://localhost:3000** dans ton navigateur.

## 🌍 Jouer avec ses amis (même réseau)

Trouve ton IP locale :

- **Windows** : `ipconfig` → adresse IPv4
- **Mac/Linux** : `ip addr` ou `ifconfig`

Tes amis ouvrent `http://TON_IP:3000` (ex: `http://192.168.1.42:3000`).

## 🌐 Jouer sur Internet (gratuit)

Déploie facilement sur [Render](https://render.com) ou [Railway](https://railway.app) :

1. Push ce repo sur GitHub
2. Crée un nouveau **Web Service** sur Render
3. Build Command : `npm install`
4. Start Command : `npm start`
5. Render te donne une URL publique — partage-la à tes amis ! 🎉

## 🎮 Contrôles

| Touche | Action |
|--------|--------|
| `Flèches` ou `WASD` / `ZQSD` | Se déplacer |
| `Entrée` | Envoyer un message (chat) |

## 📁 Structure

```
tag-arena/
├── server.js          # Serveur Node.js + WebSocket
├── package.json
└── public/
    ├── index.html     # Interface
    ├── style.css      # Design néon
    └── game.js        # Logique client + rendu canvas
```

## 📜 Licence

MIT — fais-en ce que tu veux ! 😊

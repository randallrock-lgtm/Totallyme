# Zombie Survivor Online

Internet multiplayer starter for the Zombie Survivor HTML game.

## Files

- `public/index.html` — browser game client
- `server.js` — Node.js + Socket.IO multiplayer server
- `package.json` — server dependencies

## Local test

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser tabs and use Create Room / Join Room.

## Online hosting

Deploy this project to a Node.js host such as Render. The server listens on the host-provided `PORT`.

This is a multiplayer foundation. Your full existing Zombie Survivor game systems (custom sprites, upgrades, bosses, Verity, etc.) can be merged into the client/server architecture afterward.

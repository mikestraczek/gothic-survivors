// Schlanker Relay-Server für das Lobby-Koop.
// Host erstellt eine Lobby (Code), ein Mitspieler tritt bei. Der Server leitet
// nur Nachrichten weiter — die Spiel-Simulation läuft beim Host.
//   node server/index.js   (Port via PORT, Standard 8080)
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const wss = new WebSocketServer({ port: PORT });

const rooms = new Map(); // code -> { host, guest }

function code4() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;

  ws.on('message', (buf) => {
    let m;
    try {
      m = JSON.parse(buf.toString());
    } catch {
      return;
    }

    if (m.t === 'create') {
      let code = code4();
      while (rooms.has(code)) code = code4();
      rooms.set(code, { host: ws, guest: null });
      ws.room = code;
      ws.role = 'host';
      send(ws, { t: 'created', code });
    } else if (m.t === 'join') {
      const room = rooms.get((m.code || '').toUpperCase());
      if (!room) return send(ws, { t: 'error', msg: 'Lobby nicht gefunden' });
      if (room.guest) return send(ws, { t: 'error', msg: 'Lobby ist voll' });
      room.guest = ws;
      ws.room = (m.code || '').toUpperCase();
      ws.role = 'guest';
      send(ws, { t: 'joined', code: ws.room });
      send(room.host, { t: 'peer-joined' });
    } else if (m.t === 'msg') {
      const room = rooms.get(ws.room);
      if (!room) return;
      const other = ws.role === 'host' ? room.guest : room.host;
      send(other, { t: 'msg', data: m.data });
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.room);
    if (!room) return;
    const other = ws.role === 'host' ? room.guest : room.host;
    send(other, { t: 'peer-left' });
    rooms.delete(ws.room);
  });
});

console.log(`Gothic Survivors Relay-Server läuft auf ws://localhost:${PORT}`);

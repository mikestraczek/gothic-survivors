// Vereinheitlichter Server für Gothic Survivors (ideal für Coolify/Docker):
//   1) liefert das gebaute Spiel aus (dist/)
//   2) Koop-WebSocket-Relay auf demselben Port unter /ws
//   3) Leaderboard-API (/api/scores) mit optionaler Postgres-Datenbank
// Ohne DATABASE_URL läuft alles bis auf den persistenten Leaderboard-Speicher.
//   PORT (Standard 3000) · DATABASE_URL (Postgres) · PGSSL=require (falls externe DB mit SSL)
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

// ---------------------------------------------------- Datenbank (optional)
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
  });
  const initDb = (tries = 0) => {
    pool
      .query(`CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        time INTEGER NOT NULL,
        kills INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        gold INTEGER NOT NULL DEFAULT 0,
        map TEXT,
        coop BOOLEAN DEFAULT false,
        win BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )`)
      .then(() => console.log('Postgres verbunden — Leaderboard aktiv.'))
      .catch((e) => {
        console.error('DB-Init fehlgeschlagen:', e.message);
        if (tries < 5) setTimeout(() => initDb(tries + 1), 3000); // DB startet evtl. später
      });
  };
  initDb();
} else {
  console.warn('Kein DATABASE_URL — Leaderboard bleibt lokal (kein serverseitiger Speicher).');
}

// ---------------------------------------------------- HTTP + API
const app = express();
app.use(express.json({ limit: '8kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: !!pool }));

app.get('/api/scores', async (req, res) => {
  if (!pool) return res.json([]);
  const sort = req.query.sort === 'kills' ? 'kills' : 'time';
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  try {
    const { rows } = await pool.query(
      `SELECT name, time, kills, level, gold, map, coop, win FROM scores ORDER BY ${sort} DESC, time DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json([]);
  }
});

app.post('/api/scores', async (req, res) => {
  if (!pool) return res.json({ ok: false, stored: false }); // ohne DB: still annehmen, nicht speichern
  const b = req.body || {};
  const num = (v, d = 0) => (Number.isFinite(+v) ? Math.max(0, Math.min(1e9, Math.floor(+v))) : d);
  const name = String(b.name || 'Anonym').slice(0, 24) || 'Anonym';
  try {
    await pool.query(
      `INSERT INTO scores (name, time, kills, level, gold, map, coop, win) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [name, num(b.time), num(b.kills), num(b.level, 1), num(b.gold), String(b.map || '').slice(0, 24), !!b.coop, !!b.win]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ---------------------------------------------------- Statisches Spiel (dist/)
app.use(express.static(DIST));
app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')));

// ---------------------------------------------------- WebSocket-Koop-Relay (/ws)
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map(); // id -> { host, guest, map, diff }
function id4() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
function openLobbies() {
  const list = [];
  for (const [id, r] of rooms) if (r.host && !r.guest) list.push({ id, map: r.map, diff: r.diff });
  return list;
}
function broadcastLobbies() {
  const msg = JSON.stringify({ t: 'lobbies', list: openLobbies() });
  for (const client of wss.clients) if (client.readyState === client.OPEN && !client.room) client.send(msg);
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;
  ws.on('message', (buf) => {
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }
    if (m.t === 'create') {
      let id = id4();
      while (rooms.has(id)) id = id4();
      rooms.set(id, { host: ws, guest: null, map: m.map || 'valley', diff: m.diff || 'normal' });
      ws.room = id; ws.role = 'host';
      send(ws, { t: 'created', code: id });
      broadcastLobbies();
    } else if (m.t === 'list') {
      send(ws, { t: 'lobbies', list: openLobbies() });
    } else if (m.t === 'update') {
      const room = rooms.get(ws.room);
      if (room && ws.role === 'host') { if (m.map) room.map = m.map; if (m.diff) room.diff = m.diff; broadcastLobbies(); }
    } else if (m.t === 'join') {
      const id = (m.id || m.code || '').toUpperCase();
      const room = rooms.get(id);
      if (!room) return send(ws, { t: 'error', msg: 'Lobby nicht mehr verfügbar' });
      if (room.guest) return send(ws, { t: 'error', msg: 'Lobby ist bereits voll' });
      room.guest = ws; ws.room = id; ws.role = 'guest';
      send(ws, { t: 'joined', code: id, map: room.map, diff: room.diff });
      send(room.host, { t: 'peer-joined' });
      broadcastLobbies();
    } else if (m.t === 'msg') {
      const room = rooms.get(ws.room);
      if (!room) return;
      send(ws.role === 'host' ? room.guest : room.host, { t: 'msg', data: m.data });
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.room);
    if (room) {
      send(ws.role === 'host' ? room.guest : room.host, { t: 'peer-left' });
      if (ws.role === 'guest' && room.host && room.host.readyState === room.host.OPEN) room.guest = null;
      else rooms.delete(ws.room);
    }
    broadcastLobbies();
  });
});

server.listen(PORT, () => console.log(`Gothic Survivors läuft auf Port ${PORT} (HTTP + /ws + /api)`));

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
      .then(async () => {
        // Einmaliger Wipe (07.07.2026): kompletter Spiel-Reset — alte Scores raus
        const WIPE_TAG = '2026-07-08'; // Reset #2 (Anti-Cheat-Neustart)
        await pool.query('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');
        // Run-Tokens: Server-Startzeit je Run — macht die Bestenlisten-ZEIT fälschungssicher
        await pool.query('CREATE TABLE IF NOT EXISTS run_tokens (token TEXT PRIMARY KEY, started_at TIMESTAMPTZ DEFAULT now())');
        await pool.query(`DELETE FROM run_tokens WHERE started_at < now() - interval '24 hours'`);
        const { rows } = await pool.query(`SELECT value FROM kv WHERE key = 'wipe'`);
        if (!rows.length || rows[0].value !== WIPE_TAG) {
          await pool.query('DELETE FROM scores');
          await pool.query(`INSERT INTO kv (key, value) VALUES ('wipe', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [WIPE_TAG]);
          console.log('Leaderboard-Wipe ausgeführt:', WIPE_TAG);
        }
        console.log('Postgres verbunden — Leaderboard aktiv.');
      })
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

app.get('/api/health', async (req, res) => {
  // db: true nur, wenn die Datenbank wirklich antwortet — nicht nur, wenn DATABASE_URL gesetzt ist
  let db = false;
  let dbError = null;
  if (pool) {
    try {
      await pool.query('SELECT 1');
      db = true;
    } catch (e) {
      dbError = e.message;
    }
  }
  res.json({ ok: true, db, ...(dbError ? { dbError } : {}) });
});

app.get('/api/scores', async (req, res) => {
  if (!pool) return res.json([]);
  const sort = req.query.sort === 'kills' ? 'kills' : 'time';
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  try {
    const { rows } = await pool.query(
      `SELECT name, time, kills, level, gold, map, coop, win, ROUND(EXTRACT(EPOCH FROM created_at) * 1000) AS ts FROM scores ORDER BY ${sort} DESC, time DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json([]);
  }
});

// Run-Tokens: der Client meldet den Run-START; beim Submit rechnet der SERVER die
// verstrichene Zeit aus. Gemeldete Zeit > Serverzeit ist damit unmöglich — ohne dass
// je ein legitimer Run abgelehnt wird (Werte werden GEKLEMMT, nicht verworfen).
import { randomUUID } from 'node:crypto';
const memTokens = new Map(); // Fallback ohne DB: token -> startedAt (ms)
setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [t, at] of memTokens) if (at < cutoff) memTokens.delete(t);
}, 3600 * 1000).unref();

const runStartLimit = new Map(); // ip -> [timestamps]
app.post('/api/run-start', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
  const now = Date.now();
  const recent = (runStartLimit.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 12) return res.status(429).json({ ok: false });
  recent.push(now);
  runStartLimit.set(ip, recent);
  const token = randomUUID();
  memTokens.set(token, now);
  if (pool) {
    try { await pool.query('INSERT INTO run_tokens (token) VALUES ($1)', [token]); } catch (e) { /* memTokens reicht */ }
  }
  res.json({ token });
});

async function tokenAgeSeconds(token) {
  if (!token || typeof token !== 'string' || token.length > 64) return null;
  if (memTokens.has(token)) return (Date.now() - memTokens.get(token)) / 1000;
  if (pool) {
    try {
      const { rows } = await pool.query('SELECT EXTRACT(EPOCH FROM (now() - started_at)) AS age FROM run_tokens WHERE token = $1', [token]);
      if (rows.length) return Number(rows[0].age);
    } catch (e) { /* fällt unten auf null */ }
  }
  return null;
}

// In-Memory-Rate-Limit: max. 4 Score-Submits pro 10s je IP.
// WICHTIG: nicht 1/10s — beim Koop-Ende posten Host UND Gast in derselben Sekunde,
// und hinter gemeinsamem NAT (gleiche Wohnung) teilen sie sich die IP.
const lastSubmit = new Map(); // ip -> [timestamps]
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [ip, arr] of lastSubmit) {
    const keep = arr.filter((t) => t > cutoff);
    if (keep.length) lastSubmit.set(ip, keep);
    else lastSubmit.delete(ip);
  }
}, 60000).unref();

app.post('/api/scores', async (req, res) => {
  if (!pool) return res.json({ ok: false, stored: false }); // ohne DB: still annehmen, nicht speichern
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
  const now = Date.now();
  const recent = (lastSubmit.get(ip) || []).filter((t) => now - t < 10000);
  if (recent.length >= 4) return res.status(429).json({ ok: false });
  const b = req.body || {};
  const num = (v, d = 0) => (Number.isFinite(+v) ? Math.max(0, Math.min(1e9, Math.floor(+v))) : d);
  const name = String(b.name || 'Anonym').slice(0, 24) || 'Anonym';
  let time = num(b.time);
  let kills = num(b.kills);
  let level = num(b.level, 1);
  // Anti-Cheat OHNE Ablehnung: der Server kennt die echte Run-Dauer über das Token
  // und KLEMMT absurde Werte, statt Runs zu verwerfen. Ohne gültiges Token (nur per
  // Hand-POST möglich — der Client holt es automatisch) wird nicht gespeichert.
  const age = await tokenAgeSeconds(b.rt);
  if (age == null) return res.status(400).json({ ok: false, reason: 'token' });
  time = Math.min(time, Math.round(age) + 90); // Zeit kann nicht schneller vergehen als beim Server
  kills = Math.min(kills, (time + 60) * 100); // >100 Kills/s klemmen (nur Konsolen-Unsinn)
  level = Math.min(level, 999);
  recent.push(now);
  lastSubmit.set(ip, recent);
  try {
    await pool.query(
      `INSERT INTO scores (name, time, kills, level, gold, map, coop, win) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [name, time, kills, level, num(b.gold), String(b.map || '').slice(0, 24), !!b.coop, !!b.win]
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

const rooms = new Map(); // id -> { host, guest, spectators[], solo, name, hero, map, diff, started }
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
  for (const [id, r] of rooms) {
    if (!r.host) continue;
    if (r.solo) list.push({ id, kind: 'solo', map: r.map, diff: r.diff, name: r.name, hero: r.hero, t: Math.round((Date.now() - r.started) / 1000), specs: r.spectators.length });
    else if (!r.guest) list.push({ id, kind: 'coop', map: r.map, diff: r.diff });
  }
  return list;
}
function specCount(room) {
  room.spectators = room.spectators.filter((w) => w.readyState === w.OPEN);
  return room.spectators.length;
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
      rooms.set(id, { host: ws, guest: null, spectators: [], map: m.map || 'valley', diff: m.diff || 'normal' });
      ws.room = id; ws.role = 'host';
      send(ws, { t: 'created', code: id });
      broadcastLobbies();
    } else if (m.t === 'solo') {
      // laufender Solo-Run meldet sich als beobachtbarer Raum an
      let id = id4();
      while (rooms.has(id)) id = id4();
      rooms.set(id, {
        host: ws, guest: null, spectators: [], solo: true, started: Date.now(),
        name: String(m.name || 'Anonym').slice(0, 24), hero: m.hero || 'soldier',
        map: m.map || 'valley', diff: m.diff || 'normal',
      });
      ws.room = id; ws.role = 'host';
      send(ws, { t: 'solo-ok', code: id });
      broadcastLobbies();
    } else if (m.t === 'watch') {
      const room = rooms.get((m.id || '').toUpperCase());
      if (!room || !room.solo) return send(ws, { t: 'error', msg: 'Dieser Run ist nicht mehr verfügbar' });
      room.spectators.push(ws);
      ws.room = (m.id || '').toUpperCase(); ws.role = 'spec';
      send(ws, { t: 'watch-ok', code: ws.room, map: room.map, diff: room.diff, hero: room.hero, name: room.name });
      send(room.host, { t: 'watchers', n: specCount(room) });
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
      if (ws.role === 'spec') return; // Zuschauer senden nichts weiter
      if (ws.role === 'host') {
        const out = JSON.stringify({ t: 'msg', data: m.data });
        if (room.guest && room.guest.readyState === room.guest.OPEN) room.guest.send(out);
        for (const w of room.spectators) if (w.readyState === w.OPEN) w.send(out);
      } else {
        send(room.host, { t: 'msg', data: m.data });
      }
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.room);
    if (room) {
      if (ws.role === 'spec') {
        room.spectators = room.spectators.filter((w) => w !== ws);
        send(room.host, { t: 'watchers', n: specCount(room) });
      } else if (ws.role === 'guest' && room.host && room.host.readyState === room.host.OPEN) {
        send(room.host, { t: 'peer-left' });
        room.guest = null;
      } else {
        // Host weg -> Gast und alle Zuschauer informieren, Raum schließen
        send(room.guest, { t: 'peer-left' });
        for (const w of room.spectators) send(w, { t: 'peer-left' });
        rooms.delete(ws.room);
      }
    }
    broadcastLobbies();
  });
});

server.listen(PORT, () => console.log(`Gothic Survivors läuft auf Port ${PORT} (HTTP + /ws + /api)`));

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
        // Konten: Name + Passwort (scrypt) — kein E-Mail-Zwang. Gold/Upgrades leben NUR hier.
        await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          pass_hash TEXT NOT NULL,
          gold INTEGER NOT NULL DEFAULT 0,
          upgrades JSONB NOT NULL DEFAULT '{}',
          achievements JSONB NOT NULL DEFAULT '{}',
          stats JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT now()
        )`);
        await pool.query('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT now())');
        await pool.query('ALTER TABLE scores ADD COLUMN IF NOT EXISTS token TEXT'); // 1 Bestenlisten-Zeile je Run-Token
        await pool.query(`ALTER TABLE run_tokens ADD COLUMN IF NOT EXISTS applied JSONB DEFAULT '{}'`); // Idempotenz je Run
        await pool.query(`ALTER TABLE run_tokens ADD COLUMN IF NOT EXISTS att JSONB DEFAULT '{}'`); // Heartbeat-Attestierung
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

// --- Gameplay-Attestierung: Kills zählen für die Bestenliste NUR, solange während des Runs
// periodische Heartbeats fließen — pro Intervall begrenzt. „Token holen, warten, Max posten"
// bringt damit fast nichts; ein Fake-Score braucht einen plausiblen Strom über die echte Dauer.
// MAX_KPS bewusst WEIT über der realen Endgame-Kill-Rate (~150/s selbst bei tiefem Endlos
// mit Splitter-Wellen + Nova-Bursts): kein legitimer Spieler wird je gekappt. Die eigentliche
// Bot-Abwehr ist strukturell (Kills zählen nur, solange der Heartbeat-Strom über die ECHTE
// Laufzeit fließt), NICHT die Rate — daher darf sie großzügig sein.
const MAX_KPS = 500; // pro-Heartbeat-Rate (Sicherheitsfaktor ~3x über realem Maximum)
const MAX_INTERVAL = 45; // max. anrechenbare Sekunden pro Heartbeat (verträgt ausgefallene Beats)
const FINISH_GRACE = 8000; // Kill-Kulanz am Run-Ende (letzte ~15s zwischen letztem Beat und Tod)
const memAtt = new Map(); // token -> { t, kills, level }
async function getAtt(token) {
  if (memAtt.has(token)) return memAtt.get(token);
  if (pool) {
    try { const { rows } = await pool.query('SELECT att FROM run_tokens WHERE token = $1', [token]); if (rows.length && rows[0].att) return rows[0].att; } catch (e) { /* leer */ }
  }
  return { t: 0, kills: 0, level: 0 };
}
async function setAtt(token, obj) {
  memAtt.set(token, obj);
  if (pool) { try { await pool.query('UPDATE run_tokens SET att = $2 WHERE token = $1', [token, JSON.stringify(obj)]); } catch (e) { /* mem reicht */ } }
}
const hbLimit = new Map(); // token -> [timestamps]
app.post('/api/heartbeat', async (req, res) => {
  const acc = await getAccountBySession(req);
  if (!acc) return res.json({ ok: false });
  const b = req.body || {};
  const tok = String(b.rt || '').slice(0, 64);
  const age = await tokenAgeSeconds(tok);
  if (age == null) return res.json({ ok: false });
  const now = Date.now();
  const rl = (hbLimit.get(tok) || []).filter((t) => now - t < 60000);
  if (rl.length >= 20) return res.json({ ok: true }); // Flut -> ignorieren (nicht anrechnen)
  rl.push(now); hbLimit.set(tok, rl);
  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
  const t = Math.min(num(b.t), Math.round(age) + 45);
  const att = await getAtt(tok);
  const dt = Math.max(0, t - (att.t || 0));
  const allow = Math.min(dt, MAX_INTERVAL) * MAX_KPS; // pro Heartbeat begrenztes Kill-Delta
  const attKills = Math.max(att.kills || 0, Math.min(num(b.kills), (att.kills || 0) + allow));
  const attLevel = Math.max(att.level || 0, Math.min(num(b.level), (att.level || 0) + dt + 5));
  await setAtt(tok, { t: Math.max(t, att.t || 0), kills: attKills, level: attLevel });
  res.json({ ok: true });
});

// Was für DIESEN Token bereits aufs Konto angerechnet wurde (Idempotenz gegen Erz-/Stat-Farming)
const memApplied = new Map(); // token -> {credit,kills,boss,evolves,win,map}
async function getApplied(token) {
  if (memApplied.has(token)) return memApplied.get(token);
  if (pool) {
    try {
      const { rows } = await pool.query('SELECT applied FROM run_tokens WHERE token = $1', [token]);
      if (rows.length && rows[0].applied) return rows[0].applied;
    } catch (e) { /* leer */ }
  }
  return { credit: 0, kills: 0, boss: 0, evolves: 0, win: 0, map: '' };
}
async function setApplied(token, obj) {
  memApplied.set(token, obj);
  if (pool) {
    try { await pool.query('UPDATE run_tokens SET applied = $2 WHERE token = $1', [token, JSON.stringify(obj)]); } catch (e) { /* memApplied reicht */ }
  }
}

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

// ------------------------------------------------ Konten (Name + Passwort, ohne E-Mail)
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
const hashPass = (pass) => {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(String(pass), salt, 64).toString('hex');
};
const checkPass = (pass, stored) => {
  try {
    const [salt, h] = String(stored).split(':');
    return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(String(pass), salt, 64));
  } catch (e) { return false; }
};
// Dev-Fallback ohne DB: Konten im Speicher (lokales Testen)
const memAccounts = new Map(); // nameLower -> account
const memSessions = new Map(); // token -> nameLower
let memId = 1;

const profileOf = (a) => ({ name: a.name, gold: a.gold, upgrades: a.upgrades || {}, achievements: a.achievements || {}, stats: a.stats || {} });

async function getAccountBySession(req) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : (req.body && req.body.sid) || null;
  if (!token || typeof token !== 'string' || token.length > 64) return null;
  if (memSessions.has(token)) return memAccounts.get(memSessions.get(token)) || null;
  if (pool) {
    try {
      const { rows } = await pool.query(
        'SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token = $1', [token]);
      if (rows.length) return rows[0];
    } catch (e) { /* unten null */ }
  }
  return null;
}
async function saveAccount(a) {
  if (a._mem) return; // Memory-Konten sind Referenzen
  if (pool) {
    await pool.query('UPDATE accounts SET gold = $1, upgrades = $2, achievements = $3, stats = $4 WHERE id = $5',
      [a.gold, JSON.stringify(a.upgrades || {}), JSON.stringify(a.achievements || {}), JSON.stringify(a.stats || {}), a.id]);
  }
}
const authLimit = new Map(); // ip -> [timestamps] (Brute-Force-Bremse)
function authLimited(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
  const now = Date.now();
  const recent = (authLimit.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 15) return true;
  recent.push(now);
  authLimit.set(ip, recent);
  return false;
}
const validName = (n) => typeof n === 'string' && /^[\p{L}\p{N} _.\-]{3,16}$/u.test(n.trim());

app.post('/api/register', async (req, res) => {
  if (authLimited(req)) return res.status(429).json({ error: 'Zu viele Versuche — kurz warten' });
  const name = String((req.body && req.body.name) || '').trim();
  const pass = String((req.body && req.body.pass) || '');
  if (!validName(name)) return res.status(400).json({ error: 'Name: 3–16 Zeichen (Buchstaben/Zahlen)' });
  if (pass.length < 4) return res.status(400).json({ error: 'Passwort: mindestens 4 Zeichen' });
  const key = name.toLowerCase();
  const token = randomUUID();
  if (pool) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO accounts (name, pass_hash) VALUES ($1, $2) RETURNING *', [name, hashPass(pass)]);
      await pool.query('INSERT INTO sessions (token, account_id) VALUES ($1, $2)', [token, rows[0].id]);
      return res.json({ token, profile: profileOf(rows[0]) });
    } catch (e) {
      if (String(e.message).includes('duplicate') || e.code === '23505') return res.status(409).json({ error: 'Name ist bereits vergeben' });
      return res.status(500).json({ error: 'Serverfehler' });
    }
  }
  // Memory-Fallback (Dev ohne DB)
  if (memAccounts.has(key)) return res.status(409).json({ error: 'Name ist bereits vergeben' });
  const acc = { _mem: true, id: memId++, name, pass_hash: hashPass(pass), gold: 0, upgrades: {}, achievements: {}, stats: {} };
  memAccounts.set(key, acc);
  memSessions.set(token, key);
  res.json({ token, profile: profileOf(acc) });
});

app.post('/api/login', async (req, res) => {
  if (authLimited(req)) return res.status(429).json({ error: 'Zu viele Versuche — kurz warten' });
  const name = String((req.body && req.body.name) || '').trim();
  const pass = String((req.body && req.body.pass) || '');
  const key = name.toLowerCase();
  let acc = memAccounts.get(key) || null;
  if (!acc && pool) {
    try {
      const { rows } = await pool.query('SELECT * FROM accounts WHERE lower(name) = $1', [key]);
      if (rows.length) acc = rows[0];
    } catch (e) { /* unten */ }
  }
  if (!acc || !checkPass(pass, acc.pass_hash)) return res.status(401).json({ error: 'Name oder Passwort falsch' });
  const token = randomUUID();
  if (acc._mem) memSessions.set(token, key);
  else if (pool) { try { await pool.query('INSERT INTO sessions (token, account_id) VALUES ($1, $2)', [token, acc.id]); } catch (e) { return res.status(500).json({ error: 'Serverfehler' }); } }
  res.json({ token, profile: profileOf(acc) });
});

app.get('/api/me', async (req, res) => {
  const acc = await getAccountBySession(req);
  if (!acc) return res.status(401).json({ error: 'Nicht angemeldet' });
  res.json({ profile: profileOf(acc) });
});

// Schmiede-Kauf: Preise + Gold leben auf dem SERVER — Konsolen-Cheats laufen ins Leere
const SHOP = { hp: [40, 45, 5], spd: [50, 50, 5], might: [60, 55, 5], armor: [50, 50, 5], cd: [70, 65, 4], pickup: [40, 40, 4], regen: [60, 55, 4], greed: [80, 75, 3], reroll: [90, 80, 3] };
const shopCost = (id, l) => Math.round((SHOP[id][0] + l * SHOP[id][1]) * 2.5 * 1.25 ** l);
app.post('/api/shop/buy', async (req, res) => {
  const acc = await getAccountBySession(req);
  if (!acc) return res.status(401).json({ error: 'Nicht angemeldet' });
  const id = String((req.body && req.body.id) || '');
  if (!SHOP[id]) return res.status(400).json({ error: 'Unbekanntes Upgrade' });
  const upgrades = acc.upgrades || {};
  const l = upgrades[id] || 0;
  if (l >= SHOP[id][2]) return res.status(400).json({ error: 'Bereits Maximalstufe' });
  const cost = shopCost(id, l);
  if ((acc.gold || 0) < cost) return res.status(400).json({ error: 'Nicht genug Erz' });
  acc.gold -= cost;
  upgrades[id] = l + 1;
  acc.upgrades = upgrades;
  try { await saveAccount(acc); } catch (e) { return res.status(500).json({ error: 'Serverfehler' }); }
  res.json({ gold: acc.gold, upgrades: acc.upgrades });
});

// Run-Ende: Erz-Gutschrift GEDECKELT über die echte (Token-)Laufzeit; Erfolge einmalig
// Erfolge werden SERVER-SEITIG aus den (server-getrackten) Stats abgeleitet — der
// vom Client gemeldete achievements-Array wird komplett IGNORIERT. Checks 1:1 aus Meta.js.
const SERVER_ACH = [
  { id: 'first_win', check: (s) => (s.wins || 0) >= 1 },
  { id: 'kills_500', check: (s) => (s.totalKills || 0) >= 500 },
  { id: 'survive_10', check: (s) => (s.bestTime || 0) >= 600 },
  { id: 'level_20', check: (s) => (s.bestLevel || 0) >= 20 },
  { id: 'evolve', check: (s) => (s.evolves || 0) >= 1 },
  { id: 'boss_10', check: (s) => (s.bossKills || 0) >= 10 },
  { id: 'gold_1000', check: (s) => (s.totalGold || 0) >= 1000 },
  { id: 'wins_3', check: (s) => (s.wins || 0) >= 3 },
  { id: 'win_corridor', check: (s) => ((s.mapWins && s.mapWins.corridor) || 0) >= 1, reward: 150 },
  { id: 'win_cyber', check: (s) => ((s.mapWins && s.mapWins.cyber) || 0) >= 1, reward: 150 },
  { id: 'win_ww2', check: (s) => ((s.mapWins && s.mapWins.ww2) || 0) >= 1, reward: 150 },
];
app.post('/api/run-finish', async (req, res) => {
  const acc = await getAccountBySession(req);
  if (!acc) return res.status(401).json({ error: 'Nicht angemeldet' });
  const b = req.body || {};
  const age = await tokenAgeSeconds(b.rt);
  if (age == null) return res.status(400).json({ error: 'Kein gültiger Run' });
  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
  const tok = String(b.rt).slice(0, 64);
  // Attestierte Obergrenze: nur was Heartbeats während des Runs belegt haben (+1 Intervall Gnade)
  const att = await getAtt(tok);
  const attKillCap = (att.kills || 0) + FINISH_GRACE; // nur die letzte Lücke abdecken
  const attLevelCap = (att.level || 0) + 5;
  // Werte gegen echte Laufzeit UND attestierten Verlauf klemmen — nie ablehnen, nur kappen
  const time = Math.min(num(b.time), Math.round(age) + 90);
  const kills = Math.min(num(b.kills), (time + 60) * MAX_KPS, attKillCap); // Zeitklemme = MAX_KPS (nicht 100)
  const level = Math.min(num(b.level), 999, attLevelCap);
  const credit = Math.min(num(b.goldEarned), Math.ceil(age / 60) * 25 + 25);
  const boss = Math.min(num(b.bossKills), 200);
  const evolves = Math.min(num(b.evolves), 8);
  const map = typeof b.map === 'string' ? b.map.slice(0, 24) : '';
  const winNow = b.win ? 1 : 0;
  // IDEMPOTENZ: ein Token (mehrfach nutzbar für Endlos: Sieg + späterer Tod) darf Erz/Stats
  // nur EINMAL anrechnen. Wir buchen jeweils nur das Delta zum bereits Angerechneten.
  const prev = await getApplied(tok);
  const dCredit = Math.max(0, credit - (prev.credit || 0));
  const dKills = Math.max(0, kills - (prev.kills || 0));
  const dBoss = Math.max(0, boss - (prev.boss || 0));
  const dEvo = Math.max(0, evolves - (prev.evolves || 0));
  const firstWin = winNow && !prev.win;
  acc.gold = (acc.gold || 0) + dCredit;
  const st = acc.stats || {};
  if (firstWin) {
    st.wins = (st.wins || 0) + 1;
    if (map) { st.mapWins = st.mapWins || {}; st.mapWins[map] = (st.mapWins[map] || 0) + 1; }
  }
  st.totalKills = (st.totalKills || 0) + dKills;
  st.bestTime = Math.max(st.bestTime || 0, time);
  st.bestLevel = Math.max(st.bestLevel || 0, level);
  st.bossKills = (st.bossKills || 0) + dBoss;
  st.evolves = (st.evolves || 0) + dEvo;
  st.totalGold = (st.totalGold || 0) + dCredit;
  acc.stats = st;
  const everWon = !!(prev.win || winNow);
  await setApplied(tok, { credit: Math.max(credit, prev.credit || 0), kills: Math.max(kills, prev.kills || 0), boss: Math.max(boss, prev.boss || 0), evolves: Math.max(evolves, prev.evolves || 0), win: everWon ? 1 : 0, map: map || prev.map || '' });
  // Erfolge NUR aus server-getrackten Stats — Client-Array wird ignoriert (kein Frei-Freischalten)
  const ach = acc.achievements || {};
  for (const a2 of SERVER_ACH) {
    if (!ach[a2.id] && a2.check(st)) {
      ach[a2.id] = true;
      if (a2.reward) acc.gold += a2.reward;
    }
  }
  acc.achievements = ach;
  try { await saveAccount(acc); } catch (e) { return res.status(500).json({ error: 'Serverfehler' }); }
  // Bestenliste SERVER-SEITIG schreiben (geklemmt, Name vom Konto), höchstens 1 Zeile je Token
  if (pool && b.board) {
    const mate = typeof b.mate === 'string' && b.mate.trim() ? ' & ' + b.mate.trim().slice(0, 16) : '';
    const name = (acc.name + mate).slice(0, 40);
    const bKills = Math.min(num(b.boardKills != null ? b.boardKills : kills), (time + 60) * MAX_KPS, attKillCap);
    const bLevel = Math.min(num(b.boardLevel != null ? b.boardLevel : level), 999, attLevelCap);
    try {
      await pool.query('DELETE FROM scores WHERE token = $1', [tok]);
      await pool.query(
        `INSERT INTO scores (name, time, kills, level, gold, map, coop, win, token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [name, time, bKills, bLevel, credit, map, !!b.coop, everWon, tok]
      );
    } catch (e) { /* Leaderboard best effort */ }
  }
  res.json({ gold: acc.gold, achievements: acc.achievements, stats: acc.stats });
});

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

// POST /api/scores wurde entfernt: Bestenlisten-Einträge entstehen ausschließlich
// server-seitig in /api/run-finish (geklemmte Werte, Konto-Name). Ein direkter
// Score-Upload ist damit nicht mehr möglich.

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

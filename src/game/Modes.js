import { MAP_LIST } from './World.js';
import { HERO_KEYS } from './Heroes.js';

// Spielmodi-Register. Jeder Modus ist NUR Konfiguration — RunControl/Coop lesen die Flags
// aus und richten den Lauf entsprechend ein. So bleibt die Modus-Logik an einer Stelle.
//
// ctx: in welchen Menüs der Modus wählbar ist — 'solo' (Karten-Screen) und/oder 'lobby' (Online).
// Flags: endless (Dauer-Druck, kein Sieg) · bossRush (Boss-Kette) · hardcore (kein Speichern, zäher) ·
//        daily (fester Seed) · mutators (eigene Modifikatoren) · shrink (Barriere zieht sich zu) ·
//        versus ('race'|'lastStand'|'sabotage', nur Koop) · noRevive · timeLimit (Sek.).

export const MODES = {
  campaign: {
    key: 'campaign', name: 'Kampagne', icon: '⚔️', ctx: ['solo', 'lobby'],
    tag: '3 Phasen + Endboss',
    desc: 'Der klassische Lauf: überlebe drei Phasen, besiege die Anführer und den Endboss.',
  },
  endless: {
    key: 'endless', name: 'Endlos', icon: '♾️', ctx: ['solo', 'lobby'], endless: true,
    tag: 'Überlebe so lange du kannst',
    desc: 'Kein Ende — die Horde wird endlos stärker. Wie lange hältst du durch?',
  },
  bossrush: {
    key: 'bossrush', name: 'Boss-Rausch', icon: '👑', ctx: ['solo'], bossRush: true, noSave: true,
    tag: 'Boss nach Boss, auf Zeit',
    desc: 'Kaum Fußvolk — nur eine Kette immer stärkerer Bosse. Räume alle so schnell wie möglich.',
  },
  hardcore: {
    key: 'hardcore', name: 'Eiserner Modus', icon: '💀', ctx: ['solo'], hardcore: true, noSave: true, enemyMult: 1.25,
    tag: 'Ein Leben, kein Speichern',
    desc: 'Zähere Gegner, kein Fortsetzen. Ein einziger Versuch — nur für Hartgesottene.',
  },
  daily: {
    key: 'daily', name: 'Tages-Challenge', icon: '📅', ctx: ['solo'], daily: true, noSave: true,
    tag: 'Fester Seed & Modifikatoren',
    desc: 'Jeden Tag dieselbe Karte, derselbe Held und dieselben Modifikatoren für alle. Ein Versuch — zeig deinen Platz.',
  },
  mutators: {
    key: 'mutators', name: 'Wahnsinn', icon: '🎲', ctx: ['solo'], mutators: true,
    tag: 'Eigene Modifikatoren',
    desc: 'Stelle deine eigenen Regeln zusammen — je härter der Mix, desto größer die Herausforderung.',
  },
  race: {
    key: 'race', name: 'Score-Wettlauf', icon: '🏁', ctx: ['lobby'], versus: 'race', noRevive: true, endless: true, timeLimit: 480,
    tag: 'Meiste Kills in 8 Minuten',
    desc: 'Gleiche Arena, jeder für sich, kein Wiederbeleben. Wer nach 8 Minuten den höheren Score hat, gewinnt.',
  },
  laststand: {
    key: 'laststand', name: 'Letzter Überlebender', icon: '🩸', ctx: ['solo', 'lobby'], versus: 'lastStand', noRevive: true, shrink: true, endless: true,
    tag: 'Die Barriere zieht sich zu',
    desc: 'Der sichere Bereich schrumpft unaufhaltsam, kein Wiederbeleben. Im Koop gewinnt der letzte Lebende — solo zählt deine Überlebenszeit.',
  },
  sabotage: {
    key: 'sabotage', name: 'Horden-Duell', icon: '😈', ctx: ['lobby'], versus: 'sabotage', noRevive: true, endless: true, sabotage: true, timeLimit: 480,
    tag: 'Hetz dem Gegner Jäger auf',
    desc: 'Kill-Serien laden deinen Horden-Meter — voll geladen schickst du dem Gegner einen Elite-Jäger. Höchster Score nach 8 Minuten gewinnt.',
  },
};

export const MODE_LIST = Object.values(MODES);

// Modi, die in einem bestimmten Menü angeboten werden ('solo' = Karten-Screen, 'lobby' = Online).
export function modesFor(ctx) {
  return MODE_LIST.filter((m) => m.ctx.includes(ctx));
}

export function modeName(key) {
  const m = MODES[key];
  return m ? `${m.icon} ${m.name}` : 'Kampagne';
}

// ------------------------------------------------------------------ Mutatoren
// Jeder Mutator verändert den Lauf über die vorhandenen Stellschrauben (g.enemies.mut / g.player).
export const MUTATORS = {
  swarm: {
    key: 'swarm', name: 'Überzahl', icon: '🐝', desc: 'Fast doppelt so viele Gegner — dafür schwächer.',
    apply(g) { g.enemies.mut.pop *= 1.9; g.enemies.mut.hp *= 0.6; },
  },
  glass: {
    key: 'glass', name: 'Glaskanone', icon: '💥', desc: '+80% Schaden, aber nur die halbe Lebenskraft.',
    apply(g) { g.player.might *= 1.8; g.player.maxHp = Math.max(1, Math.round(g.player.maxHp * 0.5)); g.player.hp = g.player.maxHp; },
  },
  haste: {
    key: 'haste', name: 'Blutrausch', icon: '⚡', desc: 'Gegner sind 30% schneller — und etwas zahlreicher.',
    apply(g) { g.enemies.mut.speed *= 1.3; g.enemies.mut.pop *= 1.2; },
  },
  elite: {
    key: 'elite', name: 'Elite-Plage', icon: '⭐', desc: 'Deutlich mehr Eliten (mehr Truhen!) — dafür alles zäher.',
    apply(g) { g.enemies.mut.elite *= 3; g.enemies.mut.hp *= 1.25; },
  },
};

export const MUTATOR_LIST = Object.values(MUTATORS);

// ------------------------------------------------------------------ Tages-Challenge
// Deterministisch aus dem Datum: gleiche Karte, gleicher Held, gleiche Mutatoren für alle.
function _mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// YYYY-MM-DD des heutigen Tages (lokal)
export function dailyKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dailyConfig(d = new Date()) {
  const key = dailyKey(d);
  const rnd = _mulberry32(_hashStr('gothic-daily-' + key));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const map = pick(MAP_LIST).key;
  const hero = pick(HERO_KEYS);
  // 1–2 Mutatoren des Tages
  const pool = MUTATOR_LIST.map((m) => m.key);
  const muts = [pick(pool)];
  if (rnd() < 0.5) { const b = pick(pool); if (b !== muts[0]) muts.push(b); }
  return { key, map, hero, muts };
}

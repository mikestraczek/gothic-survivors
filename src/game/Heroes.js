import * as THREE from 'three';

// Spielbare Helden: jeder mit Startwaffe, Stat-Twist und Sprite-Tint.
// Alle nutzen den Ritter-Sprite (knight_m) — die Färbung unterscheidet sie im Spiel.
// Freischaltung über Achievements (Meta.js); der Söldner ist immer verfügbar.
export const HEROES = {
  soldier: {
    name: 'Der Söldner', icon: '⚔️', start: 'whirl',
    desc: 'Ausgewogener Kämpfer der alten Garde. Startet mit Klingenwirbel.',
    tint: null,
  },
  hunter: {
    name: 'Die Jägerin', icon: '🏹', start: 'daggers',
    desc: 'Flink und tödlich (+20% Schaden, +10% Tempo), aber zerbrechlich (−25 Leben). Startet mit Schattendolchen.',
    tint: new THREE.Color(0.75, 1.6, 0.95),
    might: 0.2, speed: 1.1, hp: -25,
  },
  templar: {
    name: 'Der Templer', icon: '✝️', start: 'holy',
    desc: 'Zäher Ordenskrieger (+40 Leben, +2 Rüstung, +0,4 Regen), dafür langsamer (−8% Tempo). Startet mit Weihrauch.',
    tint: new THREE.Color(1.7, 1.45, 0.75),
    hp: 40, armor: 2, speed: 0.92, regen: 0.4,
  },
  shadow: {
    name: 'Der Schatten', icon: '🌒', start: 'spear',
    desc: 'Lebt vom Nicht-getroffen-werden: +1 Ausweich-Ladung, +8% Tempo, −15 Leben. Startet mit Knochenspeer.',
    tint: new THREE.Color(1.0, 0.85, 1.9),
    dodge: 1, speed: 1.08, hp: -15,
  },
};

export const HERO_KEYS = Object.keys(HEROES);

// Nach beginRun() + Meta-Boni anwenden (modifiziert die aktuellen Werte des Runs)
export function applyHero(p, key) {
  const h = HEROES[key] || HEROES.soldier;
  if (h.hp) {
    p.maxHp = Math.max(40, p.maxHp + h.hp);
    p.hp = p.maxHp;
  }
  if (h.speed) p.moveSpeed *= h.speed;
  if (h.might) p.might += h.might;
  if (h.armor) p.armor += h.armor;
  if (h.regen) p.hpRegen += h.regen;
  if (h.dodge) {
    p.dodgeMax += h.dodge;
    p.dodgeCharges = p.dodgeMax;
  }
  return h;
}

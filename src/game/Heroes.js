// Spielbare Helden: jeder mit eigenem Pixel-Sprite (0x72 Dungeon Tileset II),
// Startwaffe und Stat-Twist. Freischaltung über Achievements (Meta.js);
// der Söldner ist immer verfügbar. `sprite` = Charakter-Dateiname in public/sprites.
export const HEROES = {
  soldier: {
    name: 'Der Söldner', icon: '⚔️', start: 'whirl', sprite: 'knight_m',
    desc: 'Ausgewogener Kämpfer der alten Garde. Startet mit Klingenwirbel.',
    tint: null,
  },
  hunter: {
    name: 'Die Jägerin', icon: '🏹', start: 'daggers', sprite: 'elf_f',
    desc: 'Flink und tödlich (+20% Schaden, +10% Tempo), aber zerbrechlich (−25 Leben). Startet mit Schattendolchen.',
    tint: null,
    might: 0.2, speed: 1.1, hp: -25,
  },
  templar: {
    name: 'Der Templer', icon: '✝️', start: 'holy', sprite: 'wizzard_m',
    desc: 'Zäher Ordensbruder (+40 Leben, +2 Rüstung, +0,4 Regen), dafür langsamer (−8% Tempo). Startet mit Weihrauch.',
    tint: null,
    hp: 40, armor: 2, speed: 0.92, regen: 0.4,
  },
  shadow: {
    name: 'Der Schatten', icon: '🌒', start: 'spear', sprite: 'elf_m',
    desc: 'Lebt vom Nicht-getroffen-werden: +1 Ausweich-Ladung, +8% Tempo, −15 Leben. Startet mit Knochenspeer.',
    tint: null,
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

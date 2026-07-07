// Spieler-Changelog: Was hat sich geändert? Neueste Einträge zuerst.
// PFLEGE-REGEL: Bei jeder Änderung am Spiel hier einen Eintrag ergänzen —
// in Spieler-Sprache (was merke ich im Spiel?), nicht in Entwickler-Sprache.
export const CHANGELOG = [
  {
    date: '2026-07-07',
    title: 'Endlos mit Biss & wichtige Fixes',
    items: [
      '♾️ Endlos-Modus wird jetzt kontinuierlich schwerer: Gegner werden pro Minute zäher, stärker und zahlreicher (bis über das Doppelte)',
      '🔗 Fix: Verschmolzene Waffen können nicht mehr als Zutat für weitere Kombinationen verbraucht werden (Sternenregen bleibt Sternenregen!)',
      '🧲 Seelenruf zieht jetzt wirklich ALLE Edelsteine der Karte blitzschnell an',
      '💥 Zorn der Barriere tötet jetzt alle normalen Gegner kartenweit — Bosse nehmen weiterhin hohen Schaden',
      '🚀 Weniger Ruckler: Verschmelzungs-Effekte werden vorgeladen, Schadenszahlen sind effizienter',
    ],
  },
  {
    date: '2026-07-03',
    title: 'Das große Kombinations-Update',
    items: [
      '💚 Neue Waffe: Lebensfunke — heilt dich und im Koop deine Verbündeten',
      '✨ 16 Verschmelzungen — jede Waffe hat jetzt mindestens 2 Rezepte, u. a. Gletscherdorn (Eisspeere), Mahlstrom (ansaugender Wirbel), Schutzsegen und Quell des Lebens',
      '🌪 Jede Verschmelzung hat einen eigenen Zusatzeffekt UND eine eigene Optik: Kettenblitze, Gift-Spuren, Exekutionen, Lebensraub, Schockwellen u. v. m.',
      '🔗 Level-Up-Karten zeigen an, wenn eine Wahl zu einer Kombination mit deinen Waffen führt',
      '📖 Kombinations-Nachschlagewerk direkt im Level-Up (Taste K) — mit eigenen Icons überall (HUD, Schadens-Anzeige, Endbildschirm)',
      '🎲 Passive Upgrades haben jetzt Seltenheitsstufen mit besseren Werten (selten ×1,35, rar ×1,8)',
      '⌨️ Level-Up einhändig: 1–3 wählt Karten, R würfelt neu, B verbannt',
      '👁 Solo-Runs erscheinen im Online-Menü — Freunde können live zuschauen',
      '🏆 Bestenliste in Solo und Koop geteilt; Koop-Teams erscheinen als gemeinsamer Eintrag („Anna & Ben")',
      '🎖 Neue Erfolge für Hohlweg, Neon-Distrikt und Frontlinie (je 150 Erz) — „Schwer" wird jetzt über 3 Siege freigeschaltet',
      '🛡 Frontlinie: zwei Panzer mit Nachschub alle 45 s; Lore, Barriere-Kettenblitz und Boost-Pads kommen öfter; NEU: Gift-Geysire im Sumpf',
      '⛏ Erz ist kostbarer: weniger Drops, deutlich teurere Schmiede-Upgrades — Fortschritt ist jetzt ein Langzeitziel',
      '⚙ Auto-Qualität: Bei schwacher Hardware senkt das Spiel die Auflösung dynamisch und hebt sie wieder an',
      '🎯 Fix: Projektile flogen durch große Gegner (Trolle) hindurch — jetzt zählt der echte Körper',
      '🐢 Fix: Ruckelige Helden-Animation beim Koop-Gast',
      '⚠️ Fotosensitivitäts-Warnung beim ersten Start + Option „Reduzierte Lichtblitze"',
      '♾️ Endlos-Runs und über „Hauptmenü" beendete Runs landen jetzt in der Bestenliste',
      '🚪 Hohlweg: die volle Wegbreite ist begehbar',
    ],
  },
  {
    date: '2026-07-02',
    title: 'Drei neue Karten & Map-Specials',
    items: [
      '🗺 Drei neue Karten: Der Hohlweg (endloser Pass), Neon-Distrikt 7 (Cyberpunk) und Frontlinie 1944 (Weltkrieg)',
      '🛡 Map-Specials: fahrbarer Panzer, rasende Minen-Lore, Tempo-Boost-Pads, Morast-Tümpel und Barriere-Blitze',
      '🖼 HD-2D-Look: Pixel-Helden und -Gegner in einer 3D-Welt, neue Schatten, Bloom und Farb-Grading',
      '🧙 Wählbare Helden mit eigenen Startwaffen und Boni',
      '🎖 Erfolge mit Fortschrittsanzeige, Statistiken und Belohnungen',
      '⚔️ Waffen-Maximalstufe auf 10 erhöht; Verschmelzungen eingeführt',
      '🤝 Koop überarbeitet: Wiederbeleben, Team-Buffs, Pings, Truhen-Feedback für den Gast',
      '📱 Touch-Steuerung und mobiles HUD',
      '🎵 Eigene Musik-Themen pro Karte, prozedural generiert',
      '💾 Auto-Save: Runs können fortgesetzt werden',
    ],
  },
];

const SEEN_KEY = 'gothicChangelogSeen_v1';

export function latestStamp() {
  return CHANGELOG.length ? CHANGELOG[0].date : '';
}

export function hasUnseen() {
  try { return localStorage.getItem(SEEN_KEY) !== latestStamp(); } catch (e) { return false; }
}

export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, latestStamp()); } catch (e) { /* ignore */ }
}

export function changelogHtml() {
  const fmtDate = (d) => {
    const [y, m, day] = d.split('-');
    return `${Number(day)}.${Number(m)}.${y}`;
  };
  return CHANGELOG.map((e) => `
    <div class="cl-entry">
      <div class="cl-head"><span class="cl-date">${fmtDate(e.date)}</span><span class="cl-title">${e.title}</span></div>
      <ul class="cl-items">${e.items.map((i) => `<li>${i}</li>`).join('')}</ul>
    </div>`).join('');
}

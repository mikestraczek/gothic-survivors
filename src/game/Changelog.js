// Spieler-Changelog: Was hat sich geändert? Neueste Einträge zuerst.
// PFLEGE-REGEL: Bei jeder Änderung am Spiel hier einen Eintrag ergänzen —
// in Spieler-Sprache (was merke ich im Spiel?), nicht in Entwickler-Sprache.
export const CHANGELOG = [
  {
    date: '2026-07-10',
    title: 'Grafik-Politur',
    items: [
      '🎨 Deutlich hellere, lesbarere Darstellung: mehr Kontrast, sattere Farben, sanftere Vignette — die Welt versinkt nicht mehr im Dunkeln',
      '🌿 Echtes stilisiertes Gras statt flacher „Rauten", plus kräftigere Bodenschatten, damit Held und Gegner klar in der Welt stehen',
      '🪨 Bäume, Felsen und Ruinen im einheitlichen Low-Poly-Look (Flat-Shading), Ruinen mit Moos-Verwitterung — wirkt endlich „echt" statt gebastelt',
      '💡 Wärmere Steine, glühende Pilze und Kerzenlicht bringen mehr Tal-der-Kolonie-Stimmung',
    ],
  },
  {
    date: '2026-07-08',
    title: 'Neue Spielmodi — allein & gegeneinander',
    items: [
      '🎮 NEU: Wähle beim „Neuer Run" jetzt einen Spielmodus! Sieben Modi solo, dazu Duelle im Online-Koop',
      '⚔️ Kampagne: der klassische Lauf (3 Phasen + Endboss) — wie gehabt',
      '♾️ Endlos ist jetzt direkt im Menü wählbar (nicht mehr nur nach einem Sieg)',
      '👑 Boss-Rausch: kaum Fußvolk, nur eine Kette aus 8 immer stärkeren Bossen — schaffst du alle?',
      '💀 Eiserner Modus: zähere Gegner, ein einziges Leben, kein Fortsetzen — nur für Hartgesottene',
      '📅 Tages-Challenge: jeden Tag dieselbe Karte, derselbe Held und dieselben Modifikatoren für ALLE — ein Versuch, ein fairer Vergleich',
      '🎲 Wahnsinn: stelle dir eigene Modifikatoren zusammen — Überzahl, Glaskanone, Blutrausch, Elite-Plage',
      '🩸 Letzter Überlebender: die Barriere zieht sich zu (violette Zone = Tod) — solo zählt deine Zeit, im Koop gewinnt der letzte Lebende',
      '🏁 Score-Wettlauf (Koop): gleiche Arena, jeder für sich — wer nach 8 Minuten mehr Kills hat, gewinnt',
      '😈 Horden-Duell (Koop): Kill-Serien laden deinen Meter — voll geladen hetzt du dem Gegner einen Elite-Jäger auf den Hals',
      '🏆 Duell-Ergebnis mit Sieg-/Niederlage-Bildschirm; Versus-Runs wandern nicht in die Bestenliste',
      '🩸 Letzter Überlebender entschärft: die Zone bleibt anfangs weit offen (Schonfrist ~22s) und schrumpft danach deutlich gemächlicher',
      '🩸 Die sichere Zone hat jetzt eine klar sichtbare, am Boden verankerte violette Energiewand (statt eines pulsierenden Rings im Nichts) — zusätzlich als Kreis auf der Minimap',
      '🎛 „Spiel wählen"-Menü aufgeräumt & kompakter — alle Modi, Modifikatoren und Optionen passen wieder auf einen Blick',
      '🃏 Level-Up-Bildschirm aufgeräumt: die Aktions-Buttons (Neu würfeln / Verbannen / Kombinationen) sowie die Karten sind jetzt alle einheitlich gleich hoch',
    ],
  },
  {
    date: '2026-07-08',
    title: 'Frischer Start & faire Bestenliste',
    items: [
      '🔄 RESET: Bestenliste und Schmiede-Fortschritt wurden erneut für alle zurückgesetzt — diesmal mit Schummel-Schutz',
      '🛡 Die Bestenliste ist jetzt gegen Manipulation geschützt: Die Run-Zeit wird vom Server gemessen und kann nicht mehr erfunden werden — echte Runs werden dabei NIE abgelehnt',
      '🔧 Debug-Zugänge (Konsolen-Zugriff, Freischalt-Parameter) funktionieren nur noch in der lokalen Entwicklung',
      '👤 KONTEN: Melde dich mit Name + Passwort an (keine E-Mail nötig!) — dein Erz, deine Schmiede und deine Erfolge liegen jetzt sicher auf dem Server und begleiten dich auf jedes Gerät',
      '🔒 Erz ist nicht mehr manipulierbar: Kontostand und Schmiede-Käufe werden komplett vom Server verwaltet und geprüft',
      '🛡 Bestenliste jetzt wirklich fälschungssicher: Erfolge und Einträge werden ausschließlich server-seitig aus dem echten Spielverlauf abgeleitet — Erfolge/Freischaltungen lassen sich nicht mehr per Netzwerk-Trick erschummeln',
      '🎯 Bestenlisten-Kills werden nun während des Runs laufend vom Server geprüft — ein Eintrag ohne echtes Spielen ist damit praktisch ausgeschlossen',
      '🔐 Auch fortgesetzte Runs sind abgesichert: ein manipulierter Spielstand kann keinen zu hohen Eintrag mehr erzeugen',
      '⌨️ Login-Komfort: Tab wechselt zwischen den Feldern, Leerzeichen in Namen funktionieren, und Passwort-Manager-Popups (LastPass & Co.) bleiben draußen',
    ],
  },
  {
    date: '2026-07-07',
    title: 'Endlos mit Biss & wichtige Fixes',
    items: [
      '♾️ Endlos-Modus wird jetzt kontinuierlich schwerer: Gegner werden pro Minute zäher, stärker und zahlreicher (bis über das Doppelte)',
      '🔗 Fix: Verschmolzene Waffen können nicht mehr als Zutat für weitere Kombinationen verbraucht werden (Sternenregen bleibt Sternenregen!)',
      '🧲 Seelenruf zieht jetzt wirklich ALLE Edelsteine der Karte blitzschnell an',
      '💥 Zorn der Barriere tötet jetzt alle normalen Gegner kartenweit — Bosse nehmen weiterhin hohen Schaden',
      '🚀 Weniger Ruckler: Verschmelzungs-Effekte werden vorgeladen, Schadenszahlen sind effizienter',
      '🗺 Minimap: Items erscheinen jetzt in ihrer echten Farbe (Heiltrank grün, Seelenruf blau, Erzader gold …) — Truhen bleiben eine Überraschung und werden nicht mehr angezeigt',
      '🙂 Fix: Die Level-Up-Auswahl per Taste 1–3 löst im Koop kein Emote mehr aus',
      '🎥 Fix: Beim Start des Endlos-Modus zoomt die Kamera nicht mehr wie beim Run-Intro heran',
      '🎁 Hebt eine Truhe deine Waffe auf Maximalstufe, wird eine mögliche Verschmelzung sofort angeboten — mehrere nacheinander',
      '🔄 FRISCHER START: Bestenliste und Schmiede-Fortschritt wurden für alle zurückgesetzt — gleiche Chancen für alle! (Name & Einstellungen bleiben)',
      '🏆 Bestenliste zeigt jetzt Datum + Uhrzeit jedes Runs und akzeptiert die riesigen Kill-Zahlen aus dem Endlos-Modus',
      '🗺 Der Kartenrand ist jetzt auf der Minimap als rote gestrichelte Linie sichtbar',
      '⬆ Level-Ups werden mit einem goldenen Effekt gefeiert — auch der Mitspieler sieht, wenn du aufsteigst',
      '⚔️ Endlos deutlich gefährlicher: Gegner härten gegen Rückstoß ab (schwere & Eliten sowieso, Bosse sind unverrückbar), werden schneller und der Mix wird fieser (mehr Schützen!)',
      '⛏ Erz nochmal deutlich seltener — die Schmiede ist ein echtes Langzeitziel',
      '💚 Gefallene Mitspieler sind jetzt leicht zu finden: grüne Lichtsäule + Puls-Ringe am Boden',
      '👁 Bessere Sicht im Endgame: Bei vollen Schlachtfeldern dimmen Funken, Glühen und Schadenszahlen automatisch',
      '🔗 Fix: Level-Up-Karten werben nicht mehr mit Kombinationen, deren Zutat bereits in einer Verschmelzung steckt',
      '⚖️ Verschmelzungen gezähmt: moderatere Grundwerte (v. a. Höllensturm & Kataklysmus) — die Zusatzeffekte bleiben; Endlos skaliert dafür nochmal steiler (bis 3× Gegnermasse)',
      '🎨 Klarere Sicht: Dein Held wird jetzt ÜBER den Effekten gezeichnet und die Getümmel-Dämpfung greift früher und stärker (Funken −80 %, Glühen −60 %, halbierte Ringe/Hiebe)',
      '🏆 Die Bestenliste nimmt jetzt JEDEN Run an — die zu strenge „Unmöglich"-Prüfung, die epische Endlos-Runs verworfen hat, ist komplett entfernt',
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

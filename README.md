# Gothic Survivors — Im Bann der Barriere

Ein **Gothic-Roguelite im Vampire-Survivors-Stil** im Browser, gebaut mit
[Three.js](https://threejs.org/). Du steckst in der Strafkolonie hinter der
magischen Barriere fest — überlebe die Horden aus Gothic-Bestien, sammle
Erfahrung & Erz, werde mit jedem Level stärker und investiere dein Erz in
**permanente Upgrades** zwischen den Runs.

Der Held ist ein **echtes animiertes 3D-Modell** (glTF), die Welt das
nachgebaute Tal des Alten Lagers mit der ikonischen Energie-Barriere.

## Gegner (Gothic-orientiert)

**Früh:** 🦅 Scavenger · 🪰 Blutfliege (fliegt) · 🐺 Schattenwolf · 🦫 Molerat
· 💀 Skelett · 🧟 Ghul. **Spät (zäher, mehr XP):** 🗿 Wasserspeier (fliegt) ·
😈 Dämon · 🪨 Troll.

**Verhaltens-Archetypen:** 🧙 **Schwarzmagier** hält Abstand und feuert
dodgebare Kugeln · 👹 **Höllenbrut** rennt an, schwillt an (Telegraph) und
**detoniert** — vorher töten verhindert die Explosion · 🧟 **Moderleib**
zerfällt beim Tod in zwei **Modergänger**.

**Eliten:** Selten spawnen verstärkte Varianten mit Affix — *Windgepeitscht*
(schnell, eisblau), *Gepanzert* (Schild absorbiert Schaden, gold), *Explosiv*
(telegrafierte Todes-Explosion, glutorange). Eliten geben 4× XP/Erz und lassen
eine **🎁 Truhe** fallen (Waffen-Stufe + Erz).

**Bosse:** Schattenläufer (Nahkampf), Knochenkönig (Bullet-Hell/Safe-Zonen),
Erzdämon (Allrounder) — mit Ankündigung, telegrafierten Angriffen und
**Enrage-Phasen bei 66 %/33 % HP** (schneller, härter, eine Fähigkeit mehr).
Alle Charaktere sind Billboard-Pixel-Sprites, für die Horde **instanziert**
(hunderte gleichzeitig); sie kollidieren miteinander **und** mit Objekten.

**XP-Edelsteine** in 6 Stufen — je stärker der Gegner, desto wertvoller (und
größer/farbiger) der Stein: hellgrün → grün → blau → violett → gold → purpurrot.

## Welt-Items & Run-Events (beim Drüberlaufen)

💚 **Heiltrank** (Leben auffüllen) · 🔵 **Seelenruf** (zieht alle Edelsteine an)
· 🔴 **Zorn der Barriere** (trifft alle Feinde) · 🟡 **Erzader** (Erz finden) ·
🎁 **Truhe** (Elite-Beute: zufällige Waffe +1 Stufe & Erz) · 🕯 **Schrein der
Barriere** (erscheint nach jedem besiegten Anführer: volle Heilung + 15 s
**+40 % Schaden**). Items erscheinen regelmäßig in der Welt und fallen bei
Boss-Kills.

---

## Schnellstart

```bash
npm install
npm run dev      # öffnet das Spiel automatisch im Browser
```

Production-Build: `npm run build` → `dist/` · Vorschau: `npm run preview`

### Online-Koop

```bash
npm run server   # Relay-Server (ws://localhost:8080) — muss laufen
npm run dev      # in einem zweiten Terminal
```

Im Menü **„Online-Koop"** → **Lobby erstellen** zeigt einen 4-stelligen Code.
Der/die Mitspieler:in öffnet das Spiel, **„Online-Koop" → Code eingeben →
Beitreten**, dann startet der Host das Spiel. Beide kämpfen gemeinsam gegen
dieselbe (synchronisierte) Horde. **Jeder Spieler levelt unabhängig** und wählt
**seine eigenen Upgrades/Waffen**. Stirbt einer, **beobachtet** er den/die
Überlebende:n weiter; der Run endet erst, wenn alle gefallen sind. Eine
**Minimap** zeigt Mitspieler, Gegner & Bosse; am Ende gibt es **Statistiken pro
Spieler**. Laufende **Solo-Runs erscheinen im Lobby-Browser** — mit „👁
Zuschauen" kann jeder live zusehen (ESC beendet das Zuschauen).

#### Im selben Netzwerk (LAN) mit Freunden zocken — am einfachsten:

```bash
npm run lan      # auf EINEM PC (dem Host) — baut + startet beide Server
```

Das Skript zeigt eine URL wie `http://192.168.x.y:5199`. **Alle** im selben
Netzwerk (inkl. Host) öffnen **diese** URL im Browser. Der Relay-Server wird
dabei automatisch passend gesetzt (er leitet sich aus der geöffneten Adresse
ab). Einer erstellt die Lobby, die anderen treten mit dem Code bei — fertig.
Ggf. in der Firewall die Ports **5199** und **8080** freigeben.

> Für Spiel über das **Internet** (nicht nur LAN) muss der Relay-Server
> öffentlich erreichbar sein (Hosting/Port-Weiterleitung); im Lobby-Fenster
> lässt sich dafür eine andere Server-Adresse eintragen.

> Architektur: **host-autoritativ** — der Host simuliert die Welt und sendet
> Snapshots (~15 Hz), der Beitretende sendet nur seine Eingaben und rendert den
> Zustand (mit lokaler Vorhersage für die eigene Figur).

---

## Ziel & Level-Aufbau

Jedes Level besteht aus **3 Phasen** — pro Phase gilt es eine **Kill-Quota** zu
erfüllen (55/80/110), dann erscheint der **Anführer** (Mini-Boss) der Phase.
Nach der dritten Phase kommt der **finale Boss** der Karte — besiegst du ihn,
ist das **Level abgeschlossen** (danach optional **Endlos-Modus**). Es gibt
**5 Karten** mit jeweils **2 Schwierigkeitsgraden** (Normal/Schwer) — und jede
hat ihr eigenes **Map-Special**:

| Karte | Stil | Special |
| ----- | ---- | ------- |
| Tal der Kolonie | Gothic-Tal, Altes Lager | ⚡ Ketten-Blitze der Barriere (alle ~15 s, bis zu 3 Ziele) |
| Sumpf der Bruderschaft (Unlock) | Morast, Regen | 🫧 Gift-Geysire verätzen Gegner in Tümpeln · 🥾 Morast bremst dich |
| Der Hohlweg | schmaler, (gefühlt) endloser Pass | 🛤 Minen-Lore rast alle ~15 s durchs Gleis |
| Neon-Distrikt 7 | Cyberpunk, Regen & Neon | ⚡ Boost-Pads geben Tempo-Schübe |
| Frontlinie 1944 | Weltkriegs-Schlachtfeld | 🛡 **Zwei fahrbare Panzer** (Respawn ~45 s): überrollen Gegner, Auto-Kanone |
| Über den Wolken | Heller Tag: sonnige Hügel, Wolken, Wildblumen | ☀️ Freundlicher Kontrast zu den düsteren Karten |

Held, Karte & Schwierigkeit wählst du vor dem Start (im Koop wählt der Host
Karte & Schwierigkeit, jeder Spieler seinen eigenen Helden). Dev-Tipp:
`?unlock` in der URL schaltet zum Testen alles frei.

## Helden (Charakterauswahl)

⚔️ **Der Söldner** (ausgewogen, startet mit Klingenwirbel) · 🏹 **Die Jägerin**
(+20 % Schaden, +10 % Tempo, −25 Leben; Schattendolche) · ✝️ **Der Templer**
(+40 Leben, +2 Rüstung, +Regen, −8 % Tempo; Weihrauch) · 🌒 **Der Schatten**
(+1 Ausweich-Ladung, +8 % Tempo, −15 Leben; Knochenspeer). Jägerin, Templer und
Schatten werden über **Achievements** freigeschaltet.

## Spielprinzip

- **Bewegung mit WASD** (bzw. virtueller Joystick auf Touch-Geräten) — mehr
  nicht. **Angriffe laufen automatisch.** **Leertaste** = Ausweichen (i-Frames).
- Erlege Feinde → sie lassen **Edelsteine** (Erfahrung) fallen → einsammeln.
- Bei jedem **Stufenaufstieg** wählst du aus 3 zufälligen **Upgrades** —
  Passive erscheinen in **Seltenheitsstufen mit besseren Werten** (selten ×1,35,
  rar ×1,8); dazu **Neuwürfe** (🎲/R), **Verbannen** (🚫/B) und ein
  **Kombinations-Nachschlagewerk** (📖/K) direkt im Level-Up. Auswahl auch per
  Tastatur: **1–3**.
- Die Schwierigkeit **steigt mit der Zeit**: mehr, stärkere und
  vielfältigere Gegner, Eliten und Boss-Enrage-Phasen.
- Beim Tod endet der Run. Das gesammelte **Erz** wird gebucht und bleibt
  erhalten — gib es in der **Halle der Erzbarone** für permanente
  Verbesserungen aus. **Achievements** schalten Helden, Waffen und die
  zweite Karte frei (alles im Browser gespeichert).

| Taste        | Aktion                                  |
| ------------ | --------------------------------------- |
| **W A S D**  | Bewegen                                 |
| **Leertaste**| Ausweichen (2 Ladungen)                 |
| **E**        | Mitspieler wiederbeleben (Koop)         |
| **Q/Klick**  | Ping · **1–4** Emotes (Koop)            |
| **M**        | Ton an/aus · **Esc** Pause              |
| **Mausrad**  | Kamera-Zoom                             |
| **Touch**    | Links: Joystick · Rechts/💨: Ausweichen |

---

## Waffen (automatisch, je 10 Stufen, max. 4 Slots)

| Waffe | Wirkung |
| ----- | ------- |
| 🌀 **Klingenwirbel** | Dauerhaft rotierende Klingen um dich (Startwaffe des Söldners) |
| 🪓 **Wurfaxt** | Wirbelnde Äxte, durchbohren mehrere Gegner |
| 🔥 **Feuerball** | Fliegt zum nächsten Feind, explodiert mit Flächenschaden |
| ✦ **Wächtergeister** | Kreisen um dich, verletzen bei Berührung (Unlock) |
| ⚡ **Blitzschlag** | Schlägt zufällige Feinde in Reichweite mit Wucht |
| ❄️ **Frostbann** | Frostwelle: Schaden + verlangsamt Feinde |
| 🦴 **Knochenspeer** | Schneller Bumerang-Speer, durchbohrt viele Feinde |
| ☠️ **Giftwolke** | Hinterlässt ätzende Wolken (Schaden über Zeit, Unlock) |
| ✝️ **Weihrauch** | Heilige Aura schadet nahen Feinden ständig |
| 🗡️ **Schattendolche** | Fächer schneller, durchbohrender Dolche |
| ☄️ **Meteor** | Einschläge mit Flächenschaden (Unlock) |

**Verschmelzungen (16):** Zwei Rezept-Formen — **zwei Waffen** (beide auf
Maximalstufe; die zweite wird verbraucht, ein Slot wird frei) oder **Waffe +
Passiv** (Maximalstufe + Passiv 3× genommen; kein Slot frei, Passiv bleibt).
Jede Verschmelzung hat neben stärkeren Werten einen **eigenen Zusatzeffekt**:
Kettenblitze (Sturmruf), Gift-Spuren hinter Speeren (Seuchenhagel), Exekution
angeschlagener Gegner (Urteil des Henkers), Lebensraub (Seelenwacht),
Blitzeinschläge im Feuerball-Krater (Höllensturm), Schockwellen (Kataklysmus),
wandernde Giftwolken (Pestwind), Dolch- und Blitz-Auren (Geweihte Klingen /
Göttlicher Zorn), Mini-Meteore (Sternenregen), Tiefkühlung (Ewiger Winter) und
goldene Wurfklingen (Klingensturm), einfrierende Eisspeere (Gletscherdorn),
ein ansaugender Klingen-Sog (Mahlstrom), Schutzschilde (Schutzsegen) und
heilende Felder (Quell des Lebens). Jede Waffe hat mindestens 2 Rezepte.
Neu dabei: **💚 Lebensfunke** — heilt dich und im Koop deine Verbündeten.
Karten im Level-Up zeigen an, wenn eine Wahl zu einer **Kombination mit deinem
Bestand** führen würde.
Beispiele: Klingenwirbel + Wurfaxt → *Klingensturm*, Wurfaxt + 3× Stärke →
*Urteil des Henkers*. Die Übersicht aller Rezepte gibt es im Menü unter
**Kombinationen**.

## Passive Boni (Level-Up)

Stärke (+Schaden), Flinkheit (+Tempo), Vitalität (+Leben), Panzerung, Hast
(−Abklingzeit), Wucht (+Wirkungsbereich), Gier (+Aufnahmeradius), Regeneration,
Projektiltempo, Windschritt (Ausweichen), Vielzahl (+1 Projektil, rar).

## Meta-Progression (permanent)

**Halle der Erzbarone** (Erz): Zähigkeit, Schnelligkeit, Macht, Panzerung,
Hast, Magnetismus, Lebenskraft, Gier, Würfelglück. Dazu **7 Achievements** mit
**Fortschrittsbalken** und einer **Gesamtstatistik** (Kills, Siege, beste
Zeit/Stufe, Erz), die Helden, Waffen und die Sumpf-Karte freischalten
(🎖 Erfolge im Menü).

## Optionen & Komfort

**Konten ohne E-Mail:** Beim ersten Start legst du mit **Name + Passwort** ein
Konto an (Passwort gut merken — es gibt keine Wiederherstellung!). Erz,
Schmiede-Upgrades und Erfolge liegen **server-seitig** und sind damit nicht
manipulierbar: Käufe werden vom Server geprüft, Erz-Gutschriften sind an die
echte (server-gemessene) Run-Dauer gekoppelt. Ohne erreichbaren Server kann
offline als Gast gespielt werden (Fortschritt dann nur lokal, keine
Bestenliste).

Die **Bestenliste** ist in **Solo und Koop** geteilt — Koop-Runs erscheinen
als ein gemeinsamer Team-Eintrag („Anna & Ben", Kills/Erz beider Spieler
zusammengezählt). Eine **Auto-Qualität** senkt bei schwachen Geräten die
Renderauflösung dynamisch (und hebt sie wieder an), damit es flüssig bleibt.

⚙ **Optionen** (Menü & Pause): Musik-/Effekt-Lautstärke, **Renderauflösung**
(50–100 %, für schwächere Geräte), Screen Shake, Schadenszahlen, Schatten,
Bloom, Retro-Pixel-Filter und **„Reduzierte Lichtblitze"** (Fotosensitivität —
dazu erscheint beim ersten Start eine Epilepsie-Warnung) — persistent
gespeichert. Verschmolzene Waffen zeigen überall **eigene Icons & Namen**
(HUD, DPS-Panel, Endbildschirm). Wer einen Run über „Hauptmenü" beendet
(auch Endlos!), landet trotzdem in der **Bestenliste**.
Prozedurale **Musik** (Karten-Themes + Boss-Theme) und SFX laufen komplett
über die Web Audio API (keine Audiodateien). **Touch-Support**: virtueller
Joystick + Ausweich-Button, das Spiel läuft auch auf Tablets/Smartphones.

---

## Technik & Architektur

Three.js (WebGL) · Vite · reines JavaScript (ES-Module). Für **hunderte Gegner
gleichzeitig** werden `InstancedMesh`-Horden mit einem Trennungs-Grid verwendet;
der Held ist ein echtes animiertes glTF-Modell (`AnimationMixer`).
Look: PBR, Echtzeit-Schatten, **MSAA** + **Bloom** + **ACES-Tone-Mapping** +
**Cinematic Color-Grading** (Split-Toning je Karte, Vignette), Bodennebel,
Wetter (Regen/Glühwürmchen), glühende Pilz-Cluster, mitlaufender Lichtkreis.
Baumkronen nahe dem Helden **ducken sich weich weg** — die Top-Down-Sicht
bleibt immer frei.

```
public/models/Soldier.glb   # Helden-Modell (meshopt-komprimiert, ~0,55 MB)
public/sprites/             # Pixel-Art-Sprites (0x72 Dungeon Tileset II, CC0)
src/
  main.js
  style.css
  game/
    Game.js            # schlanker Orchestrator: Konstruktion, Preload, Facade-Delegates
    constants.js       # gemeinsame Spiel-Konstanten (Phasen, Koop, Schwierigkeiten)
    Visuals.js         # Render-Pipeline (Composer/Bloom/Vignette) + Helden-Sprites
    UiScreens.js       # Menüs, Optionen, Pause, Bestenliste, Karten-/Heldenwahl
    Coop.js            # Netz/Lobby, Snapshots, Revive/Buffs/Pings (Online-Koop)
    RunControl.js      # Run-Lebenszyklus, Phasen/Bosse, Level-Up-Flow, Run-Ende
    MainLoop.js        # Frame-Loop (Host-/Client-Zweig), Minimap/Kampf-UI
    World.js           # Terrain, Barriere, Kulisse, Vegetation, Licht, Wetter
    Assets.js          # glTF-Loader (meshopt) + Ladefortschritt
    Player.js          # Held: Stats, Bewegung, Dodge, Root, Segen
    Heroes.js          # Spielbare Helden (Startwaffe, Stat-Twist, Tint)
    SurvivorsCamera.js # Top-Down-Verfolgerkamera + Trauma-Screen-Shake
    Weapons.js         # 11 automatische Waffen + Projektile + Verschmelzungen
    Effects.js         # Funken/Slashes/Explosionen/Blitze/Schadenszahlen (Pools)
    EnemyManager.js    # Gegner (instanziert), Archetypen, Eliten, Bosse+Phasen
    PickupManager.js   # Welt-Items (Heilung/Magnet/Nova/Erz/Truhe/Schrein)
    GemManager.js      # XP-Edelsteine (instanziert) + Magnet
    Upgrades.js        # Level-Up-Auswahl (Rarity/Banish) + Verschmelzungen
    Meta.js            # permanente Progression + Achievements/Unlocks + Shop
    Settings.js        # persistierte Optionen (Audio/Grafik/Komfort)
    Audio.js           # prozedurale SFX + Musik-Engine (Web Audio)
    HUD.js             # XP/Timer/Leben/Waffen/Kills/Minimap/DPS
    Input.js           # Tastatur/Maus + Touch (virtueller Joystick)
    spriteart.js       # Sprite-Strips + prozedurale Prop-Billboards
  net/
    Net.js             # WebSocket-Client (Lobby + Snapshot/Input)
server/index.js        # Relay-Server + Score-API (npm run server)
scripts/smoke.mjs      # Headless-Test (npm run smoke; benötigt laufende Preview)
```

### Tests

```bash
npm run preview        # Terminal 1
npm run smoke          # Terminal 2 — prüft Laden, Horde, Waffen, Level-Up
```
Verifiziert headless mit Chrome/SwiftShader: Modell-Laden + Animation,
Gegner-Spawn, automatische Waffen, Level-Up-Auswahl, keine Render-/JS-Fehler.

---

## Roadmap

- Weitere Karten/Biome (Minental), Tag-/Nacht-Zyklus
- Mehr Helden & einzigartige Boss-Movesets
- Text-Chat & Reconnect im Koop, mehr als 2 Spieler
- i18n (Englisch), Farbenblind-Modus, Key-Rebinding

> Grafik-Hinweis: Three.js liefert die Render-Technik; mehr visuelle Tiefe
> kommt über zusätzliche Sprite-/glTF-Assets — die Architektur erlaubt das
> Einsetzen ohne Umbau der Spiellogik.

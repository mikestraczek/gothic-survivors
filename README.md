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
😈 Dämon · 🪨 Troll. **Bosse alle ~100 s, rotierend:** Schattenläufer,
Knochenkönig, Erzdämon (mit Ankündigung, lassen massig XP & ein Item fallen).
Eigens gebaute, korrekt ausgerichtete Gothic-Kreaturen, für die Horde
**instanziert** (hunderte gleichzeitig). Sie kollidieren miteinander **und** mit
Objekten (Ruinen, Steine, Bäume, Felsen).

**XP-Edelsteine** in 6 Stufen — je stärker der Gegner, desto wertvoller (und
größer/farbiger) der Stein: hellgrün → grün → blau → violett → gold → purpurrot.

## Welt-Items (beim Drüberlaufen)

💚 **Heiltrank** (Leben auffüllen) · 🔵 **Seelenruf** (zieht alle Edelsteine an)
· 🔴 **Zorn der Barriere** (trifft alle Feinde) · 🟡 **Erzader** (Erz finden).
Erscheinen regelmäßig in der Welt und fallen bei Boss-Kills.

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
Spieler**.

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

Jedes Level besteht aus **3 Phasen** (je ~55 s, steigende Intensität). Nach der
letzten Phase erscheint der **finale Boss** — besiegst du ihn, ist das **Level
abgeschlossen** (Sieg-Bildschirm). Es gibt **2 Karten** (Tal der Kolonie,
Sumpf der Bruderschaft) mit jeweils **2 Schwierigkeitsgraden** (Normal/Schwer).
Karte & Schwierigkeit wählst du vor dem Start (im Koop wählt der Host in der
Lobby). Eine **Phasen-Anzeige** im HUD zeigt den Fortschritt.

## Spielprinzip

- **Bewegung mit WASD** — mehr nicht. **Angriffe laufen automatisch.**
- Erlege Feinde → sie lassen **Edelsteine** (Erfahrung) fallen → einsammeln.
- Bei jedem **Stufenaufstieg** wählst du aus 3 zufälligen **Upgrades**
  (neue Waffe, Waffe verbessern oder passiver Bonus).
- Die Schwierigkeit **steigt mit der Zeit**: mehr und stärkere Gegner, alle
  ~2 Minuten ein **Boss**.
- Beim Tod endet der Run. Das gesammelte **Erz** wird gebucht und bleibt
  erhalten — gib es in der **Halle der Erzbarone** für permanente
  Verbesserungen aus (Roguelite-Meta-Progression, im Browser gespeichert).

| Taste        | Aktion                  |
| ------------ | ----------------------- |
| **W A S D**  | Bewegen                 |
| **Maus**     | Menüs/Auswahl           |
| **Mausrad**  | Kamera-Zoom             |

---

## Waffen (automatisch, je 8 Stufen)

| Waffe | Wirkung |
| ----- | ------- |
| 🌀 **Klingenwirbel** | Dauerhaft rotierende Klingen um dich (Startwaffe) |
| 🪓 **Wurfaxt** | Wirbelnde Äxte, durchbohren mehrere Gegner |
| 🔥 **Feuerball** | Fliegt zum nächsten Feind, explodiert mit Flächenschaden |
| ✦ **Wächtergeister** | Kreisen um dich, verletzen bei Berührung |
| ⚡ **Blitzschlag** | Schlägt zufällige Feinde in Reichweite mit Wucht |
| ❄️ **Frostbann** | Frostwelle: Schaden + verlangsamt Feinde |
| 🦴 **Knochenspeer** | Schneller Speer, durchbohrt viele Feinde |
| ☠️ **Giftwolke** | Hinterlässt ätzende Wolken (Schaden über Zeit) |
| ✝️ **Weihrauch** | Heilige Aura schadet nahen Feinden ständig |

**Verschmelzungen:** Eine Waffe auf Maximalstufe + das passende passive Upgrade
schaltet beim Level-Up eine **✨ Verschmelzung** frei (z. B. Klingenwirbel +
Stärke → *Klingensturm*) — deutlich stärkere, evolvierte Form.

## Passive Boni (Level-Up)

Stärke (+Schaden), Flinkheit (+Tempo), Vitalität (+Leben), Panzerung, Hast
(−Abklingzeit), Wucht (+Wirkungsbereich), Gier (+Aufnahmeradius), Regeneration,
Projektiltempo, Vielzahl (+1 Projektil).

## Meta-Upgrades (permanent, Erz)

Zähigkeit, Schnelligkeit, Macht, Panzerung, Hast, Magnetismus, Lebenskraft, Gier.

---

## Technik & Architektur

Three.js (WebGL) · Vite · reines JavaScript (ES-Module). Für **hunderte Gegner
gleichzeitig** werden `InstancedMesh`-Horden mit einem Trennungs-Grid verwendet;
der Held ist ein echtes animiertes glTF-Modell (`AnimationMixer`).
Look: PBR, Echtzeit-Schatten, **Bloom** + **ACES-Tone-Mapping**, mitlaufender
Lichtkreis um den Helden.

```
public/models/Soldier.glb   # animiertes Helden-Modell (three.js-Beispiel, CC)
src/
  main.js
  style.css
  game/
    Game.js            # Orchestrierung: Loop, Run-/Menü-/Shop-Status, Bloom
    World.js           # Terrain, Barriere, Lager-Kulisse, Vegetation, Licht
    Assets.js          # glTF-Loader (Held + Animationen)
    Player.js          # Held: Modell, Animation, Roguelite-Stats, Bewegung
    SurvivorsCamera.js # Top-Down-Verfolgerkamera
    Weapons.js         # 9 automatische Waffen + Projektile + Verschmelzungen
    Effects.js         # Funken/Slashes/Explosionen/Blitze (Pool, additiv + Bloom)
    EnemyManager.js    # Gothic-Kreaturen (instanziert), Kollision, Spawner, Bosse
    PickupManager.js   # Welt-Items (Heilung/Magnet/Nova/Erz)
    GemManager.js      # XP-Edelsteine (instanziert) + Magnet
    Upgrades.js        # Level-Up-Auswahl + Verschmelzungen
    Meta.js            # permanente Progression (localStorage) + Shop
    HUD.js             # XP/Timer/Leben/Waffen/Kills
    Input.js           # Tastatur/Maus
  net/
    Net.js             # WebSocket-Client (Lobby + Snapshot/Input)
server/index.js        # Relay-Server (Lobby-Räume, npm run server)
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

- Mehr Waffen & Evolutionen (kombinierte Upgrades wie in Vampire Survivors)
- Mehr Gegnertypen & einzigartige Bosse mit Mustern
- Charakter-Auswahl (verschiedene Helden mit Startwaffen) — echte glTF-Modelle
- Karten/Biome (Sumpf, Minental), Tag-/Nacht-Zyklus
- Audio (Musik, Treffer/Pickup-Sounds), Schadenszahlen, Bildschirm-Shake
- Run-Statistiken, Erfolge, Freischaltungen

> Grafik-Hinweis: Three.js liefert die Render-Technik; mehr visuelle Tiefe
> kommt über zusätzliche glTF-Assets (Gegner-/Boss-Modelle, Texturen) — die
> Architektur erlaubt das Einsetzen ohne Umbau der Spiellogik.

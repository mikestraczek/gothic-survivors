# Gothic Survivors – Hosting auf Coolify

Der Server (`server/index.js`) macht alles über **einen Port**:
- liefert das gebaute Spiel aus (`dist/`),
- Koop-WebSocket-Relay unter `/ws`,
- Leaderboard-API unter `/api/scores` (Postgres, optional aber empfohlen).

Damit reicht Coolify **ein Dienst + eine Postgres-Datenbank**.

---

## 1. Postgres-Datenbank anlegen

1. In deinem Coolify-Projekt: **+ New → Database → PostgreSQL** erstellen.
2. Starten und die **Connection-URL** kopieren (Format: `postgres://user:pass@host:5432/dbname`).
   - Innerhalb desselben Coolify-Projekts kannst du die **interne** URL nutzen (kein SSL nötig).

Die Tabelle `scores` legt der Server beim ersten Start selbst an — nichts weiter zu tun.

## 2. Anwendung anlegen

1. **+ New → Application → Public/Private Repository**, dieses Git-Repo wählen.
2. **Build Pack: `Dockerfile`** (das mitgelieferte `Dockerfile` wird automatisch genutzt).
3. **Port / Ports Exposes: `3000`** eintragen (der Server hört auf `PORT`, Standard 3000).
4. Eine **Domain** zuweisen (Coolify/Traefik macht HTTPS automatisch; WebSockets `wss://` funktionieren über dieselbe Domain — kein Extra-Setup).

## 3. Umgebungsvariablen setzen

In der App unter **Environment Variables**:

| Variable       | Wert                                             | Zweck                          |
|----------------|--------------------------------------------------|--------------------------------|
| `DATABASE_URL` | die Postgres-Connection-URL aus Schritt 1        | Leaderboard-Speicher           |
| `PORT`         | `3000` (optional, ist Default)                   | Server-Port                    |
| `PGSSL`        | `require` **nur** bei externer DB mit SSL-Pflicht | SSL für Postgres               |

> Ohne `DATABASE_URL` läuft das Spiel + Koop trotzdem — die Bestenliste bleibt dann nur lokal im Browser.

## 4. Deploy

**Deploy** klicken. Coolify baut das Docker-Image (Vite-Build → schlankes Runtime-Image) und startet es.

Fertig: Unter deiner Domain läuft das Spiel, Online-Koop (über `wss://deine-domain/ws`) und die geräteübergreifende Bestenliste.

---

## Prüfen

- `https://deine-domain/api/health` → `{"ok":true,"db":true}` (`db:true` = Postgres verbunden).
- Im Spiel: Namen eintippen → Run spielen → **🏆 Bestenliste** zeigt „🌐 Global".
- Koop: „Online-Koop" → Lobby erstellen; ein zweiter Spieler sieht sie in der Liste.

## Lokal mit den echten Server-Daten spielen

`npm run server` und `npm run start` laden automatisch eine **`.env`** (via `--env-file-if-exists`, gitignoriert). So spielst du lokal gegen dieselbe Postgres-DB wie in Produktion.

1. Einmalig `.env` anlegen: `cp .env.example .env` und `DATABASE_URL` eintragen.
2. Spiel bauen: `npm run build`
3. Server starten: `npm run server` → **http://localhost:3000** (verbindet mit der DB aus `.env`).

Mit Hot-Reload (zwei Terminals):

```bash
npm run server   # Terminal 1: API + /ws + DB (Port 3000)
npm run dev      # Terminal 2: Vite mit Hot-Reload, proxyt /api und /ws an :3000
```

> Die `.env` ist **nicht** im Git und **nicht** im Docker-Image — in Produktion setzt Coolify `DATABASE_URL` als Umgebungsvariable.

## Hinweise

- **Skalierung:** Der Koop-Host rechnet die Simulation; der Relay hält Lobbys **im Arbeitsspeicher**. Läuft daher am besten als **eine** Instanz (nicht horizontal skalieren, sonst sehen sich Lobbys über Instanzen hinweg nicht). Die Bestenliste (Postgres) ist davon unberührt.
- **Backups:** Coolify kann für die Postgres-DB automatische Backups einrichten — empfohlen.

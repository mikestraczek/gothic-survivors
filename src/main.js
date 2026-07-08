// Einmaliger Spiel-Reset (07.07.2026): Bestenliste + Metaprogression aller Spieler leeren.
// Name, Einstellungen und Warnungs-Bestätigung bleiben erhalten.
try {
  const RESET_KEY = 'gothicReset_20260708'; // Reset #2
  if (!localStorage.getItem(RESET_KEY)) {
    for (const k of ['gothicSurvivorsMeta_v1', 'gothicScores', 'gothicSurvivorsRun']) localStorage.removeItem(k);
    localStorage.setItem(RESET_KEY, '1');
  }
} catch (e) { /* ignore */ }

import { Game } from './game/Game.js';

// Game lädt zuerst die Assets und startet danach selbst die Render-Schleife.
const game = new Game();

// Debug-Zugriff NUR lokal bzw. mit ?debug — in Produktion wäre die Konsole sonst ein Cheat-Menü
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if (isLocal || /[?&]debug/.test(location.search)) window.__game = game;

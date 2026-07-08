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

// Debug-Zugriff NUR auf localhost — KEIN ?debug-Schalter (das wäre in Produktion ein
// Cheat-Menü per URL). window.__game existiert im Live-Spiel gar nicht.
if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__game = game;

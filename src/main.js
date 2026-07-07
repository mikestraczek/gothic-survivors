// Einmaliger Spiel-Reset (07.07.2026): Bestenliste + Metaprogression aller Spieler leeren.
// Name, Einstellungen und Warnungs-Bestätigung bleiben erhalten.
try {
  const RESET_KEY = 'gothicReset_20260707';
  if (!localStorage.getItem(RESET_KEY)) {
    for (const k of ['gothicSurvivorsMeta_v1', 'gothicScores', 'gothicSurvivorsRun']) localStorage.removeItem(k);
    localStorage.setItem(RESET_KEY, '1');
  }
} catch (e) { /* ignore */ }

import { Game } from './game/Game.js';

// Game lädt zuerst die Assets und startet danach selbst die Render-Schleife.
const game = new Game();

// Praktisch zum Debuggen in der Konsole
window.__game = game;

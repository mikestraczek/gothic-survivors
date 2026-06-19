import { Game } from './game/Game.js';

// Game lädt zuerst die Assets und startet danach selbst die Render-Schleife.
const game = new Game();

// Praktisch zum Debuggen in der Konsole
window.__game = game;

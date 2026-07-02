// Gemeinsame Spiel-Konstanten — von Game.js und seinen Modulen (Coop/RunControl/MainLoop/UiScreens) genutzt.
export const SNAP_HZ = 20;
export const INPUT_HZ = 22;
export const REVIVE_RANGE = 2.8; // Nähe zum gefallenen Mate für Wiederbelebung
export const REVIVE_TIME = 3.0; // Sekunden Halten für eine Wiederbelebung
export const AURA_RANGE = 7; // Nähe-Aura wirkt, wenn beide Spieler enger als das beieinander sind
export const INTRO_DUR = 2.6; // Dauer des Start-Intros (Kamera-Flourish + Titel)
export const EMOTES = ['🆘 Hilfe!', '👍 Danke!', '💎 Sammeln!', '⚠ Achtung!']; // Quick-Emotes (Tasten 1–4)
export const PHASES = 3; // Phasen pro Level, dann finaler Boss
export const KILLS_PER_PHASE = [55, 80, 110]; // Gegner pro Phase erlegen, dann Mini-Boss
export const MINI_BOSSES = ['boss', 'boss_bone', 'boss_demon']; // Phasen-Anführer
export const DIFFS = { normal: { mult: 1.0, name: 'Normal' }, hard: { mult: 1.65, name: 'Schwer' } };

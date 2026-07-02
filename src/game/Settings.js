// Zentrale, persistierte Spiel-Einstellungen (localStorage).
const KEY = 'gothicSettings_v1';

export const SETTINGS_DEFAULTS = {
  musicVol: 0.5, // 0..1
  sfxVol: 0.8, // 0..1
  shake: true, // Screen Shake
  dmgNumbers: true, // Schadenszahlen
  shadows: true, // Echtzeit-Schatten
  bloom: true, // Glüh-Pass
  pixelArt: false, // Retro-Pixel-Filter (Post-Pass)
  renderScale: 1, // Renderauflösung 0.5–1.0 (großer Hebel für schwache Geräte)
};

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...SETTINGS_DEFAULTS, ...raw };
  } catch (e) {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* ignore */ }
}

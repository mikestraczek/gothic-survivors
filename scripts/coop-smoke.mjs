// Koop-E2E-Check: Unified Server + 2 headless Clients — Lobby, Heldenwahl, Start, Snapshot-Sync.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT = '/Users/mikestraczek/Projekte/Gothic';
const PORT = 8123;
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(existsSync);

const server = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

const errors = [];
async function mkPage(name) {
  const ctx = await browser.createBrowserContext(); // getrennte Profile -> getrennte localStorage
  const page = await ctx.newPage();
  await page.setViewport({ width: 1100, height: 700 });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  return page;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poll = async (page, fn, timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch (e) {}
    await sleep(250);
  }
  return false;
};

const host = await mkPage('host');
const guest = await mkPage('guest');
const URL = `http://localhost:${PORT}/`;

for (const [p, nm] of [[host, 'HostSpieler'], [guest, 'GastSpieler']]) {
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await poll(p, () => window.__game && !document.getElementById('epilepsy-screen').classList.contains('hidden'), 25000);
  await p.click('#epilepsy-ok').catch(() => {});
  await poll(p, () => !document.getElementById('name-screen').classList.contains('hidden'));
  await p.type('#player-name', nm);
  await p.click('#name-confirm');
  await poll(p, () => !document.getElementById('start-screen').classList.contains('hidden'));
}

// Host: Lobby erstellen
await host.click('#online-button');
await poll(host, () => !document.getElementById('lobby').classList.contains('hidden'));
await host.click('#lobby-create');
const roomOk = await poll(host, () => !document.getElementById('lobby-room').classList.contains('hidden'));

// Gast: Lobby-Browser -> beitreten (+ eigenen Helden wechseln, falls freigeschaltet -> Standard bleibt)
await guest.click('#online-button');
await poll(guest, () => document.querySelector('#lobby-list .li-join') != null);
await guest.click('#lobby-list .li-join');
const guestJoined = await poll(guest, () => !document.getElementById('lobby-room').classList.contains('hidden'));

// Host: Start sichtbar -> klicken
const canStart = await poll(host, () => !document.getElementById('lobby-start').classList.contains('hidden'));
await host.click('#lobby-start');

const hostPlay = await poll(host, () => window.__game.mode === 'play' && window.__game.role === 'host');
const guestPlay = await poll(guest, () => window.__game.mode === 'play' && window.__game.role === 'client');
// Gast bewegt sich; Snapshots sollen Gegner-Ghosts liefern
await guest.keyboard.down('w');
await sleep(2500);
await guest.keyboard.up('w');
const ghosts = await poll(guest, () => window.__game.enemies.ghostCount > 0, 30000);
const heroSync = await host.evaluate(() => ({ remoteHero: window.__game._remoteHeroKey, weapons2: window.__game.weapons2.ownedList().map((w) => w.id) }));
const guestHud = await guest.evaluate(() => ({ hp: window.__game.player.hp, lvl: window.__game.player.level, t: window.__game.runElapsed }));

console.log('lobby:', roomOk, canStart, '| joined:', guestJoined);
console.log('play:', hostPlay, guestPlay, '| ghosts:', ghosts);
console.log('heroSync:', JSON.stringify(heroSync), '| guestState:', JSON.stringify(guestHud));
console.log('errors:', errors.length ? errors : 'none');

await browser.close();
server.kill();
const pass = roomOk && guestJoined && canStart && hostPlay && guestPlay && ghosts && heroSync.weapons2.length >= 1 && errors.length === 0;
console.log(pass ? 'COOP: PASS' : 'COOP: FAIL');
process.exit(pass ? 0 : 1);

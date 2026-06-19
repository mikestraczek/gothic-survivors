// Startet Relay-Server + Web-Server für LAN-Koop und zeigt die Adressen,
// die deine Kollegen im selben Netzwerk öffnen müssen.
//   npm run lan
import { spawn } from 'node:child_process';
import os from 'node:os';

const PORT_WEB = 5199;
const PORT_WS = 8080;

function lanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function run(cmd, args) {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    if (code) console.error(`${cmd} beendet mit Code ${code}`);
  });
  return p;
}

console.log('\n=== Gothic Survivors — LAN-Koop ===');
console.log('Baue das Spiel…\n');

const build = spawn('npx', ['vite', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
build.on('exit', (code) => {
  if (code) {
    console.error('Build fehlgeschlagen.');
    process.exit(code);
  }
  const ips = lanIPs();
  const relay = run('node', ['server/index.js']);
  const web = run('npx', ['vite', 'preview', '--host', '--port', String(PORT_WEB), '--strictPort']);

  setTimeout(() => {
    console.log('\n────────────────────────────────────────────────');
    console.log('  Bereit! Im selben Netzwerk öffnen alle diese URL:');
    if (ips.length === 0) console.log(`   http://localhost:${PORT_WEB}`);
    for (const ip of ips) console.log(`   \x1b[1m\x1b[33mhttp://${ip}:${PORT_WEB}\x1b[0m`);
    console.log('');
    console.log('  Einer klickt "Online-Koop" → "Lobby erstellen" und teilt');
    console.log('  den 4-stelligen Code. Die anderen geben den Code ein → "Beitreten".');
    console.log(`  (Relay-Server läuft automatisch auf Port ${PORT_WS}.)`);
    console.log('  Hinweis: ggf. die Firewall für Ports ' + PORT_WEB + ' und ' + PORT_WS + ' freigeben.');
    console.log('────────────────────────────────────────────────\n');
  }, 1500);

  const stop = () => {
    relay.kill();
    web.kill();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});

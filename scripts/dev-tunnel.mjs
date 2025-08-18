import fs from 'node:fs';
import { spawn } from 'node:child_process';

// Load localtunnel dynamically so no global install is needed
const ensureLt = async () => {
  try {
    return await import('localtunnel');
  } catch {
    console.log('Installing localtunnel (dev dependency)...');
    await new Promise((res, rej) => {
      const p = spawn('npm', ['i', '-D', 'localtunnel'], { stdio: 'inherit' });
      p.on('close', code => code === 0 ? res() : rej(new Error('npm install failed')));
    });
    return await import('localtunnel');
  }
};

const { default: localtunnel } = await ensureLt();

const PORT = 8080;
const WEB_DIR = new URL('../web-ready', import.meta.url).pathname;

// 1) Open tunnel
const tunnel = await localtunnel({ port: PORT, local_host: 'localhost' });
const url = tunnel.url;
console.log(`\n🔗 Tunnel active: ${url}`);

// 2) Write UI .env
const envPath = `${WEB_DIR}/.env`;
fs.writeFileSync(envPath, `VITE_API_BASE=${url}\n`);
console.log(`📝 Wrote ${envPath} with VITE_API_BASE=${url}`);

// 3) Start Vite dev server
console.log('🚀 Starting UI dev server (Vite on port 5173)…');
const vite = spawn('npm', ['run', 'dev', '--', '--port', '5173'], {
  cwd: WEB_DIR,
  stdio: 'inherit'
});

// 4) Keep process alive while tunnel is open
const shutdown = async () => {
  console.log('\n⏹️  Shutting down tunnel and UI…');
  try { vite.kill('SIGINT'); } catch {}
  try { await tunnel.close(); } catch {}
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('\n✅ Open http://localhost:5173 (UI) — it’s already pointed at your tunnel.');
console.log('   Share the backend URL if needed:', url);

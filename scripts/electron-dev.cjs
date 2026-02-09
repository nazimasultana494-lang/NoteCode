#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PREVIEW_URL = process.env.DEV_SERVER_URL || 'http://localhost:5500';

function checkServer(url) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        // Consider any response as server up
        resolve(res.statusCode >= 200 && res.statusCode < 600);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1500, () => {
        try { req.destroy(); } catch {}
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function ensurePreview() {
  if (await checkServer(PREVIEW_URL)) {
    console.log(`[electron-dev] Preview already running at ${PREVIEW_URL}`);
    return null;
  }
  console.log('[electron-dev] Starting preview on 5500...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const preview = spawn(npmCmd, ['run', 'preview', '--', '--port', '5500', '--strictPort'], {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  // Wait up to ~60s for server to come up
  for (let i = 0; i < 60; i++) {
    if (await checkServer(PREVIEW_URL)) {
      console.log('[electron-dev] Preview is up.');
      return preview;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('[electron-dev] Preview failed to start.');
  process.exit(1);
}

async function launchElectron(previewProc) {
  const electronBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron'
  );
  console.log('[electron-dev] Launching Electron...');
  const electron = spawn(electronBin, ['.'], {
    stdio: 'inherit',
    shell: true,
    windowsHide: false,
    env: process.env,
  });
  electron.on('exit', (code) => {
    if (previewProc) {
      try { previewProc.kill(); } catch {}
    }
    process.exit(code ?? 0);
  });
}

(async function main() {
  const previewProc = await ensurePreview();
  await launchElectron(previewProc);
})();

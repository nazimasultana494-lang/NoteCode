import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import * as nodeOs from 'node:os'
import { spawn } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import extractZip from 'extract-zip'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pty
try { pty = require('node-pty') } catch {}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = !app.isPackaged

// Use writable temp paths for Electron data/cache to avoid permission issues
try {
  const userDataPath = path.join(nodeOs.tmpdir(), 'NoteCodeUserData')
  app.setPath('userData', userDataPath)
  const cachePath = path.join(nodeOs.tmpdir(), 'NoteCodeCache')
  app.setPath('cache', cachePath)
  // Reduce cache-related issues on some Windows setups
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
  app.commandLine.appendSwitch('disable-http-cache')
  app.commandLine.appendSwitch('disk-cache-size', '0')
} catch {}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f1419',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    const primary = process.env.DEV_SERVER_URL || 'http://localhost:5500'
    const candidates = [primary, 'http://localhost:5501', 'http://127.0.0.1:5501']
    ;(async () => {
      for (const url of candidates) {
        if (await checkServer(url, 1200)) {
          win.loadURL(url)
          return
        }
      }
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    })()
    // Fallback on load failure
    win.webContents.on('did-fail-load', () => {
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function checkServer(url, timeoutMs = 1500) {
  return new Promise(resolve => {
    try {
      const req = http.get(url, res => {
        resolve(res.statusCode >= 200 && res.statusCode < 600)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(timeoutMs, () => { try { req.destroy() } catch {} ; resolve(false) })
    } catch {
      resolve(false)
    }
  })
}

// Portable tools installation (JDK + GCC/WinLibs)
const toolsBaseDir = path.join(process.env.LOCALAPPDATA || (app.getPath ? app.getPath('localAppData') : '') || nodeOs.tmpdir(), 'NoteCodeTools')
const downloadsDir = path.join(toolsBaseDir, 'downloads')

async function ensureDir(p) {
  try { await fs.mkdir(p, { recursive: true }) } catch {}
}

async function ensureBaseDirs() {
  await ensureDir(toolsBaseDir)
  await ensureDir(downloadsDir)
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NoteCode/0.1 (Electron)'
      }
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return await res.json()
  } catch (e) {
    throw e
  }
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    let file
    try {
      const fsRaw = require('node:fs')
      // Ensure parent dir exists
      try { fsRaw.mkdirSync(path.dirname(targetPath), { recursive: true }) } catch {}
      // Use explicit write flag to avoid unexpected permission issues
      file = fsRaw.createWriteStream(targetPath, { flags: 'w' })
    } catch (e) {
      return reject(e)
    }
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // handle redirects
        try { file.close() } catch {}
        try { require('node:fs').unlink(targetPath, () => {}) } catch {}
        return downloadFile(res.headers.location, targetPath).then(resolve, reject)
      }
      if ((res.statusCode || 0) >= 400) {
        try { file.close() } catch {}
        return reject(new Error('Download failed: ' + res.statusCode))
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(true)))
    })
    req.on('error', err => { try { file.close() } catch {}; reject(err) })
  })
}

async function findInDir(dir, names) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        const found = await findInDir(p, names)
        if (found) return found
      } else {
        if (names.some(n => e.name.toLowerCase() === n.toLowerCase())) return p
      }
    }
  } catch {}
  return ''
}

async function ensureTemurinJdk() {
  const jdkDir = path.join(toolsBaseDir, 'jdk')
  await ensureBaseDirs()
  await ensureDir(jdkDir)
  // Check existing
  const existing = await findInDir(jdkDir, ['javac.exe'])
  if (existing) return path.dirname(existing)
  // Fetch latest release asset from Adoptium (Temurin 21)
  try {
    const apiUrl = 'https://api.github.com/repos/adoptium/temurin21-binaries/releases/latest'
    let assetUrl = ''
    try {
      const json = await fetchJson(apiUrl)
      const asset = (json.assets || []).find(a => /jdk_x64_windows_hotspot.*\.zip$/i.test(a.name || ''))
      if (asset && asset.browser_download_url) assetUrl = asset.browser_download_url
    } catch {}
    // Fallback to a stable latest download URL if API blocked
    if (!assetUrl) assetUrl = 'https://github.com/adoptium/temurin21-binaries/releases/latest/download/OpenJDK21U-jdk_x64_windows_hotspot.zip'
    let zipPath = path.join(downloadsDir, `temurin21-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`)
    try {
      await downloadFile(assetUrl, zipPath)
    } catch (e1) {
      // Fallback to user profile downloads area if LocalAppData is restricted
      const fallbackDir = path.join(process.env.USERPROFILE || nodeOs.tmpdir(), 'NoteCodeDownloads')
      await ensureDir(fallbackDir)
      zipPath = path.join(fallbackDir, `temurin21-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`)
      await downloadFile(assetUrl, zipPath)
    }
    await extractZip(zipPath, { dir: jdkDir })
    try { await fs.unlink(zipPath) } catch {}
    const javac = await findInDir(jdkDir, ['javac.exe'])
    if (javac) return path.dirname(javac)
  } catch {}
  return ''
}

async function ensureWinLibsGcc() {
  const gccDir = path.join(toolsBaseDir, 'winlibs')
  await ensureBaseDirs()
  await ensureDir(gccDir)
  const existingGcc = await findInDir(gccDir, ['gcc.exe'])
  if (existingGcc) return path.dirname(existingGcc)
  try {
    // Use latest WinLibs release (GitHub) by pattern matching assets
    const apiUrl = 'https://api.github.com/repos/brechtsanders/winlibs_mingw/releases/latest'
    const json = await fetchJson(apiUrl)
    const asset = (json.assets || []).find(a => /winlibs-x86_64-.*gcc.*\.zip$/i.test(a.name || ''))
    if (!asset || !asset.browser_download_url) throw new Error('WinLibs asset not found')
    let zipPath = path.join(downloadsDir, `winlibs-gcc-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`)
    try {
      await downloadFile(asset.browser_download_url, zipPath)
    } catch (e1) {
      const fallbackDir = path.join(process.env.USERPROFILE || nodeOs.tmpdir(), 'NoteCodeDownloads')
      await ensureDir(fallbackDir)
      zipPath = path.join(fallbackDir, `winlibs-gcc-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`)
      await downloadFile(asset.browser_download_url, zipPath)
    }
    await extractZip(zipPath, { dir: gccDir })
    try { await fs.unlink(zipPath) } catch {}
    const gcc = await findInDir(gccDir, ['gcc.exe'])
    if (gcc) return path.dirname(gcc)
  } catch {}
  return ''
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('open-file', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openFile'] })
  if (res.canceled || res.filePaths.length === 0) return null
  const filePath = res.filePaths[0]
  const content = await fs.readFile(filePath, 'utf-8')
  return { path: filePath, content }
})

ipcMain.handle('save-file', async (_event, { content, saveAs }) => {
  let target
  if (saveAs) {
    const res = await dialog.showSaveDialog({})
    if (res.canceled || !res.filePath) return null
    target = res.filePath
  } else {
    const res = await dialog.showSaveDialog({})
    if (res.canceled || !res.filePath) return null
    target = res.filePath
  }
  await fs.writeFile(target, content, 'utf-8')
  return { path: target }
})

async function runProcess(cmd, args, options = {}, stdinText = '') {
  return new Promise(resolve => {
    // Support stdin via either the 4th arg or options.stdin
    const optStdin = options && typeof options.stdin === 'string' ? options.stdin : ''
    const stdinToWrite = typeof stdinText === 'string' && stdinText !== '' ? stdinText : optStdin
    const child = spawn(cmd, args, { shell: process.platform === 'win32', ...options })
    let stdout = ''
    let stderr = ''
    child.stdout && child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr && child.stderr.on('data', d => { stderr += d.toString() })
    try {
      if (typeof stdinToWrite === 'string' && stdinToWrite && child.stdin) {
        child.stdin.write(stdinToWrite)
        child.stdin.end()
      }
    } catch {}
    child.on('close', code => resolve({ stdout, stderr, exitCode: code }))
    child.on('error', err => resolve({ stdout, stderr: String(err), exitCode: -1 }))
  })
}

async function hasTool(cmd) {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  const res = await runProcess(locator, [cmd])
  return res.exitCode === 0 && res.stdout.trim().length > 0
}

async function locateTool(cmd) {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  const res = await runProcess(locator, [cmd])
  if (res.exitCode === 0) return res.stdout.trim()
  return ''
}

async function hasWinget() {
  if (process.platform !== 'win32') return false
  try {
    const res = await runProcess('where', ['winget'])
    return res.exitCode === 0
  } catch { return false }
}

async function installViaWinget(id) {
  try {
    const args = ['install', '-e', '--id', id, '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements']
    const res = await runProcess('winget', args, { env: process.env })
    return res.exitCode === 0
  } catch { return false }
}

async function ensureWingetTemurinJdk() {
  if (process.platform !== 'win32') return ''
  const ok = await hasWinget()
  if (!ok) return ''
  const installed = await installViaWinget('EclipseAdoptium.Temurin.21.JDK')
  if (!installed) return ''
  // Try to find javac in common locations or JAVA_HOME
  const pf64 = process.env['ProgramFiles'] || 'C\\Program Files'
  const pfDirs = [
    path.join(pf64, 'Eclipse Adoptium'),
    path.join(pf64, 'Java')
  ]
  for (const base of pfDirs) {
    const found = await findInDir(base, ['javac.exe'])
    if (found) return path.dirname(found)
  }
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, 'bin', 'javac.exe')
    try { await fs.access(candidate); return path.dirname(candidate) } catch {}
  }
  return ''
}

async function ensureMsys2Gcc() {
  if (process.platform !== 'win32') return ''
  const ok = await hasWinget()
  if (!ok) return ''
  // Install MSYS2
  const installed = await installViaWinget('MSYS2.MSYS2')
  if (!installed) return ''
  // Install GCC for UCRT64 (preferred) using pacman
  const bash = 'C\\msys64\\usr\\bin\\bash.exe'
  try { await fs.access(bash) } catch { return '' }
  // Update package database and install GCC
  await runProcess(bash, ['-lc', 'pacman -Sy --noconfirm'])
  await runProcess(bash, ['-lc', 'pacman -S --noconfirm mingw-w64-ucrt-x86_64-gcc'])
  // Return bin path
  const ucrtBin = 'C\\msys64\\ucrt64\\bin'
  const gccPath = path.join(ucrtBin, 'gcc.exe')
  try { await fs.access(gccPath); return ucrtBin } catch {}
  const mingwBin = 'C\\msys64\\mingw64\\bin'
  try { await fs.access(path.join(mingwBin, 'gcc.exe')); return mingwBin } catch {}
  return ''
}

function getWinToolCandidates(tool) {
  const home = process.env.USERPROFILE || ''
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  const msys = 'C:\\msys64'
  const names = [
    path.join(home, 'scoop', 'shims', `${tool}.exe`),
    path.join(home, 'scoop', 'apps', 'gcc', 'current', 'bin', `${tool}.exe`),
    path.join(home, 'scoop', 'apps', 'mingw', 'current', 'bin', `${tool}.exe`),
    path.join(programData, 'chocolatey', 'bin', `${tool}.exe`),
    path.join(msys, 'ucrt64', 'bin', `${tool}.exe`),
    path.join(msys, 'mingw64', 'bin', `${tool}.exe`),
  ]
  return names
}

async function resolveToolPath(tool) {
  // First try PATH
  if (await hasTool(tool)) {
    const p = await locateTool(tool)
    if (p) return p.split(/\r?\n/)[0]
  }
  // Check embedded tools installed by the app
  if (process.platform === 'win32') {
    try {
      if (tool === 'javac' || tool === 'java') {
        const jdkBin = await ensureTemurinJdk()
        if (!jdkBin) {
          // Fallback to winget installation
          const wingetBin = await ensureWingetTemurinJdk()
          if (wingetBin) {
            const candidateWinget = path.join(wingetBin, `${tool}.exe`)
            try { await fs.access(candidateWinget); return candidateWinget } catch {}
          }
        }
        if (jdkBin) {
          const candidate = path.join(jdkBin, `${tool}.exe`)
          try { await fs.access(candidate); return candidate } catch {}
        }
      }
      if (tool === 'gcc' || tool === 'g++') {
        const gccBin = await ensureWinLibsGcc()
        if (!gccBin) {
          const msysBin = await ensureMsys2Gcc()
          if (msysBin) {
            const candidateMsys = path.join(msysBin, tool === 'g++' ? 'g++.exe' : 'gcc.exe')
            try { await fs.access(candidateMsys); return candidateMsys } catch {}
          }
        }
        if (gccBin) {
          const candidate = path.join(gccBin, tool === 'g++' ? 'g++.exe' : 'gcc.exe')
          try { await fs.access(candidate); return candidate } catch {}
        }
      }
    } catch {}
  }
  // Then try common Windows install locations
  if (process.platform === 'win32') {
    const candidates = getWinToolCandidates(tool)
    // Extra candidates for Java tools
    if (tool === 'javac' || tool === 'java') {
      const javaHome = process.env.JAVA_HOME || ''
      const pf64 = process.env['ProgramFiles'] || 'C\\Program Files'
      const pf86 = process.env['ProgramFiles(x86)'] || 'C\\Program Files (x86)'
      const pfDirs = [
        // Common vendor roots (both 64-bit and 32-bit locations)
        path.join(pf64, 'Java'),
        path.join(pf86, 'Java'),
        path.join(pf64, 'Eclipse Adoptium'),
        path.join(pf86, 'Eclipse Adoptium'),
        path.join(pf64, 'Amazon Corretto'),
        path.join(pf86, 'Amazon Corretto'),
        path.join(pf64, 'Zulu'),
        path.join(pf86, 'Zulu'),
        path.join(pf64, 'BellSoft'),
        path.join(pf86, 'BellSoft'),
        path.join(pf64, 'Oracle'),
        path.join(pf86, 'Oracle'),
        path.join(pf64, 'Microsoft'),
        path.join(pf86, 'Microsoft'),
      ]
      const javaBins = []
      if (javaHome) {
        javaBins.push(path.join(javaHome, 'bin', `${tool}.exe`))
      }
      // Common vendor patterns
      const vendorPatterns = [
        'jdk', 'jre', 'jbr', 'corretto', 'temurin', 'zulu', 'liberica', 'oracle'
      ]
      for (const base of pfDirs) {
        try {
          const entries = await fs.readdir(base).catch(() => [])
          for (const entry of entries) {
            const lower = entry.toLowerCase()
            if (vendorPatterns.some(v => lower.includes(v))) {
              javaBins.push(path.join(base, entry, 'bin', `${tool}.exe`))
            }
          }
        } catch {}
      }
      candidates.push(...javaBins)
    }
    for (const p of candidates) {
      try {
        await fs.access(p)
        return p
      } catch {}
    }
  }
  return ''
}

function augmentWinPath(primaryBin) {
  if (process.platform !== 'win32') return process.env.PATH || ''
  const home = process.env.USERPROFILE || ''
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  const msys = 'C:\\msys64'
  const embeddedJdkBin = path.join(toolsBaseDir, 'jdk')
  const embeddedGccBase = path.join(toolsBaseDir, 'winlibs')
  const embeddedGccBinCandidates = [
    path.join(embeddedGccBase, 'mingw64', 'bin'),
    embeddedGccBase
  ]
  const extraBins = [
    path.dirname(primaryBin || ''),
    path.join(home, 'scoop', 'shims'),
    path.join(home, 'scoop', 'apps', 'gcc', 'current', 'bin'),
    path.join(home, 'scoop', 'apps', 'mingw', 'current', 'bin'),
    path.join(programData, 'chocolatey', 'bin'),
    path.join(msys, 'ucrt64', 'bin'),
    path.join(msys, 'mingw64', 'bin'),
    // JAVA_HOME if present
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '',
    // Embedded portable tools (if present)
    path.join(embeddedJdkBin),
    ...embeddedGccBinCandidates
  ]
  const existing = (process.env.PATH || '').split(';')
  const merged = [...extraBins, ...existing].filter(Boolean)
  // De-duplicate
  const seen = new Set()
  const final = merged.filter(p => { if (seen.has(p)) return false; seen.add(p); return true })
  return final.join(';')
}

// Interactive run session management
const sessions = new Map()
function newSessionId() {
  return 's_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex')
}

function emitOutput(event, sessionId, kind, text) {
  try {
    event.sender.send('run-output', { sessionId, kind, text })
  } catch {}
}

function emitExit(event, sessionId, code) {
  try {
    event.sender.send('run-exit', { sessionId, exitCode: code })
  } catch {}
}

ipcMain.handle('run-code', async (_event, { language, source, stdin }) => {
  try {
    const tmpDir = await fs.mkdtemp(path.join(nodeOs.tmpdir(), 'notecode-'))
    if (language === 'java') {
      const javacPath = await resolveToolPath('javac')
      const javaPath = await resolveToolPath('java')
      if (!javacPath || !javaPath) {
        return { supported: false, stderr: 'JDK tools not found. NoteCode attempted to auto-install Temurin JDK. Please ensure network access; reopen the app to retry, or install via winget: winget install EclipseAdoptium.Temurin.21.JDK.' }
      }
      const file = path.join(tmpDir, 'Main.java')
      await fs.writeFile(file, source, 'utf-8')
      const envWithJava = { ...process.env, PATH: augmentWinPath(javacPath) }
      const javac = await runProcess(javacPath, [file], { cwd: tmpDir, env: envWithJava })
      if (javac.exitCode !== 0) {
        return { stdout: javac.stdout, stderr: javac.stderr, exitCode: javac.exitCode }
      }
      const javaRun = await runProcess(javaPath, ['-cp', tmpDir, 'Main'], { cwd: tmpDir, env: envWithJava, stdin: stdin })
      return javaRun
    }
    if (language === 'c') {
      const gccPath = await resolveToolPath('gcc')
      if (!gccPath) {
        const msg = process.platform === 'win32'
          ? 'GCC not found. NoteCode attempted to auto-install WinLibs/MSYS2 GCC. Please ensure network access; reopen the app to retry.'
          : 'GCC not found. Install gcc via your system package manager.'
        return { supported: false, stderr: msg }
      }
      const file = path.join(tmpDir, 'main.c')
      await fs.writeFile(file, source, 'utf-8')
      const out = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main')
      const envWithGcc = { ...process.env, PATH: augmentWinPath(gccPath) }
      const gcc = await runProcess(gccPath, [file, '-o', out], { cwd: tmpDir, env: envWithGcc })
      if (gcc.exitCode !== 0) {
        return { stdout: gcc.stdout, stderr: gcc.stderr, exitCode: gcc.exitCode }
      }
      let run = await runProcess(out, [], { cwd: tmpDir, shell: false, env: envWithGcc, stdin: stdin })
      // Fallback: if run failed without helpful stderr, try via shell
      if ((run.exitCode !== 0) && (!run.stderr || !run.stderr.trim())) {
        const run2 = await runProcess(out, [], { cwd: tmpDir, shell: true, env: envWithGcc, stdin: stdin })
        if (run2.stdout) run.stdout = (run.stdout || '') + run2.stdout
        if (run2.stderr) run.stderr = (run.stderr || '') + run2.stderr
        run.exitCode = run2.exitCode
      }
      return run
    }
    if (language === 'cpp') {
      const gppPath = await resolveToolPath('g++')
      if (!gppPath) {
        const msg = process.platform === 'win32'
          ? 'G++ not found. NoteCode attempted to auto-install WinLibs/MSYS2 GCC. Please ensure network access; reopen the app to retry.'
          : 'G++ not found. Install g++ via your system package manager.'
        return { supported: false, stderr: msg }
      }
      const file = path.join(tmpDir, 'main.cpp')
      await fs.writeFile(file, source, 'utf-8')
      const out = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main')
      const envWithGpp = { ...process.env, PATH: augmentWinPath(gppPath) }
      const gpp = await runProcess(gppPath, [file, '-o', out], { cwd: tmpDir, env: envWithGpp })
      if (gpp.exitCode !== 0) {
        return { stdout: gpp.stdout, stderr: gpp.stderr, exitCode: gpp.exitCode }
      }
      let run = await runProcess(out, [], { cwd: tmpDir, shell: false, env: envWithGpp, stdin: stdin })
      // Fallback: if run failed without helpful stderr, try via shell
      if ((run.exitCode !== 0) && (!run.stderr || !run.stderr.trim())) {
        const run2 = await runProcess(out, [], { cwd: tmpDir, shell: true, env: envWithGpp, stdin: stdin })
        if (run2.stdout) run.stdout = (run.stdout || '') + run2.stdout
        if (run2.stderr) run.stderr = (run.stderr || '') + run2.stderr
        run.exitCode = run2.exitCode
      }
      return run
    }
    // Optional Node runner for JS when using desktop
    if (language === 'javascript') {
      const file = path.join(tmpDir, 'main.js')
      await fs.writeFile(file, source, 'utf-8')
      const nodeRun = await runProcess(process.execPath, [file], { cwd: tmpDir, stdin: stdin })
      return nodeRun
    }
    return { supported: false }
  } catch (e) {
    return { stdout: '', stderr: String(e?.message || e), exitCode: -1 }
  }
})

ipcMain.handle('start-run', async (event, { language, source }) => {
  try {
    const tmpDir = await fs.mkdtemp(path.join(nodeOs.tmpdir(), 'notecode-'))
    let cmd = ''
    let args = []
    let options = { cwd: tmpDir }
    // Compile as needed and prepare command
    if (language === 'java') {
      const javacPath = await resolveToolPath('javac')
      const javaPath = await resolveToolPath('java')
      if (!javacPath || !javaPath) return { supported: false, stderr: 'JDK tools not found. Install a JDK (e.g., Temurin via winget: winget install EclipseAdoptium.Temurin.21.JDK) and ensure JAVA_HOME/bin or javac/java are on PATH.' }
      const file = path.join(tmpDir, 'Main.java')
      await fs.writeFile(file, source, 'utf-8')
      const envWithJava = { ...process.env, PATH: augmentWinPath(javacPath) }
      const javac = await runProcess(javacPath, [file], { cwd: tmpDir, env: envWithJava })
      if (javac.exitCode !== 0) return { stdout: javac.stdout, stderr: javac.stderr, exitCode: javac.exitCode }
      cmd = javaPath; args = ['-cp', tmpDir, 'Main']; options = { cwd: tmpDir, env: envWithJava }
    } else if (language === 'c') {
      const gccPath = await resolveToolPath('gcc')
      if (!gccPath) {
        const msg = process.platform === 'win32'
          ? 'GCC not found. Install via MSYS2 (mingw-w64-ucrt-x86_64-gcc) or Chocolatey (choco install mingw), then add bin to PATH.'
          : 'GCC not found. Install gcc via your system package manager.'
        return { supported: false, stderr: msg }
      }
      const file = path.join(tmpDir, 'main.c')
      await fs.writeFile(file, source, 'utf-8')
      const out = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main')
      const envWithGcc = { ...process.env, PATH: augmentWinPath(gccPath) }
      const gcc = await runProcess(gccPath, [file, '-o', out], { cwd: tmpDir, env: envWithGcc })
      if (gcc.exitCode !== 0) return { stdout: gcc.stdout, stderr: gcc.stderr, exitCode: gcc.exitCode }
      cmd = out; args = []; options = { cwd: tmpDir, shell: false, env: envWithGcc }
    } else if (language === 'cpp') {
      const gppPath = await resolveToolPath('g++')
      if (!gppPath) {
        const msg = process.platform === 'win32'
          ? 'G++ not found. Install via MSYS2 (mingw-w64-ucrt-x86_64-gcc includes g++) or Chocolatey, then add bin to PATH.'
          : 'G++ not found. Install g++ via your system package manager.'
        return { supported: false, stderr: msg }
      }
      const file = path.join(tmpDir, 'main.cpp')
      await fs.writeFile(file, source, 'utf-8')
      const out = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main')
      const envWithGpp = { ...process.env, PATH: augmentWinPath(gppPath) }
      const gpp = await runProcess(gppPath, [file, '-o', out], { cwd: tmpDir, env: envWithGpp })
      if (gpp.exitCode !== 0) return { stdout: gpp.stdout, stderr: gpp.stderr, exitCode: gpp.exitCode }
      cmd = out; args = []; options = { cwd: tmpDir, shell: false, env: envWithGpp }
    } else if (language === 'javascript') {
      const file = path.join(tmpDir, 'main.js')
      await fs.writeFile(file, source, 'utf-8')
      cmd = process.execPath; args = [file]
    } else {
      return { supported: false }
    }
    // Spawn interactive process
    const sessionId = newSessionId()
    // Prefer PTY for interactive runs to ensure prompts flush
    if (pty) {
      try {
        const p = pty.spawn(cmd, args, {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: options.cwd,
          env: { ...(options.env || process.env), TERM: 'dumb' }
        })
        sessions.set(sessionId, { kind: 'pty', p })
        p.onData(d => emitOutput(event, sessionId, 'stdout', d))
        p.onExit(ev => { emitExit(event, sessionId, ev.exitCode ?? 0); sessions.delete(sessionId) })
        return { sessionId }
      } catch (e) {
        // Fall back to plain spawn on error
      }
    }
    const child = spawn(cmd, args, { shell: process.platform === 'win32', ...options })
    sessions.set(sessionId, { kind: 'child', child })
    child.stdout && child.stdout.on('data', d => emitOutput(event, sessionId, 'stdout', d.toString()))
    child.stderr && child.stderr.on('data', d => emitOutput(event, sessionId, 'stderr', d.toString()))
    child.on('close', code => { emitExit(event, sessionId, code); sessions.delete(sessionId) })
    child.on('error', err => { emitOutput(event, sessionId, 'stderr', String(err)); emitExit(event, sessionId, -1); sessions.delete(sessionId) })
    return { sessionId }
  } catch (e) {
    return { stdout: '', stderr: String(e?.message || e), exitCode: -1 }
  }
})

ipcMain.handle('send-stdin', async (_event, { sessionId, data }) => {
  const sess = sessions.get(sessionId)
  if (!sess) return { ok: false, error: 'No such session' }
  try {
    const text = typeof data === 'string' ? data : String(data)
    if (sess.kind === 'pty' && sess.p) {
      sess.p.write(text)
    } else if (sess.kind === 'child' && sess.child && sess.child.stdin) {
      sess.child.stdin.write(text)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
})

ipcMain.handle('stop-run', async (_event, { sessionId }) => {
  const sess = sessions.get(sessionId)
  if (!sess) return { ok: false }
  try {
    if (sess.kind === 'pty' && sess.p) {
      try { sess.p.kill() } catch {}
    } else if (sess.kind === 'child' && sess.child) {
      try { sess.child.kill('SIGKILL') } catch {}
    }
  } catch {}
  sessions.delete(sessionId)
  return { ok: true }
})

ipcMain.handle('check-tools', async () => {
  const javacPath = await resolveToolPath('javac')
  const javaPath = await resolveToolPath('java')
  const gccPath = await resolveToolPath('gcc')
  const gppPath = await resolveToolPath('g++')
  return {
    javac: { present: !!javacPath, path: javacPath },
    java: { present: !!javaPath, path: javaPath },
    gcc: { present: !!gccPath, path: gccPath },
    gpp: { present: !!gppPath, path: gppPath }
  }
})

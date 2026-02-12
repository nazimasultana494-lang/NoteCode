Fuck 

Modern, notepad-like code editor with professional syntax highlighting. Web-based (runs in browser) and packaged as a Windows desktop app via Electron.

## Features
- Syntax highlighting for HTML, CSS, JavaScript, Java, C, C++ (CodeMirror 6)
- Clean toolbar: New, Open, Save, Save As
- Language selection, theme (dark/light), font size control
- Run: HTML/CSS/JS preview with console capture in-app
- Run (desktop): Java/C/C++ via system compilers (JDK, GCC/G++)
- Web: File System Access API for open/save; fallback to download
- Desktop: Electron dialogs for open/save

## Quick Start (Web)

```bash
# In the NoteCode folder
npm install
npm run dev
```
Open http://localhost:5590 in your browser.

## Desktop (Electron) Dev

```bash
npm run electron:dev
```
This runs Vite and launches Electron pointing to the dev server.

### Running Code
- HTML/CSS/JS: Use the Run button to open Preview and Console. JS `console.log` is captured.
- Java/C/C++: Requires system toolchains installed and on PATH:
	- Java: JDK (`javac`, `java`)
	- C: GCC (`gcc`)
	- C++: G++ (`g++`)
	Click Run. Output appears in the Console pane. Build timeouts after ~20s.

## Build Web

```bash
npm run build
npm run preview
```

## Package Windows Desktop App

```bash
npm run package:win
```
The installer/exe will be generated in `dist-electron/`.

### First-run toolchains (Desktop)
- NoteCode auto-installs required toolchains if missing:
	- Temurin JDK 21 (javac/java)
	- WinLibs GCC (gcc/g++) or MSYS2 GCC via winget
- Tools are stored under `%LOCALAPPDATA%\NoteCodeTools\` with PATH augmented during runs.

## Deploy to Web (GitHub Pages)

This repo includes a GitHub Actions workflow to build and deploy the web app to GitHub Pages.

### Steps
1. Push the repo to GitHub: `iteducationcenter77-pixel/NoteCode`
2. In GitHub → Settings → Pages, set Source to “GitHub Actions”.
3. On push to `main`, the workflow builds with Vite and publishes `dist/`.

After deployment, your app will be available at:

- `https://iteducationcenter77-pixel.github.io/NoteCode/`

If you host under a subpath, the Vite `base` is set to `./` so relative assets resolve correctly.

## Alternative Hosting
- Netlify: set build command to `npm run build` and publish directory to `dist`.
- Vercel: set framework “Vite”, build command `npm run build`, output `dist`.

## Web Run for Java/C/C++
- The web version uses the public Piston API to compile/run Java, C, and C++ in-browser.
- For full features (interactive stdin, larger programs, local toolchains), use the desktop app.
- If network blocks the API, runs may fail; desktop app will still work with auto-installed toolchains.

## Notes
- C/C++ highlighting uses CodeMirror's `lang-cpp` which covers both.
- Desktop app compiles/runs Java/C/C++ using installed or auto-installed toolchains.
- If the File System Access API isn't supported, Save/Save As download the file instead.
 - Native run uses your system compilers; ensure they are installed and available in PATH.

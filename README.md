# Klaviyo

MIDI keyboard visualizer and compositional AI assistant.  
Built with Electron 38+ for macOS Tahoe (Apple Silicon).

---

## First-time setup

### 1. Prerequisites

Make sure you have Node.js installed. Check with:
```bash
node --version   # should be v20 or v22
```

If not installed, get it from https://nodejs.org (choose the LTS version).

### 2. Install dependencies

```bash
cd klaviyo
npm install
```

### 3. Rebuild node-midi for your machine

`node-midi` is a native C++ module — it talks directly to macOS CoreMIDI.
It must be compiled for your exact Node + Electron version:

```bash
npm run rebuild
```

This runs `electron-rebuild` and takes ~30 seconds. You'll see it compile
the native addon for Apple Silicon. You only need to do this once
(or after updating Electron).

### 4. Connect your MIDI keyboard

Plug in via USB. macOS Tahoe auto-detects class-compliant MIDI devices —
no drivers needed for most modern keyboards.

### 5. Run the app

```bash
npm start
```

The piano window opens. If your keyboard is connected, it auto-connects
to the first available MIDI port. You'll see a green dot in the header.

Play some keys — they should light up in velocity-sensitive color:
- **Soft touch** → cool blue
- **Medium** → indigo/purple  
- **Hard hit** → warm amber/orange

---

## Troubleshooting

**No MIDI device shown:**
- Make sure keyboard is plugged in *before* launching the app
- Click the ↺ refresh button in the header
- Use the device dropdown to select your keyboard manually

**node-midi build fails:**
```bash
# Make sure Xcode Command Line Tools are installed
xcode-select --install

# Then retry
npm run rebuild
```

**App is slow / stuttery:**
- You're on Tahoe 26.5 which has the Electron performance fix — this
  shouldn't happen. If it does, make sure you're running `npm install`
  fresh (which gets Electron 38+).

---

## Dev mode (with DevTools)

```bash
npm run dev
```

---

## Project structure

```
klaviyo/
├── src/
│   ├── main/
│   │   └── main.js          ← Electron main process, MIDI, IPC
│   ├── preload/
│   │   └── preload.js       ← Secure IPC bridge
│   └── renderer/
│       ├── index.html       ← App shell
│       ├── styles.css       ← Dark studio UI
│       ├── piano.js         ← SVG 88-key keyboard builder
│       └── app.js           ← MIDI events, lighting, chord detection
├── package.json
└── README.md
```

---

## Coming next

- [ ] Phase 2: Chord progression suggestions (Markov chain, genre-aware)
- [ ] Phase 3: Pianist voicing library (Herbie Hancock, Robert Glasper, Bill Evans)
- [ ] Phase 4: AI chord assistant via Claude API
- [ ] Phase 5: Packaging → `.dmg` installer

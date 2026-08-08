# Voice Me

Electron desktop app (macOS, Apple Silicon) — a MIDI keyboard visualizer and
harmony teacher. Plug in a MIDI keyboard, play, and the app names what you
played, suggests where to go next, and shows it on a grand staff.

## Commands

```bash
npm start          # run the app
npm run dev        # run with detached DevTools
npm test           # harmony invariants (node, no framework)
npm run rebuild    # recompile node-midi against Electron (after Electron bumps)
npm run build      # electron-builder → .dmg + .zip
```

`npm run rebuild` is required after a fresh `npm install` or any Electron
version change — `midi` is a native CoreMIDI addon.

## Architecture

Three Electron processes, the usual split:

- `src/main/main.js` — window creation + all MIDI I/O. Translates raw status
  bytes into `{type, note, velocity, channel}` and pushes them over IPC. Polls
  `getPortCount()` every 1.5s so hot-plugging a keyboard works.
- `src/preload/preload.js` — context-isolated bridge exposing `window.midi`.
  Never expose raw `ipcRenderer`.
- `src/renderer/` — everything else. **Plain global scripts, no bundler, no
  modules.**

### Renderer modules

| File | Global | Role |
|---|---|---|
| `harmony.js` | `Harmony` | **The harmony engine.** Recognition, colour, voicing, voice leading, devices, suggestion |
| `piano.js` | `Piano` | SVG keyboard (A1–C7, MIDI 33–96) and note spelling |
| `app.js` | `VoiceMe`, `VoiceMeBus` | MIDI wiring, key lighting, chord readout |
| `voicings.js` | `VoicingLibrary` | Static curated voicing data |
| `panel.js` | `VoiceMePanel` | Voicing library browser + progression trainer |
| `audio.js` | `AudioEngine` | Rhodes sampler, 4 velocity layers |
| `compose.js` | `Compose` | Compose mode: the device tree |
| `notation.js` | `VoiceMeNotation` | Grand staff (VexFlow) |
| `settings.js` | `VoiceMeSettings` | Theme picker |
| `tone.js` / `vexflow.js` | `Tone` / `Vex` | Vendored libraries |

**Load order is grouped into three tiers in `index.html`** (libraries → engines
→ UI). Within a tier order doesn't matter. Nothing reads another module's
global at load time, so a late-arriving file is found when first *called*
rather than captured as `undefined` at parse time.

### How modules talk

`app.js` broadcasts `notes` on `VoiceMeBus` whenever what's sounding changes.
`panel.js`, `compose.js` and `notation.js` subscribe. **`app.js` does not know
its consumers exist** — adding a feature never means editing it.

## The harmony engine

Everything lives in `harmony.js`. It runs in the browser (`window.Harmony`) and
in Node (`module.exports`), which is what lets `npm test` exercise it headless.

### Two orthogonal dials

- **Spice** (`0` basic / `1` colourful / `2` complex) — *which pitch classes*
- **Shape** (`minimal` / `closed` / `open` / `cluster`) — *how they spread
  across registers*

They compose. An open triad and a minimal altered dominant are both
expressible. Keep them separate: the predecessor conflated them (`mode:'open'`
silently added 9ths and 13ths, which is spice's job) and half the grid was
unreachable.

### Vocabulary

One table, `QUALITIES`, keyed by canonical quality token. `core` tones are
always voiced; `ext` tones are volunteered per spice tier. `PATTERNS` holds the
finer-grained recognition spellings, each pointing at a canonical quality via
`voiceAs` — **that replaced `compose.js`'s `QUALITY_MAP`**, so the
correspondence lives in the data and can't drift.

`TIER` gates *suggestions* by the dial; recognition is never gated. If you play
it, the app names it. `PLAINER` maps a quality down when the dial is below its
tier, so a device asking for `7alt` at basic still runs as `7` — the move
survives, the colour doesn't.

### Voice leading

`lead()` pins common tones at exact pitch (zero motion), then does exhaustive
minimal-motion matching on the rest with branch-and-bound. Returns
`{held, moved, appeared, released}` covering **every** note on both sides.

There is deliberately **no bail-out path**. Register problems are fixed, not
escaped. The predecessor discarded the whole mapping when it judged a result
"muddy" and returned a single pair, which is why compose mode used to light one
key for a four-note chord.

### Key lighting

`fingering(prevNotes, targetNotes)` derives `{hold, press, lift}` **by set
difference**, not from the voice-leading mapping. The three cues are disjoint
and cover exactly the right keys by construction, so a flaw in the mapping can
never light the wrong keys. The mapping is still the right source for *arrows*.

`app.js` has one cue object and one repaint; each key's colour is a pure
function of (is it down?, what does the cue ask?). The predecessor kept three
independent sets whose clear-functions disagreed about precedence.

## Devices

Branches are **named harmonic moves**, not scoring winners. Search only breaks
ties between valid instances of a device; it never decides which devices exist.

Each device emits a **sequence of 1–3 chords**, because the move is the lesson —
`A7/C♯ → Dm7` teaches the bass climb C–C♯–D, and `A7/C♯` alone teaches nothing.
Compose mode walks each step in turn, then plants the device's **last** chord as
the new tree root.

Slots are functional categories, and two of them guarantee bass motion:

| Slot | Meaning |
|---|---|
| `cadence` | strongest functional destination |
| `ascending` | bass climbs by step or half step |
| `descending` | bass falls by step or half step |
| `secondary` | secondary dominant / modulation |
| `colour` | reharmonisation, tritone sub, non-functional sonority |

Each branch carries `variants[]` — the same function in other colourings (F7,
F9, F13, F7♭9, F7alt) for the hover menu, so one function doesn't consume four
branches.

### The two non-functional device families

These have no roman numeral, and they matter — they're most of the Shorter /
Hancock / Glasper vocabulary. Both are **common-tone devices where the bass
carries the motion**:

- **`chromatic-sonority`** is *found*, not generated: hold the upper structure,
  slide the bass a half step, and name what results. It reads the notes
  **actually held**, not the chord symbol — Fm11 voiced `F A♭ B♭ E♭` gives
  Emaj7♯11 holding 3 voices, but the same chord with a natural 5 gives a
  different answer. An engine working from symbols cannot find these.
- **`modal-oscillation`** trades chords that share nearly everything. C6/9 is a
  strict *subset* of Dm11, so they swap with only the bass moving (Shorter,
  "Mahjong").

## Conventions

- Pitch classes 0–11 and MIDI numbers (middle C = 60). Quality tokens are
  strings (`maj7`, `m7b5`, `7alt`, `7b9(13)`) — the canonical set is
  `QUALITIES`.
- Enharmonic spelling from `Harmony.SHARP_ROOT_PCS` — sharps for D E G A B,
  flats otherwise. `Harmony.glyphs()` converts `#`/`b` → `♯`/`♭` for display.
- Theming is CSS custom properties on `[data-theme]`. SVG should read
  `--text-primary` / `--text-muted` / `--accent`. Key-lighting colours in
  `app.js` are deliberately literal — they're semantic state, not theme.
- Column-aligned assignments and `── section ──` comment rules are house style.
- CSP is strict (`default-src 'self'`). No CDN scripts — vendored libs only.

## Testing

`npm test` runs 43 invariants over every root × quality × spice × shape, plus
realistic human voicings (close, shell, rootless) as voice-leading seeds. No
framework.

Seeding matters: an early sweep reported 0% failures because it fed the engine
its *own* output, which is already well-spaced. Real players play close
voicings, and that's where the bugs were. Seed from `HUMAN_SHAPES`.

Two families are exempt from the strict root assertion because the ambiguity is
in the music: `dim7` is symmetric, and inverted (`invertBass`) shapes are
genuinely ambiguous — C6 over E really is Am7/E.

## Spaces in the install path

Two separate things break when the app lives under a path containing a space,
and `productName` is "Voice Me" — so the packaged app is
`/Applications/Voice Me.app/` and **every** install hits this.

- **Audio.** `Tone.Sampler`'s `urls` map cannot be used. Tone normalises each
  URL by re-encoding the whole pathname a segment at a time, and the pathname
  is already percent-encoded, so `Voice%20Me` becomes `Voice%2520Me` and every
  fetch 404s. Worse, it fails *silently*: the load promise never settles and
  the Sound button spins on "Loading…" forever. `audio.js` therefore fetches
  and decodes the samples itself and calls `sampler.add(note, buffer)`. Don't
  "simplify" it back to a `urls` map.
- **Native rebuild.** node-gyp warns; `npm run rebuild` works anyway.

Sample filenames also need encoding for a second reason — `D#1-p.wav` has a `#`
in it, which is a URL fragment delimiter. Ten of the 21 sampled notes are
sharps. `sampleUrl()` in `audio.js` handles both problems.

## Known gaps

- **`src/renderer/sounds/Samples/` is empty in the exported zip only** — Jared
  has the 80 Rhodes samples locally (`{note}-{p|mp|mf|f}.wav`, one every 3
  semitones A0–A5). They are gitignored; 429 MB does not belong in the repo.
- No linter.
- `npm audit` reports vulnerabilities in the electron-builder dev chain; they
  don't affect the shipped app.
- The in-app browser preview caches referenced `.js` files, so it shows stale
  code after edits. Verify renderer changes by running the real app
  (`npm start`) and checking for `ERROR:CONSOLE` in the output.

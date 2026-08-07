# Voice Me

Electron desktop app (macOS, Apple Silicon) — a MIDI keyboard visualizer and
harmony teacher. Plug in a MIDI keyboard, play, and the app names what you
played, suggests where to go next, and shows it on a grand staff.

## Commands

```bash
npm start          # run the app
npm run dev        # run with detached DevTools
npm run rebuild    # recompile node-midi against Electron (after Electron bumps)
npm run build      # electron-builder → .dmg + .zip
```

`npm run rebuild` is required after a fresh `npm install` or any Electron
version change — `midi` is a native CoreMIDI addon.

## Architecture

Three Electron processes, the usual split:

- `src/main/main.js` — window creation + all MIDI I/O. Opens a `midi.Input`,
  translates raw status bytes into `{type, note, velocity, channel}` events, and
  pushes them to the renderer over IPC. Polls `getPortCount()` every 1.5s so
  hot-plugging a keyboard just works.
- `src/preload/preload.js` — context-isolated bridge exposing `window.midi`.
  Never expose raw `ipcRenderer`.
- `src/renderer/` — everything else. **Plain global scripts, no bundler, no
  modules.** Each file IIFEs or declares globals and hangs its public API on
  `window`. Load order in `index.html` is load-bearing.

### Renderer modules and their globals

Loaded in this order (see `index.html`):

| File | Global | Role |
|---|---|---|
| `piano.js` | `Piano` | Builds the 88-key… actually A1–C7 (MIDI 33–96) SVG keyboard; note-name spelling helpers |
| `app.js` | `VoiceMe` | Entry point. MIDI→visual wiring, sustain pedal, chord **recognition**, key-lighting API |
| `voicings.js` | `VoicingLibrary` | Static curated data: ~11 families of jazz voicings with pianist/genre tags |
| `panel.js` | `VoiceMePanel` | Bottom drawer: voicing library browser + progression trainer + "In The Wild" banner |
| `tone.js` | `Tone` | Vendored Tone.js v14 |
| `audio.js` | `AudioEngine` | Fender Rhodes sampler, 4 velocity layers |
| `voicing.js` | `Voicing` | Voicing **arranger**: modes (closed/open/cluster/minimal) + `voiceLead()` |
| `engine.js` | `VoiceEngine` | Spice-aware voicing **generator** + `voiceLeadFrom()` + narration |
| `suggest.js` | `Suggest` | Chord **suggestion** engine — what chord comes next |
| `compose.js` | `Compose` | Compose mode: the chord tree, ledger, leaf animations |
| `settings.js` | `VoiceMeSettings` | Theme picker (light/dark), persisted to localStorage |
| `vexflow.js` | `Vex` | Vendored VexFlow v3 |
| `notation.js` | `VoiceMeNotation` | Grand staff rendering: live / voicing / progression / composition modes |

`app.js` is the hub — `notifyPanel()` fans held notes out to the panel, compose
mode, and notation on every note event.

## The harmony stack (the interesting part)

There are four music-theory files, but only **three are live**. Know which one
you're touching — and note that `voicing.js` is not in the running path at all.

1. **Recognition** — `app.js`. `CHORD_PATTERNS` + `findBestChord()` score every
   pitch class as a candidate root against ~60 interval patterns. The 5th is
   optional; bonuses for bass-as-root, clean matches, and dominant character.
   Two exits: `detectChord()` (display string, handles inversions and
   slash-chord readings) and `identifyChordPC()` (structured
   `{rootPC, quality, suffix, bassPC}` for compose mode). A chord with no 3rd
   and no sus is deliberately left unnamed.

2. **Suggestion** — `suggest.js`. Given the current chord + the committed trail,
   infers a key, generates candidates from five families (functional,
   chromatic-bass, 1–2 voice reharm/slip, tritone sub, inversion), scores them
   on `base + voice-leading smoothness + tendency-tone idioms + dominant pull`,
   and spreads winners across five named slots: **Home, Lift, Shadow, Slide,
   Far**. Returns notes + a voice-leading mapping per branch.

3. **Voicing (spice-aware)** — `engine.js`. `voiceChord()` / `voiceLeadFrom()`.
   Core tones are always voiced (never strips what the player played);
   the **spice dial** (0 basic / 1 colorful / 2 complex) only widens which
   extensions the engine *volunteers*. This is what compose mode uses.

4. **`voicing.js` — DEAD CODE.** All 510 lines are unreachable except
   `nearestOctave()`, a 9-line helper called once from [suggest.js:225](src/renderer/suggest.js:225).
   Its `QUALITY` table, the four arrange modes (closed/open/cluster/minimal),
   and `voiceLead()` — which pins common tones at *exact* pitch and does
   exhaustive minimal-motion matching — are never invoked by anything. It is the
   best voice-leader in the codebase and it has never run. Verified by grep:
   `window.Voicing` appears exactly once outside its own file.

Compose mode lights the keyboard from a `{held, moved, appeared, released}`
mapping:
- **blue** = held, keep these down
- **gold** = press these (`appeared` + arrival of `moved` voices)
- **grey** = lift these (`released` + departure of `moved` voices)
- **amber arrows** over the keyboard = a voice gliding from → to
- **green flash** = you played it right

That mapping is produced by `suggest.js` `voiceCandidate()`, which has two
paths, and **neither fills all four buckets**:
- reharm/slip candidates build `held`/`moved`/`released` inline; `appeared`
  stays empty.
- everything else goes through `ENG.voiceLeadFrom()` → `toMapping()`, which
  hardcodes `appeared: []` and `released: []`.

So `appeared` is never populated by any path, and `released` only on a minority
of branches. See Known bugs.

## Compose mode

`compose.trail` is the song: `[seed, ...committed]`, and `currentChord` is
always `trail[last]`. Free play *edits* the tip; picking a branch and playing it
*appends*; Backspace pops and re-derives the tree (so undo is exact).

The tree only rebuilds on an **attack** (a newly-pressed note) — releasing keys
must never regenerate it, or suggestions vanish the moment you lift your hands
to play one. `compose.prevHeld` is what distinguishes attack from release.

The staff shows the last 4 chords (`STAFF_WINDOW`), one chord per measure in
`compositionMode`.

## Conventions

- Music is spoken in **pitch classes 0–11** and **MIDI numbers** (middle C = 60).
  Quality tokens are strings like `maj7`, `m7b5`, `7alt`, `7b9(13)` — the
  canonical set lives in `voicing.js` `QUALITY` and `suggest.js` `Q`.
  `compose.js` `QUALITY_MAP` translates recognizer suffixes → canonical tokens;
  **add new suffixes to both ends or they silently fall back.**
- Enharmonic spelling comes from `Piano.SHARP_ROOT_PCS` — sharps for D E G A B,
  flats otherwise. `Piano.musicalGlyphs()` converts `#`/`b` → `♯`/`♭` for display.
- Theming is CSS custom properties on `[data-theme]`. Anything drawing to SVG
  should read `--text-primary` / `--text-muted` / `--accent`, not hardcode ink.
  Key-lighting colors in `app.js` are deliberately literal hex (they're semantic
  state, not theme).
- Column-aligned assignments and `── section ──` comment rules are the house
  style throughout. Match it.
- CSP in `index.html` is strict (`default-src 'self'`). No CDN scripts —
  vendored libs only.

## Known bugs

**Compose mode lights too few keys (~5.5% of branches).**
[engine.js:121](src/renderer/engine.js:121) — when `voiceLeadFrom()` judges its
result `muddy()`, it discards the voice-led version and returns the freshly
generated voicing with a mapping of **exactly one pair** (bass → bass). Every
upper voice vanishes from the mapping, so compose mode lights one key for a
four-note chord, and `checkComposeMatch()` demands exact set equality — so the
chord can never be completed. Measured over 6300 branches seeded with realistic
close / shell / rootless voicings: 345 branches broken, **all** of them this
collapse. Concentrated in the Shadow slot (141) and in close/rootless voicings,
i.e. what a jazz player actually plays. Example: play `Cmaj7` as `C3 E3 G3 B3`,
pick Shadow → `Am7`; you must play `A2 C4 G4 B4` but only `A2` lights.

**Paint layers fight each other (~9.7% of branches).**
`app.js` keeps three independent highlight sets (`suggestionKeys`,
`heldSuggestionKeys`, `releasedKeys`) with three `clear*` functions whose
restore logic disagrees about which other layer wins. `clearSuggestionKeys()`
restores to the default gradient without checking the other two, so clearing
gold also wipes blue and grey. `compose.js` `selectBranch()` calls them in a
fixed order (`setSuggestionKeys` → `setHeldKeys` → `setReleasedKeys`), so
whenever a key is both a `moved.to` and some other voice's `moved.from` — 9.7%
of branches — grey paints over gold and the key reads as "lift" when it should
read "press".

## Known gaps

- **`src/renderer/sounds/Samples/` is empty in the exported zip only** — Jared
  has the 80 Rhodes samples locally (`{note}-{p|mp|mf|f}.wav`, one every 3
  semitones A0–A5); they were stripped for size. Audio works on his machine.
- No tests, no linter.
- `npm audit` reports vulnerabilities in the electron-builder dev chain; they
  don't affect the shipped app.
- The project directory has a space in its path, which node-gyp warns about.
  The rebuild works anyway, but it's a known fragility.

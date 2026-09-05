# Voice Me

A MIDI keyboard visualizer and harmony teacher for macOS. Plug in a keyboard,
play, and it names what you played, writes it on a grand staff, and suggests
where to go next.

### [→ Download the beta](https://trevb11.github.io/voice-me/)

macOS 12 or newer, Apple Silicon or Intel. A MIDI keyboard is required.
Install instructions are on that page — the app is unsigned, so there's one
Terminal command to run the first time.

---

## What it does

Play anything and the app names it, including rootless left-hand shapes and
slash basses. Turn on the sampled Rhodes and it plays back what you're holding.

**Compose mode** is the interesting half. Play a chord and it grows a tree of
suggestions, each one a *named harmonic move* — a passing diminished, a
secondary dominant, a modal shift — with its roman numerals above it. Branches
are hard-wired music theory, not search results; scoring only breaks ties
between valid instances of a device. Pick one and the keyboard tells your
hands what to do: hold these, press those, let that one go.

Two dials shape the suggestions, and they're orthogonal. **Spice** decides
*which pitch classes* (basic / colourful / complex), **shape** decides *how they
spread* across registers (minimal / closed / open / cluster).

Set a key centre and the whole thing becomes functional rather than
chord-relative — a lone `Gm9` stops reading as i in G minor and starts reading
as ii in F. Some branches modulate, and playing one moves the key with you.

---

## Running from source

You need Node 20 or newer. Everything else comes from `npm install`.

```bash
npm install
npm run rebuild    # compile node-midi against Electron — required
npm start
```

`npm run rebuild` is not optional on a fresh clone. `midi` is a native
CoreMIDI addon and has to be compiled against your exact Electron version.
Re-run it after any Electron bump.

**The Rhodes samples are not in the repo** — they're 22 MB and separately
licensed. Without them the app runs fine and stays silent. To install them:

```bash
npm run samples -- /path/to/jRhodes3d
```

### Commands

| | |
|---|---|
| `npm start` | run the app |
| `npm run dev` | run with DevTools detached |
| `npm test` | 66 harmony invariants — plain node, no framework |
| `npm run test:ui` | compose-mode flow, driven inside Electron |
| `npm run rebuild` | recompile node-midi against Electron |
| `npm run samples -- <pack>` | install a sample pack and write its manifest |
| `npm run icon` | regenerate the app icon |
| `npm run build` | electron-builder → `.dmg` + `.zip` |

`npm run build` targets your own architecture. Add `--x64` for an Intel build;
it cross-compiles from Apple Silicon, node-gyp's space-in-path warning
notwithstanding.

---

## Layout

```
src/
  main/main.js          Electron main process — window + all MIDI I/O
  preload/preload.js    context-isolated bridge, exposes window.midi
  renderer/
    harmony.js          the harmony engine — recognition, voicing,
                        voice leading, devices, suggestion
    app.js              MIDI wiring, key lighting, chord readout
    piano.js            SVG keyboard, A1–C7
    compose.js          compose mode: the device tree
    notation.js         grand staff (VexFlow)
    panel.js            voicing library + progression trainer
    audio.js            sampled instrument, driven by instrument.json
    voicings.js         curated voicing data
    settings.js         theme picker
    tone.js vexflow.js  vendored libraries
test/
  harmony.test.js       invariants over every root × quality × spice × shape
  ui/                   compose-flow test, runs in Electron
build/                  icon, sample installer, packaging hooks
docs/index.html         the beta install page (GitHub Pages serves this)
```

Renderer modules are **plain global scripts — no bundler, no modules.**
`app.js` broadcasts note changes on an event bus and doesn't know who's
listening, so adding a feature never means editing it.

[`CLAUDE.md`](CLAUDE.md) is the real architecture document: how voice leading
pins common tones, why devices beat scoring, what the key centre changes, and
which mistakes are already made and fixed.

---

## Troubleshooting

**No MIDI device shown.** Plug the keyboard in *before* launching, then hit the
↺ button in the header, or pick it from the dropdown. The app polls for new
ports every 1.5s, so hot-plugging usually just works.

**`npm run rebuild` fails.** You need the Xcode command line tools:

```bash
xcode-select --install
```

**Keys light up but there's no sound.** The samples aren't installed — see
above. The Sound button also has to be switched on, and it takes a moment to
decode on first use.

---

## Credits

The Rhodes sound is **jRhodes3d** by Jeff Learman, a sampled 1977 Rhodes Mark I
Stage 73, used under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Source: <https://github.com/sfzinstruments/jlearman.jRhodes3d>

Anything you record with the app is yours — the sample licence treats playing
the instrument like playing a real one. The non-commercial term restricts
redistributing the app, not the music you make with it.

Voice Me is MIT licensed, and built on Electron, Tone.js, VexFlow and node-midi.

# Voice Me — beta

Thanks for trying this. It's a MIDI keyboard visualizer and harmony teacher:
plug in a keyboard, play, and it names what you played, shows it on a grand
staff, and suggests where to go next.

---

## Before you start

- **A Mac with Apple Silicon** (M1 or later) running **macOS 12 or newer**.
  This build won't run on an Intel Mac — tell me if you have one and I'll make
  a build for it.
- **A MIDI keyboard**, connected by USB. Plug it in before launching. No
  drivers needed for most keyboards.
- Headphones or speakers, if you want to hear the Rhodes.

---

## Installing

1. Open **Voice Me-0.1.0-beta.4-arm64.dmg** and drag **Voice Me** into Applications.

2. **The first launch will fail.** You'll see something like:

   > "Voice Me" cannot be opened because Apple cannot check it for malicious
   > software.

   That's expected and it isn't a problem with the app. Apple charges $99/year
   for the certificate that makes this message go away, and I haven't paid it
   for a beta. The app is unsigned, not unsafe.

3. Open **Terminal** (⌘-Space, type "Terminal") and paste this, then hit Return:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Voice Me.app"
   ```

   Nothing will appear to happen. That's correct — it means it worked.

4. Open Voice Me normally. It'll work from now on; you only do this once.

If you'd rather not run a Terminal command, tell me and I'll send you a signed
build instead — it just costs me the Apple fee, which I'm happy to pay if
people are actually using this.

---

## Getting started

When it opens you should see a green dot and your keyboard's name at the top
left. If it says "No MIDI device", hit the **↺** button, or pick your keyboard
from the dropdown.

**Just play.** Keys light up as you press them, the chord name appears at the
bottom, and the staff shows the notes.

**Turn on sound** with the **○ Sound** button (top right). It takes a moment to
load the samples the first time.

**Compose with me** is the interesting part. Press the button at the top, then
play any chord. A tree grows with five suggestions, each one a named harmonic
move — a passing diminished, a secondary dominant, a modal shift — with its
roman numerals shown above it.

Click a branch and the keyboard tells you what to do with your hands:

| | |
|---|---|
| **blue** | keep holding this |
| **gold** | press this |
| **grey** | let this go |
| **amber arrows** | this voice slides here |
| **green flash** | you got it |

Some suggestions are **two chords**, because the move is the point — `A7/C♯ →
Dm7` is teaching you the bass walking C–C♯–D, and the first chord alone doesn't
teach that. It'll walk you through both.

Other things to try:

- The **Basic / Colorful / Complex** dial changes how spicy the suggestions
  are. Basic sticks to triads and plain 7ths; Complex offers altered dominants.
- **Set the key** with the dropdown, and the suggestions become properly
  functional instead of guesses. Play a Gm9 on *auto* and the app has no way to
  know whether you mean i in G minor or ii in F, so it offers both readings.
  Tell it F major and every branch reasons from there — `ii → V → I`, and the
  passing chords land inside the key. Some branches modulate; playing one moves
  the key centre for you.
- **Hover a branch** to see other colourings of the same chord (F7, F9, F13,
  F7♭9…). They all do the same harmonic job.
- **Click any chord** in the row under the piano to practise it again. The
  prompts come back so you can get it under your fingers. This doesn't undo
  anything.
- **Backspace** removes the last move. **Escape** stops practising.

---

## What I'd love to know

- Does it name your chords correctly? Especially odd voicings, rootless
  left-hand shapes, anything with a slash bass.
- Are the suggestions musically useful, or do they feel random?
- Anything that felt confusing, or any moment you didn't know what to do next.
- Crashes, stuck notes, keys lighting up wrong.

Screenshots help. So does "I played X and it said Y, which is wrong because Z" —
that kind of report is the most useful thing you can send.

---

## Known rough edges

- Apple Silicon only for now.
- The keyboard on screen covers A1–C7. Notes outside that range still sound and
  still count toward chords, they just aren't drawn.
- The tree needs a chord it can name — a bare fifth or a single note won't grow
  one.

---

## Credits

The Rhodes sound is **jRhodes3d by Jeff Learman**, a sampled 1977 Rhodes Mark I
Stage 73, used under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Source: <https://github.com/sfzinstruments/jlearman.jRhodes3d>

Voice Me itself is MIT licensed. It's built on Electron, Tone.js, VexFlow and
node-midi, all MIT.

**Anything you record with this is yours** — the sample licence explicitly
treats playing the instrument like playing a real one, commercial or not. The
non-commercial part restricts *me* distributing the app, not *you* making music
with it.

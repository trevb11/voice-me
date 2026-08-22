/**
 * notation.js
 * Voice Me — Grand staff notation display using VexFlow.
 *
 * Modes:
 *   • Live       — track and render currently-held MIDI notes (debounced)
 *   • Voicing    — show a single voicing (persistent, from library selection)
 *   • Progression — show all chords side-by-side with barlines and chord names
 *
 * Notes:
 *   • Split between treble/bass staves at MIDI 60 (middle C)
 *   • Colors follow the current CSS theme via --text-primary / --accent
 *   • Enharmonic spelling matches chord recognizer (Piano.SHARP_ROOT_PCS)
 */

// ── State ──────────────────────────────────────────────────────────────────

let currentHeld     = [];
let mode            = 'live';   // 'live' | 'voicing' | 'progression'
let voicingNotes    = null;     // single chord to show in voicing mode
let progressionData = null;     // { chords: [{notes, name, useSharp}], currentIdx }
let debounceTimer   = null;

// Where each notehead ended up, so pulseChord() can ring the right ones.
let notePositions   = [];       // parallel to progressionData.chords — { chordIdx, notesByMidi: Map<midi, {x, y}> }
let chordLabelPositions = [];   // parallel: { chordIdx, x, y, midX }

// ── MIDI → VexFlow note conversion ─────────────────────────────────────────

const SHARP_STEPS = ['c','c','d','d','e','f','f','g','g','a','a','b'];
const SHARP_ACCS  = ['',  '#', '', '#', '', '', '#', '', '#', '', '#', ''];
const FLAT_STEPS  = ['c','d','d','e','e','f','g','g','a','a','b','b'];
const FLAT_ACCS   = ['',  'b', '', 'b', '', '', 'b', '', 'b', '', 'b', ''];

/**
 * Spell a chord's notes by FUNCTION rather than by a single sharps-or-flats
 * flag chosen from its root.
 *
 * The flag approach gets Gm9 wrong: G is a sharp-key root, so the B♭ — the
 * chord's flat 3rd — came out as A♯. Harmony.spellChord() knows each note's
 * role and spells accordingly: the ♭9 of G is A♭, never G♯; the maj7 is F♯.
 *
 * Falls back to the old flag when the chord cannot be identified at all.
 */
function spellingFor(chord) {
  const notes = chord.notes || [];
  let root = chord.rootPC, quality = chord.quality;

  if (root == null || !window.Harmony?.QUALITIES[quality]) {
    const id = window.Harmony?.identify(notes);
    if (id) { root = id.rootPC; quality = id.voiceAs; }
  }

  const map = new Map();
  if (root != null && window.Harmony?.spellChord) {
    window.Harmony.spellChord(notes, root, quality).forEach(sp => map.set(sp.midi, sp));
    return map;
  }
  const useSharp = chord.useSharp !== undefined
    ? chord.useSharp
    : Piano.SHARP_ROOT_PCS.has((notes[0] || 60) % 12);
  notes.forEach(m => map.set(m, { ...midiToVexNote(m, useSharp), midi: m }));
  return map;
}

function midiToVexNote(midi, useSharp) {
  const pc     = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const step   = useSharp ? SHARP_STEPS[pc] : FLAT_STEPS[pc];
  const acc    = useSharp ? SHARP_ACCS[pc]  : FLAT_ACCS[pc];
  return { key: `${step}/${octave}`, accidental: acc };
}

// ── Theme colors ───────────────────────────────────────────────────────────

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    ink:    styles.getPropertyValue('--text-primary').trim() || '#111',
    accent: styles.getPropertyValue('--accent').trim()       || '#3B82F6',
    green:  '#22C55E',
  };
}

// ── Container helpers ──────────────────────────────────────────────────────

function getContainer() {
  return document.getElementById('notation-staff');
}

function getContainerSize() {
  const c = getContainer();
  const rect = c.getBoundingClientRect();
  return {
    w: Math.max(240, Math.floor(rect.width  || 300)),
    h: Math.max(220, Math.floor(rect.height || 240)),
  };
}

// ── Renderer & context ─────────────────────────────────────────────────────

function makeRenderer() {
  const container = getContainer();
  container.innerHTML = '';
  const VF = Vex.Flow;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  const { w, h } = getContainerSize();
  renderer.resize(w, h);
  const ctx = renderer.getContext();
  const c   = getThemeColors();
  ctx.setFillStyle(c.ink);
  ctx.setStrokeStyle(c.ink);
  return { ctx, w, h, colors: c };
}

// ── Empty staff ────────────────────────────────────────────────────────────

function drawEmpty() {
  const container = getContainer();
  if (!container || typeof Vex === 'undefined') return;

  const { ctx, w, h } = makeRenderer();
  const VF = Vex.Flow;

  const staveW = w - 20;
  const treble = new VF.Stave(10, 10,      staveW).addClef('treble').setContext(ctx);
  const bass   = new VF.Stave(10, h - 110, staveW).addClef('bass').setContext(ctx);

  treble.draw();
  bass.draw();

  new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
  new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
}

// ── Single-chord render (used for live and voicing modes) ─────────────────

function drawSingleChord(notes, useSharp) {
  if (!notes || notes.length === 0) return drawEmpty();

  const { ctx, w, h, colors } = makeRenderer();
  const VF = Vex.Flow;

  const staveW = w - 20;
  const treble = new VF.Stave(10, 10,      staveW).addClef('treble').setContext(ctx);
  const bass   = new VF.Stave(10, h - 110, staveW).addClef('bass').setContext(ctx);

  treble.draw();
  bass.draw();
  new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
  new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();

  const trebleNotes = notes.filter(n => n >= 60).sort((a, b) => a - b);
  const bassNotes   = notes.filter(n => n <  60).sort((a, b) => a - b);

  const spelling      = spellingFor({ notes, useSharp });
  const trebleVexNote = buildStaveNote(trebleNotes, spelling, 'treble', 'w');
  const bassVexNote   = buildStaveNote(bassNotes,   spelling, 'bass',   'w');

  const voices = [];
  const mk = (note) => {
    const v = new VF.Voice({ num_beats: 4, beat_value: 4, resolution: VF.RESOLUTION });
    v.setStrict(false);
    v.addTickables([note]);
    note.setContext(ctx);
    styleNote(note, colors.ink);
    voices.push(v);
    return v;
  };
  const trebleVoice = trebleVexNote ? mk(trebleVexNote) : null;
  const bassVoice   = bassVexNote   ? mk(bassVexNote)   : null;

  if (voices.length) {
    // Formatted together so the two staves line up, but without joinVoices —
    // see the note in drawProgression().
    new VF.Formatter().format(voices, staveW - 60);
    if (trebleVoice) trebleVoice.draw(ctx, treble);
    if (bassVoice)   bassVoice.draw(ctx, bass);
  }
}

function buildStaveNote(midiNotes, spelling, clef, duration) {
  if (!midiNotes || midiNotes.length === 0) return null;
  const VF = Vex.Flow;
  const parsed = midiNotes.map(m => {
    const sp = spelling instanceof Map ? spelling.get(m) : null;
    if (sp) return { key: `${sp.step}/${sp.octave}`, accidental: sp.accidental };
    return midiToVexNote(m, spelling === true);
  });
  const keys = parsed.map(p => p.key);

  const staveNote = new VF.StaveNote({ clef, keys, duration });

  parsed.forEach((p, i) => {
    if (p.accidental) staveNote.addAccidental(i, new VF.Accidental(p.accidental));
  });

  return staveNote;
}

function styleNote(staveNote, color) {
  staveNote.setStyle({ fillStyle: color, strokeStyle: color });
  const modifiers = staveNote.getModifiers ? staveNote.getModifiers() : [];
  modifiers.forEach(m => {
    if (m.setStyle) m.setStyle({ fillStyle: color, strokeStyle: color });
  });
}

// ── Progression: multi-chord staff with barlines + chord labels ───────────

function drawProgression(chords, currentIdx) {
  if (!chords || chords.length === 0) return drawEmpty();

  const { ctx, w, h, colors } = makeRenderer();
  const VF = Vex.Flow;

  // Rhythmic pattern for 3-chord progressions: 2 half notes + 1 whole note
  // → 2 measures. Measure 1 has chord[0] + chord[1], measure 2 has chord[2].
  // Duration codes: 'h' = half note, 'w' = whole note
  // For 5-chord (iii-vi-ii-V-I): 4 halves + 1 whole → 3 measures.
  const durations   = computeDurations(chords.length);
  const measureMap  = computeMeasureMap(durations);
  const measures    = measureMap.count;

  // ── Vertical layout ──
  // A grand staff is a FIXED shape: two five-line staves a set distance apart,
  // joined by a brace. Pinning the treble to the top and the bass to the
  // bottom of the panel stretched that gap to whatever height the container
  // happened to be — 234px on a 360px panel, an empty corridor down the middle
  // of the page. Size the pair, then centre it.
  const labelHeight  = 26;
  const STAVE_HEIGHT = 40;   // five lines at VexFlow's 10px spacing
  const TOP_RESERVE  = labelHeight + 8;   // chord names sit above the treble
  const BOT_RESERVE  = 34;   // ledger lines hang below the bass staff

  // The gap closes up on a short panel rather than letting the bass staff and
  // its ledger lines run off the bottom.
  const avail = Math.max(120, h - TOP_RESERVE - BOT_RESERVE);
  const gap   = Math.max(56, Math.min(92, avail - STAVE_HEIGHT * 2));

  const trebleY = TOP_RESERVE + Math.max(0, Math.round((avail - (STAVE_HEIGHT * 2 + gap)) / 2));
  const bassY   = trebleY + STAVE_HEIGHT + gap;

  const staffLeft     = 26;   // room for the grand-staff brace (VexFlow draws it left of the stave)
  const staffRight    = w - 18;   // the final barline needs air, or it reads as cut off
  const totalWidth    = staffRight - staffLeft;
  const clefWidth     = 40;
  const usableWidth   = totalWidth - clefWidth;

  // ── Build measures ──────────────────────────────────────────────────
  notePositions       = [];
  chordLabelPositions = [];

  const measureStaves = [];

  for (let mIdx = 0; mIdx < measures; mIdx++) {
    const chordIndicesInMeasure = measureMap.chordsByMeasure[mIdx];
    const isFirstMeasure = mIdx === 0;

    // Measure width proportional to number of beats in that measure
    const measureBeats = chordIndicesInMeasure.reduce((sum, ci) => sum + durationBeats(durations[ci]), 0);
    const measureFraction = measureBeats / 4;
    const measureWidth = compositionMode
      // compose: divide the column evenly so the window always fits (no overflow)
      ? (usableWidth / measures) + (isFirstMeasure ? clefWidth : 0)
      : Math.max(
          120,
          (usableWidth * measureFraction) / measures + (isFirstMeasure ? clefWidth : 0)
        );

    // Sum previous widths for x offset
    let xOffset = staffLeft;
    for (let m = 0; m < mIdx; m++) {
      xOffset += measureStaves[m].width;
    }

    const trebleStave = new VF.Stave(xOffset, trebleY, measureWidth);
    const bassStave   = new VF.Stave(xOffset, bassY,   measureWidth);

    if (isFirstMeasure) {
      trebleStave.addClef('treble');
      bassStave.addClef('bass');
    }

    trebleStave.setContext(ctx).draw();
    bassStave.setContext(ctx).draw();

    if (isFirstMeasure) {
      new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
      new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    }

    measureStaves.push({ treble: trebleStave, bass: bassStave, width: measureWidth, x: xOffset });
  }

  // Final barline at end of last measure
  const lastStave = measureStaves[measureStaves.length - 1];
  if (lastStave) {
    new VF.StaveConnector(lastStave.treble, lastStave.bass).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
  }

  // ── Build notes and voices per measure ─────────────────────────────
  for (let mIdx = 0; mIdx < measures; mIdx++) {
    const chordIndicesInMeasure = measureMap.chordsByMeasure[mIdx];
    const stave = measureStaves[mIdx];

    const trebleTickables = [];
    const bassTickables   = [];
    const chordMeta       = [];  // remember which tickable belongs to which chord

    chordIndicesInMeasure.forEach(chordIdx => {
      const chord    = chords[chordIdx];
      const duration = durations[chordIdx];
      const spelling = spellingFor(chord);

      const sorted     = [...chord.notes].sort((a, b) => a - b);
      const treble     = sorted.filter(n => n >= 60);
      const bass       = sorted.filter(n => n <  60);

      const isCurrentChord   = chordIdx === currentIdx;
      const noteColor        = isCurrentChord ? colors.accent : colors.ink;

      const tNote = treble.length > 0 ? buildStaveNote(treble, spelling, 'treble', duration) : buildRest('treble', duration);
      const bNote = bass.length   > 0 ? buildStaveNote(bass,   spelling, 'bass',   duration) : buildRest('bass',   duration);

      styleNote(tNote, noteColor);
      styleNote(bNote, noteColor);

      trebleTickables.push(tNote);
      bassTickables.push(bNote);

      chordMeta.push({ chordIdx, tNote, bNote, trebleMidis: treble, bassMidis: bass });
    });

    // Voices with correct beat count for this measure
    const measureBeats = chordIndicesInMeasure.reduce((sum, ci) => sum + durationBeats(durations[ci]), 0);
    const beatsValue   = measureBeats === 4 ? 4 : measureBeats;

    const trebleVoice = new VF.Voice({ num_beats: beatsValue, beat_value: 4, resolution: VF.RESOLUTION });
    trebleVoice.setStrict(false);
    trebleVoice.addTickables(trebleTickables);

    const bassVoice = new VF.Voice({ num_beats: beatsValue, beat_value: 4, resolution: VF.RESOLUTION });
    bassVoice.setStrict(false);
    bassVoice.addTickables(bassTickables);

    // Format to the stave's REAL note area, not to `width - 40`. That guess
    // ignores the clef, so the first measure had less room than it claimed and
    // every other measure had more — noteheads drifted to different offsets
    // from bar to bar.
    const noteArea = Math.max(
      40,
      stave.treble.getNoteEndX() - stave.treble.getNoteStartX() - 12
    );

    // NOT joinVoices(). That is for voices sharing ONE stave: it merges them
    // into a single modifier context, so the treble note gets charged for the
    // bass's accidental column and its notehead slides 20px right of its own
    // flat, which then reads as a stray accidental floating in the bar.
    // format() alone still aligns the two by tick, which is all a grand staff
    // needs.
    new VF.Formatter().format([trebleVoice, bassVoice], noteArea);

    trebleTickables.forEach(t => t.setContext(ctx));
    bassTickables.forEach(t => t.setContext(ctx));

    // Do NOT try to centre the chord in its bar with setXShift: it moves the
    // noteheads but leaves the accidentals behind, so flats and sharps detach
    // from the notes they belong to and the chord drifts over the barline.
    // Left-aligned after the clef is both correct and what VexFlow lays out.
    trebleVoice.draw(ctx, stave.treble);
    bassVoice.draw(ctx, stave.bass);

    // ── Record note positions for arrow drawing + labels ──────────────
    chordMeta.forEach(meta => {
      const notesByMidi = new Map();

      // Get x position from bounding box; y from note glyph attributes
      const tBox = safeGetBoundingBox(meta.tNote);
      const bBox = safeGetBoundingBox(meta.bNote);

      meta.trebleMidis.forEach((m, i) => {
        const pos = getNoteHeadPos(meta.tNote, i, tBox);
        if (pos) notesByMidi.set(m, pos);
      });
      meta.bassMidis.forEach((m, i) => {
        const pos = getNoteHeadPos(meta.bNote, i, bBox);
        if (pos) notesByMidi.set(m, pos);
      });

      notePositions.push({ chordIdx: meta.chordIdx, notesByMidi });

      // Chord label position — center X of the chord, y just above treble stave
      const centerX = tBox ? (tBox.x + tBox.w / 2) : (bBox ? bBox.x + bBox.w / 2 : stave.x);
      chordLabelPositions.push({
        chordIdx: meta.chordIdx,
        x:        centerX,
        y:        trebleY - 8,
      });
    });
  }

  // ── Draw chord name labels ────────────────────────────────────────
  chordLabelPositions.forEach(pos => {
    const chord = chords[pos.chordIdx];
    const isCurrent = pos.chordIdx === currentIdx;
    const color = isCurrent ? colors.accent : colors.ink;
    drawText(ctx, chord.name, pos.x, pos.y, {
      color, size: 13, bold: true, anchor: 'middle',
      id: `chord-label-${pos.chordIdx}`,
    });
  });

  // No voice-leading arrows on the staff. They crossed each other, crossed the
  // barlines, and turned a readable lead sheet into a diagram. The keyboard
  // already shows which voice went where, at the moment it matters — while you
  // are playing it — and it does so from the real voice-leading mapping rather
  // than by guessing pairs from pitch distance. Notation stays notation.
}

function buildRest(clef, duration) {
  const VF = Vex.Flow;
  return new VF.StaveNote({
    clef,
    keys:     clef === 'treble' ? ['b/4'] : ['d/3'],
    duration: duration + 'r',
  });
}

function durationBeats(d) {
  if (d === 'w') return 4;
  if (d === 'h') return 2;
  if (d === 'q') return 1;
  return 4;
}

let compositionMode = false;   // compose mode: always one chord per measure
function computeDurations(numChords) {
  // 3-chord: [h, h, w]  |  5-chord: [h, h, h, h, w]  |  fallback: whole notes
  if (compositionMode) return new Array(numChords).fill('w');   // one chord per bar
  if (numChords === 3) return ['h', 'h', 'w'];
  if (numChords === 5) return ['h', 'h', 'h', 'h', 'w'];
  return new Array(numChords).fill('w');
}

function computeMeasureMap(durations) {
  // Group chords into measures of 4 beats each
  const chordsByMeasure = [];
  let currentMeasure    = [];
  let beatsInMeasure    = 0;

  durations.forEach((d, i) => {
    const beats = durationBeats(d);
    if (beatsInMeasure + beats > 4) {
      chordsByMeasure.push(currentMeasure);
      currentMeasure = [];
      beatsInMeasure = 0;
    }
    currentMeasure.push(i);
    beatsInMeasure += beats;
    if (beatsInMeasure === 4) {
      chordsByMeasure.push(currentMeasure);
      currentMeasure = [];
      beatsInMeasure = 0;
    }
  });
  if (currentMeasure.length > 0) chordsByMeasure.push(currentMeasure);

  return { count: chordsByMeasure.length, chordsByMeasure };
}

// ── Note head position extraction ──────────────────────────────────────────

function safeGetBoundingBox(note) {
  try { return note.getBoundingBox ? note.getBoundingBox() : null; }
  catch (_) { return null; }
}

function getNoteHeadPos(staveNote, keyIdx, boundingBox) {
  // Try to read the actual notehead position from the DOM after render
  try {
    if (staveNote.getAbsoluteX && staveNote.getYs) {
      const x  = staveNote.getAbsoluteX();
      const ys = staveNote.getYs();
      return { x: x, y: ys[keyIdx] };
    }
  } catch (_) {}

  if (boundingBox) {
    return { x: boundingBox.x + boundingBox.w / 2, y: boundingBox.y + boundingBox.h / 2 };
  }
  return null;
}

// ── SVG text helper ────────────────────────────────────────────────────────

function drawText(ctx, text, x, y, options) {
  // VexFlow's ctx exposes an svg node — draw directly for our labels
  const svg = ctx.svg || (getContainer().querySelector('svg'));
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';

  const el = document.createElementNS(NS, 'text');
  el.setAttribute('x',           x);
  el.setAttribute('y',           y);
  el.setAttribute('text-anchor', options.anchor || 'middle');
  el.setAttribute('font-family', 'SF Pro Display, -apple-system, sans-serif');
  el.setAttribute('font-size',   options.size   || 13);
  el.setAttribute('font-weight', options.bold ? '600' : '400');
  el.setAttribute('fill',        options.color  || '#111');
  if (options.id) el.setAttribute('id', options.id);
  el.textContent = text;
  svg.appendChild(el);
  return el;
}

// ── Green pulse animation ──────────────────────────────────────────────────

function pulseChord(chordIdx) {
  if (mode !== 'progression') return;

  const svg = getContainer().querySelector('svg');
  if (!svg) return;

  const pos = notePositions.find(p => p.chordIdx === chordIdx);
  if (!pos) return;

  const labelPos = chordLabelPositions.find(p => p.chordIdx === chordIdx);
  const centerX  = labelPos ? labelPos.x : 0;

  // Compute center Y from note positions (average of all note heads)
  const notes = [...pos.notesByMidi.values()];
  if (notes.length === 0) return;
  const centerY = notes.reduce((s, p) => s + p.y, 0) / notes.length;

  // Find all elements belonging to this chord — the note groups within the
  // relevant tickable index. We'll target by finding rendered note glyphs
  // near the centerX position within a horizontal band.
  const allNoteHeads = svg.querySelectorAll('.vf-notehead, path[class*="vf-note"]');

  // Simpler & safer: create an overlay circle that pulses green + scale
  const NS = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'voiceme-pulse');
  overlay.setAttribute('transform-origin', `${centerX}px ${centerY}px`);

  // Highlight each notehead with a green ring
  notes.forEach(p => {
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx',           p.x);
    ring.setAttribute('cy',           p.y);
    ring.setAttribute('r',            '9');
    ring.setAttribute('fill',         '#22C55E');
    ring.setAttribute('opacity',      '0');
    ring.setAttribute('class',        'voiceme-pulse-ring');
    overlay.appendChild(ring);
  });
  svg.appendChild(overlay);

  // Highlight label as well
  const labelEl = svg.querySelector(`#chord-label-${chordIdx}`);

  // Animate — using Web Animations API for simplicity
  const rings = overlay.querySelectorAll('.voiceme-pulse-ring');
  rings.forEach(r => {
    r.animate([
      { opacity: 0,    r: 6  },
      { opacity: 0.85, r: 12 },
      { opacity: 0,    r: 18 },
    ], { duration: 800, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
  });

  // Scale-up on notes group and label
  overlay.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.15)' },
    { transform: 'scale(1)' },
  ], { duration: 800, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });

  if (labelEl) {
    labelEl.animate([
      { transform: 'scale(1)',    fill: getThemeColors().ink },
      { transform: 'scale(1.2)',  fill: '#22C55E' },
      { transform: 'scale(1)',    fill: getThemeColors().accent },
    ], {
      duration: 800,
      easing:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
      fill:     'forwards',
    });
    // SVG text scale needs transform-origin
    labelEl.setAttribute('transform-origin', `${labelPos.x}px ${labelPos.y}px`);
  }

  // Cleanup overlay after animation
  setTimeout(() => overlay.remove(), 900);
}

// ── Public: live MIDI ─────────────────────────────────────────────────────

function updateHeldNotes(midiNotes) {
  if (mode !== 'live') return;   // don't override voicing/progression display
  currentHeld = [...midiNotes];

  clearTimeout(debounceTimer);

  if (midiNotes.length === 0) {
    drawEmpty();
    return;
  }

  const delay = midiNotes.length <= 2 ? 0 : 200;

  if (delay === 0) {
    renderCurrentLive();
  } else {
    debounceTimer = setTimeout(renderCurrentLive, delay);
  }
}

function renderCurrentLive() {
  if (mode !== 'live') return;
  if (currentHeld.length === 0) return drawEmpty();

  const sorted   = [...currentHeld].sort((a, b) => a - b);
  const rootPC   = sorted[0] % 12;
  const useSharp = Piano.SHARP_ROOT_PCS.has(rootPC);
  drawSingleChord(sorted, useSharp);
}

// ── Public: voicing library ────────────────────────────────────────────────

function showVoicing(midiNotes) {
  mode         = 'voicing';
  voicingNotes = [...midiNotes];
  const rootPC   = (midiNotes[0] || 60) % 12;
  const useSharp = Piano.SHARP_ROOT_PCS.has(rootPC);
  drawSingleChord([...midiNotes].sort((a, b) => a - b), useSharp);
}

// ── Public: progression ────────────────────────────────────────────────────

function showProgression(chords, currentIdx) {
  compositionMode = false;
  mode = 'progression';
  progressionData = { chords, currentIdx: currentIdx || 0 };
  drawProgression(chords, currentIdx || 0);
}

// ── Public: compose surface — the song as a lead sheet, one chord per measure ──
function showComposition(chords, currentIdx) {
  if (!chords || chords.length === 0) { compositionMode = false; mode = 'live'; progressionData = null; return drawEmpty(); }
  compositionMode = true;
  mode = 'progression';
  progressionData = { chords, currentIdx: currentIdx == null ? chords.length - 1 : currentIdx };
  drawProgression(chords, progressionData.currentIdx);
}

function setProgressionCurrent(chordIdx) {
  if (mode !== 'progression' || !progressionData) return;
  progressionData.currentIdx = chordIdx;
  drawProgression(progressionData.chords, chordIdx);
}

// ── Public: return to live ────────────────────────────────────────────────

function returnToLive() {
  mode = 'live';
  compositionMode = false;
  voicingNotes    = null;
  progressionData = null;
  if (currentHeld.length > 0) renderCurrentLive();
  else                        drawEmpty();
}

// ── Redraw on theme / resize ──────────────────────────────────────────────

function redraw() {
  if (mode === 'progression' && progressionData) {
    drawProgression(progressionData.chords, progressionData.currentIdx);
  } else if (mode === 'voicing' && voicingNotes) {
    showVoicing(voicingNotes);
  } else {
    if (currentHeld.length > 0) renderCurrentLive();
    else                        drawEmpty();
  }
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redraw, 200);
});

// ── Init ───────────────────────────────────────────────────────────────────

function initNotation() {
  if (!getContainer()) return;
  drawEmpty();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotation);
} else {
  initNotation();
}

// ── Legacy compatibility (old function names) ─────────────────────────────

function showChord(midiNotes) {           // was previously used by progressions
  showVoicing(midiNotes);
}
function clearOverride() {                 // now equivalent to returnToLive
  returnToLive();
}
function redrawForTheme() {                // now equivalent to redraw
  redraw();
}

// ── Export ─────────────────────────────────────────────────────────────────

window.VoiceMeNotation = {
  // New API
  updateHeldNotes,
  showVoicing,
  showProgression,
  showComposition,
  setProgressionCurrent,
  pulseChord,
  returnToLive,
  redraw,
  // Legacy aliases
  showChord,
  clearOverride,
  redrawForTheme,
};


// ── Listen for what is being played ────────────────────────────────────────
window.VoiceMeBus?.on('notes', (notes) => updateHeldNotes(notes));

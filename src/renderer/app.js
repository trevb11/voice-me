/**
 * app.js
 * Renderer process entry point.
 * Wires MIDI events → piano visuals + chord detection.
 */

// ── Init piano ─────────────────────────────────────────────────────────────
Piano.renderPiano();
const keyMap = Piano.buildKeyMap();

// ── State ──────────────────────────────────────────────────────────────────
let   showBassNote = false;
const heldNotes    = new Map();   // midi → velocity
let   sustainPedal = false;
const sustainedNotes = new Set(); // notes held by pedal after key release

// ── DOM refs ───────────────────────────────────────────────────────────────
const statusDot   = document.getElementById('midi-status');
const midiLabel   = document.getElementById('midi-label');
const portSelect  = document.getElementById('port-select');
const refreshBtn  = document.getElementById('refresh-btn');
const chordName   = document.getElementById('chord-name');
const chordType   = document.getElementById('chord-type');
const chordAlt    = document.getElementById('chord-alt');
const heldNotesEl = document.getElementById('held-notes');

// ── MIDI event handling ────────────────────────────────────────────────────

window.midi.onEvent((event) => {
  if (event.type === 'noteOn') {
    noteOn(event.note, event.velocity);
  } else if (event.type === 'noteOff') {
    noteOff(event.note);
  } else if (event.type === 'controlChange') {
    // CC 64 = sustain pedal
    if (event.note === 64) {
      sustainPedal = event.velocity >= 64;
      if (!sustainPedal) {
        sustainedNotes.forEach(midi => {
          lightKey(midi, 0, false);
          window.AudioEngine?.stopNote(midi);
        });
        sustainedNotes.clear();
      }
    }
  }
});

window.midi.onPorts((ports) => {
  populatePortSelect(ports);
});

window.midi.onConnected(({ portIndex, portName }) => {
  statusDot.className  = 'status-dot connected';
  midiLabel.textContent = portName;
  portSelect.value      = portIndex;
});

window.midi.onDisconnected(() => {
  statusDot.className   = 'status-dot disconnected';
  midiLabel.textContent = 'No MIDI device';
  portSelect.value      = '';
});

window.midi.onError((msg) => {
  midiLabel.textContent = `MIDI error: ${msg}`;
  statusDot.className   = 'status-dot disconnected';
});

// ── Note on/off ────────────────────────────────────────────────────────────

function noteOn(midi, velocity) {
  heldNotes.set(midi, velocity);
  lightKey(midi, velocity, true);
  sustainedNotes.delete(midi);
  window.AudioEngine?.startNote(midi, velocity);
  updateNoteStrip();
  updateChordDisplay();
  notifyPanel();
}

function noteOff(midi) {
  if (sustainPedal) {
    sustainedNotes.add(midi);
  } else {
    heldNotes.delete(midi);
    window.AudioEngine?.stopNote(midi);

    const el = keyMap[midi];
    if (el) {
      const isBlack = el.classList.contains('key-black');
      // Restore to whichever suggestion state applies — gold, blue, gray, or default
      if (suggestionKeys.has(midi)) {
        el.setAttribute('fill', isBlack ? '#F59E0B' : '#FDE68A');
      } else if (heldSuggestionKeys.has(midi)) {
        el.setAttribute('fill', isBlack ? '#3B82F6' : '#93C5FD');
      } else if (releasedKeys.has(midi)) {
        el.setAttribute('fill', isBlack ? '#52525B' : '#E5E7EB');
      } else {
        el.setAttribute('fill', isBlack ? 'url(#bk-grad)' : 'url(#wk-grad)');
      }
      el.classList.remove('active');
    }
  }
  updateNoteStrip();
  updateChordDisplay();
  notifyPanel();
}

function notifyPanel() {
      const allHeld = [...new Set([...heldNotes.keys(), ...sustainedNotes])];
      window.VoiceMePanel?.checkMatch(allHeld);
      window.VoiceMePanel?.checkProgressionMatch(allHeld);
      window.Compose?.checkMatch(allHeld);
      window.VoiceMePanel?.checkInTheWild(allHeld);
      window.VoiceMeNotation?.updateHeldNotes(allHeld);
    }


// ── Key lighting ───────────────────────────────────────────────────────────

function lightKey(midi, velocity, on) {
  const el = keyMap[midi];
  if (!el) return;

  const isBlack = el.classList.contains('key-black');

  if (on) {
    // If this is a held-suggestion key, keep it blue instead of magenta
    if (heldSuggestionKeys?.has(midi)) {
      el.setAttribute('fill', isBlack ? '#3B82F6' : '#93C5FD');
    } else {
      const color = Piano.velocityToColor(velocity, isBlack);
      el.setAttribute('fill', color);
    }
    el.classList.add('active');
  } else {
    el.setAttribute('fill', isBlack ? 'url(#bk-grad)' : 'url(#wk-grad)');
    el.classList.remove('active');
  }
}

// ── Note strip (held note pills) ───────────────────────────────────────────

function updateNoteStrip() {
  const allHeld = new Set([...heldNotes.keys(), ...sustainedNotes]);
  heldNotesEl.innerHTML = '';

  [...allHeld].sort((a, b) => a - b).forEach(midi => {
    const semitone = midi % 12;
    const octave   = Math.floor(midi / 12) - 1;
    const useSharp = Piano.SHARP_ROOT_PCS.has(semitone);
    const name     = Piano.getNoteName(semitone, useSharp) + octave;
    const pill     = document.createElement('span');
    pill.className   = 'note-pill';
    pill.textContent = name;
    heldNotesEl.appendChild(pill);
  });
}

function updateChordDisplay() {
  const allHeld = [...new Set([...heldNotes.keys(), ...sustainedNotes])];

  if (allHeld.length === 0) {
    chordName.textContent = '—';
    chordType.textContent = '';
    chordAlt.textContent  = '';
    return;
  }

  const chord = detectChord(allHeld);
  if (chord) {
    chordName.textContent = chord.display;
    chordType.textContent = chord.quality;
    chordAlt.textContent  = chord.altDisplay ?? '';
    chordName.style.color = 'var(--text-primary)';
  } else if (allHeld.length === 1) {
    const midi     = allHeld[0];
    const semitone = midi % 12;
    const octave   = Math.floor(midi / 12) - 1;
    const useSharp = Piano.SHARP_ROOT_PCS.has(semitone);
    chordName.textContent = Piano.getNoteName(semitone, useSharp) + octave;
    chordType.textContent = 'note';
    chordAlt.textContent  = '';
    chordName.style.color = 'var(--text-muted)';
  } else {
    chordName.textContent = '?';
    chordType.textContent = `${allHeld.length} notes`;
    chordAlt.textContent  = '';
    chordName.style.color = 'var(--text-muted)';
  }
}

// ── Chord detection ────────────────────────────────────────────────────────
// Identifies common chord types from a set of MIDI notes.

const CHORD_PATTERNS = [
  // ── Triads ────────────────────────────────────────────────────────────
  { intervals: [0,4,7],            name: '',         quality: 'maj',      priority: 10 },
  { intervals: [0,3,7],            name: 'm',        quality: 'min',      priority: 10 },
  { intervals: [0,3,6],            name: 'dim',      quality: 'dim',      priority: 10 },
  { intervals: [0,4,8],            name: 'aug',      quality: 'aug',      priority: 10 },
  { intervals: [0,2,7],            name: 'sus2',     quality: 'sus',      priority: 7  },
  { intervals: [0,5,7],            name: 'sus4',     quality: 'sus',      priority: 7  },

  // ── 6th chords ────────────────────────────────────────────────────────
  { intervals: [0,4,7,9],          name: '6',        quality: 'maj6',     priority: 9  },
  { intervals: [0,3,7,9],          name: 'm6',       quality: 'min6',     priority: 9  },

  // ── 7th chords ────────────────────────────────────────────────────────
  { intervals: [0,4,7,11],         name: 'maj7',     quality: 'maj7',     priority: 12 },
  { intervals: [0,3,7,10],         name: 'm7',       quality: 'min7',     priority: 12 },
  { intervals: [0,4,7,10],         name: '7',        quality: 'dom7',     priority: 12 },
  { intervals: [0,3,7,11],         name: 'mM7',      quality: 'minMaj7',  priority: 11 },
  { intervals: [0,3,6,9],          name: 'dim7',     quality: 'dim7',     priority: 11 },
  { intervals: [0,3,6,10],         name: 'm7b5',     quality: 'hdim',     priority: 11 },
  { intervals: [0,4,8,10],         name: 'aug7',     quality: 'aug7',     priority: 10 },
  { intervals: [0,5,7,10],         name: '7sus4',    quality: 'sus7',     priority: 15 },
  { intervals: [0,2,5,10],         name: '9sus4',    quality: 'sus9',     priority: 16 },
  { intervals: [0,2,5,7,10],       name: '9sus4',    quality: 'sus9',     priority: 17 },

  // ── Altered dominants ─────────────────────────────────────────────────
  { intervals: [0,4,7,10,1],       name: '7b9',      quality: 'alt',      priority: 13 },
  { intervals: [0,4,7,10,3],       name: '7#9',      quality: 'alt',      priority: 13 },
  { intervals: [0,4,6,10],         name: '7b5',      quality: 'alt',      priority: 11 },
  { intervals: [0,4,6,10,2],       name: '9b5',      quality: 'alt',      priority: 12 },
  { intervals: [0,4,8,10,2],       name: '9#5',      quality: 'alt',      priority: 12 },
  { intervals: [0,4,6,10,1],       name: '7b5b9',    quality: 'alt',      priority: 13 },
  { intervals: [0,4,6,10,3],       name: '7b5#9',    quality: 'alt',      priority: 13 },
  { intervals: [0,4,8,10,1],       name: '7#5b9',    quality: 'alt',      priority: 13 },
  { intervals: [0,4,8,10,3],       name: '7#5#9',    quality: 'alt',      priority: 13 },
  { intervals: [0,4,7,10,6],       name: '7#11',     quality: 'lydian7',  priority: 12 },
  { intervals: [0,4,7,10,1,6],     name: '7b9#11',   quality: 'alt',      priority: 14 },
  { intervals: [0,4,7,10,3,6],     name: '7#9#11',   quality: 'alt',      priority: 14 },

  // ── 9th chords ────────────────────────────────────────────────────────
  { intervals: [0,4,7,11,2],       name: 'maj9',     quality: 'maj9',     priority: 13 },
  { intervals: [0,3,7,10,2],       name: 'm9',       quality: 'min9',     priority: 13 },
  { intervals: [0,4,7,10,2],       name: '9',        quality: 'dom9',     priority: 13 },
  { intervals: [0,3,7,11,2],       name: 'mM9',      quality: 'minMaj9',  priority: 12 },
  { intervals: [0,4,7,9,2],        name: '6/9',      quality: 'maj69',    priority: 11 },
  { intervals: [0,3,7,9,2],        name: 'm6/9',     quality: 'min69',    priority: 11 },
  { intervals: [0,4,7,2],          name: 'add9',     quality: 'add9',     priority: 8  },
  { intervals: [0,3,7,2],          name: 'madd9',    quality: 'add9',     priority: 8  },

  // ── 11th chords ───────────────────────────────────────────────────────
  { intervals: [0,4,7,10,2,5],     name: '11',       quality: 'dom11',    priority: 13 },
  { intervals: [0,3,7,10,2,5],     name: 'm11',      quality: 'min11',    priority: 13 },
  { intervals: [0,4,7,11,2,5],     name: 'maj11',    quality: 'maj11',    priority: 12 },
  { intervals: [0,4,7,11,6],       name: 'maj7#11',  quality: 'lydian',   priority: 13 },
  { intervals: [0,4,7,11,2,6],     name: 'maj9#11',  quality: 'lydian',   priority: 14 },
  // Cluster voicing: root b3 11 5 13 b7 — no 9th (e.g. Fmin11 cluster)
  { intervals: [0,3,5,7,9,10],     name: 'm11',      quality: 'min11',    priority: 12 },

  // ── 13th chords ───────────────────────────────────────────────────────
  { intervals: [0,4,7,10,2,5,9],   name: '13',       quality: 'dom13',    priority: 13 },
  // ── Dominant chords with parenthetical extensions ──────────────────────
  { intervals: [0,4,10,2,9],       name: '9(13)',     quality: 'dom13',    priority: 16 },
  { intervals: [0,4,10,1,9],       name: '7b9(13)',   quality: 'alt',      priority: 16 },
  { intervals: [0,4,10,3,9],       name: '7#9(13)',   quality: 'alt',      priority: 16 },
  { intervals: [0,4,10,1,8],       name: '7b9(b13)',  quality: 'alt',      priority: 16 },
  { intervals: [0,4,10,3,8],       name: '7#9(b13)',  quality: 'alt',      priority: 16 },
  { intervals: [0,4,10,2,8],       name: '9(b13)',    quality: 'alt',      priority: 16 },
  { intervals: [0,3,7,10,2,5,9],   name: 'm13',      quality: 'min13',    priority: 13 },
  { intervals: [0,4,7,11,2,9],     name: 'maj13',    quality: 'maj13',    priority: 12 },
  { intervals: [0,4,7,10,9],       name: '13',       quality: 'dom13',    priority: 11 },
];

function detectChord(midiNotes) {
  if (midiNotes.length < 2) return null;

  const sorted       = [...midiNotes].sort((a, b) => a - b);
  const bassPC       = sorted[0] % 12;
  const pitchClasses = [...new Set(sorted.map(m => m % 12))];
  if (pitchClasses.length < 2) return null;

  // ── Primary: best root-based chord match ──────────────────────────────
  const rootMatch = findBestChord(pitchClasses, bassPC);
  if (!rootMatch) return trySlashChord(pitchClasses, bassPC);

  // A chord without a third is harmonically indeterminate — don't name it
  // Exception: sus chords explicitly replace the third with a 2nd or 4th
  const isSus        = rootMatch.quality.startsWith('sus');
  const intervalsFromRoot = new Set(pitchClasses.map(pc => (pc - rootMatch.rootPC + 12) % 12));
  const hasThird     = intervalsFromRoot.has(3) || intervalsFromRoot.has(4);
  if (!hasThird && !isSus) return trySlashChord(pitchClasses, bassPC);

  const useSharp     = Piano.SHARP_ROOT_PCS.has(rootMatch.rootPC);
  const rootName     = Piano.getNoteName(rootMatch.rootPC, useSharp);
  const bassName     = Piano.getNoteName(bassPC, useSharp);
  const isInversion  = bassPC !== rootMatch.rootPC;
  const rootChordStr = Piano.musicalGlyphs(rootName + rootMatch.suffix);

  let slashStr = null;
  let altStr   = null;

  // ── Inversion: chord/bass ─────────────────────────────────────────────
  if (isInversion) {
    slashStr = Piano.musicalGlyphs(rootChordStr + '/' + bassName);
    // Try reading bass as root for the alternative name
    const bassAsRoot = findBestChordWithRoot(pitchClasses, bassPC);
    if (bassAsRoot) {
      const bassUseSharp = Piano.SHARP_ROOT_PCS.has(bassPC);
      const bassRootStr  = Piano.getNoteName(bassPC, bassUseSharp) + bassAsRoot.suffix;
      if (bassRootStr !== rootChordStr) altStr = bassRootStr;
    }
  }

  // ── Upper-voice triad slash chord (e.g. Eb/F = also F9sus4) ──────────
  // Only when exactly 3 notes sit above the bass (total 4 notes)
  if (!isInversion && pitchClasses.length === 4) {
    const upperPCs = pitchClasses.filter(pc => pc !== bassPC);
    if (upperPCs.length === 3) {
      const upperTriad = findCleanTriad(upperPCs);
      if (upperTriad) {
        const uSharp    = Piano.SHARP_ROOT_PCS.has(upperTriad.rootPC);
        const uRoot     = Piano.getNoteName(upperTriad.rootPC, uSharp);
        const uBass     = Piano.getNoteName(bassPC, uSharp);
        const upperSlash = uRoot + upperTriad.suffix + '/' + uBass;
        if (upperSlash !== rootChordStr) {
          slashStr = upperSlash;
          altStr   = rootChordStr;
        }
      }
    }
  }

  function findBestChord(pitchClasses, bassPC) {
  let best = null, bestScore = -Infinity;
  for (const rootPC of pitchClasses) {
    const intervals = new Set(pitchClasses.map(pc => (pc - rootPC + 12) % 12));
    for (const pattern of CHORD_PATTERNS) {
      const patternSet    = new Set(pattern.intervals);
      const coreIntervals = pattern.intervals.filter(i => i !== 7);
      let coreMatched = 0;
      for (const i of coreIntervals) if (intervals.has(i)) coreMatched++;
      const required = coreIntervals.length <= 3 ? coreIntervals.length : coreIntervals.length - 1;
      if (coreMatched < required) continue;
      const fifthPresent  = intervals.has(7) && patternSet.has(7);
      const totalMatched  = coreMatched + (fifthPresent ? 1 : 0);
      let extra = 0;
      for (const i of intervals) if (!patternSet.has(i)) extra++;
      const coreMissing   = coreIntervals.length - coreMatched;
      const cleanBonus    = (extra === 0 && coreMissing === 0) ? 15 : 0;
      const dominantBonus = intervals.has(10) && intervals.has(4) && !intervals.has(11) ? 10 : 0;
      const bassRootBonus = (bassPC !== undefined && rootPC === bassPC) ? 20 : 0;
      const score = totalMatched * 10 + pattern.priority + cleanBonus + dominantBonus + bassRootBonus - extra * 5 - coreMissing * 5;
      if (score > bestScore) { bestScore = score; best = { rootPC, suffix: pattern.name, quality: pattern.quality }; }
    }
  }
  return best;
}

function findBestChordWithRoot(pitchClasses, rootPC) {
  const intervals = new Set(pitchClasses.map(pc => (pc - rootPC + 12) % 12));
  let best = null, bestScore = -Infinity;
  for (const pattern of CHORD_PATTERNS) {
    const patternSet    = new Set(pattern.intervals);
    const coreIntervals = pattern.intervals.filter(i => i !== 7);
    let coreMatched = 0;
    for (const i of coreIntervals) if (intervals.has(i)) coreMatched++;
    const required = coreIntervals.length <= 3 ? coreIntervals.length : coreIntervals.length - 1;
    if (coreMatched < required) continue;
    const fifthPresent = intervals.has(7) && patternSet.has(7);
    const totalMatched = coreMatched + (fifthPresent ? 1 : 0);
    let extra = 0;
    for (const i of intervals) if (!patternSet.has(i)) extra++;
    const coreMissing   = coreIntervals.length - coreMatched;
    const cleanBonus    = (extra === 0 && coreMissing === 0) ? 15 : 0;
    const dominantBonus = intervals.has(10) && intervals.has(4) && !intervals.has(11) ? 10 : 0;
    const bassRootBonus = (bassPC !== undefined && rootPC === bassPC) ? 30 : 0;
    const score = totalMatched * 10 + pattern.priority + cleanBonus + dominantBonus + bassRootBonus - extra * 5 - coreMissing * 5;
    if (score > bestScore) { bestScore = score; best = { suffix: pattern.name, quality: pattern.quality }; }
  }
  return best;
}

function findCleanTriad(pcs) {
  const TRIADS = CHORD_PATTERNS.filter(p => p.intervals.length <= 3);
  let best = null, bestScore = -Infinity;
  for (const rootPC of pcs) {
    const intervals = new Set(pcs.map(pc => (pc - rootPC + 12) % 12));
    for (const pattern of TRIADS) {
      const patternSet = new Set(pattern.intervals);
      let matched = 0;
      for (const i of patternSet) if (intervals.has(i)) matched++;
      if (matched < pattern.intervals.length) continue;
      let extra = 0;
      for (const i of intervals) if (!patternSet.has(i)) extra++;
      if (extra > 0) continue;
      const score = matched * 10 + pattern.priority + 15;
      if (score > bestScore) { bestScore = score; best = { rootPC, suffix: pattern.name, quality: pattern.quality }; }
    }
  }
  return best;
}

function trySlashChord(pitchClasses, bassPC) {
  if (pitchClasses.length < 3) return null;
  const upperPCs = pitchClasses.filter(pc => pc !== bassPC);
  if (upperPCs.length < 3) return null;
  const upperTriad = findCleanTriad(upperPCs);
  if (!upperTriad) return null;
  const uSharp = Piano.SHARP_ROOT_PCS.has(upperTriad.rootPC);
  const uRoot  = Piano.getNoteName(upperTriad.rootPC, uSharp);
  const uBass  = Piano.getNoteName(bassPC, uSharp);
  return {
    display:    showBassNote ? uRoot + upperTriad.suffix + '/' + uBass : uRoot + upperTriad.suffix,
    altDisplay: null,
    quality:    upperTriad.quality,
    root:       uRoot,
    suffix:     upperTriad.suffix,
  };
}

  // ── Build display ─────────────────────────────────────────────────────
  const display    = (showBassNote && slashStr) ? slashStr : rootChordStr;
  const altDisplay = (showBassNote && altStr)   ? 'also: ' + altStr : null;

  return { display, altDisplay, quality: rootMatch.quality, root: rootName, suffix: rootMatch.suffix };
}


// ── Public chord identification (root PC + canonical quality) ───────────────
// Same CHORD_PATTERNS + fifth-optional, best-match scoring as the display path,
// but returns { rootPC, quality, suffix, bassPC, notes } for compose mode.
function identifyChordPC(midiNotes) {
  if (!midiNotes || midiNotes.length < 2) return null;
  const sorted = [...midiNotes].sort((a, b) => a - b);
  const bassPC = sorted[0] % 12;
  const pcs    = [...new Set(sorted.map(m => m % 12))];
  if (pcs.length < 2) return null;

  let best = null, bestScore = -Infinity;
  for (const rootPC of pcs) {
    const intervals = new Set(pcs.map(pc => (pc - rootPC + 12) % 12));
    for (const pattern of CHORD_PATTERNS) {
      const patternSet    = new Set(pattern.intervals);
      const coreIntervals = pattern.intervals.filter(i => i !== 7);   // 5th optional
      let coreMatched = 0;
      for (const i of coreIntervals) if (intervals.has(i)) coreMatched++;
      const required = coreIntervals.length <= 3 ? coreIntervals.length : coreIntervals.length - 1;
      if (coreMatched < required) continue;
      const fifthPresent  = intervals.has(7) && patternSet.has(7);
      const totalMatched  = coreMatched + (fifthPresent ? 1 : 0);
      let extra = 0;
      for (const i of intervals) if (!patternSet.has(i)) extra++;
      const coreMissing   = coreIntervals.length - coreMatched;
      const cleanBonus    = (extra === 0 && coreMissing === 0) ? 15 : 0;
      const dominantBonus = intervals.has(10) && intervals.has(4) && !intervals.has(11) ? 10 : 0;
      const bassRootBonus = rootPC === bassPC ? 20 : 0;
      const score = totalMatched * 10 + pattern.priority + cleanBonus + dominantBonus + bassRootBonus - extra * 5 - coreMissing * 5;
      if (score > bestScore) { bestScore = score; best = { rootPC, suffix: pattern.name, quality: pattern.quality }; }
    }
  }
  if (!best) return null;
  // A chord with no third (and not a sus) is harmonically indeterminate — skip it
  const iv    = new Set(pcs.map(pc => (pc - best.rootPC + 12) % 12));
  const isSus = best.quality.startsWith('sus') || best.suffix.startsWith('sus');
  if (!iv.has(3) && !iv.has(4) && !isSus) return null;
  return { rootPC: best.rootPC, quality: best.quality, suffix: best.suffix, bassPC, notes: sorted };
}


// ── Port picker ────────────────────────────────────────────────────────────

function populatePortSelect(ports) {
  portSelect.innerHTML = '<option value="">— select device —</option>';
  ports.forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.index;
    opt.textContent = p.name;
    portSelect.appendChild(opt);
  });
  if (ports.length === 1) {
    portSelect.value = 0;
  }
}

portSelect.addEventListener('change', () => {
  const val = portSelect.value;
  if (val !== '') window.midi.connectPort(parseInt(val, 10));
});

const bassNoteBtn = document.getElementById('bass-note-btn');
bassNoteBtn.addEventListener('click', () => {
  showBassNote = !showBassNote;
  bassNoteBtn.classList.toggle('active', showBassNote);
  updateChordDisplay();
});

refreshBtn.addEventListener('click', async () => {
  refreshBtn.textContent = '…';
  const ports = await window.midi.refresh();
  populatePortSelect(ports || []);
  refreshBtn.textContent = '↺';
});

// ── Initial port load ──────────────────────────────────────────────────────

window.midi.getPorts().then(ports => {
  if (ports && ports.length > 0) populatePortSelect(ports);
});

// ── Suggestion key lighting (gold) ────────────────────────────────────────

let suggestionKeys = new Set();

function setSuggestionKeys(notes) {
  clearSuggestionKeys();
  notes.forEach(midi => {
    const el = keyMap[midi];
    if (!el) return;
    const isBlack = el.classList.contains('key-black');
    el.setAttribute('fill', isBlack ? '#F59E0B' : '#FDE68A');
    suggestionKeys.add(midi);
  });
}

function clearSuggestionKeys() {
  suggestionKeys.forEach(midi => {
    const el = keyMap[midi];
    if (!el) return;
    const isBlack = el.classList.contains('key-black');
    if (!heldNotes.has(midi) && !sustainedNotes.has(midi)) {
      el.setAttribute('fill', isBlack ? 'url(#bk-grad)' : 'url(#wk-grad)');
    }
  });
  suggestionKeys.clear();
}

function flashGreen(notes) {
  notes.forEach(midi => {
    const el = keyMap[midi];
    if (!el) return;
    const isBlack = el.classList.contains('key-black');
    el.setAttribute('fill', isBlack ? '#22C55E' : '#86EFAC');
  });
  setTimeout(() => {
    notes.forEach(midi => {
      const el = keyMap[midi];
      if (!el) return;
      const isBlack = el.classList.contains('key-black');
      if (heldNotes.has(midi) || sustainedNotes.has(midi)) {
        el.setAttribute('fill', Piano.velocityToColor(heldNotes.get(midi) || 64, isBlack));
      } else if (suggestionKeys.has(midi)) {
        el.setAttribute('fill', isBlack ? '#F59E0B' : '#FDE68A');
      } else {
        el.setAttribute('fill', isBlack ? 'url(#bk-grad)' : 'url(#wk-grad)');
      }
    });
  }, 600);
}

// ── Expose API for panel.js ────────────────────────────────────────────────

// ── Held key lighting (blue — keep holding these) ─────────────────────────

let heldSuggestionKeys = new Set();

function setHeldKeys(notes) {
  clearHeldKeys();
  notes.forEach(midi => {
    const el = keyMap[midi];
    if (!el) return;
    const isBlack = el.classList.contains('key-black');
    el.setAttribute('fill', isBlack ? '#3B82F6' : '#93C5FD');
    heldSuggestionKeys.add(midi);
  });
}

function clearHeldKeys() {
  heldSuggestionKeys.forEach(midi => {
    const el      = keyMap[midi];
    if (!el) return;
    const isBlack = el.classList.contains('key-black');
    if (heldNotes.has(midi) || sustainedNotes.has(midi)) {
      el.setAttribute('fill', Piano.velocityToColor(heldNotes.get(midi) || 64, isBlack));
    } else {
      el.setAttribute('fill', isBlack ? 'url(#bk-grad)' : 'url(#wk-grad)');
    }
  });
  heldSuggestionKeys.clear();
}

// ── Released key lighting (gray — lift these fingers) ─────────────────────

let releasedKeys = new Set();

function setReleasedKeys(notes) {
  clearReleasedKeys();
  notes.forEach(midi => {
    const el      = keyMap[midi];
    if (!el) return;
    const isBlack = el.classList.contains('key-black');
    el.setAttribute('fill', isBlack ? '#52525B' : '#E5E7EB');
    releasedKeys.add(midi);
  });
}

function clearReleasedKeys() {
  releasedKeys.forEach(midi => {
    const el      = keyMap[midi];
    if (!el) return;
    const isBlack = el.classList.contains('key-black');
    if (heldNotes.has(midi) || sustainedNotes.has(midi)) {
      el.setAttribute('fill', Piano.velocityToColor(heldNotes.get(midi) || 64, isBlack));
    } else if (suggestionKeys.has(midi)) {
      el.setAttribute('fill', isBlack ? '#F59E0B' : '#FDE68A');
    } else {
      el.setAttribute('fill', isBlack ? 'url(#bk-grad)' : 'url(#wk-grad)');
    }
  });
  releasedKeys.clear();
}

// ── Arrow rendering ────────────────────────────────────────────────────────

function getKeyX(midi) {
  const el = keyMap[midi];
  if (!el) return null;
  const x  = parseFloat(el.getAttribute('x'));
  const w  = parseFloat(el.getAttribute('width'));
  return x + w / 2;
}

function showArrows(fromNotes, toNotes) {
  clearArrows();
  const svg     = document.getElementById('piano');
  const arrowY  = 22;

  let marker = svg.querySelector('#vm-arrowhead');
  if (!marker) {
    const defs = svg.querySelector('defs');
    marker     = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id',          'vm-arrowhead');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight','6');
    marker.setAttribute('refX',        '5');
    marker.setAttribute('refY',        '3');
    marker.setAttribute('orient',      'auto');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    poly.setAttribute('d',    'M 0 0 L 6 3 L 0 6 z');
    poly.setAttribute('fill', '#F59E0B');
    marker.appendChild(poly);
    defs?.appendChild(marker);
  }

  let group = document.getElementById('vm-arrows');
  if (!group) {
    group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'vm-arrows');
    svg.appendChild(group);
  }

  const usedTo = new Set();
  fromNotes.forEach(from => {
    const x1 = getKeyX(from);
    if (x1 === null) return;

    let nearestTo = null;
    let minDist   = Infinity;
    toNotes.forEach(to => {
      if (usedTo.has(to)) return;
      const dist = Math.abs(from - to);
      if (dist < minDist) { minDist = dist; nearestTo = to; }
    });

    if (nearestTo === null) return;
    usedTo.add(nearestTo);

    const x2   = getKeyX(nearestTo);
    if (x2 === null) return;

    const cx   = (x1 + x2) / 2;
    const cy   = arrowY - 14;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d',           `M ${x1},${arrowY} Q ${cx},${cy} ${x2},${arrowY}`);
    path.setAttribute('stroke',      '#F59E0B');
    path.setAttribute('stroke-width','1.5');
    path.setAttribute('fill',        'none');
    path.setAttribute('marker-end',  'url(#vm-arrowhead)');
    path.setAttribute('opacity',     '0.85');
    group.appendChild(path);
  });
}

function clearArrows() {
  const group = document.getElementById('vm-arrows');
  if (group) group.innerHTML = '';
}

// ── Expose API for panel.js ────────────────────────────────────────────────

window.VoiceMe = {
  setSuggestionKeys,
  clearSuggestionKeys,
  setHeldKeys,
  clearHeldKeys,
  flashGreen,
  setReleasedKeys,
  clearReleasedKeys,
  showArrows,
  clearArrows,
  identifyChord: identifyChordPC,
};

/**
 * app.js
 * Renderer entry point: MIDI in, keyboard out.
 *
 * This file owns the piano and nothing else. Chord theory lives in harmony.js;
 * app.js only knows how to light a key and how to tell everyone else what is
 * being played.
 *
 * ── Talking to the rest of the app ─────────────────────────────────────────
 *
 * Note changes go out on a bus (`VoiceMeBus`), not as a hardcoded list of
 * calls into every consumer. app.js used to end each note event with a
 * `notifyPanel()` that named the panel, compose mode and the notation staff
 * directly — so adding a feature meant editing this file, and compose mode
 * could only talk back through twenty imperative lighting calls.
 *
 * ── Lighting ───────────────────────────────────────────────────────────────
 *
 * There is ONE cue object and ONE repaint. Previously three independent sets
 * (suggestion / held / released) each had their own clear function, and those
 * functions disagreed about which layer won — so clearing gold also wiped blue
 * and grey, and whichever set painted last covered the others. Now every key's
 * colour is a pure function of (is it down?, what does the cue say?), so the
 * layers cannot fight.
 */

// ── Bus ────────────────────────────────────────────────────────────────────

const bus = (() => {
  const listeners = {};
  return {
    on(event, fn)   { (listeners[event] = listeners[event] || []).push(fn); },
    emit(event, data) { (listeners[event] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(`[bus:${event}]`, e); } }); },
  };
})();
window.VoiceMeBus = bus;

// ── MIDI bridge ────────────────────────────────────────────────────────────
// Supplied by preload.js under Electron. Stubbed when absent so the renderer
// can be opened directly in a browser for UI work — and so a preload failure
// shows up as "no MIDI device" rather than a blank window.

const midiBridge = window.midi || {
  getPorts:       () => Promise.resolve([]),
  connectPort:    () => {},
  refresh:        () => Promise.resolve([]),
  onEvent:        () => {},
  onPorts:        () => {},
  onConnected:    () => {},
  onDisconnected: () => {},
  onError:        () => {},
};
if (!window.midi) console.warn('[app] no MIDI bridge — running without hardware input');

// ── Init piano ─────────────────────────────────────────────────────────────

Piano.renderPiano();
const keyMap = Piano.buildKeyMap();
const allMidi = Object.keys(keyMap).map(Number);

// ── State ──────────────────────────────────────────────────────────────────

let   showBassNote   = false;
const heldNotes      = new Map();   // midi → velocity
let   sustainPedal   = false;
const sustainedNotes = new Set();   // held by the pedal after key release

// The single source of truth for suggestion colours.
const cue = { hold: [], press: [], lift: [] };

// ── DOM refs ───────────────────────────────────────────────────────────────

const statusDot   = document.getElementById('midi-status');
const midiLabel   = document.getElementById('midi-label');
const portSelect  = document.getElementById('port-select');
const refreshBtn  = document.getElementById('refresh-btn');
const chordName   = document.getElementById('chord-name');
const chordType   = document.getElementById('chord-type');
const chordAlt    = document.getElementById('chord-alt');
const heldNotesEl = document.getElementById('held-notes');

// ── Colours ────────────────────────────────────────────────────────────────
// Semantic state, deliberately literal: these mean something regardless of theme.

const INK = {
  hold:    { black: '#3B82F6', white: '#93C5FD' },   // keep this down
  press:   { black: '#F59E0B', white: '#FDE68A' },   // press this
  lift:    { black: '#52525B', white: '#E5E7EB' },   // let this go
  correct: { black: '#22C55E', white: '#86EFAC' },   // you got it
};

function isBlackKey(el) { return el.classList.contains('key-black'); }
function defaultFill(el) { return isBlackKey(el) ? 'url(#bk-grad)' : 'url(#wk-grad)'; }

/**
 * What colour should this key be right now?
 *
 * A total function of the two things that matter — whether the key is down,
 * and what the cue asks of it. Every case is listed, so no combination can
 * fall through to whichever layer happened to paint last.
 *
 * ── A cue survives being played ────────────────────────────────────────────
 *
 * A key that is cued keeps its cue colour whether or not it is currently down.
 * Pressing one note of a chord must not clear that note's prompt: you would
 * lose your place the moment you lifted a finger to reposition, and a chord you
 * were halfway through would look like a chord you had not started. The prompt
 * describes the TARGET, and the target does not change until the whole chord is
 * right — at which point compose.js flashes it green and moves on.
 */
function fillFor(midi) {
  const el = keyMap[midi];
  if (!el) return null;
  const black = isBlackKey(el);
  const down  = heldNotes.has(midi) || sustainedNotes.has(midi);
  const shade = ink => ink[black ? 'black' : 'white'];

  if (cue.lift.includes(midi))  return down ? shade(INK.lift) : defaultFill(el);
  if (cue.hold.includes(midi))  return shade(INK.hold);    // stays blue, pressed or not
  if (cue.press.includes(midi)) return shade(INK.press);   // stays gold, pressed or not

  return down ? Piano.velocityToColor(heldNotes.get(midi) || 64, black) : defaultFill(el);
}

function repaintKey(midi) {
  const el = keyMap[midi];
  if (!el) return;
  const fill = fillFor(midi);
  if (fill) el.setAttribute('fill', fill);
  el.classList.toggle('active', heldNotes.has(midi) || sustainedNotes.has(midi));
}

function repaint() { allMidi.forEach(repaintKey); }

/**
 * Set the whole cue at once. Callers describe the destination, not a sequence
 * of paint operations — there is no ordering to get wrong.
 */
function setCue(next) {
  cue.hold  = (next && next.hold)  || [];
  cue.press = (next && next.press) || [];
  cue.lift  = (next && next.lift)  || [];
  repaint();
}

function clearCue() { setCue(null); }

// ── MIDI event handling ────────────────────────────────────────────────────

midiBridge.onEvent((event) => {
  if (event.type === 'noteOn') {
    noteOn(event.note, event.velocity);
  } else if (event.type === 'noteOff') {
    noteOff(event.note);
  } else if (event.type === 'controlChange' && event.note === 64) {
    sustainPedal = event.velocity >= 64;
    if (!sustainPedal) {
      const releasing = [...sustainedNotes];
      sustainedNotes.clear();
      releasing.forEach(midi => {
        heldNotes.delete(midi);
        window.AudioEngine?.stopNote(midi);
        repaintKey(midi);
      });
      announce();
    }
  }
});

midiBridge.onPorts(populatePortSelect);

midiBridge.onConnected(({ portIndex, portName }) => {
  statusDot.className   = 'status-dot connected';
  midiLabel.textContent = portName;
  portSelect.value      = portIndex;
});

midiBridge.onDisconnected(() => {
  statusDot.className   = 'status-dot disconnected';
  midiLabel.textContent = 'No MIDI device';
  portSelect.value      = '';
});

midiBridge.onError((msg) => {
  midiLabel.textContent = `MIDI error: ${msg}`;
  statusDot.className   = 'status-dot disconnected';
});

// ── Note on/off ────────────────────────────────────────────────────────────

function noteOn(midi, velocity) {
  heldNotes.set(midi, velocity);
  sustainedNotes.delete(midi);
  window.AudioEngine?.startNote(midi, velocity);
  repaintKey(midi);
  announce();
}

function noteOff(midi) {
  if (sustainPedal) {
    sustainedNotes.add(midi);
  } else {
    heldNotes.delete(midi);
    window.AudioEngine?.stopNote(midi);
  }
  repaintKey(midi);
  announce();
}

function soundingNotes() {
  return [...new Set([...heldNotes.keys(), ...sustainedNotes])].sort((a, b) => a - b);
}

/** Tell the rest of the app what is sounding. One event, any number of listeners. */
function announce() {
  const notes = soundingNotes();
  updateNoteStrip(notes);
  updateChordDisplay(notes);
  bus.emit('notes', notes);
}

// ── Note strip + chord readout ─────────────────────────────────────────────

function updateNoteStrip(notes) {
  heldNotesEl.innerHTML = '';
  notes.forEach(midi => {
    const pill = document.createElement('span');
    pill.className   = 'note-pill';
    pill.textContent = Harmony.midiName(midi);
    heldNotesEl.appendChild(pill);
  });
}

function updateChordDisplay(notes) {
  if (notes.length === 0) {
    chordName.textContent = '—';
    chordType.textContent = '';
    chordAlt.textContent  = '';
    return;
  }

  const chord = Harmony.describe(notes, { showBass: showBassNote });
  if (chord) {
    chordName.textContent = chord.display;
    chordType.textContent = chord.quality;
    chordAlt.textContent  = chord.altDisplay ?? '';
    chordName.style.color = 'var(--text-primary)';
    return;
  }

  chordName.style.color = 'var(--text-muted)';
  chordAlt.textContent  = '';
  if (notes.length === 1) {
    chordName.textContent = Harmony.midiName(notes[0]);
    chordType.textContent = 'note';
  } else {
    chordName.textContent = '?';
    chordType.textContent = `${notes.length} notes`;
  }
}

// ── Voice-leading arrows ───────────────────────────────────────────────────

function getKeyX(midi) {
  const el = keyMap[midi];
  if (!el) return null;
  return parseFloat(el.getAttribute('x')) + parseFloat(el.getAttribute('width')) / 2;
}

function ensureArrowMarker(svg) {
  if (svg.querySelector('#vm-arrowhead')) return;
  const NS     = 'http://www.w3.org/2000/svg';
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id',          'vm-arrowhead');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight','6');
  marker.setAttribute('refX',        '5');
  marker.setAttribute('refY',        '3');
  marker.setAttribute('orient',      'auto');
  const poly = document.createElementNS(NS, 'path');
  poly.setAttribute('d',    'M 0 0 L 6 3 L 0 6 z');
  poly.setAttribute('fill', INK.press.black);
  marker.appendChild(poly);
  svg.querySelector('defs')?.appendChild(marker);
}

/**
 * Draw the voice-leading arrows from a mapping's `moved` pairs.
 *
 * Takes the mapping directly rather than two bare note lists: the mapping
 * already knows which voice went where, so there is no need to re-guess it by
 * nearest-pitch matching (which got it wrong whenever voices crossed).
 */
function showArrows(moved) {
  const svg = document.getElementById('piano');
  ensureArrowMarker(svg);

  let group = document.getElementById('vm-arrows');
  if (!group) {
    group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'vm-arrows');
    svg.appendChild(group);
  }
  group.innerHTML = '';

  const arrowY = 22;
  (moved || []).forEach(({ from, to }) => {
    const x1 = getKeyX(from), x2 = getKeyX(to);
    if (x1 === null || x2 === null || from === to) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d',            `M ${x1},${arrowY} Q ${(x1 + x2) / 2},${arrowY - 14} ${x2},${arrowY}`);
    path.setAttribute('stroke',       INK.press.black);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill',         'none');
    path.setAttribute('marker-end',   'url(#vm-arrowhead)');
    path.setAttribute('opacity',      '0.85');
    group.appendChild(path);
  });
}

function clearArrows() {
  const group = document.getElementById('vm-arrows');
  if (group) group.innerHTML = '';
}

/**
 * Arrows between two chords with no mapping available — the voicing library's
 * progressions are fixed voicings, not engine output, so pair the departing
 * and arriving voices by nearest pitch.
 */
function showArrowsBetween(fromNotes, toNotes) {
  const fromSet = new Set(fromNotes), toSet = new Set(toNotes);
  const leaving  = fromNotes.filter(n => !toSet.has(n)).sort((a, b) => a - b);
  const arriving = toNotes.filter(n => !fromSet.has(n));
  const moved = [];
  leaving.forEach(from => {
    let best = -1, bestDist = Infinity;
    arriving.forEach((to, i) => {
      if (to === null) return;
      const d = Math.abs(from - to);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best >= 0) { moved.push({ from, to: arriving[best] }); arriving[best] = null; }
  });
  showArrows(moved);
}

/** Flash a chord green, then fall back to whatever the cue says. */
function flashGreen(notes) {
  notes.forEach(midi => {
    const el = keyMap[midi];
    if (el) el.setAttribute('fill', INK.correct[isBlackKey(el) ? 'black' : 'white']);
  });
  setTimeout(() => notes.forEach(repaintKey), 600);
}

// ── Port picker ────────────────────────────────────────────────────────────

function populatePortSelect(ports) {
  portSelect.innerHTML = '<option value="">— select device —</option>';
  (ports || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.index;
    opt.textContent = p.name;
    portSelect.appendChild(opt);
  });
  if (ports && ports.length === 1) portSelect.value = 0;
}

portSelect.addEventListener('change', () => {
  if (portSelect.value !== '') midiBridge.connectPort(parseInt(portSelect.value, 10));
});

const bassNoteBtn = document.getElementById('bass-note-btn');
bassNoteBtn.addEventListener('click', () => {
  showBassNote = !showBassNote;
  bassNoteBtn.classList.toggle('active', showBassNote);
  updateChordDisplay(soundingNotes());
});

refreshBtn.addEventListener('click', async () => {
  refreshBtn.textContent = '…';
  populatePortSelect(await midiBridge.refresh());
  refreshBtn.textContent = '↺';
});

midiBridge.getPorts().then(populatePortSelect);

// ── Public API ─────────────────────────────────────────────────────────────

window.VoiceMe = {
  // Lighting — declarative. Describe the destination, not the steps.
  setCue,
  clearCue,
  cueFor(prevNotes, targetNotes) { setCue(Harmony.fingering(prevNotes, targetNotes)); },
  flashGreen,
  showArrows,
  showArrowsBetween,
  clearArrows,

  // State
  soundingNotes,

  // Chord reading — delegated to harmony.js, kept here for existing callers.
  identifyChord: notes => Harmony.identify(notes),
};

// ── Test hook ──────────────────────────────────────────────────────────────
// Drives the app as if MIDI arrived. Used by the harness to exercise compose
// mode without a keyboard plugged in.
window.VoiceMeTestInput = {
  press(notes, velocity = 80) { notes.forEach(n => noteOn(n, velocity)); },
  release(notes)              { notes.forEach(n => noteOff(n)); },
  releaseAll()                { soundingNotes().forEach(n => noteOff(n)); },
  play(notes, velocity = 80)  { this.releaseAll(); this.press(notes, velocity); },
};

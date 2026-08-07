/**
 * piano.js
 * Builds an 88-key SVG piano (A0–C8, MIDI notes 21–108).
 * White keys: 15px wide × 200px tall
 * Black keys: 10px wide × 120px tall, layered on top
 */

const MIDI_START = 33;  // A1
const MIDI_END   = 96;  // C7

// Which semitones (0=C) within an octave are black keys
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

// Note names for display
const SHARP_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const FLAT_NAMES  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];

function musicalGlyphs(str) {
  return String(str).replace(/#/g, '♯').replace(/b/g, (m, i, s) => {
    // Only replace 'b' when it's used as a flat — after a note letter or digit
    const prev = s[i - 1];
    if (prev && /[A-G0-9]/.test(prev)) return '♭';
    return m;
  });
}

// Roots whose key signature uses sharps: D E G A B (and F# as edge case)
const SHARP_ROOT_PCS = new Set([2, 4, 7, 9, 11]);
function getNoteName(pc, sharpContext) {
  return sharpContext ? SHARP_NAMES[pc % 12] : FLAT_NAMES[pc % 12];
}

const WHITE_W  = 26;
const WHITE_H  = 210;
const BLACK_W  = 16;
const BLACK_H  = 130;
const CORNER_R = 8;

// Build key layout data
function buildKeyLayout() {
  const keys = [];
  let whiteIndex = 0;

  for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
    const semitone = midi % 12;
    const octave   = Math.floor(midi / 12) - 1;
    const name     = SHARP_NAMES[semitone];
    const isBlack  = BLACK_SEMITONES.has(semitone);

    if (!isBlack) {
      keys.push({ midi, name, octave, isBlack: false, whiteIndex });
      whiteIndex++;
    } else {
      keys.push({ midi, name, octave, isBlack: true, whiteIndex: whiteIndex - 0.5 });
    }
  }
  return keys;
}

// Black keys placed on the boundary of two neighboring white keys

function renderPiano() {
  const svg   = document.getElementById('piano');
  const keys  = buildKeyLayout();

  // Count white keys for viewBox width
  const whiteCount = keys.filter(k => !k.isBlack).length;
  const svgWidth   = whiteCount * WHITE_W;
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${WHITE_H + 20}`);

  // ── Defs: gradients & filters ──────────────────────────────────────────
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="wk-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#FAFAFA"/>
      <stop offset="100%" stop-color="#EFEFEF"/>
    </linearGradient>

    <linearGradient id="bk-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#909090"/>
      <stop offset="100%" stop-color="#6E6E6E"/>
    </linearGradient>

    <filter id="glow-white" x="-20%" y="-10%" width="140%" height="130%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="glow-black" x="-30%" y="-10%" width="160%" height="130%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `;
  svg.appendChild(defs);

  // ── Background ──────────────────────────────────────────────────────────
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', svgWidth);
  bg.setAttribute('height', WHITE_H + 20);
  bg.setAttribute('fill', '#E4E4E8');
  bg.setAttribute('rx', '8');
  svg.appendChild(bg);

  // ── White keys ──────────────────────────────────────────────────────────
  const whiteGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  whiteGroup.setAttribute('id', 'white-keys');

  keys.filter(k => !k.isBlack).forEach((key) => {
    const x   = key.whiteIndex * WHITE_W;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x',      x + 0.5);
    rect.setAttribute('y',      10);
    rect.setAttribute('width',  WHITE_W - 1);
    rect.setAttribute('height', WHITE_H - 10);
    rect.setAttribute('rx',     CORNER_R);
    rect.setAttribute('fill',   'url(#wk-grad)');
    rect.setAttribute('stroke', '#CCCCCC');
    rect.setAttribute('stroke-width', '0.6');
    rect.setAttribute('class',  'key-white');
    rect.setAttribute('data-midi', key.midi);
    rect.setAttribute('data-name', key.name + key.octave);

    whiteGroup.appendChild(rect);

    // C labels — appended after rect so they render on top
    if (key.name === 'C') {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x',           x + WHITE_W / 2);
      label.setAttribute('y',           WHITE_H - 8);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size',   '8');
      label.setAttribute('fill',        '#555555');
      label.setAttribute('font-family', 'SF Mono, monospace');
      label.textContent = `C${key.octave}`;
      whiteGroup.appendChild(label);
    }
  });
  svg.appendChild(whiteGroup);

  // ── Black keys (layered on top) ─────────────────────────────────────────
  const blackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  blackGroup.setAttribute('id', 'black-keys');

  // Build a map of whiteIndex → x position
  const whitePositions = {};
  keys.filter(k => !k.isBlack).forEach(k => {
    whitePositions[k.whiteIndex] = k.whiteIndex * WHITE_W;
  });

  keys.filter(k => k.isBlack).forEach((key) => {
    const prevWhite   = Math.floor(key.whiteIndex);
    const x           = (prevWhite + 1) * WHITE_W - BLACK_W / 2;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x',      x);
    rect.setAttribute('y',      10);
    rect.setAttribute('width',  BLACK_W);
    rect.setAttribute('height', BLACK_H);
    rect.setAttribute('rx',     2);
    rect.setAttribute('fill',   'url(#bk-grad)');
    rect.setAttribute('stroke', '#06060e');
    rect.setAttribute('stroke-width', '0.8');
    rect.setAttribute('class',  'key-black');
    rect.setAttribute('data-midi', key.midi);
    rect.setAttribute('data-name', key.name + key.octave);

    blackGroup.appendChild(rect);
  });
  svg.appendChild(blackGroup);

  console.log('[Piano] Rendered', whiteCount, 'white keys +', keys.filter(k=>k.isBlack).length, 'black keys');
}

// ── Key lookup map ─────────────────────────────────────────────────────────
// Build after DOM is ready, maps midi → SVG element
function buildKeyMap() {
  const map = {};
  document.querySelectorAll('[data-midi]').forEach(el => {
    map[el.getAttribute('data-midi')] = el;
  });
  return map;
}

// ── Velocity → color ───────────────────────────────────────────────────────
// Maps 0-127 velocity to a vivid color.
// Soft (1-40):  cool blue   #7dd4fc
// Mid (41-90):  indigo      #818cf8
// Hard (91-127): warm amber  #fb923c
function velocityToColor(velocity, isBlack) {
  if (velocity <= 40) {
    return isBlack ? '#FB7185' : '#FDA4AF';
  } else if (velocity <= 90) {
    return isBlack ? '#F43F5E' : '#FB7185';
  } else {
    return isBlack ? '#E11D48' : '#F43F5E';
  }
}

// Expose to app.js
window.Piano = { renderPiano, buildKeyMap, velocityToColor, SHARP_NAMES, FLAT_NAMES, SHARP_ROOT_PCS, getNoteName, musicalGlyphs };

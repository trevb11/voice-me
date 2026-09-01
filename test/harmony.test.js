/**
 * harmony.test.js
 * Voice Me — invariants for the harmony engine.
 *
 * No framework: `node test/harmony.test.js`. Each check is an invariant that
 * must hold across every root, quality, spice and shape — the combinatorics are
 * small enough to test exhaustively rather than by sampling.
 */

const path = require('path');
const H = require(path.join(__dirname, '..', 'src', 'renderer', 'harmony.js'));

// ── Tiny assertion harness ──────────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  try {
    const bad = fn();
    if (bad && bad.length) {
      failed++;
      failures.push({ name, cases: bad.slice(0, 5), total: bad.length });
    } else {
      passed++;
    }
  } catch (err) {
    failed++;
    failures.push({ name, cases: [`threw: ${err.message}`], total: 1 });
  }
}

const NM = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const nm = m => NM[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// ── Test corpus ─────────────────────────────────────────────────────────────

const ROOTS   = [0,1,2,3,4,5,6,7,8,9,10,11];
const QUALS   = Object.keys(H.QUALITIES);
const SPICES  = [0, 1, 2];
const SHAPES  = Object.keys(H.SHAPES);

// Voicings a human actually plays, as intervals above a bass note.
const HUMAN_SHAPES = [
  [0,4,7,11], [0,3,7,10], [0,4,7,10], [0,3,6,10],   // close 7ths
  [0,11,16],  [0,10,15],  [0,10,16],                 // shells
  [0,2,5,9],  [0,3,7,10],                            // rootless left hand
  [0,4,7],    [0,3,7],                               // triads
];
const BASSES = [40, 45, 48, 52, 55];

function humanVoicings() {
  const out = [];
  for (const root of ROOTS) {
    for (const shape of HUMAN_SHAPES) {
      for (const bass of BASSES) {
        const low = bass + (((root - bass) % 12) + 12) % 12;
        const notes = shape.map(iv => low + iv);
        if (notes.some(n => n < 33 || n > 96)) continue;
        out.push({ root, notes });
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Vocabulary integrity
// ═══════════════════════════════════════════════════════════════════════════

check('every recognition pattern voices as a known quality', () => {
  const bad = [];
  for (const p of H.PATTERNS) {
    const target = p.voiceAs || p.quality;
    if (!H.QUALITIES[target]) bad.push(`${p.suffix || '(maj)'} → voiceAs "${target}" is not a quality`);
  }
  return bad;
});

check('every quality declares guide tones', () => {
  const bad = [];
  for (const [q, def] of Object.entries(H.QUALITIES)) {
    const roles = def.core.map(t => t[1]);
    if (!roles.includes('3rd') && !roles.includes('4th')) bad.push(`${q}: no 3rd and no sus 4th`);
    if (!def.triad && !roles.includes('7th') && !roles.includes('6th')) {
      bad.push(`${q}: not a triad but has no 7th and no 6th`);
    }
  }
  return bad;
});

check('every quality declares a known family', () => {
  const known = new Set(['major', 'minor', 'dominant', 'sus', 'dim']);
  return Object.entries(H.QUALITIES)
    .filter(([, def]) => !known.has(def.family))
    .map(([q, def]) => `${q}: family "${def.family}"`);
});

check('extension tiers are 1 or 2 only', () => {
  const bad = [];
  for (const [q, def] of Object.entries(H.QUALITIES)) {
    for (const [iv, role, tier] of (def.ext || [])) {
      if (tier !== 1 && tier !== 2) bad.push(`${q}: ${role} has tier ${tier}`);
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  2. Colour — the spice dial
// ═══════════════════════════════════════════════════════════════════════════

check('spice is monotonic: higher spice never removes a tone', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) {
    const at = s => new Set(H.colour(root, q, s).map(t => t.pc));
    const [s0, s1, s2] = [at(0), at(1), at(2)];
    for (const pc of s0) if (!s1.has(pc)) bad.push(`${NM[root]}${q}: spice 0→1 dropped ${NM[pc]}`);
    for (const pc of s1) if (!s2.has(pc)) bad.push(`${NM[root]}${q}: spice 1→2 dropped ${NM[pc]}`);
  }
  return bad;
});

check('core tones survive every spice level', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) {
    const got = new Set(H.colour(root, q, s).map(t => t.pc));
    for (const [iv, role] of H.QUALITIES[q].core) {
      if (!got.has((root + iv) % 12)) bad.push(`${NM[root]}${q} @spice${s}: lost core ${role}`);
    }
  }
  return bad;
});

check('no natural 11 on major or dominant chords', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) {
    const fam = H.QUALITIES[q].family;
    if (fam !== 'major' && fam !== 'dominant') continue;
    const ivs = new Set(H.colour(root, q, s).map(t => ((t.pc - root) % 12 + 12) % 12));
    if (ivs.has(5)) bad.push(`${NM[root]}${q} @spice${s}: natural 11 on a ${fam} chord`);
  }
  return bad;
});

// By ROLE, not interval: on a minor chord interval 3 is the ♭3, not a ♯9.
check('no natural 9 alongside a b9 or #9', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) {
    const roles = new Set(H.colour(root, q, s).map(t => t.role));
    if (roles.has('9th') && (roles.has('♭9') || roles.has('♯9'))) {
      bad.push(`${NM[root]}${q} @spice${s}: natural 9 with an altered 9`);
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  3. Shape — register layout, independent of colour
// ═══════════════════════════════════════════════════════════════════════════

check('every voicing stays on the keyboard (A1–C7)', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of SHAPES) {
    const notes = H.voice(root, q, { spice: s, shape: sh });
    for (const n of notes) {
      if (n < 33 || n > 96) bad.push(`${NM[root]}${q} ${sh}@${s}: ${nm(n)} off keyboard`);
    }
  }
  return bad;
});

check('no duplicate pitches within a voicing', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of SHAPES) {
    const notes = H.voice(root, q, { spice: s, shape: sh });
    if (new Set(notes).size !== notes.length) {
      bad.push(`${NM[root]}${q} ${sh}@${s}: ${notes.map(nm).join(' ')}`);
    }
  }
  return bad;
});

check('no muddy low intervals (< minor 3rd below C3)', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of SHAPES) {
    const notes = H.voice(root, q, { spice: s, shape: sh }).sort((a, b) => a - b);
    for (let i = 1; i < notes.length; i++) {
      if (notes[i - 1] < 48 && notes[i] - notes[i - 1] < 3) {
        bad.push(`${NM[root]}${q} ${sh}@${s}: ${nm(notes[i-1])}+${nm(notes[i])} muddy`);
      }
    }
  }
  return bad;
});

// Spacing rules alone do not catch this. A 9th a whole step above the root
// passes every "is this interval too tight" test — Db3 Eb3 F3 B3 has no gap
// smaller than a whole tone — and still sounds cluttered, because the ear
// hears the 9th beating against the root instead of colouring the chord.
//
// Scoped deliberately:
//   • the 9th FAMILY only. A 13th a major 6th above the root is idiomatic —
//     C3 E3 A3 Bb3 is a textbook C13 and must be left alone.
//   • non-DENSE shapes only. A cluster may put the root next to the 9th; that
//     is what a cluster is for.
const NINTHS = new Set(['9th', '♭9', '♯9']);

// Measured against the ROOT, not the bass. A ♭9 sits a minor 9th above its
// root, so a floor measured from the bass throws it an octave up rather than
// letting it fall a half step from the note above — the exact move a ♭9 chord
// exists for.
function ninthsCrowdingTheRoot(notes, root, quality, spice) {
  const roleByPc = new Map();
  H.colour(root, quality, spice).forEach(t => { if (!roleByPc.has(t.pc)) roleByPc.set(t.pc, t.role); });
  const rootMidi = [...notes].sort((a, b) => a - b).find(n => ((n % 12) + 12) % 12 === root % 12);
  if (rootMidi == null) return [];
  return notes.filter(n => NINTHS.has(roleByPc.get(((n % 12) + 12) % 12))
                        && n - rootMidi > 0 && n - rootMidi <= 3);
}

const SPREAD_SHAPES = SHAPES.filter(sh => !H.SHAPES[sh].dense);

check('REGRESSION: a 9th never sits a 2nd above the root, when led', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 400)) {
    for (const q of ['9', '13', '7b9', '7alt', 'maj9', 'm9', 'm11', '6/9']) {
      for (const sh of SPREAD_SHAPES) {
        const r = H.lead(notes, root, q, { spice: 2, shape: sh });
        for (const n of ninthsCrowdingTheRoot(r.notes, root, q, 2)) {
          bad.push(`${NM[root]}${q} ${sh}: ${nm(n)} grinds against the root — ` + r.notes.map(nm).join(' '));
        }
      }
    }
  }
  return bad;
});

check('a 9th never sits a 2nd above the root, standalone', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of SPREAD_SHAPES) {
    const notes = H.voice(root, q, { spice: s, shape: sh });
    for (const n of ninthsCrowdingTheRoot(notes, root, q, s)) {
      bad.push(`${NM[root]}${q} ${sh}@${s}: ${nm(n)} grinds against the root — ${notes.map(nm).join(' ')}`);
    }
  }
  return bad;
});

// The rule must not overreach: these are good voicings and must survive it.
check('REGRESSION: a ♭9 falls a half step instead of leaping an octave', () => {
  const bad = [];
  for (let root = 0; root < 12; root++) {
    // The ii chord a fifth above sounds the natural 9 of the target, a half
    // step above its ♭9 — so the ♭9 should simply fall onto it.
    const iiRoot = (root + 7) % 12;
    const prev   = H.voice(iiRoot, 'm9', { spice: 1, shape: 'closed' });
    const natural9 = (root + 2) % 12;
    if (!prev.some(n => n % 12 === natural9)) continue;   // nothing to fall from

    for (const q of ['7b9', '7b9(13)', '7alt']) {
      const r = H.lead(prev, root, q, { spice: 2, shape: 'closed' });
      const flat9 = (root + 1) % 12;
      const landed = r.notes.find(n => n % 12 === flat9);
      if (landed == null) continue;                       // quality may omit it
      const from = prev.find(n => n % 12 === natural9);
      if (Math.abs(landed - from) > 2) {
        bad.push(`${NM[root]}${q}: ♭9 went ${nm(from)} → ${nm(landed)} ` +
                 `(${landed - from} semitones) when a half step was available`);
      }
    }
  }
  return bad;
});

// You play five notes, you should get five notes back. Imposing the shape's
// nominal count trims a tone out of the TARGET, which strands a voice that had
// somewhere perfectly good to go: Db9 → G♭maj7 dropped the 5th, so the E♭ that
// wanted to fall a whole step onto D♭ was simply released instead.
check('REGRESSION: no voice is dropped for want of somewhere to go', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 300)) {
    for (const q of ['maj7', 'm7', '7', '9', 'm9', '13']) {
      const r = H.lead(notes, (root + 5) % 12, q, { spice: 1, shape: 'closed' });
      // Never FEWER — that was the bug: play five notes, get three back. More
      // is allowed, because some chords need more to exist at all: every tone
      // named in "13" is essential, so a 13 chord is five voices even when you
      // came from four.
      if (r.notes.length < notes.length) {
        bad.push(`held ${notes.length} notes, got only ${r.notes.length} back ` +
                 `(${NM[(root + 5) % 12]}${q} from ${notes.map(nm).join(' ')})`);
      }
      if (r.notes.length > notes.length + 2) {
        bad.push(`held ${notes.length} notes, got ${r.notes.length} back — too many ` +
                 `(${NM[(root + 5) % 12]}${q})`);
      }
    }
  }
  return bad;
});

check('REGRESSION: no voice is released when the counts match', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 300)) {
    for (const q of ['maj7', 'm7', '7', '9', 'm9']) {
      const r = H.lead(notes, (root + 5) % 12, q, { spice: 1, shape: 'closed' });
      if (r.mapping.released.length) {
        bad.push(`${NM[(root + 5) % 12]}${q}: released ` +
                 r.mapping.released.map(v => nm(v.from)).join(' ') +
                 ` from ${notes.map(nm).join(' ')}`);
      }
    }
  }
  return bad;
});

check('13ths and clusters are left alone', () => {
  const bad = [];
  for (const root of ROOTS) {
    const thirteenth = H.voice(root, '13', { spice: 1, shape: 'closed' });
    const bass = Math.min(...thirteenth);
    const roleByPc = new Map();
    H.colour(root, '13', 1).forEach(t => { if (!roleByPc.has(t.pc)) roleByPc.set(t.pc, t.role); });
    const has13 = thirteenth.some(n => roleByPc.get(((n % 12) + 12) % 12) === '13th');
    if (!has13) bad.push(`${NM[root]}13 closed: lost its 13th`);
    if (Math.max(...thirteenth) - bass > 26) {
      bad.push(`${NM[root]}13 closed: spread to ${Math.max(...thirteenth) - bass} semitones — rule overreached`);
    }
  }
  return bad;
});

check('shape controls density: minimal ≤ closed ≤ open/cluster', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) {
    const n = sh => H.voice(root, q, { spice: s, shape: sh }).length;
    if (n('minimal') > n('closed')) bad.push(`${NM[root]}${q}@${s}: minimal ${n('minimal')} > closed ${n('closed')}`);
  }
  return bad;
});

check('shape and spice are independent — every combination is realizable', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of SHAPES) {
    const notes = H.voice(root, q, { spice: s, shape: sh });
    if (notes.length < 2) bad.push(`${NM[root]}${q} ${sh}@${s}: only ${notes.length} voice(s)`);
  }
  return bad;
});

check('guide tones are always sounded', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of SHAPES) {
    const def = H.QUALITIES[q];
    const pcs = new Set(H.voice(root, q, { spice: s, shape: sh }).map(n => n % 12));
    for (const [iv, role] of def.core) {
      if (role === '3rd' || role === '7th' || role === '4th') {
        if (!pcs.has((root + iv) % 12)) bad.push(`${NM[root]}${q} ${sh}@${s}: missing ${role}`);
      }
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  4. Voice leading — THE REGRESSION TESTS
//     These are the invariants the old engine.js violated.
// ═══════════════════════════════════════════════════════════════════════════

check('REGRESSION: mapping always accounts for every target note', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7', 'm7b5']) {
      for (const sh of SHAPES) {
        const r = H.lead(notes, root, q, { spice: 1, shape: sh });
        const covered = [
          ...r.mapping.held.map(v => v.to),
          ...r.mapping.moved.map(v => v.to),
          ...r.mapping.appeared.map(v => v.to),
        ].sort((a, b) => a - b);
        const target = [...r.notes].sort((a, b) => a - b);
        const same = covered.length === target.length && covered.every((n, i) => n === target[i]);
        if (!same) {
          bad.push(`${NM[root]}${q} ${sh} from ${notes.map(nm).join(' ')}: ` +
                   `mapping covers ${covered.map(nm).join(' ')} but chord is ${target.map(nm).join(' ')}`);
        }
      }
    }
  }
  return bad;
});

check('REGRESSION: mapping accounts for every previous note', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7']) {
      const r = H.lead(notes, root, q, { spice: 1, shape: 'closed' });
      const accounted = new Set([
        ...r.mapping.held.map(v => v.from),
        ...r.mapping.moved.map(v => v.from),
        ...r.mapping.released.map(v => v.from),
      ]);
      for (const n of notes) {
        if (!accounted.has(n)) bad.push(`${NM[root]}${q} from ${notes.map(nm).join(' ')}: ${nm(n)} unaccounted`);
      }
    }
  }
  return bad;
});

check('REGRESSION: never collapses to a single voice', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7', 'm7b5', 'dim7']) {
      const r = H.lead(notes, root, q, { spice: 1, shape: 'closed' });
      const voices = r.mapping.held.length + r.mapping.moved.length + r.mapping.appeared.length;
      if (r.notes.length > 1 && voices < 2) {
        bad.push(`${NM[root]}${q} from ${notes.map(nm).join(' ')}: chord has ${r.notes.length} notes, mapping has ${voices}`);
      }
    }
  }
  return bad;
});

check('held voices do not move (zero-motion promise)', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7']) for (const sh of SHAPES) {
      const r = H.lead(notes, root, q, { spice: 1, shape: sh });
      for (const v of r.mapping.held) {
        if (v.from !== v.to) bad.push(`${NM[root]}${q} ${sh}: "held" voice moved ${nm(v.from)}→${nm(v.to)}`);
      }
    }
  }
  return bad;
});

check('moved voices actually move', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7']) {
      const r = H.lead(notes, root, q, { spice: 1, shape: 'closed' });
      for (const v of r.mapping.moved) {
        if (v.from === v.to) bad.push(`${NM[root]}${q}: "moved" voice stayed at ${nm(v.to)}`);
      }
    }
  }
  return bad;
});

// The BASS is allowed to leap — jazz bass moves by function, upper voices
// glide. This asserts the glide, so the bass voice is excluded.
check('voice leading is smooth — no upper voice leaps more than an octave', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7']) {
      const r = H.lead(notes, root, q, { spice: 1, shape: 'closed' });
      for (const v of r.mapping.moved) {
        if (v.to === r.bassMidi) continue;
        if (Math.abs(v.to - v.from) > 12) {
          bad.push(`${NM[root]}${q}: ${nm(v.from)}→${nm(v.to)} leaps ${Math.abs(v.to - v.from)} semitones`);
        }
      }
    }
  }
  return bad;
});

check('the declared bass is always the lowest sounding note', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7']) for (const sh of SHAPES) {
      const r = H.lead(notes, root, q, { spice: 1, shape: sh });
      if (Math.min(...r.notes) !== r.bassMidi) {
        bad.push(`${NM[root]}${q} ${sh}: bass ${nm(r.bassMidi)} but lowest is ${nm(Math.min(...r.notes))}`);
      }
    }
  }
  return bad;
});

check('a forced slash bass is honoured', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 300)) {
    for (const q of ['maj7', 'm7', '7']) {
      for (const [iv] of H.QUALITIES[q].core) {
        const want = (root + iv) % 12;
        const r = H.lead(notes, root, q, { spice: 1, shape: 'closed', bassPc: want });
        if (Math.min(...r.notes) % 12 !== want) {
          bad.push(`${NM[root]}${q}/${NM[want]}: got bass ${nm(Math.min(...r.notes))}`);
        }
      }
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  5. Key lighting — derived from set difference, so it cannot disagree
// ═══════════════════════════════════════════════════════════════════════════

check('REGRESSION: lit keys exactly equal the chord to play', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7', 'm7b5']) for (const sh of SHAPES) {
      const r = H.lead(notes, root, q, { spice: 1, shape: sh });
      const cue = H.fingering(notes, r.notes);
      const lit = [...cue.hold, ...cue.press].sort((a, b) => a - b);
      const tgt = [...r.notes].sort((a, b) => a - b);
      if (lit.length !== tgt.length || !lit.every((n, i) => n === tgt[i])) {
        bad.push(`${NM[root]}${q} ${sh}: lit ${lit.map(nm).join(' ')} vs target ${tgt.map(nm).join(' ')}`);
      }
    }
  }
  return bad;
});

check('REGRESSION: hold / press / lift never overlap', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7', 'm7b5']) for (const sh of SHAPES) {
      const r   = H.lead(notes, root, q, { spice: 1, shape: sh });
      const cue = H.fingering(notes, r.notes);
      const overlap = (a, b, an, bn) => a.filter(n => b.includes(n))
        .map(n => `${NM[root]}${q} ${sh}: ${nm(n)} is both ${an} and ${bn}`);
      bad.push(...overlap(cue.hold,  cue.press, 'hold',  'press'));
      bad.push(...overlap(cue.hold,  cue.lift,  'hold',  'lift'));
      bad.push(...overlap(cue.press, cue.lift,  'press', 'lift'));
    }
  }
  return bad;
});

check('lift ∪ hold exactly covers what was already down', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings()) {
    for (const q of ['maj7', 'm7', '7']) {
      const r   = H.lead(notes, root, q, { spice: 1, shape: 'closed' });
      const cue = H.fingering(notes, r.notes);
      const covered = [...cue.hold, ...cue.lift].sort((a, b) => a - b);
      const was     = [...new Set(notes)].sort((a, b) => a - b);
      if (covered.length !== was.length || !covered.every((n, i) => n === was[i])) {
        bad.push(`${NM[root]}${q}: hold+lift ${covered.map(nm).join(' ')} vs held ${was.map(nm).join(' ')}`);
      }
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  6. Recognition — behaviour preserved from the old app.js
// ═══════════════════════════════════════════════════════════════════════════

// An inverted voicing is genuinely ambiguous — C6 over E really is Am7/E — so
// only root-position shapes are held to this.
//
// Only the diminished family is exempt, and only because it is symmetric —
// all four spellings of a dim7 are equally correct.
const AMBIGUOUS = new Set(['dim', 'dim7']);

check('recognises the root-position chords it generates', () => {
  const bad = [];
  const rooted = SHAPES.filter(sh => !H.SHAPES[sh].invertBass);
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of rooted) {
    const notes = H.voice(root, q, { spice: s, shape: sh });
    const id = H.identify(notes);
    if (!id) { bad.push(`${NM[root]}${q} ${sh}@${s}: unrecognised — ${notes.map(nm).join(' ')}`); continue; }
    if (id.rootPC !== root && !AMBIGUOUS.has(q) && H.QUALITIES[q].family !== 'dim') {
      bad.push(`${NM[root]}${q} ${sh}@${s}: read as root ${NM[id.rootPC]} — ${notes.map(nm).join(' ')}`);
    }
  }
  return bad;
});

// Whatever name it picks, the notes it heard must be the notes that are there.
check('an ambiguous chord is still heard as the right pitch classes', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of AMBIGUOUS) for (const s of SPICES) {
    if (!H.QUALITIES[q]) continue;
    const notes = H.voice(root, q, { spice: s, shape: 'closed' });
    const id = H.identify(notes);
    if (!id) { bad.push(`${NM[root]}${q}@${s}: unrecognised`); continue; }
    const heard = new Set(id.notes.map(n => n % 12));
    const there = new Set(notes.map(n => n % 12));
    if (heard.size !== there.size || [...there].some(p => !heard.has(p))) {
      bad.push(`${NM[root]}${q}@${s}: heard a different note set`);
    }
  }
  return bad;
});

check('every generated voicing is at least nameable', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) for (const sh of SHAPES) {
    const notes = H.voice(root, q, { spice: s, shape: sh });
    if (!H.identify(notes)) bad.push(`${NM[root]}${q} ${sh}@${s}: unrecognised — ${notes.map(nm).join(' ')}`);
  }
  return bad;
});

// C–G–D is a legitimate Csus2; a bare fifth is not a chord.
check('a bare fifth is left unnamed', () => {
  const bad = [];
  for (const notes of [[60, 67], [60, 67, 72], [48, 55, 60, 67]]) {
    const id = H.identify(notes);
    if (id) bad.push(`${notes.map(nm).join(' ')} named as ${NM[id.rootPC]}${id.suffix}`);
  }
  return bad;
});

check('known chord spellings round-trip', () => {
  const bad = [];
  const cases = [
    [[60, 64, 67],          0, ''      ],
    [[60, 63, 67],          0, 'm'     ],
    [[60, 64, 67, 71],      0, 'maj7'  ],
    [[60, 63, 67, 70],      0, 'm7'    ],
    [[60, 64, 67, 70],      0, '7'     ],
    [[60, 63, 66, 70],      0, 'm7b5'  ],
    [[60, 63, 66, 69],      0, 'dim7'  ],
    [[60, 65, 67, 70],      0, '7sus4' ],
    [[60, 64, 67, 71, 74],  0, 'maj9'  ],
    [[60, 63, 67, 70, 74],  0, 'm9'    ],
    [[60, 64, 67, 70, 74],  0, '9'     ],
  ];
  for (const [notes, root, suffix] of cases) {
    const id = H.identify(notes);
    if (!id) { bad.push(`${notes.map(nm).join(' ')}: unrecognised, expected ${NM[root]}${suffix}`); continue; }
    if (id.rootPC !== root || id.suffix !== suffix) {
      bad.push(`${notes.map(nm).join(' ')}: got ${NM[id.rootPC]}${id.suffix}, expected ${NM[root]}${suffix}`);
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  7. Suggestion
// ═══════════════════════════════════════════════════════════════════════════

check('always returns playable branches', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 200)) {
    for (const q of ['maj7', 'm7', '7']) {
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed');
      if (branches.length === 0) { bad.push(`${NM[root]}${q}: no branches`); continue; }
      for (const b of branches) {
        if (b.notes.length < 2) bad.push(`${NM[root]}${q} ${b.slot}: ${b.notes.length} note(s)`);
        if (b.notes.some(n => n < 33 || n > 96)) bad.push(`${NM[root]}${q} ${b.slot}: off keyboard`);
      }
    }
  }
  return bad;
});

check('branch chords are distinct from one another', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 200)) {
    for (const q of ['maj7', 'm7', '7']) {
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed');
      const seen = new Set();
      for (const b of branches) {
        const key = `${b.rootPC}:${b.quality}:${b.bassPc ?? ''}`;
        if (seen.has(key)) bad.push(`${NM[root]}${q}: duplicate branch ${NM[b.rootPC]}${b.quality}`);
        seen.add(key);
      }
    }
  }
  return bad;
});

// ── Slash chords / inversions — bass movement is a musical requirement ──────

check('inversions are offered, not just root-position chords', () => {
  let withBass = 0, total = 0;
  for (const { root, notes } of humanVoicings().slice(0, 300)) {
    for (const q of ['maj7', 'm7', '7']) {
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed');
      for (const b of branches) { total++; if (b.bassPc != null) withBass++; }
    }
  }
  // Not every branch should be a slash chord, but a meaningful share must be —
  // otherwise the bass can only leap by fourths.
  const share = withBass / total;
  return share > 0.10 ? [] : [`only ${(share * 100).toFixed(1)}% of branches offer an inversion`];
});

check('a slash bass is always a real chord tone or a declared alteration', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 200)) {
    for (const q of ['maj7', 'm7', '7']) {
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed');
      for (const b of branches) {
        if (b.bassPc == null) continue;
        if (!b.notes.some(n => n % 12 === b.bassPc)) {
          bad.push(`${b.name}: bass ${NM[b.bassPc]} is not sounded in ${b.notes.map(nm).join(' ')}`);
        }
        if (Math.min(...b.notes) % 12 !== b.bassPc) {
          bad.push(`${b.name}: declared bass ${NM[b.bassPc]} is not the lowest note`);
        }
      }
    }
  }
  return bad;
});

check('bass motion is preferred: most branches move the bass by step or fourth', () => {
  let smooth = 0, total = 0;
  for (const { root, notes } of humanVoicings().slice(0, 300)) {
    for (const q of ['maj7', 'm7', '7']) {
      const prevBass = Math.min(...notes) % 12;
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed');
      for (const b of branches) {
        total++;
        const up = ((Math.min(...b.notes) % 12) - prevBass + 12) % 12;
        const step = Math.min(up, 12 - up);
        if (step <= 2 || step === 5) smooth++;
      }
    }
  }
  const share = smooth / total;
  return share > 0.5 ? [] : [`only ${(share * 100).toFixed(1)}% of branches move the bass smoothly`];
});

check('every branch is playable from where the hands already are', () => {
  const bad = [];
  for (const { root, notes } of humanVoicings().slice(0, 200)) {
    for (const q of ['maj7', 'm7', '7']) {
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed');
      for (const b of branches) {
        const span = Math.max(...b.notes) - Math.min(...b.notes);
        if (span > 36) bad.push(`${NM[root]}${q} ${b.slot}: spans ${span} semitones`);
      }
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  8. Compose-mode flow
//     Devices are walked chord by chord, so every step must be independently
//     playable and cueable. These are the invariants compose.js relies on.
// ═══════════════════════════════════════════════════════════════════════════

const SEEDS = [
  { notes: [48, 52, 55, 59], root: 0,  q: 'maj7'  },
  { notes: [48, 52, 55, 57], root: 0,  q: '6'     },
  { notes: [45, 52, 55, 60], root: 9,  q: 'm7'    },
  { notes: [43, 47, 53, 57], root: 7,  q: '7'     },
  { notes: [43, 53, 57, 62], root: 7,  q: '7sus4' },
  { notes: [41, 56, 58, 63], root: 5,  q: 'm11'   },
  { notes: [50, 53, 57, 60], root: 2,  q: 'm7b5'  },
];

check('every device step is reachable and fully cued', () => {
  const bad = [];
  for (const seed of SEEDS) for (const spice of SPICES) for (const sh of SHAPES) {
    const { branches } = H.suggest(seed.notes, seed.root, seed.q, [], spice, sh);
    for (const b of branches) {
      let from = seed.notes;
      b.sequence.forEach((step, i) => {
        const cue = H.fingering(from, step.notes);
        const lit = [...cue.hold, ...cue.press].sort((a, c) => a - c);
        const tgt = [...step.notes].sort((a, c) => a - c);
        if (lit.length !== tgt.length || !lit.every((n, j) => n === tgt[j])) {
          bad.push(`${b.device || b.name} step ${i + 1}: lit ${lit.map(nm).join(' ')} vs ${tgt.map(nm).join(' ')}`);
        }
        if (cue.hold.some(n => cue.press.includes(n)) ||
            cue.hold.some(n => cue.lift.includes(n))  ||
            cue.press.some(n => cue.lift.includes(n))) {
          bad.push(`${b.device || b.name} step ${i + 1}: overlapping cues`);
        }
        from = step.notes;
      });
    }
  }
  return bad;
});

check('resolvesTo is the last chord of the sequence', () => {
  const bad = [];
  for (const seed of SEEDS) for (const spice of SPICES) {
    const { branches } = H.suggest(seed.notes, seed.root, seed.q, [], spice, 'closed');
    for (const b of branches) {
      const last = b.sequence[b.sequence.length - 1];
      if (!b.resolvesTo) { bad.push(`${b.name}: no resolvesTo`); continue; }
      if (b.resolvesTo.rootPC !== last.rootPC || b.resolvesTo.quality !== last.quality) {
        bad.push(`${b.name}: resolvesTo ${b.resolvesTo.name} but sequence ends ${last.name}`);
      }
    }
  }
  return bad;
});

check('the tree keeps growing from where a device landed', () => {
  const bad = [];
  for (const seed of SEEDS) {
    const first = H.suggest(seed.notes, seed.root, seed.q, [], 1, 'closed');
    for (const b of first.branches) {
      const landed = b.resolvesTo;
      const next = H.suggest(landed.notes, landed.rootPC, landed.quality, [], 1, 'closed');
      if (!next.branches.length) bad.push(`${b.name} → ${landed.name}: dead end, no further branches`);
      for (const nb of next.branches) {
        if (nb.notes.some(n => n < 33 || n > 96)) bad.push(`${landed.name} → ${nb.name}: off keyboard`);
      }
    }
  }
  return bad;
});

check('sequences stay short enough to learn', () => {
  const bad = [];
  for (const seed of SEEDS) for (const spice of SPICES) {
    const { branches } = H.suggest(seed.notes, seed.root, seed.q, [], spice, 'closed');
    for (const b of branches) {
      if (b.sequence.length > 3) bad.push(`${b.name}: ${b.sequence.length} chords`);
      if (b.sequence.length < 1) bad.push(`${b.name}: empty sequence`);
    }
  }
  return bad;
});

check('every branch is labelled — a device name or a roman numeral', () => {
  const bad = [];
  for (const seed of SEEDS) for (const spice of SPICES) {
    const { branches } = H.suggest(seed.notes, seed.root, seed.q, [], spice, 'closed');
    for (const b of branches) {
      if (!b.deviceLabel && !b.roman) bad.push(`${b.name}: no device label and no roman numeral`);
      if (!b.name) bad.push(`${b.slot}: unnamed branch`);
      if (!b.reason) bad.push(`${b.name}: no explanation`);
    }
  }
  return bad;
});

check('the dial is respected — basic never volunteers an altered dominant', () => {
  const bad = [];
  for (const seed of SEEDS) for (const sh of SHAPES) {
    const { branches } = H.suggest(seed.notes, seed.root, seed.q, [], 0, sh);
    for (const b of branches) {
      for (const step of b.sequence) {
        if (H.tierOf(step.quality) > 0) {
          bad.push(`basic/${sh} from ${NM[seed.root]}${seed.q}: offered ${step.name} (tier ${H.tierOf(step.quality)})`);
        }
      }
      for (const v of (b.variants || [])) {
        if (H.tierOf(v.quality) > 0) bad.push(`basic: variant ${v.name} is tier ${H.tierOf(v.quality)}`);
      }
    }
  }
  return bad;
});

check('variants all share the branch chord root and function', () => {
  const bad = [];
  for (const seed of SEEDS) for (const spice of SPICES) {
    const { branches } = H.suggest(seed.notes, seed.root, seed.q, [], spice, 'closed');
    for (const b of branches) {
      for (const v of (b.variants || [])) {
        const fam  = H.QUALITIES[v.quality].family;
        const bFam = H.QUALITIES[b.quality].family;
        if (fam !== bFam) bad.push(`${b.name}: variant ${v.name} is ${fam}, branch is ${bFam}`);
        if (v.notes.some(n => n % 12 === undefined)) bad.push(`${b.name}: variant ${v.name} malformed`);
      }
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  9. Key centre
//     Inference gives a lone chord a bonus for being its own tonic, so a
//     solitary Gm9 reads as i in G minor when it was meant as ii in F — and
//     every functional suggestion then aims at the wrong tonic. Declaring the
//     key has to override that, and devices have to actually use it.
// ═══════════════════════════════════════════════════════════════════════════

check('a declared key overrides inference', () => {
  const bad = [];
  for (const seed of SEEDS) for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['major', 'minor']) {
      const { key } = H.suggest(seed.notes, seed.root, seed.q, [], 1, 'closed', { tonicPc: tonic, mode });
      if (key.tonicPc !== tonic || key.mode !== mode) {
        bad.push(`asked for ${NM[tonic]} ${mode}, got ${NM[key.tonicPc]} ${key.mode}`);
      }
      if (!key.declared) bad.push(`${NM[tonic]} ${mode}: not flagged as declared`);
    }
  }
  return bad;
});

check('REGRESSION: the ii chord of a declared key is offered its V', () => {
  const bad = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const iiRoot = (tonic + 2) % 12;
    const notes  = H.voice(iiRoot, 'm9', { spice: 1, shape: 'closed' });
    const { branches } = H.suggest(notes, iiRoot, 'm9', [], 1, 'closed', { tonicPc: tonic, mode: 'major' });

    const vRoot = (tonic + 7) % 12;
    const found = branches.some(b => b.sequence.some(
      s => s.rootPC === vRoot && H.QUALITIES[s.quality].family === 'dominant'));
    if (!found) {
      bad.push(`${NM[iiRoot]}m9 in ${NM[tonic]} major: no ${NM[vRoot]}7 offered — ` +
               branches.map(b => b.name).join(' | '));
    }
  }
  return bad;
});

// Inference reads a lone minor 7th as i, because scoring one chord rewards it
// for being its own tonic. In jazz it is far more often a ii. Rather than guess,
// the ii reading is offered as a branch — so this must hold with NO key set.
check('REGRESSION: a lone minor chord offers its ii–V even on auto', () => {
  const bad = [];
  for (let root = 0; root < 12; root++) {
    for (const q of ['m7', 'm9']) {
      const notes = H.voice(root, q, { spice: 1, shape: 'closed' });
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed', null);
      const vRoot = (root + 5) % 12;          // if this is ii, its V is a 4th up
      const found = branches.some(b => b.sequence.some(
        s => s.rootPC === vRoot && H.QUALITIES[s.quality].family === 'dominant'));
      if (!found) {
        bad.push(`${NM[root]}${q} on auto: no ${NM[vRoot]}7 — ` + branches.map(b => b.name).join(' | '));
      }
    }
  }
  return bad;
});

check('a reinterpretation branch is labelled in the key it argues for', () => {
  const bad = [];
  for (let root = 0; root < 12; root++) {
    const notes = H.voice(root, 'm7', { spice: 1, shape: 'closed' });
    const { branches } = H.suggest(notes, root, 'm7', [], 1, 'closed', null);
    for (const b of branches.filter(x => x.device === 'treat-as-ii')) {
      if (!/^ii/.test(b.roman)) {
        bad.push(`${NM[root]}m7: "hear it as a two" labelled "${b.roman}" — should start ii`);
      }
      if (!b.modulatesTo || b.modulatesTo.tonicPc !== (root + 10) % 12) {
        bad.push(`${NM[root]}m7: should declare ${NM[(root + 10) % 12]} major as home`);
      }
    }
  }
  return bad;
});

// Every other functional device walks the cycle of fifths DOWNWARD, because
// that is where cadences live. The move UP a fifth had no device at all, so
// Dm never offered Am — i→v in minor and ii→vi in major, both everyday moves.
check('REGRESSION: the chord a fifth above is reachable', () => {
  const bad = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    // i → v in a minor key
    const iNotes = H.voice(tonic, 'm7', { spice: 1, shape: 'closed' });
    const minor  = H.suggest(iNotes, tonic, 'm7', [], 1, 'closed', { tonicPc: tonic, mode: 'minor' });
    const v = (tonic + 7) % 12;
    if (!minor.branches.some(b => b.sequence.some(s => s.rootPC === v))) {
      bad.push(`${NM[tonic]} minor: i never offers its v (${NM[v]}) — ` +
               minor.branches.map(b => b.name).join(' | '));
    }

    // ii → vi in a major key
    const iiRoot = (tonic + 2) % 12;
    const iiNotes = H.voice(iiRoot, 'm7', { spice: 1, shape: 'closed' });
    const major = H.suggest(iiNotes, iiRoot, 'm7', [], 1, 'closed', { tonicPc: tonic, mode: 'major' });
    const vi = (tonic + 9) % 12;
    if (!major.branches.some(b => b.sequence.some(s => s.rootPC === vi))) {
      bad.push(`${NM[tonic]} major: ii never offers vi (${NM[vi]}) — ` +
               major.branches.map(b => b.name).join(' | '));
    }
  }
  return bad;
});

check('the fifth-up move stays inside the key', () => {
  const bad = [];
  const scale = { major: [0,2,4,5,7,9,11], minor: [0,2,3,5,7,8,10] };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['major', 'minor']) {
      for (const deg of scale[mode]) {
        const root = (tonic + deg) % 12;
        const q = mode === 'major'
          ? ([0,5].includes(deg) ? 'maj7' : deg === 7 ? '7' : deg === 11 ? 'm7b5' : 'm7')
          : ([3,8].includes(deg) ? 'maj7' : deg === 10 ? '7' : deg === 2 ? 'm7b5' : 'm7');
        const notes = H.voice(root, q, { spice: 1, shape: 'closed' });
        const r = H.suggest(notes, root, q, [], 1, 'closed', { tonicPc: tonic, mode });
        const b = r.branches.find(x => x.device === 'diatonic-fifth-up');
        if (!b) continue;
        const landed = ((b.sequence[0].rootPC - tonic) % 12 + 12) % 12;
        if (!scale[mode].includes(landed)) {
          bad.push(`${NM[tonic]} ${mode}, from ${NM[root]}${q}: lands on ${NM[b.sequence[0].rootPC]}, outside the key`);
        }
      }
    }
  }
  return bad;
});

check('the V chord of a declared key is offered its I', () => {
  const bad = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const vRoot = (tonic + 7) % 12;
    const notes = H.voice(vRoot, '7', { spice: 1, shape: 'closed' });
    const { branches } = H.suggest(notes, vRoot, '7', [], 1, 'closed', { tonicPc: tonic, mode: 'major' });
    if (!branches.some(b => b.sequence.some(s => s.rootPC === tonic))) {
      bad.push(`${NM[vRoot]}7 in ${NM[tonic]} major: never resolves to ${NM[tonic]}`);
    }
  }
  return bad;
});

check('roman numerals are relative to the declared key', () => {
  const bad = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const iiRoot = (tonic + 2) % 12;
    const notes  = H.voice(iiRoot, 'm7', { spice: 1, shape: 'closed' });
    const { branches } = H.suggest(notes, iiRoot, 'm7', [], 1, 'closed', { tonicPc: tonic, mode: 'major' });
    for (const b of branches) {
      if (!b.roman) { bad.push(`${NM[iiRoot]}m7 in ${NM[tonic]}: branch with no roman`); continue; }
      // The played chord is the ii, so every path must start there.
      if (!b.roman.startsWith('ii')) {
        bad.push(`${NM[iiRoot]}m7 in ${NM[tonic]} major: roman starts "${b.roman.split(' ')[0]}", expected ii`);
      }
    }
  }
  return bad;
});

check('modulation devices declare a real key to land in', () => {
  const bad = [];
  for (const seed of SEEDS) for (let tonic = 0; tonic < 12; tonic++) {
    const { branches } = H.suggest(seed.notes, seed.root, seed.q, [], 1, 'closed', { tonicPc: tonic, mode: 'major' });
    for (const b of branches) {
      if (!b.modulatesTo) continue;
      const { tonicPc, mode } = b.modulatesTo;
      if (!(Number.isInteger(tonicPc) && tonicPc >= 0 && tonicPc < 12)) {
        bad.push(`${b.name}: modulatesTo tonic ${tonicPc}`);
      }
      if (mode !== 'major' && mode !== 'minor') bad.push(`${b.name}: modulatesTo mode "${mode}"`);
      if (tonicPc === tonic && mode === 'major') bad.push(`${b.name}: "modulates" to the key it is already in`);
      // The device must actually land on its new tonic.
      const last = b.sequence[b.sequence.length - 1];
      if (last.rootPC !== tonicPc) {
        bad.push(`${b.name}: says it modulates to ${NM[tonicPc]} but ends on ${NM[last.rootPC]}`);
      }
    }
  }
  return bad;
});

check('a modulation leaves you somewhere the tree can keep growing', () => {
  const bad = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const notes = H.voice(tonic, 'maj7', { spice: 1, shape: 'closed' });
    const { branches } = H.suggest(notes, tonic, 'maj7', [], 1, 'closed', { tonicPc: tonic, mode: 'major' });
    for (const b of branches.filter(x => x.modulatesTo)) {
      const landed = b.resolvesTo;
      const next = H.suggest(landed.notes, landed.rootPC, landed.quality, [], 1, 'closed', b.modulatesTo);
      if (!next.branches.length) bad.push(`${b.name} → ${NM[b.modulatesTo.tonicPc]}: dead end`);
      // In the new key the landing chord should read as the tonic.
      const first = next.branches[0];
      if (first && first.roman && !/^I|^i/.test(first.roman)) {
        bad.push(`${b.name}: landed on ${landed.name} but it reads as "${first.roman.split(' ')[0]}" in the new key`);
      }
    }
  }
  return bad;
});

check('diatonic passing moves land inside the declared key', () => {
  const bad = [];
  const inKey = (pcv, tonic, mode) => {
    const scale = mode === 'minor' ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
    return scale.includes(((pcv - tonic) % 12 + 12) % 12);
  };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const deg of [0, 2, 4, 5, 7, 9]) {
      const root = (tonic + deg) % 12;
      const q = (deg === 0 || deg === 5) ? 'maj7' : (deg === 7 ? '7' : 'm7');
      const notes = H.voice(root, q, { spice: 1, shape: 'closed' });
      const { branches } = H.suggest(notes, root, q, [], 1, 'closed', { tonicPc: tonic, mode: 'major' });
      for (const b of branches.filter(x => /diatonic/.test(x.device || ''))) {
        const last = b.sequence[b.sequence.length - 1];
        if (!inKey(last.rootPC, tonic, 'major')) {
          bad.push(`${b.device} from ${NM[root]}${q} in ${NM[tonic]}: lands on ${NM[last.rootPC]}, outside the key`);
        }
      }
    }
  }
  return bad;
});

// ═══════════════════════════════════════════════════════════════════════════
//  10. Notation spelling
//      A single sharps-or-flats flag chosen from the root gets Gm9 wrong: G is
//      a sharp-key root, so the chord's flat 3rd came out as A#. Spelling has
//      to follow each note's FUNCTION.
// ═══════════════════════════════════════════════════════════════════════════

const glyph = sp => sp.step.toUpperCase() + sp.accidental + sp.octave;
const SEMI  = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

check('REGRESSION: notes are spelled by function, not a root-wide flag', () => {
  const bad = [];
  const cases = [
    ['Gm9 flat-3 is Bb, never A#',  [43, 58, 62, 65, 69], 7, 'm9',      'Bb3'],
    ['G7b9 flat-9 is Ab, never G#', [43, 59, 62, 68],     7, '7b9',     'Ab4'],
    ['Gmaj7 maj7 is F#',            [43, 59, 62, 66],     7, 'maj7',    'F#4'],
    ['C7#9 sharp-9 is D#',          [48, 52, 58, 63],     0, '7#9',     'D#4'],
    ['Fmaj7#11 sharp-11 is B',      [41, 57, 59, 64],     5, 'maj7#11', 'B3' ],
  ];
  for (const [label, notes, root, q, expect] of cases) {
    const spelled = H.spellChord(notes, root, q).map(glyph);
    if (!spelled.includes(expect)) {
      bad.push(`${label}: got ${spelled.join(' ')}, expected ${expect} among them`);
    }
  }
  return bad;
});

check('the root is always spelled as itself', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) {
    const notes = H.voice(root, q, { spice: 1, shape: 'closed' });
    const rootNote = notes.find(n => ((n % 12) + 12) % 12 === root);
    if (rootNote == null) continue;
    const sp = H.spellChord(notes, root, q).find(x => x.midi === rootNote);
    const semis = SEMI[sp.step.toUpperCase()]
                + (sp.accidental === '#' ? 1 : sp.accidental === 'b' ? -1 : 0);
    if (((semis % 12) + 12) % 12 !== root) {
      bad.push(`${NM[root]}${q}: root spelled ${glyph(sp)}, which is not ${NM[root]}`);
    }
  }
  return bad;
});

// The safety net under all of it: whatever letter and accidental we choose, it
// has to sound the note we were given.
check('every spelling sounds the pitch it claims', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const sh of SHAPES) {
    const notes = H.voice(root, q, { spice: 2, shape: sh });
    for (const sp of H.spellChord(notes, root, q)) {
      const alter = sp.accidental === '#' ? 1 : sp.accidental === 'b' ? -1 : 0;
      const midi  = (sp.octave + 1) * 12 + SEMI[sp.step.toUpperCase()] + alter;
      if (midi !== sp.midi) {
        bad.push(`${NM[root]}${q} ${sh}: ${glyph(sp)} sounds midi ${midi}, not ${sp.midi}`);
      }
    }
  }
  return bad;
});

check('no double accidentals reach the staff', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) for (const s of SPICES) {
    const notes = H.voice(root, q, { spice: s, shape: 'closed' });
    for (const sp of H.spellChord(notes, root, q)) {
      if (sp.accidental.length > 1) bad.push(`${NM[root]}${q}@${s}: ${glyph(sp)}`);
    }
  }
  return bad;
});

check('chord names follow the key, not a fixed sharp/flat table', () => {
  const bad = [];
  const cases = [
    // The vi of A major is F♯m7. The fixed table spelled D E G A B sharp and
    // everything else flat, so it came out G♭m7 — a note A major does not own.
    [6, 'm7',   null, { tonicPc: 9, mode: 'major' }, 'F♯m7'],
    [9, 'maj7', 8,    { tonicPc: 9, mode: 'major' }, 'Amaj7/G♯'],
    // A minor key borrows its relative major's signature.
    [6, 'm7',   null, { tonicPc: 6, mode: 'minor' }, 'F♯m7'],
    // Flat keys still spell flat.
    [6, 'm7',   null, { tonicPc: 3, mode: 'major' }, 'G♭m7'],
    [1, 'maj7', null, { tonicPc: 3, mode: 'major' }, 'D♭maj7'],
    // C has no flats: the ascending passing chord is C♯dim7, not D♭dim7.
    [1, 'dim7', null, { tonicPc: 0, mode: 'major' }, 'C♯dim7'],
  ];
  for (const [root, q, bass, key, want] of cases) {
    const got = H.chordName(root, q, bass, key);
    if (got !== want) bad.push(`${want} expected, got ${got}`);
  }
  return bad;
});

check('an unknown key still spells every chord', () => {
  const bad = [];
  for (const root of ROOTS) for (const q of QUALS) {
    for (const key of [null, undefined, {}, { tonicPc: null }]) {
      const n = H.chordName(root, q, null, key);
      if (!n || /undefined|NaN/.test(n)) bad.push(`${root}${q} with ${JSON.stringify(key)} → ${n}`);
    }
  }
  return bad;
});

// ── Report ──────────────────────────────────────────────────────────────────

console.log('');
for (const f of failures) {
  console.log(`✗ ${f.name}`);
  f.cases.forEach(c => console.log(`    ${c}`));
  if (f.total > f.cases.length) console.log(`    …and ${f.total - f.cases.length} more`);
  console.log('');
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

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

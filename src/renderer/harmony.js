/**
 * harmony.js
 * Voice Me — the harmony engine. One vocabulary, five capabilities.
 *
 *   identify()  — what chord is this?                  (was app.js CHORD_PATTERNS)
 *   colour()    — which tones, at what spice?          (was engine.js CHORD)
 *   voice()     — arrange them in a shape              (was voicing.js arrange*)
 *   lead()      — voice-lead from what's already down  (was voicing.js voiceLead)
 *   suggest()   — what chord comes next                (was suggest.js)
 *
 * ── The two dials ──────────────────────────────────────────────────────────
 *
 *   SPICE  (0 basic · 1 colourful · 2 complex)   — WHICH pitch classes sound.
 *   SHAPE  (minimal · closed · open · cluster)   — HOW they spread across the
 *                                                  registers.
 *
 * They are orthogonal and they compose: an *open triad* and a *minimal altered
 * dominant* are both expressible, because colour never decides register and
 * shape never decides harmony. The old code conflated them — `mode: 'open'`
 * silently added 9ths and 13ths, which is spice's job — so half the grid was
 * unreachable. Keep them separate.
 *
 * ── Core vs. extension ─────────────────────────────────────────────────────
 *
 * `core` tones are always voiced: they are what the chord *is*, and if the
 * player played them we must not strip them. `ext` tones are what the engine
 * VOLUNTEERS, gated by the spice dial. Spice only ever widens the palette.
 *
 * Runs in the browser (window.Harmony) and in Node (module.exports) so the
 * invariants in test/harmony.test.js can exercise it headless.
 */
(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════════════════
  //  §1  Spelling
  // ═════════════════════════════════════════════════════════════════════════

  const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const FLAT_NAMES  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

  // Roots whose key signature uses sharps: D E G A B
  const SHARP_ROOT_PCS = new Set([2, 4, 7, 9, 11]);

  const pc     = n => ((n % 12) + 12) % 12;
  const octave = n => Math.floor(n / 12) - 1;

  function noteName(pitchClass, useSharp) {
    return (useSharp ? SHARP_NAMES : FLAT_NAMES)[pc(pitchClass)];
  }
  function spell(pitchClass, useSharp) {
    return noteName(pitchClass, useSharp === undefined ? SHARP_ROOT_PCS.has(pc(pitchClass)) : useSharp);
  }
  function midiName(midi) {
    return spell(pc(midi)) + octave(midi);
  }
  function glyphs(str) {
    return String(str).replace(/#/g, '♯').replace(/b/g, (m, i, s) => {
      const prev = s[i - 1];
      return (prev && /[A-G0-9]/.test(prev)) ? '♭' : m;
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §2  Vocabulary
  // ═════════════════════════════════════════════════════════════════════════

  // Canonical qualities — everything the engine can voice.
  //
  //   family  major | minor | dominant | sus | dim   → drives the jazz rules
  //   triad   true when there is no 7th/6th in core
  //   core    [interval, role]        always sounded
  //   ext     [interval, role, tier]  volunteered when spice >= tier
  //   rigid5  the 5th is structural (♭5/♯5) and must never be dropped
  //
  // Intervals are semitones above the root.

  const QUALITIES = {
    // ── Triads ───────────────────────────────────────────────────────────
    'maj':      { family: 'major',    triad: true,
                  core: [[0,'root'],[4,'3rd'],[7,'5th']],
                  ext:  [[11,'7th',1],[2,'9th',2]] },
    'min':      { family: 'minor',    triad: true,
                  core: [[0,'root'],[3,'3rd'],[7,'5th']],
                  ext:  [[10,'7th',1],[2,'9th',2]] },
    'dim':      { family: 'dim',      triad: true, rigid5: true,
                  core: [[0,'root'],[3,'3rd'],[6,'5th']],
                  ext:  [[9,'7th',2]] },
    'aug':      { family: 'major',    triad: true, rigid5: true,
                  core: [[0,'root'],[4,'3rd'],[8,'5th']],
                  ext:  [[10,'7th',2]] },

    // ── 6ths ─────────────────────────────────────────────────────────────
    '6':        { family: 'major',
                  core: [[0,'root'],[4,'3rd'],[9,'6th'],[7,'5th']],
                  ext:  [[2,'9th',2]] },
    'm6':       { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[9,'6th'],[7,'5th']],
                  ext:  [[2,'9th',2]] },

    // ── 7ths ─────────────────────────────────────────────────────────────
    'maj7':     { family: 'major',
                  core: [[0,'root'],[4,'3rd'],[11,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1],[6,'♯11',2],[9,'13th',2]] },
    'm7':       { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[10,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1],[5,'11th',2]] },
    '7':        { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1],[9,'13th',2]] },
    'mMaj7':    { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[11,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1]] },
    'm7b5':     { family: 'minor',   rigid5: true,
                  core: [[0,'root'],[3,'3rd'],[6,'5th'],[10,'7th']],
                  ext:  [[5,'11th',2]] },
    'dim7':     { family: 'dim',     rigid5: true,
                  core: [[0,'root'],[3,'3rd'],[6,'5th'],[9,'7th']],
                  ext:  [] },
    '7sus4':    { family: 'sus',
                  core: [[0,'root'],[5,'4th'],[10,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1]] },

    // ── Named colours (the colour is part of the name, so it lives in core) ─
    'maj9':     { family: 'major',
                  core: [[0,'root'],[4,'3rd'],[11,'7th'],[2,'9th'],[7,'5th']],
                  ext:  [[6,'♯11',2],[9,'13th',2]] },
    'm9':       { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[10,'7th'],[2,'9th'],[7,'5th']],
                  ext:  [[5,'11th',2]] },
    'm11':      { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[10,'7th'],[2,'9th'],[5,'11th']],
                  ext:  [] },
    '9':        { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[2,'9th'],[7,'5th']],
                  ext:  [[9,'13th',2]] },
    '13':       { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[9,'13th'],[2,'9th']],
                  ext:  [] },

    // ── Altered dominants ────────────────────────────────────────────────
    '7alt':     { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[1,'♭9'],[8,'♭13']],
                  ext:  [[6,'♯11',2]] },
    '7b9':      { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[1,'♭9'],[7,'5th']],
                  ext:  [[9,'13th',2]] },
    '7#9':      { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[3,'♯9'],[7,'5th']],
                  ext:  [[9,'13th',2]] },
    '7b9(13)':  { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[1,'♭9'],[9,'13th']],
                  ext:  [] },
    '7b9(b13)': { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[1,'♭9'],[8,'♭13']],
                  ext:  [] },
    '7#9(13)':  { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[3,'♯9'],[9,'13th']],
                  ext:  [] },
    '7#9(b13)': { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[3,'♯9'],[8,'♭13']],
                  ext:  [] },
  };

  // ── Recognition patterns ────────────────────────────────────────────────
  // What the ear should NAME, which is finer-grained than what we can VOICE.
  // `voiceAs` points a display-only spelling at the canonical quality that
  // voices it. This replaces compose.js's QUALITY_MAP — the correspondence now
  // lives in the data instead of a separate table that could drift out of sync.

  const PATTERNS = [
    // ── Triads ──────────────────────────────────────────────────────────
    { intervals: [0,4,7],          suffix: '',        quality: 'maj',   priority: 10 },
    { intervals: [0,3,7],          suffix: 'm',       quality: 'min',   priority: 10 },
    { intervals: [0,3,6],          suffix: 'dim',     quality: 'dim',   priority: 10 },
    { intervals: [0,4,8],          suffix: 'aug',     quality: 'aug',   priority: 10 },
    { intervals: [0,2,7],          suffix: 'sus2',    quality: 'sus',   priority: 7,  voiceAs: '7sus4' },
    { intervals: [0,5,7],          suffix: 'sus4',    quality: 'sus',   priority: 7,  voiceAs: '7sus4' },

    // ── 6ths ────────────────────────────────────────────────────────────
    { intervals: [0,4,7,9],        suffix: '6',       quality: 'maj6',  priority: 9,  voiceAs: '6'  },
    { intervals: [0,3,7,9],        suffix: 'm6',      quality: 'min6',  priority: 9,  voiceAs: 'm6' },

    // ── 7ths ────────────────────────────────────────────────────────────
    { intervals: [0,4,7,11],       suffix: 'maj7',    quality: 'maj7',    priority: 12 },
    { intervals: [0,3,7,10],       suffix: 'm7',      quality: 'min7',    priority: 12, voiceAs: 'm7' },
    { intervals: [0,4,7,10],       suffix: '7',       quality: 'dom7',    priority: 12, voiceAs: '7'  },
    { intervals: [0,3,7,11],       suffix: 'mM7',     quality: 'minMaj7', priority: 11, voiceAs: 'mMaj7' },
    { intervals: [0,3,6,9],        suffix: 'dim7',    quality: 'dim7',    priority: 11 },
    { intervals: [0,3,6,10],       suffix: 'm7b5',    quality: 'hdim',    priority: 11, voiceAs: 'm7b5' },
    { intervals: [0,4,8,10],       suffix: 'aug7',    quality: 'aug7',    priority: 10, voiceAs: '7alt' },
    { intervals: [0,5,7,10],       suffix: '7sus4',   quality: 'sus7',    priority: 15, voiceAs: '7sus4' },
    { intervals: [0,2,5,10],       suffix: '9sus4',   quality: 'sus9',    priority: 16, voiceAs: '7sus4' },
    { intervals: [0,2,5,7,10],     suffix: '9sus4',   quality: 'sus9',    priority: 17, voiceAs: '7sus4' },

    // ── Altered dominants ───────────────────────────────────────────────
    { intervals: [0,4,7,10,1],     suffix: '7b9',     quality: 'alt',     priority: 13, voiceAs: '7b9' },
    { intervals: [0,4,7,10,3],     suffix: '7#9',     quality: 'alt',     priority: 13, voiceAs: '7#9' },
    { intervals: [0,4,6,10],       suffix: '7b5',     quality: 'alt',     priority: 11, voiceAs: '7alt' },
    { intervals: [0,4,6,10,2],     suffix: '9b5',     quality: 'alt',     priority: 12, voiceAs: '7alt' },
    { intervals: [0,4,8,10,2],     suffix: '9#5',     quality: 'alt',     priority: 12, voiceAs: '7alt' },
    { intervals: [0,4,6,10,1],     suffix: '7b5b9',   quality: 'alt',     priority: 13, voiceAs: '7alt' },
    { intervals: [0,4,6,10,3],     suffix: '7b5#9',   quality: 'alt',     priority: 13, voiceAs: '7alt' },
    { intervals: [0,4,8,10,1],     suffix: '7#5b9',   quality: 'alt',     priority: 13, voiceAs: '7alt' },
    { intervals: [0,4,8,10,3],     suffix: '7#5#9',   quality: 'alt',     priority: 13, voiceAs: '7alt' },
    { intervals: [0,4,7,10,6],     suffix: '7#11',    quality: 'lydian7', priority: 12, voiceAs: '9'   },
    { intervals: [0,4,7,10,1,6],   suffix: '7b9#11',  quality: 'alt',     priority: 14, voiceAs: '7alt' },
    { intervals: [0,4,7,10,3,6],   suffix: '7#9#11',  quality: 'alt',     priority: 14, voiceAs: '7alt' },

    // ── 9ths ────────────────────────────────────────────────────────────
    { intervals: [0,4,7,11,2],     suffix: 'maj9',    quality: 'maj9',    priority: 13 },
    { intervals: [0,3,7,10,2],     suffix: 'm9',      quality: 'min9',    priority: 13, voiceAs: 'm9' },
    { intervals: [0,4,7,10,2],     suffix: '9',       quality: 'dom9',    priority: 13, voiceAs: '9'  },
    { intervals: [0,3,7,11,2],     suffix: 'mM9',     quality: 'minMaj9', priority: 12, voiceAs: 'mMaj7' },
    { intervals: [0,4,7,9,2],      suffix: '6/9',     quality: 'maj69',   priority: 11, voiceAs: 'maj9' },
    { intervals: [0,3,7,9,2],      suffix: 'm6/9',    quality: 'min69',   priority: 11, voiceAs: 'm9'   },
    { intervals: [0,4,7,2],        suffix: 'add9',    quality: 'add9',    priority: 8,  voiceAs: 'maj'  },
    { intervals: [0,3,7,2],        suffix: 'madd9',   quality: 'add9',    priority: 8,  voiceAs: 'min'  },

    // ── 11ths ───────────────────────────────────────────────────────────
    { intervals: [0,4,7,10,2,5],   suffix: '11',      quality: 'dom11',   priority: 13, voiceAs: '9'    },
    { intervals: [0,3,7,10,2,5],   suffix: 'm11',     quality: 'min11',   priority: 13, voiceAs: 'm11'  },
    { intervals: [0,4,7,11,2,5],   suffix: 'maj11',   quality: 'maj11',   priority: 12, voiceAs: 'maj9' },
    { intervals: [0,4,7,11,6],     suffix: 'maj7#11', quality: 'lydian',  priority: 13, voiceAs: 'maj9' },
    { intervals: [0,4,7,11,2,6],   suffix: 'maj9#11', quality: 'lydian',  priority: 14, voiceAs: 'maj9' },
    // Cluster voicing: root ♭3 11 5 13 ♭7 — no 9th (e.g. Fmin11 cluster)
    { intervals: [0,3,5,7,9,10],   suffix: 'm11',     quality: 'min11',   priority: 12, voiceAs: 'm11'  },

    // ── 13ths ───────────────────────────────────────────────────────────
    { intervals: [0,4,7,10,2,5,9], suffix: '13',      quality: 'dom13',   priority: 13, voiceAs: '13' },
    { intervals: [0,4,10,2,9],     suffix: '9(13)',   quality: 'dom13',   priority: 16, voiceAs: '13' },
    { intervals: [0,4,10,1,9],     suffix: '7b9(13)', quality: 'alt',     priority: 16, voiceAs: '7b9(13)'  },
    { intervals: [0,4,10,3,9],     suffix: '7#9(13)', quality: 'alt',     priority: 16, voiceAs: '7#9(13)'  },
    { intervals: [0,4,10,1,8],     suffix: '7b9(b13)',quality: 'alt',     priority: 16, voiceAs: '7b9(b13)' },
    { intervals: [0,4,10,3,8],     suffix: '7#9(b13)',quality: 'alt',     priority: 16, voiceAs: '7#9(b13)' },
    { intervals: [0,4,10,2,8],     suffix: '9(b13)',  quality: 'alt',     priority: 16, voiceAs: '7alt' },
    { intervals: [0,3,7,10,2,5,9], suffix: 'm13',     quality: 'min13',   priority: 13, voiceAs: 'm9'   },
    { intervals: [0,4,7,11,2,9],   suffix: 'maj13',   quality: 'maj13',   priority: 12, voiceAs: 'maj9' },
    { intervals: [0,4,7,10,9],     suffix: '13',      quality: 'dom13',   priority: 11, voiceAs: '13'   },
  ];

  // Canonical voicing quality for a recognised pattern.
  const voiceAs = p => p.voiceAs || (QUALITIES[p.quality] ? p.quality : 'maj7');

  // ═════════════════════════════════════════════════════════════════════════
  //  §3  Colour — the spice dial decides WHICH pitch classes sound
  // ═════════════════════════════════════════════════════════════════════════

  // How readily a voice may be dropped when a shape asks for fewer voices.
  // 0 never. Guide tones define the chord; the 5th is the first thing a jazz
  // pianist lets go of, and on a dominant it is the *first* thing to go.
  function dropRank(role, def) {
    if (role === '3rd' || role === '4th' || role === '7th' || role === '6th') return 0;
    if (role === 'root') return 1;
    // A ♭5 or ♯5 IS the chord's identity — dropping it turns m7♭5 into m7.
    if (role === '5th') return def.rigid5 ? 0 : (def.family === 'dominant' ? 5 : 4);
    return 2;   // colour: 9ths, 11ths, 13ths, alterations
  }

  const ALTERED_9_ROLES = new Set(['♭9', '♯9']);

  /**
   * The tones of a chord at a given spice level.
   * Returns [{ pc, iv, role, rank }] — pitch classes with their function.
   * Core is unconditional; extensions arrive as spice widens.
   */
  function colour(rootPC, quality, spice) {
    const def = QUALITIES[quality] || QUALITIES['maj7'];
    const s   = spice == null ? 1 : spice;
    const root = pc(rootPC);

    const tones = def.core.map(([iv, role]) => ({ iv, role }));
    for (const [iv, role, tier] of (def.ext || [])) {
      if (tier <= s) tones.push({ iv, role });
    }

    // ── Jazz rules, enforced here so no data edit can violate them ──
    let out = tones;

    // Never a natural 11 against a major 3rd — that is the ♯11 (Lydian) instead.
    if (def.family === 'major' || def.family === 'dominant') {
      out = out.filter(t => !(t.iv % 12 === 5 && t.role !== '4th'));
    }
    // Never a natural 9 next to a ♭9 or ♯9. Tested by ROLE, not interval — on a
    // minor chord interval 3 is the ♭3, not a ♯9, and testing intervals here
    // silently stripped the 9th out of every m9 and m11.
    if (out.some(t => ALTERED_9_ROLES.has(t.role))) {
      out = out.filter(t => t.role !== '9th');
    }

    // De-duplicate by pitch class, keeping the first (core before ext).
    const seen = new Set();
    return out.filter(t => {
      const p = pc(root + t.iv);
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    }).map(t => ({ pc: pc(root + t.iv), iv: t.iv % 12, role: t.role, rank: dropRank(t.role, def) }));
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §4  Shape — the texture dial decides HOW they spread
  // ═════════════════════════════════════════════════════════════════════════

  const KEY_LO = 33;   // A1 — matches the rendered keyboard
  const KEY_HI = 96;   // C7

  // voices      how many notes the texture wants
  // bass        window the lowest voice lives in
  // upper       window the rest live in
  // gap         [minimum, preferred] semitones between adjacent upper voices
  // invertBass  a chord tone other than the root takes the bass
  // double      may repeat root/5th in another octave to reach the voice count
  //
  // `invertBass` puts the 3rd or 7th on the bottom but KEEPS the root in the
  // upper structure. A truly rootless voicing assumes a bassist; this is a solo
  // piano app, so dropping the root entirely makes the chord unnameable — and
  // compose mode has to be able to recognise what it just told you to play.
  const SHAPES = {
    minimal: { voices: 3, bass: [45, 62], upper: [52, 76], gap: [3, 4],  invertBass: false, double: false },
    closed:  { voices: 4, bass: [40, 60], upper: [52, 79], gap: [1, 3],  invertBass: false, double: true  },
    open:    { voices: 5, bass: [36, 55], upper: [57, 84], gap: [3, 7],  invertBass: false, double: true  },
    cluster: { voices: 5, bass: [50, 64], upper: [55, 84], gap: [1, 2],  invertBass: true,  double: false },
  };

  const clampKey = m => Math.min(KEY_HI, Math.max(KEY_LO, m));

  function intoWindow(midi, [lo, hi]) {
    while (midi < lo) midi += 12;
    while (midi > hi) midi -= 12;
    return clampKey(midi);
  }

  // Lowest MIDI with this pitch class strictly above `floor`.
  function above(pitchClass, floor) {
    let m = pc(pitchClass);
    while (m <= floor) m += 12;
    return m;
  }

  // MIDI with this pitch class nearest to `ref` — the voice-leading primitive.
  function nearestOctave(pitchClass, ref) {
    const p = pc(pitchClass);
    const m = p + 12 * Math.round((ref - p) / 12);
    let best = m, bestD = Math.abs(m - ref);
    for (const cand of [m - 12, m + 12]) {
      const d = Math.abs(cand - ref);
      if (d < bestD) { best = cand; bestD = d; }
    }
    return best;
  }

  // Nearest placement that stays on the keyboard and never turns a smooth
  // voice-leading move into a leap.
  function placeNear(pitchClass, ref) {
    let m = nearestOctave(pitchClass, ref);
    while (m < KEY_LO) m += 12;
    while (m > KEY_HI) m -= 12;
    while (m - ref > 12) m -= 12;
    while (ref - m > 12) m += 12;
    return m;
  }

  // Choose which tones sound, and in what order, for a shape's voice budget.
  // Guide tones first, then colour, then root, then the 5th — so trimming
  // sheds the 5th before it sheds a 9th, which is how pianists actually voice.
  function selectTones(tones, shape) {
    const sh = SHAPES[shape] || SHAPES.closed;
    const pool = [...tones];

    // A shape's voice count is a target, not a cap. Some chords need more to
    // exist at all — m7♭5 and dim7 are four essential tones, so "minimal"
    // stretches rather than emitting something that is not the chord.
    const essential = pool.filter(t => t.rank === 0).length + 1;   // + the root
    const budget    = Math.min(6, Math.max(sh.voices, essential));
    if (pool.length <= budget) return pool;

    // The root is never what gets dropped to save space.
    const keep = [];
    const root = pool.find(t => t.role === 'root');
    if (root) keep.push(root);

    const rest = pool.filter(t => t !== root).sort((a, b) => a.rank - b.rank);
    return [...keep, ...rest.slice(0, budget - keep.length)];
  }

  // Lift notes until no low interval is muddy: below C3 wants a minor 3rd of
  // air, below E3 wants a whole tone.
  //
  // Only ever moves by WHOLE OCTAVES. Nudging a note to an arbitrary pitch to
  // open up a gap changes the harmony — it silently turned 7ths into 6ths and
  // dropped guide tones out of chords entirely.
  function deMud(notes, minGap) {
    const out = [...notes].sort((a, b) => a - b);
    for (let i = 1; i < out.length; i++) {
      const need = out[i - 1] < 48 ? Math.max(3, minGap)
                 : out[i - 1] < 52 ? Math.max(2, minGap)
                 : minGap;
      let guard = 0;
      while (out[i] - out[i - 1] < need && out[i] + 12 <= KEY_HI && guard++ < 4) {
        out[i] += 12;
      }
      out.sort((a, b) => a - b);
    }
    // Any collision left after octave shifting means the voice is redundant.
    return [...new Set(out.map(clampKey))].sort((a, b) => a - b);
  }

  /**
   * A chord voiced in isolation — no previous chord to lead from.
   * `voice(rootPC, quality, { spice, shape })` → sorted MIDI notes.
   */
  function voice(rootPC, quality, opts) {
    const o     = opts || {};
    const shape = SHAPES[o.shape] ? o.shape : 'closed';
    const sh    = SHAPES[shape];
    const root  = pc(rootPC);
    const tones = selectTones(colour(root, quality, o.spice), shape);
    if (tones.length === 0) return [];

    // ── Bass ──
    let bassTone = sh.invertBass ? null : tones.find(t => t.role === 'root');
    if (!bassTone) {
      bassTone = tones.find(t => t.role === '3rd')
              || tones.find(t => t.role === '7th')
              || tones.find(t => t.role === '5th')
              || tones[0];
    }
    const bass = intoWindow(bassTone.pc, sh.bass);

    // ── Upper voices, stacked ascending with the shape's spacing ──
    const upper = tones.filter(t => t !== bassTone)
                       .sort((a, b) => ((a.pc - bass) % 12 + 12) % 12 - (((b.pc - bass) % 12 + 12) % 12));

    const [minGap, prefGap] = sh.gap;
    let cursor = Math.max(bass + prefGap, sh.upper[0] - 12);
    const notes = [bass];
    for (const t of upper) {
      let m = above(t.pc, cursor);
      while (m - cursor < minGap) m += 12;
      if (m > KEY_HI) m -= 12;
      notes.push(m);
      cursor = m;
    }

    // ── Double root/5th to reach the voice count (open and closed textures) ──
    if (sh.double) {
      const doublable = tones.filter(t => t.role === 'root' || t.role === '5th');
      let i = 0;
      while (notes.length < sh.voices && doublable.length && i < 12) {
        const t = doublable[i % doublable.length];
        i++;
        const top = Math.max(...notes);
        const m   = above(t.pc, top);
        if (m > KEY_HI || notes.includes(m)) continue;
        notes.push(m);
      }
    }

    return deMud(notes, minGap);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §5  Voice leading
  //
  //  Pass 1 pins common tones at their EXACT pitch — zero motion, the whole
  //  point of voice leading. Pass 2 does an exhaustive minimal-motion matching
  //  of what is left (n is tiny; branch-and-bound makes it instant).
  //
  //  Every previous voice ends up in held / moved / released, and every target
  //  note in held / moved / appeared. That completeness is what the keyboard
  //  cue and the arrows depend on, and it is what the old engine broke: on a
  //  "muddy" result it discarded the whole mapping and returned a single pair,
  //  so compose mode lit one key for a four-note chord. There is no bail here —
  //  register problems are FIXED, not escaped.
  // ═════════════════════════════════════════════════════════════════════════

  function matchTargets(sources, targetPCs) {
    const n = sources.length, m = targetPCs.length;
    let best = null;

    function rec(ti, usedSrc, pairs, appearedIdx, cost) {
      if (best && cost >= best.cost) return;                  // prune
      if (ti === m) {
        best = { cost, pairs: [...pairs], appearedIdx: [...appearedIdx], usedSrc: new Set(usedSrc) };
        return;
      }
      for (let sj = 0; sj < n; sj++) {
        if (usedSrc.has(sj)) continue;
        const to = placeNear(targetPCs[ti], sources[sj]);
        usedSrc.add(sj);
        pairs.push({ srcIdx: sj, tgtIdx: ti, to });
        rec(ti + 1, usedSrc, pairs, appearedIdx, cost + Math.abs(to - sources[sj]));
        pairs.pop();
        usedSrc.delete(sj);
      }
      // A target may only "appear" once the sources can no longer cover what
      // remains — otherwise a smooth move gets traded for an appear+release.
      if (n - usedSrc.size < m - ti) {
        appearedIdx.push(ti);
        rec(ti + 1, usedSrc, pairs, appearedIdx, cost);
        appearedIdx.pop();
      }
    }
    rec(0, new Set(), [], [], 0);
    return best || { pairs: [], appearedIdx: targetPCs.map((_, i) => i), usedSrc: new Set() };
  }

  function assignUpperVoices(prevUpper, targetPCs) {
    const held = [], moved = [], appeared = [], released = [];
    const targets = [...targetPCs];
    const sourcesLeft = [];

    // ── Pass 1: pin common tones ──
    for (const s of prevUpper) {
      const idx = targets.indexOf(pc(s));
      if (idx !== -1) { held.push({ from: s, to: s }); targets.splice(idx, 1); }
      else sourcesLeft.push(s);
    }

    // ── Pass 2: minimal-motion matching of the rest ──
    const best = matchTargets(sourcesLeft, targets);
    for (const p of best.pairs) moved.push({ from: sourcesLeft[p.srcIdx], to: p.to });
    best.appearedIdx.forEach(ti => appeared.push({ pc: targets[ti] }));
    sourcesLeft.forEach((s, i) => { if (!best.usedSrc.has(i)) released.push({ from: s }); });

    // ── Place appeared voices near the centre of what is already sounding ──
    const placed = [...held, ...moved].map(v => v.to);
    let centre = placed.length ? Math.round(placed.reduce((a, b) => a + b, 0) / placed.length) : 67;
    for (const a of appeared) {
      let m = placeNear(a.pc, centre);
      while (placed.includes(m) && m + 12 <= KEY_HI) m += 12;
      a.to = m;
      placed.push(m);
      centre = Math.round(placed.reduce((x, y) => x + y, 0) / placed.length);
    }

    return { held, moved, appeared: appeared.map(a => ({ to: a.to })), released };
  }

  // Keep voices on the keyboard and un-collided. Held voices are frozen — they
  // carry the zero-motion promise and came from a chord that was already fine.
  function registerSafety(voices) {
    const taken = new Set(voices.filter(v => v.kind === 'held').map(v => v.to));
    for (const v of voices) {
      if (v.kind === 'held') continue;
      let m = clampKey(v.to);
      let guard = 0;
      while (taken.has(m) && guard++ < 8) {
        m = m + 12 <= KEY_HI ? m + 12 : m - 12;
      }
      // Re-check the leap promise after any shifting.
      if (v.from != null) {
        while (m - v.from > 12 && m - 12 >= KEY_LO && !taken.has(m - 12)) m -= 12;
        while (v.from - m > 12 && m + 12 <= KEY_HI && !taken.has(m + 12)) m += 12;
      }
      v.to = m;
      taken.add(m);
    }
  }

  /**
   * Voice-lead into a chord from whatever is already sounding.
   *
   *   lead(prevNotes, rootPC, quality, { spice, shape, bassPc })
   *     → { notes, bassMidi, mapping: { held, moved, appeared, released } }
   *
   * `bassPc` forces a bass pitch class — slash chords and descending line
   * clichés (Bbmaj7/A, Bb7/Ab).
   */
  function lead(prevNotes, rootPC, quality, opts) {
    const o     = opts || {};
    const shape = SHAPES[o.shape] ? o.shape : 'closed';
    const sh    = SHAPES[shape];
    const root  = pc(rootPC);

    // No context — fall back to the register-anchored arrangement.
    if (!prevNotes || prevNotes.length === 0) {
      const notes = voice(root, quality, o);
      return {
        notes,
        bassMidi: notes[0],
        mapping: { held: [], moved: [], appeared: notes.map(to => ({ to })), released: [] },
        rootPC: root, quality, shape,
      };
    }

    const tones     = selectTones(colour(root, quality, o.spice), shape);
    const targetPCs = tones.map(t => t.pc);

    // ── 1. Bass pitch class — overridden, functional, or the rootless choice ──
    let bassPC;
    if (o.bassPc != null) {
      bassPC = pc(o.bassPc);
    } else if (sh.invertBass || !targetPCs.includes(root)) {
      const pick = tones.find(t => t.role === '3rd')
                || tones.find(t => t.role === '7th')
                || tones.find(t => t.role === '5th')
                || tones[0];
      bassPC = pick.pc;
    } else {
      bassPC = root;
    }

    // ── 2. Voice-lead the upper structure first ──
    const sorted   = [...prevNotes].sort((a, b) => a - b);
    const prevBass = sorted[0];

    const upperPCs = [...targetPCs];
    const bi = upperPCs.indexOf(bassPC);
    if (bi !== -1) upperPCs.splice(bi, 1);

    const prevUpper = sorted.slice(1);
    const asg = assignUpperVoices(prevUpper, upperPCs);

    const voices = [
      ...asg.held.map(v     => ({ from: v.from, to: v.to, kind: 'held'     })),
      ...asg.moved.map(v    => ({ from: v.from, to: v.to, kind: 'moved'    })),
      ...asg.appeared.map(v => ({ from: null,   to: v.to, kind: 'appeared' })),
    ];
    registerSafety(voices);

    // ── 3. Now place the bass UNDERNEATH them ──
    // The declared bass has to be the lowest sounding note or the chord is not
    // the slash chord we named. Placing it after the upper voices means a held
    // common tone never has to move to make room, so the zero-motion promise
    // survives even when the bass is forced by a slash.
    let bassMidi = intoWindow(nearestOctave(bassPC, prevBass), sh.bass);
    const lowestUpper = () => voices.length ? Math.min(...voices.map(v => v.to)) : KEY_HI;
    while (bassMidi >= lowestUpper() && bassMidi - 12 >= KEY_LO) bassMidi -= 12;

    // If the bass has run out of room below, lift whatever is under it instead.
    // A voice that has to move is REPORTED as moved — never as a held voice
    // that quietly changed pitch, which would make the mapping lie.
    for (const v of voices) {
      while (v.to <= bassMidi && v.to + 12 <= KEY_HI) v.to += 12;
      if (v.kind === 'held' && v.from !== v.to) v.kind = 'moved';
    }

    // ── 4. The bass is a voice too — the old engine forgot this, which is why
    //       its mapping never covered the whole chord.
    const bassVoice = prevBass === bassMidi
      ? { from: prevBass, to: bassMidi, kind: 'held' }
      : { from: prevBass, to: bassMidi, kind: 'moved' };

    const all = [bassVoice, ...voices];

    const mapping = {
      held:     all.filter(v => v.kind === 'held').map(v     => ({ from: v.from, to: v.to })),
      moved:    all.filter(v => v.kind === 'moved').map(v    => ({ from: v.from, to: v.to })),
      appeared: all.filter(v => v.kind === 'appeared').map(v => ({ to: v.to })),
      released: asg.released.map(v => ({ from: v.from })),
    };

    const notes = all.map(v => v.to).sort((a, b) => a - b);
    return { notes, bassMidi, mapping, rootPC: root, quality, shape };
  }

  /**
   * What the hands must do to get from one chord to the next.
   *
   * Derived by set difference from the actual notes — NOT from the voice-leading
   * mapping. The three cues are disjoint and always cover exactly the right
   * keys by construction, so a flaw in the mapping can never light the wrong
   * keys. (The old code derived them from the mapping through three independent
   * paint layers whose clear-functions disagreed, so grey routinely painted
   * over gold.) The mapping is still the right source for the ARROWS, which
   * show which voice went where.
   */
  function fingering(prevNotes, targetNotes) {
    const prev = new Set(prevNotes || []);
    const next = new Set(targetNotes || []);
    const asc  = (a, b) => a - b;
    return {
      hold:  [...next].filter(n =>  prev.has(n)).sort(asc),
      press: [...next].filter(n => !prev.has(n)).sort(asc),
      lift:  [...prev].filter(n => !next.has(n)).sort(asc),
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §6  Recognition
  // ═════════════════════════════════════════════════════════════════════════

  function scorePattern(intervals, pattern, rootIsBass) {
    const patternSet    = new Set(pattern.intervals);
    const coreIntervals = pattern.intervals.filter(i => i !== 7);   // 5th optional
    let coreMatched = 0;
    for (const i of coreIntervals) if (intervals.has(i)) coreMatched++;
    const required = coreIntervals.length <= 3 ? coreIntervals.length : coreIntervals.length - 1;
    if (coreMatched < required) return null;

    const fifthPresent = intervals.has(7) && patternSet.has(7);
    const totalMatched = coreMatched + (fifthPresent ? 1 : 0);
    let extra = 0;
    for (const i of intervals) if (!patternSet.has(i)) extra++;
    const coreMissing   = coreIntervals.length - coreMatched;
    const cleanBonus    = (extra === 0 && coreMissing === 0) ? 15 : 0;
    const dominantBonus = intervals.has(10) && intervals.has(4) && !intervals.has(11) ? 10 : 0;
    const bassRootBonus = rootIsBass ? 20 : 0;

    return totalMatched * 10 + pattern.priority + cleanBonus + dominantBonus
         + bassRootBonus - extra * 5 - coreMissing * 5;
  }

  function bestPattern(pitchClasses, bassPC, forcedRoot) {
    let best = null, bestScore = -Infinity;
    const roots = forcedRoot != null ? [pc(forcedRoot)] : pitchClasses;
    for (const rootPC of roots) {
      const intervals = new Set(pitchClasses.map(p => pc(p - rootPC)));
      for (const pattern of PATTERNS) {
        const score = scorePattern(intervals, pattern, bassPC != null && rootPC === bassPC);
        if (score != null && score > bestScore) {
          bestScore = score;
          best = { rootPC, suffix: pattern.suffix, quality: pattern.quality, voiceAs: voiceAs(pattern) };
        }
      }
    }
    return best;
  }

  function cleanTriad(pitchClasses) {
    const triads = PATTERNS.filter(p => p.intervals.length <= 3);
    let best = null, bestScore = -Infinity;
    for (const rootPC of pitchClasses) {
      const intervals = new Set(pitchClasses.map(p => pc(p - rootPC)));
      for (const pattern of triads) {
        const patternSet = new Set(pattern.intervals);
        let matched = 0;
        for (const i of patternSet) if (intervals.has(i)) matched++;
        if (matched < pattern.intervals.length) continue;
        let extra = 0;
        for (const i of intervals) if (!patternSet.has(i)) extra++;
        if (extra > 0) continue;
        const score = matched * 10 + pattern.priority + 15;
        if (score > bestScore) {
          bestScore = score;
          best = { rootPC, suffix: pattern.suffix, quality: pattern.quality, voiceAs: voiceAs(pattern) };
        }
      }
    }
    return best;
  }

  /**
   * Structured identification: { rootPC, quality, suffix, voiceAs, bassPC, notes }.
   * A chord with no third and no sus is harmonically indeterminate — unnamed.
   */
  function identify(midiNotes) {
    if (!midiNotes || midiNotes.length < 2) return null;
    const sorted = [...midiNotes].sort((a, b) => a - b);
    const bassPC = pc(sorted[0]);
    const pcs    = [...new Set(sorted.map(pc))];
    if (pcs.length < 2) return null;

    const best = bestPattern(pcs, bassPC);
    if (!best) return null;

    const iv    = new Set(pcs.map(p => pc(p - best.rootPC)));
    // A sus reading needs enough notes to actually be a chord — a bare fifth
    // is not a sus4, it is two notes with no harmonic identity.
    const isSus = pcs.length >= 3 &&
                  (best.quality === 'sus' || best.suffix.includes('sus')) &&
                  (iv.has(5) || iv.has(2));
    if (!iv.has(3) && !iv.has(4) && !isSus) return null;

    return {
      rootPC:  best.rootPC,
      quality: best.quality,
      suffix:  best.suffix,
      voiceAs: best.voiceAs,
      bassPC,
      notes:   sorted,
    };
  }

  /**
   * Display strings for the chord readout: { display, altDisplay, quality, ... }.
   * `showBass` turns on slash-chord spelling.
   */
  function describe(midiNotes, options) {
    const opts = options || {};
    const id   = identify(midiNotes);
    const pcs  = [...new Set((midiNotes || []).map(pc))];
    const bass = midiNotes && midiNotes.length ? pc([...midiNotes].sort((a, b) => a - b)[0]) : null;

    if (!id) {
      // No nameable root chord — try reading it as an upper triad over the bass.
      if (pcs.length < 3 || bass == null) return null;
      const upper = pcs.filter(p => p !== bass);
      if (upper.length < 3) return null;
      const triad = cleanTriad(upper);
      if (!triad) return null;
      const useSharp = SHARP_ROOT_PCS.has(triad.rootPC);
      const name = noteName(triad.rootPC, useSharp) + triad.suffix;
      return {
        display:    glyphs(opts.showBass ? name + '/' + noteName(bass, useSharp) : name),
        altDisplay: null,
        quality:    triad.quality,
        root:       noteName(triad.rootPC, useSharp),
        suffix:     triad.suffix,
      };
    }

    const useSharp     = SHARP_ROOT_PCS.has(id.rootPC);
    const rootName     = noteName(id.rootPC, useSharp);
    const bassName     = noteName(id.bassPC, useSharp);
    const rootChordStr = glyphs(rootName + id.suffix);
    const isInversion  = id.bassPC !== id.rootPC;

    let slashStr = null, altStr = null;

    if (isInversion) {
      slashStr = glyphs(rootChordStr + '/' + bassName);
      const bassAsRoot = bestPattern(pcs, id.bassPC, id.bassPC);
      if (bassAsRoot) {
        const bs = glyphs(noteName(id.bassPC, SHARP_ROOT_PCS.has(id.bassPC)) + bassAsRoot.suffix);
        if (bs !== rootChordStr) altStr = bs;
      }
    }

    // An upper triad over an unrelated bass — Eb/F, which is also F9sus4.
    if (!isInversion && pcs.length === 4) {
      const upper = pcs.filter(p => p !== id.bassPC);
      const triad = upper.length === 3 ? cleanTriad(upper) : null;
      if (triad) {
        const us = SHARP_ROOT_PCS.has(triad.rootPC);
        const upperSlash = glyphs(noteName(triad.rootPC, us) + triad.suffix + '/' + noteName(id.bassPC, us));
        if (upperSlash !== rootChordStr) { slashStr = upperSlash; altStr = rootChordStr; }
      }
    }

    return {
      display:    (opts.showBass && slashStr) ? slashStr : rootChordStr,
      altDisplay: (opts.showBass && altStr)   ? 'also: ' + altStr : null,
      quality:    id.quality,
      root:       rootName,
      suffix:     id.suffix,
    };
  }

  // Display name for a root + canonical quality, with an optional slash bass.
  function chordName(rootPC, quality, bassPc) {
    const useSharp = SHARP_ROOT_PCS.has(pc(rootPC));
    let name = noteName(rootPC, useSharp) + quality;
    if (bassPc != null && pc(bassPc) !== pc(rootPC)) {
      name += '/' + noteName(bassPc, SHARP_ROOT_PCS.has(pc(bassPc)));
    }
    return glyphs(name);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §7  Narration — the per-voice play-by-play
  // ═════════════════════════════════════════════════════════════════════════

  function degreeOf(pitchClass, rootPC, quality) {
    const i = pc(pitchClass - rootPC);
    const def = QUALITIES[quality] || QUALITIES['maj7'];
    const minor = def.family === 'minor' || def.family === 'dim';
    return { 0:'root', 1:'♭9', 2:'9', 3: minor ? '3rd' : '♯9', 4:'3rd',
             5: minor ? '11' : '4th', 6:'♯11', 7:'5th', 8:'♭13',
             9: def.core.some(c => c[1] === '6th') ? '6th' : '13',
             10:'♭7', 11:'maj7' }[i];
  }

  const STEP = { 1:'a half-step', 2:'a whole-step', 3:'a minor 3rd', 4:'a major 3rd', 5:'a 4th', 7:'a 5th' };

  function narrate(mapping, fromRoot, fromQual, toRoot, toQual) {
    const lines = [];
    for (const v of mapping.held) {
      const sf = degreeOf(v.from, fromRoot, fromQual), tf = degreeOf(v.to, toRoot, toQual);
      lines.push(`the ${sf} holds${sf !== tf ? `, becoming the ${tf}` : ''}`);
    }
    for (const v of mapping.moved) {
      const sf = degreeOf(v.from, fromRoot, fromQual), tf = degreeOf(v.to, toRoot, toQual);
      const d  = v.to - v.from;
      lines.push(`the ${sf} ${d < 0 ? 'falls' : 'rises'} ${STEP[Math.abs(d)] || Math.abs(d) + ' semitones'} to the ${tf}`);
    }
    for (const v of mapping.appeared) lines.push(`the ${degreeOf(v.to, toRoot, toQual)} enters`);
    for (const v of mapping.released) lines.push(`the ${degreeOf(v.from, fromRoot, fromQual)} drops away`);
    return lines;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §8  Suggestion — what chord comes next
  // ═════════════════════════════════════════════════════════════════════════

  const MAJOR_SCALE = [0,2,4,5,7,9,11];
  const MINOR_SCALE = [0,2,3,5,7,8,10];

  const isMajQ = q => /^(maj7|maj9|6|maj)$/.test(q);
  const isMinQ = q => /^(m7|m9|m6|m11|mMaj7|min)$/.test(q);
  const isDomQ = q => (QUALITIES[q] || {}).family === 'dominant';

  function qualityPCs(rootPC, quality) {
    return new Set(colour(rootPC, quality, 1).map(t => t.pc));
  }

  function inferKey(chords) {
    if (!chords || !chords.length) return null;
    const cur = chords[chords.length - 1];
    let best = null;
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const [mode, scale] of [['major', MAJOR_SCALE], ['minor', MINOR_SCALE]]) {
        const set = new Set(scale.map(s => pc(tonic + s)));
        let score = 0, w = 1;
        for (let i = chords.length - 1; i >= 0; i--) {
          const pcs = qualityPCs(chords[i].rootPC, chords[i].quality);
          let inKey = 0;
          pcs.forEach(p => { if (set.has(p)) inKey++; });
          score += (inKey / pcs.size) * w;
          if (chords[i].rootPC === tonic) score += 0.3 * w;
          w *= 0.6;
        }
        // A m7♭5 is the signature iiø of the minor key a whole step below.
        if (cur.quality === 'm7b5' && mode === 'minor' && tonic === pc(cur.rootPC - 2)) score += 0.5;
        if (!best || score > best.score) best = { tonicPc: tonic, mode, score };
      }
    }
    return best;
  }

  // ── Candidate generators ────────────────────────────────────────────────

  function functionalCandidates(root, q) {
    const out = [];
    const add = (iv, quality, reason, slot) =>
      out.push({ root: pc(root + iv), q: quality, reason, slot, family: 'functional' });

    if (isMajQ(q)) {
      add(7,  '7',    'V — dominant',                'home');
      add(5,  'maj7', 'IV — subdominant',            'lift');
      add(2,  'm7',   'ii',                          'lift');
      add(9,  'm7',   'vi — deceptive / rel. minor', 'shadow');
      add(4,  'm7',   'iii',                         'shadow');
    } else if (isMinQ(q)) {
      add(5,  'm7',   'iv',                            'home');
      add(3,  'maj7', 'III — relative major',          'lift');
      add(7,  '7',    'V — dominant (harmonic minor)', 'home');
      add(8,  'maj7', 'VI',                            'shadow');
      add(10, '7',    '♭VII',                          'shadow');
      add(5,  '7',    `treat as ii → V7 (pulls to ${noteName(root - 2, false)})`, 'far');
    } else if (q === 'm7b5') {
      add(5,  '7alt', 'ii°–V: here is its V',   'home');
      add(-2, 'm7',   'resolves toward i',      'shadow');
      add(3,  'maj7', '♭III of the implied key','lift');
    } else if (q === 'dim7' || q === 'dim') {
      add(1,  'maj7', 'resolves up a ½-step',             'home');
      add(1,  '7',    'resolves up a ½-step → dominant',  'lift');
      add(-2, 'm7',   'resolves down a whole-step',       'shadow');
      add(-1, '7',    'passing dim → dominant a ½ below', 'slide');
    } else if (isDomQ(q)) {
      add(5,  'maj7', 'V→I resolution',        'home');
      add(5,  'm7',   'V→i resolution',        'home');
      add(2,  'm7',   'deceptive → vi region', 'shadow');
    }
    return out;
  }

  function chromaticBassCandidates(root, q) {
    if (!isMajQ(q)) return [];
    return [
      { root, q: 'maj7', bassPc: pc(root + 11), slot: 'slide', family: 'chromatic',
        reason: `chromatic bass ${noteName(root, false)}→${noteName(root + 11, false)} (maj7 in bass)` },
      { root, q: '7', bassPc: pc(root + 10), slot: 'slide', family: 'chromatic',
        reason: `line cliché → ${noteName(root, false)}7/${noteName(root + 10, false)} (♭7 in bass)` },
    ];
  }

  // Name a bare pitch-class set, preferring the simplest spelling.
  function nameSet(set) {
    let best = null;
    for (let root = 0; root < 12; root++) {
      for (const q in QUALITIES) {
        if (QUALITIES[q].triad && set.size > 3) continue;
        const cand = qualityPCs(root, q);
        if (cand.size !== set.size) continue;
        let ok = true;
        for (const p of cand) if (!set.has(p)) { ok = false; break; }
        if (ok && (!best || q.length < best.q.length)) best = { root, q };
      }
    }
    return best;
  }

  // Move one or two voices by a semitone and re-read the result.
  function reharmCandidates(root, q) {
    const base = [...qualityPCs(root, q)];
    const seen = new Set(), out = [];

    const tryMove = (moves) => {
      const set = new Set(base), path = [];
      for (const [note, dir] of moves) {
        set.delete(note);
        const to = pc(note + dir);
        if (set.has(to)) return;
        set.add(to);
        path.push({ fromPc: note, toPc: to, dir });
      }
      if (set.size !== base.length) return;
      const named = nameSet(set);
      if (!named || (named.root === root && named.q === q)) return;
      const key = named.root + ':' + named.q;
      if (seen.has(key)) return;
      seen.add(key);
      const held = base.filter(p => !path.some(m => m.fromPc === p));
      const kind = moves.length === 1 ? 'reharm' : 'slip';
      const slot = isDomQ(named.q) ? 'far' : (moves.length === 2 ? 'slide' : 'far');
      out.push({
        root: named.root, q: named.q, slot, family: 'reharm',
        reason: `${kind}: ${path.map(m => noteName(m.fromPc, false) + (m.dir < 0 ? '↓' : '↑')).join(' ')} → ` +
                `${noteName(named.root, false)}${named.q} (${held.length} held)`,
        path: { heldPcs: held, moved: path.map(m => ({ fromPc: m.fromPc, toPc: m.toPc })) },
      });
    };

    for (const n of base) for (const d of [-1, 1]) tryMove([[n, d]]);
    for (let i = 0; i < base.length; i++)
      for (let j = i + 1; j < base.length; j++)
        for (const di of [-1, 1]) for (const dj of [-1, 1]) tryMove([[base[i], di], [base[j], dj]]);

    return out.filter(c => c.path.heldPcs.length >= Math.ceil(base.length / 2));
  }

  function tritoneCandidates(root, q) {
    if (!isDomQ(q)) return [];
    return [{ root: pc(root + 6), q: '7', slot: 'far', family: 'distant',
      reason: `tritone sub (${noteName(root, false)}${q} ↔ ${noteName(root + 6, false)}7)` }];
  }

  // Inversions of the CURRENT chord — stay put harmonically, move the bass.
  function slashCandidates(root, quality) {
    const def = QUALITIES[quality];
    if (!def) return [];
    return def.core
      .filter(([iv, role]) => role !== 'root')
      .map(([iv, role]) => ({
        root, q: quality, bassPc: pc(root + iv), slot: 'slide', family: 'inversion',
        reason: `${noteName(root, false)}${quality}/${noteName(root + iv, false)} — ${role} in the bass`,
      }));
  }

  /**
   * Inversions of every DESTINATION chord.
   *
   * A slash chord is just an inversion, and withholding inversions withholds
   * most of the interesting bass lines: it is what lets ii–V–I walk down by
   * step instead of leaping by fourths. So every candidate is offered in root
   * position AND over each of its chord tones, and `bassMotionBonus()` below
   * decides which bass actually wins the slot. Generation is cheap; the scoring
   * is what makes the bass sing.
   */
  function withInversions(cands) {
    const out = [];
    for (const c of cands) {
      out.push(c);
      if (c.bassPc != null) continue;            // already has a chosen bass
      const def = QUALITIES[c.q];
      if (!def) continue;
      for (const [iv, role] of def.core) {
        if (role === 'root') continue;
        out.push({
          ...c,
          bassPc: pc(c.root + iv),
          family: c.family,
          inverted: role,
          reason: `${c.reason} — ${role} in the bass`,
        });
      }
    }
    return out;
  }

  // ── Scoring ─────────────────────────────────────────────────────────────

  const DEG   = {0:'1',1:'♭2',2:'2',3:'♭3',4:'3',5:'4',6:'♯4',7:'5',8:'♭6',9:'6',10:'♭7',11:'7'};
  const IDIOM = { '11->0':3, '8->7':3, '5->4':2, '6->7':2, '1->0':2, '2->0':1, '3->2':1 };

  function idiomBonus(mapping, keyTonic) {
    if (keyTonic == null) return { bonus: 0, hits: [] };
    let bonus = 0;
    const hits = [];
    for (const v of mapping.moved) {
      const from = pc(v.from - keyTonic), to = pc(v.to - keyTonic);
      const wt = IDIOM[`${from}->${to}`];
      if (wt) { bonus += wt; hits.push(`${DEG[from]}→${DEG[to]}`); }
    }
    return { bonus, hits };
  }

  function pullBonus(cand, keyTonic) {
    if (!isDomQ(cand.q)) return { bonus: 0, label: '' };
    const tonic = pc(cand.root + 5);
    const modulates = keyTonic != null && tonic !== keyTonic;
    return {
      bonus: 4 + (modulates ? 4 : 0),
      label: `↝ ${noteName(tonic, false)}${modulates ? ' (new center)' : ''}`,
    };
  }

  /**
   * How well the bass line moves.
   *
   * This is what makes inversions worth generating. A bass that steps by a
   * half or whole tone is the spine of most good progressions — it is why
   * Cmaj7 → Am7/C → Dm7 reads as a line and Cmaj7 → Am7 → Dm7 reads as a set
   * of blocks. Weighted to compete with function, not to overrule it: a strong
   * V→I still beats a merely smooth bass, but between two equally functional
   * destinations the one with the singing bass wins.
   */
  function bassMotionBonus(prevBassPc, cand, keyTonic) {
    if (prevBassPc == null) return { bonus: 0, label: '' };
    const bass = cand.bassPc != null ? pc(cand.bassPc) : pc(cand.root);
    const up   = pc(bass - prevBassPc);
    const step = Math.min(up, 12 - up);          // shortest distance either way

    let bonus = 0, label = '';
    if (step === 0)      { bonus = 1; label = 'bass pedals'; }
    else if (step === 1) { bonus = 5; label = `chromatic bass ${noteName(prevBassPc, false)}→${noteName(bass, false)}`; }
    else if (step === 2) { bonus = 4; label = `stepwise bass ${noteName(prevBassPc, false)}→${noteName(bass, false)}`; }
    else if (step === 5) { bonus = 3; label = 'bass moves by fourth'; }
    else if (step === 3 || step === 4) { bonus = 1; label = 'bass moves by third'; }

    // Landing on the tonic in the bass is an arrival — worth a little extra.
    if (keyTonic != null && bass === keyTonic && step !== 0) bonus += 1;

    // A descending line is the idiomatic default (walk-downs, line clichés).
    if (up > 6 && step <= 2) bonus += 1;

    return { bonus, label };
  }

  // Realize a candidate against what is currently sounding.
  function voiceCandidate(prevNotes, cand, spice, shape) {
    // Transformational candidates carry their own voice path — honour it, and
    // build a mapping that still covers every note on both sides.
    if (cand.path && prevNotes && prevNotes.length) {
      const held = [], moved = [], released = [], used = new Set();
      for (const p of cand.path.heldPcs) {
        const n = prevNotes.find(x => pc(x) === p && !used.has(x));
        if (n != null) { held.push({ from: n, to: n }); used.add(n); }
      }
      for (const m of cand.path.moved) {
        const src = prevNotes.find(x => pc(x) === m.fromPc && !used.has(x));
        if (src != null) { moved.push({ from: src, to: placeNear(m.toPc, src) }); used.add(src); }
      }
      prevNotes.forEach(n => { if (!used.has(n)) released.push({ from: n }); });
      const notes = [...held, ...moved].map(v => v.to).sort((a, b) => a - b);
      if (notes.length >= 2) {
        return { notes, mapping: { held, moved, appeared: [], released } };
      }
    }
    const r = lead(prevNotes || [], cand.root, cand.q, { spice, shape, bassPc: cand.bassPc });
    return { notes: r.notes, mapping: r.mapping };
  }

  function motionOf(mapping) {
    return [...mapping.held, ...mapping.moved].reduce((s, v) => s + Math.abs(v.to - v.from), 0);
  }

  function scoreCandidate(prevNotes, cand, keyTonic, spice, shape, prevBassPc) {
    const voiced = voiceCandidate(prevNotes, cand, spice, shape);
    const motion = motionOf(voiced.mapping);
    const idiom  = idiomBonus(voiced.mapping, keyTonic);
    const pull   = pullBonus(cand, keyTonic);
    const bass   = bassMotionBonus(prevBassPc, cand, keyTonic);
    const base   = { functional: 5, chromatic: 3, reharm: 2, distant: 2, inversion: 3 }[cand.family] || 2;
    const smooth = 8 - Math.min(motion, 8);
    const score  = base + smooth + idiom.bonus * 3 + pull.bonus * 2 + bass.bonus * 2;
    return { ...cand, voiced, motion, idiom, pull, bass, score };
  }

  const SLOTS = [
    { slot: 'home',   label: 'Home'   },
    { slot: 'lift',   label: 'Lift'   },
    { slot: 'shadow', label: 'Shadow' },
    { slot: 'slide',  label: 'Slide'  },
    { slot: 'far',    label: 'Far'    },
  ];

  /**
   * Five branch suggestions for the current chord.
   * `suggest(prevNotes, rootPC, quality, trail, spice, shape)`
   *   → { key, branches: [{ slot, label, rootPC, quality, bassPc, notes, mapping, reason, … }] }
   */
  function suggest(prevNotes, rootPC, quality, trail, spice, shape) {
    const root   = pc(rootPC);
    const q      = QUALITIES[quality] ? quality : 'maj7';
    const chords = [...(trail || []).map(c => ({ rootPC: c.rootPC, quality: c.quality })), { rootPC: root, quality: q }];
    const key      = inferKey(chords);
    const keyTonic = key ? key.tonicPc : null;

    const prevBassPc = (prevNotes && prevNotes.length) ? pc(Math.min(...prevNotes)) : null;

    // Destinations get offered in root position and over each chord tone; the
    // bass-motion score decides which inversion actually earns the slot.
    const raw = [
      ...withInversions(functionalCandidates(root, q)),
      ...chromaticBassCandidates(root, q),
      ...withInversions(tritoneCandidates(root, q)),
      ...reharmCandidates(root, q),
      ...slashCandidates(root, q),
    ].filter(c => QUALITIES[c.q]);

    const scored = raw
      .map(c => scoreCandidate(prevNotes, c, keyTonic, spice, shape, prevBassPc))
      .filter(c => c.voiced.notes.length >= 2)
      .filter(c => Math.max(...c.voiced.notes) - Math.min(...c.voiced.notes) <= 36)
      .sort((a, b) => b.score - a.score);

    // Five branches means five genuinely different harmonic choices, so slots
    // dedupe on chord identity — the inversion is part of the winner, not a
    // separate option competing for its own slot.
    const usedChord = new Set();
    const chordOf   = c => `${c.root}:${c.q}`;
    const chosen    = [];

    for (const { slot, label } of SLOTS) {
      const pick = scored.find(c => c.slot === slot && !usedChord.has(chordOf(c)))
                || scored.find(c => !usedChord.has(chordOf(c)));
      if (!pick) continue;
      usedChord.add(chordOf(pick));

      const reason = pick.bass.label && pick.bassPc != null
        ? `${pick.reason} · ${pick.bass.label}`
        : pick.reason;

      chosen.push({
        slot, label,
        rootPC:  pick.root,
        quality: pick.q,
        bassPc:  pick.bassPc ?? null,
        notes:   pick.voiced.notes,
        mapping: pick.voiced.mapping,
        reason,
        family:  pick.family,
        pullLabel: pick.pull.label,
        bassLabel: pick.bass.label,
        idiomHits: pick.idiom.hits,
        name:    chordName(pick.root, pick.q, pick.bassPc),
      });
    }
    return { key, branches: chosen };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  §9  Export
  // ═════════════════════════════════════════════════════════════════════════

  const api = {
    // vocabulary
    QUALITIES, PATTERNS, SHAPES,
    // spelling
    SHARP_ROOT_PCS, SHARP_NAMES, FLAT_NAMES,
    noteName, spell, midiName, glyphs, chordName,
    // colour + shape
    colour, voice,
    // voice leading
    lead, fingering, nearestOctave, placeNear,
    // recognition
    identify, describe,
    // narration + suggestion
    narrate, suggest, inferKey,
  };

  if (typeof window !== 'undefined') window.Harmony = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

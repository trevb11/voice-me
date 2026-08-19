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
    // maj6/9 is a modal chord, not a dressed-up major triad: it is a stable
    // resting sonority with no leading tone, which is what lets it hang
    // between tonal centres (Shorter, "Mahjong" — C6/9 ⇄ Dm11 all the way
    // down). C6/9 is a strict SUBSET of Dm11, so the two trade places with
    // nothing moving but the bass. See the `modal-oscillation` device.
    '6/9':      { family: 'major',
                  core: [[0,'root'],[4,'3rd'],[9,'6th'],[2,'9th'],[7,'5th']],
                  ext:  [] },
    'm6':       { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[9,'6th'],[7,'5th']],
                  ext:  [[2,'9th',2]] },

    // ── 7ths ─────────────────────────────────────────────────────────────
    'maj7':     { family: 'major',
                  core: [[0,'root'],[4,'3rd'],[11,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1],[6,'♯11',2],[9,'13th',2]] },
    // The lydian sonority, with NO natural 5th — the ♯11 replaces it rather
    // than colouring it. This is the chord that turns up when a minor chord
    // slides its bass down a half step (Fm11 → Emaj7♯11) and it needs to be
    // voiceable in its own right, not folded into maj9.
    'maj7#11':  { family: 'major',
                  core: [[0,'root'],[4,'3rd'],[6,'♯11'],[11,'7th']],
                  ext:  [[2,'9th',1],[9,'13th',2]] },
    'm7':       { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[10,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1],[5,'11th',2]] },
    '7':        { family: 'dominant',
                  core: [[0,'root'],[4,'3rd'],[10,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1],[9,'13th',2]] },
    'mMaj7':    { family: 'minor',
                  core: [[0,'root'],[3,'3rd'],[11,'7th'],[7,'5th']],
                  ext:  [[2,'9th',1]] },
    // No natural 11 extension: "Cm11♭5" is not a chord anyone plays, and
    // generating it just produced a rotation of E♭m6/9 that the recogniser then
    // (correctly) named E♭m6/9. The four core tones are the chord.
    'm7b5':     { family: 'minor',   rigid5: true,
                  core: [[0,'root'],[3,'3rd'],[6,'5th'],[10,'7th']],
                  ext:  [] },
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

  // ── Spice tier of each quality ──────────────────────────────────────────
  // Which dial setting is allowed to VOLUNTEER this chord. The dial has always
  // gated extensions within a chord; this gates the chord choice itself, so
  // "basic" never hands you a 7♯9♭13 you did not ask for.
  //
  //   0 basic      triads and plain 7ths
  //   1 colourful  9ths, 6/9, sus, minor-major
  //   2 complex    altered dominants, 13ths, lydian
  //
  // Recognition is NOT gated — if you play it, the app names it. The dial only
  // governs what the app suggests.
  const TIER = {
    'maj': 0, 'min': 0, 'dim': 0, '6': 0, 'm6': 0,
    'maj7': 0, 'm7': 0, '7': 0, 'm7b5': 0, 'dim7': 0,
    'aug': 1, 'mMaj7': 1, '7sus4': 1, 'maj9': 1, 'm9': 1, 'm11': 1, '9': 1, '6/9': 1,
    'maj7#11': 2, '13': 2,
    '7alt': 2, '7b9': 2, '7#9': 2,
    '7b9(13)': 2, '7b9(b13)': 2, '7#9(13)': 2, '7#9(b13)': 2,
  };
  const tierOf = q => (TIER[q] == null ? 1 : TIER[q]);

  // Where a quality falls back to when the dial is turned below its tier.
  // Same function, less colour — F7♯9 becomes F7, not something unrelated.
  const PLAINER = {
    '7alt': '7', '7b9': '7', '7#9': '7',
    '7b9(13)': '7b9', '7b9(b13)': '7b9', '7#9(13)': '7#9', '7#9(b13)': '7#9',
    '13': '9', '9': '7', 'maj9': 'maj7', 'maj7#11': 'maj9',
    'm9': 'm7', 'm11': 'm9', '6/9': '6', 'mMaj7': 'm7', '7sus4': '7', 'aug': 'maj',
  };

  function atSpice(quality, spice) {
    const max = spice == null ? 1 : spice;
    let q = quality, guard = 0;
    while (QUALITIES[q] && tierOf(q) > max && PLAINER[q] && guard++ < 8) q = PLAINER[q];
    return QUALITIES[q] ? q : quality;
  }

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
    // 6/9 voices as a 6 chord carrying its 9th — NOT as maj9, which has a
    // major 7th in it and is a different chord.
    { intervals: [0,4,7,9,2],      suffix: '6/9',     quality: 'maj69',   priority: 11, voiceAs: '6/9'  },
    { intervals: [0,3,7,9,2],      suffix: 'm6/9',    quality: 'min69',   priority: 11, voiceAs: 'm6'   },
    { intervals: [0,4,7,2],        suffix: 'add9',    quality: 'add9',    priority: 8,  voiceAs: 'maj'  },
    { intervals: [0,3,7,2],        suffix: 'madd9',   quality: 'add9',    priority: 8,  voiceAs: 'min'  },

    // ── 11ths ───────────────────────────────────────────────────────────
    { intervals: [0,4,7,10,2,5],   suffix: '11',      quality: 'dom11',   priority: 13, voiceAs: '9'    },
    { intervals: [0,3,7,10,2,5],   suffix: 'm11',     quality: 'min11',   priority: 13, voiceAs: 'm11'  },
    { intervals: [0,4,7,11,2,5],   suffix: 'maj11',   quality: 'maj11',   priority: 12, voiceAs: 'maj9' },
    { intervals: [0,4,7,11,6],     suffix: 'maj7#11', quality: 'lydian',  priority: 13, voiceAs: 'maj7#11' },
    { intervals: [0,4,11,6],       suffix: 'maj7#11', quality: 'lydian',  priority: 14, voiceAs: 'maj7#11' },
    { intervals: [0,4,7,11,2,6],   suffix: 'maj9#11', quality: 'lydian',  priority: 14, voiceAs: 'maj7#11' },
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

  // The 9th family specifically — the tensions that grind against the root.
  //
  // Spacing rules alone do not catch this. A 9th a whole step above the root
  // passes any "is this interval too tight" test — Db3 Eb3 F3 B3 has no gap
  // smaller than a whole tone — and still sounds cluttered, because the ear
  // hears the 9th beating against the root rather than colouring the chord.
  // Put it an octave up (Db3 F3 B3 Eb4) and the same five notes open out.
  //
  // 11ths and 13ths are deliberately NOT here. A 13th a major 6th above the
  // root is idiomatic, not muddy: C3 E3 A3 Bb3 is a textbook C13, and forcing
  // its 13th above a 9th would break the voicing rather than fix it.
  const NINTH_ROLES = new Set(['9th', '♭9', '♯9']);

  // Measured against the ROOT, not the bass. The complaint is the 9th grinding
  // against the root, so that is what to measure — and measuring from the bass
  // gets it wrong in both directions. A ♭9 sits a MINOR 9th above the root
  // (13 semitones), so a floor of 14 above the bass threw F7♭9's G♭ up an
  // octave rather than letting it fall a half step from the G above it,
  // wrecking the one voice-leading move that chord exists for.
  const NINTH_CROWDS = 3;    // within a minor 3rd ABOVE the root is too close

  // ...but never at the cost of a chord no one can reach. When the root already
  // sits high, lifting its 9th another octave spreads the voicing past three
  // octaves. A slightly crowded chord beats an unplayable one, and up in that
  // register the crowding is far less muddy anyway.
  const PLAYABLE_SPAN = 30;

  /**
   * Lift 9ths clear of the bass. Returns true if anything moved.
   *
   * Skipped for shapes that declare themselves dense: a cluster's whole point
   * is packing tones together, so spreading its 9th an octave up would turn it
   * into a different texture.
   */
  /** Span of `notes` if index `i` were moved to `candidate`. */
  function spanWith(notes, i, candidate) {
    let lo = candidate, hi = candidate;
    notes.forEach((n, j) => {
      if (j === i) return;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    });
    return hi - lo;
  }

  function crowdsTheRoot(midi, rootMidi) {
    if (rootMidi == null) return false;      // rootless: nothing to grind against
    const above = midi - rootMidi;
    return above > 0 && above <= NINTH_CROWDS;
  }

  function liftNinths(notes, roleByPc, shape, rootPC) {
    if ((SHAPES[shape] || {}).dense) return notes;
    const out = [...notes].sort((a, b) => a - b);
    const rootMidi = out.find(n => pc(n) === pc(rootPC));
    if (rootMidi == null) return out;
    const used = new Set(out);
    for (let i = 0; i < out.length; i++) {
      if (!NINTH_ROLES.has(roleByPc.get(pc(out[i])))) continue;
      let m = out[i];
      while (crowdsTheRoot(m, rootMidi) && m + 12 <= KEY_HI && !used.has(m + 12)
             && spanWith(out, i, m + 12) <= PLAYABLE_SPAN) {
        used.delete(m); m += 12; used.add(m);
      }
      out[i] = m;
    }
    return out.sort((a, b) => a - b);
  }

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
    cluster: { voices: 5, bass: [50, 64], upper: [55, 84], gap: [1, 2],  invertBass: true,  double: false, dense: true },
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
  /**
   * Which tones sound, and how many.
   *
   * `wantVoices` is how many notes the player is actually holding, and it wins
   * over the shape's nominal count. Play a five-note chord and you should get
   * five notes back: imposing the shape's four drops a tone from the target,
   * which means a voice that had somewhere perfectly good to go gets released
   * instead. Db9 → G♭maj7 is the case — the E♭ wants to fall a whole step to
   * D♭ and become the 5th, but with the 5th trimmed out of the target there is
   * nothing for it to move to, so it just disappears.
   */
  function selectTones(tones, shape, wantVoices) {
    const sh = SHAPES[shape] || SHAPES.closed;
    const pool = [...tones];

    // A voice count is a target, not a cap. Some chords need more to exist at
    // all — m7♭5 and dim7 are four essential tones, so "minimal" stretches
    // rather than emitting something that is not the chord.
    const essential = pool.filter(t => t.rank === 0).length + 1;   // + the root
    const asked     = wantVoices || sh.voices;
    const budget    = Math.min(6, Math.max(asked, essential));
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

    const roleByPc = new Map();
    tones.forEach(t => { if (!roleByPc.has(t.pc)) roleByPc.set(t.pc, t.role); });
    return liftNinths(deMud(notes, minGap), roleByPc, shape, root);
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

    // Match what the player is holding, so no voice is stranded.
    const tones = selectTones(colour(root, quality, o.spice), shape,
                              prevNotes && prevNotes.length ? prevNotes.length : null);
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

    // A 9th sitting a whole step above the root reads as clutter however well
    // spaced the rest of the chord is, so lift it clear of the bass even
    // though no spacing rule objects. Dense shapes are exempt — a cluster may
    // absolutely put the root next to the 9th; that is what it is for.
    const roleByPc = new Map();
    tones.forEach(t => { if (!roleByPc.has(t.pc)) roleByPc.set(t.pc, t.role); });

    if (!sh.dense) {
      const all = [bassMidi, ...voices.map(v => v.to)];
      const rootMidi = all.sort((a, b) => a - b).find(n => pc(n) === root);
      const taken = new Set(all);
      for (const v of voices) {
        if (!NINTH_ROLES.has(roleByPc.get(pc(v.to)))) continue;
        const others = [bassMidi, ...voices.filter(o => o !== v).map(o => o.to)];
        let m = v.to;
        while (crowdsTheRoot(m, rootMidi) && m + 12 <= KEY_HI && !taken.has(m + 12)
               && spanWith(others, -1, m + 12) <= PLAYABLE_SPAN) {
          taken.delete(m); m += 12; taken.add(m);
        }
        if (m !== v.to) {
          v.to = m;
          // A voice that had to move is REPORTED as moved, never as a held
          // voice that quietly changed pitch.
          if (v.kind === 'held') v.kind = 'moved';
        }
      }
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
      add(7,  '7',    'V — dominant',                'cadence');
      add(5,  'maj7', 'IV — subdominant',            'ascending');
      add(2,  'm7',   'ii',                          'ascending');
      add(9,  'm7',   'vi — deceptive / rel. minor', 'descending');
      add(4,  'm7',   'iii',                         'descending');
    } else if (isMinQ(q)) {
      add(5,  'm7',   'iv',                            'cadence');
      add(3,  'maj7', 'III — relative major',          'ascending');
      add(7,  '7',    'V — dominant (harmonic minor)', 'cadence');
      add(8,  'maj7', 'VI',                            'descending');
      add(10, '7',    '♭VII',                          'descending');
      add(5,  '7',    `treat as ii → V7 (pulls to ${noteName(root - 2, false)})`, 'colour');
    } else if (q === 'm7b5') {
      add(5,  '7alt', 'ii°–V: here is its V',   'cadence');
      add(-2, 'm7',   'resolves toward i',      'descending');
      add(3,  'maj7', '♭III of the implied key','ascending');
    } else if (q === 'dim7' || q === 'dim') {
      add(1,  'maj7', 'resolves up a ½-step',             'cadence');
      add(1,  '7',    'resolves up a ½-step → dominant',  'ascending');
      add(-2, 'm7',   'resolves down a whole-step',       'descending');
      add(-1, '7',    'passing dim → dominant a ½ below', 'secondary');
    } else if (isDomQ(q)) {
      add(5,  'maj7', 'V→I resolution',        'cadence');
      add(5,  'm7',   'V→i resolution',        'cadence');
      add(2,  'm7',   'deceptive → vi region', 'descending');
    }
    return out;
  }

  function chromaticBassCandidates(root, q) {
    if (!isMajQ(q)) return [];
    return [
      { root, q: 'maj7', bassPc: pc(root + 11), slot: 'secondary', family: 'chromatic',
        reason: `chromatic bass ${noteName(root, false)}→${noteName(root + 11, false)} (maj7 in bass)` },
      { root, q: '7', bassPc: pc(root + 10), slot: 'secondary', family: 'chromatic',
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
      const slot = isDomQ(named.q) ? 'colour' : (moves.length === 2 ? 'secondary' : 'colour');
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
    return [{ root: pc(root + 6), q: '7', slot: 'colour', family: 'distant',
      reason: `tritone sub (${noteName(root, false)}${q} ↔ ${noteName(root + 6, false)}7)` }];
  }

  // Inversions of the CURRENT chord — stay put harmonically, move the bass.
  function slashCandidates(root, quality) {
    const def = QUALITIES[quality];
    if (!def) return [];
    return def.core
      .filter(([iv, role]) => role !== 'root')
      .map(([iv, role]) => ({
        root, q: quality, bassPc: pc(root + iv), slot: 'secondary', family: 'inversion',
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

  // The five branches are functional categories, not decorative names. Each
  // branch DISPLAYS its device's own title and roman-numeral motion; these
  // labels are only the category heading.
  const SLOTS = [
    { slot: 'cadence',    label: 'Cadence'    },
    { slot: 'ascending',  label: 'Rising bass' },
    { slot: 'descending', label: 'Falling bass' },
    { slot: 'secondary',  label: 'Secondary dominant' },
    { slot: 'colour',     label: 'Colour'     },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  //  DEVICES — hard-wired harmonic moves
  //
  //  A device is a NAMED move a musician would recognise, not the winner of a
  //  scoring contest. Search picks between valid instances of a device; it
  //  never decides which devices exist. That is the difference between "here
  //  are five chords that scored well" and "here is a passing diminished."
  //
  //  Each device yields a SEQUENCE of one or two chords, because the move is
  //  the lesson. A7/C♯ on its own teaches nothing — A7/C♯ → Dm7 teaches the
  //  chromatic bass climb C–C♯–D. Waiting for the tree to regenerate and hoping
  //  it offers Dm7 is not good enough; the resolution ships with the device.
  //
  //  Slots are reserved by function so bass motion is guaranteed, not emergent:
  //    home    the strongest functional destination
  //    lift    bass ASCENDS by step or half step
  //    shadow  bass DESCENDS by step or half step
  //    slide   secondary dominant / modulation
  //    far     reharmonisation, tritone sub, non-functional sonority
  // ═══════════════════════════════════════════════════════════════════════

  const isMajorish = q => { const f = (QUALITIES[q] || {}).family; return f === 'major'; };
  const isMinorish = q => { const f = (QUALITIES[q] || {}).family; return f === 'minor'; };

  // The seven chords of a key, by scale degree in semitones. Having these means
  // a passing move can land somewhere that belongs to the key instead of
  // somewhere that merely sits a step away — Gm9 in F should pass up to Am7,
  // the iii, not to the Am7♭5 you get by treating Gm as a tonic.
  const DIATONIC = {
    major: [[0, 'maj7'], [2, 'm7'], [4, 'm7'], [5, 'maj7'], [7, '7'], [9, 'm7'], [11, 'm7b5']],
    minor: [[0, 'm7'], [2, 'm7b5'], [3, 'maj7'], [5, 'm7'], [7, 'm7'], [8, 'maj7'], [10, '7']],
  };

  /** The diatonic chord `steps` scale-steps above `fromDegree` in the key. */
  function diatonicStep(keyTonic, mode, fromDegree, steps) {
    const table = DIATONIC[mode] || DIATONIC.major;
    let i = table.findIndex(([iv]) => iv === pc(fromDegree));
    if (i === -1) {
      // Chromatic chord: fall back to the nearest diatonic degree below.
      i = 0;
      for (let j = 0; j < table.length; j++) if (table[j][0] <= pc(fromDegree)) i = j;
    }
    const [iv, quality] = table[(i + steps + table.length * 4) % table.length];
    return { rootPC: pc(keyTonic + iv), quality, degree: iv };
  }

  const DEVICES = [
    // ═══════════════════════════════════════════════════════════════════
    //  Devices that know WHERE IN THE KEY the chord sits
    //
    //  Everything below this block treats the chord in front of it as a local
    //  tonic, which is fine for colour but wrong for function: a Gm9 in F is a
    //  ii and wants its V, and no amount of chord-relative reasoning will find
    //  C7 from it. These fire only when a key centre is known, and they carry
    //  extra weight because a real functional destination beats a local trick.
    //
    //  Degrees are semitones above the tonic: 0=I, 2=ii, 4=iii, 5=IV, 7=V, 9=vi.
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'ii-V-I', slot: 'cadence', weight: 6,
      label: 'Two-five-one',
      roman: 'ii7 → V7 → I',
      applies: c => c.keyKnown && c.keyMode === 'major' && c.degree === 2 && isMinorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 7), quality: '7'    },
        { rootPC: c.keyTonic,         quality: 'maj7' },
      ],
      why: c => `${noteName(c.root, false)}m is the ii of ${noteName(c.keyTonic, false)} — this is its V and its home`,
    },
    {
      id: 'minor-ii-V-i', slot: 'cadence', weight: 6,
      label: 'Minor two-five-one',
      roman: 'iiø7 → V7alt → i',
      applies: c => c.keyKnown && c.keyMode === 'minor' && c.degree === 2,
      chords: c => [
        { rootPC: pc(c.keyTonic + 7), quality: '7alt' },
        { rootPC: c.keyTonic,         quality: 'm7'   },
      ],
      why: c => `the ii of ${noteName(c.keyTonic, false)} minor, heading home the minor way`,
    },
    {
      id: 'V-I-in-key', slot: 'cadence', weight: 6,
      label: 'Five to one',
      roman: 'V7 → I',
      applies: c => c.keyKnown && c.degree === 7 && isDomQ(c.quality),
      chords: c => [{ rootPC: c.keyTonic,
                      quality: c.keyMode === 'minor' ? 'm7' : 'maj7' }],
      why: c => `the dominant of ${noteName(c.keyTonic, false)} — resolve it`,
    },
    {
      id: 'vi-ii-V', slot: 'cadence', weight: 5,
      label: 'Six-two-five',
      roman: 'vi7 → ii7 → V7',
      applies: c => c.keyKnown && c.keyMode === 'major' && c.degree === 9 && isMinorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 2), quality: 'm7' },
        { rootPC: pc(c.keyTonic + 7), quality: '7'  },
      ],
      why: c => `the vi of ${noteName(c.keyTonic, false)} — round the cycle toward the dominant`,
    },
    {
      id: 'iii-vi-ii', slot: 'cadence', weight: 4,
      label: 'Three-six-two',
      roman: 'iii7 → vi7 → ii7',
      applies: c => c.keyKnown && c.keyMode === 'major' && c.degree === 4 && isMinorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 9), quality: 'm7' },
        { rootPC: pc(c.keyTonic + 2), quality: 'm7' },
      ],
      why: c => `the iii of ${noteName(c.keyTonic, false)}, starting the descent by fifths`,
    },
    {
      id: 'IV-V-I', slot: 'cadence', weight: 5,
      label: 'Four-five-one',
      roman: 'IV → V7 → I',
      applies: c => c.keyKnown && c.keyMode === 'major' && c.degree === 5 && isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 7), quality: '7'    },
        { rootPC: c.keyTonic,         quality: 'maj7' },
      ],
      why: c => `the IV of ${noteName(c.keyTonic, false)} — through the dominant and home`,
    },
    {
      id: 'IV-to-iv', slot: 'descending', weight: 4,
      label: 'Four turns minor',
      roman: 'IV → iv → I',
      applies: c => c.keyKnown && c.keyMode === 'major' && c.degree === 5 && isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 5), quality: 'm7'   },
        { rootPC: c.keyTonic,         quality: 'maj7' },
      ],
      why: c => `the subdominant darkens on its way back to ${noteName(c.keyTonic, false)}`,
    },
    {
      id: 'bVII-I', slot: 'colour', weight: 3,
      label: 'Backdoor cadence',
      roman: '♭VII7 → I',
      applies: c => c.keyKnown && c.degree === 10 && isDomQ(c.quality),
      chords: c => [{ rootPC: c.keyTonic, quality: 'maj7' }],
      why: c => `the back door into ${noteName(c.keyTonic, false)} — no leading tone, no push`,
    },

    // ── Reinterpretation: hear the chord as a different scale degree ─────
    //
    // A lone minor 7th is far more often a ii than a i — Gm7 usually means "ii
    // of F", not "i of G minor". But inference cannot know that: scoring a
    // single chord gives it a bonus for being its own tonic, so it lands on
    // G minor and never offers C7.
    //
    // Rather than guess, offer the reading as a branch. Taking it commits to
    // the key, which is why it modulates: choosing "this is a ii" IS declaring
    // where home is. Suppressed when the chord already sits on degree 2, since
    // ii-V-I covers that properly.
    {
      id: 'treat-as-ii', slot: 'secondary', weight: 5,
      label: 'Hear it as a two',
      roman: 'ii7 → V7 → I',
      applies: c => isMinorish(c.quality) && c.degree !== 2,
      chords: c => [
        { rootPC: pc(c.root + 5),  quality: '7'    },
        { rootPC: pc(c.root + 10), quality: 'maj7' },
      ],
      modulatesTo: c => ({ tonicPc: pc(c.root + 10), mode: 'major' }),
      why: c => `heard as the ii of ${noteName(c.root + 10, false)} — this is its V and its tonic`,
    },
    {
      id: 'treat-as-V', slot: 'cadence', weight: 4,
      label: 'Hear it as a five',
      roman: 'V7 → I',
      applies: c => isDomQ(c.quality) && c.degree !== 7,
      chords: c => [{ rootPC: pc(c.root + 5), quality: 'maj7' }],
      modulatesTo: c => ({ tonicPc: pc(c.root + 5), mode: 'major' }),
      why: c => `a dominant wants to fall a fifth — hear ${noteName(c.root + 5, false)} as home`,
    },

    // ── Diatonic passing moves, aimed at chords that belong to the key ───
    {
      id: 'diatonic-passing-dim-up', slot: 'ascending', weight: 5,
      label: 'Passing diminished up the scale',
      roman: '♯i°7 → next degree',
      applies: c => c.keyKnown,
      chords: (c) => {
        const up = diatonicStep(c.keyTonic, c.keyMode, c.degree, 1);
        return [
          { rootPC: pc(c.root + 1), quality: 'dim7' },
          { rootPC: up.rootPC,      quality: up.quality },
        ];
      },
      why: (c) => {
        const up = diatonicStep(c.keyTonic, c.keyMode, c.degree, 1);
        return `the bass climbs ${noteName(c.root, false)}→${noteName(c.root + 1, false)}→` +
               `${noteName(up.rootPC, false)}, landing inside the key`;
      },
    },
    {
      id: 'diatonic-walk-down', slot: 'descending', weight: 5,
      label: 'Step down the scale',
      roman: 'I → I/♮7 → previous degree',
      applies: c => c.keyKnown,
      chords: (c) => {
        const down = diatonicStep(c.keyTonic, c.keyMode, c.degree, -1);
        return [
          { rootPC: c.root,      quality: c.quality, bassPc: pc(c.root - 1) },
          { rootPC: down.rootPC, quality: down.quality },
        ];
      },
      why: (c) => {
        const down = diatonicStep(c.keyTonic, c.keyMode, c.degree, -1);
        return `a passing bass note carries you down to ${noteName(down.rootPC, false)}, ` +
               `the degree below in ${noteName(c.keyTonic, false)}`;
      },
    },

    // ── Modulation: these MOVE the key centre ────────────────────────────
    // `modulatesTo` tells compose mode the tonal home has changed, so the tree
    // starts reasoning in the new key instead of pretending nothing happened.
    {
      id: 'modulate-to-IV', slot: 'secondary', weight: 4,
      label: 'Modulate to four',
      roman: 'I → I7 → IV (new I)',
      applies: c => c.keyKnown && c.degree === 0 && isMajorish(c.quality),
      chords: c => [
        { rootPC: c.keyTonic,         quality: '7', bassPc: pc(c.keyTonic + 4) },
        { rootPC: pc(c.keyTonic + 5), quality: 'maj7' },
      ],
      modulatesTo: c => ({ tonicPc: pc(c.keyTonic + 5), mode: 'major' }),
      why: c => `turn the tonic into a dominant and ${noteName(c.keyTonic + 5, false)} becomes home`,
    },
    {
      id: 'modulate-to-V', slot: 'secondary', weight: 4,
      label: 'Modulate to five',
      roman: 'I → II7 → V (new I)',
      applies: c => c.keyKnown && c.degree === 0 && isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 2), quality: '7'    },
        { rootPC: pc(c.keyTonic + 7), quality: 'maj7' },
      ],
      modulatesTo: c => ({ tonicPc: pc(c.keyTonic + 7), mode: 'major' }),
      why: c => `up a fifth — ${noteName(c.keyTonic + 7, false)} takes over as home`,
    },
    {
      id: 'modulate-to-relative-minor', slot: 'secondary', weight: 3,
      label: 'Modulate to the relative minor',
      roman: 'I → V7/vi → vi (new i)',
      applies: c => c.keyKnown && c.keyMode === 'major' && c.degree === 0 && isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 4), quality: '7'  },
        { rootPC: pc(c.keyTonic + 9), quality: 'm7' },
      ],
      modulatesTo: c => ({ tonicPc: pc(c.keyTonic + 9), mode: 'minor' }),
      why: c => `${noteName(c.keyTonic + 9, false)} minor is the same notes seen from a darker angle`,
    },
    {
      id: 'modulate-relative-major', slot: 'secondary', weight: 3,
      label: 'Modulate to the relative major',
      roman: 'i → ♭III (new I)',
      applies: c => c.keyKnown && c.keyMode === 'minor' && c.degree === 0,
      chords: c => [
        { rootPC: pc(c.keyTonic + 10), quality: '7'    },
        { rootPC: pc(c.keyTonic + 3),  quality: 'maj7' },
      ],
      modulatesTo: c => ({ tonicPc: pc(c.keyTonic + 3), mode: 'major' }),
      why: c => `out of the minor into ${noteName(c.keyTonic + 3, false)} major`,
    },
    {
      id: 'modulate-up-a-semitone', slot: 'colour', weight: 1,
      label: 'Shift up a half step',
      roman: 'V7/♭II → ♭II (new I)',
      applies: c => c.keyKnown && c.degree === 0 && isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.keyTonic + 8), quality: '7'    },
        { rootPC: pc(c.keyTonic + 1), quality: 'maj7' },
      ],
      modulatesTo: c => ({ tonicPc: pc(c.keyTonic + 1), mode: 'major' }),
      why: c => `the whole thing lifts a half step into ${noteName(c.keyTonic + 1, false)}`,
    },

    // ── SHADOW: descending bass ──────────────────────────────────────────
    {
      id: 'one-to-six-passing-bass', slot: 'descending', weight: 2,
      label: 'One to six, passing bass',
      roman: 'I → I/♮7 → vi',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: c.root, quality: majSeventhOf(c.quality), bassPc: pc(c.root + 11) },
        { rootPC: pc(c.root + 9), quality: 'm7' },
      ],
      why:    c => `the bass walks down the scale ${noteName(c.root, false)}→${noteName(c.root + 11, false)}→` +
                   `${noteName(c.root + 9, false)} — the 7th is a passing tone, not a chord change`,
    },
    {
      id: 'seventh-in-bass', slot: 'descending', weight: 0,
      label: 'Seventh in the bass',
      roman: 'I → I/♮7',
      applies: c => isMajorish(c.quality),
      chords: c => [{ rootPC: c.root, quality: majSeventhOf(c.quality), bassPc: pc(c.root + 11) }],
      why:    c => `the bass slips down a half step, ${noteName(c.root, false)}→${noteName(c.root + 11, false)}`,
    },
    {
      id: 'minor-line-cliche', slot: 'descending', label: 'Minor line cliché',
      roman: 'i → i(maj7)/♮7',
      applies: c => isMinorish(c.quality),
      chords: c => [{ rootPC: c.root, quality: 'mMaj7', bassPc: pc(c.root + 11) }],
      why:    c => `the minor line cliché — the bass walks ${noteName(c.root, false)}→${noteName(c.root + 11, false)}`,
    },
    {
      id: 'backdoor-prep', slot: 'descending', label: 'Down to four',
      roman: 'I → I7/♭7 → IV',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: c.root, quality: '7', bassPc: pc(c.root + 10) },
        { rootPC: pc(c.root + 5), quality: 'maj7' },
      ],
      why:    c => `♭7 in the bass turns it into a dominant that pulls to ${noteName(c.root + 5, false)}`,
    },

    // ── LIFT: ascending bass ─────────────────────────────────────────────
    {
      id: 'passing-dim-up', slot: 'ascending', label: 'One to two, passing diminished',
      roman: 'I → ♯i°7 → ii',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 1), quality: 'dim7' },
        { rootPC: pc(c.root + 2), quality: 'm7'   },
      ],
      why:    c => `the bass climbs ${noteName(c.root, false)}→${noteName(c.root + 1, false)}→${noteName(c.root + 2, false)}`,
    },
    {
      id: 'V7-of-ii-inverted', slot: 'ascending', label: 'Two through its own dominant',
      roman: 'I → V7/ii → ii',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 9), quality: '7', bassPc: pc(c.root + 1) },   // 3rd in the bass
        { rootPC: pc(c.root + 2), quality: 'm7' },
      ],
      why:    c => `a secondary dominant with its 3rd in the bass — ${noteName(c.root, false)}→${noteName(c.root + 1, false)}→${noteName(c.root + 2, false)}`,
    },
    {
      // C6/G → A♭dim7 → C6/A. The harmony never leaves C6; the bass climbs
      // G–A♭–A underneath it. Only expressible with slash notation, because
      // the outer chords are the same chord in two different inversions —
      // which is exactly why a root-position-only engine cannot suggest it.
      id: 'passing-dim-inversions', slot: 'ascending', weight: 2,
      label: 'Passing diminished in the bass',
      roman: 'I/5 → ♭vi°7 → I/6',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: c.root,          quality: '6',    bassPc: pc(c.root + 7) },
        { rootPC: pc(c.root + 8),  quality: 'dim7'                          },
        { rootPC: c.root,          quality: '6',    bassPc: pc(c.root + 9) },
      ],
      why:    c => `the chord stays put — the bass climbs ${noteName(c.root + 7, false)}→` +
                   `${noteName(c.root + 8, false)}→${noteName(c.root + 9, false)} underneath it`,
    },
    {
      id: 'modal-oscillation-up', slot: 'ascending',
      label: 'Modal shift up a step',
      roman: 'I6/9 ⇄ ii11',
      applies: c => isMajorish(c.quality),
      chords: c => [{ rootPC: pc(c.root + 2), quality: 'm11' }],
      why:    c => `every note stays — only the bass steps ${noteName(c.root, false)}→${noteName(c.root + 2, false)}`,
    },

    // ── Minor-chord devices, so minor harmony gets real moves instead of
    //    falling through to whatever scored well ─────────────────────────
    {
      id: 'minor-passing-dim-up', slot: 'ascending', label: 'One to two, passing diminished', weight: 1,
      roman: 'i → ♯i°7 → ii',
      applies: c => isMinorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 1), quality: 'dim7'  },
        { rootPC: pc(c.root + 2), quality: 'm7b5'  },
      ],
      why:    c => `the bass climbs ${noteName(c.root, false)}→${noteName(c.root + 1, false)}→${noteName(c.root + 2, false)}`,
    },
    {
      id: 'minor-to-bVII', slot: 'secondary', label: 'Backdoor to the relative major', weight: 1,
      roman: 'i → ♭VII7 → ♭III',
      applies: c => isMinorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 10), quality: '7'    },
        { rootPC: pc(c.root + 3),  quality: 'maj7' },
      ],
      why:    c => `the backdoor route to ${noteName(c.root + 3, false)} major`,
    },
    {
      id: 'minor-half-dim-up', slot: 'ascending', label: 'Minor two-five', weight: 0,
      roman: 'i → iiø7 → V7',
      applies: c => isMinorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 2), quality: 'm7b5' },
        { rootPC: pc(c.root + 7), quality: '7alt' },
      ],
      why:    () => 'the minor ii–V, with the half-diminished on top',
    },

    // ── Sus-chord devices ────────────────────────────────────────────────
    {
      id: 'sus-bass-down', slot: 'descending', label: 'Sus with the seventh in the bass', weight: 1,
      roman: 'V7sus4 → V7sus4/♭7',
      applies: c => (QUALITIES[c.quality] || {}).family === 'sus',
      chords: c => [{ rootPC: c.root, quality: '7sus4', bassPc: pc(c.root + 10) }],
      why:    c => `the bass drops to the ♭7, ${noteName(c.root, false)}→${noteName(c.root + 10, false)}`,
    },
    {
      id: 'sus-up-a-step', slot: 'ascending', label: 'Sus up a whole step', weight: 1,
      roman: 'V7sus4 → ♭VI7sus4',
      applies: c => (QUALITIES[c.quality] || {}).family === 'sus',
      chords: c => [{ rootPC: pc(c.root + 2), quality: '7sus4' }],
      why:    c => `the whole structure slides up a step to ${noteName(c.root + 2, false)}sus7`,
    },

    // ── SLIDE: secondary dominants and modulation ────────────────────────
    {
      id: 'V7-of-IV', slot: 'secondary', label: 'One becomes the dominant of four', weight: 3,
      roman: 'I → I7/3 → IV',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: c.root, quality: '7', bassPc: pc(c.root + 4) },           // 3rd in the bass
        { rootPC: pc(c.root + 5), quality: 'maj7' },
      ],
      why:    c => `becomes the dominant of ${noteName(c.root + 5, false)}, bass rising ${noteName(c.root + 4, false)}→${noteName(c.root + 5, false)}`,
    },
    {
      id: 'V7-of-V', slot: 'secondary', label: 'Dominant chain into five', weight: -2,
      roman: 'I → II7 → V7',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 2), quality: '7' },
        { rootPC: pc(c.root + 7), quality: '7' },
      ],
      why:    c => `a dominant chain into ${noteName(c.root + 7, false)}7`,
    },
    {
      id: 'V7-of-vi', slot: 'colour', label: 'Modulate to the relative minor', weight: 1,
      roman: 'I → V7/vi → vi',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 4), quality: '7'  },
        { rootPC: pc(c.root + 9), quality: 'm7' },
      ],
      why:    c => `modulates toward ${noteName(c.root + 9, false)} minor`,
    },

    // ── Sus dominants ────────────────────────────────────────────────────
    // Delaying the 3rd is standard on a V chord: the sus hangs, the 3rd
    // arrives, the chord resolves. Works as pure colour too — you can sit on
    // the sus and never resolve it, which is most of modal jazz.
    {
      id: 'sus-then-dominant', slot: 'cadence', label: 'Suspend the five, then release it', weight: 2,
      roman: 'V7sus4 → V7 → I',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 7), quality: '7sus4' },
        { rootPC: pc(c.root + 7), quality: '7'     },
      ],
      why:    c => `${noteName(c.root + 7, false)}sus7 delays the 3rd, then resolves into the dominant`,
    },
    {
      id: 'sus-release', slot: 'cadence', label: 'Release the suspension', weight: 3,
      roman: 'V7sus4 → V7 → I',
      applies: c => (QUALITIES[c.quality] || {}).family === 'sus',
      chords: c => [
        { rootPC: c.root, quality: '7' },
        { rootPC: pc(c.root + 5), quality: 'maj7' },
      ],
      why:    c => `the 4th falls to the 3rd — then it resolves to ${noteName(c.root + 5, false)}`,
    },
    {
      id: 'sus-hang', slot: 'colour', label: 'Suspended, unresolved', weight: 0,
      roman: 'V7sus4 (unresolved)',
      applies: c => (QUALITIES[c.quality] || {}).family === 'sus',
      chords: c => [{ rootPC: pc(c.root + 5), quality: '7sus4' }],
      why:    () => 'sus to sus — the resolution never comes, which is the point',
    },

    // ── HOME: the strongest functional destination ───────────────────────
    {
      id: 'ii-V', slot: 'cadence', label: 'Two-five',
      roman: 'ii7 → V7',
      applies: c => isMajorish(c.quality),
      chords: c => [
        { rootPC: pc(c.root + 2), quality: 'm7' },
        { rootPC: pc(c.root + 7), quality: '7'  },
      ],
      why:    () => 'the ii–V that sets up a return home',
    },
    {
      id: 'V-I', slot: 'cadence', label: 'Five to one',
      roman: 'V7 → I',
      applies: c => (QUALITIES[c.quality] || {}).family === 'dominant',
      chords: c => [{ rootPC: pc(c.root + 5), quality: 'maj7' }],
      why:    c => `resolves down a fifth to ${noteName(c.root + 5, false)}`,
    },
    {
      id: 'minor-iv', slot: 'cadence', label: 'To the minor four',
      roman: 'i → iv',
      applies: c => isMinorish(c.quality),
      chords: c => [{ rootPC: pc(c.root + 5), quality: 'm7' }],
      why:    () => 'the subdominant minor',
    },
    {
      id: 'half-dim-V', slot: 'cadence', label: 'Half-diminished two-five',
      roman: 'iiø7 → V7alt',
      applies: c => c.quality === 'm7b5',
      chords: c => [
        { rootPC: pc(c.root + 5), quality: '7alt' },
        { rootPC: pc(c.root + 10), quality: 'm7' },
      ],
      why:    c => `the half-diminished ii heading for ${noteName(c.root + 10, false)} minor`,
    },
    {
      id: 'dim-resolve-up', slot: 'cadence', label: 'Diminished resolves up a half step',
      roman: '°7 → I',
      applies: c => (QUALITIES[c.quality] || {}).family === 'dim',
      chords: c => [{ rootPC: pc(c.root + 1), quality: 'maj7' }],
      why:    c => `diminished chords resolve up a half step, to ${noteName(c.root + 1, false)}`,
    },

    // ── FAR: reharmonisation and non-functional colour ───────────────────
    {
      id: 'tritone-sub', slot: 'colour', label: 'Tritone substitution',
      roman: '♭II7 → I',
      applies: c => (QUALITIES[c.quality] || {}).family === 'dominant',
      chords: c => [
        { rootPC: pc(c.root + 6), quality: '7' },
        { rootPC: pc(c.root + 5), quality: 'maj7' },
      ],
      why:    c => `${noteName(c.root + 6, false)}7 shares its guide tones — same resolution, chromatic bass`,
    },
    {
      id: 'modal-oscillation-down', slot: 'colour', label: 'Modal shift down a step',
      roman: 'ii11 → I6/9',
      applies: c => c.quality === 'm11' || c.quality === 'm9' || c.quality === 'm7',
      chords: c => [{ rootPC: pc(c.root + 10), quality: '6/9' }],
      why:    c => `settles onto ${noteName(c.root + 10, false)}6/9 — the modal resting place a step below`,
    },
  ];

  // maj7 or 6 — keep the chord's own flavour when putting the 7th in the bass.
  function majSeventhOf(q) {
    return (q === '6' || q === '6/9') ? 'maj7' : (QUALITIES[q] ? q : 'maj7');
  }

  /**
   * Non-functional chromatic sonorities — the Shorter / Hancock / Glasper move.
   *
   * These have no roman numeral, so they cannot be generated from function.
   * They are FOUND, by doing the thing a pianist does: hold the upper structure,
   * slide the bass a half step, and listen to what the chord became.
   *
   * Crucially this reads the notes ACTUALLY HELD, not an idealised chord —
   * Fm11 voiced F A♭ B♭ E♭ slides to Emaj7♯11, but the same chord voiced with a
   * natural 5 gives a different answer, and that difference is real music. An
   * engine working from the chord SYMBOL could never find these.
   */
  function chromaticSonorities(prevNotes) {
    if (!prevNotes || prevNotes.length < 3) return [];
    const sorted = [...prevNotes].sort((a, b) => a - b);
    const bass   = sorted[0];
    const upper  = sorted.slice(1);
    const out    = [];

    for (const dir of [-1, 1]) {
      const moved = bass + dir;
      const notes = [moved, ...upper].sort((a, b) => a - b);
      const id    = identify(notes);
      if (!id) continue;

      const common = upper.filter(n => notes.includes(n)).length;
      if (common < Math.max(2, Math.ceil(upper.length * 0.6))) continue;

      out.push({
        root: id.rootPC,
        q:    id.voiceAs,
        bassPc: pc(moved),
        slot: 'colour',
        family: 'sonority',
        device: 'chromatic-sonority',
        roman: '—',
        common,
        reason: `chromatic sonority: the bass slides ${dir < 0 ? 'down' : 'up'} a half step and ` +
                `${common} voices hold — it becomes ${chordName(id.rootPC, id.suffix)}`,
      });
    }
    return out;
  }

  /**
   * Realize a device: voice each chord of its sequence in turn, each led from
   * the one before, so the whole move is playable as written.
   */
  function realizeDevice(device, ctx, spice, shape) {
    let chords;
    try { chords = device.chords(ctx); } catch (_) { return null; }
    if (!chords || !chords.length) return null;
    if (chords.some(ch => !QUALITIES[ch.quality])) return null;

    const sequence = [];
    let from = ctx.prevNotes || [];

    for (const ch of chords) {
      // The dial gates the chord, not just its extensions: at "basic" a device
      // asking for 7alt gets a plain 7 instead of being dropped, so the MOVE
      // still works — just without the colour.
      const quality = atSpice(ch.quality, spice);
      const r = lead(from, ch.rootPC, quality, { spice, shape, bassPc: ch.bassPc });
      if (!r.notes || r.notes.length < 2) return null;
      sequence.push({
        rootPC:  ch.rootPC,
        quality,
        bassPc:  ch.bassPc ?? null,
        notes:   r.notes,
        mapping: r.mapping,
        name:    chordName(ch.rootPC, quality, ch.bassPc),
      });
      from = r.notes;
    }
    return sequence;
  }

  /**
   * Alternate colourings of the same harmonic function.
   *
   * F7, F9, F13, F7♭9, F7♯9, F7alt all do the same job — they are one branch
   * wearing different clothes. The tree offers the plainest one that the dial
   * allows and hands the rest back here, so hovering a branch can show the
   * shelf of options instead of burning four branches on one function.
   */
  function variants(prevNotes, rootPC, quality, spice, shape) {
    const fam = (QUALITIES[quality] || {}).family;
    if (!fam) return [];
    const max = spice == null ? 1 : spice;
    const out = [];

    for (const q of Object.keys(QUALITIES)) {
      if (QUALITIES[q].family !== fam) continue;
      if (QUALITIES[q].triad !== QUALITIES[quality].triad) continue;
      if (tierOf(q) > max) continue;
      const r = lead(prevNotes || [], rootPC, q, { spice, shape });
      if (!r.notes || r.notes.length < 2) continue;
      out.push({
        quality: q,
        tier:    tierOf(q),
        name:    chordName(rootPC, q),
        notes:   r.notes,
        mapping: r.mapping,
        current: q === quality,
      });
    }
    return out.sort((a, b) => a.tier - b.tier || a.quality.length - b.quality.length);
  }

  /**
   * Five branch suggestions for the current chord.
   * `suggest(prevNotes, rootPC, quality, trail, spice, shape)`
   *   → { key, branches: [{ slot, label, rootPC, quality, bassPc, notes, mapping, reason, … }] }
   */
  function suggest(prevNotes, rootPC, quality, trail, spice, shape, keyOverride) {
    const root   = pc(rootPC);
    const q      = QUALITIES[quality] ? quality : 'maj7';
    const chords = [...(trail || []).map(c => ({ rootPC: c.rootPC, quality: c.quality })), { rootPC: root, quality: q }];

    // A declared key centre beats inference. Inference on a lone chord gives it
    // a bonus for being its own tonic, so a solitary Gm9 reads as i in G minor
    // rather than ii in F — and every functional suggestion is then aimed at
    // the wrong tonic. Telling the engine the key is the fix.
    const key = (keyOverride && keyOverride.tonicPc != null)
      ? { tonicPc: pc(keyOverride.tonicPc), mode: keyOverride.mode || 'major', declared: true }
      : inferKey(chords);
    const keyTonic = key ? key.tonicPc : null;

    const prevBassPc = (prevNotes && prevNotes.length) ? pc(Math.min(...prevNotes)) : null;
    const ctx = {
      root, quality: q,
      keyTonic, keyMode: key ? key.mode : null,
      keyKnown: keyTonic != null,
      // Which scale degree the played chord occupies. This is what lets a
      // device say "I apply to the ii chord" instead of assuming the chord in
      // front of it is the tonic.
      degree:  keyTonic == null ? null : pc(root - keyTonic),
      atTonic: keyTonic == null || pc(root - keyTonic) === 0,
      prevNotes: prevNotes || [], prevBassPc,
    };

    // ── 1. Devices first — the hard-wired theory ──
    const bySlot = {};
    for (const device of DEVICES) {
      let ok = false;
      try { ok = device.applies(ctx); } catch (_) { ok = false; }
      if (!ok) continue;

      const sequence = realizeDevice(device, ctx, spice, shape);
      if (!sequence) continue;

      const first = sequence[0];
      const held  = commonTones(prevNotes, first.notes);
      const bass  = bassMotionBonus(prevBassPc, { root: first.rootPC, q: first.quality, bassPc: first.bassPc }, keyTonic);

      let modulation = null;
      if (device.modulatesTo) {
        try { modulation = device.modulatesTo(ctx); } catch (_) { modulation = null; }
      }

      (bySlot[device.slot] = bySlot[device.slot] || []).push({
        device, sequence, modulation,
        // Devices are all musically valid, so the score only breaks ties
        // between them. Common tones dominate: holding voices while the bass
        // moves is the sound we are actually after. `weight` lets a device
        // declare how instructive it is when several fit the same slot.
        score: held * 4 + bass.bonus * 2 + (sequence.length > 1 ? 2 : 0) + (device.weight || 0) * 3,
        held, bassLabel: bass.label,
      });
    }

    // Non-functional sonorities compete for the Far slot on common tones alone.
    for (const s of chromaticSonorities(prevNotes)) {
      // Gate by the dial like everything else — a sonority found by ear still
      // gets plainened when the player asked for basic harmony.
      s.q = atSpice(s.q, spice);
      const r = lead(prevNotes, s.root, s.q, { spice, shape, bassPc: s.bassPc });
      if (!r.notes || r.notes.length < 2) continue;
      (bySlot.far = bySlot.far || []).push({
        device: { id: s.device, slot: 'colour', label: 'Chromatic sonority', roman: s.roman,
                  why: () => s.reason },
        sequence: [{ rootPC: s.root, quality: s.q, bassPc: s.bassPc,
                     notes: r.notes, mapping: r.mapping,
                     name: chordName(s.root, s.q, s.bassPc) }],
        variants: variants(prevNotes, s.root, s.q, spice, shape),
        score: s.common * 5,
        held: s.common, bassLabel: 'chromatic bass',
      });
    }

    // ── 2. Generic scored candidates — the fallback for unfilled slots ──
    const pool = [
      ...withInversions(functionalCandidates(root, q)),
      ...chromaticBassCandidates(root, q),
      ...withInversions(tritoneCandidates(root, q)),
      ...reharmCandidates(root, q),
      ...slashCandidates(root, q),
    ].filter(c => QUALITIES[c.q])
     // The dial gates suggestions: "basic" must never volunteer an altered
     // dominant. Anything richer than the dial allows is plainened, not dropped.
     .map(c => ({ ...c, q: atSpice(c.q, spice) }));

    const scored = pool
      .map(c => scoreCandidate(prevNotes, c, keyTonic, spice, shape, prevBassPc))
      .filter(c => c.voiced.notes.length >= 2)
      .filter(c => Math.max(...c.voiced.notes) - Math.min(...c.voiced.notes) <= 36)
      .sort((a, b) => b.score - a.score);

    // ── 3. Fill the five slots ──
    const usedChord = new Set();
    const usedRoot  = new Set();
    const chordOf   = (r, qq) => `${r}:${qq}`;
    const branches  = [];

    for (const { slot, label } of SLOTS) {
      const candidates = (bySlot[slot] || []).sort((a, b) => b.score - a.score);
      const pick = candidates.find(c => !usedChord.has(chordOf(c.sequence[0].rootPC, c.sequence[0].quality)));

      if (pick) {
        const first = pick.sequence[0];
        const last  = pick.sequence[pick.sequence.length - 1];
        usedChord.add(chordOf(first.rootPC, first.quality));
        usedRoot.add(first.rootPC);
        branches.push({
          slot, label,
          device:   pick.device.id,
          deviceLabel: pick.device.label,
          // A modulating device is ARGUING for a different key, so label its
          // path in the key it lands in. Measured in the old key, "hear this
          // Gm7 as a ii" comes out as "i7 → IV7 → ♭VIImaj7", which describes
          // the notes correctly and the idea not at all.
          roman:    romanPath(root, q, pick.sequence,
                              pick.modulation ? pick.modulation.tonicPc : keyTonic)
                    || pick.device.roman,
          // Non-null when playing this device moves the tonal centre; compose
          // mode adopts it as the new key.
          modulatesTo: pick.modulation,
          sequence: pick.sequence,
          // The tip shows the whole move: "A7/C♯ → Dm7"
          name:     pick.sequence.map(s => s.name).join(' → '),
          reason:   safeWhy(pick.device, ctx),
          bassLabel: pick.bassLabel,
          heldCount: pick.held,
          // The chord to play FIRST — what the keyboard lights and what
          // compose mode listens for.
          rootPC:  first.rootPC,
          quality: first.quality,
          bassPc:  first.bassPc,
          notes:   first.notes,
          mapping: first.mapping,
          // Same function, other colours — for the hover menu.
          variants: pick.variants || variants(prevNotes, first.rootPC, first.quality, spice, shape),
          // Where the whole device lands — this becomes the tree's new root.
          resolvesTo: last,
        });
        continue;
      }

      // No device applies — fall back to a scored candidate. Dedupe on the
      // ROOT, not root+quality: F7, F7♭9 and F7♯9 are one harmonic idea wearing
      // three hats, and offering all three wastes the branches.
      const alt = scored.find(c => !usedChord.has(chordOf(c.root, c.q)) && !usedRoot.has(c.root));
      if (!alt) continue;
      usedChord.add(chordOf(alt.root, alt.q));
      usedRoot.add(alt.root);
      const one = {
        rootPC: alt.root, quality: alt.q, bassPc: alt.bassPc ?? null,
        notes: alt.voiced.notes, mapping: alt.voiced.mapping,
        name: chordName(alt.root, alt.q, alt.bassPc),
      };
      branches.push({
        slot, label,
        device: null,
        deviceLabel: null,
        roman: romanPath(root, q, [one], keyTonic) || romanOf(alt.root, alt.q, keyTonic),
        modulatesTo: null,
        sequence: [one],
        name: one.name,
        reason: alt.bass.label ? `${alt.reason} · ${alt.bass.label}` : alt.reason,
        bassLabel: alt.bass.label,
        heldCount: commonTones(prevNotes, one.notes),
        rootPC: one.rootPC, quality: one.quality, bassPc: one.bassPc,
        notes: one.notes, mapping: one.mapping,
        variants: variants(prevNotes, one.rootPC, one.quality, spice, shape),
        resolvesTo: one,
      });
    }

    return { key, branches };
  }

  function safeWhy(device, ctx) {
    try { return device.why(ctx); } catch (_) { return device.label || ''; }
  }

  // How many sounding pitches survive the move untouched — the thing that
  // makes a bass shift sound like colour rather than like a new chord.
  function commonTones(prevNotes, nextNotes) {
    if (!prevNotes || !nextNotes) return 0;
    const next = new Set(nextNotes);
    return prevNotes.filter(n => next.has(n)).length;
  }

  // ── Roman numerals ──────────────────────────────────────────────────────

  const NUMERALS = ['I','♭II','II','♭III','III','IV','♯IV','V','♭VI','VI','♭VII','VII'];

  /**
   * The roman-numeral motion of a device, computed from the KEY rather than
   * taken from the device's own label. A device's literal string is only right
   * when the chord happens to be the tonic; once devices are degree-aware the
   * numerals have to come from where the chords actually sit.
   */
  function romanPath(rootPC, quality, sequence, keyTonic) {
    if (keyTonic == null) return null;
    const parts = [romanOf(rootPC, quality, keyTonic)];
    for (const step of sequence) {
      let r = romanOf(step.rootPC, step.quality, keyTonic);
      if (step.bassPc != null && pc(step.bassPc) !== pc(step.rootPC)) {
        r += '/' + noteName(step.bassPc, false);
      }
      parts.push(r);
    }
    return parts.join(' → ');
  }

  function romanOf(rootPC, quality, keyTonic) {
    if (keyTonic == null) return '';
    const def = QUALITIES[quality] || {};
    let numeral = NUMERALS[pc(rootPC - keyTonic)];
    if (def.family === 'minor' || def.family === 'dim') numeral = numeral.toLowerCase();
    const tag = def.family === 'dim'      ? '°7'
              : def.family === 'dominant' ? '7'
              : def.family === 'sus'      ? 'sus'
              : quality === 'maj7' || quality === 'maj9' ? 'maj7'
              : def.family === 'minor'    ? '7'
              : '';
    return numeral + tag;
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
    colour, voice, variants, atSpice, tierOf,
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

/**
 * suggest.js
 * Voice Me — chord SUGGESTION engine (which chord follows the current one).
 *
 * Two candidate families, then scored by four signals:
 *   • FUNCTIONAL      — diatonic destinations for the current chord's role in the key.
 *   • TRANSFORMATIONAL— key-independent moves on the actual notes: chromatic bass /
 *                       line-clichés, 1–2 voice common-tone reharms, tritone subs,
 *                       and the optional "treat this m7 as a ii" reinterpretation.
 * Scoring: function strength + voice-leading smoothness + idiomatic tendency-tone
 *          resolutions (b6→5, 7→1, 4→3 …) + harmonic pull toward a tonic (boosted
 *          when that tonic is a NEW key center).
 *
 * The winners are spread across five branch slots: Home, Lift, Shadow, Slide, Far.
 * Each result carries { rootPC, quality, bassPc?, notes, mapping, reason, … } so the
 * tree can label it and the piano can light the real held / moved / new / lift voices.
 */
(function () {
  const V = (typeof window !== 'undefined' && window.Voicing) ||
            (typeof require !== 'undefined' ? require('./voicing.js') : null);
  const ENG = (typeof window !== 'undefined' && window.VoiceEngine) ||
              (typeof require !== 'undefined' ? require('./engine.js') : null);
  // engine mapping is a flat [{from,to}] array; suggest scoring wants {held,moved,…}
  const toMapping = (pairs) => {
    const held = [], moved = [];
    for (const p of (pairs || [])) { if (p.from == null) continue; (p.from === p.to ? held : moved).push(p); }
    return { held, moved, appeared: [], released: [] };
  };

  const NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const pcName = pc => NAMES[(((pc % 12) + 12) % 12)];

  // ── Quality dictionary: intervals (semitones from root) ───────────────────
  const Q = {
    'maj7': [0,4,7,11], 'maj9': [0,4,7,11,2], '6': [0,4,7,9],
    '7': [0,4,7,10], '9': [0,4,7,10,2], '13': [0,4,7,10,2,9],
    '7alt': [0,4,10,1,8], '7b9': [0,4,7,10,1], '7#9': [0,4,7,10,3],
    '7b9(13)': [0,4,10,1,9], '7b9(b13)': [0,4,10,1,8],
    '7#9(13)': [0,4,10,3,9], '7#9(b13)': [0,4,10,3,8],
    'm7': [0,3,7,10], 'm9': [0,3,7,10,2], 'm6': [0,3,7,9], 'mMaj7': [0,3,7,11],
    'm7b5': [0,3,6,10], 'dim7': [0,3,6,9], '7sus4': [0,5,7,10],
  };
  const spell = (root, q) => pcName(root) + q;
  const pcSet = (root, q) => new Set((Q[q] || Q['maj7']).map(i => (root + i) % 12));
  const isMaj = q => /^(maj7|maj9|6)$/.test(q);
  const isMin = q => /^(m7|m9|m6|mMaj7)$/.test(q);
  const isDom = q => /^(7|9|13)/.test(q);   // any dominant-family token, incl. altered

  function nameSet(set) {
    let best = null;
    for (let root = 0; root < 12; root++) {
      for (const q in Q) {
        const cand = pcSet(root, q);
        if (cand.size !== set.size) continue;
        let ok = true; for (const pc of cand) if (!set.has(pc)) { ok = false; break; }
        if (ok) { const s = q.length; if (!best || s < best.score) best = { root, q, name: spell(root,q), score: s }; }
      }
    }
    return best;
  }

  // ── Lean key inference off the committed trail ────────────────────────────
  const MAJOR = [0,2,4,5,7,9,11];
  const MINOR = [0,2,3,5,7,8,10];   // natural minor — good enough for fit-scoring
  function inferKey(chords) {
    if (!chords || !chords.length) return null;
    const cur = chords[chords.length - 1];
    let best = null;
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const [mode, scale] of [['major', MAJOR], ['minor', MINOR]]) {
        const set = new Set(scale.map(s => (tonic + s) % 12));
        let score = 0, w = 1;
        for (let i = chords.length - 1; i >= 0; i--) {
          const pcs = pcSet(chords[i].rootPC, chords[i].quality);
          let inKey = 0; pcs.forEach(pc => { if (set.has(pc)) inKey++; });
          score += (inKey / pcs.size) * w;
          if (chords[i].rootPC === tonic) score += 0.3 * w;
          w *= 0.6;
        }
        // a m7b5 is the signature iiø of the minor key a whole step below
        if (cur.quality === 'm7b5' && mode === 'minor' && tonic === (((cur.rootPC - 2) % 12) + 12) % 12) score += 0.5;
        if (!best || score > best.score) best = { tonicPc: tonic, mode, score };
      }
    }
    return best;
  }

  // ── FUNCTIONAL generator (current root as a scale degree; default = tonic) ─
  function functionalCandidates(root, q) {
    const out = [];
    const add = (iv, quality, reason, slot) => out.push({ root: (((root + iv) % 12) + 12) % 12, q: quality, reason, slot, family: 'functional' });
    if (isMaj(q)) {
      add(7,  '7',    'V — dominant',                 'home');
      add(5,  'maj7', 'IV — subdominant',             'lift');
      add(2,  'm7',   'ii',                           'lift');
      add(9,  'm7',   'vi — deceptive / rel. minor',  'shadow');
      add(4,  'm7',   'iii',                          'shadow');
    } else if (isMin(q)) {
      add(5,  'm7',   'iv',                           'home');
      add(3,  'maj7', 'III — relative major',         'lift');
      add(7,  '7',    'V — dominant (harmonic minor)','home');
      add(8,  'maj7', 'VI',                           'shadow');
      add(10, '7',    'bVII',                         'shadow');
      // optional reinterpretation: treat this m7 as a ii → its V pulls to a new I (root−2)
      add(5,  '7',    `treat as ii → V7 (pulls to ${pcName(root - 2)})`, 'far');
    } else if (q === 'm7b5') {
      add(5,  '7alt', 'ii°–V: here is its V',         'home');
      add(-2, 'm7',   'resolves toward i',            'shadow');
      add(3,  'maj7', 'bIII of the implied key',      'lift');
    } else if (q === 'dim7') {
      // diminished resolves by half-step: up to a maj/dom (bass rises ½), down to a m7
      add(1,  'maj7', 'resolves up a ½-step',            'home');   // Ebdim7 → E, bass Eb→E
      add(1,  '7',    'resolves up a ½-step → dominant', 'lift');
      add(-2, 'm7',   'resolves down a whole-step',      'shadow');
      add(-1, '7',    'passing dim → dominant a ½ below','slide');
    } else if (isDom(q)) {
      add(5,  'maj7', 'V→I resolution',               'home');
      add(5,  'm7',   'V→i resolution',               'home');
      add(2,  'm7',   'deceptive → vi region',        'shadow');
    }
    return out;
  }

  // ── TRANSFORMATIONAL generators ───────────────────────────────────────────
  function chromaticBassCandidates(root, q) {
    const out = [];
    if (isMaj(q)) {
      out.push({ root, q: 'maj7', bassPc: (root + 11) % 12, slot: 'slide', family: 'chromatic',
        reason: `chromatic bass ${pcName(root)}→${pcName(root+11)} (maj7 in bass)` });
      out.push({ root, q: '7', bassPc: (root + 10) % 12, slot: 'slide', family: 'chromatic',
        reason: `line cliché → ${spell(root,'7')}/${pcName(root+10)} (b7 in bass, pulls to ${pcName(root+5)})` });
    }
    return out;
  }

  // Move 1 OR 2 voices by a semitone, re-name the result (Dm7 → Dbmaj7 etc.)
  function reharmCandidates(root, q) {
    const base = [...pcSet(root, q)];
    const seen = new Set(), out = [];
    const tryMove = (moves) => {
      const set = new Set(base);
      const path = [];
      for (const [note, dir] of moves) {
        set.delete(note);
        const to = (((note + dir) % 12) + 12) % 12;
        if (set.has(to)) return;                 // collision
        set.add(to);
        path.push({ fromPc: note, toPc: to, dir });
      }
      if (set.size !== base.length) return;
      const named = nameSet(set);
      if (!named || (named.root === root && named.q === q)) return;
      const key = named.root + ':' + named.q;
      if (seen.has(key)) return; seen.add(key);
      const held = base.filter(p => !path.some(m => m.fromPc === p));
      const kind = moves.length === 1 ? 'reharm' : 'slip';
      // Dominant results pull → they belong on Far; smooth non-dom slips are the Slide discoveries.
      const slot = isDom(named.q) ? 'far' : (moves.length === 2 ? 'slide' : 'far');
      out.push({ root: named.root, q: named.q, slot, family: 'reharm',
        reason: `${kind}: ${path.map(m => pcName(m.fromPc) + (m.dir < 0 ? '↓' : '↑')).join(' ')} → ${named.name} (${held.length} held)`,
        path: { heldPcs: held, moved: path.map(m => ({ fromPc: m.fromPc, toPc: m.toPc })) } });
    };
    for (const n of base) for (const d of [-1, 1]) tryMove([[n, d]]);
    for (let i = 0; i < base.length; i++)
      for (let j = i + 1; j < base.length; j++)
        for (const di of [-1, 1]) for (const dj of [-1, 1]) tryMove([[base[i], di], [base[j], dj]]);
    return out.filter(c => c.path.heldPcs.length >= Math.ceil(base.length / 2));
  }

  function tritoneCandidates(root, q) {
    if (!isDom(q)) return [];
    return [{ root: (root + 6) % 12, q: '7', slot: 'far', family: 'distant',
      reason: `tritone sub (${spell(root,q)} ↔ ${spell((root+6)%12,'7')})` }];
  }

  // Inversions — the current chord over a chord tone (3rd/5th/7th) in the bass.
  // Bass = a chord tone, so the voicing stays clean (no dropped notes).
  function slashCandidates(root, quality, prevBassPc) {
    const out = [];
    const name  = spell(root, quality);
    const tones = (ENG && ENG.toneSet) ? ENG.toneSet(quality, 0) : [];   // core tones
    for (const t of tones) {
      if (t.role === 'root') continue;
      const bpc = (root + t.iv) % 12;
      out.push({ root, q: quality, bassPc: bpc, slot: 'slide', family: 'inversion',
        reason: `${name}/${pcName(bpc)} — ${t.role} in the bass` });
    }
    return out;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────
  const DEG = {0:'1',1:'b2',2:'2',3:'b3',4:'3',5:'4',6:'#4',7:'5',8:'b6',9:'6',10:'b7',11:'7'};
  const degName = s => DEG[(((s % 12) + 12) % 12)];
  const IDIOM = { '11->0':3, '8->7':3, '5->4':2, '6->7':2, '1->0':2, '2->0':1, '3->2':1 };

  function idiomBonus(mapping, keyTonic) {
    if (keyTonic == null) return { bonus: 0, hits: [] };
    let bonus = 0; const hits = [];
    for (const v of mapping.moved) {
      const from = (((v.from - keyTonic) % 12) + 12) % 12;
      const to   = (((v.to   - keyTonic) % 12) + 12) % 12;
      const wt = IDIOM[`${from}->${to}`];
      if (wt) { bonus += wt; hits.push(`${degName(from)}→${degName(to)}`); }
    }
    return { bonus, hits };
  }

  function pullBonus(cand, keyTonic) {
    if (!isDom(cand.q)) return { bonus: 0, label: '' };
    const tonic = (cand.root + 5) % 12;                   // V → I, down a fifth
    const modulates = keyTonic != null && tonic !== keyTonic;
    return { bonus: 4 + (modulates ? 4 : 0), label: `↝ ${pcName(tonic)}${modulates ? ' (new center)' : ''}`, modulates };
  }

  // Realize a candidate against the played notes; honor a transformational path.
  function voiceCandidate(prevNotes, cand, spice) {
    if (cand.path && prevNotes && prevNotes.length) {
      const held = [], moved = [], released = [], used = new Set();
      for (const pc of cand.path.heldPcs) {
        const n = prevNotes.find(x => x % 12 === pc && !used.has(x));
        if (n != null) { held.push({ from: n, to: n }); used.add(n); }
      }
      for (const m of cand.path.moved) {
        const src = prevNotes.find(x => x % 12 === m.fromPc && !used.has(x));
        if (src != null) { const to = V.nearestOctave(m.toPc, src); moved.push({ from: src, to }); used.add(src); }
      }
      prevNotes.forEach(n => { if (!used.has(n)) released.push({ from: n }); });
      const notes = [...held, ...moved].map(v => v.to).sort((a, b) => a - b);
      return { notes, mapping: { held, moved, appeared: [], released } };
    }
    // everything else → the engine (good voicing, spice-aware, honours a slash bass)
    const r = ENG.voiceLeadFrom(prevNotes || [], cand.root, cand.q, spice == null ? 1 : spice, cand.bassPc == null ? null : cand.bassPc);
    return { notes: r.notes, mapping: toMapping(r.mapping) };
  }

  function motionOf(mapping) {
    return [...mapping.held, ...mapping.moved].reduce((s, v) => s + Math.abs(v.to - v.from), 0);
  }

  function scoreCandidate(prevNotes, cand, keyTonic, spice) {
    const voiced = voiceCandidate(prevNotes, cand, spice);
    const motion = motionOf(voiced.mapping);
    const idiom  = idiomBonus(voiced.mapping, keyTonic);
    const pull   = pullBonus(cand, keyTonic);
    const base   = { functional: 5, chromatic: 3, reharm: 2, distant: 2, inversion: 3 }[cand.family] || 2;
    const smooth = 8 - Math.min(motion, 8);
    const score  = base + smooth + idiom.bonus * 3 + pull.bonus * 2;
    return { ...cand, voiced, motion, idiom, pull, score };
  }

  // ── Public: five branch suggestions for the current chord ─────────────────
  const SLOTS = [
    { slot: 'home',   label: 'Home'   },
    { slot: 'lift',   label: 'Lift'   },
    { slot: 'shadow', label: 'Shadow' },
    { slot: 'slide',  label: 'Slide'  },
    { slot: 'far',    label: 'Far'    },
  ];

  function branchesFor(prevNotes, rootPC, quality, trail, spice) {
    const chords = [...(trail || []).map(c => ({ rootPC: c.rootPC, quality: c.quality })), { rootPC, quality }];
    const key = inferKey(chords);
    const keyTonic = key ? key.tonicPc : null;
    const prevBassPc = (prevNotes && prevNotes.length) ? (Math.min(...prevNotes) % 12) : null;

    const raw = [
      ...functionalCandidates(rootPC, quality),
      ...chromaticBassCandidates(rootPC, quality),
      ...reharmCandidates(rootPC, quality),
      ...tritoneCandidates(rootPC, quality),
      ...slashCandidates(rootPC, quality, prevBassPc),
    ];
    const scored = raw
      .map(c => scoreCandidate(prevNotes, c, keyTonic, spice))
      .filter(c => c.voiced.notes.length >= 2)
      .sort((a, b) => b.score - a.score);

    // Assign the best-scoring distinct chord to each slot; fall back to best unused.
    const usedChords = new Set();
    const chosen = [];
    for (const { slot, label } of SLOTS) {
      let pick = scored.find(c => c.slot === slot && !usedChords.has(c.root + ':' + c.q + ':' + (c.bassPc ?? '')));
      if (!pick) pick = scored.find(c => !usedChords.has(c.root + ':' + c.q + ':' + (c.bassPc ?? '')));
      if (!pick) continue;
      usedChords.add(pick.root + ':' + pick.q + ':' + (pick.bassPc ?? ''));
      chosen.push({
        slot, label,
        rootPC: pick.root, quality: pick.q, bassPc: pick.bassPc ?? null,
        notes: pick.voiced.notes, mapping: pick.voiced.mapping,
        reason: pick.reason, family: pick.family,
        pullLabel: pick.pull.label, idiomHits: pick.idiom.hits,
      });
    }
    return { key, branches: chosen };
  }

  const api = { branchesFor, inferKey, voiceCandidate, pcName, _debug: { functionalCandidates, reharmCandidates, scoreCandidate } };
  if (typeof window !== 'undefined') window.Suggest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

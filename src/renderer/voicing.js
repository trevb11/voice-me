/**
 * voicing.js
 * Voice Me — Jazz voicing generator with baked-in jazz musicianship.
 *
 * Modes: Closed / Open / Cluster / Minimal
 *
 * Rules baked in:
 *   • Never natural 4 on major or dominant chords (use ♯11 instead → Lydian / Lydian Dominant)
 *   • Natural 4 (=11) fine on minor chords
 *   • Drop the 5th on dominant chords (especially altered)
 *   • Guide tones (3rd and ♭7 or 7th) are always present
 *   • Cluster voicings often rootless
 *   • Extensions added automatically per chord quality (9 on maj, 9+13 on dom, 9+11 on min)
 *
 * Chord quality tokens supported:
 *   maj7, maj9, maj9#11, m7, m9, m11, mMaj7, 7, 9, 13, 7b9, 7#9, 7alt,
 *   9sus4, 7sus4, m7b5, dim7
 */

(function () {

  // ── Chord anatomy: base intervals + implicit extensions per mode ─────────

  // Each chord quality maps to:
  //   guide    — the guide tones (3rd, 7th) that MUST be present
  //   flavor   — extensions that "belong" to this chord quality in jazz idiom
  //   forbidden — intervals that are stylistically banned
  //
  // Intervals are 0-11 semitones from root; extensions above 11 (13, 14, 18) are supported.

  const QUALITY = {
    'maj7':    { third: 4,  seventh: 11, natural4Ok: false, dropFifthOnDom: false, isDominant: false, isMinor: false },
    'maj9':    { third: 4,  seventh: 11, natural4Ok: false, dropFifthOnDom: false, isDominant: false, isMinor: false, extras: [14] },
    'maj9#11': { third: 4,  seventh: 11, natural4Ok: false, dropFifthOnDom: false, isDominant: false, isMinor: false, extras: [14, 18] },
    'maj7#11': { third: 4,  seventh: 11, natural4Ok: false, dropFifthOnDom: false, isDominant: false, isMinor: false, extras: [18] },
    'm7':      { third: 3,  seventh: 10, natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: true  },
    'm9':      { third: 3,  seventh: 10, natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: true,  extras: [14] },
    'm11':     { third: 3,  seventh: 10, natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: true,  extras: [14, 17] },
    'mMaj7':   { third: 3,  seventh: 11, natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: true  },
    '7':       { third: 4,  seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false },
    '9':       { third: 4,  seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, extras: [14] },
    '13':      { third: 4,  seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, extras: [14, 21] },
    '7b9':     { third: 4,  seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, altered: [13] },
    '7#9':     { third: 4,  seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, altered: [15] },
    '7alt':    { third: 4,  seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, altered: [13, 15, 20] },
    '7b9(13)':  { third: 4, seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, altered: [13],     extras: [21] },
    '7b9(b13)': { third: 4, seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, altered: [13, 20] },
    '7#9(13)':  { third: 4, seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, altered: [15],     extras: [21] },
    '7#9(b13)': { third: 4, seventh: 10, natural4Ok: false, dropFifthOnDom: true,  isDominant: true,  isMinor: false, altered: [15, 20] },
    '7sus4':   { third: 5,  seventh: 10, natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: false, sus: true },
    '9sus4':   { third: 5,  seventh: 10, natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: false, sus: true, extras: [14] },
    'm7b5':    { third: 3,  seventh: 10, natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: true,  halfDim: true, fifthOverride: 6, extras: [17] },
    'dim7':    { third: 3,  seventh: 9,  natural4Ok: true,  dropFifthOnDom: false, isDominant: false, isMinor: true,  fifthOverride: 6 },
  };

  // ── Build the note collection for a chord (before voicing arrangement) ──

  // Returns the FULL "palette" of pitch classes to use for this chord in this mode
  // Note: returns pitch classes (0-11), then voicing arrangement decides octaves

  function collectNotes(quality, mode) {
    const q = QUALITY[quality] || QUALITY['maj7'];
    const notes = new Set();

    // Always add third + seventh (guide tones)
    notes.add(q.third);
    notes.add(q.seventh);

    // Fifth logic
    const fifth = q.fifthOverride !== undefined ? q.fifthOverride : 7;
    const includeFifth = shouldIncludeFifth(q, mode);
    if (includeFifth) notes.add(fifth);

    // Root — sometimes omitted in certain modes
    if (shouldIncludeRoot(q, mode)) notes.add(0);

    // Baseline extensions from chord identity (e.g. maj9 → 9)
    (q.extras || []).forEach(iv => notes.add(iv % 12));
    (q.altered || []).forEach(iv => notes.add(iv % 12));

    // Mode-specific coloring
    addModeExtensions(notes, q, mode);

    return { pcs: [...notes], quality: q };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function shouldIncludeFifth(q, mode) {
    // Almost always drop 5th on dominants — jazz convention
    if (q.isDominant) return false;
    // Minimal mode omits the 5th on everything (guide tones only)
    if (mode === 'minimal') return false;
    // Cluster often rootless but keeps 5th for stability sometimes — allow it
    return true;
  }

  function shouldIncludeRoot(q, mode) {
    // Cluster voicings often rootless — very jazz idiomatic
    if (mode === 'cluster') return false;
    return true;
  }

  function addModeExtensions(notes, q, mode) {
    // Add stylistic colors based on mode + chord quality
    const isMaj = !q.isMinor && !q.isDominant && !q.sus;

    // Never add a natural 9 to a chord that already carries a b9 (13) or #9 (15)
    const hasAltered9 = !!(q.altered && (q.altered.includes(13) || q.altered.includes(15)));
    const add9 = () => { if (!hasAltered9) notes.add(2); };

    if (mode === 'minimal') {
      // Just guide tones + root — no color extensions unless already in chord name
      return;
    }

    if (mode === 'closed') {
      // Textbook — extensions only if in the chord name itself (already added above)
      return;
    }

    if (mode === 'open') {
      // Open voicings get 9 and 13 on dominants, 9 on major, 9+11 on minor
      if (q.isDominant) {
        add9();         // natural 9 — skipped when the chord is b9/#9
        // Only add 13 if not b13/altered
        if (!q.altered || !q.altered.includes(20)) notes.add(9);
      } else if (isMaj) {
        add9();         // 9
        // ♯11 color OK on maj — add it optionally, but not automatically here (unless chord asks for it)
      } else if (q.isMinor) {
        add9();         // 9
        if (!q.halfDim) notes.add(5);   // natural 11 (allowed on minor)
      }
    }

    if (mode === 'cluster') {
      // Dense: add 9 and 11-like colors aggressively
      if (q.isDominant) {
        add9();         // natural 9 — skipped when the chord is b9/#9
        if (!q.altered || !q.altered.includes(20)) notes.add(9);   // 13
        // ♯11 optional on cluster dominants (Lydian dominant color)
        notes.add(6);
      } else if (isMaj) {
        add9();         // 9
        notes.add(6);   // ♯11 (Lydian) — NEVER natural 4
        notes.add(9);   // 13
      } else if (q.isMinor) {
        add9();         // 9
        if (!q.halfDim) notes.add(5);   // 11
        notes.add(9);   // 6/13 for min6/13 flavor
      }
    }
  }

  // ── Arrange the pitch classes into actual MIDI notes based on mode ───────

  // rootPC: 0-11 (pitch class of the root note)
  // pcs:    array of pitch classes from collectNotes
  // mode:   'closed' | 'open' | 'cluster' | 'minimal'

  function arrangeVoicing(rootPC, pcs, mode) {
    switch (mode) {
      case 'closed':   return arrangeClosed(rootPC, pcs);
      case 'open':     return arrangeOpen(rootPC, pcs);
      case 'cluster':  return arrangeCluster(rootPC, pcs);
      case 'minimal':  return arrangeMinimal(rootPC, pcs);
      default:         return arrangeClosed(rootPC, pcs);
    }
  }

  // Closed: root position, all chord tones stacked as tightly as possible above the root
  function arrangeClosed(rootPC, pcs) {
    const rootMidi = 48 + rootPC;      // start root around C3
    const notes    = [rootMidi];

    // Sort pcs by ascending pitch class distance from root
    const intervals = [...pcs].filter(pc => pc !== 0).map(pc => (pc - 0 + 12) % 12).sort((a, b) => a - b);

    // Stack each above the previous, keeping ascending
    let lastMidi = rootMidi;
    intervals.forEach(iv => {
      let candidate = rootMidi + iv;
      while (candidate <= lastMidi) candidate += 12;
      notes.push(candidate);
      lastMidi = candidate;
    });

    return notes.sort((a, b) => a - b);
  }

  // Open: root low, then wide spacing. Root + 5 in bass region if present, then guide tones + extensions above
  function arrangeOpen(rootPC, pcs) {
    const rootMidi = 36 + rootPC;   // deep bass at C2..B2 (MIDI 36 = C2; 40 would be E2)
    const notes    = new Set([rootMidi]);

    const intervals = [...pcs].filter(pc => pc !== 0);
    const has5th = intervals.includes(7);

    // If 5th present: place it around a 10th above root
    if (has5th) {
      notes.add(rootMidi + 19);   // 5th an octave + 5th above (compound 12th)
    }

    // Guide tones and extensions go in the middle-to-upper register
    // Spread them across two octaves for openness
    const upperStart = rootMidi + 24;   // two octaves up
    const others = intervals.filter(pc => pc !== 7);

    others.sort((a, b) => a - b);
    let lastMidi = has5th ? (rootMidi + 19) : rootMidi;

    others.forEach(pc => {
      let candidate = upperStart + pc;
      while (candidate - lastMidi < 5) candidate += 12;   // ensure some breathing space
      notes.add(candidate);
      lastMidi = candidate;
    });

    return [...notes].sort((a, b) => a - b);
  }

  // Cluster: bass note (often 3rd or 7th if rootless), then dense stack of extensions above
  function arrangeCluster(rootPC, pcs) {
    // Cluster is generally rootless — bass is 3rd or 5th
    const has3rd = pcs.some(pc => pc === 3 || pc === 4);
    const has5th = pcs.includes(7);

    let bassPC;
    if (has5th && !has3rd) bassPC = 7;
    else if (has3rd)       bassPC = pcs.includes(3) ? 3 : 4;
    else                   bassPC = pcs[0] || 0;

    const bassMidi = 48 + ((rootPC + bassPC) % 12);
    const notes    = new Set([bassMidi]);

    // The rest of the pitch classes stack densely above the bass
    const others = pcs.filter(pc => pc !== bassPC).sort((a, b) => a - b);

    let lastMidi = bassMidi;
    others.forEach(pc => {
      let candidate = 60 + ((rootPC + pc) % 12);   // start upper cluster around middle C
      while (candidate <= lastMidi + 1) candidate += 12;
      while (candidate - lastMidi > 8) candidate -= 12;
      if (candidate <= lastMidi) candidate += 12;
      notes.add(candidate);
      lastMidi = candidate;
    });

    return [...notes].sort((a, b) => a - b);
  }

  // Minimal: guide tones (root, 3, 7) only. Compact.
  function arrangeMinimal(rootPC, pcs) {
    const rootMidi = 48 + rootPC;
    const notes    = [rootMidi];

    // Only include: 3rd, 7th, and any explicit extension already in pcs (like a 9 if chord name calls for it)
    // Actually: for minimal, keep ONLY guide tones and root
    const has3 = pcs.includes(3), has4 = pcs.includes(4);
    const has7 = pcs.includes(11), has10 = pcs.includes(10), has9dim = pcs.includes(9);

    const thirdIv   = has4 ? 4 : (has3 ? 3 : null);
    const seventhIv = has7 ? 11 : (has10 ? 10 : (has9dim ? 9 : null));

    if (thirdIv !== null)   notes.push(rootMidi + thirdIv);
    if (seventhIv !== null) notes.push(rootMidi + seventhIv);

    return notes.sort((a, b) => a - b);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REAL VOICE LEADING
  //  ---------------------------------------------------------------------------
  //  `voice()` above arranges a chord in ISOLATION (fixed register anchor).
  //  `voiceLead()` below arranges the NEXT chord *relative to the previous one*,
  //  applying the classic rule set:
  //
  //    1. Content is decided by collectNotes() — same as before (guide tones,
  //       extensions, drop-5 on dominants, rootless clusters). Voice leading
  //       only chooses OCTAVES and WHICH voice moves where.
  //    2. Bass is placed FUNCTIONALLY (root/3rd in a bass register, free to
  //       leap) — jazz bass moves by function, upper voices glide.
  //    3. The UPPER STRUCTURE is voice-led against the previous chord's actual
  //       notes: common pitch classes are PINNED at the exact same pitch (zero
  //       motion); every other voice moves to its nearest target by a minimal-
  //       motion assignment; extra targets "appear", abandoned voices "release".
  //    4. Light register safety keeps voices in range and un-muddied WITHOUT
  //       ever moving a pinned common tone.
  //
  //  Returns { notes, bassMidi, mapping, rootPC, quality, mode } where mapping is
  //    { held:[{from,to}], moved:[{from,to}], appeared:[{to}], released:[{from}] }
  //  — exactly the held / new / released / arrow data compose mode needs.
  // ═══════════════════════════════════════════════════════════════════════════

  // Register windows (MIDI). Bass sits low and functional; uppers glide mid-range.
  const BASS_LO  = 36;   // C2
  const BASS_HI  = 52;   // E3
  const UPPER_LO = 52;   // E3
  const UPPER_HI = 84;   // C6
  const SEED_BASS = 43;  // G2 — anchor for the very first chord (no context)

  // MIDI with pitch class `pc` nearest to `ref`.
  function nearestOctave(pc, ref) {
    const m = pc + 12 * Math.round((ref - pc) / 12);   // has pc%12 === pc
    let best = m, bestD = Math.abs(m - ref);
    for (const cand of [m - 12, m + 12]) {
      const d = Math.abs(cand - ref);
      if (d < bestD) { best = cand; bestD = d; }
    }
    return best;
  }

  // Octave-shift `midi` until it lands inside [lo, hi] (windows are > 1 octave).
  function clampToWindow(midi, lo, hi) {
    while (midi < lo) midi += 12;
    while (midi > hi) midi -= 12;
    return midi;
  }

  // ── Upper-structure assignment ─────────────────────────────────────────────
  // prevUpper: previous upper voices (MIDI).  targetPCs: pitch classes to realize.
  // Pass 1 pins common tones (zero motion). Pass 2 does an exact minimal-motion
  // matching of the rest (n is tiny, so an exhaustive search is fine and obvious).
  function assignUpperVoices(prevUpper, targetPCs) {
    const held = [], moved = [], appeared = [], released = [];

    let targets = [...targetPCs];
    const sourcesLeft = [];

    // ── Pass 1: pin common tones — same pitch class → keep the exact MIDI ──
    for (const s of prevUpper) {
      const idx = targets.indexOf(s % 12);
      if (idx !== -1) {
        held.push({ from: s, to: s });   // zero motion
        targets.splice(idx, 1);          // consume one instance of that PC
      } else {
        sourcesLeft.push(s);
      }
    }

    // ── Pass 2: minimal-motion matching of remaining voices ──
    // Every remaining target MUST be realized (paired with a source, else it
    // "appears"). Appearance is only permitted once sources can no longer cover
    // the remaining targets — so smooth moves are never traded for appear+release.
    const best = matchTargets(sourcesLeft, targets);

    for (const p of best.pairs) {
      moved.push({ from: sourcesLeft[p.srcIdx], to: p.to });
    }
    best.appearedIdx.forEach(ti => appeared.push({ pc: targets[ti] }));
    sourcesLeft.forEach((s, i) => { if (!best.usedSrc.has(i)) released.push({ from: s }); });

    // ── Place appeared voices near the current centre, filling gaps ──
    const placed = [...held, ...moved].map(v => v.to);
    let centre = placed.length ? Math.round(placed.reduce((a, b) => a + b, 0) / placed.length) : 67;
    appeared.forEach(a => {
      a.to = nearestOctave(a.pc, centre);
      placed.push(a.to);
      centre = Math.round(placed.reduce((x, y) => x + y, 0) / placed.length);
    });

    return { held, moved, appeared: appeared.map(a => ({ to: a.to })), released };
  }

  // Exact minimal-motion matcher. Iterates over TARGETS (all must be realized);
  // each target pairs with a distinct source or appears. Returns the assignment
  // with least total motion. Branch-and-bound prunes; n ≤ ~6 so this is instant.
  function matchTargets(sources, targetPCs) {
    const n = sources.length, m = targetPCs.length;
    let best = null;

    function rec(ti, usedSrc, pairs, appearedIdx, cost) {
      if (best && cost >= best.cost) return;               // prune
      if (ti === m) {
        best = { cost, pairs: [...pairs], appearedIdx: [...appearedIdx], usedSrc: new Set(usedSrc) };
        return;
      }
      // (A) pair target ti with an unused source
      for (let sj = 0; sj < n; sj++) {
        if (usedSrc.has(sj)) continue;
        const to = nearestOctave(targetPCs[ti], sources[sj]);
        const c  = Math.abs(to - sources[sj]);
        usedSrc.add(sj);
        pairs.push({ srcIdx: sj, tgtIdx: ti, to });
        rec(ti + 1, usedSrc, pairs, appearedIdx, cost + c);
        pairs.pop();
        usedSrc.delete(sj);
      }
      // (B) let target ti "appear" — only when sources can't cover the rest
      const remainingTargets = m - ti;
      const remainingSources = n - usedSrc.size;
      if (remainingSources < remainingTargets) {
        appearedIdx.push(ti);
        rec(ti + 1, usedSrc, pairs, appearedIdx, cost);
        appearedIdx.pop();
      }
    }
    rec(0, new Set(), [], [], 0);
    return best || { pairs: [], appearedIdx: targetPCs.map((_, i) => i), usedSrc: new Set() };
  }

  // ── Light register safety (never touches a pinned/held voice) ──────────────
  // Keeps moved/appeared voices in range and lifts muddy low clusters. Held
  // voices came from the previous chord (already in range) and are left frozen,
  // preserving the zero-motion promise.
  function registerSafety(voices, bassMidi) {
    voices.forEach(v => {
      if (v.kind === 'held') return;
      v.to = clampToWindow(v.to, UPPER_LO, UPPER_HI);
    });

    // De-mud: two non-held voices within a whole step and low (below C4) — lift
    // the upper one an octave if it stays in range and doesn't collide.
    const nonHeld = voices.filter(v => v.kind !== 'held').sort((a, b) => a.to - b.to);
    for (let i = 0; i < nonHeld.length - 1; i++) {
      const lo = nonHeld[i], hi = nonHeld[i + 1];
      if (hi.to - lo.to <= 2 && lo.to < 60) {
        const lifted = hi.to + 12;
        const collides = voices.some(v => v !== hi && v.to === lifted);
        if (lifted <= UPPER_HI && !collides) hi.to = lifted;
      }
    }
  }

  // ── Public: context-aware voicing ──────────────────────────────────────────
  //  bassPcOverride (optional): force a specific bass pitch class — used for
  //  slash chords and descending line-clichés (e.g. Bbmaj7/A, Bb7/Ab).
  function voiceLead(prevNotes, rootPC, quality, mode, bassPcOverride) {
    mode = mode || 'closed';
    const { pcs } = collectNotes(quality, mode);   // intervals from root (0-11)

    // Seed case — no previous chord. Fall back to the register-anchored voice().
    if (!prevNotes || prevNotes.length === 0) {
      const notes = arrangeVoicing(rootPC, pcs, mode);
      return {
        notes,
        bassMidi: notes[0],
        mapping: { held: [], moved: [], appeared: notes.map(to => ({ to })), released: [] },
        rootPC, quality, mode,
      };
    }

    const targetPCs = [...new Set(pcs.map(iv => (rootPC + iv) % 12))];
    const rootless  = !pcs.includes(0);            // cluster mode omits the root

    // ── 1. Bass pitch class (functional, or overridden for a slash) ──
    let bassPC;
    if (bassPcOverride != null) {
      bassPC = ((bassPcOverride % 12) + 12) % 12;
    } else if (rootless) {
      const thirdPC = (rootPC + (pcs.includes(3) ? 3 : 4)) % 12;
      const fifthPC = (rootPC + 7) % 12;
      bassPC = targetPCs.includes(thirdPC) ? thirdPC
             : targetPCs.includes(fifthPC) ? fifthPC
             : targetPCs[0];
    } else {
      bassPC = rootPC;
    }

    // ── 2. Place the bass near the previous bass, clamped to the bass window ──
    const prevBass = Math.min(...prevNotes);
    const bassMidi = clampToWindow(nearestOctave(bassPC, prevBass), BASS_LO, BASS_HI);

    // ── 3. Voice-lead the upper structure ──
    const upperPCs = [...targetPCs];
    const bi = upperPCs.indexOf(bassPC);
    if (bi !== -1) upperPCs.splice(bi, 1);

    let prevUpper = prevNotes.filter(n => n > prevBass);
    if (prevUpper.length === 0) prevUpper = [...prevNotes];   // degenerate prev

    const asg = assignUpperVoices(prevUpper, upperPCs);

    // Carry voices as objects so register passes stay in sync with the mapping.
    const voices = [
      ...asg.held.map(v     => ({ from: v.from, to: v.to, kind: 'held'     })),
      ...asg.moved.map(v    => ({ from: v.from, to: v.to, kind: 'moved'    })),
      ...asg.appeared.map(v => ({ from: null,   to: v.to, kind: 'appeared' })),
    ];
    registerSafety(voices, bassMidi);

    // ── 4. Assemble output + mapping ──
    const upperNotes = voices.map(v => v.to);
    const notes = [bassMidi, ...upperNotes].sort((a, b) => a - b);

    const mapping = {
      held:     voices.filter(v => v.kind === 'held').map(v     => ({ from: v.from, to: v.to })),
      moved:    voices.filter(v => v.kind === 'moved').map(v    => ({ from: v.from, to: v.to })),
      appeared: voices.filter(v => v.kind === 'appeared').map(v => ({ to: v.to })),
      released: asg.released.map(v => ({ from: v.from })),
    };

    return { notes, bassMidi, mapping, rootPC, quality, mode };
  }

  // ── Public entry point ───────────────────────────────────────────────────

  // Returns MIDI notes for a chord in the requested voicing mode (no context).
  function voice(rootPC, quality, mode) {
    const { pcs } = collectNotes(quality, mode || 'closed');
    return arrangeVoicing(rootPC, pcs, mode || 'closed');
  }

  const api = { voice, voiceLead, collectNotes, nearestOctave };

  if (typeof window !== 'undefined') window.Voicing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})();
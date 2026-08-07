/**
 * Voice Me — voicing engine (beta)
 * One engine, three shared parts:
 *   voiceChord()     — a sonorous voicing of a chord at a given spice + fullness.
 *   voiceLeadFrom()  — the voice-led continuation of the previous voicing.
 *   narrate()        — the per-voice play-by-play.
 * Spice dial (0 basic / 1 colorful / 2 complex) widens which colours the engine
 * VOLUNTEERS — it never strips what the player actually played.
 */
(function () {
  const NM = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const nm = m => NM[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  // Each quality: core tones (always voiced — honours what was played) +
  // tiered extensions the dial may add (tier 1 = colorful, 2 = complex).
  const CHORD = {
    'maj':   { core: [[0,'root'],[4,'3rd'],[7,'5th']],           ext: [[11,'7th',1],[2,'9th',2]] },
    'min':   { core: [[0,'root'],[3,'3rd'],[7,'5th']],           ext: [[10,'7th',1],[2,'9th',2]] },
    'dim':   { core: [[0,'root'],[3,'3rd'],[6,'5th']],           ext: [] },
    'aug':   { core: [[0,'root'],[4,'3rd'],[8,'5th']],           ext: [] },
    '6':     { core: [[0,'root'],[4,'3rd'],[9,'6th'],[7,'5th']], ext: [[2,'9th',2]] },
    'm6':    { core: [[0,'root'],[3,'3rd'],[9,'6th'],[7,'5th']], ext: [[2,'9th',2]] },
    'maj7':  { core: [[0,'root'],[4,'3rd'],[11,'7th'],[7,'5th']],ext: [[2,'9th',1],[6,'♯11',2],[9,'13th',2]] },
    'm7':    { core: [[0,'root'],[3,'3rd'],[10,'7th'],[7,'5th']],ext: [[2,'9th',1],[5,'11th',2]] },
    '7':     { core: [[0,'root'],[4,'3rd'],[10,'7th'],[7,'5th']],ext: [[2,'9th',1],[9,'13th',2]] },
    'mMaj7': { core: [[0,'root'],[3,'3rd'],[11,'7th'],[7,'5th']],ext: [[2,'9th',1]] },
    'm7b5':  { core: [[0,'root'],[3,'3rd'],[6,'5th'],[10,'7th']],ext: [[5,'11th',2]] },
    'dim7':  { core: [[0,'root'],[3,'3rd'],[6,'5th'],[9,'7th']], ext: [] },
    '7sus4': { core: [[0,'root'],[5,'4th'],[10,'7th'],[7,'5th']],ext: [[2,'9th',1]] },
    // named-colour qualities carry their colour in core (already "played")
    'maj9':  { core: [[0,'root'],[4,'3rd'],[11,'7th'],[2,'9th'],[7,'5th']], ext: [[6,'♯11',2],[9,'13th',2]] },
    'm9':    { core: [[0,'root'],[3,'3rd'],[10,'7th'],[2,'9th'],[7,'5th']], ext: [[5,'11th',2]] },
    '9':     { core: [[0,'root'],[4,'3rd'],[10,'7th'],[2,'9th'],[7,'5th']], ext: [[9,'13th',2]] },
    '13':    { core: [[0,'root'],[4,'3rd'],[10,'7th'],[9,'13th'],[2,'9th']], ext: [] },
    '7alt':  { core: [[0,'root'],[4,'3rd'],[10,'7th'],[1,'♭9'],[8,'♭13']], ext: [[6,'♯11',2]] },
    '7b9':   { core: [[0,'root'],[4,'3rd'],[10,'7th'],[1,'♭9'],[7,'5th']], ext: [] },
    '7#9':   { core: [[0,'root'],[4,'3rd'],[10,'7th'],[3,'♯9'],[7,'5th']], ext: [] },
  };

  const above = (pc, floor) => { let m = ((pc % 12) + 12) % 12; while (m <= floor) m += 12; return m; };
  const nearestPC = (pc, ref) => { let m = pc + 12 * Math.round((ref - pc) / 12); let b = m, bd = Math.abs(m - ref);
    for (const c of [m - 12, m + 12]) if (Math.abs(c - ref) < bd) { b = c; bd = Math.abs(c - ref); } return b; };

  // pick the tone set for a chord at a spice level (core always; extensions up to tier)
  function toneSet(quality, spice) {
    const t = CHORD[quality] || CHORD['maj7'];
    const tones = t.core.map(([iv, role]) => ({ iv, role }));
    for (const [iv, role, tier] of t.ext) if (tier <= spice) tones.push({ iv, role });
    return tones;
  }

  // ── Generator: a good voicing (wide-low / close-high, honest doublings) ──
  function voiceChord(rootPC, quality, { voices = 5, bassMidi = 41, spice = 1 } = {}) {
    const tones = toneSet(quality, spice);
    const iv = {}; tones.forEach(t => { if (iv[t.role] == null) iv[t.role] = t.iv; });
    const rationale = [];

    let bass = ((rootPC % 12) + 12) % 12;
    while (bass < bassMidi - 6) bass += 12; while (bass > bassMidi + 6) bass -= 12;
    while (bass < 33) bass += 12; while (bass > 52) bass -= 12;
    const deep = bass < 48;

    // choose which tones (root + up to voices-1 more, colour-first, 5th droppable)
    const priority = tones.filter(t => t.role !== 'root' && t.role !== '5th')
                          .concat(tones.filter(t => t.role === '5th'));
    const chosen = priority.slice(0, Math.max(voices - 1, 0));

    const floor = Math.max(bass + 9, 55);
    const upper = chosen.map(t => ({ pc: (rootPC + t.iv) % 12, role: t.role })).sort((a, b) => a.pc - b.pc);
    let cursor = floor; const out = [{ midi: bass, role: 'root' }];
    for (const u of upper) { const m = above(u.pc, cursor); out.push({ midi: m, role: u.role }); cursor = m; }
    if (deep) rationale.push('root low, wide gap to the upper voices — clear, not muddy');

    // doublings for fullness — root & 5th across octaves; 3rd once as a colour "10th"
    const has = m => out.some(n => n.midi === m);
    if (iv['3rd'] != null && out.length < voices) {
      const bottomUpper = Math.min(...out.filter(n => n.midi > bass).map(n => n.midi));
      if (bottomUpper - bass >= 14) { const tenth = above((rootPC + iv['3rd']) % 12, bass + 9);
        if (tenth < bottomUpper && !has(tenth)) { out.push({ midi: tenth, role: '3rd' }); rationale.push('the 3rd sits a 10th above the root — rich and clear'); } }
    }
    const stable = iv['5th'] != null ? ['root', '5th'] : ['root']; let si = 0;
    while (out.length < voices && si < 24) {
      const role = stable[si % stable.length]; si++;
      const pc = (rootPC + iv[role]) % 12; let placed = null;
      for (let m = above(pc, bass); m <= 84; m += 12) if (!has(m)) { placed = m; break; }
      if (placed == null) continue;
      out.push({ midi: placed, role }); rationale.push(role === 'root' ? 'doubling the root adds stability' : 'doubling the 5th fills it out');
    }
    while (out.length < voices) { const top = out.reduce((a, b) => b.midi > a.midi ? b : a);
      const m = above((rootPC + iv['3rd']) % 12, top.midi); if (m > 88) break; out.push({ midi: m, role: '3rd' }); }

    const s = out.sort((a, b) => a.midi - b.midi);
    return { notes: s.map(n => n.midi), roles: s.map(n => n.role), rationale };
  }

  // ── Voice leading: smoothest connection that stays clean ──
  function perms(a) { if (a.length <= 1) return [a]; const r = [];
    a.forEach((x, i) => { for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) r.push([x, ...p]); }); return r; }
  function spacingPenalty(notes) { const s = [...notes].sort((a, b) => a - b); let p = 0;
    for (let i = 1; i < s.length; i++) { const lo = s[i - 1], d = s[i] - s[i - 1];
      if (lo < 44 && d < 7) p += 100; else if (lo < 52 && d < 3) p += 80; } return p; }
  function assign(src, tgtPCs, bass) { let best = null, bc = 1e9;
    for (const p of perms(tgtPCs.map((_, i) => i))) { let motion = 0, mid = [], pr = [];
      for (let i = 0; i < src.length; i++) { const to = nearestPC(tgtPCs[p[i]], src[i]); motion += Math.abs(to - src[i]); mid.push(to); pr.push({ from: src[i], to }); }
      const c = motion + spacingPenalty([bass, ...mid]); if (c < bc) { bc = c; best = { midis: mid, pairs: pr }; } }
    return best; }
  function muddy(notes) { const s = [...notes].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) if (s[i - 1] < 48 && s[i] - s[i - 1] < 5) return true; return false; }

  function voiceLeadFrom(prevNotes, rootPC, quality, spice = 1, bassPcOverride = null) {
    const N = prevNotes.length, s = [...prevNotes].sort((a, b) => a - b), prevBass = s[0], prevUpper = s.slice(1);
    const gen = voiceChord(rootPC, quality, { voices: N, bassMidi: prevBass, spice });
    const tPCs = gen.notes.map(m => ((m % 12) + 12) % 12);
    const bassPc = (((bassPcOverride != null ? bassPcOverride : rootPC) % 12) + 12) % 12;
    let bass = nearestPC(bassPc, prevBass); while (bass > 52) bass -= 12; while (bass < 40) bass += 12;
    const up = [...tPCs]; const bi = up.indexOf(bassPc); if (bi >= 0) up.splice(bi, 1);  // slash: bass tone leaves the upper structure
    const a = assign(prevUpper, up, bass);
    a.midis = a.midis.map(m => { while (m <= bass) m += 12; return m; });
    a.pairs = a.pairs.map((p, i) => ({ from: p.from, to: a.midis[i] }));
    const notes = [bass, ...a.midis].sort((x, y) => x - y);
    if (muddy(notes)) return { notes: gen.notes, fallback: true, mapping: [{ from: prevBass, to: gen.notes[0] }] };
    return { notes, fallback: false, mapping: [{ from: prevBass, to: bass }, ...a.pairs] };
  }

  // ── Narration ──
  function func(pc, root, quality) { const i = ((pc - root) % 12 + 12) % 12; const minor = /^m/.test(quality) && !/^maj/.test(quality);
    return { 0:'root',1:'♭9',2:'9',3:minor?'3rd':'♯9',4:'3rd',5:minor?'11':'4th',6:'♯11',7:'5th',8:'♭13',9:quality==='6'?'6th':'13',10:'♭7',11:'maj7' }[i]; }
  const STEP = { 1:'a half-step', 2:'a whole-step', 3:'a minor 3rd', 4:'a major 3rd', 5:'a 4th', 7:'a 5th' };
  function narrate(mapping, sr, sq, tr, tq) { return mapping.map(m => { const sf = func(m.from % 12, sr, sq), tf = func(m.to % 12, tr, tq), d = m.to - m.from;
    return d === 0 ? `the ${sf} holds${sf !== tf ? `, becoming the ${tf}` : ''}` : `the ${sf} ${d < 0 ? 'falls' : 'rises'} ${STEP[Math.abs(d)] || Math.abs(d) + ' semitones'} to the ${tf}`; }); }

  const api = { voiceChord, voiceLeadFrom, narrate, toneSet, nm };
  if (typeof window !== 'undefined') window.VoiceEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

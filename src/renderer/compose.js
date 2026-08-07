/**
 * compose.js
 * Voice Me — "Compose with me" mode (redesigned)
 *
 * The tree is a natural wheat stalk aesthetic:
 *   • Root chord at bottom-center (chord name floats as text, no bubble)
 *   • Curved stems arc upward from the root — hand-drawn feel
 *   • Chord suggestions float as text at each stem's tip
 *   • Whole stalk sways gently, tips bob with "weight" of chord names
 *
 * On correct play:
 *   • Chord name at tip dissolves into a leaf
 *   • Leaf falls, tumbling and folding in space
 *   • Leaf slowly dissolves during fall
 *   • Chosen chord slides down to become the new root
 *   • New branches generate with fresh suggestions
 *   • Committed chord appears in the horizontal ledger under the piano
 */

// ── State ──────────────────────────────────────────────────────────────────

const compose = {
  active:        false,
  currentChord:  null,   // { rootPC, quality, notes, name }
  branches:      [],     // current 5 branch objects
  trail:         [],     // committed chords in order
  awaitingPlay:  false,
  pendingChord:  null,
  key:           null,   // inferred { tonicPc, mode } from the trail
  prevHeld:      new Set(),  // notes held on the previous event — to tell attack from release
  spice:         1,          // 0 basic · 1 colorful · 2 complex (the harmonic-richness dial)
};

// ── Branch slots ────────────────────────────────────────────────────────────
// Fan order left→right. Home grows tallest (centre); the adventurous Slide/Far
// sit on the outer edges, the diatonic-colour Shadow/Lift flank the centre.

const BRANCH_SLOTS = [
  { id: 'far',    label: 'Far'    },
  { id: 'shadow', label: 'Shadow' },
  { id: 'home',   label: 'Home'   },
  { id: 'lift',   label: 'Lift'   },
  { id: 'slide',  label: 'Slide'  },
];

// ── Chord suggestion — delegated to the suggestion engine (suggest.js) ───────
// The engine scores functional + transformational candidates by voice-leading
// smoothness, idiomatic tendency-tone resolutions, and harmonic pull, then
// returns one voice-led chord per slot (each with its held/moved/new/lift map).

function generateBranches(chord) {
  if (!window.Suggest) return [];
  const prevNotes = chord.notes || [];
  const result = window.Suggest.branchesFor(
    prevNotes, chord.rootPC, chord.quality, compose.trail.slice(0, -1), compose.spice
  );
  compose.key = result.key;

  const bySlot = {};
  result.branches.forEach(b => { bySlot[b.slot] = b; });

  const branches = [];
  BRANCH_SLOTS.forEach(slotDef => {
    const s = bySlot[slotDef.id];
    if (!s) return;
    branches.push({
      id:    slotDef.id,
      label: slotDef.label,
      chord: {
        rootPC:  s.rootPC,
        quality: s.quality,
        bassPc:  s.bassPc,
        notes:   s.notes,
        mapping: s.mapping,
        reason:  s.reason,
        name:    composeBranchName(s),
      },
    });
  });
  return branches;
}

function composeBranchName(s) {
  let name = composeChordName(s.rootPC, s.quality);
  if (s.bassPc != null && s.bassPc !== s.rootPC) {
    const useSharp = Piano.SHARP_ROOT_PCS.has(s.bassPc);
    name += '/' + Piano.getNoteName(s.bassPc, useSharp);
  }
  return name;
}

function composeChordName(rootPC, quality) {
  const useSharp = Piano.SHARP_ROOT_PCS.has(rootPC);
  const root     = Piano.getNoteName(rootPC, useSharp);
  return Piano.musicalGlyphs(root + quality);
}

// ── Chord detection from held MIDI ─────────────────────────────────────────
// Delegates to app.js's recognizer (fifth-optional, best-match, extension-aware)
// and maps its quality suffix → the canonical tokens suggest.js & voicing.js use.

const QUALITY_MAP = {
  '':'maj7', 'm':'m7', 'dim':'dim7', 'aug':'maj7', 'sus2':'7sus4', 'sus4':'7sus4',
  '6':'maj7', 'm6':'m7', '6/9':'maj9', 'm6/9':'m9', 'add9':'maj7', 'madd9':'m7',
  'maj7':'maj7', 'm7':'m7', '7':'7', 'mM7':'mMaj7', 'dim7':'dim7', 'm7b5':'m7b5',
  'aug7':'7alt', '7sus4':'7sus4', '9sus4':'7sus4',
  '7b9':'7b9', '7#9':'7#9', '7b5':'7alt', '9b5':'7alt', '9#5':'7alt',
  '7b5b9':'7alt', '7b5#9':'7alt', '7#5b9':'7alt', '7#5#9':'7alt',
  '7#11':'9', '7b9#11':'7alt', '7#9#11':'7alt',
  'maj9':'maj9', 'm9':'m9', '9':'9', 'mM9':'mMaj7',
  '11':'9', 'm11':'m9', 'maj11':'maj9', 'maj7#11':'maj9', 'maj9#11':'maj9',
  '13':'13', '9(13)':'13', '7b9(13)':'7b9(13)', '7#9(13)':'7#9(13)',
  '7b9(b13)':'7b9(b13)', '7#9(b13)':'7#9(b13)', '9(b13)':'7alt',
  'm13':'m9', 'maj13':'maj9',
};

function detectComposedChord(heldMidi) {
  if (!heldMidi || heldMidi.length < 2) return null;
  const id = window.VoiceMe?.identifyChord(heldMidi);
  if (!id) return null;

  let quality = QUALITY_MAP[id.suffix];
  if (!quality) {
    // Fallback from interval content when a suffix isn't mapped
    const iv = new Set(id.notes.map(n => ((n - id.rootPC) % 12 + 12) % 12));
    quality = iv.has(3) ? 'm7' : (iv.has(10) ? '7' : 'maj7');
  }
  return { rootPC: id.rootPC, quality, notes: id.notes, bassPC: id.bassPC };
}

// ── Tree geometry ──────────────────────────────────────────────────────────

const TREE_W = 680;
const TREE_H = 470;
const ROOT_X = 155;              // fixed vertex, left-of-centre so the tree leans right
const ROOT_Y = TREE_H - 44;

// ── Renders the tree ───────────────────────────────────────────────────────

function renderTree() {
  const container = document.getElementById('compose-tree');
  if (!container) return;
  container.innerHTML = '';

  if (!compose.currentChord) {
    container.innerHTML = `
      <div class="compose-empty">
        <div class="compose-empty-icon">✻</div>
        <div class="compose-empty-text">Play a chord to grow the tree</div>
      </div>
    `;
    return;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '80 6 515 482');   // hugs the content, room for larger labels
  svg.setAttribute('class',   'compose-tree-svg');
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');   // hug the left of the column

  // Draw each branch (stalk + tip chord)
  compose.branches.forEach((branch, i) => drawStalk(svg, branch, i));

  // Draw root chord name (no bubble, just typography)
  drawRootChord(svg, compose.currentChord);

  container.appendChild(svg);
  bindBranchInteraction();
}

function drawStalk(svg, branch, index) {
  const NS    = 'http://www.w3.org/2000/svg';
  const total = compose.branches.length;

  // ── Cascade geometry ──
  // All stalks share the fixed root vertex, rise as one trunk, then hook over to
  // the right at descending heights so the tips hang, nested, down the right side.
  const topTipY = 58;
  const tipGap  = (TREE_H - 130) / Math.max(total, 1);
  const tipY    = topTipY + index * tipGap;
  const tipX    = ROOT_X + (300 - index * 18);      // top reaches furthest right

  const peakY = tipY - 34;                            // dome bulges above the tip → it hangs
  const peakX = ROOT_X + (tipX - ROOT_X) * 0.44;

  const c1x = ROOT_X + 5;                             // near-vertical trunk rise (shared base)
  const c1y = ROOT_Y - (ROOT_Y - peakY) * 0.97;
  const c2x = peakX;                                  // crest, then hook down into the tip
  const c2y = peakY;

  const branchG = document.createElementNS(NS, 'g');
  branchG.setAttribute('class', 'branch-group');
  branchG.setAttribute('data-branch-id', branch.id);

  // ── Stalk path — grows in (no idle sway) ──
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', `M ${ROOT_X},${ROOT_Y} C ${c1x},${c1y} ${c2x},${c2y} ${tipX},${tipY}`);
  path.setAttribute('stroke',         'var(--text-primary)');
  path.setAttribute('stroke-width',   '1.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('fill',           'none');
  path.setAttribute('opacity',        '0');
  path.setAttribute('class',          'stalk-path');
  path.style.strokeDasharray  = '560';
  path.style.strokeDashoffset = '560';
  setTimeout(() => {
    path.style.transition       = 'stroke-dashoffset 1.0s cubic-bezier(0.22,0.7,0.35,1), opacity 0.4s';
    path.style.strokeDashoffset = '0';
    path.style.opacity          = '0.78';
  }, index * 110 + 80);
  branchG.appendChild(path);

  // ── Tip — chord name + slot label hanging to the right of the tip ──
  const tipG = document.createElementNS(NS, 'g');
  tipG.setAttribute('class', 'branch-tip');
  tipG.setAttribute('data-branch-id', branch.id);
  tipG.style.cursor = 'pointer';

  if (branch.chord.reason) {
    const title = document.createElementNS(NS, 'title');
    title.textContent = branch.chord.reason;
    tipG.appendChild(title);
  }

  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', tipX);
  dot.setAttribute('cy', tipY);
  dot.setAttribute('r',  '2');
  dot.setAttribute('fill', 'var(--text-primary)');
  dot.setAttribute('opacity', '0.7');
  tipG.appendChild(dot);

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x',           tipX + 13);
  text.setAttribute('y',           tipY + 4);
  text.setAttribute('text-anchor', 'start');
  text.setAttribute('font-size',   '17');
  text.setAttribute('font-family', 'Georgia, serif');
  text.setAttribute('font-style',  'italic');
  text.setAttribute('fill',        'var(--text-primary)');
  text.setAttribute('class',       'branch-chord-text');
  text.textContent = branch.chord.name;
  tipG.appendChild(text);

  const label = document.createElementNS(NS, 'text');
  label.setAttribute('x',           tipX + 13);
  label.setAttribute('y',           tipY + 21);
  label.setAttribute('text-anchor', 'start');
  label.setAttribute('font-size',   '10.5');
  label.setAttribute('font-family', 'SF Mono, monospace');
  label.setAttribute('letter-spacing', '0.08em');
  label.setAttribute('fill',        'var(--text-muted)');
  label.setAttribute('opacity',     '0.6');
  label.setAttribute('class',       'branch-label-text');
  label.textContent = branch.label;
  tipG.appendChild(label);

  // Settle: the label fades in, its weight bounces the tip, then it comes to rest.
  tipG.style.animation = `tip-settle 0.9s cubic-bezier(0.3,0.9,0.4,1) ${index * 110 + 860}ms both`;

  branchG.appendChild(tipG);
  svg.appendChild(branchG);
}

function drawRootChord(svg, chord) {
  const NS = 'http://www.w3.org/2000/svg';

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x',           ROOT_X);
  text.setAttribute('y',           ROOT_Y + 21);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size',   '20');
  text.setAttribute('font-family', 'Georgia, serif');
  text.setAttribute('font-style',  'italic');
  text.setAttribute('font-weight', '600');
  text.setAttribute('fill',        'var(--text-primary)');
  text.setAttribute('class',       'root-chord-text');
  text.textContent = chord.name;
  svg.appendChild(text);

  // Subtle inferred-key subtitle — "in Bb major" — the tonal home of the tree
  if (compose.key) {
    const NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    const keyLabel = document.createElementNS(NS, 'text');
    keyLabel.setAttribute('x',           ROOT_X);
    keyLabel.setAttribute('y',           ROOT_Y + 41);
    keyLabel.setAttribute('text-anchor', 'middle');
    keyLabel.setAttribute('font-size',   '10');
    keyLabel.setAttribute('font-family', 'SF Mono, monospace');
    keyLabel.setAttribute('letter-spacing', '0.1em');
    keyLabel.setAttribute('fill',        'var(--text-muted)');
    keyLabel.setAttribute('opacity',     '0.55');
    keyLabel.textContent = `in ${NAMES[compose.key.tonicPc]} ${compose.key.mode}`;
    svg.appendChild(keyLabel);
  }
}

// ── Branch interaction ────────────────────────────────────────────────────

function bindBranchInteraction() {
  document.querySelectorAll('.branch-tip').forEach(tip => {
    const branchId = tip.getAttribute('data-branch-id');
    const branch   = compose.branches.find(b => b.id === branchId);
    if (!branch) return;

    tip.addEventListener('mouseenter', () => {
      window.VoiceMe?.setSuggestionKeys(branch.chord.notes);
      tip.classList.add('hovered');
    });

    tip.addEventListener('mouseleave', () => {
      if (!compose.awaitingPlay) {
        window.VoiceMe?.clearSuggestionKeys();
      }
      tip.classList.remove('hovered');
    });

    tip.addEventListener('click', () => selectBranch(branch));
  });
}

function selectBranch(branch) {
  compose.awaitingPlay = true;
  compose.pendingChord = branch.chord;

  // Light the keys straight from the voice-leading map:
  //   held  = common tones to keep down (blue)
  //   moved = a voice glides from → to (its source lifts, its target presses, arrow)
  //   new   = appeared voices to press (gold)   lift = released voices to raise (grey)
  const m = branch.chord.mapping || { held: [], moved: [], appeared: [], released: [] };
  const heldKeys  = m.held.map(v => v.to);
  const pressKeys = [...m.appeared.map(v => v.to),   ...m.moved.map(v => v.to)];
  const liftKeys  = [...m.released.map(v => v.from), ...m.moved.map(v => v.from)];
  const movedFrom = m.moved.map(v => v.from);
  const movedTo   = m.moved.map(v => v.to);

  window.VoiceMe?.clearReleasedKeys();
  window.VoiceMe?.clearHeldKeys();
  window.VoiceMe?.setSuggestionKeys(pressKeys);
  window.VoiceMe?.setHeldKeys(heldKeys);
  window.VoiceMe?.setReleasedKeys(liftKeys);
  window.VoiceMe?.showArrows(movedFrom, movedTo);

  // Highlight pending branch tip
  document.querySelectorAll('.branch-tip').forEach(t => t.classList.remove('pending'));
  const pendingTip = document.querySelector(`.branch-tip[data-branch-id="${branch.id}"]`);
  if (pendingTip) pendingTip.classList.add('pending');

  updateStatus(`Play ${branch.chord.name}`);
}

// ── Match detection ───────────────────────────────────────────────────────

function checkComposeMatch(heldMidi) {
  if (!compose.active) return;

  const held = new Set(heldMidi);

  // ── Commit path: waiting for the user to play a chosen suggestion ──
  if (compose.awaitingPlay && compose.pendingChord) {
    const target = new Set(compose.pendingChord.notes);
    if (held.size === target.size && [...target].every(n => held.has(n))) {
      commitPending();
    }
    compose.prevHeld = held;
    return;
  }

  // ── Seed path: only re-detect on an ATTACK (a newly-pressed note) ──
  // Releasing keys (removals only) must never rebuild the tree — otherwise the
  // suggestions vanish the instant the player lifts their hands to choose one.
  const attack = [...held].some(n => !compose.prevHeld.has(n));
  compose.prevHeld = held;
  if (!attack) return;

  const detected = detectComposedChord(heldMidi);
  if (!detected) return;

  const changed = !compose.currentChord ||
                  detected.rootPC   !== compose.currentChord.rootPC ||
                  detected.quality  !== compose.currentChord.quality;

  if (changed) {
    setTrailTip(detected);      // free-play sets/edits the current chord in the song
    setCurrentChord(detected);
  }
}

function setCurrentChord(chord) {
  compose.currentChord = {
    ...chord,
    name: chord.name || composeChordName(chord.rootPC, chord.quality),
  };
  compose.branches = generateBranches(compose.currentChord);
  renderTree();
  renderComposition();
  updateStatus(compose.currentChord.name);
}

// The song is compose.trail = [seed, ...committed]; currentChord === trail[last].
// Free-play sets/edits the current tip; commit appends; backspace pops.
function setTrailTip(chord) {
  const c = { rootPC: chord.rootPC, quality: chord.quality, notes: chord.notes,
              name: chord.name || composeChordName(chord.rootPC, chord.quality) };
  if (compose.trail.length === 0) compose.trail.push(c);
  else compose.trail[compose.trail.length - 1] = c;
}

function renderComposition() {
  renderTrail();                                   // the chord-name ledger (full song)
  const STAFF_WINDOW = 4;                           // staff shows the recent tail, not the whole song
  if (compose.trail.length === 0) {
    window.VoiceMeNotation?.showComposition?.([], 0);
  } else {
    const shown = compose.trail.slice(-STAFF_WINDOW);
    window.VoiceMeNotation?.showComposition?.(shown, shown.length - 1);
  }
}

// ── Backspace: pop the last chord, rewind the tree to its previous state ──
function backspaceCompose() {
  if (!compose.active || compose.trail.length === 0) return;
  compose.trail.pop();
  compose.awaitingPlay = false;
  compose.pendingChord = null;
  window.VoiceMe?.clearArrows();
  window.VoiceMe?.clearHeldKeys();
  window.VoiceMe?.clearReleasedKeys();
  window.VoiceMe?.clearSuggestionKeys();

  if (compose.trail.length > 0) {
    setCurrentChord(compose.trail[compose.trail.length - 1]);   // tree re-derives → identical rewind
  } else {
    compose.currentChord = null;
    compose.branches = [];
    renderTree();
    renderComposition();
    updateStatus('Play a chord to grow the tree');
  }
}

function commitPending() {
  const committed = compose.pendingChord;

  compose.trail.push(committed);
  compose.awaitingPlay = false;
  compose.pendingChord = null;
  renderComposition();                 // new chord lands on the ledger + staff at once

  window.VoiceMe?.flashGreen(committed.notes);
  window.VoiceMe?.clearArrows();
  window.VoiceMe?.clearHeldKeys();
  window.VoiceMe?.clearReleasedKeys();
  window.VoiceMe?.clearSuggestionKeys();

  playChimeSound();
  floatChime();

  // Trigger leaf fall animation on the played branch's tip
  const playedBranch = compose.branches.find(b =>
    JSON.stringify([...b.chord.notes].sort()) === JSON.stringify([...committed.notes].sort())
  );
  if (playedBranch) triggerLeafFall(playedBranch);

  // After the animation, regenerate tree from new current chord
  setTimeout(() => {
    setCurrentChord(committed);
  }, 1400);
}

// ── Leaf fall animation ───────────────────────────────────────────────────

function triggerLeafFall(branch) {
  const tip = document.querySelector(`.branch-tip[data-branch-id="${branch.id}"]`);
  if (!tip) return;

  // Fade the chord letters out
  const chordText = tip.querySelector('.branch-chord-text');
  const labelText = tip.querySelector('.branch-label-text');

  if (chordText) {
    chordText.animate([
      { opacity: 1 },
      { opacity: 0 },
    ], { duration: 400, fill: 'forwards' });
  }
  if (labelText) {
    labelText.animate([
      { opacity: 0.6 },
      { opacity: 0 },
    ], { duration: 400, fill: 'forwards' });
  }

  // Get the tip's position for leaf drop
  const svg = document.querySelector('.compose-tree-svg');
  if (!svg || !chordText) return;
  const NS = 'http://www.w3.org/2000/svg';

  const x = parseFloat(chordText.getAttribute('x'));
  const y = parseFloat(chordText.getAttribute('y'));

  // Small sparkle burst
  const sparkle = document.createElementNS(NS, 'g');
  sparkle.setAttribute('transform', `translate(${x}, ${y})`);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', Math.cos(angle) * 10);
    line.setAttribute('y2', Math.sin(angle) * 10);
    line.setAttribute('stroke', 'var(--text-primary)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', 0);
    sparkle.appendChild(line);
  }
  svg.appendChild(sparkle);
  sparkle.animate([
    { opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.4)` },
    { opacity: 0.9, transform: `translate(${x}px, ${y}px) scale(1.2)`, offset: 0.3 },
    { opacity: 0, transform: `translate(${x}px, ${y}px) scale(1.6)` },
  ], { duration: 500 });
  setTimeout(() => sparkle.remove(), 550);

  // Leaf appears and falls
  setTimeout(() => {
    const leaf = document.createElementNS(NS, 'g');
    leaf.setAttribute('class', 'compose-leaf');

    // Leaf shape — a simple sketch-style leaf (a pointed oval)
    const leafShape = document.createElementNS(NS, 'path');
    leafShape.setAttribute('d', 'M 0 -6 Q 6 0 0 6 Q -6 0 0 -6 Z');
    leafShape.setAttribute('fill', 'var(--text-primary)');
    leafShape.setAttribute('opacity', '0.8');
    leaf.appendChild(leafShape);

    // Center vein
    const vein = document.createElementNS(NS, 'line');
    vein.setAttribute('x1', 0);
    vein.setAttribute('y1', -6);
    vein.setAttribute('x2', 0);
    vein.setAttribute('y2', 6);
    vein.setAttribute('stroke', 'var(--card-bg)');
    vein.setAttribute('stroke-width', '0.5');
    leaf.appendChild(vein);

    leaf.setAttribute('transform', `translate(${x}, ${y})`);
    svg.appendChild(leaf);

    // Random horizontal drift + rotation for paper-tumble feel
    const driftX = (Math.random() - 0.5) * 60;
    const fallY  = TREE_H - y + 40;

    leaf.animate([
      { transform: `translate(${x}px, ${y}px) rotate3d(1, 0.5, 0.2, 0deg)`,   opacity: 0.8 },
      { transform: `translate(${x + driftX * 0.4}px, ${y + fallY * 0.35}px) rotate3d(1, 0.5, 0.2, 180deg)`, opacity: 0.75, offset: 0.35 },
      { transform: `translate(${x + driftX * 0.7}px, ${y + fallY * 0.65}px) rotate3d(0.6, 1, 0.4, 340deg)`, opacity: 0.55, offset: 0.65 },
      { transform: `translate(${x + driftX}px, ${y + fallY}px) rotate3d(0.5, 1, 0.5, 540deg)`, opacity: 0 },
    ], {
      duration: 1000,
      easing:   'cubic-bezier(0.3, 0.1, 0.55, 1)',
      fill:     'forwards',
    });

    setTimeout(() => leaf.remove(), 1050);
  }, 300);
}

// ── Trail (committed chords ledger) ────────────────────────────────────────

function renderTrail() {
  const el = document.getElementById('compose-trail');
  if (!el) return;

  if (compose.trail.length === 0) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = compose.trail.map((c, i) => `
    <span class="trail-chord" data-idx="${i}">${c.name}</span>
    ${i < compose.trail.length - 1 ? '<span class="trail-arrow">·</span>' : ''}
  `).join('');
}

// ── Status line ───────────────────────────────────────────────────────────

function updateStatus(text) {
  const el = document.getElementById('compose-status');
  if (el) el.textContent = text || '';
}

// ── Chime + checkmark (borrowed from panel.js) ─────────────────────────────

function playChimeSound() {
  if (window.PanelChime) window.PanelChime();
}
function floatChime() {
  if (window.PanelCheck) window.PanelCheck();
}

// ── Spice dial — harmonic richness of the voicings & suggestions ──────────

function initSpiceDial() {
  const container = document.getElementById('spice-dial');
  if (!container) return;

  const stops = [
    { v: 0, label: 'Basic',    title: 'Triads — no added 7ths unless you play them' },
    { v: 1, label: 'Colorful', title: '7ths, 9ths and sus — the jazz staples' },
    { v: 2, label: 'Complex',  title: 'Altered dominants and 13th voicings' },
  ];

  container.innerHTML = stops.map(s => `
    <button class="spice-btn ${s.v === compose.spice ? 'active' : ''}" data-spice="${s.v}" title="${s.title}">
      ${s.label}
    </button>
  `).join('');

  container.querySelectorAll('.spice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      compose.spice = parseInt(btn.dataset.spice, 10);
      container.querySelectorAll('.spice-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Re-voice the tree's suggestions at the new spice level
      if (compose.currentChord) {
        compose.branches = generateBranches(compose.currentChord);
        renderTree();
      }
    });
  });
}

// ── Activation ────────────────────────────────────────────────────────────

function activateCompose() {
  compose.active = true;
  compose.prevHeld = new Set();
  document.body.classList.add('compose-mode');

  const panel = document.getElementById('voicing-panel');
  if (panel?.classList.contains('open')) {
    document.getElementById('panel-tab')?.click();
  }

  if (window.VoiceMePanel?.exitProgression) {
    window.VoiceMePanel.exitProgression();
  }

  initSpiceDial();
  updateComposeBtn();
  updateStatus('Play a chord to grow the tree');
  renderTree();
  renderTrail();
}

function deactivateCompose() {
  compose.active       = false;
  compose.currentChord = null;
  compose.branches     = [];
  compose.trail        = [];
  compose.awaitingPlay = false;
  compose.pendingChord = null;
  compose.prevHeld     = new Set();

  document.body.classList.remove('compose-mode');

  window.VoiceMe?.clearSuggestionKeys();
  window.VoiceMe?.clearHeldKeys();
  window.VoiceMe?.clearReleasedKeys();
  window.VoiceMe?.clearArrows();
  window.VoiceMeNotation?.returnToLive?.();     // clear the composition staff

  updateComposeBtn();
  const tree  = document.getElementById('compose-tree');
  const trail = document.getElementById('compose-trail');
  if (tree)  tree.innerHTML  = '';
  if (trail) trail.innerHTML = '';
  updateStatus('');
}

function toggleCompose() {
  if (compose.active) deactivateCompose();
  else                 activateCompose();
}

function updateComposeBtn() {
  const btn = document.getElementById('compose-btn');
  if (!btn) return;
  btn.classList.toggle('active', compose.active);
  btn.textContent = compose.active ? '✕ Exit Compose' : '✎ Compose with me';
}

// ── Button wiring ─────────────────────────────────────────────────────────

document.getElementById('compose-btn')?.addEventListener('click', toggleCompose);
document.getElementById('compose-backspace')?.addEventListener('click', backspaceCompose);

// Backspace key removes the last chord (when not typing in a field)
document.addEventListener('keydown', (e) => {
  if (!compose.active) return;
  if (e.key === 'Backspace') {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    backspaceCompose();
  }
});

// ── Export ────────────────────────────────────────────────────────────────

window.Compose = {
  checkMatch: checkComposeMatch,
  isActive:   () => compose.active,
  activate:   activateCompose,
  deactivate: deactivateCompose,
};

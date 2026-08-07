/**
 * compose.js
 * "Compose with me" — the chord tree.
 *
 * Each branch is a harmonic DEVICE, not a single chord: a named move with its
 * roman-numeral motion and, usually, more than one chord. `A7/C♯ → Dm7` is one
 * branch, because the lesson is the bass climb C–C♯–D and `A7/C♯` on its own
 * does not teach it. The tree walks you through the whole device chord by
 * chord, then plants the device's LAST chord as the new root — so the sequence
 * you just learned becomes the ground you build from.
 *
 * Talks to the piano through two calls: `cueFor(from, to)` says what the hands
 * should do, `showArrows(moved)` says which voice went where. It no longer
 * issues six ordered lighting commands and hopes they land in the right order.
 */

// ── State ──────────────────────────────────────────────────────────────────

const compose = {
  active:       false,
  currentChord: null,   // { rootPC, quality, notes, name }
  branches:     [],
  trail:        [],     // committed chords, each tagged with the device it came from
  pending:      null,   // { branch, step } while walking a device
  key:          null,
  prevHeld:     new Set(),
  spice:        1,      // 0 basic · 1 colourful · 2 complex — WHICH notes
  shape:        'closed', // minimal · closed · open · cluster — HOW they spread
  groupSeq:     0,      // increments per committed device, so Backspace can pop one whole
};

// ── Suggestions ────────────────────────────────────────────────────────────

function generateBranches(chord) {
  if (!window.Harmony) return [];
  const result = Harmony.suggest(
    chord.notes || [], chord.rootPC, chord.quality,
    compose.trail.slice(0, -1), compose.spice, compose.shape
  );
  compose.key = result.key;
  return result.branches;
}

function chordNameOf(rootPC, quality, bassPc) {
  return Harmony.chordName(rootPC, quality, bassPc);
}

// ── Reading what the player played ─────────────────────────────────────────

function detectComposedChord(heldMidi) {
  const id = Harmony.identify(heldMidi);
  if (!id) return null;
  // `voiceAs` is the canonical quality the engine can voice — the recogniser
  // names finer distinctions than the voicer needs, and the vocabulary carries
  // that correspondence itself now.
  return { rootPC: id.rootPC, quality: id.voiceAs, notes: id.notes, bassPC: id.bassPC };
}

// ── Tree geometry ──────────────────────────────────────────────────────────

const TREE_H = 470;
const ROOT_X = 155;
const ROOT_Y = TREE_H - 44;

function renderTree() {
  const container = document.getElementById('compose-tree');
  if (!container) return;
  container.innerHTML = '';

  if (!compose.currentChord) {
    container.innerHTML = `
      <div class="compose-empty">
        <div class="compose-empty-icon">✻</div>
        <div class="compose-empty-text">Play a chord to grow the tree</div>
      </div>`;
    return;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '80 0 560 490');
  svg.setAttribute('class',   'compose-tree-svg');
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');

  compose.branches.forEach((branch, i) => drawStalk(svg, branch, i));
  drawRootChord(svg, compose.currentChord);

  container.appendChild(svg);
  bindBranchInteraction();
}

function drawStalk(svg, branch, index) {
  const NS    = 'http://www.w3.org/2000/svg';
  const total = compose.branches.length;

  const topTipY = 52;
  const tipGap  = (TREE_H - 120) / Math.max(total, 1);
  const tipY    = topTipY + index * tipGap;
  const tipX    = ROOT_X + (300 - index * 18);

  const peakY = tipY - 34;
  const peakX = ROOT_X + (tipX - ROOT_X) * 0.44;

  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'branch-group');
  g.setAttribute('data-branch-id', branch.slot);

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', `M ${ROOT_X},${ROOT_Y} C ${ROOT_X + 5},${ROOT_Y - (ROOT_Y - peakY) * 0.97} ${peakX},${peakY} ${tipX},${tipY}`);
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
  g.appendChild(path);

  const tip = document.createElementNS(NS, 'g');
  tip.setAttribute('class', 'branch-tip');
  tip.setAttribute('data-branch-id', branch.slot);
  tip.style.cursor = 'pointer';

  if (branch.reason) {
    const title = document.createElementNS(NS, 'title');
    title.textContent = branch.reason;
    tip.appendChild(title);
  }

  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', tipX);
  dot.setAttribute('cy', tipY);
  dot.setAttribute('r',  '2');
  dot.setAttribute('fill', 'var(--text-primary)');
  dot.setAttribute('opacity', '0.7');
  tip.appendChild(dot);

  const text = (x, y, content, opts) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'start');
    t.setAttribute('font-size',   opts.size);
    t.setAttribute('font-family', opts.mono ? 'SF Mono, monospace' : 'Georgia, serif');
    if (opts.italic) t.setAttribute('font-style', 'italic');
    if (opts.spacing) t.setAttribute('letter-spacing', opts.spacing);
    t.setAttribute('fill',    opts.fill || 'var(--text-primary)');
    t.setAttribute('opacity', opts.opacity ?? 1);
    if (opts.cls) t.setAttribute('class', opts.cls);
    t.textContent = content;
    tip.appendChild(t);
    return t;
  };

  // Roman-numeral motion sits above the chords — the theory, then the notes.
  if (branch.roman && branch.roman !== '—') {
    text(tipX + 13, tipY - 9, branch.roman,
         { size: 10, mono: true, spacing: '0.06em', fill: 'var(--accent)', opacity: 0.85, cls: 'branch-roman-text' });
  }

  text(tipX + 13, tipY + 6, branch.name,
       { size: 16, italic: true, cls: 'branch-chord-text' });

  if (branch.deviceLabel) {
    text(tipX + 13, tipY + 21, branch.deviceLabel,
         { size: 9.5, mono: true, spacing: '0.05em', fill: 'var(--text-muted)', opacity: 0.6, cls: 'branch-label-text' });
  }

  tip.style.animation = `tip-settle 0.9s cubic-bezier(0.3,0.9,0.4,1) ${index * 110 + 860}ms both`;
  g.appendChild(tip);
  svg.appendChild(g);
}

function drawRootChord(svg, chord) {
  const NS = 'http://www.w3.org/2000/svg';
  const add = (y, content, opts) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', ROOT_X);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size',   opts.size);
    t.setAttribute('font-family', opts.mono ? 'SF Mono, monospace' : 'Georgia, serif');
    if (opts.italic) t.setAttribute('font-style',  'italic');
    if (opts.weight) t.setAttribute('font-weight', opts.weight);
    if (opts.spacing) t.setAttribute('letter-spacing', opts.spacing);
    t.setAttribute('fill',    opts.fill || 'var(--text-primary)');
    t.setAttribute('opacity', opts.opacity ?? 1);
    if (opts.cls) t.setAttribute('class', opts.cls);
    t.textContent = content;
    svg.appendChild(t);
  };

  add(ROOT_Y + 21, chord.name, { size: 20, italic: true, weight: '600', cls: 'root-chord-text' });

  if (compose.key) {
    add(ROOT_Y + 41, `in ${Harmony.noteName(compose.key.tonicPc, false)} ${compose.key.mode}`,
        { size: 10, mono: true, spacing: '0.1em', fill: 'var(--text-muted)', opacity: 0.55 });
  }
}

// ── Branch interaction ─────────────────────────────────────────────────────

function bindBranchInteraction() {
  document.querySelectorAll('.branch-tip').forEach(tip => {
    const branch = compose.branches.find(b => b.slot === tip.getAttribute('data-branch-id'));
    if (!branch) return;

    tip.addEventListener('mouseenter', () => {
      if (!compose.pending) previewBranch(branch);
      tip.classList.add('hovered');
      showVariantMenu(branch, tip);
    });

    tip.addEventListener('mouseleave', () => {
      if (!compose.pending) window.VoiceMe?.clearCue();
      tip.classList.remove('hovered');
      scheduleHideVariants();
    });

    tip.addEventListener('click', () => selectBranch(branch));
  });
}

function previewBranch(branch) {
  window.VoiceMe?.cueFor(window.VoiceMe.soundingNotes(), branch.notes);
}

// ── Variant menu — same function, other colourings ─────────────────────────
// F7, F9, F13, F7♭9, F7alt all do the same job. They belong on a shelf behind
// one branch, not spread across four branches that all say the same thing.

let variantHideTimer = null;

function scheduleHideVariants() {
  clearTimeout(variantHideTimer);
  variantHideTimer = setTimeout(hideVariantMenu, 260);
}

function hideVariantMenu() {
  document.getElementById('variant-menu')?.remove();
}

function showVariantMenu(branch, tipEl) {
  clearTimeout(variantHideTimer);
  hideVariantMenu();

  const variants = branch.variants || [];
  if (variants.length < 2) return;

  const rect = tipEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id        = 'variant-menu';
  menu.className = 'variant-menu';
  menu.style.left = `${rect.right + 10}px`;
  menu.style.top  = `${rect.top}px`;

  const tierName = ['basic', 'colourful', 'complex'];
  menu.innerHTML = `<div class="variant-menu-head">${branch.deviceLabel || 'Colourings'}</div>` +
    variants.map((v, i) => `
      <button class="variant-option${v.current ? ' current' : ''}" data-variant="${i}">
        <span class="variant-name">${v.name}</span>
        <span class="variant-tier">${tierName[v.tier]}</span>
      </button>`).join('');

  document.body.appendChild(menu);

  menu.addEventListener('mouseenter', () => clearTimeout(variantHideTimer));
  menu.addEventListener('mouseleave', scheduleHideVariants);

  menu.querySelectorAll('.variant-option').forEach(btn => {
    const v = variants[parseInt(btn.dataset.variant, 10)];
    btn.addEventListener('mouseenter', () => window.VoiceMe?.cueFor(window.VoiceMe.soundingNotes(), v.notes));
    btn.addEventListener('click', () => {
      // Swap the colouring in place, keeping the device's motion intact.
      const swapped = {
        ...branch,
        quality:  v.quality,
        notes:    v.notes,
        mapping:  v.mapping,
        name:     branch.sequence.length > 1
                    ? [v.name, ...branch.sequence.slice(1).map(s => s.name)].join(' → ')
                    : v.name,
        sequence: [{ ...branch.sequence[0], quality: v.quality, notes: v.notes,
                     mapping: v.mapping, name: v.name },
                   ...branch.sequence.slice(1)],
      };
      swapped.resolvesTo = swapped.sequence[swapped.sequence.length - 1];
      hideVariantMenu();
      selectBranch(swapped);
    });
  });
}

// ── Walking a device ───────────────────────────────────────────────────────

function selectBranch(branch) {
  compose.pending = { branch, step: 0 };
  cueStep();
  document.querySelectorAll('.branch-tip').forEach(t => t.classList.remove('pending'));
  document.querySelector(`.branch-tip[data-branch-id="${branch.slot}"]`)?.classList.add('pending');
}

/** Light the current step of the pending device. */
function cueStep() {
  const { branch, step } = compose.pending;
  const target = branch.sequence[step];

  window.VoiceMe?.cueFor(window.VoiceMe.soundingNotes(), target.notes);
  window.VoiceMe?.showArrows(target.mapping?.moved || []);

  const total = branch.sequence.length;
  updateStatus(total > 1
    ? `Play ${target.name}   (${step + 1} of ${total} — ${branch.roman})`
    : `Play ${target.name}`);
}

function advanceStep() {
  const { branch, step } = compose.pending;
  const played = branch.sequence[step];

  window.VoiceMe?.flashGreen(played.notes);
  playChimeSound();

  if (step + 1 < branch.sequence.length) {
    compose.pending.step = step + 1;
    // Give the green flash a beat before re-cueing the next chord.
    setTimeout(() => { if (compose.pending) cueStep(); }, 320);
    return;
  }
  commitDevice(branch);
}

function commitDevice(branch) {
  const group = ++compose.groupSeq;
  branch.sequence.forEach(ch => {
    compose.trail.push({
      rootPC: ch.rootPC, quality: ch.quality, bassPc: ch.bassPc ?? null,
      notes:  ch.notes,  name:    ch.name,
      group,  device: branch.device, roman: branch.roman,
    });
  });

  compose.pending = null;
  renderComposition();

  window.VoiceMe?.clearArrows();
  window.VoiceMe?.clearCue();
  floatChime();

  const landed = branch.resolvesTo || branch.sequence[branch.sequence.length - 1];
  triggerLeafFall(branch);

  // The device's LAST chord becomes the new root — you build on where the
  // move landed, not on where it started.
  setTimeout(() => setCurrentChord(landed), 1200);
}

// ── Match detection ────────────────────────────────────────────────────────

function checkComposeMatch(heldMidi) {
  if (!compose.active) return;
  const held = new Set(heldMidi);

  if (compose.pending) {
    const target = new Set(compose.pending.branch.sequence[compose.pending.step].notes);
    if (held.size === target.size && [...target].every(n => held.has(n))) advanceStep();
    compose.prevHeld = held;
    return;
  }

  // Only re-read on an ATTACK. Releasing keys must never rebuild the tree, or
  // the suggestions vanish the moment you lift your hands to play one.
  const attack = [...held].some(n => !compose.prevHeld.has(n));
  compose.prevHeld = held;
  if (!attack) return;

  const detected = detectComposedChord(heldMidi);
  if (!detected) return;

  const changed = !compose.currentChord
               || detected.rootPC  !== compose.currentChord.rootPC
               || detected.quality !== compose.currentChord.quality;
  if (changed) {
    setTrailTip(detected);
    setCurrentChord(detected);
  }
}

function setCurrentChord(chord) {
  compose.currentChord = {
    ...chord,
    name: chord.name || chordNameOf(chord.rootPC, chord.quality, chord.bassPc),
  };
  compose.branches = generateBranches(compose.currentChord);
  renderTree();
  renderComposition();
  updateStatus(compose.currentChord.name);
}

function setTrailTip(chord) {
  const entry = {
    rootPC: chord.rootPC, quality: chord.quality, bassPc: chord.bassPc ?? null,
    notes:  chord.notes,
    name:   chord.name || chordNameOf(chord.rootPC, chord.quality, chord.bassPc),
    group:  ++compose.groupSeq, device: null, roman: null,
  };
  if (compose.trail.length === 0) compose.trail.push(entry);
  else compose.trail[compose.trail.length - 1] = entry;
}

function renderComposition() {
  renderTrail();
  const STAFF_WINDOW = 4;
  if (compose.trail.length === 0) {
    window.VoiceMeNotation?.showComposition?.([], 0);
  } else {
    const shown = compose.trail.slice(-STAFF_WINDOW);
    window.VoiceMeNotation?.showComposition?.(shown, shown.length - 1);
  }
}

// ── Backspace removes a whole device, not half of one ──────────────────────

function backspaceCompose() {
  if (!compose.active || compose.trail.length === 0) return;

  if (compose.pending) {           // abandon the walk before touching the trail
    compose.pending = null;
    window.VoiceMe?.clearCue();
    window.VoiceMe?.clearArrows();
    updateStatus(compose.currentChord ? compose.currentChord.name : '');
    renderTree();
    return;
  }

  const group = compose.trail[compose.trail.length - 1].group;
  while (compose.trail.length && compose.trail[compose.trail.length - 1].group === group) {
    compose.trail.pop();
  }

  window.VoiceMe?.clearCue();
  window.VoiceMe?.clearArrows();

  if (compose.trail.length > 0) {
    setCurrentChord(compose.trail[compose.trail.length - 1]);
  } else {
    compose.currentChord = null;
    compose.branches = [];
    renderTree();
    renderComposition();
    updateStatus('Play a chord to grow the tree');
  }
}

// ── Leaf fall ──────────────────────────────────────────────────────────────

function triggerLeafFall(branch) {
  const tip = document.querySelector(`.branch-tip[data-branch-id="${branch.slot}"]`);
  if (!tip) return;

  const svg = document.querySelector('.compose-tree-svg');
  const chordText = tip.querySelector('.branch-chord-text');
  if (!svg || !chordText) return;

  tip.querySelectorAll('text').forEach(t => {
    t.animate([{ opacity: t.getAttribute('opacity') || 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
  });

  const NS = 'http://www.w3.org/2000/svg';
  const x  = parseFloat(chordText.getAttribute('x'));
  const y  = parseFloat(chordText.getAttribute('y'));

  setTimeout(() => {
    const leaf  = document.createElementNS(NS, 'g');
    leaf.setAttribute('class', 'compose-leaf');
    const shape = document.createElementNS(NS, 'path');
    shape.setAttribute('d', 'M 0 -6 Q 6 0 0 6 Q -6 0 0 -6 Z');
    shape.setAttribute('fill', 'var(--text-primary)');
    shape.setAttribute('opacity', '0.8');
    leaf.appendChild(shape);
    leaf.setAttribute('transform', `translate(${x}, ${y})`);
    svg.appendChild(leaf);

    const driftX = (Math.random() - 0.5) * 60;
    const fallY  = TREE_H - y + 40;
    leaf.animate([
      { transform: `translate(${x}px, ${y}px) rotate3d(1,0.5,0.2,0deg)`, opacity: 0.8 },
      { transform: `translate(${x + driftX * 0.7}px, ${y + fallY * 0.65}px) rotate3d(0.6,1,0.4,340deg)`, opacity: 0.55, offset: 0.65 },
      { transform: `translate(${x + driftX}px, ${y + fallY}px) rotate3d(0.5,1,0.5,540deg)`, opacity: 0 },
    ], { duration: 1000, easing: 'cubic-bezier(0.3,0.1,0.55,1)', fill: 'forwards' });

    setTimeout(() => leaf.remove(), 1050);
  }, 300);
}

// ── Trail ledger ───────────────────────────────────────────────────────────

function renderTrail() {
  const el = document.getElementById('compose-trail');
  if (!el) return;
  if (compose.trail.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = compose.trail.map((c, i) => {
    const startsDevice = c.device && (i === 0 || compose.trail[i - 1].group !== c.group);
    const label = startsDevice ? `<span class="trail-device">${c.roman}</span>` : '';
    return label + `<span class="trail-chord" data-idx="${i}">${c.name}</span>` +
           (i < compose.trail.length - 1 ? '<span class="trail-arrow">·</span>' : '');
  }).join('');
}

function updateStatus(text) {
  const el = document.getElementById('compose-status');
  if (el) el.textContent = text || '';
}

function playChimeSound() { window.PanelChime?.(); }
function floatChime()     { window.PanelCheck?.(); }

// ── Dials ──────────────────────────────────────────────────────────────────

function regenerate() {
  if (!compose.currentChord) return;
  compose.branches = generateBranches(compose.currentChord);
  renderTree();
}

function initDials() {
  const spiceEl = document.getElementById('spice-dial');
  if (spiceEl) {
    const stops = [
      { v: 0, label: 'Basic',    title: 'Triads and plain 7ths — no altered dominants volunteered' },
      { v: 1, label: 'Colorful', title: '9ths, 6/9 and sus — the jazz staples' },
      { v: 2, label: 'Complex',  title: 'Altered dominants, 13ths, lydian' },
    ];
    spiceEl.innerHTML = stops.map(s =>
      `<button class="spice-btn ${s.v === compose.spice ? 'active' : ''}" data-spice="${s.v}" title="${s.title}">${s.label}</button>`
    ).join('');
    spiceEl.querySelectorAll('.spice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        compose.spice = parseInt(btn.dataset.spice, 10);
        spiceEl.querySelectorAll('.spice-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        regenerate();
      });
    });
  }

  // Shape is the other half of the pair: spice picks WHICH notes, shape picks
  // HOW they spread. They are independent, so both need a control.
  const shapeEl = document.getElementById('shape-dial');
  if (shapeEl) {
    const shapes = [
      { v: 'minimal', label: 'Minimal', title: 'Root and guide tones only' },
      { v: 'closed',  label: 'Closed',  title: 'Tight stack, textbook' },
      { v: 'open',    label: 'Open',    title: 'Wide spacing, bass well below' },
      { v: 'cluster', label: 'Cluster', title: 'Dense, chord tone in the bass' },
    ];
    shapeEl.innerHTML = shapes.map(s =>
      `<button class="spice-btn ${s.v === compose.shape ? 'active' : ''}" data-shape="${s.v}" title="${s.title}">${s.label}</button>`
    ).join('');
    shapeEl.querySelectorAll('.spice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        compose.shape = btn.dataset.shape;
        shapeEl.querySelectorAll('.spice-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        regenerate();
      });
    });
  }
}

// ── Activation ─────────────────────────────────────────────────────────────

function activateCompose() {
  compose.active   = true;
  compose.prevHeld = new Set();
  document.body.classList.add('compose-mode');

  if (document.getElementById('voicing-panel')?.classList.contains('open')) {
    document.getElementById('panel-tab')?.click();
  }
  window.VoiceMePanel?.exitProgression?.();

  initDials();
  updateComposeBtn();
  updateStatus('Play a chord to grow the tree');
  renderTree();
  renderTrail();
}

function deactivateCompose() {
  Object.assign(compose, {
    active: false, currentChord: null, branches: [], trail: [],
    pending: null, prevHeld: new Set(),
  });
  document.body.classList.remove('compose-mode');
  hideVariantMenu();

  window.VoiceMe?.clearCue();
  window.VoiceMe?.clearArrows();
  window.VoiceMeNotation?.returnToLive?.();

  updateComposeBtn();
  const tree  = document.getElementById('compose-tree');
  const trail = document.getElementById('compose-trail');
  if (tree)  tree.innerHTML  = '';
  if (trail) trail.innerHTML = '';
  updateStatus('');
}

function toggleCompose() {
  compose.active ? deactivateCompose() : activateCompose();
}

function updateComposeBtn() {
  const btn = document.getElementById('compose-btn');
  if (!btn) return;
  btn.classList.toggle('active', compose.active);
  btn.textContent = compose.active ? '✕ Exit Compose' : '✎ Compose with me';
}

// ── Wiring ─────────────────────────────────────────────────────────────────

document.getElementById('compose-btn')?.addEventListener('click', toggleCompose);
document.getElementById('compose-backspace')?.addEventListener('click', backspaceCompose);

document.addEventListener('keydown', (e) => {
  if (!compose.active || e.key !== 'Backspace') return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
  backspaceCompose();
});

window.VoiceMeBus?.on('notes', checkComposeMatch);

window.Compose = {
  checkMatch: checkComposeMatch,
  isActive:   () => compose.active,
  activate:   activateCompose,
  deactivate: deactivateCompose,
};

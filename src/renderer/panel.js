/**
 * panel.js
 * Voice Me — Voicing Library Panel
 * Sliding drawer with chord glossary, mini keyboards, "Try It" detection,
 * green moment animation, and "In The Wild" detection.
 */

// ── State ──────────────────────────────────────────────────────────────────
let panelOpen        = false;
let selectedFamily   = null;
let selectedVoicing  = null;
let activeGenre      = 'All';
let activePianist    = 'All';
let playedVoicings   = new Set();   // ids of voicings the user has played
let suggestionNotes  = [];          // currently lit suggestion notes (MIDI)
let matchListeners   = [];
let inTheWildTimeout = null;

const GENRES   = ['All', 'Jazz', 'Gospel', 'Blues', 'Neo-Soul', 'Bossa'];
const PIANISTS = ['All', 'Herbie', 'Evans', 'Glasper', 'McCoy', 'Monk'];

// ── DOM refs ───────────────────────────────────────────────────────────────
const panel        = document.getElementById('voicing-panel');
const panelBody    = document.getElementById('panel-body');
const panelTab     = document.getElementById('panel-tab');
const familyList   = document.getElementById('family-list');
const voicingCards = document.getElementById('voicing-cards');
const voicingCtx   = document.getElementById('voicing-context');
const wildBanner   = document.getElementById('wild-banner');
const wildText     = document.getElementById('wild-text');

// ── Toggle panel ───────────────────────────────────────────────────────────
function togglePanel() {
  panelOpen = !panelOpen;
  panel.classList.toggle('open', panelOpen);
  panelTab.querySelector('.panel-chevron').textContent = panelOpen ? '▼' : '▲';
  if (panelOpen && !selectedFamily) renderFamilyList();
}

panelTab.addEventListener('click', togglePanel);

function initTabs() {
  document.getElementById('tab-library').addEventListener('click', () => switchTab('library'));
  document.getElementById('tab-progressions').addEventListener('click', () => switchTab('progressions'));
}

function switchTab(tab) {
  const isLib = tab === 'library';
  document.getElementById('tab-library').classList.toggle('active', isLib);
  document.getElementById('tab-progressions').classList.toggle('active', !isLib);
  document.getElementById('library-content').style.display = isLib ? '' : 'none';
  document.getElementById('prog-content').style.display    = isLib ? 'none' : '';
  if (!isLib && !progState.active) renderProgressionsHome();
}

// ── Filters ────────────────────────────────────────────────────────────────
function initFilters() {
  const gf = document.getElementById('genre-filters');
  const pf = document.getElementById('pianist-filters');

  GENRES.forEach(g => {
    const btn = document.createElement('button');
    btn.className   = 'filter-btn' + (g === 'All' ? ' active' : '');
    btn.textContent = g;
    btn.addEventListener('click', () => {
      activeGenre = g;
      document.querySelectorAll('#genre-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFamilyList();
      if (selectedFamily) renderVoicingCards(selectedFamily);
    });
    gf.appendChild(btn);
  });

  PIANISTS.forEach(p => {
    const btn = document.createElement('button');
    btn.className   = 'filter-btn pianist-btn' + (p === 'All' ? ' active' : '');
    btn.textContent = p;
    btn.addEventListener('click', () => {
      activePianist = p;
      document.querySelectorAll('#pianist-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFamilyList();
      if (selectedFamily) renderVoicingCards(selectedFamily);
    });
    pf.appendChild(btn);
  });
}

// ── Filter helper ──────────────────────────────────────────────────────────
function voicingPassesFilter(v) {
  const genreOk    = activeGenre   === 'All' || v.genre.includes(activeGenre);
  const pianistOk  = activePianist === 'All' || v.pianist === activePianist;
  return genreOk && pianistOk;
}

function familyHasVoicings(familyEntry) {
  return familyEntry.voicings.some(voicingPassesFilter);
}

// ── Family list (left column) ──────────────────────────────────────────────
function renderFamilyList() {
  familyList.innerHTML = '';
  const families = [...new Set(window.VoicingLibrary.map(e => e.family))];

  families.forEach(fam => {
    const entries = window.VoicingLibrary.filter(e => e.family === fam && familyHasVoicings(e));
    if (entries.length === 0) return;

    const section = document.createElement('div');
    section.className = 'family-section';

    const header = document.createElement('div');
    header.className   = 'family-header';
    header.textContent = fam;
    section.appendChild(header);

    entries.forEach(entry => {
      const item = document.createElement('div');
      item.className   = 'family-chord-item' + (selectedFamily === entry ? ' selected' : '');
      item.textContent = entry.chord;
      item.addEventListener('click', () => {
        selectedFamily = entry;
        selectedVoicing = null;
        document.querySelectorAll('.family-chord-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        renderVoicingCards(entry);
        clearContext();
        clearSuggestionKeys();
      });
      section.appendChild(item);
    });

    familyList.appendChild(section);
  });
}

// ── Voicing cards (center column) ─────────────────────────────────────────
function renderVoicingCards(entry) {
  voicingCards.innerHTML = '';

  const filtered = entry.voicings.filter(voicingPassesFilter);
  if (filtered.length === 0) {
    voicingCards.innerHTML = '<div class="empty-state">No voicings match current filters</div>';
    return;
  }

  filtered.forEach(v => {
    const card = document.createElement('div');
    card.className = 'voicing-card' + (playedVoicings.has(v.id) ? ' played' : '');
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title-row">
          <span class="card-chord">${entry.chord}</span>
          ${v.pianist ? `<span class="card-pianist">${v.pianist}</span>` : ''}
          ${playedVoicings.has(v.id) ? '<span class="card-played-dot">✓</span>' : ''}
        </div>
        <span class="card-name">${v.name}</span>
      </div>
      <div class="card-mini-keys">${renderMiniKeyboard(v.notes)}</div>
      <div class="card-notes">${formatNoteNames(v.notes)}</div>
      <div class="card-tags">${v.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
    `;

    card.addEventListener('click', () => {
      selectedVoicing = v;
      document.querySelectorAll('.voicing-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      renderContext(entry, v);
      lightSuggestionKeys(v.notes);
      window.VoiceMeNotation?.showVoicing(v.notes);
    });

    voicingCards.appendChild(card);
  });
}

// ── Context panel (right column) ──────────────────────────────────────────
function renderContext(entry, v) {
  voicingCtx.innerHTML = `
    <div class="ctx-chord">${entry.chord}</div>
    <div class="ctx-voicing-name">${v.name}</div>
    <div class="ctx-description">${v.description}</div>
    ${v.resolves ? `<div class="ctx-resolves">Resolves to <span class="ctx-resolves-chord">${v.resolves}</span></div>` : ''}
    <div class="ctx-genre-tags">${v.genre.map(g => `<span class="genre-tag">${g}</span>`).join('')}</div>
    <div class="try-it-prompt" id="try-it-prompt">
      <span class="try-it-keys">${formatNoteNames(v.notes)}</span>
      <span class="try-it-label">Play this voicing</span>
    </div>
  `;
}

function clearContext() {
  voicingCtx.innerHTML = `
    <div class="ctx-empty">
      <div class="ctx-empty-icon">♩</div>
      <div class="ctx-empty-text">Select a voicing to see details and try it on your keyboard</div>
    </div>
  `;
}

// ── Mini keyboard renderer ─────────────────────────────────────────────────
function renderMiniKeyboard(notes) {
  const sorted   = [...notes].sort((a, b) => a - b);
  const low      = sorted[0];
  const high     = sorted[sorted.length - 1];
  const noteSet  = new Set(notes);
  const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

  // Show from C below lowest to C above highest (min 2 octaves)
  const startMidi = Math.floor(low / 12) * 12;
  const rawEnd    = (Math.floor(high / 12) + 1) * 12 + 11;
  const endMidi   = Math.max(rawEnd, startMidi + 23);

  const WK_W = 11, WK_H = 36, BK_W = 7, BK_H = 22;
  const keys = [];
  let wIdx = 0;

  for (let midi = startMidi; midi <= endMidi; midi++) {
    const pc = midi % 12;
    const isBlack = BLACK_PCS.has(pc);
    if (!isBlack) {
      keys.push({ midi, isBlack: false, wIdx });
      wIdx++;
    } else {
      keys.push({ midi, isBlack: true, wIdx });
    }
  }

  const svgW = wIdx * WK_W;
  let s = `<svg viewBox="0 0 ${svgW} ${WK_H}" xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width:${svgW}px;display:block">`;
  s += `<rect width="${svgW}" height="${WK_H}" fill="#E8E8EC" rx="3"/>`;

  // White keys first
  keys.filter(k => !k.isBlack).forEach(k => {
    const x      = k.wIdx * WK_W;
    const active = noteSet.has(k.midi);
    s += `<rect x="${x + 0.5}" y="0.5" width="${WK_W - 1}" height="${WK_H - 1}" rx="2" fill="${active ? '#93C5FD' : '#FAFAFA'}" stroke="#CCCCCC" stroke-width="0.5"/>`;
  });

  // Black keys on top, centered on boundary
  keys.filter(k => k.isBlack).forEach(k => {
    const x      = k.wIdx * WK_W - BK_W / 2;
    const active = noteSet.has(k.midi);
    s += `<rect x="${x}" y="0.5" width="${BK_W}" height="${BK_H}" rx="1.5" fill="${active ? '#3B82F6' : '#888'}"/>`;
  });

  s += '</svg>';
  return s;
}

// ── Note name formatter ────────────────────────────────────────────────────

function formatNoteNames(notes) {
  return [...notes].sort((a, b) => a - b).map(midi => {
    const pc       = midi % 12;
    const useSharp = Piano.SHARP_ROOT_PCS.has(pc);
    return Piano.getNoteName(pc, useSharp);
  }).join('  ');
}

// ── Key lighting ───────────────────────────────────────────────────────────
function lightSuggestionKeys(notes) {
  clearSuggestionKeys();
  suggestionNotes = notes;
  window.VoiceMe?.setCue({ press: notes });
}

function clearSuggestionKeys() {
  suggestionNotes = [];
  window.VoiceMe?.clearCue();
}

// ── Match detection ────────────────────────────────────────────────────────
// Called from app.js whenever held notes change
function checkMatch(heldMidi) {
  if (!selectedVoicing || heldMidi.length === 0) return;
  const held   = new Set(heldMidi);
  const target = new Set(selectedVoicing.notes);
  if (held.size !== target.size) return;
  for (const note of target) if (!held.has(note)) return;
  triggerGreenMoment();
}

function triggerGreenMoment() {
  if (!selectedVoicing) return;

  // Mark as played
  playedVoicings.add(selectedVoicing.id);

  // Flash keys green
  window.VoiceMe?.flashGreen(selectedVoicing.notes);

  // Play chime
  playChime();

  // Float checkmark
  floatCheckmark();

  // Update card dot
  const activeCard = document.querySelector('.voicing-card.active');
  if (activeCard && !activeCard.querySelector('.card-played-dot')) {
    const dot = document.createElement('span');
    dot.className   = 'card-played-dot';
    dot.textContent = '✓';
    activeCard.querySelector('.card-title-row')?.appendChild(dot);
    activeCard.classList.add('played');
  }

  window.VoiceMeNotation?.returnToLive();
  
}

// ── In The Wild detection ─────────────────────────────────────────────────
function checkInTheWild(heldMidi) {
  if (heldMidi.length < 3) return;

  const heldPCs = new Set(heldMidi.map(n => n % 12));

  for (const entry of window.VoicingLibrary) {
    for (const v of entry.voicings) {
      if (v === selectedVoicing) continue;
      const targetPCs = new Set(v.notes.map(n => n % 12));
      if (targetPCs.size !== heldPCs.size) continue;
      let match = true;
      for (const pc of targetPCs) {
        if (!heldPCs.has(pc)) { match = false; break; }
      }
      if (match) {
        showInTheWild(v.name, entry.chord, v.pianist);
        return;
      }
    }
  }
}

function showInTheWild(voicingName, chord, pianist) {
  clearTimeout(inTheWildTimeout);
  const who    = pianist ? `${pianist} — ` : '';
  wildText.textContent = `✦  ${who}${chord}: ${voicingName}`;
  wildBanner.classList.add('visible');
  inTheWildTimeout = setTimeout(() => wildBanner.classList.remove('visible'), 3500);
}

// ── Chime sound ────────────────────────────────────────────────────────────
// ── Confirmation sound ─────────────────────────────────────────────────────
//
// One AudioContext, created once and reused. The previous version built a new
// one on every correct chord and never closed it; browsers cap how many can
// exist at a time, so the sound would eventually stop firing with no error.

let confirmCtx = null;

function audioContext() {
  if (!confirmCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    confirmCtx = new Ctor();
  }
  if (confirmCtx.state === 'suspended') confirmCtx.resume();
  return confirmCtx;
}

/**
 * The "you got it" sound.
 *
 * Warm rather than bell-like. Three things make a chime sound like a chime:
 * high pure sines, a long ringing decay, and an arpeggiated sparkle. This is
 * the opposite of each — low triangles rounded off with a lowpass, a soft
 * attack, and a short decay, all three partials arriving almost together so it
 * blooms instead of twinkling.
 *
 * Voiced as an open fifth plus its octave, with NO third. It sounds right
 * after whatever chord you just played, and a third would collide with half of
 * them.
 */
function playChime() {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    // Rounds off the top so nothing glassy survives.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(1300, t0);
    tone.frequency.exponentialRampToValueAtTime(600, t0 + 0.7);
    tone.Q.value = 0.6;

    const out = ctx.createGain();
    out.gain.value = 1;
    tone.connect(out);
    out.connect(ctx.destination);

    const partials = [
      { freq: 196.00, type: 'triangle', peak: 0.16, delay: 0.000, decay: 0.95 },  // G3
      { freq: 293.66, type: 'triangle', peak: 0.11, delay: 0.010, decay: 0.85 },  // D4
      { freq: 392.00, type: 'sine',     peak: 0.07, delay: 0.020, decay: 0.70 },  // G4
    ];

    partials.forEach(({ freq, type, peak, delay, decay }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(gain);
      gain.connect(tone);

      const start = t0 + delay;
      gain.gain.setValueAtTime(0.0001, start);
      // A gentle swell, not a click — the attack is most of the warmth.
      gain.gain.linearRampToValueAtTime(peak, start + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);

      osc.start(start);
      osc.stop(start + decay + 0.05);
    });
  } catch (e) { /* audio is a nicety; never let it break the UI */ }
}

// ── Floating checkmark ─────────────────────────────────────────────────────
function floatCheckmark() {
  const el = document.createElement('div');
  el.className   = 'float-check';
  el.textContent = '✓';
  document.getElementById('piano-container').appendChild(el);

  // Trigger animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('rising'));
  });

  setTimeout(() => el.remove(), 1400);
}

// ── Init ───────────────────────────────────────────────────────────────────
initFilters();
renderFamilyList();
clearContext();

// Expose API for app.js to call
// ── Progression constants ──────────────────────────────────────────────────

const TONIC_OFFSETS    = [0, 1, 2, 3, 4, -7, -6, -5, -4, -3, -2, -1];
const FLAT_TONIC_PCS   = new Set([1, 3, 5, 8, 10]); // Db Eb F Ab Bb
const PROG_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const PROG_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const DEGREE_SEMITONES = { 'I': 0, 'i': 0, 'ii': 2, 'ii°': 2, 'IV': 5, 'V': 7, 'vi': 9 };


const PROGRESSIONS_DATA = [
  {
    id:          'two-five-one-major',
    name:        '2–5–1 (Major)',
    description: 'The foundation of jazz harmony in major keys',
    variations: [
      {
        id:          '251-v1',
        name:        'min9 → 9(13) → maj9',
        description: 'Left hand bass moves down a 5th then up a 4th. Right hand upper voices move by half step only.',
        chords: [
          { roman: 'ii', quality: 'm9',    notes: [50, 53, 57, 60, 64] },
          { roman: 'V',  quality: '9(13)', notes: [43, 53, 57, 59, 64] },
          { roman: 'I',  quality: 'maj9',  notes: [48, 52, 55, 59, 62] },
        ]
      },
      {
        id:          '251-v2',
        name:        'min9 → 9(♭13) → maj9',
        description: 'The ♭13 replaces the natural 13. C and E both move down a half step — darker tension before resolving.',
        chords: [
          { roman: 'ii', quality: 'm9',     notes: [50, 53, 57, 60, 64] },
          { roman: 'V',  quality: '9(♭13)', notes: [43, 53, 57, 59, 63] },
          { roman: 'I',  quality: 'maj9',   notes: [48, 52, 55, 59, 62] },
        ]
      },
      {
        id:          '251-v3',
        name:        'min9 → 9(13) → maj9 (Inversion)',
        description: 'Open inversion voicing. Bass leaps a 5th down then a 4th up. Three upper voices stay completely still from ii to V.',
        chords: [
          { roman: 'ii', quality: 'm9',    notes: [50, 60, 64, 65, 69] },
          { roman: 'V',  quality: '9(13)', notes: [43, 59, 64, 65, 69] },
          { roman: 'I',  quality: 'maj9',  notes: [48, 59, 62, 64, 67] },
        ]
      },
      {
        id:          '251-v4',
        name:        'm11 → 7alt → maj9♯11',
        description: 'Maximum tension and color. The altered dominant moves by half step in every voice. Resolves to the bright Lydian maj9♯11.',
        chords: [
          { roman: 'ii', quality: 'm11',     notes: [50, 53, 57, 60, 67] },
          { roman: 'V',  quality: '7alt',    notes: [43, 53, 59, 63, 68] },
          { roman: 'I',  quality: 'maj9♯11', notes: [48, 52, 59, 62, 66] },
        ]
      },
    ]
  },
  {
    id:          'two-five-one-minor',
    name:        '2–5–1 (Minor)',
    description: 'The minor key ii°–V–i. Darker and more urgent.',
    variations: [
      {
        id:       '251-minor-v1',
        name:     'm7♭5 → 7♭9 → mMaj7',
        minorKey: true,
        description: 'The classic minor ii°–V–i. Ab in the ii° becomes the ♭9 of V7. B natural leads into the major 7th of the i chord.',
        chords: [
          { roman: 'ii°', quality: 'm7♭5', notes: [50, 53, 56, 60] },
          { roman: 'V',   quality: '7♭9',  notes: [43, 53, 56, 59] },
          { roman: 'i',   quality: 'mM7',  notes: [48, 51, 55, 59] },
        ]
      },
    ]
  },
  {
    id:          'gospel',
    name:        'Gospel',
    description: 'Soulful gospel harmony with lush voicings and smooth resolutions.',
    variations: [
      {
        id:          'gospel-amen',
        name:        'IV → V9sus → Imaj9',
        description: 'The gospel Amen cadence. F, A, and C are common tones between IV and V9sus — then everything slides home by half step.',
        chords: [
          { roman: 'IV', quality: 'maj9',  notes: [41, 45, 48, 52, 55] },
          { roman: 'V',  quality: '9sus4', notes: [43, 45, 48, 50, 53] },
          { roman: 'I',  quality: 'maj9',  notes: [48, 52, 55, 59, 62] },
        ]
      },
    ]
  },
];

// ── Progression state ──────────────────────────────────────────────────────

let progState = {
  active: false, waitingForKey: false, tonicPC: null,
  keyName: null, currentIdx: 0, chords: [], variation: null, done: false,
};

// ── Tab init ───────────────────────────────────────────────────────────────

initTabs();

// ── Progressions home ──────────────────────────────────────────────────────

function renderProgressionsHome() {
  const el = document.getElementById('prog-content');
  if (!el) return;
  el.innerHTML = PROGRESSIONS_DATA.map(pg => `
    <div class="prog-family">
      <div class="prog-family-name">${pg.name}</div>
      <div class="prog-family-desc">${pg.description}</div>
      ${pg.variations.map(v => `
        <button class="prog-variation-btn" data-pg="${pg.id}" data-var="${v.id}">
          ${v.name}
        </button>
      `).join('')}
    </div>
  `).join('');

  el.querySelectorAll('.prog-variation-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pg = PROGRESSIONS_DATA.find(p => p.id === btn.dataset.pg);
      const v  = pg?.variations.find(v => v.id === btn.dataset.var);
      if (v) startProgression(v);
    });
  });
}

function startProgression(variation) {
  progState = {
    active: true, waitingForKey: true, tonicPC: null,
    keyName: null, currentIdx: 0, chords: [], variation, done: false,
  };
  renderProgressionActive();
}

// ── Active progression UI ──────────────────────────────────────────────────

function renderProgressionActive() {
  const el = document.getElementById('prog-content');
  if (!el) return;
  const v = progState.variation;

  el.innerHTML = `
    <div class="prog-active">
      <div class="prog-active-header">
        <span class="prog-variation-label">${v.name}</span>
        <button class="prog-exit-btn" id="prog-exit">✕ Exit</button>
      </div>

      <div id="prog-key-area">
        ${progState.waitingForKey
          ? `<div class="prog-key-prompt">♩ Press any key to choose the key</div>`
          : `<div class="prog-key-chosen">
               <span class="prog-key-name">${progState.keyName}</span>
               <button class="prog-link-btn" id="prog-rekey">Change key</button>
             </div>`
        }
      </div>

      <div class="prog-chord-row">
        ${v.chords.map((c, i) => `
          <div class="prog-chord-card ${!progState.waitingForKey && i === progState.currentIdx && !progState.done ? 'active' : ''} ${i < progState.currentIdx || progState.done ? 'completed' : ''}"
               id="prog-card-${i}">
            <div class="prog-roman">${c.roman}</div>
            <div class="prog-cname" id="prog-cname-${i}">
              ${progState.chords[i] ? progState.chords[i].name : '—'}
            </div>
            <div class="prog-cnotes" id="prog-cnotes-${i}">
              ${progState.chords[i] ? fmtChordNotes(progState.chords[i].notes) : '· · · · ·'}
            </div>
          </div>
          ${i < v.chords.length - 1 ? '<div class="prog-arrow">→</div>' : ''}
        `).join('')}
      </div>

      <div class="prog-vl" id="prog-vl"></div>
      <div class="prog-status" id="prog-status">${progState.waitingForKey ? '' : progStatusText()}</div>
    </div>
  `;

  document.getElementById('prog-exit')?.addEventListener('click', () => {
    progState.active = false;
    window.VoiceMe?.clearCue();
    renderProgressionsHome();
  });
  document.getElementById('prog-rekey')?.addEventListener('click', () => {
    progState.waitingForKey = true;
    progState.currentIdx    = 0;
    progState.done          = false;
    progState.chords        = [];
    progState.tonicPC       = null;
    progState.keyName       = null;
    window.VoiceMe?.clearCue();
    renderProgressionActive();
  });
}

function fmtChordNotes(notes) {
  const useFlat = FLAT_TONIC_PCS.has(progState.tonicPC);
  return notes.map(n => (useFlat ? PROG_FLAT : PROG_SHARP)[n % 12]).join('  ');
}

function progStatusText() {
  if (progState.done) return '✓ Complete! Change key or exit.';
  const c = progState.chords[progState.currentIdx];
  return c ? `Play the ${c.roman} chord — ${c.name}` : '';
}

function updateProgCard(idx) {
  document.getElementById(`prog-card-${idx}`)?.classList.toggle('active', idx === progState.currentIdx && !progState.done);
  document.getElementById(`prog-card-${idx}`)?.classList.toggle('completed', idx < progState.currentIdx || progState.done);
  const ch = progState.chords[idx];
  if (ch) {
    const nameEl  = document.getElementById(`prog-cname-${idx}`);
    const notesEl = document.getElementById(`prog-cnotes-${idx}`);
    if (nameEl)  nameEl.textContent  = ch.name;
    if (notesEl) notesEl.textContent = fmtChordNotes(ch.notes);
  }
  const st = document.getElementById('prog-status');
  if (st) st.textContent = progStatusText();
}

function showVLInfo(fromChord, toChord) {
  const el = document.getElementById('prog-vl');
  if (!el) return;
  const fromSet      = new Set(fromChord.notes);
  const commonNotes  = toChord.notes.filter(n => fromSet.has(n));
  const useFlat      = FLAT_TONIC_PCS.has(progState.tonicPC);
  if (!commonNotes.length) { el.textContent = ''; return; }
  const names = commonNotes.map(n => (useFlat ? PROG_FLAT : PROG_SHARP)[n % 12]).join(' · ');
  el.innerHTML = `<span class="vl-label">Voice leading</span> — ${commonNotes.length} held tone${commonNotes.length > 1 ? 's' : ''}: <span class="vl-notes">${names}</span>`;
}

// ── Key selection & transposition ──────────────────────────────────────────

function setProgressionKey(tonicPC) {
  const offset  = TONIC_OFFSETS[tonicPC];
  const useFlat = FLAT_TONIC_PCS.has(tonicPC);
  const names   = useFlat ? PROG_FLAT : PROG_SHARP;

  progState.waitingForKey = false;
  progState.tonicPC       = tonicPC;
  progState.keyName       = names[tonicPC] + (progState.variation.minorKey ? ' minor' : ' major');
  progState.currentIdx    = 0;
  progState.done          = false;

  progState.chords = progState.variation.chords.map(c => {
    const rootPC   = (tonicPC + DEGREE_SEMITONES[c.roman]) % 12;
    return { ...c, notes: c.notes.map(n => n + offset), name: Piano.musicalGlyphs(names[rootPC] + c.quality) };
  });

  renderProgressionActive();
  window.VoiceMe?.setCue({ press: progState.chords[0].notes });
  window.VoiceMeNotation?.showProgression(progState.chords, 0);
  window.VoiceMeNotation?.showChord(progState.chords[0].notes);
}

// ── Chord advancement ──────────────────────────────────────────────────────

function advanceProgression() {
  const current          = progState.chords[progState.currentIdx];
  const nextIdx          = progState.currentIdx + 1;
  progState.currentIdx   = nextIdx; // update immediately — prevents re-triggering
  window.VoiceMeNotation?.pulseChord(progState.currentIdx - 1);

  window.VoiceMe?.clearArrows();
  window.VoiceMe?.flashGreen(current.notes);
  playChime();
  floatCheckmark();

  setTimeout(() => {
    if (nextIdx >= progState.chords.length) {
      progState.done = true;
      window.VoiceMe?.clearCue();
      window.VoiceMe?.clearArrows();
      updateProgCard(nextIdx - 1);
      document.getElementById('prog-vl').textContent = '';
      return;
    }

    const next = progState.chords[nextIdx];

    // One call: the cue is derived by set difference, so hold/press/lift
    // cannot disagree with each other or with the chord being asked for.
    window.VoiceMe?.cueFor(current.notes, next.notes);
    window.VoiceMe?.showArrowsBetween(current.notes, next.notes);

    updateProgCard(nextIdx - 1);
    updateProgCard(nextIdx);
    showVLInfo(current, next);
    window.VoiceMeNotation?.setProgressionCurrent(nextIdx);
  }, 650);
}

// ── Progression match detection ────────────────────────────────────────────

function checkProgressionMatch(heldMidi) {
  if (!progState.active || progState.done) return;

  if (progState.waitingForKey) {
    if (heldMidi.length >= 1) setProgressionKey(heldMidi[0] % 12);
    return;
  }

  if (progState.currentIdx >= progState.chords.length) return;

  const target = new Set(progState.chords[progState.currentIdx].notes);
  const held   = new Set(heldMidi);
  if (held.size !== target.size) return;
  for (const note of target) if (!held.has(note)) return;

  advanceProgression();
}

// ── Export ─────────────────────────────────────────────────────────────────

function exitProgression() {
      if (progState.active) {
        progState.active = false;
        window.VoiceMe?.clearCue();
        window.VoiceMe?.clearArrows();
        window.VoiceMeNotation?.returnToLive();
        window.VoiceMeNotation?.pulseChord(progState.chords.length - 1);
        renderProgressionsHome();
      }
    }
    window.PanelChime = playChime;
    window.PanelCheck = floatCheckmark;
    window.VoiceMePanel = { checkMatch, checkInTheWild, checkProgressionMatch, exitProgression };


// ── Listen for what is being played ────────────────────────────────────────
// app.js broadcasts; it does not know this file exists.
window.VoiceMeBus?.on('notes', (notes) => {
  checkMatch(notes);
  checkProgressionMatch(notes);
  checkInTheWild(notes);
});

/**
 * audio.js
 * Voice Me — Fender Rhodes sampler
 * Tone.js v14 with 4-layer velocity-sensitive samples
 */

let   audioEnabled  = false;
let   samplersReady = false;
const activeNotes   = new Map(); // midi → layer name

// ── Velocity layer selection ───────────────────────────────────────────────

function getLayer(velocity) {
  if (velocity <= 40)  return 'p';
  if (velocity <= 75)  return 'mp';
  if (velocity <= 100) return 'mf';
  return 'f';
}

// ── Sample map ─────────────────────────────────────────────────────────────
// One sample every 3 semitones — Tone.Sampler interpolates between them

const SAMPLE_NOTES = [
  'A0',
  'C1',  'D#1', 'F#1', 'A1',
  'C2',  'D#2', 'F#2', 'A2',
  'C3',  'D#3', 'F#3', 'A3',
  'C4',  'D#4', 'F#4', 'A4',
  'C5',  'D#5', 'F#5', 'A5',
];

function buildUrls(layer) {
  const urls = {};
  SAMPLE_NOTES.forEach(note => {
    urls[note] = `${note}-${layer}.wav`;
  });
  return urls;
}

// ── Samplers (one per velocity layer) ─────────────────────────────────────

const samplers    = {};
let   loadPromise = null;

function initSamplers() {
  if (loadPromise) return loadPromise;

  // Optimize for low latency real-time performance
  Tone.context.latencyHint = 'interactive';
  Tone.context.lookAhead   = 0.01;
  Tone.context.updateInterval = 0.01;

  // Signal chain: samplers → reverb → volume → output
  const reverb    = new Tone.Reverb({ decay: 2.5, wet: 0.15 });
  const masterVol = new Tone.Volume(-6);

  reverb.connect(masterVol);
  masterVol.toDestination();

  const layers   = ['p', 'mp', 'mf', 'f'];
  const promises = layers.map(layer =>
    new Promise(resolve => {
      samplers[layer] = new Tone.Sampler({
        urls:    buildUrls(layer),
        baseUrl: './sounds/Samples/',
        onload:  resolve,
      }).connect(reverb);
    })
  );

  loadPromise = Promise.all(promises).then(() => {
    samplersReady = true;
    updateAudioBtn();
    console.log('[Audio] Rhodes samples loaded');
  });

  return loadPromise;
}

// ── Note on ────────────────────────────────────────────────────────────────

function startNote(midi, velocity) {
  if (!audioEnabled || !samplersReady) return;

  const layer   = getLayer(velocity);
  const note    = Tone.Frequency(midi, 'midi').toNote();
  const velNorm = velocity / 127;

  // Release any existing voice on this midi note first
  stopNote(midi);

  samplers[layer].triggerAttack(note, Tone.context.currentTime, velNorm);
  activeNotes.set(midi, layer);
}

// ── Note off ───────────────────────────────────────────────────────────────

function stopNote(midi) {
  const layer = activeNotes.get(midi);
  if (!layer) return;

  const note = Tone.Frequency(midi, 'midi').toNote();
  samplers[layer].triggerRelease(note, Tone.context.currentTime);
  activeNotes.delete(midi);
}

// ── Stop all ───────────────────────────────────────────────────────────────

function stopAllNotes() {
  [...activeNotes.keys()].forEach(midi => stopNote(midi));
}

// ── Button state ───────────────────────────────────────────────────────────

function updateAudioBtn() {
  const btn = document.getElementById('audio-toggle-btn');
  if (!btn) return;

  if (audioEnabled && !samplersReady) {
    btn.textContent = '◌ Loading…';
    btn.classList.remove('active');
  } else {
    btn.textContent = audioEnabled ? '⊙ Sound' : '○ Sound';
    btn.classList.toggle('active', audioEnabled);
  }
}

// ── Toggle ─────────────────────────────────────────────────────────────────

function toggleAudio() {
  audioEnabled = !audioEnabled;

  if (audioEnabled) {
    Tone.start(); // resume AudioContext — must be inside user gesture
    if (!samplersReady) initSamplers();
  } else {
    stopAllNotes();
  }

  updateAudioBtn();
}

// ── Button wiring ──────────────────────────────────────────────────────────

function wireAudioButton() {
  const btn = document.getElementById('audio-toggle-btn');
  if (btn) btn.addEventListener('click', toggleAudio);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireAudioButton);
} else {
  wireAudioButton();
}

// ── Global API ─────────────────────────────────────────────────────────────

window.AudioEngine = { startNote, stopNote, stopAllNotes, toggleAudio };
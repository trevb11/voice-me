/**
 * audio.js
 * Voice Me — Fender Rhodes sampler, 4 velocity layers.
 *
 * ── Why the samples are loaded by hand ─────────────────────────────────────
 *
 * We fetch and decode each sample ourselves instead of handing Tone.Sampler a
 * `urls` map, because Tone's URL handling breaks on any install path
 * containing a space.
 *
 * Tone normalises a sample URL by re-encoding the whole pathname a segment at
 * a time: `(a.pathname + a.hash).split('/').map(encodeURIComponent)`. The
 * pathname it starts from is ALREADY percent-encoded, so a folder called
 * "Voice Me" arrives as `Voice%20Me` and comes out as `Voice%2520Me` — a path
 * that does not exist. Every fetch fails, the load promise never settles, and
 * the Sound button spins on "Loading…" forever with no error.
 *
 * That is not a corner case: `productName` is "Voice Me", so the packaged app
 * lives at `/Applications/Voice Me.app/` and would ship with silent audio.
 *
 * Encoding only the FILENAME against an absolute directory URL sidesteps it,
 * and handles the sharps at the same time — `D#1-p.wav` must become
 * `D%231-p.wav` or the `#` is read as a URL fragment.
 */

let   audioEnabled  = false;
let   samplersReady = false;
let   loadError     = null;
const activeNotes   = new Map();   // midi → layer name

// ── Velocity layers ────────────────────────────────────────────────────────

function getLayer(velocity) {
  if (velocity <= 40)  return 'p';
  if (velocity <= 75)  return 'mp';
  if (velocity <= 100) return 'mf';
  return 'f';
}

const LAYERS = ['p', 'mp', 'mf', 'f'];

// One sample every 3 semitones — Tone interpolates between them.
const SAMPLE_NOTES = [
  'A0',
  'C1',  'D#1', 'F#1', 'A1',
  'C2',  'D#2', 'F#2', 'A2',
  'C3',  'D#3', 'F#3', 'A3',
  'C4',  'D#4', 'F#4', 'A4',
  'C5',  'D#5', 'F#5', 'A5',
];

// ── Loading ────────────────────────────────────────────────────────────────

function sampleDir() {
  return new URL('./sounds/Samples/', document.baseURI);
}

/** Absolute URL with ONLY the filename encoded — see the note at the top. */
function sampleUrl(fileName) {
  return new URL(encodeURIComponent(fileName), sampleDir()).href;
}

async function decodeSample(fileName) {
  const res = await fetch(sampleUrl(fileName));
  if (!res.ok) throw new Error(`${fileName} — HTTP ${res.status}`);
  return Tone.context.rawContext.decodeAudioData(await res.arrayBuffer());
}

async function buildSampler(layer, destination) {
  const sampler = new Tone.Sampler().connect(destination);

  const results = await Promise.all(SAMPLE_NOTES.map(async (note) => {
    try   { return { note, buffer: await decodeSample(`${note}-${layer}.wav`) }; }
    catch (err) { return { note, err }; }
  }));

  results.forEach(r => {
    if (r.buffer) sampler.add(r.note, new Tone.ToneAudioBuffer(r.buffer));
  });

  return { sampler, missing: results.filter(r => r.err).map(r => r.note) };
}

const samplers    = {};
let   loadPromise = null;

function initSamplers() {
  if (loadPromise) return loadPromise;

  Tone.context.latencyHint     = 'interactive';
  Tone.context.lookAhead       = 0.01;
  Tone.context.updateInterval  = 0.01;

  const reverb    = new Tone.Reverb({ decay: 2.5, wet: 0.15 });
  const masterVol = new Tone.Volume(-6);
  reverb.connect(masterVol);
  masterVol.toDestination();

  loadPromise = Promise.all(LAYERS.map(layer => buildSampler(layer, reverb)))
    .then((built) => {
      const missing = [];
      built.forEach(({ sampler, missing: gone }, i) => {
        samplers[LAYERS[i]] = sampler;
        gone.forEach(n => missing.push(`${n}-${LAYERS[i]}`));
      });

      if (missing.length === LAYERS.length * SAMPLE_NOTES.length) {
        // Nothing loaded at all — say so instead of spinning forever.
        loadError = `no samples found in ${sampleDir().pathname}`;
        console.error('[Audio]', loadError);
      } else if (missing.length) {
        console.warn(`[Audio] ${missing.length} sample(s) missing:`, missing.slice(0, 8).join(', '),
                     missing.length > 8 ? `…and ${missing.length - 8} more` : '');
        samplersReady = true;
      } else {
        samplersReady = true;
        console.log('[Audio] Rhodes samples loaded');
      }
      updateAudioBtn();
    })
    .catch((err) => {
      loadError = err.message;
      console.error('[Audio] failed to load samples:', err);
      updateAudioBtn();
    });

  return loadPromise;
}

// ── Note on/off ────────────────────────────────────────────────────────────

function startNote(midi, velocity) {
  if (!audioEnabled || !samplersReady) return;
  const layer = getLayer(velocity);
  const note  = Tone.Frequency(midi, 'midi').toNote();
  stopNote(midi);
  samplers[layer].triggerAttack(note, Tone.context.currentTime, velocity / 127);
  activeNotes.set(midi, layer);
}

function stopNote(midi) {
  const layer = activeNotes.get(midi);
  if (!layer) return;
  samplers[layer].triggerRelease(Tone.Frequency(midi, 'midi').toNote(), Tone.context.currentTime);
  activeNotes.delete(midi);
}

function stopAllNotes() {
  [...activeNotes.keys()].forEach(stopNote);
}

// ── Button ─────────────────────────────────────────────────────────────────

function updateAudioBtn() {
  const btn = document.getElementById('audio-toggle-btn');
  if (!btn) return;

  if (loadError) {
    btn.textContent = '⚠ No samples';
    btn.title       = loadError;
    btn.classList.remove('active');
  } else if (audioEnabled && !samplersReady) {
    btn.textContent = '◌ Loading…';
    btn.classList.remove('active');
  } else {
    btn.textContent = audioEnabled ? '⊙ Sound' : '○ Sound';
    btn.title       = '';
    btn.classList.toggle('active', audioEnabled);
  }
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  if (audioEnabled) {
    Tone.start();                       // resume AudioContext — needs a user gesture
    if (!samplersReady) initSamplers();
  } else {
    stopAllNotes();
  }
  updateAudioBtn();
}

function wireAudioButton() {
  document.getElementById('audio-toggle-btn')?.addEventListener('click', toggleAudio);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireAudioButton);
} else {
  wireAudioButton();
}

window.AudioEngine = { startNote, stopNote, stopAllNotes, toggleAudio };

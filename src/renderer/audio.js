/**
 * audio.js
 * Voice Me — the sampled instrument.
 *
 * ── The app does not know which instrument it is playing ───────────────────
 *
 * Everything comes from `sounds/instrument.json`, written by
 * build/install-samples.py from the pack's own .sfz: the velocity bands, which
 * pitches were sampled, and which file to play for each combination. Swapping
 * instruments is re-running that script — no code changes, no hardcoded note
 * lists. That matters because the current pack is CC BY-NC and may have to be
 * replaced.
 *
 * ── Why the samples are fetched and decoded by hand ────────────────────────
 *
 * Not by handing Tone.Sampler a `urls` map, because Tone's URL handling breaks
 * on any install path containing a space. Tone normalises a sample URL by
 * re-encoding the whole pathname a segment at a time:
 * `(a.pathname + a.hash).split('/').map(encodeURIComponent)`. The pathname it
 * starts from is ALREADY percent-encoded, so a folder called "Voice Me"
 * arrives as `Voice%20Me` and comes out as `Voice%2520Me` — a path that does
 * not exist. Every fetch fails, the load promise never settles, and the Sound
 * button spins on "Loading…" forever with no error.
 *
 * That is not a corner case: `productName` is "Voice Me", so the packaged app
 * lives at `/Applications/Voice Me.app/` and would ship with silent audio.
 * Encoding only the FILENAME against an absolute directory URL sidesteps it.
 */

let   audioEnabled  = false;
let   samplersReady = false;
let   loadError     = null;
let   instrument    = null;          // the parsed manifest
const samplers      = [];            // one per velocity band, index-aligned
const activeNotes   = new Map();     // midi → band index

const MANIFEST_URL = './sounds/instrument.json';

// ── Loading ────────────────────────────────────────────────────────────────

function soundsUrl(relative) {
  // Only the final path component is encoded — see the note above.
  const dir = new URL('./sounds/', document.baseURI);
  const parts = relative.split('/').map(encodeURIComponent).join('/');
  return new URL(parts, dir).href;
}

async function decodeSample(file) {
  const res = await fetch(soundsUrl(`${instrument.dir}/${file}`));
  if (!res.ok) throw new Error(`${file} — HTTP ${res.status}`);
  return Tone.context.rawContext.decodeAudioData(await res.arrayBuffer());
}

/** Which velocity band does this stroke belong to? */
function bandFor(velocity) {
  const layers = instrument.layers;
  for (const l of layers) {
    if (velocity >= l.loVel && velocity <= l.hiVel) return l.index;
  }
  return layers[layers.length - 1].index;
}

let loadPromise = null;

function initSamplers() {
  if (loadPromise) return loadPromise;

  Tone.context.latencyHint    = 'interactive';
  Tone.context.lookAhead      = 0.01;
  Tone.context.updateInterval = 0.01;

  const reverb    = new Tone.Reverb({ decay: 2.5, wet: 0.15 });
  const masterVol = new Tone.Volume(-6);
  reverb.connect(masterVol);
  masterVol.toDestination();

  loadPromise = (async () => {
    const res = await fetch(new URL(MANIFEST_URL, document.baseURI).href);
    if (!res.ok) throw new Error(`no instrument installed (${MANIFEST_URL}) — run build/install-samples.py`);
    instrument = await res.json();

    // A file can serve more than one band, so decode the unique set once.
    const needed = new Set();
    instrument.zones.forEach(z => Object.values(z.files).forEach(f => needed.add(f)));

    const buffers = new Map();
    const missing = [];
    await Promise.all([...needed].map(async (file) => {
      try   { buffers.set(file, await decodeSample(file)); }
      catch (err) { missing.push(file); }
    }));

    if (buffers.size === 0) {
      throw new Error(`could not load any samples from sounds/${instrument.dir}/`);
    }
    if (missing.length) {
      console.warn(`[Audio] ${missing.length} sample(s) missing:`, missing.slice(0, 6).join(', '));
    }

    for (const layer of instrument.layers) {
      const sampler = new Tone.Sampler().connect(reverb);
      for (const zone of instrument.zones) {
        const file = zone.files[String(layer.index)];
        const buf  = file && buffers.get(file);
        if (buf) sampler.add(Tone.Frequency(zone.midi, 'midi').toNote(), new Tone.ToneAudioBuffer(buf));
      }
      samplers[layer.index] = sampler;
    }

    samplersReady = true;
    console.log(`[Audio] ${instrument.name} loaded — ${buffers.size} samples, ` +
                `${instrument.layers.length} velocity layers`);
    console.log(`[Audio] ${instrument.credit} (${instrument.licence})`);
    updateAudioBtn();
  })().catch((err) => {
    loadError = err.message;
    console.error('[Audio]', err);
    updateAudioBtn();
  });

  return loadPromise;
}

// ── Note on/off ────────────────────────────────────────────────────────────

function startNote(midi, velocity) {
  if (!audioEnabled || !samplersReady) return;
  const band = bandFor(velocity);
  const sampler = samplers[band];
  if (!sampler) return;
  stopNote(midi);
  sampler.triggerAttack(Tone.Frequency(midi, 'midi').toNote(), Tone.context.currentTime);
  activeNotes.set(midi, band);
}

function stopNote(midi) {
  const band = activeNotes.get(midi);
  if (band === undefined) return;
  samplers[band]?.triggerRelease(Tone.Frequency(midi, 'midi').toNote(), Tone.context.currentTime);
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
    btn.title       = instrument ? `${instrument.credit} — ${instrument.licence}` : '';
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

window.AudioEngine = {
  startNote, stopNote, stopAllNotes, toggleAudio,
  /** The attribution the sample licence requires — for an About panel. */
  credit: () => instrument && {
    name: instrument.name, instrument: instrument.instrument,
    credit: instrument.credit, licence: instrument.licence,
    licenceUrl: instrument.licenceUrl, source: instrument.source,
  },
};

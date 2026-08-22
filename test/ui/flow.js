/**
 * flow.js
 * Compose-mode flow test. Runs inside Electron against the real app.js and
 * compose.js — `npm run test:ui`.
 *
 * The harmony invariants in ../harmony.test.js cover the engine. This covers
 * the things only the wired-up app can be wrong about: whether a device is
 * walkable chord by chord, whether the ledger's practice mode works, and
 * whether a key's prompt survives being played.
 */

const NM = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const nm = m => NM[m % 12] + (Math.floor(m / 12) - 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ok    ${label}`); }
  else      { console.log(`FAIL    ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

// Cue colours, mirrored from app.js INK.
const GOLD = ['#F59E0B', '#FDE68A'];
const BLUE = ['#3B82F6', '#93C5FD'];

function tag(midi) {
  const el = document.querySelector(`[data-midi="${midi}"]`);
  if (!el) return 'none';
  const f = el.getAttribute('fill');
  if (GOLD.includes(f)) return 'GOLD';
  if (BLUE.includes(f)) return 'BLUE';
  return f.startsWith('url(') ? 'plain' : f;
}

function litKeys() {
  const out = [];
  for (let n = 33; n <= 96; n++) if (tag(n) === 'GOLD' || tag(n) === 'BLUE') out.push(n);
  return out;
}

const isCued = n => tag(n) === 'GOLD' || tag(n) === 'BLUE';
const status = () => document.getElementById('compose-status').textContent;
const ledger = () => [...document.querySelectorAll('.trail-chord')];
const click  = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

window.addEventListener('DOMContentLoaded', () => (async () => {
  try {
    const T = window.VoiceMeTestInput;
    Compose.activate();

    // ── Walking a device ──────────────────────────────────────────────────
    console.log('\nwalking a multi-chord device');
    T.play([48, 52, 55, 59]);                       // Cmaj7, close position
    await sleep(50);

    const tips = [...document.querySelectorAll('.branch-tip')];
    // One branch per slot — asserted against the engine so adding a slot does
    // not silently leave this test describing an older tree.
    const slots = window.Harmony.SLOTS.length;
    ok(`the tree grows one branch per slot (${slots})`, tips.length === slots, `got ${tips.length}`);

    click(tips[2]);
    ok('selecting a branch prompts for its first chord', /^Play /.test(status()), status());

    const step1 = litKeys();
    ok('the first chord is fully cued', step1.length >= 3, `${step1.length} keys lit`);

    T.play(step1);
    await sleep(500);
    const advanced = /2 of 2|2 of 3/.test(status());
    ok('playing it advances to the next chord of the device', advanced, status());

    const step2 = litKeys();
    T.play(step2);
    await sleep(1700);
    T.releaseAll();
    await sleep(50);

    ok('the whole device lands in the ledger', ledger().length >= 3, `${ledger().length} chords`);

    const rootAfter = document.querySelector('.root-chord-text')?.textContent;
    const lastName  = ledger()[ledger().length - 1].textContent;
    ok("the device's last chord becomes the new tree root", rootAfter === lastName,
       `root ${rootAfter}, ledger ends ${lastName}`);

    // ── Practice ──────────────────────────────────────────────────────────
    console.log('\npractising a committed chord');
    const before = ledger().map(e => e.textContent).join('|');
    click(ledger()[1]);
    await sleep(50);

    ok('clicking a ledger chord enters practice', /Practising/.test(status()), status());
    ok('the practised chord is marked', ledger()[1].className.includes('practising'));

    const cued = litKeys();
    ok('its committed voicing is cued', cued.length >= 3, `${cued.length} keys lit`);
    console.log('        cue: ' + cued.map(n => nm(n) + ':' + tag(n)).join('  '));

    ok('the tree does not rewind',
       document.querySelector('.root-chord-text')?.textContent === rootAfter);
    ok('the ledger is untouched', ledger().map(e => e.textContent).join('|') === before);

    // ── A prompt must survive being played ────────────────────────────────
    // This is the one that matters: press one note of the chord and every
    // prompt must stay put. If a key's cue cleared as you pressed it, you
    // would lose your place the moment you lifted a finger.
    console.log('\nprompts survive a partial press');
    T.press([cued[0]]);
    await sleep(60);
    ok('pressing one note clears no prompt', cued.every(isCued),
       cued.map(n => nm(n) + ':' + tag(n)).join(' '));

    T.press([cued[1]]);
    await sleep(60);
    ok('pressing a second note clears no prompt', cued.every(isCued),
       cued.map(n => nm(n) + ':' + tag(n)).join(' '));

    T.releaseAll();
    await sleep(60);
    ok('lifting your hands leaves the prompt up', cued.every(isCued),
       cued.map(n => nm(n) + ':' + tag(n)).join(' '));

    T.play(cued);
    await sleep(150);
    ok('completing the chord confirms it', /✓/.test(status()), status());

    // ── Leaving practice ──────────────────────────────────────────────────
    console.log('\nleaving practice');
    T.releaseAll();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(50);
    ok('Escape stops practising', !/Practising/.test(status()), status());
    ok('the keyboard is cleared', litKeys().length === 0, `${litKeys().length} still lit`);
  } catch (err) {
    console.log('FAIL    threw: ' + err.message);
    console.log(err.stack);
  }

  console.log(`\n${failures ? failures + ' failed' : 'all compose-flow checks passed'}`);
  console.log('UI-DONE');
})());

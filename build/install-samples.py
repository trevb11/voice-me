#!/usr/bin/env python3
"""
install-samples.py — install a sampled instrument into Voice Me.

    python3 build/install-samples.py /path/to/jlearman.jRhodes3d

Reads the pack's own .sfz as the source of truth — which notes were sampled,
which velocity layer each file belongs to, and what range each layer covers —
copies the audio into src/renderer/sounds/<pack>/, and writes a manifest.json
alongside it.

audio.js reads that manifest and nothing else. The app therefore has no
knowledge of any particular sample set: swapping packs is re-running this
script, not editing code. That matters here because the current pack is
CC BY-NC, and a licence change is a live possibility.

The manifest also carries the attribution the licence requires, so the credit
travels with the audio instead of living in a comment someone can forget.
"""

import json, os, re, shutil, sys

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUNDS   = os.path.join(ROOT, 'src', 'renderer', 'sounds')

# Which flavour of the pack to install. Mono is a third the size of stereo and
# half the decoded memory; for a teaching tool that matters more than width.
PREFERRED_DIRS = ['jRhodes3d-mono', 'jRhodes3d-st', 'jRhodes3d-sv']
PREFERRED_SFZ  = ['jRhodes3d-mono-no-xfade.sfz', 'jRhodes3d-mono.sfz']

CREDIT = {
    'name':       'jRhodes3d',
    'instrument': '1977 Rhodes Mark I Stage 73',
    'credit':     'jRhodes3d samples by Jeff Learman',
    'licence':    'CC BY-NC 4.0',
    'licenceUrl': 'https://creativecommons.org/licenses/by-nc/4.0/',
    'source':     'https://github.com/sfzinstruments/jlearman.jRhodes3d',
    'modified':   'Subset installed; unused velocity layers and zones omitted. Audio itself unaltered.',
}

GROUP_RE  = re.compile(r'^<group>.*?lovel=(\d+).*?hivel=(\d+)', re.I)
REGION_RE = re.compile(r'sample=(\S+)')
LAYER_RE  = re.compile(r'_(\d)\.(flac|wav|ogg)$', re.I)
NAME_RE   = re.compile(r'^A_(\d+)__([A-G][b#]?\d)_\d$')


def parse_sfz(path):
    """→ (layers, zones). Layers are velocity bands; zones are sampled pitches.

    A layer is identified by its VELOCITY RANGE, not by the `_N` suffix of the
    files in it. Those are not the same thing: where a note was never recorded
    at a given dynamic, the pack substitutes the neighbouring layer's file, so
    the 73–95 band is mostly `_3` files with `_4` standing in for six notes.
    Keying on the suffix throws those substitutes away and leaves holes in the
    layer. The .sfz already says exactly which file to play for which velocity
    on which key — take it at its word.
    """
    layers, zones = [], {}
    index = -1

    for line in open(path, encoding='utf-8', errors='replace'):
        stripped = line.strip()
        g = GROUP_RE.match(stripped)
        if g:
            index += 1
            layers.append({'index': index,
                           'loVel': int(g.group(1)),
                           'hiVel': int(g.group(2))})
            continue

        if not stripped.startswith('<region>') or index < 0:
            continue
        m = REGION_RE.search(stripped)
        if not m:
            continue
        fname = os.path.basename(m.group(1))

        nm = NAME_RE.match(os.path.splitext(fname)[0])
        if not nm:
            print(f'  ! unrecognised sample name, skipping: {fname}')
            continue
        midi, note = int(nm.group(1)), nm.group(2)
        zones.setdefault(midi, {'midi': midi, 'note': note, 'files': {}})
        zones[midi]['files'][str(index)] = fname

    layers.sort(key=lambda l: l['loVel'])
    return layers, [zones[k] for k in sorted(zones)]


def main():
    if len(sys.argv) < 2:
        sys.exit(f'usage: {sys.argv[0]} /path/to/sample-pack')
    pack = os.path.abspath(sys.argv[1])
    if not os.path.isdir(pack):
        sys.exit(f'not a directory: {pack}')

    audio_dir = next((os.path.join(pack, d) for d in PREFERRED_DIRS
                      if os.path.isdir(os.path.join(pack, d))), None)
    sfz = next((os.path.join(pack, f) for f in PREFERRED_SFZ
                if os.path.isfile(os.path.join(pack, f))), None)
    if not audio_dir or not sfz:
        sys.exit(f'could not find the expected audio folder / .sfz inside {pack}')

    print(f'pack : {pack}')
    print(f'audio: {os.path.basename(audio_dir)}')
    print(f'sfz  : {os.path.basename(sfz)}')

    layers, zones = parse_sfz(sfz)
    print(f'\n{len(layers)} velocity layers, {len(zones)} sampled pitches')
    for l in layers:
        have = sum(1 for z in zones if str(l['index']) in z['files'])
        flag = '' if have == len(zones) else '   <- incomplete'
        print(f"  band {l['index']}: velocity {l['loVel']:>3}-{l['hiVel']:<3}  {have}/{len(zones)} zones{flag}")

    dest = os.path.join(SOUNDS, CREDIT['name'])
    if os.path.isdir(dest):
        shutil.rmtree(dest)
    os.makedirs(dest, exist_ok=True)

    # A file can serve more than one band (a substitute stands in where a note
    # was not recorded at that dynamic), so copy the unique set.
    wanted = set()
    for z in zones:
        for band, fname in list(z['files'].items()):
            if os.path.isfile(os.path.join(audio_dir, fname)):
                wanted.add(fname)
            else:
                print(f'  ! missing {fname}, dropping from manifest')
                del z['files'][band]

    total = 0
    for fname in sorted(wanted):
        src = os.path.join(audio_dir, fname)
        shutil.copy2(src, os.path.join(dest, fname))
        total += os.path.getsize(src)
    copied = len(wanted)

    manifest = dict(CREDIT)
    manifest['dir']    = CREDIT['name']
    manifest['layers'] = layers
    manifest['zones']  = zones

    # Written at a FIXED path so audio.js never needs to know which pack is
    # installed — swapping instruments rewrites this one file.
    for path in (os.path.join(SOUNDS, 'instrument.json'),
                 os.path.join(dest, 'manifest.json')):
        with open(path, 'w') as f:
            json.dump(manifest, f, indent=2)
            f.write('\n')

    # The licence has to travel with the audio.
    shutil.copy2(os.path.join(pack, 'LICENSE'), os.path.join(dest, 'LICENSE'))

    print(f'\ninstalled {copied} files ({total / 1048576:.1f} MB) → {dest}')
    print(f'  sounds/instrument.json + LICENSE written')
    print(f'\n  {CREDIT["credit"]} — {CREDIT["licence"]}')


if __name__ == '__main__':
    main()

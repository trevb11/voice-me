#!/usr/bin/env python3
"""
check-samples.py — refuse to build with the wrong audio in the tree.

Runs as npm `prebuild`. Three things it will not let past:

  1. No instrument installed at all — the app would ship silent.
  2. A file the manifest references is missing — the app would ship with holes.
  3. Audio in src/renderer/sounds/ that the manifest does NOT reference.

The third is the one that matters. Sample licences differ wildly, and some
forbid redistribution inside a sampler entirely — bundling the wrong folder is
a licensing problem, not a bug, and it is completely silent. A leftover pack
from an earlier experiment is exactly the kind of thing that ships by accident.
"""

import json, os, sys

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUNDS = os.path.join(ROOT, 'src', 'renderer', 'sounds')
MANIFEST = os.path.join(SOUNDS, 'instrument.json')
AUDIO_EXT = {'.wav', '.flac', '.ogg', '.mp3', '.aif', '.aiff', '.m4a'}

problems = []

if not os.path.isfile(MANIFEST):
    sys.exit('no instrument installed — run:\n'
             '  python3 build/install-samples.py /path/to/sample-pack')

with open(MANIFEST) as f:
    m = json.load(f)

pack_dir = os.path.join(SOUNDS, m['dir'])
referenced = set()
for zone in m['zones']:
    for fname in zone['files'].values():
        referenced.add(fname)
        if not os.path.isfile(os.path.join(pack_dir, fname)):
            problems.append(f'missing: {m["dir"]}/{fname}')

# Anything audio-shaped under sounds/ that the manifest does not claim.
strays = []
for dirpath, _dirnames, filenames in os.walk(SOUNDS):
    for fname in filenames:
        if os.path.splitext(fname)[1].lower() not in AUDIO_EXT:
            continue
        full = os.path.join(dirpath, fname)
        rel  = os.path.relpath(full, SOUNDS)
        if os.path.dirname(rel) == m['dir'] and fname in referenced:
            continue
        strays.append((rel, os.path.getsize(full)))

if strays:
    total = sum(s for _, s in strays) / 1048576
    problems.append(
        f'{len(strays)} unreferenced audio file(s) under src/renderer/sounds/ ({total:.0f} MB).\n'
        '  These would be bundled into the build. If they came from another sample\n'
        '  pack, check its licence before shipping them — many permit use in music\n'
        '  but forbid redistribution inside a sampler.\n'
        '  Offenders: ' + ', '.join(sorted({os.path.dirname(r) or r for r, _ in strays})))

if problems:
    print('sample check FAILED\n')
    for p in problems:
        print('  ' + p)
    sys.exit(1)

size = sum(os.path.getsize(os.path.join(pack_dir, f)) for f in referenced) / 1048576
print(f'sample check ok — {m["name"]}: {len(referenced)} files, {size:.1f} MB')
print(f'  {m["credit"]} ({m["licence"]})')

/**
 * voicings.js
 * Voice Me Voicing Library — curated jazz piano voicings.
 * MIDI note reference: Middle C = C4 = 60
 */

const VOICING_LIBRARY = [

  // ── TRIADS ────────────────────────────────────────────────────────────────
  {
    family: 'Triads',
    chord: 'C major',
    root: 0,
    voicings: [
      {
        id: 'c-maj-root',
        name: 'Root Position',
        pianist: null,
        genre: ['Jazz', 'Gospel', 'Blues', 'Neo-Soul', 'Bossa'],
        notes: [60, 64, 67],
        description: 'The foundation of all harmony. Root, third, fifth in close position. Every voicing in this library extends from this point of departure.',
        tags: ['Root Position', 'Close Voicing'],
        resolves: null,
      },
      {
        id: 'c-maj-1st',
        name: 'First Inversion',
        pianist: null,
        genre: ['Jazz', 'Gospel', 'Blues', 'Neo-Soul'],
        notes: [64, 67, 72],
        description: 'Third in the bass. Creates smoother voice leading between chords — the bass moves by step rather than leaping. Essential for elegant progressions.',
        tags: ['Inversion', 'Voice Leading'],
        resolves: null,
      },
    ]
  },

  // ── MAJOR 7THS ────────────────────────────────────────────────────────────
  {
    family: 'Major 7ths',
    chord: 'Cmaj7',
    root: 0,
    voicings: [
      {
        id: 'cmaj7-standard',
        name: 'Standard',
        pianist: null,
        genre: ['Jazz', 'Bossa', 'Neo-Soul'],
        notes: [60, 64, 67, 71],
        description: 'The textbook Cmaj7. Root, third, fifth, seventh in close position. Clear, balanced, and immediately recognizable as jazz.',
        tags: ['Root Position', 'Close Voicing'],
        resolves: 'Fmaj7',
      },
      {
        id: 'cmaj7-evans',
        name: 'Bill Evans — Rootless',
        pianist: 'Evans',
        genre: ['Jazz'],
        notes: [59, 64, 69],
        description: 'Evans dropped the root entirely and let the bassist handle it. This three-note voicing — 7th, 3rd, 13th — creates maximum harmonic color with minimum clutter. Spacious, impressionistic, and unmistakably Evans.',
        tags: ['Rootless', 'Impressionistic', 'Sparse'],
        resolves: 'Dm7',
      },
      {
        id: 'cmaj7-herbie',
        name: 'Herbie Hancock — Quartal',
        pianist: 'Herbie',
        genre: ['Jazz'],
        notes: [64, 69, 74, 79],
        description: 'Herbie built chords in stacked perfect fourths instead of thirds, creating an open, ambiguous, modern sound. No root, no clear tonal center — pure color. This is the Maiden Voyage sound.',
        tags: ['Quartal', 'Rootless', 'Modal', 'Open'],
        resolves: null,
      },
      {
        id: 'cmaj7-glasper',
        name: 'Robert Glasper — Spread',
        pianist: 'Glasper',
        genre: ['Jazz', 'Neo-Soul'],
        notes: [60, 64, 71, 74],
        description: 'Glasper spreads the voicing wide — root and third close together at the bottom, 7th and 9th at the top. The wide interval in the middle gives it that lush, modern neo-soul quality.',
        tags: ['Spread Voicing', 'Lush', 'Modern'],
        resolves: 'Dm7',
      },
    ]
  },

  {
    family: 'Major 7ths',
    chord: 'Fmaj7',
    root: 5,
    voicings: [
      {
        id: 'fmaj7-standard',
        name: 'Standard',
        pianist: null,
        genre: ['Jazz', 'Bossa', 'Neo-Soul'],
        notes: [65, 69, 72, 76],
        description: 'Root position Fmaj7. The IV chord in C major — one of the most restful, resolved sounds in tonal music.',
        tags: ['Root Position'],
        resolves: 'Em7',
      },
      {
        id: 'fmaj7-sharp11-herbie',
        name: 'Herbie — Lydian (#11)',
        pianist: 'Herbie',
        genre: ['Jazz'],
        notes: [65, 69, 71, 76],
        description: 'Adding the #11 (B natural) to Fmaj7 creates the Lydian sound — bright, floating, slightly unresolved. Herbie used this to give major chords a mysterious, otherworldly quality.',
        tags: ['Lydian', '#11', 'Modal'],
        resolves: null,
      },
    ]
  },

  // ── MINOR 7THS ────────────────────────────────────────────────────────────
  {
    family: 'Minor 7ths',
    chord: 'Dm7',
    root: 2,
    voicings: [
      {
        id: 'dm7-standard',
        name: 'Standard',
        pianist: null,
        genre: ['Jazz', 'Bossa', 'Neo-Soul', 'Blues'],
        notes: [62, 65, 69, 72],
        description: 'Root position Dm7. The ii chord in C major — the workhorse of ii-V-I progressions. Every jazz musician has this in their muscle memory.',
        tags: ['Root Position', 'ii chord'],
        resolves: 'G7',
      },
      {
        id: 'dm7-evans-rootless',
        name: 'Bill Evans — Rootless',
        pianist: 'Evans',
        genre: ['Jazz'],
        notes: [60, 65, 69],
        description: 'Evans voices from the 7th up, dropping the root. C-F-A — seventh, third, fifth. Clean, uncluttered, and leaves the bassist room to breathe.',
        tags: ['Rootless', 'Left Hand', 'Voice Leading'],
        resolves: 'G7',
      },
      {
        id: 'dm9-glasper',
        name: 'Robert Glasper — Dm9',
        pianist: 'Glasper',
        genre: ['Jazz', 'Neo-Soul'],
        notes: [62, 65, 72, 76],
        description: 'Glasper almost always adds the 9th to minor chords. Root, minor 3rd, 7th, 9th spread wide. Warm, lush, and sits perfectly in an R&B context.',
        tags: ['Extension', '9th', 'Spread', 'Lush'],
        resolves: 'G9',
      },
    ]
  },

  {
    family: 'Minor 7ths',
    chord: 'Am7',
    root: 9,
    voicings: [
      {
        id: 'am7-standard',
        name: 'Standard',
        pianist: null,
        genre: ['Jazz', 'Bossa', 'Neo-Soul'],
        notes: [57, 60, 64, 67],
        description: 'Root position Am7. The vi chord in C major — naturally connected to Cmaj7 by sharing three common tones.',
        tags: ['Root Position', 'vi chord'],
        resolves: 'Dm7',
      },
      {
        id: 'am7-glasper',
        name: 'Robert Glasper — Am9',
        pianist: 'Glasper',
        genre: ['Jazz', 'Neo-Soul'],
        notes: [57, 60, 67, 71],
        description: 'Adding the 9th (B) on top transforms Am7 into Am9. Glasper\'s signature move — the upper extension gives even simple minor chords a richer, more contemporary sound.',
        tags: ['Extension', '9th', 'Modern'],
        resolves: 'Dm7',
      },
    ]
  },

  // ── DOMINANT 7THS ─────────────────────────────────────────────────────────
  {
    family: 'Dominant 7ths',
    chord: 'G7',
    root: 7,
    voicings: [
      {
        id: 'g7-standard',
        name: 'Standard',
        pianist: null,
        genre: ['Jazz', 'Blues', 'Gospel', 'Bossa'],
        notes: [55, 59, 62, 65],
        description: 'The essential dominant seventh. Creates maximum tension wanting to resolve to C. The tritone between B and F is the engine of tonal harmony — two notes that desperately want to move.',
        tags: ['Root Position', 'Tritone', 'Tension'],
        resolves: 'Cmaj7',
      },
      {
        id: 'g7-guide-tones',
        name: 'Guide Tones Only',
        pianist: null,
        genre: ['Jazz'],
        notes: [59, 65],
        description: 'Strip everything away — just play the 3rd and 7th. This tritone (B–F) defines the entire G7 chord and implies the resolution. One of the most fundamental jazz piano concepts: two notes can say everything.',
        tags: ['Guide Tones', 'Tritone', 'Minimalist'],
        resolves: 'Cmaj7',
      },
      {
        id: 'g7alt-herbie',
        name: 'Herbie — Altered Dominant',
        pianist: 'Herbie',
        genre: ['Jazz'],
        notes: [59, 65, 68, 73],
        description: 'Before resolving, Herbie would alter the 5th and 9th for maximum tension. B–F–Ab–Db: the 3rd, b7, b9, and b5 of G7alt. Dissonant, urgent, and electrifying right before landing on Cmaj7.',
        tags: ['Altered', 'Tension', 'Modern'],
        resolves: 'Cmaj7',
      },
      {
        id: 'g9-standard',
        name: 'G9',
        pianist: null,
        genre: ['Jazz', 'Neo-Soul', 'Gospel'],
        notes: [55, 59, 65, 69],
        description: 'Adding the 9th to a dominant chord is one of jazz\'s most natural moves. Root, 3rd, 7th, 9th — warmer and richer than a plain G7 without adding dissonance.',
        tags: ['Extension', '9th', 'Warm'],
        resolves: 'Cmaj7',
      },
    ]
  },

  // ── ALTERED DOMINANTS ─────────────────────────────────────────────────────
  {
    family: 'Altered Dominants',
    chord: 'G7alt',
    root: 7,
    voicings: [
      {
        id: 'g7-sharp9-herbie',
        name: 'Herbie — 7#9 (Hendrix Chord)',
        pianist: 'Herbie',
        genre: ['Jazz'],
        notes: [55, 59, 65, 68],
        description: 'The #9 chord — a dominant 7th with a raised (augmented) 9th. Contains both a major 3rd and a minor 3rd simultaneously, creating extreme tension. Used across jazz, blues, and rock.',
        tags: ['Altered', '#9', 'Tension', 'Blues'],
        resolves: 'Cmaj7',
      },
    ]
  },

  {
    family: 'Altered Dominants',
    chord: 'Db7 (tritone sub)',
    root: 1,
    voicings: [
      {
        id: 'db7-tritone-sub',
        name: 'Lydian Dominant — Tritone Sub',
        pianist: 'Herbie',
        genre: ['Jazz'],
        notes: [61, 65, 71, 74],
        description: 'Db7 is the tritone substitution for G7 — they share the same tritone (B/Cb and F). Herbie used this constantly. The #11 (G natural) gives it an eerie, floating quality before resolving to Cmaj7.',
        tags: ['Tritone Sub', 'Lydian Dominant', 'Modal'],
        resolves: 'Cmaj7',
      },
    ]
  },

  // ── SUS CHORDS ────────────────────────────────────────────────────────────
  {
    family: 'Sus Chords',
    chord: 'G7sus4',
    root: 7,
    voicings: [
      {
        id: 'g7sus4-standard',
        name: 'Standard',
        pianist: null,
        genre: ['Jazz', 'Neo-Soul', 'Gospel'],
        notes: [55, 60, 62, 65],
        description: 'The 4th replaces the 3rd, suspending resolution. A pre-dominant sound in gospel and jazz — it sits and breathes before resolving to G7 or directly to C.',
        tags: ['Suspended', 'Pre-dominant'],
        resolves: 'G7 or Cmaj7',
      },
      {
        id: 'f9sus4-glasper',
        name: 'Robert Glasper — F9sus4',
        pianist: 'Glasper',
        genre: ['Jazz', 'Neo-Soul'],
        notes: [65, 70, 72, 74, 77],
        description: 'This voicing is all over Glasper\'s work — a dense sus chord with the 9th added. The upper cluster (C, D, F) creates that signature neo-soul hypnotic quality. Think Afro Blue from Black Radio.',
        tags: ['Sus9', 'Cluster', 'Neo-Soul', 'Dense'],
        resolves: 'Bbmaj7',
      },
    ]
  },

  {
    family: 'Sus Chords',
    chord: 'So What Chord',
    root: 2,
    voicings: [
      {
        id: 'so-what-chord',
        name: 'So What (Bill Evans / Miles Davis)',
        pianist: 'Evans',
        genre: ['Jazz'],
        notes: [50, 55, 60, 64, 65],
        description: 'Bill Evans voiced this chord for Miles Davis on Kind of Blue. Four perfect fourths stacked (D–G–C–F), then a major third on top to E. The sound of modal jazz. Technically Dm11 but it functions as pure color without tonal destination.',
        tags: ['Quartal', 'Modal', 'Historic', 'Kind of Blue'],
        resolves: null,
      },
    ]
  },

  // ── QUARTAL ───────────────────────────────────────────────────────────────
  {
    family: 'Quartal',
    chord: 'Cm Quartal',
    root: 0,
    voicings: [
      {
        id: 'cm-mccoy-quartal',
        name: 'McCoy Tyner — Cm Quartal',
        pianist: 'McCoy',
        genre: ['Jazz'],
        notes: [60, 65, 70, 75],
        description: 'McCoy Tyner\'s signature sound from his Coltrane Quartet years. Four notes stacked in perfect fourths from the root: C–F–Bb–Eb. Powerful, percussive, modal, and unmistakably McCoy. This is A Love Supreme.',
        tags: ['Quartal', 'Modal', 'Powerful', 'Coltrane'],
        resolves: null,
      },
    ]
  },

  // ── GOSPEL ────────────────────────────────────────────────────────────────
  {
    family: 'Gospel',
    chord: 'C9 (Gospel)',
    root: 0,
    voicings: [
      {
        id: 'c9-gospel-shout',
        name: 'Gospel Shout Chord',
        pianist: null,
        genre: ['Gospel'],
        notes: [60, 64, 67, 70, 74],
        description: 'The full-handed gospel C9 — all five chord tones voiced together. Root, 3rd, 5th, b7, 9th in a dense cluster. This is the "shout" chord — play it loud, with authority. It drives the congregation.',
        tags: ['Shout', 'Full Voicing', 'Dense', 'Powerful'],
        resolves: 'F7',
      },
      {
        id: 'gospel-shell',
        name: 'Gospel Shell Voicing',
        pianist: null,
        genre: ['Gospel'],
        notes: [60, 67, 70, 76],
        description: 'An open shell with the root, 5th, b7, and major 3rd spread wide. Creates the gospel tension before the IV chord. Less dense than the shout chord but just as intentional.',
        tags: ['Shell', 'Open Voicing', 'Gospel Walk'],
        resolves: 'F or Fmaj7',
      },
    ]
  },

  // ── MONK ──────────────────────────────────────────────────────────────────
  {
    family: 'Thelonious Monk',
    chord: 'Cmaj7 (Monk)',
    root: 0,
    voicings: [
      {
        id: 'cmaj7-monk',
        name: 'Monk — Semitone Clash',
        pianist: 'Monk',
        genre: ['Jazz'],
        notes: [60, 64, 71, 72],
        description: 'Monk deliberately placed the major 7th (B) and the octave (C) together — a semitone apart. Jarring, angular, completely intentional. What sounds like a mistake is Monk\'s signature: he found beauty in the dissonance everyone else avoided.',
        tags: ['Dissonance', 'Angular', 'Semitone', 'Intentional'],
        resolves: null,
      },
    ]
  },

  // ── EXTENDED ──────────────────────────────────────────────────────────────
  {
    family: 'Extended',
    chord: 'Cmaj9',
    root: 0,
    voicings: [
      {
        id: 'cmaj9-glasper',
        name: 'Robert Glasper — Cmaj9',
        pianist: 'Glasper',
        genre: ['Jazz', 'Neo-Soul'],
        notes: [60, 64, 71, 74],
        description: 'Root, 3rd, 7th, 9th spread across two octaves. This is Glasper\'s signature major sound — lush without being thick, extended without being academic. A staple of contemporary jazz piano.',
        tags: ['Extension', 'Spread', 'Modern', 'Lush'],
        resolves: 'Fmaj9',
      },
    ]
  },

  {
    family: 'Extended',
    chord: 'Dm11',
    root: 2,
    voicings: [
      {
        id: 'dm11-cluster',
        name: 'Minor 11th Cluster',
        pianist: 'Glasper',
        genre: ['Jazz', 'Neo-Soul'],
        notes: [62, 65, 67, 69, 72],
        description: 'D, F, G, A, C — root, b3, 11th, 13th, b7. A dense cluster voicing that jazz pianists use when they want the full color of a minor 11th without spreading it across the full range. Very modern, very Glasper.',
        tags: ['Cluster', 'Extension', 'Dense', 'Modern'],
        resolves: 'G9',
      },
    ]
  },
];

window.VoicingLibrary = VOICING_LIBRARY;

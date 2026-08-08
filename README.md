# Downbeat

Play your hardware. Downbeat writes you a progression, a bass line, drums and a
melody, then shows you how to perform each part on a Teenage Engineering EP-133
K.O. II or an M-VAVE FM-1 — the exact pads and keys, in order, lighting up in
time with playback.

No build step, no dependencies. Open `index.html` in a browser, or serve the
directory with anything static.

```
python3 -m http.server
```

## The interface

Two regions and nothing else.

**The hardware, on the left, always.** Not a tab, not a panel you open — the
faceplate is the app, and it never leaves the screen. It is given whatever
height the window has and the drawing scales into it, so it is as large as the
room allows on a desktop and still legible on a tablet.

**The part, on the right.** Five buttons — Melody, Counter, Chords, Bass,
Drums — and picking one shows *that* part: its shape on the grid, and the run
of pads to press for it, in order. Nothing else is on screen, because nothing
else is what you are doing. The whole right-hand side takes the part's colour,
so you can tell at a glance whether you are on the bass or the kit.

**Two sheets, and one rule about them.** *New song* and *Structure* open as
overlays — but they are children of the part region, not of the page, so they
cover what you were reading and never the hardware you were reading it for. You
can change genre, key and feel with the faceplate still lit and still playing
beside you. That one structural decision is why it works at every screen size
without a single positioning special case.

Song creation, saved sketches, sharing and MIDI export all live in the *New
song* sheet. The arrangement guide and the theory note live in *Structure*. The
setup recipe for the device — which is genuinely useful and genuinely long —
sits under the run as a disclosure, closed until you want it.

On a phone the desk stacks, and the faceplate crops to the pads themselves: at
that size the display and the function rows are pixels you cannot press, so the
`viewBox` is retargeted to just the grid you actually hit.

## The look

A dark studio desk. Near-black room, panels lifted off it, and the two
faceplates lit on top like real gear — which is exactly what they are, so they
keep their real-world colours. Turn the lights on with the theme button.

The chrome is deliberately quiet so the *music* carries the colour: the part
you have selected tints its chip, its notes, its run, and the pads that light
up under playback.

The visual system is built from semantic tokens on `<body>` in `styles.css`:
canvas, layered surfaces, labels, separators, materials and elevation. Dark and
light appearances swap those foundations while component rules remain shared.
Translucent chrome and sheets use the material tokens; controls and workspace
panels use raised or inset surfaces according to their interaction hierarchy.

System blue is reserved for primary actions; the musical palette is kept out of
general chrome so colour always carries meaning.

The five track colours are data, not decoration, so they are picked as a
categorical palette and validated rather than eyeballed — lightness band, chroma
floor, colour-blind separation and contrast, in both themes, in the order the
tracks appear. Melody takes the brand accent; the rest alternate warm and cool,
because a semantic ordering put green next to magenta and failed deutan badly.
Each track keeps its colour everywhere it appears — mute chip, timeline lane,
arrangement map — and is always text-labelled, never colour alone.

The EP-133 and FM-1 faceplates keep their real-world colours in both themes.
They are pictures of actual objects; only their lit state follows the accent.

## What it does

**14 genres** — Pop, Lo-fi Hip-Hop, Rock, R&B/Neo-Soul, Jazz, Blues, House,
Synthwave, Trap, Funk, Gospel, Bossa Nova, Folk, and Ambient. Each one brings
its own scales, progressions, tempo range, swing, comping style, bass
behaviour, drum pattern and synth voices.

**Melodies built the way melodies work.** Rhythm comes first, from per-genre
cells that carry rests and syncopation. A one-bar motif is stated, then
developed across a phrase plan — repeated, sequenced, augmented — and
re-anchored to each new chord, because repetition is what makes a line
memorable. Pitch is chosen in absolute MIDI space over the scale's pitch set,
so a step is always a step. On top of that:

- strong beats and long notes take chord tones; weak beats fill in with
  passing and neighbour notes
- a leap is answered by contrary motion no larger than the leap itself
- each phrase has one climax, placed about two thirds of the way through
- the last bar cadences onto a tone of the closing chord; the midpoint
  deliberately stays open
- avoid notes are kept off strong beats, and short appoggiaturas are allowed
  only when they resolve by step
- blues adds flat thirds and fifths; jazz, gospel and bossa slide into strong
  beats with chromatic approach notes

The melody's note pool includes the chord tones of every chord in the
progression, not just the parent scale — so over a borrowed chord it can
actually play that chord's third.

**Real harmony.** Progressions are written as roman numerals and parsed:
extensions (`ii7`, `Imaj9`, `V13`), modal interchange (`bVII`, `iv`),
secondary dominants (`V7/vi`), inversions (`I/3`) and altered dominants
(`V7b9`). Chords are voice-led — each voicing is chosen to move as little as
possible from the last — with shell voicings for jazz and drop-2 for neo-soul.
Note spelling is letter-based, so F major shows B♭ rather than A♯.

**An optional countermelody.** A second line under the tune, written to
proper counterpoint rather than just added: it moves when the melody is
holding or resting, leans the opposite way when the melody moves, meets it in
thirds and sixths, never lands in unison or in parallel fifths and octaves
with it, and stops each note at the chord change rather than hanging over into
the next chord.

**Seven energies, on two axes.** Energy nudges a genre toward calmer or busier
output without changing what makes it that genre — where it sits in its own
tempo range, how much it rests, how far it leaps, which rhythm cells get the
weight, and how hard the whole thing is played. Five of the settings run in a
line, *Still & sparse* through *Easy flow* to *Driving & full*. The other two
step off it, because busy and loud are not the same axis: *Slow & heavy* plays
almost nothing and hits it hard, *Busy but hushed* is full of notes and quiet
with it. At the calm end the kit thins rather than just turning down — ghost
notes are the first thing a player drops — and the fill into the loop point
gets rarer as things settle and near-certain when they are driving.

**One part at a time, on the grid.** Whichever part is selected gets the whole
lane to itself, drawn at a size you can read. Melody, countermelody and chords
are pitched blocks against the bars; the bass letters every note with the job
it is doing — `R` root, `3` third, `5` fifth, `→` an approach note leaning into
the next chord — and the drums are a step sequencer, one row per voice, with
accents, ghost notes and hat rolls all visible. Below it, the same part as the
run of pads to press. The two things you need to play a line are finally in the
same view.

**Playback** is a lookahead scheduler on the audio clock, so it stays in time
and loops cleanly. Voices are oscillator stacks with ADSR and filter
envelopes; drums are synthesised; everything shares a reverb send into a
soft-clipper and compressor.

**An arrangement guide.** The generator writes a loop; this turns it into a
song. Each genre gets the shape its songs actually take — verse/chorus for
pop, rock, folk, R&B, gospel and funk; build/drop for house, trap and
synthwave; head-and-solos for jazz, blues and bossa; a slow fade up and down
for lo-fi and ambient. Sections are whole numbers of loops, so nothing ever
lands mid-progression. A map drawn to scale shows which of the five parts
play in each section and how the energy moves, and every section is
clickable: it mutes the parts that section drops so you hear the idea
instead of just reading it.

**Saving and sharing.** A sketch is stored as the recipe that produced it —
genre, key, scale choice, energy, length, tempo and the two seeds — rather
than as a dump of notes. Reloading one replays exactly the same decisions, so
it comes back note for note, and the recipe is small enough to live in a URL:
the ⇗ button copies a link that rebuilds the sketch on any machine, no
account and no server. Saves live in the browser's local storage.

**Hardware performance views.** You pick the device; nothing picks it for you.
The choice holds for every part — melody, countermelody, chords, bass, drums —
and across reloads, until you change it. A stylised faceplate shows exactly how
to play the part, lighting its pads and keys live during playback, and each
comes with a setup recipe checked against current firmware:

- **Teenage Engineering EP-133 K.O. II** (OS 2.5) — the pads are labelled as
  they are on the unit, a calculator keypad reading `.` `0` `ENTER` along the
  bottom and `1`–`9` above it, with KEYS mode running the scale up from the
  bottom left. The root goes where the device puts it: on the pad marked `1`,
  three degrees up the run, so `.` `0` `ENTER` play the degrees below it. The
  scale and key are given as the system codes you actually type — `311` for
  major through `319` for minor pentatonic, and `320`–`331` for C through B —
  and the octave is chosen to put as much of the part under the pads as
  possible. The K.O. II has no harmonic minor, melodic minor or phrygian
  dominant, so sketches in those keys fall back to `12T` and the pads run
  chromatically. Also the TIMING-plus-pads arpeggio for broken chords (which
  needs the sample set to oneshot or legato) and a pad-per-voice kit map for
  the drum track. Notes that fall outside the chosen scale are flagged rather
  than silently dropped.
- **M-VAVE FM-1** (firmware V15) — the 27-key F3–G5 silicone keybed, with
  the OCT −/+ shift (and its LED blink code) computed so the whole part fits
  under the fingers, POLY for chord stacks, MONO and V15's glide for bass
  lines, and pointers to the arpeggiator and 16-step sequencer.

Every pad and key on the faceplates is clickable and previews its sound, as
is every step chip in the play-in-order recipe.

## Controls

| | |
|---|---|
| Genre, Key, Scale | Scale can be left on *Pick for me* |
| Second line | Adds a countermelody under the tune |
| Energy | Seven settings. Five run from *Still & sparse* to *Driving & full*, moving tempo, note density, rests, leaps and how hard it is played; *Slow & heavy* and *Busy but hushed* step off that line, because pace and weight are not the same axis |
| Length | *Fits the genre*, or force 4, 8 or 12 bars |
| Tempo | Overrides the genre's tempo — ↺ puts it back on the genre without changing a note of the sketch |
| New melody / New chords | Reroll one half, keep the other |
| Part buttons | Which part you are playing — the lane, the run and the lit pads all follow |
| Device buttons | Which of the two units you are playing it on. It stays put as you switch parts |
| Solo | Hear only the part you are on. It follows the selection |
| Arrangement sections | Click one to hear it with its parts dropped |
| Save / Share | Save the sketch, or copy a link that rebuilds it |
| Copy / MIDI | Copy the sketch as text, or download it as MIDI |

`Space` plays and stops, `G` writes a new song, `1`–`5` pick a part, `Esc`
closes a sheet. The room is dark unless you turn the lights on, and it
remembers which you chose.

## Layout

```
index.html
styles.css
src/theory.js    note spelling, scales, roman numerals, chords, voice leading
src/genres.js    the 14 genre definitions — pure data
src/compose.js   melody, countermelody, bass, drums, chord comping
src/audio.js     synth voices, drum synthesis, effects, scheduler
src/midi.js      Standard MIDI File export
src/devices.js   hardware faceplates, note-to-pad/key mapping, playback lighting
src/arrange.js   section plans per genre family — pure data plus a scaler
src/library.js   sketch recipes, local storage, shareable links
src/ui.js        the desk — the permanent hardware region, the per-part lane
                 and run, the two sheets, and the transport
```

Adding a genre means adding one object to `src/genres.js`.

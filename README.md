# Downbeat

Play your hardware. Downbeat writes you a progression, a bass line, drums and a
melody, then shows you how to perform each part on a Teenage Engineering EP-133
K.O. II or an M-VAVE FM-1 — the exact pads and keys, in order, lighting up in
time with playback.

An iPhone app, built as a zero-dependency PWA. No build step, no dependencies.
Open `index.html` in a browser, or serve the directory with anything static.

```
python3 -m http.server
```

Add it to your Home Screen and it runs full-screen, offline, with the screen
held awake while you play.

## The interface

Downbeat is shaped like an iOS app because it is used like one: standing at a
desk with a phone in one hand and a sampler under the other. So it is built out
of platform controls rather than invented ones — a navigation bar, a tab bar, an
inset-grouped table view, a segmented control, a switch, a slider, modal sheets
with grabbers, action sheets, alerts. People already know how all of those
behave, and that is most of what "feels native" means.

**The document never scrolls.** `<body>` is locked to the viewport and the only
things that move are the four screen scrollers, each keeping its own offset the
way a tab controller's children do. No rubber-banding, no pull-to-refresh, no
bounce at the top of a fixed bar.

**Portrait, on a phone.** One hand on the phone and the other on the hardware —
that is the posture the whole layout is for, and the manifest asks for it. iOS
ignores that field for a web app, so a phone turned on its side gets a line
asking for it back rather than a layout that does not work. The arithmetic is
not close: a phone lying down is about 390 points tall, the fixed chrome takes
158 of them, and what is left would draw a 540-unit sampler 115 points wide
with three-pixel legends. A tablet on its side has the height, and gets the
two-column desk instead.

**Four tabs, and a transport that never leaves.**

| | |
|---|---|
| **Play** | The part you are playing: the faceplate, the run of pads, the shape |
| **Song** | Genre, key, scale, feel, length, tempo, second melody, count-in |
| **Arrange** | The form, the map, section by section, the theory note |
| **Library** | Saved sketches, sharing, export, and how it works |

Between the content and the tab bar sits the transport — play, the part you are
on, your position in the loop, solo and loop. A performance tool has to be able
to stop from wherever you are, so it is always there and never scrolls.

**The part switcher is a segmented control whose thumb takes that part's
colour**, so the control is also the legend for the five colours used
everywhere else. Tapping *Counter* when the song has no second line writes one
rather than refusing — a dead segment can only tell you that you cannot have the
thing.

**Under it, on the same five columns, is the mix** — what you are *hearing*, as
against what you are looking at. Any combination is legal, including none of
them, which is why it is five switches rather than a sixth segmented control.
Solo sits above it as a momentary override: it silences everything but the part
you are on while it is held, and hands your mix back untouched when you let it
go. Nothing about the mix is remembered between launches. Opening the app to a
part you silenced last week, with nothing on screen having changed, is a bug
report waiting to happen.

**The faceplate is fitted, not squeezed.** A plate is a fixed number of user
units wide — 356 for the EP-133, 682 for the FM-1 — so "make it the width of the
screen" produces two very different objects. `fitFace()` measures the opening
and the viewBox and picks a scale that keeps the silkscreen readable; where the
width cannot pay for that, the plate keeps its floor and the bay scrolls
sideways, opening centred on the pads this part actually uses. Losing the far
end of a keybed off the edge of a phone is a better outcome than shrinking all
27 keys past being able to read which one to press.

**The run of pads is a rail you flick.** During playback it scrolls the chip it
has just lit into view, so the run runs ahead of your hands.

**The shape is drawn against the bars.** Bars are never narrower than 96 points,
so a twelve-bar sketch scrolls rather than collapsing into slivers — and the
lane follows the playhead while it runs, unless your finger is on it.

## The look

A dark studio room by default, warm near-black rather than grey, and a light
appearance in warm paper. Both follow the system unless you choose.

Colour is role-named the way UIKit names it: background, grouped background,
elevated cell, four fill levels, four label levels, one separator. Depth is a
lighter surface and a hairline, never a bevel and a cast shadow.

Type is San Francisco on the iOS ramp — the eleven text styles are the only
sizes in the app, in `rem` so a raised browser font size raises the app with it.
Two shipped faces survive in exactly two places: Archivo sets the song title,
and Martian Mono sets everything printed *on the hardware*, because that type is
silkscreen and reads as gear rather than as interface.

The tint is the amber the hardware's own lamps are, not system blue: an app with
a strong accent should use it. It sits outside the five track hues, so it can
never be mistaken for musical data.

The five track colours are data, not decoration, so they are picked as a
categorical palette and validated rather than eyeballed — lightness band, chroma
floor, colour-blind separation and contrast, in both appearances, in the order
the tracks appear. Each track keeps its colour everywhere it appears and is
always text-labelled, never colour alone.

The EP-133 and FM-1 faceplates keep their real-world colours in both
appearances. They are pictures of actual objects; only their lit state follows
the part.

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
with it.

**One part at a time, on the grid.** Melody, countermelody and chords are
pitched blocks against the bars; the bass letters every note with the job it is
doing — `R` root, `3` third, `5` fifth, `→` an approach note leaning into the
next chord — and the drums are a step sequencer, one row per voice, with
accents and ghost notes visible. Below it, the same part as the run of pads to
press.

**Playback** is a lookahead scheduler on the audio clock, so it stays in time
and loops cleanly. Voices are oscillator stacks with ADSR and filter
envelopes; drums are synthesised; everything shares a reverb send into a
soft-clipper and compressor. A count-in clicks you in so you can start playing
on the downbeat without looking at the screen.

**An arrangement guide.** The generator writes a loop; this turns it into a
song. Each genre gets the shape its songs actually take — verse/chorus for
pop, rock, folk, R&B, gospel and funk; build/drop for house, trap and
synthwave; head-and-solos for jazz, blues and bossa; a slow fade up and down
for lo-fi and ambient. Sections are whole numbers of loops, so nothing ever
lands mid-progression. A map drawn to scale shows which of the five parts
play in each section, and every section is tappable: it mutes the parts that
section drops so you hear the idea instead of just reading it.

**And it plays.** *Play the arrangement* runs the whole form — every section
in order, at its own length, with its parts dropping in and out on the bar.
The section you are inside lights up in the map and in the list under it, and
the transport reads `Chorus · Melody` over `Bar 22 of 52` rather than
counting round a four-bar loop forever.

A section that drops the drums is a section with no drum events in it, not a
section played with the drum bus turned down. The difference is audible at the
seam: a bus ducked on the bar line cuts the tail of whatever was still ringing
from the section before, and the scheduler commits notes a lookahead window
early, so *mute it when the loop wraps* mutes it slightly before the wrap you
can hear. Laying the form out as one flat sequence is exact by construction —
a verse/chorus over a four-bar loop is thirteen passes of a hundred-odd
events, which is nothing.

The Play screen keeps drawing the loop while the form runs: the faceplate, the
run of pads and the shape are all pictures of one pass, so the playhead is
folded back into it. Otherwise the pads would stop lighting at bar five of a
fifty-two bar song.

Arming persists, so the transport's own play button gives you the form too,
and auditioning a section is how you go back to the loop — the opposite
request, so it doubles as the way out, and the two states can never both be on
screen claiming to be true.

**Saving and sharing.** A sketch is stored as the recipe that produced it —
genre, key, scale choice, energy, length, tempo and the two seeds — rather
than as a dump of notes. Reloading one replays exactly the same decisions, so
it comes back note for note, and the recipe is small enough to live in a URL:
Share hands the link to the system share sheet, which can put it in Messages,
in a note or on the clipboard. Saves live in the browser's local storage, and
swipe left on one to delete it. The sketch you are working on is kept as a
draft too, so a relaunch picks up where you left off.

**Hardware performance views.** You pick the device; nothing picks it for you.
The choice holds for every part and across reloads, until you change it. A
stylised faceplate shows exactly how to play the part, lighting its pads and
keys live during playback, and each comes with a setup recipe checked against
current firmware:

- **Teenage Engineering EP-133 K.O. II** (OS 2.5) — the pads are labelled as
  they are on the unit, a calculator keypad reading `.` `0` `ENTER` along the
  bottom and `1`–`9` above it, with KEYS mode running the scale up from the
  bottom left. The root goes where the device puts it: on the pad marked `1`,
  three degrees up the run. The scale and key are given as the system codes you
  actually type — `311` for major through `319` for minor pentatonic, and
  `320`–`331` for C through B — and the octave is chosen to put as much of the
  part under the pads as possible. The K.O. II has no harmonic minor, melodic
  minor or phrygian dominant, so sketches in those keys fall back to `12T` and
  the pads run chromatically. Also the TIMING-plus-pads arpeggio for broken
  chords and a pad-per-voice kit map for the drum track. Notes that fall
  outside the chosen scale are flagged rather than silently dropped.
- **M-VAVE FM-1** (firmware V15) — the 27-key F3–G5 silicone keybed, with
  the OCT −/+ shift (and its LED blink code) computed so the whole part fits
  under the fingers, POLY for chord stacks, MONO and V15's glide for bass
  lines, and pointers to the arpeggiator and 16-step sequencer.

Every pad and key on the faceplates is tappable and previews its sound, as is
every step chip in the run.

**Notes past the ends still have a pad.** Twelve pads will not hold every tune,
and a note off either end used to read `OFF` — a dead chip in the middle of a
run you are trying to play. It now names the pad that plays it and the shift
that gets you there: `pad 3 ↓` with `keys −` under it, or `oct −` on the FM.
The pad lights in amber for the shift up and periwinkle for the shift down
instead of in the part colour, and the key you would press — `+`/`−` on the
EP-133, `oct+`/`oct−` on the FM-1 — lights with it.

Only a note that is genuinely off the grid is marked. Twelve pads of a
seven-note scale span nearly two octaves, so `C5` and `C6` are routinely both
under your fingers at once; neither is flagged, because neither needs
anything. The arithmetic is asserted rather than eyeballed: for every note in
the audible range, in every genre, on both units, the pad named plus its shift
has to equal the note.

A note the scale grid has no pad for *at any* shift — a chromatic passing note
against a scale mode — is a different fact with a different answer, and still
reads `OFF`.

## Controls

| | |
|---|---|
| Genre | A rail of cards. Picking one rewrites the song in that genre's scales, tempo range and kit |
| Key, Scale, Feel, Length | Rows that open the system picker. Scale can be left on *Pick for me* |
| Second melody | Adds a countermelody under the tune |
| Tempo | A slider across the genre's own range, plus tap tempo, and one row to put it back on the genre without changing a note |
| Count-in | Off, one bar or two |
| New melody / New chords | Reroll one half, keep the other |
| Write a new song | Rerolls both seeds |
| Part switcher | Which part you are playing — the faceplate, the run and the shape all follow |
| Mix | Five toggles under the switcher: any combination of the parts, on or off |
| Every part on | Appears beside *Parts* whenever something is off, and puts the whole song back |
| Device switcher | Which of the two units you are playing it on. It stays put as you switch parts |
| Solo | Hear only the part you are on. It follows the selection, and gives your mix back when you let it go |
| Loop | Round and round, or once through |
| Play the arrangement | The whole form, section by section, from the Arrange tab |
| Arrangement sections | Tap one to hear it with its parts dropped — and to come back off the form |
| Share | The system share sheet: link, text, MIDI, or save to the library |
| Undo | Appears in the title bar whenever a change can be taken back |

With a hardware keyboard: `Space` plays and stops, `G` writes a new song,
`1`–`5` pick a part, `⇧1`–`⇧5` switch that part off and on again, `⌘Z` undoes,
`Esc` closes whatever is open.

## Accessibility

Every target clears 44 points, or reaches it with a pseudo-element rather than
being drawn larger than it should be. Nothing depends on hovering — hover
effects exist only inside a `(hover: hover)` query, and the preview chain is
bound there too, because WebKit synthesises a `mouseenter` on tap and never
sends the matching `mouseleave`.

Every label clears WCAG AA in both appearances, measured rather than eyeballed
— including the ink on all five track colours where the segmented thumb paints
them. Colour never carries meaning alone: the arrangement map states which
parts play in each section, the five track colours are always text-labelled,
and a note that needs an octave shift says so three ways at once — an arrow on
the chip, the press spelled out under it, and the colour.

Reduced Motion takes the travel and leaves the light: a pad lighting up is
information, and deleting it would delete the feature. Increased Contrast firms
up every hairline and secondary label without overwriting a selection ring.

The whole app works from a keyboard. The tab bar, the part switcher, the device
switcher and the genre rail are proper tab lists and radio groups with roving
tab indices *and* arrow keys — the roving index on its own is half a pattern
and leaves everything but the current item unreachable. A focused control keeps
its own keys, so Space presses the button you are on and drives the transport
only when nothing is focused. Re-rendering a control the user just operated
finds it again afterwards rather than dropping focus to the document. Modals
take focus, trap it, make the app inert and give focus back.

## How it is checked

Five scripts drive the built app in a real browser at iPhone SE, 15, 15 Pro
Max, landscape and iPad, and they are how most of the bugs in this rewrite were
found:

- **function** — taps through every control on every screen and asserts the
  result: the playhead moves and sits over the grid it marks, chips and lane
  notes light under playback, solo survives a regenerate, a share link boots,
  a draft survives a reload, swipe-to-delete opens and confirms. The
  arrangement is checked as a layout rather than by listening: in every genre,
  every section contains exactly the parts the form lists and no others, on
  every repeat, in time order, for the full length the plan claims. The mix is
  checked exhaustively: every one of the 2ⁿ combinations of the parts a song
  has, driven a tap at a time and asserted against what the engine is
  actually playing.
- **layout** — every tab at every size, with the safe-area insets an iPhone
  actually reports forced in, asserting no horizontal overflow, no page offset,
  no control under the notch or the home indicator, and nothing below 44pt —
  and that a phone on its side shows the portrait notice with none of the app
  laid out behind it.
- **contrast** — composites every text node's colour onto its real background
  and checks the ratio against the threshold for that size and weight.
- **keyboard** — drives the entire app with no pointer at all.
- **axe-core** — over every screen and every modal, in both appearances.

Plus a sweep of all fourteen genres × four parts × two devices, twelve-bar
songs, a 320px screen and a sketch renamed to a hundred characters of markup.

## Layout

```
index.html          the shell: nav bar, four screens, transport, tab bar
css/tokens.css      colour, type, motion and the two hardware palettes
css/base.css        reset, fonts, the type ramp, the fixed app shell
css/components.css  the iOS control set
css/screens.css     the four screens
css/device.css      everything src/devices.js draws
css/a11y.css        reduced motion, increased contrast, focus
src/theory.js       note spelling, scales, roman numerals, chords, voice leading
src/genres.js       the 14 genre definitions — pure data
src/compose.js      melody, countermelody, bass, drums, chord comping
src/audio.js        synth voices, drum synthesis, effects, scheduler
src/midi.js         Standard MIDI File export
src/devices.js      hardware faceplates, note-to-pad/key mapping, lighting
src/arrange.js      section plans per genre family — pure data plus a scaler
src/library.js      sketch recipes, local storage, shareable links
src/ios.js          modal presentation, action sheets, alerts, swipe, segments
src/ui.js           the app: state, transport, the four screens, platform glue
```

Adding a genre means adding one object to `src/genres.js`.

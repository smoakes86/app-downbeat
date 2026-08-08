# Downbeat — Design Bible

**Direction: ANODISE.** Locked 2026-08-08 after a six-auditor review, three competing art
directions and three independent judgements (aggregate: ANODISE 63.65, PRESSING 59.9,
PHOSPHOR 57.8; two of three judges chose ANODISE outright).

This document is the contract. Ten implementation agents build against it. Where it gives a
number, use that number. Where it gives a hex, use that hex. Where it forbids something, the
review rejects the work. If you believe a rule here is wrong, change **this file first** and say
why in the commit — do not diverge in a stylesheet.

---

## Table of contents

1. [The thesis](#1-the-thesis)
2. [Colour](#2-colour)
3. [Typography](#3-typography)
4. [Space, shape and elevation](#4-space-shape-and-elevation)
5. [Motion](#5-motion)
6. [Components](#6-components)
7. [The signature moments](#7-the-signature-moments)
8. [File architecture](#8-file-architecture)
9. [The AAA bar](#9-the-aaa-bar)
10. [Appendix A — verified facts and corrections](#appendix-a--verified-facts-and-corrections)
11. [Appendix B — build order](#appendix-b--build-order)

---

## 1. The thesis

Downbeat is a black-anodised panel under one fixed light, screen-printed in warm ink, with a
single amber lamp that means *powered*. It stops being a screen **about** hardware and becomes
hardware: the same top-lit chamfers, the same milled wells, the same engraved caps legends as the
EP-133 lying on the desk beside it, so the faceplate is no longer an illustration pasted onto a
settings screen — it is the one lit object on a panel made of the same stuff. One rule governs
everything: **every surface is either PIGMENT or EMISSION, and nothing is both.** Pigment is
screen-printed ink and anodised colour — matte, mid-chroma, never glowing, and it carries *all*
musical data. Emission is light — high chroma, always wearing a bloom, and it carries exactly
three things: the transport, the lit pads and the displays. Because Downbeat's premise is that the
screen and the object under your hands are the same instrument, the interface obeys the object's
physics: light strikes in 40ms and decays over four tenths of a beat, so at 76 BPM the pads smear
and at 158 BPM they machine-gun; a control that is ON is not a slightly lighter fill, it is a
machined cap risen out of a well; and the room is labelled the way a rack is labelled, with a
10px caps legend engraved on the metal above every region and an asset tag in the corner that
recomputes with the song. Every rule in this system is checkable against a photograph of real
gear, which is the constraint that produces conviction instead of taste.

---

## 2. Colour

### 2.1 The two families

**PIGMENT** — anodised colour and screen-print ink. Matte, mid-chroma, never carries a glow, and
it is the **only** family allowed to encode musical data. The five track hues sit on a hue ladder
of 213 / 15 / 168 / 74 / 325 degrees, so no two adjacent parts in the switcher are closer than
94°, with a deliberate lightness stagger so any pair also separates on luminance. Bass is
deliberately **lime, not gold** — the one adjacency the material rule could not police on its own
is a golden bass sitting next to the emissive amber, so the bass hue was moved off it.

**EMISSION** — light. High chroma, always paired with a bloom, restricted to the transport, the
lit pads/keys, and the two device displays. `--lamp #FF8A32` is a saturated read of the segment
colour already in the codebase (`styles.css:501`, `.seg { fill:#ff8a5f }`). Because **no track hue
lives in the 20–50° amber band**, amber is unambiguous everywhere it appears — which is why the
global focus ring can be amber and still read on all ten track colours in both themes.

**Neither family may cross.** No track hue ever appears in chrome. No chrome colour ever appears
in the lane. This closes the README's own stated rule, which the current build violates in four
places (offline dot in the bass hue, destructive delete in the counter hue, "full arrangement" in
the chords hue, tempo slider tinted by whichever part happens to be selected).

### 2.2 Structural colour rules

| # | Rule | Why |
|---|---|---|
| C1 | Never `#fff`, never `#000`. `--ink` is warm off-white / warm near-black; the darkest value in the system is `#040504` and the lightest is `#FDFBF5`. | Printed ink is neither. This is the ponpon discipline and it is non-negotiable. |
| C2 | Every track hue ships as a **fill** token and an **`-ink`** token. Fills are for `background`, `fill`, `border-color` on a block. `-ink` variants are the *only* values permitted in a `color:` property. | Retires the entire class of contrast failures the audit found. |
| C3 | `--part` and `--part-ink` are **set together** on `#desk[data-part=…]`. Same for `--tint` / `--tint-ink` on `.part[data-part=…]`. Never one without the other. *(Graft: PHOSPHOR.)* | Makes the guarantee structural instead of a case-by-case judgement. |
| C4 | `--on-part #140C04` is the ink on **any** track fill, both themes. Verified 5.09–11.67:1 across all ten hues. | Retires the 1.41:1 white-on-yellow in the arrangement map. `--on-accent` is deleted. |
| C5 | **Elevation is not luminance.** On near-black you cannot get 1.35:1 between adjacent fills without turning the room grey. Depth is carried by the bevel pair, the cast shadow and a hairline that clears 3:1 where the boundary is load-bearing. | See §4.4. Adjacent surfaces here measure 1.07–1.32:1 and that is *correct*; the boundary does the work, not the fill. |
| C6 | **Every capped control lives inside an `--inset` housing.** A brushed-aluminium cap only ever needs to contrast with a well, never with a panel. | Fixes the light theme, where there is no headroom above near-white, and simultaneously fixes the "six interaction semantics, one identical pill" blocker by forcing toggles into a visible group. |
| C7 | **Light theme: every pigment block carries a 1px `--on-part` ring.** Light track fills measure only 1.36–2.21:1 against the light well, below the 3:1 floor for meaningful graphics. A near-black hairline round the block measures 11.23:1 against the bed and 5.09–8.27:1 against the fill. | This is what screen-printed ink on a light substrate actually looks like. Dark theme does not need it (fills are 7.0–12.3:1 there) and must not have it. |
| C8 | **Dark lifts with light; light lifts with shadow.** `--bevel-top` is nearly invisible on a near-white panel, so in the light theme elevation is carried by `--cast-*` and `--edge-hot`, and the specular is reserved for caps and wells only. | Answers the one hole the judges found in ANODISE. |
| C9 | Status has no hue. Offline is **absence** (§7.9), success is a single `--vfd` flash, destructive is `--rec` — a fill behind `--on-lamp` with a filled-circle glyph, never text colour. *(Graft: PHOSPHOR.)* | Keeps "colour always means a part" true. |
| C10 | Every colour-carried state has a **second, non-colour cue**: a shape token, a bar, a ring, a dot or a label. Never hue alone. | Deutan safety, and the README already promises it. |

### 2.3 The token set

All tokens are declared on `body` (and `body.light`), **not** `:root` — a custom property that
references another resolves against the values in scope where it is *declared*, so derived tokens
on `:root` would bake in `:root`'s base values and the theme swap would not propagate. This
placement is load-bearing and the existing comment at `styles.css:43` is correct; keep it.

`:root` holds only theme-independent structure: shell, gutters, safe areas, tap size, the
spacing/radius/duration/easing scales, and the `@property` registrations.

#### Surfaces

| Token | Dark | Light | Use |
|---|---|---|---|
| `--room` | `#070806` | `#D6D2C7` | Page canvas. Dark is black anodise, a faint green-black. Light is natural-aluminium putty — the same family as the EP-133's own body, so the faceplate sits *in* the room instead of floating on white. |
| `--panel` | `#191C1A` | `#EBE7DE` | The panel face: `.rig`, `.stage`, `.sheet`, `.onboarding-card`. |
| `--raised` | `#282D2A` | `#F4F1E9` | A housing bolted to the panel: `.sheet-head`, sticky footers, `.recipe` body, `.sections li`. |
| `--high` | `#3A403C` | `#FBF9F3` | A control at rest that is *not* in a well: `.icon`, `.ghost`, `.count`, `.step-n`. |
| `--inset` | `#040504` | `#C9C5B9` | A milled well. Goes **below** `--room`, not above `--panel` — a recess is darker than the thing it is cut into. `.parts`, `.devices`, `.lane`, the run bed, `select`, `.check`, `.creation-details`, the bar's toggle group. |
| `--material` | `color-mix(in srgb, #141715 84%, transparent)` | `color-mix(in srgb, #F1EDE4 86%, transparent)` | Translucent chrome: `.bar`, `.thumb`, `.performance-chrome`, `.sheet` backdrop. |

Measured surface steps (they are small on purpose — see C5):
dark `panel:room` 1.17, `raised:panel` 1.23, `high:raised` 1.32, `alu:inset` **3.21**;
light `panel:room` 1.22, `raised:panel` 1.09, `high:raised` 1.07, `alu:inset` **1.67**.

#### Material

| Token | Dark | Light | Use |
|---|---|---|---|
| `--alu` | `#5A615C` | `#FDFBF5` | Brushed-aluminium cap. The ON state of every binary control. Dark: a mid grey cap on black = 3.21:1 over the well. Light: a bead-blasted cap catching the light = 1.67:1 over the well **plus** `--cast-1` **plus** the bevel flip. |
| `--alu-edge` | `#767D77` | `#E6E1D4` | Machined edge: the 1px specular on the cap's top chamfer, and the milled ring round knob and pad geometry. |
| `--bevel-top` | `rgba(255,247,232,.075)` | `rgba(255,255,255,.92)` | `inset 0 1px 0`. Applied to every panel, housing, cap, chip and field with **zero exceptions** — the uniformity is what makes the interface read as one machined object. |
| `--bevel-bot` | `rgba(0,0,0,.55)` | `rgba(96,90,74,.20)` | `inset 0 -1px 0`. **Inverted on recessed surfaces** (wells get dark on top, light on the bottom). The inversion is the entire depth cue. |
| `--edge-cast` | `rgba(0,0,0,.62)` | `rgba(120,112,94,.26)` | The one-pixel contact line under anything resting on the panel. Warm grey rather than black in light, because black on putty reads as dirt. |

#### Ink

| Token | Dark | Light | Use | Measured |
|---|---|---|---|---|
| `--ink` | `#E9E7DF` | `#1A1913` | Body text. | 13.88 / 14.27 on `--panel`; 16.21 / 11.66 on `--room` |
| `--muted` | `#8D918A` | `#514F46` | Secondary label, meta lines, blurbs. | 5.36 / 6.66 on `--panel`; 6.37 / **4.76** on `--inset` |
| `--label-tertiary` | `#868C85` | `#66614F` | **The legend register only** (§3.5) and the spec plate. Never prose, and never placed on `--high` or a cap. | 4.99 / 5.02 on `--panel` |

#### Boundaries

| Token | Dark | Light | Use | Measured on `--panel` |
|---|---|---|---|---|
| `--edge` | `color-mix(in srgb, var(--ink) 26%, transparent)` | `color-mix(in srgb, var(--ink) 32%, transparent)` | Decorative hairline, always accompanied by the bevel pair. | 2.14 / 2.00 |
| `--edge-hot` | `color-mix(in srgb, var(--ink) 38%, transparent)` | `color-mix(in srgb, var(--ink) 50%, transparent)` | **Load-bearing boundary** — `.seq-chip`, `.lane`, `select`, `.map-cell`, `.lib-card`, any control whose edge is its only definition. Clears WCAG 1.4.11. | **3.11** / **3.20** |

`--line` and `--separator` are both deleted. Every hairline in the app is `--edge` or `--edge-hot`,
and choosing between them is a decision about whether the boundary carries meaning.

#### Emission

| Token | Dark | Light | Use | Measured |
|---|---|---|---|---|
| `--lamp` | `#FF8A32` | `#FF8A32` | **The brand colour, and the only emissive accent.** Play fill, transport segments, lane playhead, focus ring, count-in numeral, the barline in the wordmark. **Identical in both themes** — a lit lamp is a lit lamp regardless of the room. | 8.54 on dark `--room` |
| `--lamp-ink` | `#FF9A4E` | `#A34500` | The amber when it must be *text on a surface* rather than a light. Never carries a bloom. | 8.17 / 4.99 on `--panel` |
| `--on-lamp` | `#140C04` | `#140C04` | Ink on the amber fill. Theme-independent because the fill is. | **8.24** — retires the 3.65:1 Play button |
| `--vfd` | `#6FE3CF` | `#0A7060` | Secondary emission: the FM-1 TFT, "saved", "armed", "ready", success. Deliberately cool so it can never be confused with amber. | 11.10 / 4.86 on `--panel` |
| `--rec` | `#E8382A` | `#C22013` | Record red. Destructive and record-arm **only**, always as a fill behind `--on-lamp` (dark) or `#FBF7F0` (light), never as text colour. Sits outside the track palette. | 4.64 / 5.60 |
| `--rec-ink` | `#FF6A5E` | `#A8180C` | Destructive as text on a neutral surface. | 6.12 / 6.08 on `--panel` |

#### Track pigment

| Track | Fill dark | Fill light | Ink dark | Ink light | Shape token |
|---|---|---|---|---|---|
| Melody | `#4E9BEA` | `#2E86D8` | `#7FB8F2` | `#155194` | ▲ triangle |
| Counter | `#F5806A` | `#F0724F` | `#F79A87` | `#8E3613` | ⌒ slur |
| Chords | `#3ECBAC` | `#1FA98A` | `#5FD6BC` | `#095C4B` | ☰ stacked bar |
| Bass | `#B4D648` | `#93B62A` | `#C4E065` | `#445905` | ■ filled block |
| Drums | `#F368B4` | `#DE4E9B` | `#F78BC6` | `#9B175E` | ✕ cross |

**`-ink` variants measured** — worst case is `--inset`, the surface `.seq-chip b` actually sits on:

| | dark on `--inset` | dark on `--panel` | dark on `--high` | light on `--inset` | light on `--panel` | light on `--high` |
|---|---|---|---|---|---|---|
| melody | 9.76 | 8.21 | 5.07 | **4.62** | 6.45 | 7.57 |
| counter | 9.65 | 8.12 | 5.02 | **4.53** | 6.33 | 7.42 |
| chords | 11.50 | 9.68 | 5.98 | **4.60** | 6.44 | 7.54 |
| bass | 13.80 | 11.61 | 7.18 | **4.55** | 6.36 | 7.45 |
| drums | 9.20 | 7.74 | 4.78 | **4.54** | 6.35 | 7.45 |

Every value clears 4.5:1. **`--on-part #140C04` on the fills:** dark 6.64 / 7.54 / 9.54 / 11.67 /
6.87; light 5.09 / 6.66 / 6.55 / 8.27 / 5.23.

**Fills as non-text graphics on `--inset`:** dark 7.00 / 7.95 / 10.06 / 12.30 / 7.24 (all clear
3:1). Light 2.21 / 1.68 / 1.71 / 1.36 / 2.15 — **all fail**, which is exactly why rule C7 exists.

#### Bass role ramp

The bass lane letters every note with the job it does. One hue, stepped by lightness, because the
roles are a ranking and not five categories. Derived from `--t-bass-ink` so they follow the theme:

```
--role-root:     color-mix(in oklab, var(--t-bass), #000 26%);
--role-third:    color-mix(in oklab, var(--t-bass), #fff 12%);
--role-fifth:    color-mix(in oklab, var(--t-bass), #fff 22%);
--role-other:    color-mix(in oklab, var(--t-bass), #fff 17%);
--role-approach: repeating-linear-gradient(45deg, var(--t-bass) 0 3px,
                 color-mix(in oklab, var(--t-bass), #fff 44%) 3px 6px);
```

All role blocks take `--on-part` for their letter.

#### Hardware palettes (theme-independent, closed sets)

These replace thirty anonymous hexes. The faceplates are pictures of real objects and keep their
real-world colours in both themes — but they are documented as a deliberate closed set, not drift.
**No `#000` anywhere:** the three existing `stroke:#000` become the near-black below.

```
/* Teenage Engineering EP-133 K.O. II */
--ep-body-hi:#E2DFD8;  --ep-body-lo:#CDC9C1;  --ep-ink:#0D0C0A;
--ep-cap-hi:#F4F1EA;   --ep-cap-lo:#E0DCD3;   --ep-cap:#EFECE4;
--ep-well:#C4C0B6;     --ep-edge:#B8B4A9;
--ep-lcd:#17120E;      --ep-seg:#FF8A32;      --ep-glass:rgba(255,255,255,.05);
--ep-legend:#5D5A52;   --ep-label:#2E2C27;    --ep-id:#6B6760;
--ep-key:#3A3835;      --ep-key-ink:#E8E5DD;  --ep-accent:#E0684F;

/* M-VAVE FM-1 */
--fm-body-hi:#2B2F38;  --fm-body-lo:#1E222A;  --fm-ink:#0A0B0E;
--fm-wkey-hi:#F8F6F1;  --fm-wkey-lo:#EDEAE2;  --fm-wkey:#F5F2EB;
--fm-bkey:#1A1C22;     --fm-edge:#B9B5AB;
--fm-tft:#090C11;      --fm-t1:#7FD4FF; --fm-t2:#FFD27F; --fm-t3:#FF8A32;
--fm-legend:#6E6A61;   --fm-brand:#9DA3AE;
```

Measured: `--ep-legend` on `--ep-cap` **5.83**; on the used-pad tints 4.80–5.39; `--ep-label` on
`--ep-cap` 11.81; `--ep-id` on `--ep-cap` 4.76; `--ep-legend` on `--ep-body-lo` 4.56;
`--fm-legend` on `--fm-wkey` 4.82; `--fm-brand` on `--fm-body` 5.83. **Every faceplate legend now
clears 4.5:1** — these are performance instructions read at arm's length from an instrument, and
the "it's a picture of an object" exemption covers the brand mark and the knob captions only.

Used-pad tint is `color-mix(in srgb, var(--part) 22%, var(--ep-cap))` → resolves to
`#CCDAE5 / #F0D4C9 / #C8E5D8 / #E2E7C2 / #F0CFD9`. That is only **1.05–1.18:1** against the
chassis, so the used state **must** also carry the 2.5px `--part` bar screen-printed along the pad's
bottom edge. Colour alone does not communicate the used map.

#### Focus

```
--focus-ring: 0 0 0 2px var(--lamp), 0 0 0 5px color-mix(in srgb, var(--lamp) 34%, transparent);
```

One definition, used by all five focus rules in the app. Because amber sits outside the track
palette, this ring reads on all ten track hues, on `--alu`, on the amber Play button itself
(where the outer halo carries it), and on both `--room` values. It is applied via `box-shadow`
plus `outline: 2px solid transparent; outline-offset: 2px` so it survives forced-colors mode.

`select { outline:none }` is deleted. `select:focus` becomes `select:focus-visible`.

#### Deleted tokens

`--accent`, `--accent-press`, `--accent-soft`, `--on-accent`, `--on-warm`, `--fill`,
`--fill-strong`, `--fill-line`, `--line`, `--separator`, `--grid`, `--well`, `--surface-raised`,
`--surface-high`, `--surface-inset`, `--lift-1`, `--lift-2`, `--wash-*`. Everything referencing
them is repointed. There must be exactly **one** `body { }` base declaration and **one**
`body.light { }` in the whole codebase.

---

## 3. Typography

### 3.1 The faces

Two self-hosted variable woff2. Both SIL Open Font License. No CDN, no build step.

| | File | Axes | Subset size |
|---|---|---|---|
| Chrome | `fonts/Archivo[wdth,wght].woff2` (Omnibus-Type) | `wght 100–900`, `wdth 62–125` | ~90 KB latin |
| Data | `fonts/MartianMono[wdth,wght].woff2` (Evil Martians) | `wght 100–800`, `wdth 75–112.5` | ~72 KB latin |

**Why these two.** Archivo carries a genuine width axis, and its expanded cut at caps with heavy
tracking *is* rack-panel silkscreen — you cannot fake that register with letter-spacing alone on a
normal-width grotesque. Martian Mono was designed for dense UI data: squared terminals, slashed
zero, tabular by default, and a condensed axis that keeps a two-character accidental legible at
10px inside a 74-unit-wide SVG pad. The mono is the more distinctive of the two **on purpose**,
because it carries the app's actual content — every note name, every pad label, every faceplate
legend, the readout — and that content is most of the interface.

**Why not a CDN.** `sw.js:40` returns early for cross-origin requests. A Google Fonts link would
be uncached and the installed PWA — the app's primary form — would silently fall back to system
faces offline, which is exactly the case this app exists for.

### 3.2 Loading

```html
<link rel="preload" as="font" type="font/woff2" crossorigin href="fonts/Archivo[wdth,wght].woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin href="fonts/MartianMono[wdth,wght].woff2">
```

```css
@font-face{font-family:"Archivo";src:url("fonts/Archivo[wdth,wght].woff2") format("woff2-variations");
  font-weight:100 900;font-stretch:62% 125%;font-display:swap;}
@font-face{font-family:"Martian Mono";src:url("fonts/MartianMono[wdth,wght].woff2") format("woff2-variations");
  font-weight:100 800;font-stretch:75% 112.5%;font-display:swap;}

/* Metric-matched fallbacks so a cold cache does not reflow the panel. */
@font-face{font-family:"Archivo Fallback";src:local("Segoe UI"),local("Roboto"),local("Helvetica Neue"),local("Arial");
  size-adjust:96%;ascent-override:92%;descent-override:24%;line-gap-override:0%;}
@font-face{font-family:"Mono Fallback";src:local("Consolas"),local("Roboto Mono"),local("Menlo"),local("monospace");
  size-adjust:94%;ascent-override:90%;descent-override:22%;line-gap-override:0%;}

--sans:"Archivo","Archivo Fallback",system-ui,sans-serif;
--mono:"Martian Mono","Mono Fallback",ui-monospace,monospace;
```

Both files and both `fonts/` paths go into the `sw.js` `SHELL` array; `CACHE` bumps to
`downbeat-shell-v3`. **Without this the installed app has no face offline and the direction
evaporates in the one context it was built for.**

### 3.3 The scale

Nine chrome rungs and four data rungs replace the current 24 ad-hoc sizes (seven of which sit
inside a 3px band). Every font-size in the codebase maps onto a rung. Anything that then looks
wrong is a *hierarchy* problem, to be solved with weight, colour or space — never with another
half pixel.

**Chrome — Archivo**

| Token | Size | Weight | `wdth` | Leading | Tracking | Role |
|---|---|---|---|---|---|---|
| `--fs-legend` | 10px | 640 | 118 | 1 | `.145em` caps | Panel legends, spec plate, eyebrows, `.performance-chrome small` |
| `--fs-micro` | 11px | 500 | 100 | 1.3 | 0 | `.count`, `.chip-oct`, `.map-head small`, `.drop-note` |
| `--fs-meta` | 12px | 500 | 100 | 1.35 | 0 | Field labels, `.bar-song span`, `.lib-load small`, `.field-note` |
| `--fs-ui` | 13px | 500 | 100 | 1.35 | 0 | Button labels, `.pill`, `.device`, `.part`, `.recipe summary` |
| `--fs-body` | 15px | 400 | 100 | 1.5 | 0 | Prose: `.sheet-body p`, `.recipe-steps p`, `.why p`, `.sections p` |
| `--fs-lead` | 17px | 500 | 100 | 1.4 | `-.012em` | `.sheet-lead b`, `.performance-chrome b` |
| `--fs-title` | `clamp(19px, 1.1vw + 15px, 21px)` | 720 | 106 | 1.12 | `-.022em` | **The song title**, `.sheet-head h2`, `.creation-hero h3` |
| `--fs-display` | `clamp(24px, 2.2vw + 16px, 30px)` | 720 | 106 | 1.08 | `-.028em` | `.onboarding-page h2` |
| `--fs-readout` | `clamp(96px, 26vw, 220px)` | 800 (mono) | 112 | 1 | `-.02em` | Count-in numeral, empty-state mark |

**Data — Martian Mono**, always `font-variant-numeric: tabular-nums`, always `--lh-data: 1`

| Token | Size | Weight | `wdth` | Role |
|---|---|---|---|---|
| `--fd-xs` | 10px | 400 | 87.5 | `.lane-bars span`, `.seq-bar`, `.drum-name`, faceplate `pad-id` / `pad-sub` |
| `--fd-sm` | 12px | 400 | 87.5 | `.seq-chip small`, `.bar-pos`, `.field-read`, `.map-track` |
| `--fd` | 15px | 620 | 100 | `.seq-chip b`, pad glyphs, note names, `.tl-note` label |
| `--fd-lg` | 19px | 620 | 100 | `.seq-chord-name`, LCD `disp-note` |

### 3.4 Leading and tracking

Set on `body`, not on 10 of 545 rule blocks. Currently 535 rule blocks inherit whatever the OS
font's internal leading happens to be, which means the vertical rhythm changes between operating
systems.

```
--lh-data:1;  --lh-tight:1.08;  --lh-heading:1.12;  --lh-ui:1.35;  --lh-body:1.5;
--tr-caps:.145em;  --tr-tight:-.028em;  --tr-snug:-.012em;  --tr-0:0;  --tr-data:.01em;
```

`body { line-height: var(--lh-body); letter-spacing: 0 }` and `.mono { letter-spacing:
var(--tr-data) }`. The current global `-.006em` on `body` is **deleted** — it applies to the mono
too, which is the opposite of what tabular data wants. Tracking is tied to size and nowhere else:
17 letter-spacing values collapse to five tokens.

### 3.5 The signature register — the engraved legend

This is the identity payload and it is nearly free. **Every region on the desk carries a
screen-printed legend on the metal above it.**

```css
.legend{
  font-family:var(--sans); font-size:var(--fs-legend);
  font-variation-settings:'wdth' 118,'wght' 640;
  letter-spacing:var(--tr-caps); text-transform:uppercase;
  line-height:1; color:var(--label-tertiary);
}
```

| Legend | Sits above |
|---|---|
| `HARDWARE` | `.rig-stage` |
| `PART` | `.parts` |
| `SHAPE` | `.lane-wrap` |
| `RUN` | `.run` |
| `SET-UP` | `.recipe` summary (replaces the current sentence-case text) |
| `TRANSPORT` | `.thumb .bar-controls` (phone) |
| `ARRANGEMENT` / `LIBRARY` | The sheet sections |

Placement rule: **8px above its region, on the panel face, never inside the well.** Silkscreen goes
on the metal, not in the recess. `--label-tertiary` is validated for this register on `--panel` and
`--raised` and is forbidden on `--high` or on a cap.

### 3.6 The spec plate

Bottom-right of the rig panel, an engraved asset tag that recomputes with the song. It is the only
number on screen nobody needs, and it is the thing that makes a screenshot look like a photograph
of equipment.

```
DOWNBEAT · EP-133 K.O. II · C MIN · 96 BPM · 8 BAR
```

`--fs-legend`, `'wdth' 112`, `'wght' 500`, `letter-spacing: .1em`, uppercase,
`color: color-mix(in srgb, var(--ink) 16%, transparent)`. On regenerate it does a **slot cut**
(§5.6), not a character shuffle — a keygen effect would date within a year.

### 3.7 The wordmark

The product currently never shows its own name anywhere in the running UI. The mark is
**four vertical strokes on a hairline baseline** — a bar of four with beat one accented. That is
the word *downbeat* drawn. *(Merged from ANODISE's barline and PHOSPHOR's metronome, as all three
judges instructed.)*

- Stroke 1: `3 × 15px`, solid `--lamp`.
- Strokes 2–4: `1.5 × 8px`, `--ink` at 34%, spaced 5px.
- Baseline: 1px `--edge-hot`, running the width of the whole lockup and overshooting 8px to the
  right like a fader scale.
- Word: `DOWNBEAT`, Archivo `'wdth' 118 / 'wght' 700`, 13px, uppercase, `--tr-caps`, `--ink`.

At 16px the accented stroke plus the baseline **is** the mark — it survives the favicon where the
word cannot. It is live: each stroke lights per beat during playback (§7.4).

**Authored once** as an SVG string in `src/mark.js` and consumed by five places that currently
hand-transcribe or omit it: the inline favicon (`index.html:21`), `tools/make-icons.js`, the header
lockup, the three onboarding page marks, and the empty/loading states.

### 3.8 SVG text

`.dev-svg text { text-rendering: geometricPrecision }`. Faceplate sizes rise off 7px:

| | Was | Now |
|---|---|---|
| `.pad-id` | 7.5px | **9px**, `--ep-id` |
| `.pad-sub` | 7px | **9px**, `--ep-legend` |
| `.pad-main` | 13.5px | **14px**, `--ep-label`, `'wght' 620` |
| `.dev-hintline` | 7.5px | **9px**, `--ep-legend` |
| `.dev-wkey text` | 7px | **8.5px**, `--fm-legend` |

**Legends versus data.** The device's own permanent legends and Downbeat's generated instructions
are currently identical in face, weight and fill, so the eye cannot separate what the hardware says
from what the app is telling you. Split them:

- **Legends** (`.dev-brand`, `.dev-model`, `.dev-knob text`, `.dev-hintline`, fn-key captions):
  `'wght' 300`, `--tr-caps`, `fill-opacity: .72`, plus a 0.4px offset duplicate in the body colour
  at 35% behind them — a one-line emboss that makes ink sit *on* plastic.
- **Data** (`.pad-main`, `.pad-sub`, `.pad-id`, `.seg`, `.tft`, key note names): `'wght' 620`,
  full opacity, `--part` where it is part-scoped.

The `.seg` element uses `text-anchor: end` with `letter-spacing`, which in SVG leaves trailing
tracking after the final glyph. Compensate with `dx="1.5"` on the end-anchored `<text>`.

### 3.9 The wide band

There is currently **no media query above 1199px**. Add `@media (min-width:1600px)`: the chrome
ladder steps one rung (`--fs-ui` 14, `--fs-body` 16, `--fd` 16, `--fs-title` clamp ceiling 23),
`--gutter` 20 → 32px, `.desk` gap 12 → 20px, and the lane height target in `ui.js` rises from 210
to 280 so the extra vertical room becomes readable grid rather than empty panel.

Also change `.desk` from `minmax(340px, 30vw)` to
`minmax(340px, clamp(340px, 30%, 560px))`. Percentages resolve against the grid container, so the
ratio holds at every width and the rig stops eating 46% of the desk at 2560px and 91% at 5120px.

---

## 4. Space, shape and elevation

### 4.1 Spacing

A 4px base. Eight rungs. The current scale's own steps are non-uniform (4/8/12/**18**/**28**/44)
and 115 raw-pixel declarations were written around the holes.

```
--sp-0:2px;  --sp-1:4px;  --sp-2:8px;  --sp-3:12px;
--sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-7:48px;
```

Absorptions: 14→16, 18→16, 13→12, 11→12, 10→8, 7→8, 6→8 (or 4), 3→4, 22→24, 26→24, 30→32.
Deliberate optical corrections survive but must carry a one-line comment naming the decision — the
file already does this beautifully for layout reasoning and the habit extends to spacing. A
seven-pixel gap with no comment is a review rejection.

`--gutter: 20px` (14px below 900px, 32px above 1600px). `--tap: 44px` — unchanged, and the 44px
floor is enforced by `min-height` on **every** control. Two targets have already regressed below it
(`.tempo-actions .ghost` at 38px, `.tl-note` at ~5×18px); both are fixed in §6.

### 4.2 Radii

Named by **role**, not by size, so the choice is never a guess.

```
--r-chip:4px;    /* .map-cell, .tl-note, .step-n, duration ticks, faceplate legends */
--r-cap:8px;     /* things inside wells: .part, .device, .seq-chip, .map-head, .lib-card, .go */
--r-well:12px;   /* inset housings: .parts, .devices, .lane, run bed, select, .check, .creation-details */
--r-panel:18px;  /* .rig, .stage, .sheet, .onboarding-card, .performance-chrome */
--r-pill:999px;  /* .play, .check track and knob, .count, round focus targets */
```

**The nesting rule holds exactly and is derived, not eyeballed:** a well has `--sp-1` (4px) of
padding, so its cap radius is `12 − 4 = 8`. `--r-panel: 18px` is the EP-133's own proportion —
`rx=16` on a 356-unit body is 4.5% of the width, and 4.5% of a 400px `.rig` is 18px.

Seventeen distinct radii collapse to five. `99px` and `999px` both become `--r-pill`.

### 4.3 Borders

Every border in the app is `1px solid var(--edge)` or `1px solid var(--edge-hot)`. There is no
third weight except `@media (prefers-contrast: more)`, which takes load-bearing boundaries to 2px.
**No bevel is ever thicker than 1px.**

### 4.4 Elevation

Elevation is a **chamfer plus a cast**, not a fill change. One light source, fixed at top-centre,
never moves. Because the light source never moves, nothing in the interface is ambiguous about
which way is up.

```
--bevel:     inset 0 1px 0 var(--bevel-top), inset 0 -1px 0 var(--bevel-bot);
--bevel-in:  inset 0 1px 0 var(--bevel-bot), inset 0 -1px 0 var(--bevel-top);  /* wells: inverted */

--cast-0: 0 1px 0 var(--edge-cast);                                    /* contact line */
--cast-1: 0 1px 2px rgba(0,0,0,.34), 0 2px 6px rgba(0,0,0,.22);        /* resting cap */
--cast-2: 0 2px 6px rgba(0,0,0,.38), 0 10px 24px rgba(0,0,0,.28);      /* panel */
--cast-3: 0 4px 12px rgba(0,0,0,.42), 0 24px 56px rgba(0,0,0,.36);     /* sheet */
--cast-4: 0 8px 24px rgba(0,0,0,.46), 0 40px 90px rgba(0,0,0,.44);     /* modal */

--bloom-lamp: 0 0 0 1px color-mix(in srgb,var(--lamp) 40%,transparent),
              0 4px 18px color-mix(in srgb,var(--lamp) 38%,transparent);
--bloom-part: 0 0 14px color-mix(in srgb,var(--part) calc(var(--lit,0) * 62%),transparent);
```

Light theme overrides every cast to a **warm grey** (`rgba(120,112,94,α)`) at roughly 0.6× the
dark alpha, because a black shadow on putty reads as dirt. Per rule C8, light theme's casts do
proportionally more work than its bevels.

Twenty-two ad-hoc box-shadows collapse to these nine tokens. Nine hardcoded `rgba(0,0,0,…)`
shadows that do not respond to the theme are deleted.

### 4.5 Surface sheen

`--sheen: linear-gradient(178deg, color-mix(in srgb, var(--bevel-top) 100%, transparent) 0 1px,
transparent 1px)`. Applied to `.rig` and `.stage` as a background layer above `--panel`. This
replaces the existing `linear-gradient(145deg, color-mix(… #fff 1%), var(--panel))`, which does
very different things in the two themes because 1% white on near-black and 1% white on near-white
are not comparable operations.

### 4.6 The anti-Aqua guardrails

Bevels plus gradients plus cast shadows plus milled wells is one bad decision from 2008. These
rules are absolute and a reviewer rejects on any of them:

1. **One** light source, top-centre. No rule may imply light from any other direction.
2. **One** bevel recipe (`--bevel` / `--bevel-in`), reused everywhere with no variants.
3. **No bevel thicker than 1px.** Ever.
4. **No more than two gradient stops on any surface.** If a rule needs a third, it is decoration
   and it is cut.
5. **No texture bitmaps.** The only pattern in the system is the LCD dot matrix, which is an SVG
   `<pattern>` of 1×1 cells and is confined to the two displays.
6. **No `text-shadow` on any UI text.** The only text glow in the app is the SVG segment bloom
   inside the two displays and the count-in numeral.
7. **No gloss arcs, no highlight sweeps, no reflections.**
8. **No CSS screwheads, no rivets, no brushed-metal noise.** The spec plate does that job with
   more restraint and it does it with type.
9. `border-radius` may only take a value from §4.2.

---

## 5. Motion

Machines do not bounce. Every curve describes a mechanism with mass and a hard stop. The only
elasticity in the system is where real elasticity exists: a finger dragging a sheet and letting go.

### 5.1 Easings

```
--e-detent: cubic-bezier(.16,.84,.28,1);   /* a rotary switch clicking to the next position.
                                              Fast off the mark, settles hard, zero overshoot.
                                              Part switch, device switch, pill toggles. */
--e-travel: cubic-bezier(.34,.02,.2,1);    /* key travel. Slow to break, quick through,
                                              cushioned at the bottom. Press states, hover. */
--e-throw:  cubic-bezier(.2,0,0,1);        /* a drawer thrown open. Entrances only. */
--e-close:  cubic-bezier(.5,0,.9,.4);      /* accelerating away. Exits only. */
--e-decay:  cubic-bezier(.3,0,.6,.2);      /* LED / phosphor falloff. Only on --lit and bloom. */
--e-rubber: cubic-bezier(.18,1.3,.42,1);   /* the ONE overshoot in the app. Sheet drag release
                                              and the .check knob. Nothing else. */
```

### 5.2 Durations

Tied to mass, not to taste. Fifteen ungrouped durations collapse to six plus the beat-relative one.

```
--t-lamp:40ms;    /* light strikes */
--t-click:110ms;  /* a cap travels */
--t-throw:220ms;  /* a switch flips */
--t-slide:320ms;  /* a drawer */
--t-power:520ms;  /* the unit powers up */
```

**Beat-relative decay** *(graft: PHOSPHOR — the highest value-per-line change in the whole
review):*

```
--beat-ms:545;   /* 60000 / bpm — written ONCE PER SONG by Motion.tempo(bpm), never per frame */
--t-decay: clamp(140ms, calc(var(--beat-ms) * .42 * 1ms), 380ms);
--hop:     clamp(28ms, calc(var(--beat-ms) * .08 * 1ms), 64ms);  /* choreography step */
```

At 76 BPM a lit pad lingers for 331ms; at 158 BPM it snaps at 160ms. The interface gets faster when
the music does. **Document the clamp honestly:** outside roughly 66–180 BPM the idea stops being
literally true, and both Ambient and Trap are in this app's own genre list.

### 5.3 Exits

**Global rule: `exit = round(0.55 × entrance)`, always on `--e-close`.** There are currently
**zero** exit animations in the entire codebase; every dismissal is a `display:none` flip. This is
the largest single gap versus the reference.

| Surface | In | Out |
|---|---|---|
| Sheet (desktop, X) | 320ms `--e-throw` | 180ms `--e-close` |
| Sheet (phone, Y) | 260ms `cubic-bezier(.32,.72,0,1)` | 145ms `--e-close` |
| Scrim blur | 280ms | 155ms |
| Onboarding card | 340ms | 190ms |
| Count-in | 300ms | 165ms |
| Toast | 200ms `--e-throw` | 110ms `--e-close` |
| Any `[hidden]` toggle | 220ms | 120ms |

All seven surfaces route through **one** helper: `Motion.hideWith(el, 'is-leaving', ms)`. Nothing
in the app is permitted to vanish in a frame.

### 5.4 Registered properties

Nothing below works without these. There are currently **zero** `@property` registrations in the
repo.

```css
@property --part      { syntax:'<color>';  inherits:true;  initial-value:#4E9BEA }
@property --part-ink  { syntax:'<color>';  inherits:true;  initial-value:#7FB8F2 }
@property --tint      { syntax:'<color>';  inherits:true;  initial-value:#4E9BEA }
@property --lit       { syntax:'<number>'; inherits:false; initial-value:0 }
@property --head      { syntax:'<number>'; inherits:false; initial-value:0 }
@property --vel       { syntax:'<number>'; inherits:false; initial-value:.8 }

#desk { transition: --part var(--t-throw) var(--e-detent),
                    --part-ink var(--t-throw) var(--e-detent); }
```

Everything downstream that reads `var(--part)` cross-fades for free. This is the app's stated
central visual idea — "the whole right-hand side takes the part's colour" — which today is
delivered as a single-frame teleport.

Theme tokens (`--room`, `--panel`, `--raised`, `--ink`, `--edge`) are **not** registered globally.
The theme crossfade is a scoped, temporary class instead (§7.3 note) so it costs nothing during
normal interaction.

### 5.5 Choreography

**Colour propagates outward from the control you touched.** It never teleports and it never all
arrives in the same frame.

| Event | Order and delay |
|---|---|
| Part switch | chip `0`, lane `1×--hop`, run `2×--hop`, faceplate used-map `3×--hop`, then per-pad `14ms × index` in reading order |
| Theme change | rig `0`, stage `1×--hop`, bar `2×--hop` — the lights come up across the desk |
| Boot | six regions at `--enter-i × 45ms`, faceplate **first and fastest** |
| Generate | title slot-cut `0`, lane sweep `60ms`, chips staggered behind it |

Implemented as `transition-delay: calc(var(--enter-i) * var(--hop))` with `--enter-i` written by
`Motion.stagger()`. **Never** chained `setTimeout`.

**Stagger cap: `step 16ms, max 12 nodes.`** A 64-chip run must not take a second to arrive; nodes
past the twelfth share the twelfth's delay.

**Direction is carried.** `--dir: 1 | -1` is set from the index delta on every part change, page
change and swipe, so forward and back are not the same animation.

### 5.6 Signature transitions

**The material detent.** ON is not a lighter fill, it is a different metal:

```css
.is-capped{
  background:linear-gradient(var(--alu-edge),var(--alu));
  box-shadow:var(--bevel), var(--cast-0);      /* bevel FLIPS from --bevel-in to --bevel */
  color:var(--ink);
  transition:background-image var(--t-click) var(--e-travel),
             box-shadow var(--t-click) var(--e-travel),
             color var(--t-click) var(--e-travel);
}
```

Only `background-image` and `box-shadow` animate, so it reads as a cap rising rather than a colour
changing.

**The lamp strike.** Attack is instant, decay is beat-relative:

```css
.dev-pad rect,.dev-wkey rect,.dev-bkey rect,.dev-key rect{
  transition:fill var(--t-decay) var(--e-decay), stroke var(--t-decay) var(--e-decay);
}
.dev-pad[data-struck] rect{ transition-duration:var(--t-lamp); }
```

**The slot cut** *(graft: PRESSING)* — any text replacing text. Each word wrapped in an
`overflow:hidden` span; outgoing `translateY(-100%)`, incoming from `translateY(100%)`, 240ms
`--e-detent`, staggered 40ms per word. Used on the song title, the transport label, the LCD note
readout and the spec plate.

**The colour sweep.** A 3px-wide vertical `--part` gradient wipe, `translateX` across the lane over
240ms `--e-throw`. Transform-only. Used on generate and on reroll (scoped to the half that
changed).

### 5.7 Performance is a correctness requirement

This is a music tool. A stuttering playhead is a credibility bug, not a polish item.

| Must change | From | To |
|---|---|---|
| `#barProgress` | `style.width` + `transition:width .1s linear` | `transform:scaleX(var(--head))`, `transform-origin:left center`, **transition deleted** |
| `.lane-head` | `left:calc(var(--head) * 100%)` | `left:0; translate:calc(var(--head) * 100cqw)` with `.lane-wrap{container-type:inline-size}` |
| `.onboarding-dots i` | `transition:width .2s` | `transform:scaleX()` on a fixed 18px pill |

A 100ms transition restarted every rAF frame means the visual transport is permanently ~100ms
behind the audio. Delete it.

`will-change:transform` is added by a `body.is-live` class on playback start and **removed on
stop**, never left on. Bloom is **one shared SVG filter on the pad group**, never per-pad.
`body.is-performing .rig-stage { filter:saturate(1.08) }` is **deleted** — it wraps up to twelve
nested per-pad filters in an outer filter and forces a full re-raster of the hero every step.

Also cache the five per-frame `querySelector` calls at module scope, guard the two `textContent`
writes behind a change check, and memoise `idFor` into a `Map` at build time.

### 5.8 Reduced motion

The `*{transition-duration:.001ms !important}` wildcard at `styles.css:1211` is **deleted**. A
blanket kill switch is the lifeless outcome by construction: it removes the 40ms pad strike, which
is *information*, and it would silently neuter every entrance added here.

**Keep at full duration** (these carry meaning): `--lit` decay, the `.now` marker, focus rings, and
every colour / border-color / background-color / fill transition.

**Remove**: every `translate`, `scale` and `rotate`; the power-on sequence (replaced by a 120ms
opacity-only reveal); the colour sweep (replaced by a 120ms cross-cut); the swipe tracking; the
FLIP reflows; the mark's per-beat lighting (it holds at rest state).

**Add**: `animation-iteration-count: 1 !important` so nothing loops.

**JS must honour it too.** `Motion.reduced()` is a live `matchMedia` read, re-checked per call so a
mid-session OS change is respected, and it gates the two smooth scrolls at `ui.js:302` and
`ui.js:1058`. Content auto-scrolling under the user during playback is the only genuinely
vestibular motion in the app and it is currently the only motion the preference does not reach.

### 5.9 Explicitly rejected

Rejected by judge consensus. Do not implement, do not reintroduce:

- **Per-frame writes of inherited registered custom properties to `:root`.** Style invalidation
  scope is the whole document, not the consumer count. `--beat-ms` is written once per song.
- **An always-on room-wash / breathing background.** At most, a one-shot `--part`-coloured wash on
  generate.
- **A frame-time governor with a degraded mode.** A governor that disables the signature effect
  under load is an admission that the effect is optional.
- **Per-pad SVG blur duplicates.** One shared group filter.
- **Asymmetric per-button hover rotation.** Charming on a comic site, hostile on a control row you
  stab at one-handed with your other hand on a pad grid.
- **Zero border-radius, printer's crop marks, a full-viewport saturated count-in flood.**
- **A character-shuffle on the spec plate.** Keygen effect. Use the slot cut.

---

## 6. Components

Format for every entry: **Rest / Hover / Active / Focus / Disabled / Entrance / Exit.** Hover is
always inside `@media (hover:hover) and (pointer:fine)`. Focus is always `:focus-visible` with
`--focus-ring`. Where an entry says "standard", it means: rest as specified, hover
`--e-travel 110ms`, active `translateY(.5px)` + `--cast-0` removed, focus `--focus-ring`, disabled
`opacity:.42; cursor:not-allowed`, entrance via the parent's stagger, exit via `Motion.hideWith`.

### 6.1 Chrome

#### `.bar` — header, 56px, fixed
- **Rest** `--material`, `backdrop-filter: blur(28px) saturate(170%)`, bottom `1px --edge`,
  `padding: var(--safe-t) calc(var(--gutter) + var(--safe-r)) 0 calc(var(--gutter) + var(--safe-l))`.
  Along its bottom edge, a 3px milled slot (`--inset`, `--bevel-in`) carrying the transport (§6.4).
- **Layout order** wordmark · 1px vertical `--edge` · song title block · spacer · transport pill ·
  **toggle well** (`.pill` group in an `--inset` housing) · 1px vertical `--edge` · sheet-openers ·
  theme rocker. Three visible tiers, not one row of interchangeable lozenges.
- **Hover/Active/Disabled** n/a. **Focus** n/a (children only).
- **Entrance** `--enter-i: 0`, opacity + `translateY(-6px)`, 260ms `--e-throw`.
- **Exit** only into performance mode: cross-fade with `.performance-chrome` (§6.32).
- On `@media (max-height:500px) and (max-width:1199px)` `min-height:0` and `.bar-song` padding
  drops — keyed to **height**, not width, because a phone on its side has the same scarce dimension
  as a laptop.

#### `.wordmark` — the mark plus DOWNBEAT (new)
Spec in §3.7. Live behaviour in §7.4.
- **Rest** static; stroke 1 solid `--lamp`, strokes 2–4 `--ink` at 34%.
- **Hover** none (it is not a control).
- **Focus** none. It is `aria-hidden="true"`; the app's identity is announced by the `<h1
  class="sr-only">Downbeat</h1>` added as the first child of `<body>`.
- **Entrance** baseline draws first (`scaleX(0)→1`, 200ms `--e-throw`), then the four strokes
  stagger in at 60ms.

#### `.bar-song` — title and meta
- **Rest** title `--fs-title`, `--ink`, two-line clamp on phone, one line + ellipsis above 700px.
  Meta below in `--mono --fd-xs`, uppercase, `--tr-caps`, `--muted`:
  `LO-FI HIP-HOP · C NATURAL MINOR · 84 BPM`. *(Graft: PRESSING — the TITLES pool is the best
  writing in the codebase and is currently ellipsised at 13.5px like a filename. Take the value,
  not the 40px poster headline.)*
- **Entrance / on generate** slot cut, 240ms, 40ms per word.
- **Exit** n/a.

#### `.bar-pos` — position readout
- **Rest** `--mono --fd-sm`, `--part-ink`, `--r-pill`, `padding: 4px 8px`,
  `background: color-mix(in srgb, var(--part) 12%, transparent)`. **Reserve its width** with a
  `min-width` sized to `bar 88/88` so the toolbar does not reflow when playback starts.
- **Entrance** opacity 120ms. Never `display:none` mid-row.

#### `.icon` — theme rocker, sheet close, performance prev/next
- **Rest** 44×44, `--r-pill`, `--high`, `--bevel`, `--muted` glyph from the SVG sprite (§6.36).
- **Hover** `--alu-edge` background, `--ink` glyph, `translateY(-.5px)`, 110ms `--e-travel`.
- **Active** `translateY(.5px)`, bevel inverts to `--bevel-in`.
- **Focus** `--focus-ring`, radius matches (`--r-pill`, so the ring hugs the circle).
- **Disabled** `opacity:.42`, no hover.
- **Entrance/Exit** with parent.

The theme control specifically is a **two-position rocker**: a 34×20 `--inset` well containing a
16×16 `--alu` cap that translates 14px on `--e-detent` 220ms. It is not an icon button; it is a
switch, and it should look thrown.

### 6.2 The transport tier

#### `.play` — primary transport
- **Rest** `--lamp` fill, `--on-lamp` ink (**8.24:1**), `--r-pill`, `min-height:44px`,
  `padding: 0 var(--sp-5)`, `--bloom-lamp`, label `PLAY` in Archivo `'wght' 620` uppercase
  `--tr-caps` with a 9px solid `--on-lamp` triangle before it. It is the only fully lit object in
  the chrome.
- **Playing state** (`.is-playing`) drops to a capped control: `--alu`, `--ink`, glyph becomes a
  square. It stops emitting because the emission has moved to the transport slot.
- **Hover** `filter: brightness(1.06)`, `translateY(-1px)`, bloom radius +4px, 110ms `--e-travel`.
- **Active** `translateY(1px)`, `--bloom-lamp` collapses to the inner ring only.
- **Focus** `--focus-ring` — the outer 34% halo is what reads against the amber fill.
- **Disabled** never. If audio is unavailable the button stays live and surfaces the error (§6.39).
- **Entrance** the last thing to arrive in the power-on sequence: bloom `0 → --bloom-lamp` over
  180ms. That moment *is* "the app is ready".

#### The transport slot — `.bar-progress` → segmented per-bar strip *(graft: PRESSING)*
- **Rest** a 3px milled slot (`--inset`, `--bevel-in`, `--r-chip`) spanning the bar's bottom edge,
  divided into **one segment per bar of the song** with 1px `--edge` gaps.
- **Playing** completed bars fill `--lamp` at 45%; the current bar fills left-to-right via
  `transform: scaleX(var(--head))`, `transform-origin: left center`, **no transition** (the rAF
  provides the interpolation); upcoming bars stay empty. You read your position in the *form*, and
  the loop point is visible as the strip resetting.
- **Hover** the hovered segment lifts to `--lamp` at 20% with `cursor:pointer`.
- **Active/Click** seeks to that bar.
- **Focus** each segment is a real `<button>` with `aria-label="Bar 3 of 8"`; `--focus-ring` inset.
- **Optional, may be deferred:** `--level` from a 512-bin `AnalyserNode` on the master bus scales
  the slot's height via `transform: scaleY()` on a fixed 3px element, and adds
  `--bloom-lamp` at `calc(var(--level) * 40%)`. Hard scope: **one** consumer, read from the
  *existing* `followPlayhead` rAF (no new loop), node connected on play and disconnected on stop,
  never holding the context awake. It is the clearest possible indication of the state where the
  AudioContext has not resumed and the app is silently doing nothing.

### 6.3 The toggle tier — `.pill`

All toggles live inside one `--inset` housing (rule C6), `--r-well`, `--sp-1` padding, `gap 2px`.

- **Rest (off)** transparent, `--muted`, `--fs-ui`, `--r-cap`, `min-height:44px`,
  `padding: 0 var(--sp-3)`.
- **Rest (on, `[aria-pressed=true]`)** the **material detent** (§5.6): `--alu` cap, `--bevel`
  (flipped from the housing's `--bevel-in`), `--cast-0`, `--ink` label, **plus** a 5px `--lamp` dot
  before the label. Two signals, never a fill change alone.
- **Hover** off → `--high` at 60%, `--ink`; on → `filter: brightness(1.04)`.
- **Active** `translateY(.5px)`.
- **Focus** `--focus-ring`, `--r-cap`.
- **Disabled** `aria-disabled="true"`, `opacity:.42`, stays focusable, click announces the reason.
- **Entrance/Exit** conditional pills (`#undoButton`, `#tempoReset`, `#installButton`) are
  **always rendered** with `visibility:hidden; opacity:0; pointer-events:none` and animate in with
  opacity + `translateY(-3px)` over 160ms. The row geometry is stable from first paint. This is
  what currently clips `#structureButton` off a 374px screen.

`#loopButton` moves out of this row entirely: Loop is a transport property, so it becomes a toggle
badge on the Play button itself, reachable and readable at every width. It is currently
`display:none` below 700px, which is the CSS equivalent of deleting the feature.

### 6.4 The dialog-opener tier — `.pill.is-key`

- **Rest** `--high`, `--bevel`, `--edge` hairline, `--ink` label, **trailing 8px chevron glyph**
  from the sprite. Sits in its own group after a 1px vertical `--edge`, outside the toggle housing.
- **Hover** `--alu-edge` background, `translateY(-.5px)`.
- **Active/Focus/Disabled** standard.
- **Entrance/Exit** with the bar.

### 6.5 `.ghost` — secondary action

- **Rest** `--high`, `--bevel`, `--edge`, `--muted`, `--fs-ui`, `--r-cap`,
  `min-height: var(--tap)` — the current `.tempo-actions .ghost { min-height:38px }` override is
  **deleted**.
- **Hover** `--ink`, `--edge-hot`, `translateY(-.5px)`. **Active** `translateY(.5px)`.
- **Focus/Disabled** standard.
- Grouped in the sheet with real headings (§6.24), never as one undifferentiated bank of nine.

### 6.6 `.go` — sheet primary

- **Rest** `--lamp`, `--on-lamp`, `--r-cap`, `min-height:48px`, full width, `--bloom-lamp`.
- **Hover** `brightness(1.06)`, `translateY(-2px)`. **Active** `translateY(1px)`,
  `brightness(.96)` — *not* `filter: brightness()` alone, which shifts hue on a coloured button.
- **Focus** `--focus-ring`.
- Lives in a **sticky sheet footer** with a top `--edge` and `--raised` background, so it never
  scrolls away below seven fields on a phone.

### 6.7 `.desk`

`grid-template-columns: minmax(340px, clamp(340px,30%,560px)) minmax(0,1fr)`; gap `--sp-3`;
padding `--sp-3` plus gutters and safe areas. Height `calc(100dvh - var(--bar-h) - var(--thumb-h,0px))`.
**Entrance** none of its own; it stages its children (§7.1).

### 6.8 `.rig` and `.rig-stage`

- **Rest** `--panel` + `--sheen`, `--r-panel`, `1px --edge`, `--bevel`, `--cast-2`,
  `padding: var(--sp-4)`. Legend `HARDWARE` at top-left, spec plate bottom-right.
- `.rig-stage` carries `aspect-ratio: var(--dev-ar)` emitted with the view
  (`356/540` EP, `682/366` FM) and `margin:auto`, so the FM-1 is not marooned in a tall column at
  a third of the EP-133's visual weight. Transition `aspect-ratio` over 400ms `--e-detent` where
  supported.
- **Entrance** `--enter-i: 1` but **first and fastest** in the power-on order: the hardware should
  already be there when the chrome arrives.

### 6.9 `.devices` / `.device`

- `.devices` is a well: `--inset`, `--r-well`, `--bevel-in`, `--sp-1` padding, `gap 2px`.
- `.device` **rest** transparent, `--muted`, `--fs-ui`, `--r-cap`, `min-height:44px`; `small` line
  in `--label-tertiary --fs-legend`.
- **On** the material detent, identical recipe to `.pill[aria-pressed=true]`.
- **Hover** `translateY(-1px)` **and the faceplate behind it gains 3% saturation** over 180ms —
  hovering the button visibly reaches the object.
- **Active/Focus/Disabled** standard.
- **Exit** switching device cross-fades the two faceplates (§7.3), it does not cut.
- The bare `transition:.15s` at `styles.css:219` — which is `transition: all .15s` — is replaced
  with an explicit property list.

### 6.10 `.stage` / `.stage-body`

`--panel` + `--sheen`, `--r-panel`, `--bevel`, `--cast-2`, `overflow:hidden`, `position:relative`
(the sheets are its children and that is load-bearing). `.stage-body` gets
`scrollbar-gutter: stable` so nothing shifts when content grows.

### 6.11 `.parts` / `.part` — the main gesture

- `.parts` is a well: `--inset`, `--r-well`, `--bevel-in`, `--sp-1` padding, `gap 2px`.
- `.part` **rest** transparent, `--muted`, `--fs-ui`, `--r-cap`, `min-height:44px`, with its
  **shape token** (§2.3) silkscreened at 40% opacity before the label. The colour key is readable
  without selection and survives deuteranopia.
- **On** material detent + label in `--tint-ink` + the shape token at full opacity in `--tint` +
  the indicator dot.
- **The indicator dot must not pop.** It exists unconditionally:
  `.part::before { width:0; margin-right:0; opacity:0; transform:scale(0);
  transition: width 220ms var(--e-detent), margin 220ms var(--e-detent), opacity 160ms,
  transform 280ms var(--e-rubber) }` and `.part.is-on::before { width:6px; margin-right:7px;
  opacity:1; transform:scale(1) }`. The label slides rather than jumps.
- **Hover (unselected)** the dot previews at 40% opacity; label to `--ink`.
- **Active** `translateY(.5px)`; `navigator.vibrate(8)`.
- **Focus** `--focus-ring`, `--r-cap`.
- **Unavailable (e.g. Counter with no countermelody)** `aria-disabled="true"` — **not**
  `disabled` — so it stays focusable and announces its label. `opacity:.45` plus a 9px `OFF` tag.
  Activating it opens the New song sheet with the counter toggle focused, turning a dead control
  into a one-tap fix.
- **Entrance** `--enter-i: 2`. **Exit** on part change the housing recoils 1.5px in the direction
  of travel over 90ms `--e-travel` and returns — the switch body kicks (§7.3).

### 6.12 `.lane-wrap`, `.lane-bars`, `.lane`

**The gutter blocker.** The bar-number rail and the playhead are positioned against `.lane-wrap`
while the drum grid is inset 80px behind a voice-name gutter, so on the drums part the playhead
and every bar number point at the wrong place. Introduce **one** custom property and resolve all
three against it:

```css
.lane-wrap{ --lane-gutter:26px; container-type:inline-size; }   /* pitched: keyboard gutter */
.lane-wrap.is-drums{ --lane-gutter:calc(64px + var(--sp-2) * 2); }
@media (max-width:699px){ .lane-wrap.is-drums{ --lane-gutter:calc(44px + var(--sp-2) * 2); } }

.lane-bars{ margin:0 0 var(--sp-1); padding-left:var(--lane-gutter); }
.lane-head{ left:0; translate:calc(var(--lane-gutter) + var(--head) * (100cqw - var(--lane-gutter))); }
```

`#laneHead` is reparented into `.lane` so it spans only the grid, not the number rail above it.
The bar-1 tick is restored (remove the `:first-child` suppression) so labels and rules are 1:1.

- `.lane` **rest** `--inset`, `--r-well`, `--bevel-in`, `1px --edge-hot`.
- **Pitched lane gains what it currently lacks:** beat rules at `--edge` (a second
  `background-image` at `calc(100% / (var(--bars) * 4))`) beneath bar rules at `--edge-hot`;
  piano-roll pitch banding shading black-key rows at `--edge` 40%; a 2px `--part` rule across the
  tonic row; and a 26px left gutter drawn as a miniature keyboard with `C4` / `C5` in `--fd-xs`.
- **Entrance** `--enter-i: 3`.

#### `.tl-note`

- **Rest** solid pigment block, `--r-chip`, `--bevel` (`inset 0 1px 0 rgba(255,255,255,.28),
  inset 0 -1px 0 rgba(0,0,0,.24)`) so notes read as keys pressed into the well.
- **Velocity is carried by ink density, not by height and not by opacity:**
  `background: color-mix(in srgb, var(--part) calc(46% + var(--vel) * 54%), var(--inset))`.
  A tint of the same opaque ink — which is what halftone screen-printing does — so it stays
  pigment, and it never lies about pitch the way a bottom-aligned bar height would. Notes above
  0.85 velocity additionally carry a 2px full-chroma accent cap along their top edge, which
  survives greyscale and any density.
  *(This is the resolution of the one 2-1 judge split; both objections are answered.)*
- **Light theme** adds `box-shadow: 0 0 0 1px var(--on-part)` per rule C7.
- **Label** `--fd-xs` in `--on-part`, `overflow: visible` for notes spanning ≥2 steps.
- **Density is measured, not guessed.** Replace the step-count heuristic with
  `const colW = lane.clientWidth / song.totalSteps;` and a **per-note** `is-dense` class from
  `colW * note.dur < 20`, so a whole note keeps its name even when the sixteenths around it drop
  theirs. Recompute on the existing resize handler.
- **Hover** `filter: brightness(1.12)`.
- **Click handler is removed entirely.** At ~5×18px it fails WCAG 2.5.8 by a factor of five, and
  the `.seq-chip` run directly below already provides note preview at a proper 44px target. This
  also removes a per-note listener from every `renderLane`. The lane is the read-only contour the
  `aria-hidden` markup already declares it to be.
- **A11y** `.lane-wrap` gets `role="img"` and the generated `aria-label`, mirroring what
  `Devices.mount` already does correctly for `#rigStage` (`devices.js:577-579`). The description is
  detached from `#laneToggle`, which is `display:none` on desktop and therefore never announced —
  meaning half the app's stated value is currently silently dropped for screen-reader users on the
  primary layout.

#### `.lane-head`
2px `--lamp` rule with a 40px leading gradient and `--bloom-part`. `translate` only. As it crosses
a note, that note's `--lit` goes to 1 and decays on `--t-decay` behind it, so the lane reads as
being *written* rather than scrolled.

#### Drum grid
`.drum-row` `grid-template-columns: 64px minmax(0,1fr)` (44px below 700px). `.drum-cell`
`--r-chip`, borders at `--edge` / `--edge-hot`. Hit fill already carries velocity — keep it and
make the pitched lane match. Pre-bucket `song.drums` by integer step into an array at build time so
the per-frame scan becomes one array index.

#### `.lane-toggle` (phone)
The chevron currently animates while the panel it indicates jumps. Add
`transition: height 300ms var(--e-detent)` to `.lane` under `body.has-thumb`, fade `.lane-bars` /
`.lane-head` with opacity rather than `display:none`, and match the chevron's duration to the
panel's so they read as one gesture.

### 6.13 `.run` and its chips

**The run becomes a score.** *(Graft: PRESSING — all three judges took this.)*

```css
.run{
  display:grid; grid-template-columns:28px minmax(0,1fr);
  gap:var(--sp-2) var(--sp-3); align-content:start;
  scrollbar-gutter:stable;
}
```

One row per bar: the bar number in the gutter (`--fd-xs`, `--muted`), that bar's chips in a flex
row beside it. A bar marker can never orphan at a line end, and the run scans vertically like a
lead sheet.

#### `.seq-chip`
- **Rest** `--high`, `--bevel`, `1px --edge-hot`, `--r-cap`, `min-height: var(--tap)`.
  A 9px uppercase `PAD` eyebrow in `--label-tertiary` over the glyph in `--fd` `--part-ink`,
  both in a **fixed-width glyph column** so every chip's glyph starts at the same x (today `pad
  ENTER` and `pad 1` are different widths and the widths carry noise where they could carry
  signal). Note name and duration beneath in `--fd-sm --muted`.
- **Width is proportional to duration** *(all three judges: take outright)*:
  `flex:0 0 auto; min-width: calc(var(--tap) + clamp(0px, (var(--dur) - 1) * 7px, 84px))`, with
  `style="--dur:{e.dur}"` emitted per chip. The run finally carries rhythm as well as order —
  the largest information gain available anywhere in this overhaul.
- **`.seq-rest` (new)** narrow, dashed `--edge`, non-interactive, sized by the gap, so the
  horizontal rhythm is honest rather than implied by whitespace.
- **`.is-off`** (unplayable note) — **not** dimmed. Full opacity, dashed `--edge` border, a `↑8`
  or `⌀` glyph in place of the word `OFF`, and the `small` line carries the actionable fix:
  `C6 · above the pads` or `needs oct +1`. Above the run, a summary when any exist:
  `3 notes sit outside the pads`.
- **Hover** `translateY(-2px)`, `--edge-hot` → `--part`, **and the corresponding pad blooms at
  `--lit: .55`** with the device's own display printing the note name (§7.5).
- **Active** `translateY(0)`, `scale(.98)`.
- **Focus** `--focus-ring`, `--r-cap`.
- **`.now`** *asymmetric by design*: arrives instantly (`transition-duration: 0ms` —
  it marks *now*) and fades off over 340ms `--e-decay`, so the eye can track where it just was.
  Fill, border **and box-shadow** are all in the transition list; today `background-color` is
  omitted and snaps while the other two fade.
  Add `transform: translateY(-2px)` so the current chip physically lifts out of the run.
- **Auto-scroll** *(functional bug fix)*: on the `key !== lastKey` branch that already exists, call
  `chip.scrollIntoView({ block:'nearest', inline:'nearest', behavior: Motion.reduced() ? 'auto' :
  'smooth' })` — but only when the chip is outside the run's client rect. Today the highlighted
  chip is off-screen by bar 3 and the feature the whole panel exists for silently stops working.
- **Entrance** `Motion.stagger(chips, {step:16, max:12})`.

#### `.seq-chord`
Same material. `.seq-chord-name` `--fs-lead`; `.seq-chord-keys` in `--fd-sm --part-ink` with each
note in its own `<span>` and `gap` on a wrapping flex row, so `overflow-wrap:anywhere` no longer
splits an accidental from its letter.

#### `.seq-bar`
`--fd-xs --muted` in the grid gutter. No border-left, no orphaning — the grid handles it.

### 6.14 The faceplate

**The blocker: there is not one `<defs>`, `<linearGradient>`, `<radialGradient>`, `<filter>`,
`<pattern>` or `clipPath` anywhere in the codebase.** Every surface on the hero object is a flat
fill with a 1px stroke, and the device casts no shadow, so it is printed on the panel rather than
resting on it.

#### Required `<defs>`, emitted once per faceplate

```svg
<defs>
  <linearGradient id="ep-body" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--ep-body-hi)"/><stop offset="1" stop-color="var(--ep-body-lo)"/>
  </linearGradient>
  <linearGradient id="ep-cap" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--ep-cap-hi)"/><stop offset="1" stop-color="var(--ep-cap-lo)"/>
  </linearGradient>
  <filter id="dev-cast" x="-12%" y="-8%" width="124%" height="122%">
    <feDropShadow dx="0" dy="2"  stdDeviation="2"  flood-opacity=".45"/>
    <feDropShadow dx="0" dy="22" stdDeviation="26" flood-opacity=".38"/>
  </filter>
  <filter id="pad-bloom" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <pattern id="lcd-grid" width="2" height="2" patternUnits="userSpaceOnUse">
    <rect width="1" height="1" fill="#000" fill-opacity=".22"/>
  </pattern>
  <radialGradient id="pad-lit" cx=".5" cy=".42" r=".62">
    <stop offset="0" stop-color="color-mix(in srgb, var(--part) 55%, #fff)" stop-opacity="var(--lit)"/>
    <stop offset="1" stop-color="var(--part)" stop-opacity="var(--lit)"/>
  </radialGradient>
</defs>
```

`#pad-bloom` is applied to the **pad group**, once. Never per pad.

#### Structure per pad — three layers, not one
1. **Well** `<rect x-1 y-1 w+2 h+2 rx=9 fill="var(--ep-well)"/>` — the cap sits *in* the body.
2. **Cap** `<rect … fill="url(#ep-cap)" stroke="var(--ep-edge)"/>`.
3. **Specular** `<path d="M{x+3},{y+1.2} h{w-6}" stroke="rgba(255,255,255,.7)" stroke-width="1"/>`
   plus an occlusion hairline at the base at `rgba(0,0,0,.14)`.

The whole faceplate group is wrapped in `<g filter="url(#dev-cast)">`, with a ground-plane
`<ellipse>` behind it (radial `rgba(0,0,0,.35)` → transparent, 1.06× body width, ~40px tall). The
viewBox extends ~40 units to give the shadow room: EP `0 0 356 540`, FM `0 0 682 366`.

#### Geometry on a grid
Nothing currently sits on one — the EP-133 has three different right margins (334 / 336 / 338) and
two gutters (6px and 10px); the FM-1 has left edges at 19 and 35 and right edges at 657 / 663 / 667.
Define one module per device and derive every coordinate:
`const EP = { M:20, W:316, COLS:3, GAP:10 }` → pad width `(316 − 20) / 3 = 98.67`, everything
right-aligning at 336. The function-key row rebuilds on the same 3-column split so `main` /
`sample` / `tempo` sit exactly above pad columns 1/2/3. FM-1 pins the knob row, both fn rows and the
keybed to `x = 19 … 663`.

#### FM-1 keybed
Black keys are currently dead-centred on every seam, which is the classic tell of a drawn keyboard —
a musician clocks it instantly. Compute each black key's x from equal white-key tail widths (for the
F–B group offsets of roughly −3 / +3, for C–E −4 / 0 / +4, scaled to `KEY_W`). Inset each white key
0.75px both sides so a real 1.5px dark gap appears. Add a 4px front chamfer at the key's bottom edge
(8% darker) with a 1px `rgba(255,255,255,.6)` highlight above it. Drop
`feDropShadow dy=1 stdDeviation=1.5` on the black-key group so they float above the white bed.

#### States

| State | Treatment |
|---|---|
| **Rest** | Well + cap gradient + specular + occlusion, per above. |
| **`.used`** | `fill: color-mix(in srgb, var(--part) 22%, var(--ep-cap))`, `stroke: color-mix(in srgb, var(--part) 45%, var(--ep-edge))`, **plus a 2.5px `--part` bar screen-printed along the bottom edge** (`<rect x+6 y+h-4 w-12 3 rx=1.5>`). The bar is mandatory — the tint alone is 1.05–1.18:1 against the chassis. |
| **`.lit`** | `fill: url(#pad-lit)` driven by `--lit`; `stroke: var(--on-part)` at 1.5px so the boundary reads on every hue; bloom via the group filter at `opacity: var(--lit)`; and the pad depresses `translateY(calc(var(--lit) * .8px))` with `transform-box: fill-box`. |
| **Hover** | Pads **rise** `translateY(-.8px)` and the cap lifts 4%; FM-1 keys **sink** `translateY(+.9px)` and the front-chamfer highlight shortens — because that is what a key does and a pad does not. The LCD reads back that pad's note. 110ms `--e-travel`. |
| **Active** | `--lit: 1` for one frame with `transition-duration: 0`, then decay. |
| **Focus** | `.dev-pad:focus-visible rect { stroke: var(--lamp); stroke-width: 2.5 }` with `outline: none` on the `<g>` — the default UA ring on an SVG group is a bounding box that ignores `rx`. |
| **Disabled** | n/a. |

#### The display
Currently monospace text on a flat rectangle — it reads as a terminal window, not a backlit LCD.
Four layers, all zero-dependency:
1. **Recess** two inset hairlines: `rgba(0,0,0,.72)` top/left, `rgba(255,255,255,.06)` bottom/right.
2. **Dot matrix** `url(#lcd-grid)` overlaid on the display rect and masked over the segment text.
3. **Bloom** the segment text duplicated behind itself at `stdDeviation 2.2`, 55% opacity.
4. **Glass** a 12° `linearGradient` sheen at `rgba(255,255,255,.05)` across the top third.

The FM-1 TFT gets the same recess but a **sharper, non-dotted** pixel grid and a colder `--fm-tft`
glass, because a TFT and a segment LCD do not look alike.

#### A11y — the hero is currently unreachable by keyboard
`aria-hidden="true" focusable="false"` on an SVG whose every pad carries a click handler is simply
broken. Remove both from the `<svg>`. Give each interactive `<g>`:
`role="button" tabindex="0" aria-label="Pad 5, C4, root"` (drums: `"Pad 1, Kick"`), plus a
`keydown` Enter/Space branch alongside the existing click. Mark the decorative geometry (knobs,
fader, brand text) `aria-hidden` individually. Keep `role="img"` + `aria-label` on the
**container** only, as the group summary.

#### Mounting — stop destroying it
`devices.js:561` does `els.stage.innerHTML = view.svg` on every part switch, device switch and
breakpoint cross — tearing down the hero five times as you tab through parts, mid-playback,
discarding every `.lit` class. **Build the SVG once per device** and on part change update only the
`used` / `lit` classes and the display text. Re-render only when `deviceState.device` actually
changes, and cross-fade that (§7.3).

#### Restore velocity
`pitchedEvents` at `devices.js:113-115` maps only `start / dur / midi / role` and drops
`n.velocity`, which `compose.js` computes on every note and drum hit. Add it. That one property
feeds the pad decay peak, the lane ink density and the accent cap.

### 6.15 `.recipe` — the setup disclosure

- **Rest** `--raised` at 48%, `--r-well`, summary at `--fs-legend` uppercase `--tr-caps` reading
  `SET-UP`, with a single rotating `+` glyph on the right.
- **Open** the glyph rotates 45° to `✕` over 220ms `--e-detent`. The body animates open with
  `grid-template-rows: 0fr → 1fr` on a wrapper over 280ms, plus a 60ms-delayed opacity fade on the
  content so it does not appear inside a collapsed box.
- **Content change** when the part or device changes under an open disclosure, fade the steps out
  at 100ms and in at 160ms with a 6px `translateY`. Content changing silently under an open
  disclosure is the classic "did that just change?" failure.
- On toggle, `scrollIntoView({ block:'nearest' })`.
- Seed the HTML summary with the default device's real label so the first paint is never wrong.
- Replace **both** indicator conventions (`▸/▾` and `＋/−`) with the one rotating glyph.
- `.step-n` `--high`, `--r-pill`, 20px, `--fd-xs`.

### 6.16 `.sheet-host`, `.scrim`, `.sheet`

- `.scrim` **rest** `color-mix(in srgb, var(--room) 62%, transparent)` + `backdrop-filter:
  blur(8px)`.
  **In** opacity + blur `0 → 8px` over 280ms. **Out** 155ms `--e-close`. Currently it snaps from
  full blur to nothing in one frame, the most jarring possible dismissal.
- `.sheet` **rest** `--material` + `blur(30px) saturate(170%)`, `1px --edge` on the leading side,
  `--cast-3`, `width: min(448px, 100%)`.
  **In (desktop)** `translateX(24px)` + opacity, 320ms `--e-throw`.
  **Out** `translateX(24px)` + opacity, 180ms `--e-close`.
  **In (phone)** `translateY(100%)`, 260ms `cubic-bezier(.32,.72,0,1)`; **out** 145ms.
- **Drag to dismiss** the code at `ui.js:849/862` sets a transition that is currently a no-op, so
  releasing under the 90px threshold teleports to zero. Add
  `transition: transform 340ms var(--e-rubber)` to `.sheet` and `transition: opacity 300ms ease`
  to `.scrim` as the **resting** state; the existing `style.transition='none'` during drag then
  correctly suppresses it. Over threshold, animate out to `translateY(100%)` over 180ms rather than
  dropping it.
- **Focus** `.sheet:focus { outline:none }` is kept (the dialog itself is focused so AT announces
  the title), but `returnFocus` is only captured **when no sheet is already open**
  (`if (!openName) returnFocus = document.activeElement`), and `closeSheet` falls back to the
  button that owns the sheet when `returnFocus` is missing or `offsetParent` is null.
- **Suppressed chrome** add a `body.sheet-open` class. On phone the thumb bar currently stays fully
  lit and fully dead under the user's thumb. `body.sheet-open .thumb, body.sheet-open .rig {
  opacity:.38; filter:saturate(.4); transition: opacity 280ms var(--e-throw), filter 280ms }` and
  the return at 180ms `--e-close`.
- `.sheet-head` `--raised`, sticky, bottom `1px --edge`, `min-height:62px`. On phone the grabber
  above the title stays.
- `.sheet-body` `scrollbar-gutter: stable`, `gap: var(--sp-4)`, `padding: var(--sp-4)`; children
  keep `flex:none`.

### 6.17 `.field`, `.field-row`, `.field-top`, `.field-read`, `.field-note`

- `label` `--fs-meta`, `'wght' 500`, `--muted`. `.field-note` `--fs-meta`, `--label-tertiary`,
  `--lh-body`. `.field-read` `--fd-sm` in `--part-ink`.
- `.field` gap `--sp-2`; `.field-row` two equal columns, gap `--sp-3`.

### 6.18 `select`

- **Rest** `--inset`, `1px --edge-hot`, `--r-well`, `--bevel-in`, `min-height:46px`,
  `font-size:16px` (**do not lower it** — below 16px iOS zooms on focus and, with the body unable
  to scroll, there is no gesture left to get back). Chevron is an inline SVG data-URI whose stroke
  is `currentColor`-equivalent per theme — the current light override still hardcodes `%236b6b72`,
  a superseded `--muted`.
- **Hover** `--edge-hot` → `--alu-edge`.
- **Focus** `outline:none` is **deleted**. `select:focus-visible` gets `--focus-ring`.
- **Disabled** `opacity:.42`.

### 6.19 `input[type=range]` — tempo

- Target is the full 44px; the drawn track is 6px `--inset` with `--bevel-in`, `--r-pill`.
- Filled portion is **`--lamp`**, not `--part`. The tempo control has no relationship to which
  part is selected; per the README's own rule this is chrome. Same decision for the tempo readout
  and the saved-card border.
- Thumb: 26px `--alu` cap with `--bevel` and `--cast-1`, `--r-pill`.
- **Hover** thumb `scale(1.06)`. **Active** `scale(.98)` on `--e-rubber`.
- **Focus** `--focus-ring` on the thumb.

### 6.20 `.check` — the switch

- Track 51×31, `--r-pill`, `--inset`, `--bevel-in`. Knob 27px, `--alu`, `--cast-1`.
- **Checked** track becomes `--lamp` with `--bloom-lamp` at 40%; knob translates 20px.
- **Transition** `background-color 220ms var(--e-detent), border-color 220ms var(--e-detent)` on
  the track and `transform 280ms var(--e-rubber)` on the knob — a toggle is the single best place
  in this UI for a slight overshoot, and the spring currently authored at `styles.css:424-431` is
  **dead code**, overridden by the touch-sizing block at 606-616. Delete the duplicate transitions
  from the sizing block; that block exists to change dimensions, not easing.
- **Focus** `--focus-ring` on the track.

### 6.21 `.creation-hero` / `.eyebrow`
`.eyebrow` uses the legend register (`--fs-legend`, `--tr-caps`, `'wdth' 118`) in `--lamp-ink`.
The `.creation-hero h3` "Start with a sound" is **deleted** — a sheet titled *New song* does not
need a second heading telling the user to start, and one action should not have four names
(`New song` / `Create` / `Start with a sound` / `Generate song`). Pick one verb and use it in all
four places including the toast.

### 6.22 `.creation-details`
`--raised` at 42%, `1px --edge`, `--r-well`. Summary at `--fs-ui`, `'wght' 620`, 48px min-height,
with the same single rotating `+` glyph as `.recipe`. Body opens on `grid-template-rows: 0fr → 1fr`
over 280ms.

### 6.23 The sheet's identity
The song sheet is currently a live-preview form **and** a submit form: six of seven controls
already regenerate the song the instant you touch them — invisibly, behind the scrim — so the
primary CTA is redundant and produces a *different* song than the one just configured.
**Resolution: the fields are live; `#generateButton` is renamed and re-scoped to the one action the
fields cannot express** — a reroll of both seeds — and pinned in the sticky footer.

Every control must also **preserve transport state**: capture
`const wasPlaying = Engine.isPlaying()` before `stopPlayback()` and call `startPlayback(true)`
after `render()`. Today tempo silently restarts playback while every other control silently kills
it, six pixels apart.

### 6.24 `.sheet-row` — grouped, not banked
Nine identical ghost buttons become three labelled groups, each with a `.legend` heading:
- **REWRITE** — New melody · New chords. **Both must acknowledge**: toast, `announce()`, haptic.
  They currently fire behind the scrim with zero feedback of any kind and are indistinguishable
  from dead buttons. Better still, move them out of the sheet onto the stage beside the part chips,
  where the thing they change is visible.
- **EXPORT** — Save to library · Copy link · Copy as text · Download MIDI. Verb-first, all four.
- **Footer row** — Install · How it works, quiet, `--label-tertiary`.

### 6.25 `.saved` / `.lib-card` / `.lib-icon`
- `.lib-card` **rest** `--inset`, `1px --edge-hot`, `--r-cap`, `min-height:56px`,
  `padding: 8px 10px 8px 13px` — *keep this asymmetric optical correction and comment it.*
- `.is-current` border `--lamp` (chrome, not `--part`).
- **Hover** `--edge-hot` → `--alu-edge`, `translateY(-1px)`.
- **Delete** the armed state expands the icon button into a labelled pill (`min-width` transition,
  no reflow) with a **depleting hairline under the label** rendering the 3.2s window, and it uses
  `--rec` — not the counter hue. Better: delete immediately and toast `Deleted · Undo`.
- **Entrance** `Motion.stagger(cards, {step:30})` on sheet open.
- **Exit** the deleted card collapses (`height→0`, `opacity→0`, `translateX(-12px)`) over 200ms,
  then `Motion.flip()` moves the remainder into their new positions over 260ms. The empty state
  fades in rather than swapping.
- Wire **rename** — the capability exists in `library.js` and is connected to nothing.

### 6.26 `.map-wrap` / `.map` — the arrangement map
- **Sticky row-label gutter** *(all judges: take it regardless of direction)*:
  `.map-track { position: sticky; left: 0; background: var(--panel); }` plus a right-edge `--edge`
  rule, so `MELODY / CHORDS / BASS / DRUMS` cannot scroll away from the grid they label. Add a
  `mask-image` fade on `.map-wrap`'s right edge that clears at scroll end.
- **Semantics** the map is a table: `role="table"` on `.map`, `role="row"` wrappers,
  `role="rowheader"` on `.map-track`, `role="columnheader"` on `.map-head`, `role="cell"` with
  `aria-label="plays"` / `"out"` on `.map-cell`.
- `.map-cell` **on** = filled `--part`; **off** = hollow with `inset 0 0 0 1px --edge-hot`. A
  filled-vs-hollow read survives both low contrast and deuteranopia; hue alone does not (light
  fills are 1.36–2.21:1 against the cell background).
- `.map-head.is-auditioning` `background: var(--part)`, `color: var(--on-part)` —
  **never `--on-accent`**, which produced 1.41:1 white-on-yellow.
- `.map-energy` bars grow from `height:0` over 400ms `--e-throw`, staggered left-to-right at 25ms
  per section, **triggered on sheet open** so it does not replay on every regenerate.
- `.map-head` **hover** `--alu-edge`; **active** `translateY(.5px)`; **focus** `--focus-ring`.
  Its bare `transition:.15s` (= `transition:all`) is replaced with
  `background-color 180ms, color 180ms, box-shadow 180ms`.
- `.map-cell` and `.map-energy` become clickable too — they already carry `data-section`.

### 6.27 `.sections`
`<li>` becomes `<li><button class="section-step">` — currently a bare `<li>` with `cursor:pointer`
and no `tabindex`, entirely keyboard-inaccessible while carrying the descriptive prose.
`.is-auditioning .step-n` uses `--on-part`. `.drop-note.is-full` uses `--vfd`, not the chords hue.

**Behaviour honesty:** clicking a section labelled `bars 9–16` currently plays the whole loop from
bar one with a mute mask. Either seek to the section's bar offset and loop its length, or relabel
the interaction `Hear this mix` and auto-collapse the sheet to a peek height so the faceplate is
visible while it plays.

### 6.28 `.why`
`h3` at `--fs-ui` `'wght' 620`; `p` at `--fs-body`, `--lh-body`, `--muted`. Top rule `1px --edge`.

### 6.29 `.toast`
- **Rest** `--panel`, `1px --edge-hot`, `--r-pill`, `--cast-3`, `--ink`, `--fs-ui`.
- **In** opacity 200ms + `translate(-50%, 0) scale(1)` from `scale(.96) translateY(12px)`, 320ms
  `--e-throw`.
- **Out** 110ms `--e-close`, accelerating away — a spring settles, and an exit should not.
- **Replacement while visible** a 90ms out-and-back `scale(.97) → 1` on the pill as the text
  changes, so consecutive messages are each *seen* to arrive.

### 6.30 `.count-in`
Full spec in §7.6.
- **Rest** `--room` at 96%, `backdrop-filter: blur(20px)`.
- **In** 300ms (scrim opacity + blur `0 → 20px`; digit `scale(.82) → 1` in 90ms `--e-throw`).
- **Out** 165ms `--e-close`, digit expanding to `scale(3.4)` and fading as the transport takes over.
- `#countInBeat` changes from `aria-live="assertive"` to `aria-hidden="true"` — an assertive region
  firing up to three times a second interrupts and discards everything the screen reader was
  saying, including the "Playback started" announcement that follows. The single `announce()` at
  `ui.js:967` already covers the semantic event.
- **Escape cancels it.** A modal `aria-modal="true"` dialog that cannot be dismissed with Escape
  violates the pattern every other dialog in the app implements correctly. Also drop the `Cancel`
  relabel on the inert Play button — one cancel affordance, in the overlay.

### 6.31 `.onboarding`
- **Card** `--material`, `--r-panel`, `--cast-4`, `max-width:440px`.
- **In** scrim 240ms; card `translateY(24px) scale(.98) → rest`, 340ms `--e-throw`, **80ms behind
  the scrim**; then the page contents stagger (mark, h2, body, footer) at 45ms.
- **Out** 190ms `--e-close`.
- **Page change** outgoing `.is-leaving` with `translateX(calc(var(--dir) * -14px))` + opacity 0
  over 160ms; incoming starts at 80ms. **Axis switches to Y under the phone query**, where the card
  is a bottom sheet. Remove the dead `.is-on` class.
- `.onboarding-mark` becomes **the brand mark showing beat 1 / 2 / 3** — not a digit in a box,
  which is what a generic onboarding library ships. The motif is taught on first run and recognised
  for the rest of the session.
- `.onboarding-dots` become real tab stops, not `aria-hidden` decoration that looks tappable. Add a
  Back control.
- **Content fixes**: page 2 becomes the **actual device picker** (two large faceplate thumbnails,
  one tap, persisted) — the highest-value question in a two-device app currently has no moment.
  Page 3 ends at **Play**, and `finishOnboarding` focuses `#playButton`, not `#songButton`; the
  sheet stays closed. Fix the false claim that performance mode keeps the screen awake, or make it
  true (§6.32).
- **Gate on `localStorage` only, not on `firstRun`.** Anyone arriving via a shared link — the
  highest-value acquisition path in a no-account product — is currently never onboarded, ever.
- **Landscape**: widen the rescue query from `(max-width:699px)` to
  `(max-height:500px) and (max-width:1199px)` — the same band `.desk` already uses — and add
  `overflow-y:auto` with `align-items: safe center`. At 844×390 (every current iPhone in landscape)
  the card demands 446px in a 390px viewport with `overflow:visible`, so Continue is cut off and
  first run is a dead end.

### 6.32 `.performance-chrome` and performance mode
- **Cross-fade the two chrome bars**: both are already `position:fixed; top:0`. Fade `.bar` out
  over 160ms while `.performance-chrome` slides down from `translateY(-8px)` over 260ms.
- `.desk { transition: grid-template-rows 340ms var(--e-detent) }` so the regrid is a reflow you
  can follow.
- **Make the mode earn its name.** On entry: collapse the lane; give the rig 55–65% of the viewport
  instead of 27dvh; step `.seq-chip` up to `--fd-lg` with larger targets; raise the lit-pad bloom;
  keep prev/next visible on phone. **Hold the wake lock for the duration of the mode**, not just
  playback. **Read `PERFORMANCE_STORE` on boot and restore** — it is written at `ui.js:321` and read
  nowhere. Bind Escape to exit.
- Delete `body.is-performing .rig-stage { filter: saturate(1.08) }` and replace with
  `transition: filter 400ms` on a class that raises the *bloom*, not an outer filter wrapping
  twelve nested ones.

### 6.33 `.thumb` — the phone thumb bar
**The clipping blocker: at 374px, `#structureButton` lands at x376–450 with `overflow-x:visible`
and no scroll — the Structure sheet is literally unreachable the moment Undo appears.**

Restructure into two rows:
- **Row 1** the five part chips (already a 5-column grid).
- **Row 2** `Play` (`flex:1`) + Loop badge + a single overflow control.

Solo, Perform, Undo, New song and Structure move behind an explicit sheet-picker or a `…` menu.
Reserve space for conditional controls per §6.3 so the row geometry never changes under a thumb.
`--thumb-h` continues to be measured in `ui.js`; drop the doubled `var(--safe-b)` from the
landscape `.desk` padding, which the thumb has already paid.

### 6.34 Scrollbars
Four desktop scroll surfaces currently get a 17px OS scrollbar inside a carefully lit dark card;
suppression exists only under `body.has-thumb`, i.e. phones only.

```css
.stage-body,.run,.sheet-body,.map-wrap{
  scrollbar-width:thin; scrollbar-color:var(--edge-hot) transparent; scrollbar-gutter:stable;
}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--edge-hot);border-radius:var(--r-pill);border:1px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:var(--alu-edge)}
```

### 6.35 Focus, skip link and headings
- One `--focus-ring` token, five rules, radius matched per shape.
- Add `<h1 class="sr-only">Downbeat</h1>` as the first child of `<body>`; promote `#songTitle` to
  `<h2>`.
- Add a skip control immediately before `#run`:
  `<a class="skip" href="#recipe">Skip the run of pads</a>`, `.sr-only` until `:focus`. A keyboard
  user currently tabs past 60+ chip buttons to reach the setup instructions, on every part switch.
- `aria-keyshortcuts` on the part buttons (`"1"`…`"5"`) and `"G"` on the generate control.
- Single-character shortcuts must not fire through modals: add
  `if (openName || !$('#onboarding').hidden || countingIn) return;` after the Escape branches, and
  `if (event.repeat) return;` at the top of the keydown handler. Gate the bare-letter shortcuts
  behind a persisted preference (WCAG 2.1.4).
- **Escape stack**, in priority order: count-in → performance → audition → sheet → onboarding.

### 6.36 The icon sprite
The entire icon language is raw Unicode punctuation (`▶ ☾ ✕ ‹ › ⌃ ▸ ▾ ＋ − ●`), rendered in
whatever fallback font the platform supplies — `☾` and `☼` render as colour emoji on some Android
builds and `＋` is a CJK fullwidth character sitting next to a Unicode minus. Ship a single inline
`<svg><symbol>` block at the top of `<body>`: play, stop, moon, sun, close, chevron
left/right/up/down, share, plus, minus, check. All on a 24px grid, `fill: currentColor`, consistent
optical weight, referenced with `<use>`. One hour of work, removes the largest single source of
cross-platform ugliness.

### 6.37 Empty states
Four different apologies in four voices become one register. Each is: **the brand mark at
`--fs-readout` in `--edge` (15% opacity), centred; the reason in Archivo `--fs-title`; the fix
below it as a real button.** Entrance opacity + 6px rise, 240ms `--e-throw`.

> **NO SECOND LINE**
> A countermelody moves when the tune rests and leans against it when the tune moves.
> [ Switch it on in New song ]

The button opens the sheet with the counter toggle focused. Collapse `ui.js:439/441/442` and
`ui.js:516/517` into one helper so the aria description and the visible text cannot drift apart.

### 6.38 Offline
No yellow dot borrowed from the bass hue. `body.is-offline` → the transport slot loses its amber
segments and falls to a single flat `--edge` hairline, the mark stops counting, and a `--edge-hot`
ring appears around the mark. State by absence (§7.9).

### 6.39 Error states
There is currently no error state anywhere, and a corrupt share link silently produces an unrelated
random song the user believes is the shared one.
- Wrap the boot sequence in `try/catch` and render a real state in the stage: the mark, *"Something
  went wrong writing that song"*, and a **Try again** button that reseeds.
- When `fromHash()` returns a hash that exists but fails to decode: *"That link looks incomplete"*
  plus an offer to generate a fresh sketch — never silently substitute.
- `Library.save` returning `{stored:false}` and MIDI export failure both state the cause and a next
  step in one clause. Voice rule: **fact + recourse, same breath.** `Clipboard blocked — the link is
  in the address bar.`

### 6.40 Shared-link landing
Replace the 1.9s vanishing toast with a persistent inline banner in the stage: *"Someone shared this
sketch with you"* + a single **Play** CTA + **Make your own**, dismissing on first interaction
rather than on a timer.

---

## 7. The signature moments

### 7.1 POWER-ON — the boot sequence
There is currently no first-paint state at all: the bar shows an em-dash, the rig and stage are
empty divs, and everything materialises in one synchronous blocking burst at script-parse time.

Everything is authored at rest behind `body:not(.is-live)`: panels at `opacity:0;
translateY(6px); scaleY(.985)`, legends at `opacity:0`, the faceplate at `opacity:0` with its
display rect forced to `--ep-lcd`. The initial `generate()` moves behind a
`requestAnimationFrame` so the powered-off panel actually paints first.

On `.is-live`, in order:
1. Each panel's bevel strokes in via `clip-path: inset(0 100% 0 0) → inset(0)` over 260ms
   `--e-throw`, left to right, **rig leading stage by 60ms**.
2. The faceplate fades `0 → 1` over 220ms — **first and fastest**, because the hardware should
   already be there when the chrome arrives.
3. The LCD does a real cold-cathode strike:
   `@keyframes lcd-strike { 0%{opacity:0} 8%{opacity:.35} 12%{opacity:.08} 20%{opacity:1}
   26%{opacity:.72} 100%{opacity:1} }` over 340ms, with the segment bloom's flood-opacity fading
   `0 → .55` behind it.
4. Legends stagger in at `calc(var(--enter-i) * 45ms)`.
5. **The Play lamp strikes last** — `box-shadow: 0 → var(--bloom-lamp)` over 180ms. That is the
   moment the app becomes usable, and it should look like it.

Total ~640ms — long enough to cover the synchronous `compose()` work that currently blocks first
paint. Reduced motion collapses the whole thing to a 120ms opacity fade with the LCD already on.

### 7.2 THE LAMP STRIKE — the app's core delight
Pads are not highlighted, they are **struck**.

`Devices.update` writes `el.style.setProperty('--lit', hit.velocity.toFixed(2))` — velocity is
already computed by `compose.js` and is currently thrown away at `devices.js:113`. Ghost notes land
at 0.35, accents at 1.0.

- **Attack** a `[data-struck]` attribute sets `transition-duration: var(--t-lamp)` (40ms).
- **Decay** `transition: --lit var(--t-decay) var(--e-decay)` — **beat-relative**, so at 76 BPM the
  pads smear like a long-persistence scope and at 158 BPM they machine-gun.

Three things read `--lit` simultaneously: the cap fill
(`color-mix(in oklab, var(--part) calc(var(--lit) * 100%), var(--ep-cap))`), the `#pad-lit` radial
hot-core gradient (bright centre, coloured edge — how light actually falls on a translucent cap),
and the shared group bloom. Plus the pad physically depresses
`translateY(calc(var(--lit) * .8px))`.

Same treatment, same tokens, on the FM-1 white and black keys — which today have **three different
timings across four key types, two of them zero**, so a chord voicing lights unevenly.

### 7.3 THE PART DETENT — the app's main gesture
Switching part is a rotary switch clicking over.

1. `--part` and `--part-ink` are registered, so `#desk { transition: --part 220ms var(--e-detent) }`
   cross-fades the entire right-hand side for free.
2. The `.parts` housing recoils 1.5px in the direction of travel over 90ms `--e-travel` and
   returns — the switch body kicks. `navigator.vibrate(8)`.
3. The colour propagates outward on delays: chip `0`, lane `1×--hop`, run `2×--hop`, faceplate
   used-map `3×--hop`, then per-pad `14ms × index` in reading order. You watch the tint travel from
   the button you pressed to the hardware.
4. The faceplate **stays mounted** — only `used`/`lit` classes and the display text change — so lit
   pads survive a mid-playback part change and there is no unstyled frame.

Device switch is the one case that does replace the SVG: mount the new one on top at `opacity:0`,
cross-fade over 260ms while the old goes to `opacity:0; scale(.992)` over 130ms, remove on
`transitionend`.

*Theme change uses the same choreography (rig 0 / stage 1 hop / bar 2 hops) via a temporary
`body.theme-shifting` class carrying `transition: background-color 320ms, color 320ms,
border-color 320ms`, added in `applyTheme` and removed on `transitionend` — scoped and temporary so
it costs nothing during normal interaction.*

### 7.4 THE MARK COUNTS THE BAR
*(Merged graft: ANODISE's barline + PHOSPHOR's metronome. All three judges instructed this merge.)*

The four strokes of the wordmark light in sequence, one per beat, during playback — so the logo in
the corner of the screen is counting the bar with you.

**Implementation is CSS, not a per-frame bus:**
```css
.mark{ animation: mark-count calc(var(--beat-ms) * 4 * 1ms) steps(4,jump-none) infinite; }
body:not(.is-live) .mark{ animation-play-state: paused; }
```
`Motion.tempo(bpm)` writes `--beat-ms` once per song. On playback start (and once per loop),
`ui.js` writes `animation-delay` from the audio clock to resync. **No `:root` writes per frame, no
idle breathing** — the mark is still when the app is still.

Each stroke uses `--lit` and the phosphor decay, so a beat does not blink, it strikes and fades.

### 7.5 THE LCD READS BACK
Hovering a run chip already lights the corresponding pad (`devices.js:612`) — a genuinely
delightful, product-specific idea that is currently sold with **zero** visual emphasis, and the
plumbing for the display readout (`flash(ids, names)` at `devices.js:600`) exists and is wired only
to chips.

Make the chain felt: hover a chip → the chip lifts 2px with a `--part` hairline → the pad blooms at
`--lit: .55` (a preview, deliberately not the 1.0 of a real strike) → **the object's own screen
prints the note name.** Chip, pad and display move as one object. Extend the same chain to hovering
a pad directly, which today changes nothing at all despite `cursor:pointer`.

This is the app's most product-specific piece of delight and it cannot be copied from a comic site.

### 7.6 COUNT-IN
A full-screen surface that today appears and vanishes in one frame each way — at the exact moment
the user is preparing to play.

The room dims to `--room` at 96% over 300ms with `backdrop-filter` `0 → 20px`. The beat number
renders at `--fs-readout` in Martian Mono `'wght' 800 'wdth' 112`, in `--lamp`, over a
full-viewport instance of the `lcd-grid` dot pattern at 6% opacity, with `--bloom-lamp` behind it.
Each digit runs the `lcd-strike` keyframe on arrival and exits over 90ms at `scale(1.06)` with a
fade as the next strikes. A 2px `--lamp` scanline sweeps top → bottom over exactly one beat.

**The clicks are rescheduled onto the audio clock.** Absolute `AudioContext` times computed up
front, visuals driven from a rAF reading `currentTime`, handing off to `beginPlayback` at the
scheduled downbeat. The count-in is currently chained `setTimeout` — the **only** timing path in
the app that is not on the audio clock, in the one moment a hardware-performance tool cannot afford
drift.

On the final beat the numeral scales to 1.14 and the overlay clears in 165ms `--e-close` as the
transport takes over: the count-in *hands off* to playback rather than being deleted.

### 7.7 GENERATE
The app's name is a verb about starting something, its headline feature is "Downbeat writes you a
progression", and pressing G currently produces **no motion whatsoever**.

1. The song title **slot-cuts** (§5.6) — 240ms, 40ms per word.
2. A `--part`-coloured band **sweeps** left to right across the lane over 240ms `--e-throw`,
   transform-only, like a tape head passing.
3. Behind it the new `.seq-chip`s stagger in at 16ms, capped at 12.
4. The spec plate slot-cuts to the new key / BPM / bar count.

**Reroll is distinguished from regenerate**: New melody sweeps only the lane and the run; New chords
sweeps only the chord card and the faceplate map. That is the entire point of having two buttons and
it is currently invisible.

### 7.8 THE ENGRAVED PANEL
The identity payload, and the app's answer to the reference's spinning vinyl — except this one
does work.

Every region carries its legend on the metal (§3.5). Bottom-right of the rig sits the asset tag at
16% ink: `DOWNBEAT · EP-133 K.O. II · C MIN · 96 BPM · 8 BAR`. It is the only number on screen
nobody needs, and it is the thing that makes a screenshot look like a photograph of equipment
rather than a layout. Combined with the four-stroke mark, it means Downbeat is identifiable in a
200px thumbnail — which is the bar, and which the current build fails outright.

### 7.9 THE ROOM GOES STILL
*(Graft: PHOSPHOR.)* When the app loses the network the mark stops counting, the transport slot
loses its amber, and a single `--edge-hot` ring appears around the mark. That is it. No colour, no
badge, no borrowed hue.

It is unmissable to anyone who has been using the app for ten seconds, it costs one class and one
variable, and it is the clearest demonstration that in this system **state is carried by the
system's own behaviour** rather than by decoration on top of it.

### 7.10 EVERY DISMISSAL IS AUTHORED
Seven surfaces currently vanish via `display:none`. Each gets an exit at 55% of its arrival
through one `Motion.hideWith()` helper (§5.3). Nothing in Downbeat cuts to black again — and this
alone closes the largest single gap against the reference.

---

## 8. File architecture

No build step. Plain `<link>` and `<script src>`. Twelve stylesheets, two new JS modules.

### 8.1 The cascade

`@layer` is declared **once**, at the top of `css/tokens.css`, so the cascade is explicit and a
link-order accident cannot break it:

```css
@layer tokens, base, layout, components, motion, responsive, a11y;
```

Every rule in every file is inside its layer block. A rule outside a layer beats all layers, which
is a review rejection unless it is deliberate and commented.

### 8.2 The stylesheets

| File | Layer | Contents |
|---|---|---|
| `css/tokens.css` | `tokens` | The `@layer` declaration, all `@property` registrations, `:root` structure (shell, gutters, safe areas, tap, spacing, radii, durations, easings), `body` and `body.light` colour blocks, hardware palettes. **One base declaration per token per theme — there is exactly one `body{}` and one `body.light{}` in the codebase.** |
| `css/base.css` | `base` | `@font-face`, reset, `body` typography defaults, `.mono`, `.legend`, `.plate`, `.sr-only`, `.skip`, `::selection`, focus ring, scrollbars, the SVG sprite's `<symbol>` styling. |
| `css/layout.css` | `layout` | `.desk`, `.rig`, `.rig-stage`, `.stage`, `.stage-body`, `.bar` frame, `.thumb` frame, shell and safe-area maths, legend placement. |
| `css/controls.css` | `components` | `.play`, transport slot, `.pill`, `.icon`, theme rocker, `.go`, `.ghost`, `.part`, `.device`, `select`, `range`, `.check`, `.field*`, `.is-capped`. |
| `css/lane.css` | `components` | `.lane-wrap`, `.lane-bars`, `.lane`, `.tl-note`, role ramp, drum grid, `.lane-toggle`, `.lane-head`. |
| `css/run.css` | `components` | `.run` grid, `.seq-chip`, `.seq-chord`, `.seq-rest`, `.seq-bar`, `.seq-empty`, `.now`. |
| `css/faceplate.css` | `components` | `.dev-*`, EP/FM palettes, material rules, lit/used/hover/focus, LCD. |
| `css/sheets.css` | `components` | `.sheet-host`, `.scrim`, `.sheet*`, `.creation-*`, `.saved`/`.lib-*`, `.map*`, `.sections`, `.why`, `.recipe`. |
| `css/overlays.css` | `components` | `.toast`, `.count-in`, `.onboarding*`, `.performance-chrome`, empty states, error states, offline. |
| `css/motion.css` | `motion` | All `@keyframes`, `.is-leaving` exits, `--enter-i` staging, `body:not(.is-live)` rest states, choreography delays. |
| `css/responsive.css` | `responsive` | Every media query, including the new `min-width:1600px` band and the corrected landscape guards. |
| `css/a11y.css` | `a11y` | `prefers-reduced-motion` (curated, §5.8), `prefers-contrast: more` (must target `body, body.light` — it is currently a **no-op in light theme**), `prefers-reduced-transparency` (must include `.sheet` and `.onboarding-card`, which it currently misses), `forced-colors`. |

`index.html` links them in exactly that order.

### 8.3 New JS modules

#### `src/motion.js` — ~140 lines, zero-dep, loaded **before** `ui.js`
Nothing involving sequencing is fixable until this exists. There is currently no stagger, no FLIP,
no `@property` registration, no JS reduced-motion query and no exit helper anywhere in the repo.

```js
Motion.reduced()                        // live matchMedia read, re-checked per call
Motion.tempo(bpm)                       // writes --beat-ms on documentElement, once per song
Motion.stagger(nodes, {step:16,max:12,cls:'is-entering'})  // writes --enter-i per node
Motion.flip(nodes, mutateFn)            // rect / mutate / invert / play
Motion.hideWith(el, 'is-leaving', ms)   // the single two-phase exit path, all 7 surfaces
Motion.swap(oldEl, newEl, {in:260,out:130})  // faceplate + chrome cross-fades
Motion.slot(el, text)                   // the slot-cut text transition
Motion.EASE                             // map mirrored byte-for-byte into CSS custom properties
```

`Motion.EASE` and the CSS easing tokens must be generated from the same literal list so JS and CSS
can never disagree.

#### `src/mark.js` — the brand mark, single source
Exports the SVG string and a `Mark.render(target, {size, live})`. Consumed by the inline favicon,
`tools/make-icons.js`, the header lockup, the three onboarding marks, the empty states and the
error state. Today the favicon geometry is hand-transcribed into a data URI at `index.html:21` and
can silently drift from the generated PNGs.

#### Script order in `index.html`
```
theory · genres · compose · audio · midi · mark · motion · devices · arrange · library · ui
```

### 8.4 `sw.js`

```js
const CACHE = 'downbeat-shell-v3';
```
`SHELL` gains: the twelve `./css/*.css` paths, `./src/mark.js`, `./src/motion.js`,
`./fonts/Archivo[wdth,wght].woff2`, `./fonts/MartianMono[wdth,wght].woff2`.
`sw.js:40` short-circuits cross-origin requests, so **anything not in this array and not
same-origin simply does not exist offline** — and the installed PWA is the app's primary form.

### 8.5 Other files

- `manifest.webmanifest` and both `theme-color` metas take the exact `--room` hexes (`#070806` /
  `#D6D2C7`). Three different near-blacks currently produce a visible seam on launch.
- `tools/make-icons.js` reads the mark from `src/mark.js`.
- `docs/DESIGN.md` — this file. It is the contract; update it before diverging.

---

## 9. The AAA bar

The checklist a reviewer uses to **reject** work. Any single failure is a rejection.

### 9.1 Tokens and colour
- [ ] No raw hex outside `css/tokens.css` and the faceplate palettes. No `#fff`, no `#000`, anywhere.
- [ ] No use of a deleted token (`--accent`, `--on-accent`, `--line`, `--separator`, `--fill*`,
      `--wash-*`, `--surface-*`, `--lift-*`, `--on-warm`).
- [ ] Every `color:` that uses a track hue points at an `-ink` variant. Every `background`/`fill`
      points at the fill variant. No exceptions.
- [ ] `--part` and `--part-ink` are always set together.
- [ ] No track hue appears in chrome. No chrome colour appears in the lane, the run, the map or the
      faceplate's data layer.
- [ ] Every capped (binary-ON) control sits inside an `--inset` housing.
- [ ] Light theme: every pigment block carries its `--on-part` ring.
- [ ] Every colour-carried state has a second, non-colour cue.
- [ ] Text ≥ 4.5:1 on the surface it actually sits on (not the surface you assumed). Non-text
      graphics and load-bearing boundaries ≥ 3:1. **Re-measure after any palette change** — the
      last regression happened because a later pass changed the ink without re-checking.

### 9.2 Type
- [ ] Every `font-size` is a scale token. No half-pixels, no fourth value inside a 3px band.
- [ ] Every `font-weight` is one of the five rungs, expressed via `font-variation-settings`.
- [ ] Every `letter-spacing` is one of the five tracking tokens.
- [ ] `line-height` is inherited from `body` unless the role demands `--lh-data`, `--lh-tight` or
      `--lh-heading`.
- [ ] Musical data is in `--mono`. Language is in `--sans`. No drift either way.
- [ ] Every region has its legend. The spec plate is present and current.
- [ ] Both woff2 are preloaded, both are in the SW shell, `CACHE` is `v3`.

### 9.3 Space, shape, elevation
- [ ] Every spacing value is a `--sp-*` token, or is an optical correction with a comment naming
      the decision.
- [ ] Every `border-radius` is one of the five role tokens. Nesting rule holds where concentric.
- [ ] Every shadow is a `--cast-*`, `--bevel*` or `--bloom-*` token. No ad-hoc `rgba(0,0,0,…)`.
- [ ] One light source. One bevel recipe. Nothing over 1px. Max two gradient stops. No texture, no
      gloss, no `text-shadow` on UI text, no screwheads. (§4.6 — all nine.)
- [ ] Every control clears 44×44. Measure it; do not assume it.

### 9.4 Motion
- [ ] No bare `transition: <time>` shorthand anywhere — it resolves to `transition: all`. Every
      transition names its properties and its easing. (Four exist today: `styles.css:219, 439, 455,
      464`.)
- [ ] Every duration is a token. Every easing is one of the six named curves.
- [ ] Every surface that appears has an exit at ~55% of its entrance, routed through
      `Motion.hideWith`.
- [ ] Nothing animates `width`, `height`, `left`, `top`, `margin` or `box-shadow` during playback.
      Transform, opacity, filter and registered custom properties only.
- [ ] `will-change` is added by a class and removed on stop. Never left on.
- [ ] No `setTimeout` chain is used for sequencing. `--enter-i` + `transition-delay`, or
      `Motion.stagger`.
- [ ] Stagger is capped at 16ms × 12.
- [ ] `--beat-ms` is written once per song. Nothing writes to `:root` per frame.
- [ ] Reduced motion: no wildcard. Colour and border transitions survive at full duration;
      transforms and keyframes do not; `animation-iteration-count: 1 !important` is present; both
      JS smooth scrolls are gated on `Motion.reduced()`.
- [ ] Profiled on a mid-range Android with a 192-step drum lane mounted, in performance mode,
      during playback. No dropped frames. This is a music tool; a stuttering playhead is a
      correctness bug.

### 9.5 States
- [ ] Every interactive element has rest, hover, active, focus-visible and disabled designed.
      Hover is inside `@media (hover:hover) and (pointer:fine)`.
- [ ] Every list has an empty state, and every empty state names the fix and offers the button.
- [ ] Every failure path has a designed surface stating fact + recourse in one clause.
- [ ] Loading and boot are authored, not tolerated. Nothing is at rest on first paint.
- [ ] No feature is `display:none` at a breakpoint as a substitute for designing it.
- [ ] Conditional controls reserve their space; no row reflows under a thumb.

### 9.6 Accessibility
- [ ] Every click target has a keyboard path. Faceplate pads, lane notes (removed), drum rows and
      arrangement steps included.
- [ ] Nothing interactive is `aria-hidden`.
- [ ] Unavailable controls use `aria-disabled`, stay focusable, and explain themselves on
      activation.
- [ ] One focus-ring token, visible on every surface it can land on, radius matched.
- [ ] Escape follows the stack. Shortcuts do not fire through modals or on key repeat.
- [ ] `prefers-contrast: more` targets both themes and touches `--muted`, `--edge`, `--edge-hot`
      and `--label-tertiary`.
- [ ] `prefers-reduced-transparency` covers `.sheet` and `.onboarding-card`, not just the chrome.
- [ ] Live regions: polite, debounced, never assertive for a metronome.
- [ ] `<h1>` exists. Skip link exists. Landmarks are labelled.
- [ ] Focus survives the phone/desktop control move and the sheet swap.

### 9.7 Responsive
- [ ] Designed at 374, 390, 430, 768, 844×390 landscape, 1024, 1280, 1600, 2560. Not reflowed —
      designed.
- [ ] Nothing clips at 374px. Every control is reachable at every width.
- [ ] Landscape phone is treated as a short screen, not a small tablet.
- [ ] Safe-area insets are paid exactly once per edge.
- [ ] The ≥1600px band exists and steps the type scale, the gutter and the lane target.

### 9.8 The reference test
- [ ] Downbeat is identifiable in a 200px static thumbnail.
- [ ] A hostile reviewer holding this next to ponpon-mania cannot say *"the reference is obviously
      more considered."*
- [ ] Nothing is default: no default focus ring, no default button, no default scrollbar, no
      default `<details>` marker, no `#fff`, no `100vh`, no `transition: all`, no system font.

---

## Appendix A — verified facts and corrections

Verified against source before writing. Build against these, not against memory.

| Claim | Status |
|---|---|
| "Four instances of `transition: all`" | **Partly true, worth stating precisely.** The literal string does not appear. Four bare `transition:.15s` shorthands do — `styles.css:219, 439, 455, 464` — and a `transition` shorthand with no property defaults `transition-property: all`. So the behaviour is real, the grep is not. Fix all four. |
| Velocity is computed and then discarded | **Confirmed.** `compose.js:398, 427, 926, 999, 1104, 1241` compute it; `devices.js:113-115` (`pitchedEvents`) maps only `start / dur / midi / role`. One property restores it. |
| The drum lane already renders velocity, the pitched lanes do not | **Confirmed** — `styles.css:317` vs `styles.css:288-292`. |
| Playhead animates layout properties | **Confirmed.** `styles.css:279` (`left:calc`), `styles.css:190` (`width` + `transition:width .1s linear`), driven from `ui.js:1027, 1031`. |
| The faceplate is `innerHTML`-destroyed on every mount | **Confirmed** — `devices.js:561`. |
| Zero `@property` registrations exist | **Confirmed.** |
| Zero `<defs>`, gradients, filters, patterns or clipPaths in the SVG | **Confirmed** — `devices.js` `epSvg` / `fmSvg`. |
| The count-in is chained `setTimeout` | **Confirmed** — `ui.js` count-in path; the only timing path not on the audio clock. |
| The reduced-motion wildcard | **Confirmed** — `styles.css:1211-1215`. |
| `sw.js` is on `v2`, has no fonts, and short-circuits cross-origin | **Confirmed** — `sw.js:3, 4-22, 40`. Self-hosted woff2 is mandatory, not preference. |
| No media query above 1199px | **Confirmed.** |
| `PERFORMANCE_STORE` is written and never read | **Confirmed** — `ui.js:321`. |
| The chip-hover → pad-light link exists and is unsold | **Confirmed** — `devices.js:612`, with `flash(ids, names)` at `devices.js:600` already able to drive the display. |
| The `.check` spring is dead code | **Confirmed** — `styles.css:424-431` is overridden by the touch-sizing block at `606-616`. |
| Colour tokens must live on `body`, not `:root` | **Confirmed and load-bearing** — the comment at `styles.css:43` is correct. Keep the placement, keep the comment. |

---

## Appendix B — build order

These are on the critical path and are **not** direction-specific. Sequence them first; nothing in
§5, §6 or §7 can be built safely until they land.

1. **Collapse the two token systems.** Delete `styles.css:49-70` and `658-675` (dead — they never
   render), fold the surviving values into one `body{}` and one `body.light{}`, and flatten the
   ~40 duplicate component rules in the `683-919` "product visual system" section back onto their
   originals. The file should lose 15–20% of its lines. Nothing else can be changed with confidence
   until there is one place to read the palette.
2. **Split into the twelve `@layer` modules** (§8.2) and update `index.html` and `sw.js`.
3. **Install the two woff2**, wire `@font-face`, preloads and metric-matched fallbacks; bump
   `CACHE` to `v3`.
4. **Ship `src/motion.js` and `src/mark.js`.** Register the six `@property` declarations.
5. **Fix the three performance/correctness paths**: `#barProgress` → `scaleX`, `.lane-head` →
   `translate`, delete the 100ms progress transition; cache the per-frame `querySelector`s.
6. **Fix the three alignment failures**: the `--lane-gutter` origin (drum playhead is 80px off the
   grid it annotates), the pitched bar-tick offset, and the faceplate coordinate grid. Optical
   correction is meaningless until mathematical alignment is right.
7. **Delete the reduced-motion wildcard** and replace it with the curated block, before any
   entrance is authored — otherwise every entrance added afterwards is silently neutered.
8. **Stop `innerHTML`-ing the faceplate**; mutate classes instead.
9. **Restore velocity** in `pitchedEvents`.
10. Only then fan out on §6 and §7.

Two items are explicitly allowed to be deferred without blocking review: the `AnalyserNode` VU
behaviour on the transport slot (§6.2), and the arrangement-map seek-versus-mute decision (§6.27) —
both are scoped, both are additive, and neither is load-bearing for the direction.

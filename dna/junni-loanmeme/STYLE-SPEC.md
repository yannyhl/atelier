# Style spec: JUNNI / loanmeme

Revision 1, 2026-09-22.
Status: Accepted as the house default for atelier (derived from the reference; adapt per brand).
Implementation: `packages/stage/src/dom/tokens.css` and `packages/stage/src/motion/Easings.ts` (`HouseCurves`).

## Mood

Playful toy-like 3D in a cinematic frame.
Soft ice and lime daylight for arrivals, deep black stages for glass and neon, a rainbow payoff at the end.
Every section is a set with its own camera, light and post look, and the camera travels between sets.

## Color

| Token | Value | Use |
|---|---|---|
| `--at-black` | `#000` | stage background, loader |
| `--at-white` | `#fff` | primary text, UI strokes |
| `--at-dim` | `#777` | copyright and quiet metadata |
| `--at-mute` | `#555` | inactive timeline dots |
| `--at-frost` | `#d6edfa` | brightest sky, highlights |
| `--at-ice` | `#8fc9e8` | sky body |
| `--at-ice-deep` | `#66add6` | sky contrast end |
| `--at-lime` | `#b7f516` | CTA face, accents |
| `--at-lime-rim` | `#dbff77` | CTA inset highlight |
| `--at-lime-shade` | `#79ca1c` | CTA inner shade |
| `--at-lime-drop` / `-deep` | `#168d52` / `#064d2b` | CTA stacked drop shadows |
| `--at-lime-ink` | `#073b21` | CTA text |
| `--at-slate` | `#35566b` | text and UI on the light intro sky |
| Rainbow | HSV sweep, s 0.75, v 1 | trail, CTA word, iridescent rims |

## Typography

| Role | Face | Setting |
|---|---|---|
| Display | rounded geometric (Comfortaa 700) | lowercase for wordmarks, uppercase with 0.3em tracking for statements |
| UI and body | techno sans (Jura 500) | small (11 to 16 px), 0.2em tracking |
| Accent | italic serif (Roboto Serif, optional) | CTAs and pull quotes |
| CJK | Noto Sans JP | vertical-rl columns for manifestos |

Heavy letter-spacing is part of the identity: 0.2em minimum on UI, up to 0.4em on statements.
Sizes scale with viewport width (`clamp()` in atelier; the reference used raw `vw`).

## Motion

| Token | Value | Use |
|---|---|---|
| Default ease (JS) | `sigmoid(6)`, 1 s | animator values, section visibility |
| `--at-ease-enter` | `cubic-bezier(0, 1.33, 0.37, 0.99)`, 0.7 s | overshooting entrances (ring button, chips) |
| `--at-ease-exit` | `cubic-bezier(0.74, -0.02, 0.94, -0.32)`, 0.5 s | anticipating exits |
| `--at-ease-pop` | `cubic-bezier(0.4, 1.44, 0.74, 1)`, 0.5 s | small pops |
| Glyph stagger | 70 ms (3D), 60 ms (DOM) | per-character reveals |
| Chrome fade | 2 s | footer and timeline appearance |
| Section move | 1 s `easeInOutCubic` (button), 2 s (timeline jump) | programmatic scroll |
| Prop pop-in | `easeOutBack` staggered 0.15 s | matcap props |

Rules:
1. Everything that appears also leaves: exits animate to state 2, they never just vanish.
2. Nothing moves on wall-clock time; all motion reads the stage clock.
3. Camera parallax follows the cursor on a spring with a per-section range; phones get none.
4. Reduced motion removes inertia, shake and parallax and shortens section moves to 0.35 s.

## Post

| Parameter | Arrival (light) | Glass (dark) | Finale |
|---|---|---|---|
| Bloom | 0.25 | 0.35 | 1.6 |
| Vignette | 0.7 | 1.4 | 1.0 |
| Grain | 0.03 | 0.04 | 0.05 |
| Threshold | 0.85 | 0.5 | 0.5 |

Light sets need the higher threshold: in linear space a correctly bright sky exceeds 0.5 and the whole frame blooms, lifting every dark detail (measured on the 001 arrival set).
A section's post look is complete: `PostFX.apply` returns every parameter the section does not set to its default (threshold 0.5), so no set inherits the previous one.

## Chrome

- Circular "SCROLL" button: 100 px (72 px under 800 px), rotating gradient ring (2 s linear), cursor-following fill that scales to 2 on hover.
- Timeline dots: one per section, 20 px hit area, dot scale 0.3 idle, 0.6 current.
- Footer: 60 px (50 px under 800 px), 6% side gutters, uppercase copyright in `--at-dim`.
- Loader: black screen, wordmark breathing at 1.6 s, fades out in 0.5 s.
- CTA: lime 3D key with two stacked drop shadows, lifts 2 px on hover, presses 4 px on active.

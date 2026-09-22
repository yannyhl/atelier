# Type scale and tracking

Sources: `dna/junni-loanmeme/STYLE-SPEC.md` (approved tokens), the starter's `src/style.css` (atelier values), and the loanmeme.io stylesheet (reference measurements, not redistributed).
Reference sizes were raw `vw`; atelier replaces them with `clamp()` so type stops scaling at the extremes.
One breakpoint at 800 px, for chrome only.
The display wordmark, statement headline, lede, footer and loader sizes are the starter's; the other `clamp()` values are suggested conversions of the reference `vw` sizes, so check them in captures before relying on them.

## Families

| Role | Face (atelier) | Reference face | Weight | Case |
|---|---|---|---|---|
| Display | Comfortaa | Comfortaa | 700 | lowercase wordmarks; uppercase statements |
| UI and body | Jura | Jura, Roboto, Noto Sans JP | 500 | sentence case; uppercase for labels |
| Accent (optional) | Roboto Serif | Roboto Serif | 200 to 400 | sentence case, CTAs and pull quotes |
| CJK | Noto Sans JP (subset) | Noto Sans JP | 400 to 500 | vertical-rl manifestos, subtitles |

Keep to two families on a page, three with the accent serif.

## Scale

| Role | atelier size | Reference size | Tracking | Line height | Notes |
|---|---|---|---|---|---|
| 3D title (BitmapText) | atlas `700 96px` in 128 px tiles, `size` 1.15, fit to 84% of view width | 8 x 8 hand-painted atlas | `setText` 0.08 em | - | Drawn in WebGL; DOM twin visually hidden. |
| Display wordmark (DOM) | `clamp(2.5rem, 9vw, 7rem)` | - | 0.04em | 1 | Static-mode title, lowercase. |
| Statement / CTA headline | `clamp(1.6rem, 4.5vw, 3.2rem)` | 2.5vw (7vw under 800 px), serif | 0.3em (`--at-track-wide`) | 1.2 | Uppercase in atelier; the reference used the serif accent. |
| Statement message | `clamp(0.9rem, 1.5vw, 1.4rem)` | 1.5vw (3.5vw under 800 px), Jura | 0.4em | 1.8 | Centered, 80% width. |
| Secondary language line | `clamp(0.7rem, 1vw, 0.9rem)` | 1vw, 60% white | 1.3vw in the reference; use 0.6em | 1.8 | Under the statement. |
| Lede / body | `clamp(0.8rem, 1.2vw, 1rem)` | - | 0.2em (`--at-track-ui`) | 1.8 | Reveal lines. |
| Accent link | `clamp(1rem, 2vw, 1.6rem)` | 2vw (4.7vw), weight 200 | normal | 1.4 | Serif. |
| CTA button | 16px | 16px Comfortaa 700 | 0.2em | 1 | Lime 3D key, uppercase. |
| Intro caption | 20px | 20px Comfortaa | normal | 1.5 | Loader-adjacent intro copy. |
| Subtitles | `min(15px, 2vw)`, 2.8vw under 800 px | same | normal | 2 | On a 90% black box, `box-decoration-break: clone`, 5 px 10 px padding. |
| CJK manifesto | 17px, 16px under 800 px | same | 0.35em, 0.2em under 800 px | - | `writing-mode: vertical-rl`, columns 50vh tall, right to left. |
| Ring label | 11px (9px under 800 px in the reference) | 11px | 0.2em | 1 | Uppercase "SCROLL". |
| Footer copyright | 11px | 8px Roboto | 0.2em | 1 | Uppercase, `--at-dim`; hidden under 800 px. |
| Loader wordmark | 20px | - | 0.3em | 1 | Breathing opacity 0.25 to 1 over 1.6 s. |

## Tracking rules

| Context | Minimum | Typical | Maximum |
|---|---|---|---|
| UI labels, ring, footer | 0.2em | 0.2em | 0.3em |
| Body and reveal lines | 0.2em | 0.2em | 0.25em |
| Statements (uppercase) | 0.3em | 0.3em | 0.4em |
| Display wordmark (lowercase) | 0 | 0.04em | 0.1em |
| CJK vertical | 0.2em | 0.35em | 0.35em |
| 3D glyphs (`setText` tracking, em of glyph tile) | 0 | 0.08 | 0.15 |

- Wide tracking belongs on short strings; past about 60 characters per line, drop to the minimum.
- Lowercase display type never gets wide tracking; uppercase statements always do.
- Compensate the trailing space that letter-spacing adds after the last character on centered text (`margin-right: calc(-1 * <tracking>)`).
- Numerals in UI use `font-variant-numeric: tabular-nums` so counters do not jitter.

## Color on type

| Surface | Text | Token |
|---|---|---|
| Black stage | primary | `--at-white` |
| Black stage | quiet metadata | `--at-dim` (#777) |
| Ice intro sky | text and UI | `--at-slate` (#35566b) |
| Lime CTA | label | `--at-lime-ink` (#073b21) |
| Subtitles | white on `rgba(0, 0, 0, 0.9)` | - |
| Reveal target | `--at-reveal-color`, default white | set per section |

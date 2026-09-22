# Style spec template

Copy the block below to `dna/<slug>/STYLE-SPEC.md`.
The worked example is `dna/junni-loanmeme/STYLE-SPEC.md`, which `packages/stage/src/dom/tokens.css` and `HouseCurves` in `packages/stage/src/motion/Easings.ts` implement.
Values are measured from the reference (computed styles, bundle constants, frame timing), never guessed.
Name tokens by role, not by the reference's brand, so a later brand can remap them.

````markdown
# Style spec: <Studio> / <site>

Revision 1, YYYY-MM-DD.
Status: Proposed | Accepted as <scope>.
Implementation: <files that encode it, or "not yet encoded">.

## Mood

Three to five sentences: what it feels like, how light and dark are used across sections, what the payoff is.

## Color

| Token | Value | Use |
|---|---|---|
| `--at-...` | `#rrggbb` | where it appears |

Include gradients as stop lists and any procedural palette (for example an HSV sweep) with its parameters.

## Typography

| Role | Face | Setting |
|---|---|---|
| Display | family and weight (a licensed equivalent if the original is not ours) | case, tracking, size rule |
| UI and body | ... | ... |
| Accent | ... | ... |

Note tracking, case rules and how sizes scale (clamp, vw).

## Motion

| Token | Value | Use |
|---|---|---|
| Default ease (JS) | curve, duration | ... |
| `--at-ease-...` | `cubic-bezier(...)`, duration | ... |
| Stagger | ms | ... |

Rules: numbered, testable statements (for example "everything that appears also leaves").

## Post

| Parameter | Section look A | Section look B | Finale |
|---|---|---|---|
| Bloom | | | |
| Vignette | | | |
| Grain | | | |
| Threshold | | | |

Map these onto `PostParams` in `packages/stage/src/post/PostFX.ts` (`bloom`, `vignette`, `dirt`, `grain`, `exposure`, `threshold`, `blurRange`).

## Chrome

Bullets for every persistent UI element with sizes at desktop and under the breakpoint, and its motion.
````

## Measuring tokens

- Colors and type: `getComputedStyle` in the live page (Playwright `page.evaluate`), or the beautified CSS.
- Easings: `cubic-bezier` values from the CSS; JS curves from the bundle's easing functions (name the family and parameter, for example `sigmoid(6)`).
- Durations and staggers: CSS `transition` and `animation` values, JS constants, or frame stepping a screen recording kept in scratch.
- Post parameters: per-section uniform values in the bundle (search the uniform names found in the shader inventory).

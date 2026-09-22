# Storyboard template

Copy the template to `work/NNN-slug/storyboard.md`.
One block per section, in scroll order, then the video beats and the static-page check.
Keep every field to a line or two; a storyboard that needs paragraphs is not decided yet.
The worked example after the template is the three-section `templates/experience-starter`.
A five-set production example, written as a compact table inside its README, is [work/001-atelier-study/README.md](../../../work/001-atelier-study/README.md).

## Template

````markdown
# Storyboard: <project>

DNA: <dna slug> | Tokens: <mapping decision link> | Status: Proposed

## Overview

| # | Name | Label | World offset | Sky | Post (bloom / vignette / grain) | Load |
|---|---|---|---|---|---|---|
| 0 | intro | Intro | (0, 0, 0) | style 1, top #..., bottom #... | 0.25 / 0.7 / 0.03 | must |
| 1 | ... | ... | (0, -24, 0) | ... | ... | sub |

## <n>. <name>

- **Set**: what stands in the world; procedural or `section_<n>.glb`; the object names code will look up.
- **Camera shot**: position, target (relative to the offset), FOV, parallax range (or "from Blender").
- **Hero motion**: the one intentional motion on enter, with duration and easing.
- **Ambient motion**: what keeps living while the section is on screen (on `stage.time`).
- **Post look**: bloom, vignette, grain, dirt; why it differs from the neighbors.
- **DOM copy**: heading, lede lines, CTA text and target, alt text; `TODO(copy)` where the brand has not supplied it.
- **Exit**: what animates to state 2 or 0 on leave, and how long.
- **Portrait framing**: `portraitFov` (degrees added at `portraitWeight` 1), `portraitOffset` (camera shift that recenters the hero on phones), props or type fitted with `visibleSizeAt( camera, point )`, positions that blend by `portraitWeight`.
- **Reduced motion**: what is removed or shortened.
- **Skills**: which technique skills this section needs.

## Video beats

| Time (s) | Cue | What the viewer sees |
|---|---|---|
| 0 | splash | ... |
| 4.5 | `scroller.move( 1, 1.2 )` | ... |

Duration: <s>. Sizes: 1920 x 1080 (and 1080 x 1920 if a vertical cut is a deliverable). Pointer path: <function of t or "none">.

## Stills

| Name | Size | Section and time | Use |
|---|---|---|---|
| og | 1200 x 630 | intro at 3.0 s | Open Graph |

## Static page check

Read the sections top to bottom with WebGL off: does the copy alone tell the story, and does each section's static background echo its sky?
````

## Worked example: experience starter

| # | Name | Label | World offset | Sky | Post (bloom / vignette / grain) | Load |
|---|---|---|---|---|---|---|
| 0 | intro | Intro | (0, 0, 0) | style 1, `#d6edfa` to `#8fc9e8`, accent `#b7f516` | 0.25 / 0.7 / 0.03 | code only |
| 1 | glass | Glass | (0, -24, 0) | style 2, `#0b111a` to `#020305`, accent `#3f7fd6` | 0.35 / 1.4 / 0.04 | code only |
| 2 | outro | Join | (0, -48, 0) | style 2, `#12061f` to `#000000`, accent `#7a3cff` | 1.6 / 1.0 / 0.05 | code only |

### 0. intro

- **Set**: bitmap-type wordmark "atelier" in Comfortaa 700, four matcap props (two lime, two ice), snowfall particles.
- **Camera shot**: position (0, 0.2, 6.2), target (0, 0.15, 0), FOV 36, default parallax.
- **Hero motion**: title glyphs spin in over 1.6 s after 0.2 s delay (`intro.title` 0 to 1, linear driver, per-glyph easing in the shader).
- **Ambient motion**: props bob on `sin( t * 0.9 + i * 1.7 ) * 0.12` and spin; snow falls at speed -0.3.
- **Post look**: light arrival, low bloom so the pale sky does not blow out.
- **DOM copy**: h1 "atelier"; lede "Somewhere between a page and a film, / a stage is waiting for its first scene."
- **Exit**: title animates to 2 in 0.9 s (glyphs spin out), props shrink to 0 in 0.8 s.
- **Portrait framing**: portrait FOV 26; props blend to portrait positions by `portraitWeight`; title scales to 84% of the visible width at its depth.
- **Reduced motion**: no parallax; section moves shorten to 0.35 s (handled by `bindScrollInput`).
- **Skills**: kinetic-type, uniform-animator, gpgpu-effects (particles).

### 1. glass

- **Set**: refractive torus knot on `REFRACT_LAYER` in front of a curved wall of 22 hue-ramped panels.
- **Camera shot**: offset + (0.4, 0.5, 6.4), target offset + (0, 0.1, 0), FOV 38.
- **Hero motion**: knot scales in with `easeOutBack( 1.6 )` over 1.6 s while panels rise in a stagger.
- **Ambient motion**: knot rotates at (0.21, 0.33) rad/s; panels sway.
- **Post look**: dark stage, stronger vignette to frame the glass.
- **DOM copy**: h2 "Glass"; lede "Everything behind it bends into color."
- **Exit**: `glass.props` to 0 in 0.8 s.
- **Portrait framing**: portrait FOV 34, nothing else.
- **Reduced motion**: as intro.
- **Skills**: glass-refraction, uniform-animator.

### 2. outro

- **Set**: rainbow ring (additive, HSV sweep) and sparks streaming at the camera.
- **Camera shot**: offset + (0, 0, 7.5), target offset, FOV 50.
- **Hero motion**: ring draws on as `outro.fx` goes 0 to 1 over 1.8 s.
- **Ambient motion**: ring turns at 0.1 rad/s; sparks loop.
- **Post look**: finale, heavy bloom.
- **DOM copy**: h2 "Early will be rewarded" with a rainbow word; CTA "Join us".
- **Exit**: `outro.fx` to 0 in 0.6 s.
- **Portrait framing**: portrait FOV 20 (less than the default 30) so the ring stays large.
- **Reduced motion**: as intro.
- **Skills**: postfx-bloom-dirt, gpgpu-effects (sparks), kinetic-type (rainbow CTA).

### Video beats

| Time (s) | Cue | What the viewer sees |
|---|---|---|
| 0 | splash | loader clears, title spins in, ring button appears |
| 4.5 | `scroller.move( 1, 1.2 )` | camera travels down to the glass set |
| 10 | `scroller.move( 2, 1.2 )` | travel to the finale, bloom rises |
| 16 | end | hold on the CTA |

Pointer path: `[ sin( t * 0.9 ) * 0.55, sin( t * 1.3 ) * 0.35 ]` drives parallax and the cursor trail.

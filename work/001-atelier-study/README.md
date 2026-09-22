# 001 atelier study: Pip and the door past the page

Status: Verified locally (2026-09-22).
DNA: [junni-loanmeme](../../dna/junni-loanmeme/DOSSIER.md).
Source: [`examples/001-atelier-study/`](../../examples/001-atelier-study/).
Mascot source: [`blender/mascot.py`](../../examples/001-atelier-study/blender/mascot.py) (Blender 5.2, headless).

## Brief

Prove the whole atelier toolchain on one piece: an original mascot travelling through five sets, each exercising a trait of the DNA, shipped as a fast website plus a teaser video in landscape and vertical.

## Storyboard

| Set | Camera | Hero motion | Look | Post | Copy |
|---|---|---|---|---|---|
| Arrival | 34 deg, eye level | Pip waves, bitmap wordmark spins in, matcap props pop | ice and lime sky, snow | bloom 0.2, vignette 0.7 | "Somewhere past the edge of the page..." |
| Clear | 38 deg | Pip floats and turns as glass in front of a rainbow slide wall | glass, dark sky with blue horizon | bloom 0.35, vignette 1.4 | "Hold still long enough and you turn to glass." |
| Sketch | 11.6 deg telephoto, like reference section 4 | Pip hops as line art; words swap with a hop and a camera shake every 3.5 s | paper white | no bloom, vignette 0.35 | "Every world starts as a line on paper." |
| Night | 44 deg, reframed for portrait | Pip in the dark look turns slowly; neon ring draws itself | black with blue horizon | bloom 1 | Vertical Japanese manifesto |
| Door | 50 deg | Pip runs; the rainbow door draws; sparks stream at the camera | black and violet | bloom 1.6 | "Come build with us" with a clock-driven rainbow |

## Decisions

| Decision | State | Why |
|---|---|---|
| Mascot authored as a Blender Python script | Implemented locally | Reproducible and reviewable; rigid-part skinning with five clips; 521 KB raw, 106 KB after meshopt (the reference character was 1.9 MB). |
| One shared Character across sets, placed by interpolated section anchors | Implemented locally | Pip travels with the camera between sets instead of popping. |
| Shot `portraitOffset` and `visibleSizeAt` added to the engine | Implemented locally | Phones needed reframing (night set) and fitted type (sketch set); blending by portraitWeight keeps it breakpoint free. |
| Dark look as a pure grazing rim | Implemented locally | The Fresnel base term read as grey plush on a round body. |
| Studio shadow map and SSAO passes omitted | Accepted | Two extra depth renders per frame; a cheap underside occlusion term keeps most of the read (a tier-3 add-on lives in the character skill). |
| Japanese manifesto font subset to 29 glyphs | Implemented locally | The split web package shipped a 113 KB @font-face list plus 57 to 64 KB chunks; the subset is one 8.9 KB WOFF2 (`scripts/subset-font.py`). |
| Trail `ink` look on the paper set, scripted cursor below the titles | Implemented locally | An additive rainbow trail saturated to a white smear on paper; ink reads as a brush stroke. |
| Mascot optimized with `--palette false` | Implemented locally | gltf-transform's palette step moved roughness into a texture and the eyes lost their glints (the engine now reads roughness maps too). |
| Bloom threshold 0.85 on arrival and paper | Implemented locally | The correctly bright daylight sky bloomed across the frame and turned the eyes green. |

## Verification

- Performance on the production build: all budgets met, 393 KB total, 250 KB JS, CLS 0, longest task 159 ms at 6x CPU, frame p95 16.7 ms ([perf.json](perf.json)).
- Captures at four viewports in webgl, reduced-motion and static modes, zero console errors: [captures/](captures/).
- Renders: 30 s teasers at 1920 x 1080 and 1080 x 1920 (phone layout at DPR 3), H.264 yuv420p BT.709, with JSON metadata and review sheets in [renders/](renders/); determinism verified across two fresh page loads.

# Key art, print and tiling

Depth for large stills: how far direct rendering goes, print sizes, and what tiling would take if a job ever needs more.

## Direct rendering first

`render-still.mjs` renders the whole frame in one pass: Chromium lays out the page at `w/dpr` x `h/dpr` CSS pixels with `deviceScaleFactor` `--dpr`, the stage renders its canvas at `--w` x `--h` device pixels, and the screenshot is taken at device pixels.
That keeps every screen-space effect correct (vignette, bloom radius, grain, refraction, DOM overlays), so it is always the preferred route.

Limits, in the order you hit them:

1. GPU render size: the script refuses frames larger than the smallest of `MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE` and `MAX_VIEWPORT_DIMS` (16384 on Apple silicon and most desktop GPUs).
2. GPU memory: the post chain holds several full-size targets (scene and opaque copies in half float, composite in 8-bit, bloom chain); at 7680 x 4320 that is well over 500 MB.
3. Screenshot size: 7680 x 4320 took about 20 s and produced a 30 MB PNG on an M3 Pro.

| Target | Command | CSS layout |
|---|---|---|
| 4K key art, video framing | `--preset 4k` (`--w 3840 --h 2160 --dpr 2`) | 1920 x 1080 |
| 8K key art | `--w 7680 --h 4320 --dpr 4` | 1920 x 1080 |
| A4 portrait, 300 dpi | `--preset poster-a` (`--w 2480 --h 3508 --dpr 2`) | 1240 x 1754 |
| A3 portrait, 300 dpi (3508 x 4961, 1 px short) | `--w 3508 --h 4960 --dpr 2` | 1754 x 2480 |
| A2 portrait, 300 dpi (4961 x 7016, 1 px short) | `--w 4960 --h 7016 --dpr 4` | 1240 x 1754 |
| Billboard 48 sheet, 150 dpi | `--w 8064 --h 3584 --dpr 4` | 2016 x 896 |

Bloom, grain and the cursor trail scale with device pixels, so a high-DPR still has the same look as the 1080p video at a finer grain; check a 100 percent crop before sending anything to print.

## Print notes

- Output is sRGB. The printer converts to CMYK; the lime (`#b7f516`) and the rainbow sweep are outside most CMYK gamuts, so ask for a proof and expect them to dull.
- Add bleed by enlarging `--w` and `--h` proportionally (3 mm on A4 is about 1.4 percent per side) and keep text inside the safe area; the camera composition then extends into the bleed instead of stretching.
- Deliver the PNG master plus the printer's requested format; never crop or scale a file to fit, re-render it at the right size.
- Record paper size, dpi and bleed in the manifest entry `notes`.

## Tiling (optional, needs engine work)

Only for frames larger than the GPU limit.
Nothing in `@atelier/stage` supports it today; this is the design if a project needs it.

1. Split the frame into tiles and render each with `camera.setViewOffset( fullW, fullH, x, y, tileW, tileH )` in capture mode at the tile size.
2. Every screen-space term in the post chain must use full-frame coordinates: the composite's vignette and grain read `vUv`, so it needs a tile offset and scale uniform (`uv = offset + vUv * scale`).
3. Bloom and refraction sample neighbors: render each tile with a margin of at least the widest bloom radius (the coarsest mip covers a large part of the frame, so in practice 10 to 15 percent of the frame per side) and crop the margin, or disable bloom and composite a bloom pass rendered at lower resolution over the whole frame.
4. SMAA and FXAA need a few pixels of margin at tile edges; crop them.
5. DOM overlays cannot be tiled by the camera; render them once at the full size as a separate transparent layer (which also needs the transparency work in `SKILL.md`) or leave text to the designer.
6. Stitch with a lossless tool (`ffmpeg -filter_complex` with `xstack`, or `vips arrayjoin`) and verify seams at 400 percent.

Because of steps 3 and 5, tiled output is never byte-identical to a direct render; treat it as a separate deliverable and record the tile layout in the manifest `notes`.

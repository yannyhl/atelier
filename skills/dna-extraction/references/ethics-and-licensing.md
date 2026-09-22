# Ethics and licensing

Studying how a public site works is normal craft practice.
Shipping its assets, its words or its identity is not.
These rules keep every DNA on the right side of that line.

## What goes where

| Material | Study it | Commit to `dna/` | Use in a build |
|---|---|---|---|
| Techniques, architecture, parameters, timings, measurements | Yes | Yes, as prose and tables | Yes, re-implemented |
| Code under MIT, BSD, Apache-2.0, ISC or zlib | Yes | Short excerpts with attribution | Adapted, notice kept, listed in `THIRD_PARTY_NOTICES.md` |
| Minified or unlicensed code | Yes, to learn | At most a few lines as evidence, cited by file and line | No; write our own |
| Shaders inside an unlicensed bundle | Yes | Constants and structure only | Re-derived from the math or from a licensed source |
| Models, textures, HDRIs, video, audio | Measure only | Never | Never |
| Copy, slogans, names, mascots, logos | Note tone and structure | Never verbatim beyond a short quote | Never |
| Fonts | Note family and settings | Never the files | Only with a license we hold (self-hosted OFL faces are fine) |
| Screenshots | As working notes | Never | Never |

A license covers what it says it covers.
The JUNNI repository is MIT for its code; the Loan Meme reskin's own character, logo and copy carry no license and are treated as all rights reserved even though they sit on top of MIT code.
When a repository mixes code and art under one license, read its README for carve-outs before assuming art is covered.

## Never

- Impersonate the reference or its brand: no clones, no look-alike logos, no reuse of its domain, mascot, voice or social handles.
- Present a build as affiliated with the studied studio.
- Bypass authentication, paywalls, rate limits, bot protection or `robots.txt` disallow rules.
- Re-host the reference's files, even temporarily, anywhere public.
- Train, trace or auto-convert their art into "our" assets.

## Adapting licensed code

1. Confirm the license file in the repository at the commit you read, not just a badge.
2. Keep the copyright line and license text with the adapted code (a header comment in the file is enough for short adaptations).
3. Add a section to `THIRD_PARTY_NOTICES.md` in the same format as the existing ones: source URL, what was used, the license text.
4. Mention the source in the dossier's "Sources" list.

## Gray areas

- **Parameters copied from an unlicensed bundle** (an easing curve, a spring constant, a color): facts and tiny numeric choices are fine to record and reuse; a whole tuned system transcribed line by line is not.
  Re-implement from the described behavior.
- **Well-known snippets inside a bundle** (simplex noise, fast Gaussian blur, SMAA): find the original licensed source and use that, with its notice.
- **Look and feel**: a style (rounded display type, heavy tracking, ice-and-lime palette, bloom-heavy finale) is not ownable, but the combination of a specific mascot, name and layout is an identity.
  Change the identity, keep the craft.

When in doubt, record the finding as a measurement in the dossier and ask the user before using it in a build.

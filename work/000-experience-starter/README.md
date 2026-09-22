# 000 experience starter

Status: Verified locally (2026-09-22).
DNA: [junni-loanmeme](../../dna/junni-loanmeme/DOSSIER.md).
Source: [`templates/experience-starter/`](../../templates/experience-starter/).

## What it is

The copyable starting point for every atelier scroll site: three sets (intro, glass, outro) on `@atelier/stage`.
The page is a complete static document first; an inline head script opts into stage layout before first paint, the WebGL chunk loads lazily, and the page falls back to the static document on tier 0, missing WebGL2, `?static` or context loss.

## Decisions

| Decision | State | Why |
|---|---|---|
| Vanilla TypeScript + three.js r186, no framework | Accepted | Smallest runtime, closest to the reference architecture, embeddable anywhere. |
| Dual-filter bloom instead of the reference mip strip | Implemented locally | The strip aliased into visible blocks on bright areas at phone resolution. |
| Glass needs a colorful backdrop (rainbow slide wall) | Implemented locally | Refracting a dark sky and grey blocks read as flat; refraction only sells when there is color behind it. |
| Pre-paint `is-webgl` opt-in | Implemented locally | Switching layout after boot measured CLS 1.0; opting in before first paint measured 0. |
| Capture grain at 0.25 | Implemented locally | Full grain made a 16 s 1080p capture 130 MB; 0.25 made it 8 MB with no visible loss after X re-encoding. |
| Bloom threshold 0.85 on the light intro | Implemented locally | After fixing a double sRGB conversion the correct daylight sky exceeded 0.5 in linear space and the whole frame bloomed. |
| Boot split into tasks (yield after chunk eval, per-set warm-up) | Implemented locally | Single boot tasks reached 218 to 246 ms at 6x CPU; split, the longest is under 160 ms. |

## Verification

- `scripts/audit-perf.mjs` on the production build: all budgets met, 222 KB total, 190 KB JS, CLS 0, frame p95 16.7 ms at 1x, 4x and 6x CPU (see [perf.json](perf.json)).
- `scripts/capture-matrix.mjs`: phone, tablet, laptop, desktop, each in webgl, reduced-motion and static modes, zero console errors (see [captures/](captures/)).
- `scripts/render-video.mjs --verify`: identical frame hashes across two fresh page loads.
- Harness proof: Claude Code and Codex both discover all 13 skills and each built a working new set with `scroll-stage` (see [harness-proof/](harness-proof/README.md)).

# NNN: <title>

Status: Proposed | Accepted | Implemented locally | Verified locally | Published
Date: YYYY-MM-DD
DNA: <slug> (dossier: `dna/<slug>/DOSSIER.md`)
Build: `examples/NNN-slug/` (preview port <port>)
Live: <URL once Published>

## Brief

| Field | Value |
|---|---|
| Brand | |
| Audience and goal | |
| Sections | |
| Deliverables | |
| Constraints | |
| Assets and licenses | |

Defaults the director chose where the brief was silent:
- ...

## Storyboard

See `storyboard.md` in this folder.
One line per section: name, hero motion, post look.

## Skills used

In order, with what each produced.

## Gates

| Gate | Result | Evidence | Ran |
|---|---|---|---|
| `npm run check` | pass / fail | console summary | YYYY-MM-DD |
| Capture matrix, 4 viewports x webgl, reduced, static | pass / fail | `captures/matrix.json` | |
| Visual review of every capture | pass / fail, fixes listed below | `captures/*.jpg` (raw PNGs in `artifacts/`) | |
| Perf audit, production build | pass / fail | `perf.json` | |
| Asset gate | pass / fail / n.a. | `assets.json` | |
| Video render `--verify` | PASS / FAIL / n.a. | `renders/<name>.json`, `renders/<name>-review.jpg` | |
| Stills | done / n.a. | `renders/` or `stills/` | |

Key numbers: total transfer <KB>, JS <KB>, CLS <value>, phone-6x frame p95 <ms>, tier on desktop <n>.
Caveat: CPU throttling does not slow the GPU; confirmed on a real phone: yes / not yet.

## Fixed during review

- <file or capture>: what was wrong, what changed.

## Decisions

See `decisions.md` in this folder.

## Open items

- Copy still marked `TODO(copy)`, licenses to confirm, publishing steps waiting for the user.

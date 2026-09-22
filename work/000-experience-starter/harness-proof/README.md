# Harness proof (2026-09-22)

Goal: confirm the atelier skills work in both harnesses, not just that they are discovered.

## Discovery

Run from the repository root, each harness was asked (no file reads allowed) to list the skills it had loaded from this repository.
Both returned all 13: `atelier-director, blender-gltf-stage, character-studio-shading, deterministic-render, dna-extraction, glass-refraction, gpgpu-effects, kinetic-type, perf-tiering, postfx-bloom-dirt, scroll-stage, stills-and-posters, uniform-animator`.

| Harness | Version | Discovery path |
|---|---|---|
| Claude Code (`claude -p`) | Opus 5.5 | `.claude/skills` -> `skills/` |
| Codex (`codex exec`) | codex-cli 0.154.0 | `.agents/skills` -> `skills/` |

## Build task

Each harness got the same prompt in its own throwaway copy of `templates/experience-starter`:
follow `skills/scroll-stage` to add a fourth set named "bars" between "glass" and "outro" (12 instanced rainbow bars rising with a staggered easeOutBack, retracting on leave, dark sky, bloom 0.8, real DOM copy), keep `AGENTS.md` rules, typecheck.

| Harness | Typecheck | Console errors (laptop, phone, static) | Notes |
|---|---|---|---|
| Claude Code | pass | 0 | Moved the outro set to y -72 so the camera does not fly through it; added portrait framing. |
| Codex | pass | 0 | Tighter bar row, heading below the bars; could not run captures inside its sandbox. |

Evidence: `claude-laptop.jpg`, `claude-phone.jpg`, `codex-laptop.jpg`, `codex-phone.jpg` (captured by `scripts/capture-matrix.mjs` from production builds).
The throwaway copies were deleted after capture.

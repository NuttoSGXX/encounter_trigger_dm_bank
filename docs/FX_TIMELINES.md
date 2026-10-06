# FX timelines and asset inventory

## Style resolution (per style)

`video plate > asset pack > still plate > procedural FX`. A missing or broken asset never blocks the encounter: that layer is skipped or the style falls back to the procedural effect.

## Magical asset pack (`assets/magical/`, 1590 KB total)

| File | Asset | Size | Weight |
|---|---|---|---|
| `orb-blue.webp` | orb-blue | 381x383 | 101 KB |
| `orb-cyan.webp` | orb-cyan | 374x376 | 95 KB |
| `orb-violet.webp` | orb-violet | 378x381 | 96 KB |
| `orb-magenta.webp` | orb-magenta | 375x376 | 95 KB |
| `orb-gold.webp` | orb-gold | 377x377 | 88 KB |
| `orb-green.webp` | orb-green | 374x379 | 88 KB |
| `ribbon-blue.webp` | ribbon-blue | 1000x164 | 74 KB |
| `ribbon-violet.webp` | ribbon-violet | 1000x170 | 76 KB |
| `ribbon-gold.webp` | ribbon-gold | 1000x186 | 82 KB |
| `ribbon-green.webp` | ribbon-green | 1000x164 | 69 KB |
| `arcane-core.webp` | arcane-core | 477x495 | 143 KB |
| `arcane-ring.webp` | arcane-ring | 490x486 | 103 KB |
| `magic-burst.webp` | magic-burst | 601x521 | 154 KB |
| `sparkle-1.webp` | sparkle-1 | 166x188 | 11 KB |
| `sparkle-2.webp` | sparkle-2 | 260x284 | 24 KB |
| `sparkle-3.webp` | sparkle-3 | 145x152 | 10 KB |
| `sparkle-4.webp` | sparkle-4 | 124x138 | 6 KB |
| `encounter-magical.webp` | encounter-magical | 1600x283 | 275 KB |
| `pack.json` | manifest (sizes, ribbon head anchors) | | 2 KB |

All images are transparent WebP, cut from the original generated sheets (glow on pure black) with `tools/extract_magical_pack.py`.

## Magical timeline (ms from start)

| Time | What happens |
|---|---|
| 0 | Screen dims to deep violet-black. Images load (cached after the first run). |
| 150 to 2650 | Six hero orbs fade in (staggered 40 ms), drift, then follow individual spiral paths into the center. Each orb drags its ribbon (head on the orb, rotated along its velocity). |
| 300 to 2600 | The arcane core charges (scale 0.08 to 0.78). |
| 900 / 1200 | Two arcane rings fade in and slowly counter-rotate (18 s / 26 s per turn). |
| 2650 | CONVERGENCE then BURST: flash, burst flare, rings expand and fade, core flares out, 16 sparkles fly outward. |
| 2800 | ENCOUNTER (crystal title) is revealed from the core: scale, blur and brightness settle over 1 s. |
| 2850 | GM client swaps the scene (screen is covered by the burst). |
| 3500 | Running-text bands appear; 12 sparkles twinkle around the title. |
| 4000 | Light sweep passes through the letters; the title breathes (brightness 1 to 1.18). |
| 6700 | Fade out (1.2 s). |
| 7000 | Initiative dice appear. |
| 7900 | Overlay removed, all animations cancelled, DOM cleaned. |

Element budget: 6 orbs + 6 ribbons + 1 core + 2 rings + 1 burst + 16 burst sparkles (removed after ~1.6 s) + 12 twinkles + 2 title images. All animation is transform/opacity (compositor friendly).

## Tuning
Cues and counts are at the top of `playPackIntro` and in `PACKS` in `scripts/main.js`.

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

## Dark Fantasy asset pack (`assets/dark/`, 1235 KB total)

| File | Asset | Size | Weight |
|---|---|---|---|
| `dark-background.webp` | dark-background | 1600x900 | 64 KB |
| `foliage-left.webp` | foliage-left | 666x881 | 166 KB |
| `foliage-right.webp` | foliage-right | 568x877 | 138 KB |
| `foliage-top.webp` | foliage-top | 904x344 | 91 KB |
| `beast-lurk.webp` | beast-lurk | 783x716 | 143 KB |
| `beast-lunge.webp` | beast-lunge | 540x864 | 153 KB |
| `beast-eyes.webp` | beast-eyes | 1400x463 | 239 KB |
| `blood-splash.webp` | blood-splash | 476x423 | 51 KB |
| `blood-droplets.webp` | blood-droplets | 573x287 | 15 KB |
| `blood-drop.webp` | blood-drop | 29x29 | 1 KB |
| `blood-drip-1.webp` | blood-drip-1 | 32x316 | 4 KB |
| `blood-drip-2.webp` | blood-drip-2 | 31x267 | 3 KB |
| `blood-drip-3.webp` | blood-drip-3 | 32x307 | 4 KB |
| `blood-drip-4.webp` | blood-drip-4 | 34x236 | 3 KB |
| `encounter-dark.webp` | encounter-dark | 1541x313 | 72 KB |
| `fog-back.webp` | fog-back | 2048x360 | 47 KB |
| `fog-front.webp` | fog-front | 2048x360 | 41 KB |
| `pack.json` | manifest (foliage placement, title baseline and letter positions, eye spacing) | | 3 KB |

Cut from the generated sheets with `tools/extract_dark_pack.py` (white / green / black keying with despill). The two fog layers are generated procedurally by the same tool (seamless horizontal tiling). Sources: background plate, foliage frame, beast sheet, eyes, blood sheet, metal title.

## Dark Fantasy timeline (ms from start)

| Time | What happens |
|---|---|
| 0 | Moonlit swamp plate fades in with a slow push-in. Vignette. |
| 500 | Two fog layers fade in and drift. |
| 1000 | The foliage (scaled up from the screen edges, so the center is closed) trembles. |
| 1500 | The foliage parts (1.15 s). |
| 2000 | Two faint amber eyes appear in the dark. |
| 2500 | The beast is half-seen behind the fog and breathes. |
| 3000 | Tension: the eyes burn brighter and hold. |
| 3200 | LUNGE (0.22 s): the beast swaps to its lunge pose and rushes the camera from the head, with motion blur; the eyes flare; the frame shakes. |
| 3480 | IMPACT: blackout. Foliage, beast, eyes and front fog are removed; the plate is dimmed. A blood splash and a droplet scatter appear on the darkness (restrained, fading by about 4.5 s). |
| 3560 | GM client swaps the scene (screen is black). |
| 3950 | Darkness gives way. |
| 4000 | ENCOUNTER (worn metal with bleeding edges) fades in from a slight blur. |
| 4400 | Four extra blood drips grow under selected letters (2.8 s each, staggered); droplets break free and fall. |
| 4700 | Running-text bands appear. |
| 7300 | Fade out (1.2 s). |
| 7600 | Initiative dice appear. |
| 8500 | Overlay removed, animations cancelled, DOM cleaned. |

Element budget: 1 plate + 2 fog + 2 beasts + 1 eyes + 3 foliage + 1 vignette during the first act; then 2 blood layers, 1 title, 4 drips and up to 3 droplets. All animation is transform/opacity/clip-path; only the lunge beast uses a short blur filter.

## Tuning
Cues are at the top of `playPackIntro` (Magical) and `playDarkPack` (Dark Fantasy), and in `PACKS` in `scripts/main.js`. Head alignment (`HEADS`, `HEAD`) is in `playDarkPack`.

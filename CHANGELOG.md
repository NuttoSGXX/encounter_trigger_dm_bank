# Changelog

## 0.9.1 — Dark Fantasy Asset Pack
- **Dark Fantasy is now built from layered artwork**, driven by a timeline director: moonlit swamp plate, drifting fog, foliage that parts, two faint eyes, a beast half-seen behind the fog, a lunge at the camera, blackout, restrained blood, and a worn-metal ENCOUNTER title that bleeds. Running-text bands kept.
- Assets live in `assets/dark/` (19 WebP + `pack.json`, about 1.2 MB), cut with `tools/extract_dark_pack.py` (white / green / black keying with despill; fog is generated procedurally).
- Foliage pieces are edge-anchored (their outer edges are cut by the frame), so "closed" is done by scaling up from the screen edge rather than sliding inward.
- Pack lookup is now generic (`critical` assets per style). Same resolution order: video > asset pack > still plate > procedural, with automatic fallback if a critical asset fails to load.
- Docs: `docs/FX_TIMELINES.md` now covers both packs (inventory + timelines).
- Magical and Default are unchanged.


## 0.9.0 — Magical Asset Pack
- **Magical is now built from real artwork.** A timeline director animates pre-rendered, transparent assets: 6 hero orbs with ribbon trails spiral into an arcane core, burst, and a crystal ENCOUNTER title is revealed with a light sweep and sparkles. The running-text bands are kept.
- Assets live in `assets/magical/` (17 transparent WebP + `pack.json`, about 1.6 MB). They were cut from generated sheets with `tools/extract_magical_pack.py`.
- Resolution order per style: video plate > asset pack > still plate > procedural. If any critical asset fails to load, Magical falls back to the procedural effect; optional layers are skipped. The encounter never depends on the art.
- Assets are preloaded into the browser cache shortly after the game loads.
- Added `docs/FX_TIMELINES.md` (timeline + asset inventory).
- Dark Fantasy and Default are unchanged (procedural), awaiting their own packs.

## 0.8.1 — Restored Brief + Centered Title
- **ENCOUNTER is centered again.** The 0.5.2 cleanup layer had pushed the title down (56-58%) and shrunk it; removed. Added compensation for the trailing letter-spacing so it is exactly centered.
- **Magical restored to the original brief:** many colored streams spiral into the center, burst, the title is born from the core, with glitter. The running text bands are back, restyled as shimmering arcane text with star separators.
- **Dark Fantasy restored to the original brief:** moonlight and fog, a clawed hand parts the brush, two faint eyes that hold still, a sudden lunge, cut to black, blood, then ENCOUNTER with a few blood drips and falling droplets (not every letter). Grey/black running text with cross separators.
- Removed the "beast silhouette" overlay, the hidden running-text bands, and the orb/ribbon Magical variant introduced in 0.5.x.
- Intro errors are now caught: if a cinematic throws, the overlay is cleaned up instead of leaving the screen stuck.
- Magical still-plate timing aligned with the restored convergence.
- README rewritten.

## 0.8.0 — Floating Launcher
- The launcher is now a **floating panel like VN Stage**, not a Foundry window. Grab the header and it moves immediately (no window menu, no extra clicks). Position is remembered per client; Esc or × closes it.
- Opening it again from the Token controls toggles it. Still GM-only (button hidden for players, and the panel refuses to start for non-GMs).
- Removed the ApplicationV2 window code and the old drag workaround.

## 0.7.0 — Still Plates
- New optional **still plates**: drop `magical.(webp|jpg|png)` / `dark-fantasy.(webp|jpg|png)` into `assets/plates/` and that style animates your artwork with code (push-in, fog, convergence/burst reveal, lunge zoom, blood, typography). Priority: video plate > still plate > procedural FX.
- Clients are told which asset to use by the GM, so everyone sees the same cinematic.
- Docs: `docs/PLATE_PROMPTS.md` (image prompts + requirements), `assets/README.md`.

## 0.6.0 — Media Plates + Drag Fix
- **Launcher dragging rebuilt.** Dragging is now handled once on the window element (survives re-renders), uses window-level pointer listeners, takes over the native header drag, and falls back to direct left/top positioning if `setPosition` fails. Drag from the header or any non-interactive area.
- **Media plates (optional).** Put `default.webm`, `magical.webm` or `dark-fantasy.webm` in `assets/video/` and that style plays your pre-rendered video full-screen instead of the procedural FX. ENCOUNTER typography, flavor bands, 3D d20 initiative and combat stay code-driven. If a file is missing the style falls back to the procedural FX automatically.
- Videos are preloaded into each client's cache shortly after load.
- **Release packaging:** the GitHub workflow now includes the `assets/` folder in `module.zip` (previously it was left out).
- Cue timings per style live in the `MEDIA` object at the top of `scripts/main.js`.

# Changelog

## 0.5.3 — Stability Fix
- Restored GM encounter orchestration and initiative workflow accidentally omitted from 0.5.2.
- Restored shared cinematic intro scaffolding and Default/Magical intro definitions.
- Fixed Dark Fantasy intro reference to the actual eye reveal asset.
- Restored compact-header dragging without visible helper text.
- Kept the redesigned Magical and Dark Fantasy visual FX.

# Changelog

## 0.5.2 — Cinematic Visual Cleanup

- Reworked Magical FX into a cleaner semi-real arcane convergence with larger dimensional orbs, restrained ribbons, central core and controlled sparkle.
- Reworked Dark Fantasy FX into a cleaner eye-level moonlit reveal with parted foliage, beast silhouette, lunge and restrained blood particles/drips.
- Removed the old claw-scratch overlay that made Dark Fantasy visually noisy.
- Removed the visible “DRAG TO MOVE” label.
- Enabled Foundry V14 native ApplicationV2 frame positioning for the launcher. The actual window header is the drag surface.
- Preserved GM-only flow, scene/party/hostile selection, socket sync, 3D d20 initiative, initiative announcement and automatic combat start.

## v0.5.2 — Release Packaging Refresh

- Bumped module version to `0.5.2`.
- Release manifest now points to the `v0.5.2` module asset.
- GitHub Actions now publishes both `module.json` and `module.zip` as Release assets.
- Preserves the semi-real Magical orb/convergence FX, Dark Fantasy foliage/lunge/blood FX, and draggable compact launcher from v0.5.0.

## v0.5.0 — Semi-Real FX Overhaul

- Redesigned Magical FX with semi-real magical orbs, converging energy trails, arcane core, rings, bloom, and spark bursts.
- Redesigned Dark Fantasy FX with layered foliage, moon haze, glowing eyes, creature lunge, impact particles, blood splatter, and blood-drip title treatment.
- Compact launcher is draggable by its header and remains GM-only.
- Preserved scene, party, hostile-token, socket, 3D d20 initiative, initiative announcement, and automatic combat-start flow.

## [0.4.0] - Visual FX Rework

### Visual FX Rework
- Rebuilt **Magical** intro from the ground up with layered arcane orbs, converging filaments, chromatic cores, orbiting nodes, rune-like energy rings, bloom, and physically moving particles.
- Rebuilt **Dark Fantasy** depth FX with moon haze, semi-real foreground branches, animated brush-parting reveal, impact blood particles, wet-looking drips, and stronger lunge/impact depth.
- Kept the cinematic `ENCOUNTER` typography and existing encounter/initiative flow intact.
- Added a direct **Drag to Move** interaction for the compact GM launcher using Foundry VTT v14 ApplicationV2 positioning.


## 0.4.0 — Visual Overhaul

### Added
- Compact Dark Magic Academia launcher UI.
- English-only launcher interface.
- Compact scene dropdown and party portrait strip.
- Compact Default / Magical / Dark Fantasy style selector.
- Subtle animated occult background and pseudo-3D UI depth.
- Reduced-motion support.
- Stronger style-specific mini previews.
- Improved visual separation between the small GM launcher and full-screen cinematic FX.

### Improved
- Launcher footprint reduced substantially for faster in-session use.
- Magical style emphasizes multi-color arcane convergence and glittering title formation.
- Dark Fantasy style emphasizes moonlight, fog, monster ambush, and blood-accented typography.
- Default style retains the fire/inferno identity while keeping the launcher compact.

### Preserved
- GM-only access.
- Scene selection.
- Party selection.
- Hostile token handling.
- Socket synchronization.
- 3D d20 initiative sequence.
- Automatic combat creation/start.

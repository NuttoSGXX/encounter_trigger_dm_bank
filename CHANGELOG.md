# Changelog

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

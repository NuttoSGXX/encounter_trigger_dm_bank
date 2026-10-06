# Encounter FX

A compact, GM-only cinematic encounter starter for Foundry VTT v14 + dnd5e.

## v0.4.0 — Visual Overhaul

Version 0.4 focuses on a cleaner GM workflow and stronger cinematic identity.

### Launcher

- Compact GM utility panel instead of a large dashboard.
- English-only UI.
- Dark Magic Academia visual language.
- Scene selection through a compact dropdown.
- Compact party selection with player portraits.
- Three FX style selectors: Default, Magical, Dark Fantasy.
- Hostile-token toggle.
- Preview and Start Encounter controls.
- Subtle ambient motion, depth, sigils, and hover feedback.
- Reduced-motion support.

### Cinematic Styles

**Default — Inferno**

Fire, embers, heat distortion, impact, and a fiery `ENCOUNTER` title.

**Magical — Arcane Convergence**

Multiple colored magical streams converge toward the center, burst into light, and form a sparkling `ENCOUNTER` title.

**Dark Fantasy — Moonlit Hunt**

Moonlight, fog, parting vegetation, predatory eyes, a creature lunge, and a blood-accented `ENCOUNTER` title.

### Encounter Flow

1. The GM opens Encounter FX from the Token controls.
2. Select a destination scene.
3. Select party members.
4. Select an FX style.
5. Optionally add hostile tokens from the destination scene.
6. Preview the style or start the encounter.
7. The chosen cinematic takes over the screen.
8. The existing synchronized 3D d20 initiative sequence runs.
9. Initiative is announced and combat starts automatically.

## Installation

In Foundry VTT, install the module using the manifest URL:

`https://github.com/NuttoSGXX/encounter_trigger_dm_bank/releases/latest/download/module.json`

## Compatibility

- Foundry VTT: v14+
- dnd5e: 6.0.0+

## Customisation

Style phrases, timings, and colors can be adjusted in `scripts/main.js` inside `STYLES`.

The launcher styling is in `styles/encounter-fx.css` and the compact launcher markup is in `templates/launcher.hbs`.

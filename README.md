# Encounter FX

Cinematic encounter starter for **Foundry VTT V14** + **dnd5e**. GM-only.

1. Click the flame button in the Token controls (GM only).
2. Pick a destination scene, the party members, and an FX style.
3. The screen is taken over by the chosen style, everyone is moved to the scene and the tokens are added to the real Combat.
4. One 3D d20 appears per player. Everyone rolls their own die at the same time; NPCs roll silently.
5. The initiative order is announced and the combat starts automatically.

## Styles

| Style | Description |
|---|---|
| **Default** | CG fire sweeps the screen, `ENCOUNTER` is typed then slammed down with a fiery glow. |
| **Magical** | Streams of colored magic spiral to the center and burst into glittering `ENCOUNTER`. |
| **Dark Fantasy** | Part the brush, glowing eyes in the mist, the beast lunges, bloody `ENCOUNTER`. |

Use **Preview Style** in the launcher to watch a style without changing scenes or touching combat.

## Install

Manifest URL:

```
https://github.com/NuttoSGXX/encounter_trigger_dm_bank/releases/latest/download/module.json
```

## Customising

- Scrolling phrases, timings, colors per style: `STYLES` at the top of `scripts/main.js`.
- Show only players in the initiative summary: `SHOW_NPC_IN_ORDER = false`.
- Optional stinger sound: Module Settings -> *Encounter stinger sound*.
- The UI uses Cinzel / IM Fell via Google Fonts when online and falls back to system serif fonts offline.

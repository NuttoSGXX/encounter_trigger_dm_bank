# Grim Encounter

A GM-only cinematic **Start Encounter** tool for **Foundry VTT v14** and the **dnd5e** system.

Pick a scene, pick a style, press **Start Encounter**. The screen is taken over by a full-screen cinematic, everyone is moved to the scene, the tokens are added to Foundry's **native Combat**, every player rolls their own 3D d20 for initiative at the same time, the order is announced, and combat starts automatically.

The launcher is small and practical, in the same black-and-red style as the other Grim modules. The cinematic is the spectacle.

## Install

Manifest URL:

```
https://github.com/NuttoSGXX/encounter_trigger_dm_bank/releases/latest/download/module.json
```

Requirements: Foundry VTT v14, dnd5e 6.0.0 or newer. Recommended: **Dice So Nice** (the initiative dice use each player's own dice look).

> Upgrading from "Encounter FX" (`encounter-fx`)? Grim Encounter is a new module id (`grim-encounter`). Disable or uninstall the old one first, otherwise you get two launcher buttons. Client settings (panel position, last style) start fresh.

## Using it

1. Click the **Grim Encounter** flame button in the **Token controls** (GM only). The launcher appears as a small floating panel.
2. **Grab the header and drag** it anywhere. The position is remembered on your machine. `Esc` or `×` closes it.
3. Choose the **Scene**, the **Style**, which **players** join the combat, and whether **hostile tokens** of that scene are added.
4. **Preview** plays only the cinematic on your screen (no scene change, no combat). **Start Encounter** runs the real thing.

You can also open it from a macro: `game.modules.get("grim-encounter").api.open()`

### What happens after Start

1. Cinematic plays for everyone; the scene is swapped while the screen is covered.
2. A real `Combat` is found or created for that scene and the selected tokens are added.
3. NPCs and hidden combatants roll initiative silently.
4. One 3D d20 appears per player character (with the character and player name under it). Before the roll every die **idles, spinning slowly in place**. Each player clicks their own die; everyone can roll at the same time. The GM can click any die or use **Roll All Remaining**.
5. On click the die **spins faster where it is** (it does not bounce or tumble around the screen) and settles on the rolled face. Natural 20 / natural 1 get their own effect.
6. The initiative order is announced and combat starts automatically. No confirmation button.
7. `Esc` (GM) cancels the overlay if something goes wrong.

Players only ever see the cinematic and their own dice; they cannot open the launcher.

## Dice So Nice

If Dice So Nice is active, each player's initiative die is painted with **their own Dice So Nice d20 look**: colorset (or custom colors), texture, material (metal / chrome / glass are rendered differently) and number font. A player who never customised their dice, or a table without Dice So Nice, gets the style's default die. Toggle: **Use Dice So Nice dice look** in Module Settings (per user).

The module never creates a chat roll for this, so Dice So Nice does not throw a second set of dice across the screen. Initiative values are rolled with the real dnd5e initiative formula and written to the Combat as before.

Dice So Nice has no public call for "give me this user's d20 colours", so the module reads the saved appearance from the user document and resolves colorsets/textures through a few probed lookups, with a built-in table for DSN's stock colorsets as a fallback. If a die does not match what the player sees in DSN, run this in the console and share the output:

```js
game.modules.get("grim-encounter").api.dsn.debug()
```

## Styles

| Style | Look |
|---|---|
| **Default** | Fire. The title is typed letter by letter, slammed onto the screen, and glows like embers. |
| **Magical** | Built from layered artwork: six crystal orbs with ribbon trails spiral into an arcane core, burst, and a crystal ENCOUNTER title is revealed with a light sweep and sparkles. Shimmering running text. (Procedural fallback if the art is missing.) |
| **Dark Fantasy** | Built from layered artwork: moonlit swamp, fog, foliage that parts, two eyes in the dark, a beast that lunges at the camera, blackout, restrained blood, and a worn-metal ENCOUNTER title that bleeds. Grey/black running text. (Procedural fallback if the art is missing.) |

Default uses procedural effects. Magical and Dark Fantasy ship with asset packs in `assets/magical/` and `assets/dark/`. Asset inventory and timeline: `docs/FX_TIMELINES.md`.

## Bring your own art (optional)

For a look beyond what code can draw, you can feed a style your own artwork or video. Priority per style: **video > asset pack > still plate > procedural effects**. If a file is missing the module falls back automatically.

| Kind | Where | Notes |
|---|---|---|
| Asset pack (Magical, Dark Fantasy) | `assets/magical/`, `assets/dark/` + `pack.json` | Transparent WebP layers animated by a timeline director. Rebuild from new sheets with `tools/extract_magical_pack.py` / `tools/extract_dark_pack.py`. |
| Video plate | `assets/video/default.webm`, `magical.webm`, `dark-fantasy.webm` | 1080p, 6-9 s, opaque. See `assets/README.md` for specs and cue timings. |
| Still plate | `assets/plates/magical.(webp\|jpg\|png)`, `dark-fantasy.(webp\|jpg\|png)` | 16:9 artwork (for example from ChatGPT). The module animates it: reveal, push-in, fog, lunge, blood, typography. |

Guides: `docs/PLATE_PROMPTS.md` (image prompts) and `docs/VIDEO_PROMPTS.md` (video prompts and cue sync).
Cue timings are in `MEDIA` and `PLATES` at the top of `scripts/main.js`.

## Settings and customising

- **Encounter stinger sound** (Module Settings): an audio file played when the encounter starts.
- **Use Dice So Nice dice look** (Module Settings, per user): skin the initiative dice with the Dice So Nice appearance.
- Running text, timings and colors per style: `STYLES` at the top of `scripts/main.js`.
- Only list players in the initiative summary: `SHOW_NPC_IN_ORDER = false`.
- Reduced motion (OS setting) is respected for the heaviest effects.

## Troubleshooting

- **Nothing happens when I press Start:** pick a scene first (the field is required). Check the browser console (F12) for `grim-encounter` messages.
- **A player has no die:** the character needs a token in the destination scene, and a non-GM user must own the character.
- **Overlay stuck:** the GM can press `Esc`.
- **Fonts:** Grenze and Cinzel are bundled in `fonts/` (SIL OFL 1.1); nothing is loaded from the internet.

## Releasing (maintainers)

Create a GitHub Release with a tag like `v1.0.0`. The workflow patches `module.json`, zips `module.json scripts templates styles fonts assets`, and uploads `module.json` and `module.zip` to the release.

See `CHANGELOG.md` for version history.

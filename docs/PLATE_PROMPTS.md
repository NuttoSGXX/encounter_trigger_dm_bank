# Still plates (artwork animated by code)

Drop one wide image per style into `assets/plates/`:

| Style | File (webp, jpg or png) |
|---|---|
| Magical | `assets/plates/magical.webp` |
| Dark Fantasy | `assets/plates/dark-fantasy.webp` |

Priority per style: **video plate > still plate > procedural FX**. Delete the file to go back.

What the code does with the image:
- **Magical:** dark screen, orbs and filaments collapse into a core, flash, the artwork blooms in with a slow push-in, ENCOUNTER emerges over it with glitter.
- **Dark Fantasy:** the artwork fades up through fog with a slow push-in, then a violent lunge zoom toward the creature, cut to black, blood, and ENCOUNTER with drips over a dimmed version of the artwork.

## Image requirements
- 16:9, at least 1920x1080, JPG/WebP, ideally under 1.5 MB.
- No text, logos, watermark, or UI in the image.
- Keep the **middle third of the frame, slightly below center, readable**: the title is drawn there (a soft dark shade is added behind it).
- Dark Fantasy: set `focus` for the lunge in `PLATES.dark.focus` in `scripts/main.js` as `[x, y]` fractions (0..1) of the image. It should point at the creature's face/eyes. Default `[0.6, 0.46]`.

## ChatGPT image prompts (copy/paste)
**Magical**
> Wide 16:9 cinematic fantasy illustration, painterly semi-realistic. A lone robed mage stands small at the bottom center amid ancient ruins, arms raised, summoning an explosion of many separate streams of magic in cyan, violet, magenta, emerald, gold and orange that spiral upward and outward from a brilliant white core above them; glowing orbs, floating rocks, sparks. Dark moody sky and ruined arches framing the edges. Keep the middle of the image bright but uncluttered. No text, no watermark.

**Dark Fantasy**
> Wide 16:9 dark fantasy horror illustration at night, cold desaturated blue-gray palette, thick fog, a pale moon behind tall dead reeds and a broken wooden fence, a ruined farmhouse in the distance. Two gaunt feral creatures with long claws emerge from the fog; one crouches in the middle of the frame facing the viewer with faint amber eyes. Oppressive, moody, photoreal-painterly. Red only as subtle blood details. No text, no watermark.

Iterate in ChatGPT until the composition is right (ask for "more empty space in the center" or "creature face closer to the camera" as needed).

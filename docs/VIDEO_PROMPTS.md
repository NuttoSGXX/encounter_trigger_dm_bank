# Prompt pack for the Magical and Dark Fantasy video plates

The module draws ENCOUNTER, the flavor bands, the dice and the combat on top. The video only needs to supply the **atmosphere and the moment of impact**. Keep the center of the frame calm after the cue so the title is readable.

General settings: 16:9, 1080p, 8 seconds, no text, no logos, no watermark, no subtitles, no people's faces. Use an image-to-video model and feed it your reference artwork as the first frame if the model supports it.

Sync rule: the **scene swap happens at the `switch` cue** (see `MEDIA` in `scripts/main.js`), so the video must be fully covered (white burst or black) around that second.

## Magical (default cues: switch 2.6 s, title 2.7 s, leave 6.2 s)
Reference: your multicolor arcane-explosion artwork.

Prompt:
> Cinematic dark background. Many separate streams of luminous magic in different colors (cyan, violet, magenta, emerald, gold) curve and spiral inward from all edges of the frame toward one central point, accelerating and overlapping, leaving thin glowing trails. At 2.5 seconds everything converges into a single blinding white-violet burst that fills the screen. After the burst the light dissolves into a slowly drifting field of tiny glittering sparks and soft colored mist on a dark violet background, with the center of the frame calm and dark. Semi-realistic painterly fantasy VFX, volumetric light, shallow depth of field, slow camera push-in, no text.

Negative / avoid: cartoon sparkles, rainbow gradient wash, lens-flare spam, characters, text.

## Dark Fantasy (default cues: switch 3.6 s, title 3.9 s, leave 7.0 s)
Reference: your moonlit swamp creature artwork.

Prompt:
> Night, cold blue-gray moonlight, thick fog, tall dead grass and reeds in the foreground, a ruined farmhouse far away. Slow handheld camera. The reeds are pushed apart by a clawed hand-like shadow, revealing two faint amber predatory eyes in the dark, which stay perfectly still for a moment. Then the creature lunges at the camera, the frame is filled by darkness and cuts to black at 3.5 seconds. After the cut: black frame with faint drifting fog and a few dark-red droplets mist, center of the frame empty and dark. Horror, desaturated black-gray palette, red only after the lunge, photoreal dark fantasy, no text.

Negative / avoid: gore close-ups, human faces, bright colors, text, subtitles.

## After you have a clip
1. Convert (see `assets/README.md`) and save as `assets/video/magical.webm` or `assets/video/dark-fantasy.webm`.
2. Open the launcher, pick the style and press **Preview**. Adjust the cues in `MEDIA` until the title lands where you want.
3. Commit the file (check the size first) and publish a new release; the workflow now ships `assets/`.

Check the license/terms of the generator you use before distributing generated clips inside a public module.

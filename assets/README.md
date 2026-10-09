# Grim Encounter – media plates

Drop pre-rendered videos here (`assets/video/`). If a file exists, its style plays the video instead of the procedural FX.

| Style | File |
|---|---|
| Default | `assets/video/default.webm` |
| Magical | `assets/video/magical.webm` |
| Dark Fantasy | `assets/video/dark-fantasy.webm` |

## Specs
- Container/codec: **WebM, VP9** (or VP8). `.mp4` (H.264) works in Chromium-based Foundry too, but then change the path in `MEDIA` in `scripts/main.js`.
- Resolution **1920x1080**, 24–30 fps, **6–9 seconds**, no audio needed (audio comes from the module's stinger setting).
- Target size under ~10 MB (VP9 `-crf 32`).
- The video must be **fully opaque** around the moment of the scene swap (see cue `switch`), because the GM's scene changes behind it.
- Leave the **center-lower third clear** around the title cue: the module draws `ENCOUNTER` and the flavor bands over the video.

## Cues (edit `MEDIA` in `scripts/main.js`)
All values are milliseconds from the start of the video:
- `switch` – scene is swapped (video should be covering the screen: flash, blackout, or full effect)
- `title` – `ENCOUNTER` appears on top of the video
- `leave` – video starts fading out
- `end` – overlay removed
- `dice` – initiative dice appear

## Convert any clip to the right format
```
ffmpeg -i input.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" -r 30 -an -c:v libvpx-vp9 -crf 32 -b:v 0 -t 8 magical.webm
```

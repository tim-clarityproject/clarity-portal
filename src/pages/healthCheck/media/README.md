# Quick guide media

The Health Check's Quick guide, with Tim's voice-over (65 seconds), rebuilt on 15 Nov 2026 to the approved M7b version 51 (Success Factors, the results in their new order, the bars with their words) with line 6 re-recorded:

- `quick-guide-desktop.mp4` (956 by 600) plays on laptops and tablets.
- `quick-guide-phone.mp4` (632 by 1056) plays on phones, chosen by the page's phone width (`PHONE_QUERY`).
- Each is H.264 at 30 frames a second with one mono AAC track at 48 kHz, its index first (faststart), at most 3.5 MB.
- `quick-guide.en-GB.vtt` is the one captions file for both: Tim's words exactly. The caption bar shows its lines as written. Line 6 reads "Then rate how much each one helps, one success factor at a time." (29.5 to 36.0 seconds).
- `quick-guide-desktop.jpg` and `quick-guide-phone.jpg` are each video's first frame, shown as its poster while it loads.

Nothing here is downloaded until the guide is opened (Watch on the welcome, the play icon, or the offer row on Your teams): the video has no source and no poster before then, so the page stays fast on a slow connection. The build copies each file as it is into `dist/assets`; none is put inside the page's code.

The inside Health Check has its own pair (follow-up 1, 16 Nov; the 28 Oct rule that the inside guide starts from the inside start screen): `quick-guide-inside-desktop.mp4` and `quick-guide-inside-phone.mp4`, with their posters, made the same way from M7 version 8.2's own animation (it opens on Your teams and plays in the Quick guide panel, on a laptop too), with the same voice track (line 6 included) and the same captions file. `GuidePanel` plays them when given `inside`.

## How they are made

`node scripts/make-quick-guide.mjs` rebuilds both videos and posters from their sources, using only what is already on a Mac (Node, the repo's Playwright, and macOS's `afconvert`, `sips` and `swiftc` with AVFoundation; it never downloads anything; tool paths can be given with `--afconvert`, `--sips`, `--swiftc`):

1. **Pictures**: the approved mock-up's own animation (M7b: `CAPS`, `SCN`, `TAPS`, `HOLD`, `simApply`), opened in Playwright's Chromium and drawn frame by frame at fixed times, every CSS transition held at the same moment. Desktop from the welcome's card (the screens drawn 820 wide), phone from the full-screen panel (390 wide), always light.
2. **Voice**: Tim's 65-second voice-over, with one line's caption slot (from this folder's VTT) silenced and the re-recorded line laid in at the caption's start. Its gain makes its loudness (ITU-R BS.1770, measured in `scripts/quick-guide/audio.mjs`) the median of the other lines'. Nothing outside the slot changes.
3. **Files**: `scripts/quick-guide/encode.swift` joins frames and voice into the MP4; the poster is frame one as JPEG.

```
node scripts/make-quick-guide.mjs \
  --mockup ~/Downloads/clarity-health-check-calm/m7b-health-check.html \
  --voice ~/Downloads/clarity-quick-guide/health-check-quick-guide-voice-over-final.m4a \
  --line 6 --new-line ~/Downloads/clarity-health-check-calm/quick-guide-line-6-success-factor-matched.m4a \
  --work <scratch folder>
```

It prints every line's loudness, where the new line lies, that the old line is gone, how closely the rest matches the source, and each file's size. Edit the captions by hand; the script never changes them. Then run `node tests/healthcheck/quick-guide.mjs all`.

The inside pair:

```
node scripts/make-quick-guide.mjs \
  --mockup ~/Downloads/clarity-health-check-calm/m7-health-check-inside.html \
  --start teams --player panel --name quick-guide-inside \
  --voice ~/Downloads/clarity-quick-guide/health-check-quick-guide-voice-over-final.m4a \
  --line 6 --new-line ~/Downloads/clarity-health-check-calm/quick-guide-line-6-success-factor-matched.m4a \
  --work <scratch folder>
```

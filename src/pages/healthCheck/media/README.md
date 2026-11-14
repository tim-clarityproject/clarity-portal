# Quick guide media

The Health Check's Quick guide, with Tim's voice-over (65 seconds):

- `quick-guide-desktop.mp4` (956 by 600) plays on laptops and tablets.
- `quick-guide-phone.mp4` (632 by 1056) plays on phones, chosen by the page's phone width (`PHONE` in `../parts.jsx`).
- `quick-guide.en-GB.vtt` is the one captions file for both: Tim's words exactly. The caption bar shows its lines as written.
- `quick-guide-desktop.jpg` and `quick-guide-phone.jpg` are each video's first frame, shown as its poster while it loads.

Nothing here is downloaded until the guide is opened (Watch on the welcome, or Quick guide on a step): the video has no source and no poster before then, so the welcome page stays fast on a slow connection. The build copies each file as it is into `dist/assets`; none is put inside the page's code.

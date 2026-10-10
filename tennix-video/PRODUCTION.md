Tennix Travel — Three checks before you book

60 seconds · 1920×1080 · 30 fps · English (UK)

Run `npm run dev` from tennix-video and select TennixTravel in Studio. Each scene also has its own editable timeline. Animations use Remotion frame timing; no external images or stock footage are used.

The supplied script, caption, newsletter copy and pending CTA URL are preserved in production.json. Original vector illustrations represent a person preparing a list, a calendar, accommodation and transport. Checked/Pending values are labelled as examples, not actual booking status.

The audio is an offline eSpeak NG guide voiceover, generated from the exact supplied script. Replace public/voiceover.wav with approved narration before release. The temporary TENNIX / TRAVEL text is not the official logo. Replace it with an approved official logo when supplied. CTA destination remains unconfirmed.

For an MP4 export when requested:
`npx remotion render src/index.ts TennixTravel out/tennix-travel.mp4 --browser-executable=/usr/bin/chromium --concurrency=2`

This project includes the editable composition and guide narration. No MP4 export is included.

# MAYBE × Layla · 30-second launch film (no voice)

Film: `deck/img/layla-demo.mp4` (1920×1080, 60 fps, 31 s, sound design, no voice).
Live: `/demo/layla/` plays the same animation in a browser (click to restart).

Layla (layla.ai) is the Berlin AI trip planner Expedia Group acquired in July 2026. The experience is built on a
role from Layla's public listings: Senior Growth Marketer (others seen: Sales Expert, Travel Curator, SEO Content Writer).

| Time | Beat |
|---|---|
| 0–3 | "Layla is hiring." Role roller lands on Senior Growth Marketer |
| 3–6.5 | Hard cut: 60 CVs fly in, "Every CV looks the same", a keyword scan drops all but two; the camera dives into a survivor |
| 6.5–9 | "Then round after round": stepped pan through six rounds, the violet dot hops each one |
| 9–11.5 | "What if they could just show you?" A CV flips into "Try the real job." |
| 11.5–12.9 | MAYBE. wordmark; the dot grows to fill the screen (impact) |
| 12.9–24.9 | Product, one candidate (Jonas): the Layla job card grows into the app → he builds the Italy launch campaign, publishes, results (Synthetic estimate), camera pushes onto his pitch → three ways to shine → each ad shrinks into its row on Layla's board, rows re-sort by the work, invite, "a person decided" |
| 24.9–27.6 | Value prop: "Why it beats normal hiring." Reads the CV / Keywords drop people / Round after round / Hires on a guess are struck out against Sees the work / Everyone gets to show it / One experience, at scale / Decides on evidence. "Not only motivated people. Creative problem solvers." |
| 27.6–31 | Violet wipe, MAYBE. impact, the dot lands, Try it. Prove it., "Let's pilot one role with Layla" |

Rebuild:
```bash
node tools/demo-video/cues.mjs > /tmp/cues.json                 # sound cues from the page
python3 -I tools/demo-video/music.py /tmp/cues.json /tmp/sound.wav 31
ffmpeg -i /tmp/sound.wav -af "loudnorm=I=-14:TP=-1:LRA=11,volume=-1.2dB" /tmp/sound-n.wav
node tools/demo-video/render.mjs deck/img/layla-demo.mp4 /tmp/sound-n.wav 60 31
```
Sound: A major at 120 bpm with a four-note hook (A5 C#6 E6 B5) that opens the film, plays on the
wordmark and resolves to A on the final dot. FM plucks, detuned-saw chords (A F#m D E), kick with click and
body, sidechain ducking, decorrelated stereo room, UI sounds snapped to the 16th grid, risers and silences
before the two impacts. -14 LUFS. Synthesized, no samples.

Honesty: mockup only, no partnership implied. Candidates, budgets, ad results and scores are simulated;
results carry "Synthetic estimate", scores "AI review".

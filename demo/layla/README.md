# MAYBE × Layla · 30-second launch film (no voice)

Film: `deck/img/layla-demo.mp4` (1920×1080, 60 fps, 32.6 s, sound design, no voice).
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
| 12.9–14.5 | "Any role you hire for becomes an experience.": Layla's open roles (Sales Expert, Travel Curator, SEO Content Writer, Senior Growth Marketer) plus "+ Any role"; Growth Marketer is picked |
| 14.5–26.5 | Product, one candidate (Jonas): the Layla job card grows into the app → he builds the Italy launch campaign, publishes, results (Synthetic estimate), camera pushes onto his pitch → three ways to shine → each ad shrinks into its row on Layla's board, rows re-sort by the work, invite, "a person decided" |
| 26.5–29.2 | Value prop: "Why it beats normal hiring." Reads the CV / Keywords drop people / Round after round / Hires on a guess are struck out against Sees the work / Everyone gets to show it / One experience, at scale / Decides on evidence. "Not only motivated people. Creative problem solvers." |
| 29.2–32.6 | Violet wipe, MAYBE. impact, the dot lands, Try it. Prove it., "Let's pilot one role with Layla", "Sales, curation, content, growth: you pick the role." |

Rebuild:
```bash
node tools/demo-video/cues.mjs > /tmp/cues.json                 # sound cues from the page
python3 -I tools/demo-video/music.py /tmp/cues.json /tmp/sound.wav 32.6
ffmpeg -i /tmp/sound.wav -af loudnorm=I=-15:TP=-1.5 /tmp/sound-n.wav
node tools/demo-video/render.mjs deck/img/layla-demo.mp4 /tmp/sound-n.wav 60 32.6
```
Sound: the v2 sound the team picked, built from the deck's own recipes (assets/careers.js): soft sine plucks
in a small room, filtered air, rises, the arrival chord, plus a light 120 bpm beat (quiet under the problem, full
under the product). Synthesized, no samples.

Honesty: mockup only, no partnership implied. Candidates, budgets, ad results and scores are simulated;
results carry "Synthetic estimate", scores "AI review".

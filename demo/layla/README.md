# MAYBE × Layla · 30-second launch film (no voice)

Film: `deck/img/layla-demo.mp4` (1920×1080, 60 fps, 30 s, sound design, no voice).
Live: `/demo/layla/` plays the same animation in a browser (click to restart).

Layla (layla.ai) is the Berlin AI trip planner Expedia Group acquired in July 2026. The experience is built on a
role from Layla's public listings: Senior Growth Marketer (others seen: Sales Expert, Travel Curator, SEO Content Writer).

| Time | Beat |
|---|---|
| 0–3 | "Layla is hiring." Role roller lands on Senior Growth Marketer |
| 3–7 | 60 CVs fly in, "Every CV looks the same", a keyword scan drops most of them |
| 7–9 | "Then round after round": a whip pan through six hiring rounds |
| 9–11 | "What if they could just show you?" A CV flips into "Try the real job." |
| 11–13 | MAYBE. wordmark; the dot expands into the violet ground |
| 13–24 | Product: the Layla job card → ads manager (objective, Italy audience, budget, ad creative, publish, results with Synthetic estimate label, candidate pitch) → three candidates' creatives → Layla's board re-sorts by the work, invite |
| 24–27 | Wall of experience runs: "Not only motivated. Creative problem solvers." |
| 27–30 | MAYBE. · Try it. Prove it. · Let's pilot it with Layla. |

Rebuild:
```bash
node tools/demo-video/cues.mjs > /tmp/cues.json                 # sound cues from the page
python3 -I tools/demo-video/music.py /tmp/cues.json /tmp/sound.wav 30.4
ffmpeg -i /tmp/sound.wav -af loudnorm=I=-15:TP=-1.5 /tmp/sound-n.wav
node tools/demo-video/render.mjs deck/img/layla-demo.mp4 /tmp/sound-n.wav 60 30.4
```
Sound uses the deck's own recipes (assets/careers.js): pentatonic sine plucks in a small room, filtered air,
rises, the arrival chord, plus a light 120 bpm beat. Synthesized, no samples.

Honesty: mockup only, no partnership implied. Candidates, budgets, ad results and scores are simulated;
results carry "Synthetic estimate", scores "AI review".

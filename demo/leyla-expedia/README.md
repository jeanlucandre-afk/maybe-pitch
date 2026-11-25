# leyla.ai × Expedia · 30-second MAYBE demo

Video: `deck/img/leyla-expedia-demo.mp4` (1920×1080, 30 fps, 30 s, voice + music).
Live page: `/demo/leyla-expedia/` (plays the same animation in the browser on a loop; click to restart).

| Time | Scene | Voice |
|---|---|---|
| 0–5.5 | Every channel sends a CV (LinkedIn, hackathons, campus fairs, job boards, referrals) | Expedia's candidates come from everywhere… |
| 5.5–9.8 | A screener reads the CV, then round after round | A screener reads the CV. Then, round after round. |
| 9.8–12.9 | Dark question: what if the right person never gets through? | same |
| 12.9–15.4 | We put an experience in between (CV → try the real job → interview) | MAYBE puts an experience in between. |
| 15.4–22.6 | Product on violet: 1 the Expedia Junior Product Analyst experience, 2 three candidates solve it their own way, 3 Expedia's candidate board, invite to interview | Anyone can try the real job… Expedia sees the work, not just the CV. |
| 22.6–26.3 | Not only motivated people. Creative problem solvers. | same |
| 26.3–30 | MAYBE. wordmark · Try it. Prove it. · Let's pilot one role. | leyla.ai and Expedia. Let's pilot one role. |

Rebuild after editing `index.html`:
```bash
python3 -I tools/demo-video/music.py /tmp/music.wav        # music bed (synthesized, no licences)
node tools/demo-video/shoot.mjs /tmp 3 17 23 29            # stills to check
node tools/demo-video/render.mjs deck/img/leyla-expedia-demo.mp4 <mix.wav>
```
The voice was generated with OpenAI TTS (gpt-4o-mini-tts, voice "coral") and mixed with the music bed in ffmpeg
(voice sped up 1.15×, music ducked under it). The voice is AI-generated.

Honesty: Expedia and leyla.ai appear as the pilot target; mockup only, no partnership implied. Candidates,
data and scores are simulated; scores carry the "AI review" provenance label.

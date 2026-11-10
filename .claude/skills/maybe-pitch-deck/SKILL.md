---
name: maybe-pitch-deck
description: Build a new presentation in the MAYBE brand (maybe.center - students try real work from real companies before they choose; employers see the work, not the CV), with the exact look, voice, motion and touches of the Macromedia × CODE Hackathon 2026 deck (https://maybe-pitch.vercel.app) - white and near-black slides, the one violet #7C3AED, Geist / Geist Mono, giant "MAYBE." wordmark, walking-crowd and pictogram stats, the intro video, the live call with Mara, the 2x product walkthrough. Use for any MAYBE pitch, investor deck, school or parent presentation, partner deck, demo day or update deck. For any other brand use cinematic-pitch-deck.
---

# MAYBE pitch deck

This skill is the MAYBE brand on top of the `cinematic-pitch-deck` engine. Read that skill's `SKILL.md`
and references too (it sits next to this folder: `../cinematic-pitch-deck/`); this file only adds what is
MAYBE-specific. The brand gate is already passed: the MAYBE brand below is approved. You still confirm
**the audience, the goal and the beat sheet** with the person before building.

| File | What |
|---|---|
| `brand/maybe.css` | The brand preset: replaces the engine's `template/assets/brand.css`. |
| `brand/deck.json` | Starter deck.json with the Geist fonts. |
| `brand/intro.mp4` | The real title intro (MAYBE wordmark), 0.5 MB. |
| `brand/peep-*.svg` | Open Peeps (CC0) drawn people: student, seller, designer, recruiter, thinker. |
| `references/brand.md` | Colours, type, voice, honesty rules, imagery, what never to say. |
| `references/hackathon-deck.md` | The original deck slide by slide: copy, numbers, sources, timing, notes. Precedent for every new MAYBE deck. |
| `references/canvas-workflow.md` | Working inside the maybe-pitch repo with the MAYBE Final design canvas (Luc's flow). |

## Before anything
- Call Brain `find` for "MAYBE" to get the current state (pilot, partners, numbers, decisions). The brand
  and facts move; the brain is newer than this file. Do not reuse a number from the hackathon deck without
  checking it is still the latest and its source still holds.
- Ask (only what you can't infer): who is in the room (jury, investors, schools, parents, employers), how
  long, live demo or not, presenters' names, event name and date.

## Build a new MAYBE deck
```bash
cp -r <skills>/cinematic-pitch-deck/template ./deck && cd deck
cp <skills>/maybe-pitch-deck/brand/maybe.css assets/brand.css
cp <skills>/maybe-pitch-deck/brand/deck.json deck.json        # then add slides
mkdir -p media && cp <skills>/maybe-pitch-deck/brand/intro.mp4 media/ && cp <skills>/maybe-pitch-deck/brand/peep-*.svg media/
```
Then follow the engine workflow from step 2 (story) using `references/hackathon-deck.md` as the default
beat sheet. Adapt the arc to the audience:
- **Jury / demo day:** the full hackathon arc (question → gap → cost → other side → screening → AI vs AI →
  real people → turn → title → live call → careers → agent world → walkthrough → market → Europe → callback → close).
- **Investors:** shorten the problem to 4 slides, add the business slide ("Free to explore. Paid by employers
  who want proof.") and why now; the walkthrough replaces the live call if there is no microphone.
- **Schools and parents:** lead with the student question and the experience gap; drop the screening and
  market slides; show the student side of the walkthrough; close on "Try it. Keep the proof. Get seen."
- **Employers:** lead with the other side and the screening; show the employer board and candidate evidence;
  "A screener reads the CV. You see the work."

## MAYBE details that must be there
- Black pre-show slide first (not counted). Progress line in violet.
- Dark question slides use `--accent-on-dark` #C4B5FD for the accent word; light slides #7C3AED.
- The eyebrow on the title: `Event name` in #5B21B6 · year in #71717A, Geist Mono 24px.
- Wordmark `MAYBE` + violet full stop: 506px on the title, 360px on the close.
- Taglines: "Try real work before you choose it." (title), "Try it. Prove it." (close),
  "AI creates the chance; people make the decision." (thesis, in notes or the conclusion slide).
- The walkthrough (in the maybe-pitch repo: `deck/img/walkthrough.mp4`, re-record with
  `tools/walkthrough/record.mjs`) plays at 2x on the violet ground, and once more after the close.
- People are Open Peeps or person icons, never photos of people.

## Never (from the brand and the team's rules)
- Never call MAYBE a career test, personality typing or "AI that knows you".
- No invented numbers, prices, user counts, pilots or testimonials. Pricing and ROI "are not set yet; pilots will test them".
- Companies (DICE, Dr. Lipp, Spotify…) are examples: "mockup only, no partnership implied".
- Every score shows its provenance: Rule-based, Synthetic estimate or AI review; the deal outcome stays separate.
- Label AI-generated images; simulated agents say they are AI.
- No exclamation marks, no emoji, sentence case, no violet gradients or violet backgrounds (except the
  full-bleed walkthrough ground).

## After
Save to Brain (src "claude"): a Timeline line on the MAYBE page saying which deck was made, for whom, and where it lives.

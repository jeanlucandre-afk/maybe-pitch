# Motion

Motion is the deck's pacing. It replays every time a slide opens (the runtime re-adds `.anim-on`), it is
paused on hidden slides, and it stops entirely under `prefers-reduced-motion`.

## The rules
1. **Reading order.** Elements appear in the order they should be read: headline → visual → number → meaning → source.
2. **Claim before proof.** The headline lands first (0.05-0.4s); the number that proves it comes after the
   visual has done its job (crowd: highlight at ~3s; bar: 1.6s).
3. **One house curve:** `cubic-bezier(.2,.7,.2,1)`, fast start, long soft landing. Springs only for small
   things (`pop`) and drawn characters (`rise`).
4. **Stagger, don't sync.** Siblings 0.05-0.2s apart; rows 0.5s apart; the punchline 1-2s after the setup.
5. **Slide transition is a plain 0.35s cross-fade.** All the energy is inside the slide.
6. **Loops are slow and quiet** (sway 7s, feed 18s, drift 9s) so the presenter can talk over them.
7. Every duration and delay is multiplied by `--spd` (1 normal, 1.5 slow, 0.6 fast) set on `.slide-root`.

## Library (`template/assets/motion.css`)
Add the class and a delay in seconds: `<h2 class="h-1 rv" style="--d:.4">`.

| Class | What | Duration | Use for |
|---|---|---|---|
| `rv` | fade + rise 22px | .7s | every text block (default) |
| `fin` | fade + rise 40px + scale .97→1 | .9s | phones, frames, screenshots, live demo frames |
| `rise` | spring up from below the edge, slight rotation, overshoot | .8s | a drawn character entering from the bottom |
| `grow` | scaleX 0→1 from the left | .9s | bars, timeline lines |
| `growy` | scaleY 0→1 from the baseline | 1s | vertical chart bars |
| `pop` | scale .4→1 with a little spring | .5s | dots, pictogram icons, the deadline dot |
| `draw` | SVG stroke draws (`pathLength="1"`) | 1.4s | arrows, underlines, line charts |
| `drift` | slow Ken Burns | 9s loop | background photo |
| `shot` | tall screenshot scrolls down and back | 14s loop | a page in a frame |
| `walker` (`<x-crowd>`) | walk in from the right with a bob, then turn accent | 2.1s + highlight at ~2.9s | people stats |
| `hero-post` | flies in from the camera, settles at -1.5° | 1s | the viral post |
| `petal` | flies in from depth along `--fx/--fy`, then sways | 1.3s + 7s loop | phones around the post |
| `feed` | 4 cards, each holds ~4.5s, slides up | 18s loop | phone story feed |
| intro (`[data-intro]`) | black → video plays over the title → fades on its last frame | video length | title |

## Timing table from the MAYBE deck (copy these)
| Slide | Choreography |
|---|---|
| Question | headline .40 |
| Crowd | headline .05 · walkers .25-1.4 (wave left→right, row by row) · highlight 2.9-3.3 · bar row 1.6, bar grows 1.75 |
| Pictograms | headline .05 · row 1 .40 (icons .50 + .05 each) · row 2 .90 (icons 1.00 + .05 each) |
| Twist | lede .10 · assumption .90 · "Right?" 2.00 |
| Feed | headline .05 · numbers .40 / .60 · phone .20 · feed starts 1s, loops 18s |
| Flower | hero clip .35 · post 0 · petals .8, .9, 1.0, 1.1 |
| Turn | lede .10 · "What if" 1.00 |
| Market | headline .05 · bars grow .30/.45/.60 · labels .80/.95/1.10 · proof 1.0-1.45 |
| Timeline | headline .05 · grey line .30 · ink line .50 · today .40 · deadline 1.20, dot pops 1.30 · chips 1.6-1.84 · sentence 2.0 · caveat 2.2 |
| Callback | question .20 · mirror 1.40 |
| Close | old world .10 · new world .80 · wordmark 1.60 · tagline 2.20 |

## Writing a new effect
Add a `@keyframes` + `.anim-on .your-class { animation: … calc(var(--d,0) * 1s * var(--spd)) both; }` to
motion.css, add it to the reduced-motion block, and give its resting state without `.anim-on` the final frame
(so the slide looks right if motion is off). For an effect driven by JavaScript (e.g. an audio-reactive orb),
use one `requestAnimationFrame` loop that runs only while its slide is active (listen to `deck:slidechange`),
ease every value (never jump), and advance waves by accumulated phase so speed changes never restart them.

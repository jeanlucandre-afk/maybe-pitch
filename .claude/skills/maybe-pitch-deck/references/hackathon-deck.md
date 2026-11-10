# The hackathon deck, slide by slide

Macromedia × CODE Hackathon 2026, presented by Boris and Luc. Live: https://maybe-pitch.vercel.app.
Source boards: `src/SlideNN.dc.html` in github.com/jeanlucandre-afk/maybe-pitch. Engine pattern numbers refer
to `cinematic-pitch-deck/template/slides/`. Numbers below were checked in November 2026; re-check before reuse.

| # | Board | Ground | On the slide | Visual and motion | Speaker note (short) |
|---|---|---|---|---|---|
| – | 00 Black | black | nothing | – | Pause on black, then press next. |
| 1 | 00a The question | dark | "How are you supposed to know what you want to do with your life if you've never actually **tried** doing it?" 104px | reveal .4s [01] | Let the question land. Don't answer it. |
| 2 | 00b The experience gap | light | "Only **26 in 100** graduates are on their ideal career path." + "What holds them back most: lack of experience 66.8%" | 100 walking people, 26 turn violet; bar grows [02] | ZipRecruiter 2026 survey of recent U.S. graduates; 66.8% name lack of experience. |
| 3 | 00c The human cost | light | "Graduating doesn't mean knowing where you're **going**." 51.2% call their job a stepping stone · 64% worry about money every day or week | pictogram rows [03] | Almost one in five took a bridge job; UK: 29% mental-health difficulties. Pressures, not proof of cause. |
| 4 | 00d The other side | dark | "And those who already know what they want, with the skills to do it?" / "Surely they get the chance to prove themselves." / "**Right?**" | twist timing [04] | Pause before "Right?". |
| 5 | 00e The screening | light | "What if the right person never gets **through**?" 81% rejected without speaking to a person · 40,000 more applications from Black and Asian candidates would have advanced | pictograms + 1-in-100 dot grid | Greenhouse Candidate Survey Oct 2026; Stanford 2026, ~4M applications: estimated recommendations, not proven missed hires. |
| 6 | 00e2 AI vs AI | light | "Applicants use AI to apply. Companies use AI to **reject**." 11,000 applications on LinkedIn every minute · 1 in 5 companies let AI reject with no human review | phone feed: AI interviewer glitch (@its_ken04), team lead rejected by own company in 6 minutes, Mobley v. Workday [05] | LinkedIn via NYT June 2025; Resume Builder survey of 948 leaders, 2024. |
| 7 | 00e3 Real people | light | no text | viral X post centre, 7 TikToks fly in as a 3D flower, first with sound [06] | The React vs React.js story. Individual accounts, not typical cases. |
| 8 | 00f The turn | dark | "Some never got the chance to discover what they can do. Others never get the chance to show it." / "What if we used AI to **create opportunities**, instead of only filtering applications?" | [07] | Next slide: MAYBE. |
| 9 | 01 Title | light | Macromedia × CODE Hackathon · 2026 / **MAYBE.** / Try real work before you choose it. / By Boris & Luc | intro video over black, fades to the title [08] | "Hi, we're Boris and Luc…" Companies are examples, not partners. Say the approach to Mara here: the mic is live on the next slide. |
| 10 | 05b Live call | light | orb, bubbles, Mara "Potential buyer · AI" | live voice call (OpenAI Realtime); demo script without connection | "Now let's call a buyer for real." |
| 11 | 05b2 Careers | light | "Try the job before you choose it." roller of careers → UX/UI Design → DICE design editor | curtain, highlight walks 5 companies | Every trial is simulated. |
| 12 | 05c Agent world | light | "A market reviews your call." What worked · What didn't · Qualifications found · Where the market stands | ball of simulated agents argue, then decide | Synthetic estimate, kept apart from the real deal outcome. |
| 13 | 05d Walkthrough | violet | full-bleed video 2x | [10] | Marketplace → Dr. Lipp trial → call Bettina → log in CRM → AI review with sources → best sale on the board → invite. |
| 14 | 10a The market | light | "A **$5.1B** market, set to almost double." $4.8B 2025 · $5.1B 2026 · $9.6B 2035 (7.2%/yr) · 55.7% get too many unqualified applicants · 34.6% want skills assessments | bars grow [11] | AI recruitment software estimate; iHire survey. $34B/$71B are separate categories, not our market. |
| 15 | 10c Europe | light | "Europe will ask hiring AI to **show its work**." Today Nov 2026 → 2 Dec 2027 high-risk rules apply; Transparency · Risk management · Human oversight · Fair outcomes; "MAYBE is built on evidence a person can read and review." | timeline [12] | EU AI Act. Not a compliance claim; our own evaluations may be high-risk too. |
| 16 | 12 Back to the start | dark | "How do you know what you want, if you've never **tried** it?" / "How can employers see your potential, if you never get to **show** it?" | [13] | Same question as the opening. |
| 17 | 13 Try it. Prove it. | light | "Technology has long helped companies decide who deserves a chance." / "We're building technology that gives more people the chance to prove themselves." / **MAYBE.** / Try it. Prove it. | [14] | Thank you. |
| 18 | 05d copy | violet | walkthrough again | loops during Q&A | – |

Parked boards worth reusing for other audiences:
- 05e Employer side: "A screener reads the CV. You see the work." (animated cursor through the employer board, 16s loop).
- 05f Conclusion: "Try it. Keep the proof. Get seen." / "Students choose with experience. Employers hire on evidence. AI creates the chance, people make the decision."
- 10b Why now: "More applicants. Fewer recruiters. A shift to skills." 244 applications per job (Greenhouse customers, more than double 2022); 70% of employers hire on skills (NACE 2026).
- 10d The business: "Free to explore. Paid by employers who want proof." Pricing and hiring ROI are not set yet; pilots will test them.

## What made it work (keep these)
1. It opened on a question to the audience, on black, and closed on the same question.
2. Every statistic was a picture: people walking in, icons filling, bars growing, a deadline dot.
3. One violet, one highlighted word, and that word was the one said louder.
4. Real people on real phones before any claim about the product.
5. The product was live in the room (a voice call the jury could hear), with the recorded walkthrough as
   proof and fallback.
6. Every number had a source and an honest caveat; every company was an example; every AI was labelled.
7. Controls hidden, notes on P, deep links per slide, loads from one URL.

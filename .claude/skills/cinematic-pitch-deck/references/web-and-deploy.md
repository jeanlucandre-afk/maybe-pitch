# On the web: one GitHub repo + one Vercel project per deck

The deck is a website: static `index.html` + `media/` + `app/` + Vercel functions in `api/` for the live demos.
Every push to `main` deploys production; every other branch gets a preview URL. Same setup as
maybe-pitch.vercel.app.

## 0. Before creating anything
- Ask the person: repo name (default `<brand>-pitch`), GitHub owner (user or org), public or private
  (private if the deck has unreleased numbers; public repos expose every file), Vercel team.
- Run `node tools/check.mjs`; fix every blocking item first.

## 1. GitHub repo
**Laptop (gh logged in):**
```bash
git init -b main && git add -A && git commit -m "Deck: first version"
gh repo create <owner>/<name> --private --source . --push
```
**Claude Code cloud:** if the session's GitHub tools may create repositories (a `create_repository` tool that the
session rules don't forbid), create it there. Otherwise ask the person to create an EMPTY repo on github.com
(no README), attach it with `add_repo` (access "push"), add it as the remote and push:
```bash
git init -b main && git add -A && git commit -m "Deck: first version"
git remote add origin https://github.com/<owner>/<name>.git && git push -u origin main
```
If the session must stay on its own branch, push that branch and tell the person to merge it into `main`.

## 2. Vercel project linked to the repo
**With the Vercel connector (cloud or laptop):** find the team (`list_teams`), then `create_git_project`
with `repo: "<owner>/<name>"` and that `teamId`. No build settings: Vercel serves the folder and turns `api/*.js`
into functions. It creates a first preview; production follows the first push to `main`.
**Laptop CLI alternative:** `npx vercel@latest link` then `npx vercel@latest git connect`.

The Vercel GitHub app must have access to the repo (Vercel asks for it the first time).

## 3. Environment variables (names in chat, values never)
| Name | Needed for | Where the value comes from |
|---|---|---|
| `OPENAI_API_KEY` | live voice call, agent panel | platform.openai.com → API keys (a project key with a spend limit) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | live audience poll that works across Vercel instances | Vercel → Storage / Marketplace → Upstash Redis → connect to the project (sets them itself) |
| `DECK_ORIGINS` | only with a custom domain | `https://pitch.example.com` |
| `OPENAI_*_MODEL` | optional model overrides | see `.env.example` |

Tell the person exactly: "In Vercel → <project> → Settings → Environment Variables add `OPENAI_API_KEY` for
Production and Preview, then redeploy." Never ask them to paste a key into chat; never pass a key to
`create_project_env` yourself. Locally: copy `.env.example` to `.env` (gitignored).
Claude Code cloud: if `api.openai.com` is listed as a proxy-injected credential, `tools/serve.mjs` sets a
placeholder key and the proxy adds the real one; otherwise ask for it with `request_credential` (host
`api.openai.com`). Neither configures Vercel: the person still adds `OPENAI_API_KEY` there.

## 4. Verify the live site
1. `list_deployments` (or the Vercel dashboard): the deployment is READY.
2. Open `https://<project>.vercel.app/api/health`: `openai: true` (and `pollStore: true` if the poll is used).
3. Step through the deck on the URL: videos autoplay, the title intro plays, the voice slide says
   "Live · … is listening" (allow the microphone), the agent panel says "Live review", the poll says
   "Live · scan to vote", and a phone can vote at `/vote`.
4. Preview deployments may be behind Vercel login (Deployment Protection). For a jury or a partner, use the
   production URL, or turn protection off for previews.

## 5. Updating
Edit `slides/`, run `node build.mjs && node tools/check.mjs`, commit, push. `index.html` is generated but
committed (Vercel serves it as is; no build step).

## Autoplay rules browsers enforce
- Videos autoplay only when `muted` + `playsinline`. Every deck video is muted; sound comes from the presenter
  or from one TikTok clip with `data-sound`.
- Audio from the voice agent needs one user gesture on the page: pressing → to reach the slide counts.
- The microphone needs HTTPS (Vercel) or localhost.

# Images and characters (Codex first, then the OpenAI API)

`tools/media/gen-image.mjs` makes every generated image in one style:
1. **Codex CLI** (`codex exec`, sandboxed to the deck folder) using its built-in image generation, paid by the
   person's ChatGPT/Codex plan credits.
2. If Codex is not installed, not logged in, has no image tool, is out of credits or makes no file →
   **OpenAI Images API** with `OPENAI_API_KEY` (from the environment or `.env`; in Claude Code cloud the proxy
   injects it). Models: `gpt-image-2` (default), `gpt-image-1.5` for transparent cut-outs (gpt-image-2 has no
   transparent background).

It prints which engine ran (`codex: codex out of credits → api: ok`) and records every image in
`media/ai-images.json`. `tools/check.mjs` fails if a slide uses one of them without an "AI-generated" label.

## Step 1: lock the style at the brand gate
Write `media/image-style.txt` (2-4 sentences) from the brand brief: medium, line, colour, detail, mood, what
never to show. Examples:
- MAYBE: "Hand-drawn line illustration in the style of Open Peeps: confident black ink outlines, flat white fills,
  no shading, minimal detail, friendly."
- A fintech: "Matte 3D clay objects on a plain #F4F1EA ground, soft top light, one accent colour #0F766E, no people."
Generate 2-3 test images and show them with the brand board for approval.

## Step 2: generate
```bash
node tools/media/gen-image.mjs --name caller --prompt "a retail buyer with a headset, waist up, facing left" --size 1024x1536 --transparent --webp
node tools/media/gen-image.mjs --name hero --prompt "a festival stage at dusk seen from the crowd" --size 1536x1024 --quality high --webp
node tools/media/gen-image.mjs --name caller-happy --ref media/caller.png --prompt "same person, smiling, nodding" --transparent --webp
```
- Characters that rise from the bottom edge: waist-up, transparent, `1024x1536`, facing into the slide.
- Use `--ref` for every later pose of the same character, so it stays the same person.
- `--quality low` for drafts (cents), `medium` default, `high` for the final hero images.
- `--engine api` skips Codex (faster in the cloud where Codex isn't installed); `--engine codex` never spends API credit.
- Install Codex on a laptop: `npm i -g @openai/codex` then `codex login` (ChatGPT plan).

## Rules
- One style per deck. Never photoreal people pretending to be real people; never real people's likeness.
- No logos or text baked into images: overlay them in HTML.
- Label: `<span class="ai-label">AI-generated image</span>` on the slide (bottom right of the image).
- Keep files small: `--webp` (≈200 KB for a 1024x1536 character).
- Look at every image before using it (open the PNG). Regenerate rather than ship a broken hand or a face that
  doesn't match the brand.

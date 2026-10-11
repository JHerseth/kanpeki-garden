# Art

All of the garden's pictures were made with AI image generation: OpenAI's image tools in ChatGPT. They were not drawn by hand. Scripts in this repo then cut, clean, scale and pack them for the game.

## Which files

| Path | What it is |
|---|---|
| `art/sprites.png` | The sprite sheet: every shop item as one picture |
| `art/background.jpg` | The garden map: the home map, 「わたしのにわ」 |
| `art/maps/<key>.png` | The other maps: `riverside.png` (「かわべの はらっぱ」) and `waterfall.png` (「たきの たかだい」), 1672 × 941 (Git LFS) |
| `art/stages/<key>.png` | One plant's life cycle as a strip of five frames: sprout, young, mature, dying, dead (Git LFS) |
| `art/stages/sheet40.png` | An earlier sheet of 40 plants; some new plants' prompts use its frames as a reference (Git LFS) |
| `art/stages/old/` | Earlier versions of a few strips, and an earlier sheet of trees used as a reference (Git LFS) |
| `art/decor/<key>.png` | A decoration drawn on its own, such as the bench, and `sign.png`, the signpost at the exits between maps (Git LFS) |
| `art/removed/<key>.png` | Backups of items taken out of the shop, cropped from the sprite sheet by the build |
| `media/_garden_sprites<n>.webp`, `media/_garden_bg.webp`, `media/_garden_bg_<key>.webp` | The built media, made from the files above by `scripts/build_assets.py` |

## How it was made

1. **Generation.** Each picture was generated with OpenAI's image generation in ChatGPT. The prompts for the stage strips are in `art/tools/prompts/`: `plants.py` lists every plant with its description and stage overrides, and `build.py` turns them into one prompt per plant. It also saves a reference image of the plant (its current sprite, or its mature frame on an earlier sheet) to attach with the prompt, and writes a page that lists the prompts with their references (`page.html` is its template). Each prompt asks for a 1536 × 1024 strip of five frames on a transparent background, in pixel art matching an attached style reference sheet, with the mature frame looking like the attached reference. The other maps were made with one prompt, with `art/background.jpg` attached as the style reference: it's in `art/tools/prompts/maps.md`, with each map's theme. The prompts for the sprite sheet, the background, the bench and the signpost are not in the repo.
2. **Cut and clean.** `scripts/build_assets.py` reads the source art. It splits the sprite sheet into one sprite per item, separating sprites that touch along the sheet's rows or set cuts. It splits each strip into its frames by their largest shapes, and gives loose petals and leaves to the nearest frame. Faint glow haze around the strips and decorations (alpha below 40) is cleared; the signpost, drawn opaque but with a glow, is made fully opaque at alpha 128 and up, and cleared below. Frames are anchored at the soil line, the hanger's hook or the signpost's foot, and all frames of a plant are scaled together to match its size on the sprite sheet (by pot width for potted plants, or like a similar plant when it has no sheet sprite).
3. **Pack.** The same script packs all frames into WebP atlases (`media/_garden_sprites<n>.webp`), converts the background to `media/_garden_bg.webp`, scales each other map to 2000 px wide and cuts it to 2000 × 1116 about its middle (`media/_garden_bg_<key>.webp`), so every map matches the home map's size and scale, and writes the frame positions to `catalog.js`.

The helper scripts in `art/tools/` (`frames.py`, `gallery.py` with `gallery.html`, `scene.py` with `garden_mockup.html`) only display the art for checking; they change none of it.

Many of the source PNGs still carry the C2PA "Content Credentials" that OpenAI embeds, which record ChatGPT (`gpt-image`) as the tool that created them. The built WebP files do not carry them.

## Licence

The art (every file listed above, source and built) is under the same MIT licence as the code: see [`LICENSE`](LICENSE).

## OpenAI's terms

Checked on 2026-10-11 (read from Wayback Machine snapshots of 2026-10-08 to 10-11, because openai.com refused automated requests):

- **[Terms of Use](https://openai.com/policies/terms-of-use/)** (effective January 1, 2026) and **[Europe Terms of Use](https://openai.com/policies/eu-terms-of-use/)** (updated January 16, 2026, for the EEA, Switzerland and the UK) say the same under *Content → Ownership of content*: "As between you and OpenAI, and to the extent permitted by applicable law, you (a) retain your ownership rights in Input and (b) own the Output. We hereby assign to you all our right, title, and interest, if any, in and to Output." We found no clause in these terms that restricts redistributing or licensing Output.
- *Similarity of content* in both: Output "may not be unique and other users may receive similar output", and the assignment "does not extend to other users' output".
- Both forbid representing "that Output was human-generated when it was not". This file is the disclosure.
- The **[Sharing & publication policy](https://openai.com/policies/sharing-publication-policy/)** (updated November 14, 2022), which the Terms of Use ask users to follow, asks that shared content be attributed to the person who made it and marked as AI-generated "in a way no user could reasonably miss or misunderstand". `LICENSE` names the author, and this file and the README say the art is AI-generated.

So OpenAI assigns whatever rights it has in the images, and nothing we found in these terms stops them from being released under MIT. Two limits remain. In many places, purely AI-generated images may have little or no copyright of their own, so the MIT licence covers only the rights that exist. And OpenAI makes no promise that the images are unique.

This is a reading of the terms, not legal advice.

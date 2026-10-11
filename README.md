# Kanpeki Garden

A small garden game that lives inside Anki cards. Each card the player answers in AnkiDroid's study screen pays one coin a day; coins buy flowers, vegetables, trees and decorations for a pixel-art garden. Plants grow on days with reviews, wilt after two days without, and die after four; a vacation switch freezes everything.

The UI is in Japanese (kana), written for young learners.

## Layout

| Path | What it is |
|---|---|
| `garden.js` | The game: one plain-JavaScript file, no dependencies |
| `catalog.js` | Generated item data (names, prices, frames) |
| `scripts/build_assets.py` | Builds `media/` from `art/`: the sprite atlas, the background and `_garden.js` |
| `art/` | Source art: the sprite sheet, background, stage-art strips and decorations (strips and decorations in Git LFS) |
| `art/tools/` | Helper pages and scripts for making and checking the art |
| `tests/` | Node tests with a small fake DOM |
| `LICENSE` | MIT licence, code and art |
| `ART.md` | How the art was made |

## Build

```sh
python3 scripts/build_assets.py        # everything: atlas, background, catalog.js, media/_garden.js
python3 scripts/build_assets.py --js   # only media/_garden.js, after editing garden.js
```

Needs Python 3 with Pillow and NumPy, and `git lfs pull` for the art.

## Test

```sh
node --test tests/*.test.js
```

## Use it in a card

Copy `media/_garden.js`, `media/_garden_sprites1.webp` and `media/_garden_bg.webp` into the profile's `collection.media` folder, then add this to the back template of every card type that should pay coins:

```html
<div id="kg" data-kg="garden" data-card="{{CardID}}"></div>
<script src="_garden.js"></script>
```

In AnkiDroid, turn on Settings → Advanced → "localStorage in Study Screen"; the garden keeps its save there, on the phone. See the header of `garden.js` for the slot's options.

## Licence

MIT, for the code and the art alike: see [`LICENSE`](LICENSE). The art was made with AI image generation; [`ART.md`](ART.md) says how and which files it covers.

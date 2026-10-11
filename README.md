# Kanpeki Garden

A small garden game that lives inside Anki cards. Each card the player answers in AnkiDroid's study screen pays one coin a day; coins buy flowers, vegetables, trees and decorations for a pixel-art garden. Plants grow one stage for each day with reviews (the day they're planted too), wilt after two days without, and die after four; a vacation switch freezes everything.

The garden has three maps: the player's own garden, a riverside meadow and a waterfall plateau. A map's signpost is its key: the shop's とち ("Land") tab sells the riverside meadow's sign for ¤500, then the waterfall plateau's for ¤1000, and the home sign is the player's from the start. Owned signs stay in the bag (もちもの) for good; the player places them anywhere, one of each on a map (never a map's own sign), perhaps on the paths, bridge and stairs at the maps' edges. Tapping a placed sign selects it, to move it, turn its arrow (↔) or put it away (しまう), with a label naming its map; tapping it, or the label, again walks there. Each map keeps the plants placed on it, and the garden opens on the map visited last. Coins, the bag and the shop are shared, and plants on every map grow, wilt and die whether they're shown or not.

The UI is in Japanese (kana), written for young learners, or in English with `data-lang="en"` on the card's slot.

## Setup

Nothing to build: everything comes in a zip.

1. Download `kanpeki-garden-<version>.zip` from the repository's releases page.
2. Copy its media files into the `collection.media` folder of the Anki profile (on the computer, the folder next to the profile's `collection.anki2`):
   - `_garden.js`
   - `_garden_sprites1.webp` (and any further `_garden_sprites<n>.webp`)
   - `_garden_bg.webp`, `_garden_bg_riverside.webp` and `_garden_bg_waterfall.webp`, the maps

   Their names start with `_`, so Tools → Check Media counts them as used and never deletes them.
3. Paste the snippet from `template-snippet.html` at the end of the back template of each card type that should pay coins:

   ```html
   <div id="kg" data-kg="garden" data-card="{{CardID}}"></div>
   <script src="_garden.js"></script>
   ```
4. In AnkiDroid (2.23 or later), turn on the new study screen: Settings → "New study screen", then the "New study screen" switch at the top of that page. It's off by default, and the garden shows only there (see [Where it shows](#where-it-shows)).
5. In AnkiDroid, turn on Settings → Advanced → "localStorage in Study Screen" (under Workarounds). The garden keeps its save in that storage, so it lives on that phone only and isn't synced. Without it the garden can't save anything.
6. Sync, and open a card's back on the phone: a coin chip shows in the bottom-right corner of the screen. Tap it to open the garden.

The zip's `INSTALL.txt` has the same steps.

### The slot's options

The slot is the `<div id="kg">` in the snippet (the script mounts the first one on the page). Its attributes:

| Attribute | What it does |
|---|---|
| `data-kg="garden"` | The coin chip, which opens the garden (the default) |
| `data-kg="toast"` | Only a short "+1" on the card when it pays a coin; no chip, no garden |
| `data-card="{{CardID}}"` | The card, so it pays one coin a day: the day starts at 04:00, as in Anki, and showing the answer again or undoing pays nothing. Without a card id the chip still shows but nothing pays |
| `data-dev="1"` | Test controls in the garden's settings (「+100」 coins, and 「−1日」「+1日」 to move the garden's day). Only in a test profile's templates, never in the ones the player studies with |
| `data-lang="en"` | The garden in English, item names too. Without it, or with any other value, it's in Japanese; the save is the same in both |

The garden draws its Japanese text in the Klee One font when the media folder has it as `_kleeone-regular.ttf` (it isn't in the zip); otherwise, and for English, in the phone's own font.

### Where it shows

Only in AnkiDroid's new study screen (AnkiDroid 2.23 or later, turned on in Settings → "New study screen"). The script mounts only on the page that loads AnkiDroid's `ankidroid-reviewer.js`, which only the new study screen does; desktop Anki, AnkiDroid's previewer and the card browser show nothing and pay nothing. So looking at cards anywhere else never pays coins, and the save stays in one place, the phone the player studies on.

### Saves

- The coins and the garden are saved in AnkiDroid's localStorage on that phone. They are not synced: studying on another device pays nothing into this garden, and a second phone has a garden of its own.
- Clearing AnkiDroid's app data, or uninstalling it, deletes the save.
- The save's format is `v: 3`, which keeps the maps whose signs the player owns, the map they were on last and the map each placed item is on (placed signs are items too). A `v: 2` save (v1.1.0 and earlier) moves over by itself, with everything on the first map; v1.1.0 and earlier then won't open the garden (see [Updating](#updating)).
- A damaged save is never written over. Damage the garden can mend (a broken entry among the placed items, say) is mended, and the rest of the save is kept. A save it can't read at all (not valid JSON, for one) locks the garden instead of starting it fresh: the garden won't open or pay coins, and says it can't open right now, as it does for a newer version's save. The stored save stays as it was, so it can still be recovered.
- **Vacation (おやすみ):** a switch in the garden's settings (the gear). While it's on the garden is frozen: plants don't grow, wilt or die, and cards pay no coins (a card answered then still uses up its coin for the day). Shopping, placing, moving and composting still work.

### Updating

Replace the media files in `collection.media` with the new zip's and sync; the save is kept. The bottom of the garden's settings shows which version the phone runs (e.g. 「v1.2.0」). Going back to an older version after a newer one changed the save's format doesn't lose the save: the older script then won't open the garden or pay coins, rather than write over it.

## Development

### Layout

| Path | What it is |
|---|---|
| `garden.js` | The game: one plain-JavaScript file, no dependencies |
| `catalog.js` | Generated item data (names, prices, frames) |
| `scripts/build_assets.py` | Builds `media/` from `art/`: the sprite atlas, the maps' backgrounds and `_garden.js` |
| `scripts/release.py` | Builds everything and makes the release zip in `dist/` |
| `release/` | The zip's `template-snippet.html` and `INSTALL.txt` |
| `art/` | Source art: the sprite sheet, the maps, stage-art strips and decorations (the maps besides home, strips and decorations in Git LFS) |
| `art/tools/` | Helper pages and scripts for making and checking the art |
| `tests/` | Node tests with a small fake DOM |
| `LICENSE` | MIT licence, code and art |
| `ART.md` | How the art was made |

### Build

```sh
python3 -m pip install -r requirements.txt   # Pillow and NumPy, once
python3 scripts/build_assets.py        # everything: atlas, backgrounds, catalog.js, media/_garden.js
python3 scripts/build_assets.py --js   # only media/_garden.js, after editing garden.js
```

Needs Python 3 with Pillow and NumPy, and `git lfs pull` for the art. Either build's `_garden.js` reports its version as `dev`. To try a build on a phone, copy `media/`'s files into `collection.media` as in [Setup](#setup).

### Test

```sh
node --test tests/*.test.js
```

The tests of `scripts/release.py` (in `version.test.js`) need `python3`, and the one that builds `_garden.js` also Pillow and NumPy, as does the test of the build's crop backups (`build.test.js`); each is skipped without them.

GitHub Actions runs the tests and the `--js` build on every push and pull request, without the LFS art.

### Release zip

```sh
python3 scripts/release.py 1.2.0       # MAJOR.MINOR.PATCH, an optional -suffix (1.3.0-rc.1), no leading v
```

Runs the full build, stamps the version into `media/_garden.js` (`KG_VERSION = "1.2.0"`, shown as 「v1.2.0」 in the settings), runs the tests, and writes `dist/kanpeki-garden-1.2.0.zip`: the media files, `template-snippet.html`, `INSTALL.txt`, `LICENSE` and `ART.md`. It stops with a non-zero exit at the first step that fails. Pushing a version tag builds and publishes the release on GitHub: see [Releasing](#releasing).

### Releasing

Tag a commit on `main` with its version and push the tag:

```sh
git tag v1.2.0
git push origin v1.2.0
```

The release workflow builds everything from the art (`scripts/release.py 1.2.0`), checks that the build changes no committed file (`catalog.js`, `art/removed/`), and publishes a GitHub release with `kanpeki-garden-1.2.0.zip` and notes from the merged pull requests. There's nothing to bump by hand: the version comes from the tag. A tag with a suffix, like `v1.3.0-rc.1`, makes a pre-release. CI installs the Python packages pinned in `requirements.txt`.

## Licence

MIT, for the code and the art alike: see [`LICENSE`](LICENSE). The art was made with AI image generation; [`ART.md`](ART.md) says how and which files it covers.

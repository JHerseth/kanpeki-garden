# Map prompts

The extra maps were made with OpenAI's image generation in ChatGPT, with `art/background.jpg` attached as the style reference. Each one used this prompt, with one theme filled in:

```text
Attached is the background map of my pixel-art garden game. Make a NEW map for the same game, as a companion to it.

Keep these exactly as in the attached map:
- Style: 16-bit pixel art, with the same pixel size, palette, saturation, dark outlines and soft shading.
- View: top-down with a slight 3/4 tilt, so cliffs, tree trunks and walls show their front faces.
- Scale: trees, rocks, fence posts, stepping stones and soil beds must be the same size in pixels as in the attached map, so the same plant sprites fit on both maps.
- Light: daytime, soft light from the top left, no strong shadows.
- Format: landscape, 16:9, the largest size you can make. The edges are framed by dense trees, bushes or cliffs.

Gameplay needs:
- At least 60% of the area is open, flat ground where the player will place flowers, vegetables, trees and decorations: grass, empty soil beds, gravel. Keep it calm and fairly empty, with only small details like clover, pebbles and grass tufts.
- Paths connect the areas. Put 1 or 2 landmarks (pond, stream, rock outcrop) toward the edges, not in the middle.
- No people, animals, buildings, text, letters, signs, UI, frames or watermarks.
- No planted flowers, crops, pots or decorations: the player adds those.

Theme: <one of the themes below>
```

| Map | Theme |
|---|---|
| `riverside.png` | Riverside meadow: a shallow stream with a small wooden bridge along the bottom edge, a wildflower meadow, and willows at the sides. |
| `waterfall.png` | Mountain plateau: cliffs around the edges, a small waterfall into a pool, and short alpine grass. |

Other themes that fit the art and haven't been made yet: a Japanese garden (raked gravel, stepping stones, a koi pond with a stone lantern, maples and bamboo); an orchard hillside (gentle terraces with low stone walls, a grassy slope, a stone well); a seaside garden (a sandy path, dune grass, the sea in one corner, a driftwood fence); an autumn clearing (orange and red trees at the edges, green ground).

A new map's exits should line up with a path, stairs or a bridge at its edge, because that's where the game puts the sign to the next garden.

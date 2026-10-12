# Third-party notices

## Arena effect images (`assets/arena/fx/`)

Eleven small effect images (fireball, iceball, waterwisp, leaves, claws, wisps and balls) come from the Pokémon Showdown client's effects folder
(https://github.com/smogon/pokemon-showdown-client, `play.pokemonshowdown.com/fx/`). Its animation source explicitly extends the CC0 1.0 dedication
to these effect images (https://creativecommons.org/publicdomain/zero/1.0/). They are generic effect graphics, not Pokémon character art, and we do
not bundle that project's separately licensed lightning, icicle, bone or rock images.

## Arena backgrounds and icons (`assets/arena/*.webp`)

Four arena backgrounds (Indigo Plateau, Viridian Grove, Cinnabar Crater, Seafoam Summit), the medal and the ball icon are original generated artwork
by the site owner (backgrounds only: no creatures, trainers, text or logos), center-cropped and recompressed for the web.

## Pokémon sprites

Never stored in this repository. The Pokédex, Today and Arena tabs hotlink them from PokéAPI's sprite repository (see `SHOW_SPRITES` in `index.html`).
They belong to their respective owners.

## Pokédex entry text

The Today tab shows the games' own Pokédex entry for the Pokémon of the day. It is fetched live from PokéAPI when the page loads, credited on screen, and never stored in this repository. The text belongs to its owners (Nintendo, Game Freak, Creatures Inc., The Pokémon Company). Set `SHOW_FLAVOR_TEXT=false` in `index.html` to hide it.

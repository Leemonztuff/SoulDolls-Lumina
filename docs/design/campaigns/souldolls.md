# Souldolls — A Campaign of Silent Bells and Forgotten Names

The design document of **Souldolls**, a 3-chapter, 8-level campaign in the Luminati 2.5D Pixel-Art Engine.

| | |
| --- | --- |
| **Audience** | Designers and AI agents building campaigns or creature encounters. |
| **Source of truth** | [`tools/make-souldolls.mjs`](../../../tools/make-souldolls.mjs) (the generator), [`public/campaigns/souldolls/`](../../../public/campaigns/souldolls/campaign.json) (output). |
| **Related docs** | [Campaign format](../../specs/CAMPAIGN_FORMAT.md) · [I18N](../../specs/I18N.md) · [The Ferryman's Lantern](ferrymans-lantern.md) |

```bash
node tools/make-souldolls.mjs              # regenerate campaign files
node tools/make-souldolls.mjs --check      # check byte-identical match
npm run level:check -- --campaign=souldolls
```

---

## Overview

The **Souldolls** campaign spans 8 levels across 3 chapters:

1. **Chapter One: The Whispering Hollow**
   - `hushmoor-hollow` (40×32): The start of the journey in Elspeth's hollow. Starters and wild Peatling.
   - `lantern-road` (56×20): The road east past Bram at the campfire.
   - `gloamford` (48×40): The town of Gloamford with Scholar Orla and the entrance to the Bellbindery.
   - `bellbindery` (20×14): An interior room with Binder Maren.

2. **Chapter Two: The Rain and the Tide**
   - `whisperfen` (48×32): A rainy fenland guided by Rowan, leading to Hollow Tide Cavern.
   - `hollow-tide-cavern` (40×28): A dark cavern with waystone, treasure chest, and bats.

3. **Chapter Three: Tidewatch Beacon**
   - `saltreach-quay` (48×36): The coastal quay with Dockmaster Gull and wild Tidewisp.
   - `tidewatch-light` (32×24): The lighthouse beacon with Keeper Vane where the bell is rung to dissipate the Hush.

## Creatures & Encounters

- **4 Encounter Zones**: `heath` (85 steps), `fen` (95 steps), `cavern` (110 steps), `tide` (90 steps).
- **12 New Species**: Peatling, Mossmote, Boggart, Lanternfly, Gloamwing, Cinderbound, Cavernmite, Murkfin, Shellskimmer, Saltling, Hollowwisp, Tidewisp.
- **3 Starters**: Peatling, Gloamwing, Tidewisp delivered by Elspeth the Dollwright.

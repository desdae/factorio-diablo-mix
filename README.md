# Emberforge: Ashes of the Lattice

An isometric dark-fantasy **action RPG fused with an industrial automation simulation**, built for the browser
in TypeScript with zero external art or audio assets — every sprite, icon, particle, sound effect and music
stem is generated procedurally at runtime.

You are a Kindled Vanguard in the Ashen Highlands, a land broken when the ancient Wrights' planetary engine —
the **Lattice** — was driven past its wards. Fight the rift-born Ashborn, mine and smelt, belt ore into kilns,
power lecterns to research new technology, defend your works from the assaults your machines attract, delve
into the Sunken Foundry to slay the Cinder Colossus, and use its heart to rebuild arcane industry until the
Lattice Beacon blazes.

> **Combat feeds industry. Industry feeds combat.** Monster drops are crafting inputs; boss relics unlock
> research; factories forge your weapons, ammunition and tonics; your skills overclock machines and charge
> capacitors; your machines' rift-bleed summons the next assault.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
npm test           # full automated suite (52+ tests)
npm run bench      # factory & combat stress benchmarks
npm run builds     # build-diversity simulation table
```

Saves live in `localStorage` (3 slots + autosave, each with an automatic backup) and can be exported/imported as files.

## Controls (remappable in Settings → Controls)

| Input | Action |
|---|---|
| WASD | Move |
| Left mouse (hold) | Rending Cleave (primary) |
| Right mouse | Shield Rush |
| 1 – 4 | Skill slots 3–6 |
| Space | Dodge roll (cancels an attack that hasn't landed yet) |
| F tap / hold | Interact (NPCs, caches, doors, inspect hovered structure) / gather (trees, ore, rock, fungus) |
| Q / G | Mending Tonic / Blast Charge |
| B | Construction mode — click to place, **drag to lay belts/walls/pylons**, R rotate, right-click (drag) remove, E pipette, X area-deconstruct, V capture blueprint, Tab switch category, 1–9 select |
| I/C · K · T · H · P · M · J | Inventory/character · Skills · Research · Handcraft · Production stats · Map · Chronicle |
| F3 / F4 · \` | Profiler overlay / power coverage · developer console |
| Gamepad | Left stick move, right stick aim (auto-target when idle), A/RT primary, X secondary, LB/RB/LT/RS-click skills 3–6, B dodge, Y interact, D-pad consumables, Start pause, Back map |

## What is in the build (the vertical slice, §78 of the brief)

| Requirement | Implementation |
|---|---|
| One biome | **Ashen Highlands**: seeded procedural terrain (ash, dunes, scorch, lava, water, ridges), forests, 34+ ore fields, camps, ruins, hive, nests, roads |
| One archetype | **Kindled Vanguard** with 6 active skills × 3 mod nodes each, 19-node passive constellation with 3 keystones, 7 attributes |
| ≥ 8 normal enemies | 9 families with distinct silhouettes & behaviour: rusher, ranged spitter, frontal-shield brute (flank it), burrowing tunneler, exploding bloat, summoner, healer, blinking stalker, flying moth |
| Elite enemies | 10 randomized elite modifiers (flaming, frostbound, warded, vampiric, blinking, volatile, enraged, regenerating, broodcaller, stormcharged) on champion packs with minions |
| Mini-boss | **Slagjaw, Brood Matriarch** — telegraphed charges, acid barrages leaving pools, brood summons, 3 phases |
| Major boss | **The Cinder Colossus** — hammer slams, flame sweeps, rolling charge you can bait into destructible pillars (stuns it), molten pools + husk waves, final-phase nova rings with safe bands |
| Mining, belts, power, furnaces, crafting machines | Burner & electric drills (finite deposits + 15% deep-vein trickle so nothing soft-locks), belts with visible items, distributors with filters, grapple arms with **logic conditions**, kilns/arc furnaces, fabricators, Arms Forge, generators, pylons, capacitors |
| Research | 19 technologies over 4 eras; sigils manufactured by your factory; two techs gated behind **boss relics** |
| Automated defenses | Bolt Throwers (consume manufactured ammo), Arc Spires (power-hungry chain lightning), walls, glowlamps |
| Randomized loot | 20 bases, 7 rarities, 45 affixes with tiers, 10 legendary powers that change skills or bridge combat↔industry, 2 boss artifacts, sockets + 4 runes + 3 rune-pair runewords, loot filter with auto-salvage |
| One dungeon | **The Sunken Foundry**: room/corridor generation, traps (vents), treasure & secret rooms, champion packs, boss arena; re-entering after the boss descends deeper with stacking modifiers (endless scaling) |
| One settlement | **Hearthmoor**: warden, engineer, smith (reforge/enchant/temper/socket/salvage), merchant (demand-saturating prices), archivist (lore) — a sanctuary enemies won't enter |
| Save/load | Versioned, checksummed, gzip-compressed saves; world stored as deltas from the seed; backups + corruption fallback; migrations; export/import |

Also present: 10-quest main line that doubles as the tutorial; day/night with factory lighting; weather (ash,
rain, thunderstorms whose strikes charge capacitors, fog, rift-storms); world events (ember meteors that seed
rich ore, rift tears, wandering champions, abandoned convoys); construction **wisps** that build ghost blueprints
and repair; blueprints (capture, rotate, mirror, library, string import/export); destroyed buildings leave
rebuild ghosts; production statistics with history graphs and bottleneck finder; power-network overlay; world
map with markers; the **Lattice Beacon** three-stage megaproject (campaign finale, visually evolves); difficulty
presets and world modifiers; accessibility (UI scale, colorblind rarity palette, shake slider, damage-number
modes, reduced flashing, hold/toggle gather, subtitles); graphics settings (render scale, particles, lighting,
weather, frame limit); developer console (spawn, give, teleport, research, nav & power debug views).

### Cross-system interactions (selection)
* Rally Horn **Overclock** mod / Foreman legendary: machines & turrets near you run +75% faster.
* Forge Judgement **Thermal Discharge**: the impact fills nearby capacitors and refuels generators.
* Player lightning damage and thunderstorm strikes charge Lattice Capacitors.
* Overseer's legendary: Cleave marks enemies; your turrets deal +40% to marked targets.
* Living Conductor keystone: your hits shock enemies near powered buildings; shocked enemies take +20% from every source, including Arc Spires.
* Iron Bulwark **Fortify Works**: repairs nearby structures and makes them invulnerable while active.
* Monster parts (chitin, bone, venom, essence, shards) are required inputs for forged equipment, charges, runes and Ember Cores.

## Architecture

```
src/
  core/      seeded RNG & noise, events bus, math
  data/      ALL content as data: items, buildings, recipes, techs, equipment/affixes/legendaries,
             enemies & elite mods, skills/passives, quests  +  validate.ts (broken-reference detector)
  world/     tile map (typed arrays), overworld generator with reachability validation, dungeon generator
  sim/       factory (belts, splitters, arms, machines, miners, labs, turrets, beacon), power grid solver,
             research — deterministic, no rendering dependencies
  game/      Game orchestrator, player & skills, combat resolution, enemy AI, bosses, threat/assaults,
             world events & weather, quests, economy, loot, inventory, blueprints, wisps, nav flow fields
  save/      serialization, deltas, gzip+checksum envelope, backups, migrations
  render/    canvas renderer (chunked terrain cache, y-sorted world, lighting, weather), procedural
             sprites/icons, actors, particles
  audio/     WebAudio synthesized SFX (spatialized, throttled) + adaptive layered music
  ui/        DOM HUD, panels, tooltips, build tools, console;  input/  keyboard/mouse/gamepad
  tools/     build-diversity simulator
```

* **Simulation is decoupled from rendering**: a fixed 60 Hz step (`TICK`) with an accumulator and spiral-of-death
  guard; input edges are buffered until consumed by a step. Rendering, particles and audio only *observe* the
  simulation through events.
* **Logistics**: items are interned to integers; belts hold ≤4 items with gap-limited positions and cached
  neighbour links invalidated by a topology version; machines push to outgoing belts/adjacent acceptors.
  The power grid is rebuilt only on topology change (union-find over pylons, spatial-bucketed) and solved with
  aggregate supply/demand per network each tick. Off-screen factories keep running exactly the same.
* **AI navigation**: BFS flow fields — one toward the hero (route around walls), one toward the factory
  (assaults break through whatever blocks them). Spatial hash for neighbour queries; idle wildlife far from the
  hero sleeps; distant camps despawn and respawn.
* **Determinism**: all simulation randomness flows through seeded `Rng`; world generation is a pure function of the seed;
  save → load → continue produces bit-identical factory state (tested).

## Verification

`npm test` runs content validation, worldgen determinism/reachability over several seeds, dungeon
connectivity, inventory, loot distributions, economy saturation, damage math, enemy behaviours, boss phases,
logistics conservation (no duplicated/lost items), power overload, arm logic conditions, research, deep veins,
threat → assault → turret defense, ghost rebuilding, recursive auto-crafting, blueprints, save round-trip +
determinism + corruption recovery + migration, and:

* **Factory stress (§82)**: 10,000 belt segments, 4,000 production machines, ~166,000 logical items, 500 active
  enemies, one 50-generator power network → **≈2 ms per simulation tick (p95 ≈3.5 ms)** in Node.
* **Combat stress (§83)**: 220 monsters with statuses, projectiles, elites and skill spam → **≈0.5 ms per tick**.
* **Save stress (§84)**: 3,600-belt factory saved/restored repeatedly with identical state.
* **Build diversity (§99)**: five reference builds (Bleed Reaver, Ember Juggernaut, Bastion Wall, Quake Lord,
  Foreman Engineer) simulated against training dummies; scores stay within ~1.4× of each other and each build
  leads at least one axis (DPS, EHP, sustain, turret DPS).

`scripts/playtest-ftue.mjs` plays the first four quests in a real browser using only keyboard and mouse
(fight → gather → build drill → drag belts → kiln → strongbox → fuel via panel → automated plates).

## Honest scope

The brief describes a multi-year AAA production (6 archetypes, 7 biomes, 24 phases). This repository is the
**vertical slice** the brief asks to be built first, implemented end to end with no faked systems. Not yet
built: the other five archetypes, the other six biomes, fluids/pipes, trains/rail, mounts & teleport gates,
logistics/combat robots (only construction/repair wisps exist), skeletal animation (characters are
procedurally animated vector art), voiced cinematics, and console packaging. The data-driven content layer and
the simulation architecture were designed so these extend the existing systems rather than replace them.

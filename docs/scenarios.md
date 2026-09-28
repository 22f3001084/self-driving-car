# Scenario data — where every field lives

Every scenario is data, not component code. The structured fields the design
calls for map to these sources, all keyed by the hazard's `EventToken`
(for example `SCOOTER`):

| field | source |
|---|---|
| id / display name | `src/content.ts` `TILES[token].label`; route positions in `src/sim.ts` `waypointsFor` |
| learning objective and brief | `src/content.ts` `LEVELS[].task` / `.brief`; patrol copy in its patrol entries |
| scene / environment configuration | `src/three/stage.ts` `place()` — one case per token (props, positions, extras); road piece via `PIECE_FOR`; weather per scenario in `setScenario` |
| hazard type, position, animation | `place()` for the standing state, `runReveal()` for the entrance |
| available sensor information | `src/store.ts` `SENSES_BEHIND`; the rear-sensor deck in `src/choices.ts` `SENSOR_CHOICES` |
| policy condition | the token itself; broad-vs-specific matching in `src/sim.ts` `conditionMatches` |
| action choices (three, one correct) | `src/choices.ts` `CHOICES[token]` |
| correct / safe action | the entry with `correct: true` |
| unsafe consequence | the wrong entries' `outcome` → verdict copy in `outcomeCopy`; the driven consequence in `stage.ts` `performOutcome` (`crashKind`: prop / kerb / shunt) |
| hint | `choices.ts` `hazardHint[token]` — narrated at the stop; the retry ladder (`content.ts`) also shows in the rule editor |
| explanation | each choice's `why`, shown after the car has carried it out |
| headline over the cards | `choices.ts` `faultCopy[token]` |
| review question | reflection copy in `src/content.ts` |
| narration key | narrated lines are the same strings, via `src/narration.ts` |
| success / failure feedback | `content.ts` `success` / `successDetail`; `outcomeCopy` |
| reset state | `stage.ts` `rewind()` restores every prop's recorded `home` pose and puts the car back on its stop mark |

The twelve hazards: `SCOOTER`, `NARROW`, `ARRIVED`, `MOVING`, `MANY_MOVING`,
`ROAD_WET`, `EMERGENCY_BEHIND`, `CYCLIST`, `DOG`, `ROAD_BLOCKED`, `FOG`,
`DEAD_END` — plus the rear-sensor question that precedes `EMERGENCY_BEHIND`.

Adding a scenario means: a waypoint in `sim.ts`, a `CHOICES` entry, a
`faultCopy` + `hazardHint` line, a `place()` case, and (if it animates in) a
`runReveal()` case. `scripts/probe-route.mjs` and
`scripts/probe-card-occlusion.mjs` then judge the geometry.

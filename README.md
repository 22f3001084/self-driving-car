# SKAI Space Missions · ROB-06 — The Northline Run

**Design Your Own Self-Driving Car** — a 45-minute Grade 6 **group** digital
mission for three students on one screen.

A logistics company needs a medical parcel driven to a clinic on Fenner Street.
The driver is out, so the delivery goes to an autonomous van — and the van does
only what the crew's written rules tell it to do. The street is broken into
**four levels**, shown on a map before anything starts: three closed-road stops
that take one rule each, then a live road test that breaks the policy the crew
just built. Then they have to explain why their fix works and where else the
same idea applies.

Built with **Vite + React 18 + TypeScript** (Zustand, Framer Motion, dnd-kit,
Howler) on the **SKAI Space design system**. Every image, sound and font is
local — the packaged build runs with no internet at all.

---

## Run it

Node 18+ required.

```bash
npm install
npm run dev
```

Open the printed URL (http://localhost:5173).

| Command           | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Dev server with hot reload                      |
| `npm run build`   | Offline production build into `dist/`           |
| `npm run preview` | Serve the production build                      |
| `npm test`        | Simulation logic tests (`tests/extension.test.ts`) |

`dist/` is fully self-contained: zip it, unzip anywhere, double-click
`index.html`. No server, no npm, no network.

---

## The question — three cards, standing in the street

NV-1 leaves the depot with a **corrupted rulebook**. It stops dead at anything it
has no rule for, and the child fixes it by picking one of three cards.

**The cards are in the world, not in a dialogue box.** They are canvas-textured
planes eight metres wide, floating over the road ahead of the car, turned to face
the lens and lit from underneath by a projector beam down to the tarmac. The
camera does not move to present them; the street stays exactly as it was, and the
question arrives in the same shot as the hazard.

There was a full-screen panel here before, and everything about it was wrong for
this moment: it covered the street the question was about, it needed its own
scrim, its own grid and its own scroll chain, and it turned "look at the road and
decide" into "read a form". The strips that replaced it have since gone the same
way — the same cream rectangles sliding in at every stop were their own kind of
noise. What is left on the DOM is one slim keypad row at the bottom of the frame
(in the flat edition its keys carry the answer text, since there are no cards in
a street there), and it may never occupy the middle band of the viewport.

The geometry is **solved, not chosen.**
[`scripts/solve-card-frame.mjs`](scripts/solve-card-frame.mjs) replicates the
deck's own placement maths against the live camera and sweeps the card size, the
spacing, the distance from the lens and the height for the largest cards that
still leave the HUD strips clear;
[`scripts/measure-cards.mjs`](scripts/measure-cards.mjs) then projects all four
corners of all three faces through the real camera and reads the strips' real
boxes out of the DOM, so "it fits" is a measurement. Two defects came out of
that: the first version put the leftmost card's outer edge at NDC −1.02 (off the
side of the screen) with the whole row behind the top strip, and the near-side
frontages — five storeys of brick on the pavement, nearer the lens than the cards
are — drew **over the third card**. That is one of the two reasons the buildings
are gone.

The cards are anchored to the **lens**, not to the car. On every rig those are
the same thing except the one that matters: the ambulance beat watches the street
from a camera three metres ahead of the car looking BACK, so a row eight metres
ahead of the car was eight metres behind the camera. The cards were built, lit,
and pointing away into the distance behind the viewer; the raycast found nothing
under the pointer and the question could not be answered at all.

Each face carries a number badge and **one line of copy at 150 canvas pixels** —
about 55 screen pixels, larger than any other type in the game. It used to carry
a label and a smaller "what the car would actually do" line underneath, and that
second line was the thing nobody at the back of a room could read.

- [`src/three/holocards.ts`](src/three/holocards.ts) — the deck: geometry, faces, hit-testing, the rise and the commit
- [`src/components/HazardBanner.tsx`](src/components/HazardBanner.tsx) — the two HUD strips and the keypad
- [`src/components/FaultVerdict.tsx`](src/components/FaultVerdict.tsx) — what the crash was, and the retry ring
- [`src/choices.ts`](src/choices.ts) — the twelve card sets, their copy, the hints and the verdicts
- [`src/styles/fault.css`](src/styles/fault.css) — the HUD stylesheet

**Three ways in, one handler.** Tap the card in the street (raycast against the
face meshes themselves, so the clickable area cannot drift out of step with what
is drawn); press 1, 2 or 3; or hit the matching key on the HUD keypad, which
carries each card's label as its accessible name. Hovering any of them lifts the
card and lights the key.

## What came off the screen

The activity had eight things on it while a child drove: a countdown clock, an
info key, a six-segment progress rail, an instrument cluster with eight readouts,
a five-button camera switcher, a hint bulb that had to be opened, a policy button
and a way out. None of the first six is the lesson.

| gone | why |
|---|---|
| the mission clock | a countdown on a nine-year-old reasoning something out is pressure, not information |
| the info key and the progress rail | inside a level they both say things the level screen already says |
| the camera switcher | see [The camera](#the-camera) |
| five of the cluster's eight readouts | the LIDAR and BRAKE chips never told a child anything the car did not already show; the INNER/KERB pips and the steering bar are both visible in the street, at size; the throttle bar is the speed number again. What is left is how fast, how far to go, and whether the car can see behind itself yet |
| the roof sensor sweep | a translucent wedge 1.7 m above the roof, which from the fixed rear camera was a teal smear across the middle of the car for the whole run |
| the hint bulb | gone, and later the printed hint with it — the narrator speaks the hint; the coaching line still appears in the rule editor and escalates on retries |
| "Write the rule myself" | an eleven-pixel third control under a question a child had just been asked, and the thing clipped off the bottom of a 900 px window |

The status ring under the car is thinner and dimmer too: at 1.95–2.5 m it was a
5 m disc under a 4.2 m car, and it was the brightest thing on the screen at the
moment a hazard lit it amber.

What arrived is **one** control: the policy key, top right, always there — and
deliberately still there while a question is up, because that is exactly when
someone wants the rulebook, or wants to write a rule by hand instead of picking a
card. It went in the corner the clock and the rail vacated.

Deleting all that took about 66 now-unreachable CSS rules with it, across four
stylesheets. [`scripts/probe-hud-fit.mjs`](scripts/probe-hud-fit.mjs) opens the
driving screen, the question and the crash at five window sizes from a projector
down to 1024×640 and asserts that nothing leaves the frame, nothing scrolls the
page sideways, and the two strips never take the middle third.

## Every wrong answer crashes

This is the half of the game that did not exist.

A wrong card used to be refused. The panel flipped it over, printed why it was
wrong, and left the other two live — so a wrong answer cost a child nothing, and
what they learned was that guessing is free. Now the car does **exactly what the
card said**, out in the street, and it crashes.

The manoeuvre differs per card, because that is how a child sees that *their*
answer is what did it rather than watching the same accident three times: a horn
sounds and nobody moves; a full stop holds, nothing changes, and the car edges
forward anyway; a U-turn starts and swings across the road; "speed up" simply
accelerates. Then it hits something, and there are three endings between them
covering every hazard in the game with no geometry that is not already on the
street:

| ending | when | what happens |
|---|---|---|
| `prop` | the obstacle is a **thing** — a parked scooter, a barrier wall | the car drives into it and knocks it flat |
| `kerb` | the obstacle is a **person or an animal** | the car swerves at the last moment, mounts the kerb and hits that instead |
| `shunt` | the ambulance beat | the car is not the one that hits something — the ambulance runs into the back of it and shoves it forward |

A nine-year-old never watches a car drive into a child, and the lesson is not
softened by that: the car still crashes, and it still crashed because the rule
was wrong. The verdict badge is always the same word — one red mark a child
learns to read instantly — and the line under it says how their particular answer
got there.

Then the camera is theirs (see [the crash camera](#the-crash-camera)), and one
control is on screen: a ring with an arrowhead on it. **Try again** puts every
prop back in the pose it was placed in and the car back on its mark, re-deals the
three cards, and nothing a wrong answer did is left on the street.

Nothing is written into the policy by a wrong answer, so there is nothing to
unpick — the framing is that the child is choosing which rule the car fires, and
only a right answer becomes a rule.

Twenty-four wrong answers, all of them driven:
[`scripts/probe-outcomes.mjs`](scripts/probe-outcomes.mjs) picks every one in
turn, waits for the verdict, and checks the car stopped, stopped **on the road**,
the camera was handed over, and the whole consequence landed inside thirteen
seconds. [`scripts/probe-fault-loop.mjs`](scripts/probe-fault-loop.mjs) drives
one of them with a real pointer end to end — hover, click the card itself in the
canvas, crash, spin the camera past two full turns, zoom, retry, and then answer
correctly.

### Cancelling a manoeuvre

A manoeuvre is a chain of awaits, and until this pass nothing could interrupt
one. `rewind` resolved the pending wait, so the chain **continued** from wherever
it had got to — on a street that had just been put back, with a second manoeuvre
already starting. Two choreographies writing to the same drive inputs, which
showed up as a wrong answer that simply never landed on the second attempt.

Every wait, timer and tween is now rejectable, and `cancelAll()` rejects the lot
with a sentinel that unwinds the chain at its next await. The four scene commands
catch it and end quietly. `until()` also grew a wall-clock net alongside its
sim-time one: sim time only advances while the render loop runs, and a
backgrounded tab throttles `requestAnimationFrame` to a crawl, so a child who
switched tab mid-manoeuvre came back to an activity that had stopped and would
never start again.


The picked card is written into the policy as a real rule, so the priority scan,
the mission report and the whole teaching arc work exactly as they did. What
changed is what a child has to do to make progress.

**Why.** Composing IF/THEN out of a tray of ten tokens is four decisions — which
condition, which action, whether to join them, in what order — before anything
happens at all. That is the heaviest moment in the activity and it arrives at the
exact point the child is already stuck. The card is one decision, in type sized to
be read from the back of a classroom.

The two wrong answers on every card are the two mistakes children actually make,
and picking one is not punished: the card turns over and says what the car would
have done. *"The scooter is parked. It will never move, so the car would sit there
for ever."* Reading that is worth as much as getting it right, which is why the
wrong cards stay on screen with their reasons showing.

- [`src/choices.ts`](src/choices.ts) — the twelve card sets and their copy
- [`src/components/HazardChoice.tsx`](src/components/HazardChoice.tsx) — the panel
- [`src/styles/fault.css`](src/styles/fault.css) — its stylesheet

The rule builder is still there, reached from the street's own dock whenever
nothing is being asked. It is no longer the gate, and it is no longer offered on
the question screen — it was an eleven-pixel third control under a question a
child had just been asked, and it was the thing clipped off the bottom of a
900 px window.

### Where the rule goes matters as much as what it says

`commitRule` in [store.ts](src/store.ts) inserts the new rule ABOVE the first
existing rule broad enough to swallow it, rather than appending. `MOVING` is
deliberately broad — it also matches `MANY_MOVING` and `EMERGENCY_BEHIND` — so a
specific rule appended underneath it can never fire, and a child who picked the
right card got a rule-order failure for a correct answer. The scan then shows the
insertion happening, which is the priority lesson rather than a dead end.

### The one problem a rule cannot solve

Every hazard in the game is in front of the car, and a car that only looks
forward handles all of them. Then an ambulance comes up behind.

`SENSOR_CHOICES` in [`choices.ts`](src/choices.ts) is a deck that comes BEFORE
the rule cards, once, on that beat: **which sensors should NV-1 have?** Front
only, front and sides, or all the way round. Same three cards in the same street,
but each face carries a **diagram** — a top-down car with its coverage shaded,
drawn into the card's own canvas — because "rear sensor" is two words an
eight-year-old has no picture for and a shaded wedge behind a car is a picture.
Getting a wrong package is answered the same way everything else is: the
ambulance runs into the back of the car, because it never knew it was there.

Until the rear package is fitted the rule cards do not appear at all — you cannot
write a rule about something the car never detects, and that sentence is the whole
lesson.

## The mission (matches the Group Digital Mission Brief)

The brief's three stages are the three **missions** on the board, so the shape
of the work is the first thing the crew sees: each card names its stage, its
budget, its purpose and its stops.

| Stage       | Time   | Where it happens | What the crew does                          |
| ----------- | ------ | ---------------- | ------------------------------------------- |
| **Create**  | 20 min | Levels 1-3       | Name the van, choose its sensors, build its first rules, then run the whole closed road. |
| **Iterate** | 15 min | Level 4          | Live test, the safety surprise, fix the rules. |
| **Reflect** | 10 min | Review           | Why the fix works and where else it applies. |
| Sign-off    | —      | Report           | Final policy, competencies against the five objectives. |

### The story

The mission is one delivery told in chapters, and **the chapters are the
pedagogy** — a story beat plays at every hinge so the crew always knows why they
are being asked for the next rule (`STORY` in `content.ts`, `StoryCard.tsx`):

| Beat | Chapter | Stage | Hands over to |
| ---- | ------- | ----- | ------------- |
| `open` | Chapter one | Create | the level map |
| `after-l1` | Chapter two | Create | the map, level 2 unlocked |
| `after-l2` | Chapter three | Create | the map, level 3 unlocked |
| `after-l3` | Chapter four | **Iterate** | the map, the live road test unlocked |
| `after-l4` | The review | **Reflect** | the review, directly |

Each beat is Maya on a glass card, **one line on screen**, the whole thing in
the narrator's voice, one orange key out. The last beat skips the map entirely —
every stop is cleared by then, so returning there would be a dead screen.

### The board — three missions

| # | Mission | Stage | For | Stops |
| - | ------- | ----- | --- | ----- |
| 1 | The closed road | Create · 20 min | Build the van a policy from nothing | 3 |
| 2 | The live road test | Iterate · 15 min | The policy meets what it was never built for | 1 |
| 3 | Advanced patrols | Extension | Seven streets that each break it a different way | 7 |

This is the only menu in the activity. A mission card drops straight into the
next unfinished stop inside it, and **the stops of one mission chain
themselves** — the crew returns to the board once per mission, not once per
level. Clearing mission 2 hands straight to the review.

### The four levels (`LEVELS` in `content.ts`, routes in `sim.ts`)

| # | Level                | Stage   | Situation taught | Whose turn | Drives                | What it adds |
| - | -------------------- | ------- | ---------------- | ---------- | --------------------- | ------------ |
| 1 | The parked scooter   | Create  | `SCOOTER`        | Engineer 1 | Depot → scooter       | Condition → action. One situation, one rule. |
| 2 | The narrow gate      | Create  | `NARROW`         | Engineer 2 | Shops → the gate      | The same action can serve two situations. |
| 3 | The closed-road test | Create  | `ARRIVED`        | Engineer 3 | **The whole street**  | The brief's "test the plan once against the two known obstacles". The scooter and the gate are re-met and cleared by the rules already written; the clinic gate is the one new situation. |
| 4 | The live road test   | Iterate | `MOVING`         | Whole crew | The whole street      | Real traffic. The three rules clear both known obstacles and then the policy fails. |

Levels unlock in order — a level is playable only once the one before it is
cleared — so the policy accumulates in the order the brief intends. Every stop
is listed on its mission's card from the start, so the crew knows the shape of
the run before they commit to it.

### One gate per hazard

The flow used to ask for four clicks and three overlays at every hazard: a halt
card that said "press Write the rule", the editor, a "Try again", then a "Next".
Most of that was a second copy of something the crew had already been told. Now:

| Moment | Then | Now |
| ------ | ---- | --- |
| Vehicle halts | halt card → click → editor | the editor **opens itself**, headed with the hazard and carrying the coaching line |
| Rule saved | click "Try again" | the stop **re-runs immediately** |
| Stop cleared | click "Next: …" | the next stop **starts on its own** after the result has been read |
| Between levels | a story-beat card, then the level's card | **one** card, which carries the chapter line |

Deleted outright as repetition: the story-beat overlay, the halt card, the
route-track chips, the stage strip, the run strip, the problem-statement banner
that restated the card, the step chip that restated the rail, and the Maya quote
footer. The only click a hazard now costs is the rule itself.

`AnimatePresence` also lost its `mode="wait"`: that holds the incoming screen
until the outgoing one has finished animating, and a tab that is not producing
frames — backgrounded, throttled — never finishes, which could soft-lock a
transition. The screens cross-fade instead.

The **design card is on the map**: the van's call sign and its sensor package
(front only, or front and sides), both required by Create and both reported at
sign-off. The default is the plainer package, so choosing the better one is an
actual decision rather than a default the crew never sees.

The **tray is the brief's tray, verbatim**. Create offers three needed
conditions (Scooter ahead, Narrow gate ahead, Destination reached), two needed
actions (Slow and pass, Stop and deliver) and the two decoys (Turn around,
Sunny day ahead). Iterate adds the brief's three: Something moving, Full stop
and the Speed up decoy. All five connectors — IF, THEN, AND, OR, ELSE — are
available from Create onwards.

Four lead-in screens were removed — character intro, crew roster, design card
and route survey — because they stood between the student and the programming.
Maya Rao now introduces the job on the map, and each level's own briefing popup
carries its situation. Turn-taking is unchanged; it uses "Engineer 1/2/3"
instead of asking for names.

The hidden safety card is exactly as specified: it is not shown in levels 1-3,
it is the same for every team, and it fires automatically the moment level 4
opens — before the crew is allowed to touch the policy again.

### Rule language

`IF <situation> THEN <action>` with three optional connectors the crew chooses:

- **AND** — a second action, both performed together
- **OR** — a second situation, either one fires the rule
- **ELSE** — a default branch used when no rule matches at all

Rules fire **top-down, first match wins**, so ordering the policy is part of the
answer. The advanced patrols make that visible: a broad "something moving" rule
placed above a specific one intercepts it, and the run reports a rule-order
failure rather than a wrong action.

### Decoys

`Turn around`, `Speed up` and `Clear sky ahead` are deliberately available and
deliberately wrong; each one produces its own coaching line instead of a generic
"try again".

---

## Advanced patrols — mission 3

Seven optional streets (crowded crossing, wet surface, ambulance behind,
cyclist, animal in the road, blocked lane, fog). They reuse the same policy the
crew already wrote, so each one exposes a gap in it.

Each patrol is solvable and each has its own coaching line. Three of them —
**ambulance behind, animal in the road, fog bank** — cannot be solved with a
single action, which is the point: a horn is not a stop, and giving up a lane is
not the same as ending somewhere safe. That made a real bug: the halted editor
hid every connector, so the AND key the crew needed was unreachable and three of
the seven were **unwinnable**. The halted editor now offers AND (a second
action) while still hiding OR and ELSE, which have nothing to do with a stop
whose situation is already settled.

| Patrol | Accepted answer |
| ------ | --------------- |
| Market crossing | `WAIT_CLEAR` |
| Wet surface | `SLOW_EARLY` or `LEAVE_SPACE` |
| Ambulance behind | `MOVE_ASIDE` **AND** `STOP_SAFE` |
| Cyclist in lane | `SLOW` or `LEAVE_SPACE` |
| Animal in the road | `FULLSTOP` **AND** `HONK` |
| Blocked lane | `HONK` |
| Fog bank | `SLOW_EARLY` **AND** `HONK` |

Three more faults the patrols were carrying: the **ambulance was never visible**
(its closing position was 0.8 screen widths behind the landmark, which with the
camera pinned 0.63 behind put it off the left edge — the crew was told an
ambulance was closing and shown an empty road); the **market crossing overlapped
the vehicle's nose**, because the group was centred on the landmark and its left
edge fell behind the front bumper; and the **ambulance sprite was sized as if it
were 5.8 m long** when the artwork is a short, tall box van, which stood it
nearly 4 m high. The street dog was also dimensionally honest at 0.9 m and
illegible at 78 px, so it is now a 1.3 m street dog.

---

## Where things live

```
src/
  content.ts     All player-facing copy, tiles, levels, hints, reflect prompts
  sim.ts         Deterministic run evaluator (rules → route outcome)
  store.ts       Mission state (Zustand)
  icons.tsx      Every icon, drawn as inline SVG
  narration.ts   Narrator voice (browser speech engine, offline)
  sound.ts       SFX and loops (Howler) + synthesised horn
  components/
    Shell.tsx        Bottom bar, progress, Back/Next, pause panel
    Title.tsx        Title screen (name + one button only)
    MissionBoard.tsx The only menu: three missions, their stops, the van's spec
    ActStage.tsx     One level (or one patrol): build ↔ run
    RuleBuilder.tsx  The IF/THEN sentence and the block tray
    PolicyList.tsx   The crew's shared artefact
    Street.tsx       The street scene and drive choreography
    Reflect.tsx  Report.tsx  Patrols.tsx
  styles/
    globals.css      Tokens + fixed stage + chrome
    components.css   Screens
```

To change wording, tiles or coaching, edit **`src/content.ts`** only.

---

## The design system

The whole game is built to the SKAI Space Design System spec (Figma `86:542`).

### Palette

The CityRide palette is in `globals.css` as named tokens — all 23 swatches —
mapped onto roles exactly as the spec suggests:

| Role | Token | Swatch |
| ---- | ----- | ------ |
| Primary | `--color-primary` | Royal Blue `#0A2D94` |
| Deepest ground / frame | `--color-primary-dark` | Deep Navy `#091C56` |
| Primary CTA | `--color-cta` | Orange `#FCA01B` |
| CTA edge / pressed | `--color-cta-shadow` | Dark Orange `#B96D00` |
| Highlight | `--color-highlight` | Bright Yellow `#FEE714` |
| Success | `--color-success` | Mint `#45CDB5` |
| Sensor beam / links | `--color-link` | Cyan `#17BDE0` |

One documented deviation, and it is deliberate: the palette lists Mid Gray
`#9A9A9A` for "secondary text", but that is **2.85:1** on a white card — under
the 4.5:1 the automated accessibility gate requires for small copy. Secondary
text therefore uses the palette's own body colour, Dark Gray `#444444` (9.2:1),
and Mid Gray is kept for what it does pass on: dividers and inactive icons.

### Type

Chakra Petch (display, CTAs, numerals) x Inter (body, UI), at the spec's
7-step scale — 64 / 48 / 36 / 28 / 22 / 18 / 16 — exposed as `--t-h1` … `--t-body`.
Those seven are the only sizes any rule is allowed to use.

Both faces are **self-hosted**, latin subset, 88 KB total: four static Chakra
Petch weights plus Inter's variable file. They are installed by `src/fonts.ts`
rather than by a CSS `@font-face`, and that is not a style choice — a bundled
`@font-face` goes through Vite's CSS asset pipeline, which emits
`src: url(<href>)` **without quotes**. The game ships in a folder called
`Self Driving Car (2)`, and one unquoted bracket voids the declaration, leaving
the packaged build silently rendering in Segoe UI. Importing the files as
modules and quoting the URLs ourselves makes the path irrelevant.

Every colour in both stylesheets is a token: **zero raw hex values outside the
`:root` definitions**. That includes the things the brand palette does not cover
— asphalt, kerb, pavement and daylight for the street (`--asphalt-1…4`,
`--kerb-1/2`, `--walk-1/2`, `--sky-1/2`), the lit/pressed shades every action
slab needs to read as a physical key (`--orange-lift`, `--orange-press`,
`--amber-lift`, `--amber-press`), and one shared disabled ramp (`--off-1…3`).

### Shape language

Nothing is a plain rectangle. Five `clip-path` primitives in `globals.css` —
`.skai-slab`, `.skai-slab-sm`, `.skai-tab`, `.skai-para`, `.skai-hex` — drive
every chrome surface off one `--cut` value, so the HUD reads as one system.
Clipped elements cannot cast a `box-shadow`, so they use `filter: drop-shadow()`.

### HUD

The spec's persistent chrome, corner-anchored over the scene rather than sitting
in a solid bar — the street still owns the whole screen:

| Component | Where | What it does here |
| --------- | ----- | ----------------- |
| Quit key | top-left | Orange angled tab → pause panel (audio, narrator, restart) |
| `skai-logo` | top-left | wordmark on a chamfered glass tab |
| Crew banners | top-centre | avatar hex + Royal Blue parallelogram per engineer; the one whose level is open is lit, cleared ones go Deep Teal |
| Audio key | top-right | sound + narrator together |
| Info key | top-right | Orange hexagon → how the van reads the rule list |
| Timer | top-right | Royal Blue slab, Chakra Petch numerals |
| Progress rail | right edge | 6 chamfered segments — the four levels, the review, sign-off — Pale Gold unfilled → Orange filled, the current one ringed in Bright Yellow, with the `n/6` count on top |
| Hint key | bottom-left | Navy ring, Bright Yellow bulb; lights up whenever the van is halted |
| CTA + frame | bottom-centre | Orange trapezoid slab with bolt studs on the spec's stepped white rules |
| Instrument cluster | right rail | live vehicle readout — see below |
| Camera dock | bottom-right | four view tiles, each with its own pictogram |

### The instrument cluster

The play screen used to carry three plain controls over the street and nothing
else, so the most interesting thing on it — a car obeying rules a child wrote —
had no readout at all.

`Cluster` in [Scene3D.tsx](src/components/Scene3D.tsx) shows the call sign and
state, ground speed in km/h with a throttle bar, three status chips (LIDAR,
BRAKE, STEER), which lane the car is settled in, a steering bead that slides the
way the front wheels are pointing, and the route with a pip for every hazard on
it and a marker for where the car has got to.

Everything on it is read straight off the driving model — `onTelemetry` in
[stage.ts](src/three/stage.ts), at ten hertz, not sixty, because re-rendering
React sixty times a second to move a number by a tenth of a km/h is waste. That
matters more than it sounds: a child who writes *slow down for a scooter* can
watch the number fall as the car reaches one, and the rule they wrote stops
being an abstraction. The whole panel goes amber when the camera is holding a
hazard shot, so it is caught in peripheral vision while they are watching the
road.

It sits on the **right rail**. The left corner looked free until the hazard
two-shot swung round and put the car in it, and the right edge below it is
already claimed by the "rule fired" banner — so it goes above that, in the one
column nothing else moves through. It hides below 900 px wide or 660 px tall,
where the street matters more than the readout.

## Two seatings, one activity

The Group Digital Mission Brief is written for three engineers taking one rule
each. The SWIFT pipeline document also calls for an individual variant — one
student, one machine. Both now exist off the same levels, chosen on a picker
that runs once, straight after the title.

| Seating | Who | What changes |
| ------- | --- | ------------ |
| **Crew of three** | Group mission, 3 seats | Levels 1-3 are dealt one per engineer, the HUD carries three banners, and the turn badge names whose rule it is. |
| **Solo pilot** | Individual mission, 1 seat | One student writes the whole policy. One banner, and the turn badge reads "Your rule". |

Solo is not a relabel — it is its own read of the mission. Every narrated line
a solo pilot hears is rewritten to ONE person doing everything ("today the
whole van is yours: every rule it will ever have is one you write"), the review
prompt becomes "Your call. Nobody to outvote.", the board line becomes "Three
jobs, one pilot", and the turn chip disappears entirely — when the whole policy
is yours, announcing whose turn it is is noise. The street, the rule language,
the four levels and the seven edge cases stay identical, because what is being
taught is identical. `mode` lives in the store; `setMode` also resizes the crew
roster, so a solo run never carries two empty name slots into the report.

A declutter pass went with it: the minute-budget chips came off the mission
cards (a child does not plan by minutes; the clock is in the HUD), the
"Cleared"/"Locked" captions came off card footers (the badge already shows a
tick or a lock — saying it twice is the definition of clutter), and the seats
caption came off the mode cards (the faces already show the count).

## The patrol route — seven edge cases, seven places

The seven advanced patrols are the conditions a real autonomous vehicle has to
survive, and they all used to happen at **the same spot**: x = 0.45 of the
street, because the scene hardcoded one position and the act screen fell back to
the same number. Seven different problems at one lamp post reads as one scene
redressed seven times.

Each now has its own stretch of Fenner Street:

| Patrol | Edge case | At |
| ------ | --------- | -- |
| Market crossing | many moving things at once | 0.22 |
| Wet surface | braking distance doubles | 0.34 |
| Ambulance behind | a priority vehicle needs the lane | 0.46 |
| Cyclist in lane | a vulnerable road user too close to pass | 0.57 |
| Animal in the road | an unpredictable obstacle that cannot hear you | 0.67 |
| Blocked lane | a person in the lane, back turned | 0.78 |
| Fog bank | the vehicle can see, but nobody can see it | 0.88 |

The scene now reads the hazard's position **from the route** rather than
assuming it, and a patrol starts a short run-up behind its own hazard, so the
route and the scene can never disagree again. That mismatch was already live:
the wet patrol's waypoint sat at 0.6 while the scene stopped the vehicle at
0.45.

## Player assets

Four portraits, generated as one sheet in the established style and split on the
4-up grid — connected components could not be used because the generator drew
thin dividers that welded three of the four together. Three are the crew's
seats; the fourth is the solo pilot. Each seat's banner in the HUD carries its
own face rather than a number.

## The character and background art

The five portraits and three backdrop plates are generated with **Gemini 3 Pro
Image** through the nanobanana MCP server. (fal.ai is wired up as well — see
`.claude.json` — but that account's balance was exhausted, so Gemini did the
work.)

Consistency across the crew comes from the server's session history: the first
portrait establishes the style, and every later call passes
`use_image_history` with an instruction to match the head scale, framing and
lighting. The result is a roster that reads as one set rather than five separate
generations.

The art direction was rewritten for the Asphalt layer rather than reused: dark
navy backdrops with a cyan rim light from behind-left and a warm amber key from
the front-right, because these portraits now sit on dark card grounds instead of
white ones. Backgrounds are deliberately open in the middle and dark overall —
they are blurred and scrimmed behind interface panels, so anything eye-catching
in the centre would fight the text.

Sizes are chosen from the CSS boxes they actually fill, at 2x for retina: 240 px
portraits (a 40 px crew hex and a 116 px mode-card face), 260 px for the ops
lead (a 92 px frame), and JPEG plates at 1920–2600 px. The whole set is 886 KB.

## Two editions, one game

The kit vehicle is the original Blender van again (the imported cartoon car is
retired; `make_van_from_glb()` stays in the build script should it be wanted
back). And the game now ships twice from one codebase:

- **3D edition** (`self_driving _car/`) — the Three.js street.
- **2D edition** (`self_driving _car (2D)/`) — `Scene2D.tsx`, selected by
  building with `VITE_SCENE_2D=1`. It speaks the same four scene commands as
  the 3D stage, so every mission, patrol, the priority scan and the U-turn run
  unchanged; only the renderer differs. Three.js tree-shakes out entirely —
  the 2D bundle is 0.5 MB of script.

**The 2D background is a parallax stack, not a repeating plate.** Three Gemini
generations — two DIFFERENT shopfront stretches (bakery/bookshop/hardware, then
clinic/florist/cafe/park) and a skyline silhouette — are seam-blended in PIL
into one 4,920 px wrapping strip (A, B, mirrored A, mirrored B). Sky is fixed;
the skyline scrolls at 0.25x, the shopfronts at 0.6x, the road and everything
on it at 1x. The parallax is both the depth cue and the anti-repetition trick:
by the time the mid strip wraps, the skyline behind it is somewhere else.

### The flat edition plays the same game

The 2D edition shares the whole game layer, so when the answers moved into the
street it had no street to put them in. It reaches the same question through the
HUD keypad, and a wrong answer crashes there too — the car closes on whatever is
in front of it, hits it and tips, because playing the SUCCESS animation under a
strip that says the car crashed is worse than having no animation at all. What it
cannot offer is the cards themselves or the camera to walk round a crash with.

[`scripts/probe-flat-edition.mjs`](scripts/probe-flat-edition.mjs) drives it:
no WebGL canvas, three keys, a crash, a retry, and the right answer clearing the
stop.

## The vehicle is the user's own model

**Wheels are protected from the decimator.** The first import ran one collapse
ratio over everything; at 8% a tyre is a lumpy polygon that thumps as it turns
— "punctured", exactly as reported — and the lump drags the centroid off the
axle, so the wheel also rolls eccentrically. Wheels now keep 32% of their faces
while the body absorbs the whole reduction budget, hinge origins blend the
round profile's bounding box with the vertex centroid, and the wheels are
smooth-shaded at a 42-degree limit.

**`join()` bakes transforms before joining.** Blender's join keeps the ACTIVE
object's transform; when the first part in a list is a 90-degree-rotated torus,
the whole assembly inherits that rotation and a later `rotation_euler`
assignment silently un-rotates the geometry. That is how the scooter ended up
lying flat on the road. Every part's transform is now applied to its mesh
before joining, which immunises the entire kit against the class of bug.

`C:/Users/sumit/Downloads/cartoon_car.glb` (a 20 MB, 191k-face Sketchfab
cartoon sports car) is imported INSIDE the kit build and tamed into a game
asset — the pipeline in `make_van_from_glb()`:

- decimate collapsed to a ~16k budget, applied per-mesh BEFORE joining, because
  `bpy.ops.object.join` keeps only the active object's modifiers and silently
  discards the rest (found the hard way: 191k faces sailed into the export)
- textures resized to 512 px; the baked shadow blob under the car deleted
- orientation solved from the model itself: the front-wheel centroid against
  the body midline says which end is the front, then the car is rotated to +X,
  scaled to 4.6 m, and grounded
- the front wheels are separate nodes in the source, so they STEER and ROLL for
  real; the rear pair ships as one mesh on a shared axle, which rolls as one
  hinge — the runtime tolerates the missing fourth wheel
- the game's own parts are grafted on from the car's bounding box: sensor pod
  on the roof, headlight/brake/indicator glow clusters at the corners
- wheel radius is measured (0.547 m) and the runtime constant matches it, so
  the rolling rate is the real rate — wheels never scrub

If the GLB is missing, the build falls back to the procedural van: the car is
an asset choice, not a dependency.

## Kit v2 — curvature, and the U-turn checkpoint

The second Blender pass exists because the first one read as toy bricks. What
changed is small in code and large on screen: every bevel went from one segment
to three (a chamfer becomes a CURVE), curved surfaces are shaded smooth with an
angle limit, and the hero assets grew the details that make a machine read as a
machine — the van has bumpers, a grille, light clusters, door seams, mirrors, a
curved roof cap and a sensor mast; the scooter is built from squashed spheres
instead of crates; lamps taper and their arms sweep; tree canopies are lobed.
63 objects, 7,908 faces, 1.6 MB of GLB. One axis lesson recorded for next time:
after a 90° Y rotation, a cylinder's local X points at the ceiling — squash
that, not local Z, or the roof cap becomes a bulbous tube.

**The eighth patrol, 'No way through',** is the checkpoint where the only
correct rule is IF road closed THEN turn around. TURN is a decoy everywhere
else in the game — giving up is normally the wrong answer, and that contrast is
the lesson. For exactly one event it leaves the decoy set, the same mechanism
that already made HONK valid only where a horn can move somebody. The manoeuvre
itself runs through the driving model with a manual full-lock override: the arc
on screen is the arc a 3.3 m wheelbase actually turns at walking pace.

**The hazard camera now orbits.** On a blocker it opens side-on and sweeps
around to settle behind the pair at the point of incidence; ‹ › arrows at the
screen edges let the crew swing the shot around the problem themselves. Both
axes stay clamped inside the street canyon.

Also in this pass: boom gates flank the delivery bay (arm raised — arriving
reads as entering somewhere), the car snaps the last centimetres onto the lane
centre instead of converging asymptotically, and the frontage rows breathe —
about a quarter of plots stay empty and the gaps widened.

## The camera

**One view. It does not move, and there is nothing to switch.**

| | offset from the car | look at | fov |
|---|---|---|---|
| the shot | (−8.4, 3.1, 0.9) | (21, 1.35, 0) | 62 |

Low, close and behind — the way a driving game frames a car. It is the shot that
shows the road the car is about to drive, and leaving it alone means a child
never loses their bearings.

There used to be five views on a switcher in the corner, and on top of that the
activity swung the lens off the car and orbited round to frame each obstacle — a
"two-shot" — on every hazard, twelve times a run. Both are gone. The same camera
move over and over is not a camera move, it is a tic; worse, it took the shot
away from the child at the exact moment they were being asked to look at the
road. The hazard does not need the camera brought to it: the car stops seven
metres short of it and the rig looks straight down the street over the car's own
roof, so what the child sees is what the car sees.

Deleting the two-shot took `focus`, `focusHold`, `focusOn`, `releaseFocus`,
`orbitAuto`, `camSettled`, the `onFocus` hook and a forty-line branch of the
camera solve with it. Two bugs went too, both of which only existed because that
code existed: a released shot that never broke after the DEAD_END U-turn (the
break test was `car.x > focus.x + 3`, and after a U-turn the car drives in −X),
and a preset path with no lateral clamp, which let `side` sit 2.4 m inside the
shell of a built plot.

### The two exceptions

**The ambulance beat** switches rig rather than moving the lens: `rear`, at
(3.2, 2.7, 0.2) looking (−15, 0.95, 0), fov 58. Something closing from BEHIND
cannot be staged from any forward-facing camera. The numbers were solved, not
guessed — the lens sits AHEAD of the car and looks back over its own roof,
because the obvious placement (behind the car, looking back) puts the car out of
shot entirely, and an ambulance filling an empty road reads as a head-on
collision rather than as something overtaking you. You have to see your own car
being overtaken. At one metre ahead the car's roof projected to NDC y −0.66 and
its tail to −0.92: drawn, but in the bottom 7% of the frame, under the command
bar. At 3.2 m ahead and a little lower the roof lands at −0.25 and the tail at
−0.43. [`scripts/measure-rear-framing.mjs`](scripts/measure-rear-framing.mjs)
projects them through the live camera.

**A crash** hands the camera to the child — see below.

### The crash camera

After a wrong answer the car crashes, and the lens becomes the child's: it
orbits the point of impact, and it is the only time in the activity when the
camera is not the game's.

- opening pose is the **replay angle**: off the car's front quarter, on the far
  side of the road, at about the height of a person standing there (yaw solved
  from the car's heading so it still works after the U-turn; pitch 0.22). It
  used to open from wherever the follow camera was — which is the same shot the
  child was already watching, with the car stopped in it and the collision
  three-quarters hidden by the car's own roof.
- the orbit point is the **midpoint of car and obstacle**, so both are in shot.
  Centred on the obstacle alone the car sat half out of frame six metres behind.
- drag: yaw is **unclamped** — all the way round, as many times as you like —
  and pitch stops just short of the poles so the up vector never flips.
- wheel zooms, 4.2 m to 30 m, in the review only. The follow rig is a composed
  shot and a child pulling it out to 40 m would just be lost.
- one coaching line, `.orbit-hint`, appears only while this is true. It is the
  one thing a child cannot discover on their own.

## The simulation has its own clock

`dt` is clamped to 0.05 s in the render loop so a stalled frame cannot teleport
the car through a barrier. That clamp means the world runs in SLOW MOTION below
20 fps — and every manoeuvre's timeout used to be measured against
`clock.elapsedTime`, which is real time.

So on a slow machine a swerve would be cut off a third of the way through and the
car would carry on into whatever it was avoiding, while the same code was perfect
on the machine it was written on. `Stage.simTime` is the sum of the dt the physics
was actually stepped with, and `until()` measures against that. On a classroom
Chromebook this is not a hypothetical.

## How the vehicle drives

[`src/three/driving.ts`](src/three/driving.ts) is a **kinematic bicycle model**,
and it exists to kill a specific bug. The old scene animated lateral position
directly: a lane change tweened `z` while `x` was tweened somewhere else. That
is a crab, not a car — the body slid sideways across the tarmac with the wheels
pointing the wrong way, which is what "it looks like it's flying" meant.

The model's whole value is the constraint it enforces:

> the vehicle can only ever move along its own heading.

    x' = v·cos ψ
    z' = −v·sin ψ
    ψ' = (v / L)·tan δ

Sliding is not damped or hidden — it is **impossible to express**. To get across
the road the van must steer; steering rotates the heading; position follows the
heading. Note that `ψ'` scales with `v`: at a standstill the wheels can turn but
the vehicle neither moves nor rotates. Correct, and the reason a lane change is
now something the van *drives* rather than something the scene *plays*.

Steering is **pure pursuit** — aim at a point a little way ahead on the target
lane and turn as hard as needed to arc onto it. The lookahead grows with speed,
so the S-curve falls out of the geometry instead of being keyframed. The
lookahead constant was tuned by watching the top-down camera: shorter and the van
crosses at a steep angle like a taxi cutting across, rather than easing over.

Consequences worth knowing:

- Commands stopped being tweens. `driveTo` sets a stopping mark and the loop
  brakes to it using `v = sqrt(2·a·d)`, so it eases onto its mark instead of
  arriving and jerking. The command layer **awaits a condition**, not a duration.
- The wheels roll on distance *actually covered*, so they can never scrub.
- `act()` now finishes at rest. A manoeuvre ending mid-lane-change leaves the
  van rolling with no mark, and it drove off into the distance.
- Following the cyclist caps the cruise speed to hold a gap. It used to clamp
  position directly, which would fight the model.

## The house style (and the retirement of Asphalt)

`src/styles/house.css` is the game's one theme layer, loaded after the SKAI
plate chrome and before the in-street question HUD. Every panel in the game —
brief, editor, modals, mission/patrol/seating cards, the scan readout, the
fired-rule toast, the verdict, the progress rail, every button — follows four
rules: warm cream surface, fat navy outline, HARD offset shadow (drawn, not
blurred), rounded corners. Colour lives in tags, headers and keys at full SKAI
strength — royal blue, orange, mint, bright yellow — never in body panels.

It replaced `asphalt.css`, the dark arcade-racing skin (near-black navy, neon
edges, gloss sweeps, slanted type). That was a genuinely good racing-menu look
and the wrong one twice over: it darkened a bright game aimed at nine-year-olds,
and once the question HUD moved to warm light panels in the street, every
remaining dark plate read as a leftover from a different game. The file is
still in the repo, unimported, as a record.

The sci-fi chamfer clip-paths went with it. A clipped element cannot cast a
box-shadow — the old chrome had to fake depth with `filter: drop-shadow` — and
a cut corner is the grammar of a cockpit, not of a picture book.

## The assets are modelled in Blender

Every object in the street is authored in Blender by
[`blender/build_kit.py`](blender/build_kit.py) and exported as a single GLB. The
script runs headless, so the whole asset set is reproducible from source:

```bash
npm run build:kit   # after running blender/build_kit.py, inline the GLB
```

Blender ships from the Microsoft Store here, and Store packages cannot be
executed directly — only through their app-execution alias, which *detaches*.
So the build is driven through `blender-launcher.exe` and the script writes its
own `kit.glb.log.txt` and `kit.glb.report.txt` next to the output; without that,
a failure is completely silent.

Current kit: **65 objects, 21,820 faces, 2.1 MB** of GLB. No image textures at
all — solid PBR factors only — which is what keeps it that small even now that
the vehicle alone accounts for nine thousand of those faces.

### The vehicle: a Mahindra BE 6

[`blender/be6.py`](blender/be6.py) models the car, and is exec'd into
`build_kit.py`'s namespace (not imported — Blender's bundled Python cannot see
this project on `sys.path` when the launcher starts it headless from an
arbitrary directory).

The car it replaced was a stack of bevelled boxes, and it read as one: a white
fridge with four discs under it. Three things changed that.

**It is lofted, not stacked.** A car's shape is a *surface*. Two hulls — the
lower body and the glasshouse — are built the way a body-in-white is: a row of
stations along the car, each a rounded-rectangle cross-section, bridged into a
shell. The section is a superellipse rather than an ellipse, because a car is
flat down the flank and across the roof with the corners rolled off, and the
floor takes a squarer exponent than the roof.

**The wheel arches are carved by the loft itself.** Each station carries its own
underside height, and that height climbs to 0.78 m over each axle. No boolean,
no seam to clean up, watertight for free.

**Trim is placed ON the surface, not near it.** `Hull.flank(x, z)` inverts the
section to give the exact half-width at a height, and every piece of trim — arch
cladding, sills, door shuts, handles, the livery, the window surround — is
generated through it. Trim placed at a fixed distance from the centreline either
sinks into the paint or floats off it, because the flanks tuck in as they climb.
Heights outside the section are clamped back inside it first: over a wheel arch
the body is simply not there, and an unclamped query collapses the trim onto the
centreline and swallows it whole. That bug ate the whole sill on the first pass.

Scale is deliberate. The real BE 6 is 4371 × 1907 × 1627 mm on a 2775 mm
wheelbase; this is reproduced at **0.961 of life size**, which lands it at
4.20 m long on a 0.361 m wheel — exactly the `CAR_HALF_X = 2.10` and
`WHEEL_R = 0.36` the driving model was already tuned around. Every proportion is
the real car's and not one simulation constant had to move.

Three bugs from this work are worth keeping:

**`join()` silently drops bevels.** `bpy.ops.object.join()` keeps only the
ACTIVE object's modifiers, so a bevel left pending on any other part is
discarded. The old car asked for bevels on forty boxes and shipped every one of
them as a raw box. `bake_modifiers()` applies them first.

**A tyre modelled as a cylinder buries the entire wheel.** A tyre is a *ring*.
As a solid disc it hides the rim, the spokes and the brake behind a slab of
rubber, and the wheel reads as a black circle at every angle — which was the
original complaint about the wheels not appearing to turn. `tube()` builds it
properly.

**Red lamps on red paint are invisible.** The tail lamps vanished from the chase
camera — the one view a child spends the whole activity in — because a red lens
and Tango Red paint are the same value from ten metres. They sit on a black
tailgate band now, which is what the real car does too.

The wheel itself is the other half of "the wheels should move". The old one was
a disc with four spokes at 45°: eight-fold symmetric, identical to itself every
45°, so rotating it changed nothing you could see. Five twin-spokes, a five-lug
circle, a red caliper, a valve stem and two dozen tread blocks all break that
symmetry. Verified numerically: over 0.23 m of travel the hubs turn −0.626 rad
against an expected −0.63, and the front pair steers to ±30°.

### Key art comes from the same kit

[`blender/render_art.py`](blender/render_art.py) renders the title screen
(`bg-title-depot.jpg`) and the mission report illustration (`delivered.png`).
Both were flat drawings of a white delivery van, so the title screen and the
report were showing the child a different vehicle from the one they had just
spent twenty minutes commanding. Rendering them from the kit is the only way
those can never drift apart again — change the car, rerun this, and every screen
agrees. [`blender/preview_car.py`](blender/preview_car.py) renders the car alone
from six angles, which is a ten-second loop instead of the two-minute one that
rebuilding the kit and reloading the game costs.

### The road system

A street is a row of 12-metre pieces butted end to end. Four pieces cover
everything the activity needs:

| piece | what it adds |
|---|---|
| `road_straight` | carriageway, kerbs, 8 m pavements, lane markings |
| `road_crossing` | a zebra and two Belisha beacons |
| `road_bay` | the clinic's hatched delivery bay |
| `road_works` | a lane-narrowing taper |

`layRoad(lengthM, features)` in [roadSystem.ts](src/three/roadSystem.ts) lays
them; anything unspecified is straight. The act screen derives the features from
the level's own route — a `MOVING` hazard asks for a crossing tile, `ARRIVED`
asks for the bay — so the road and the lesson can never disagree. Add a fifth
piece to the Blender kit and the game can lay it immediately. That is the whole
point of building it this way: **the procedural road drawn in code is gone**.

### The roadworks close the road

The NARROW hazard used to be a three-panel fence across the kerb lane, which left
13.3 m of open road beside it — three lanes. The card said "barriers leave one car
width" over a picture of a car driving round a fence with room to spare, and the
manoeuvre it taught was the same *go round it* the parked scooter had already
taught.

It is a full closure now, and the arithmetic is written out in the code because
the one thing it must never do is clip a barrier:

```
road            z -9.2  .. +9.2
far wall        5 panels, centre -4.00  ->  covers -8.60 .. +0.60
THE GAP                                      +0.60 .. +4.20   (3.60 m)
near wall       3 panels, centre  6.95  ->  covers +4.20 .. +9.70
car half-width  0.9165, pass clearance 0.55
passOffsetFor solves 4.20 - 0.9165 - 0.55 = 2.7335
car flanks at   1.817 .. 3.650
```

Three things had to change for the car to thread it safely, and each was measured:

- **The planner only checked the spans in the car's own lane.** With a wall on the
  far side too, that wall is not "blocking" by the lane test and the car was
  about to drive straight at it. `clearOfAll` now checks every span — and with a
  tolerance, because `inner` is defined as `minZ` minus the same two terms the
  test adds back, so the near-side comparison was an exact floating-point
  equality that would silently abandon the whole pass if it ever tipped.
- **The cones marking the gap were narrowing it.** They are measured like any
  other obstacle; two of them took 0.48 m off each side of a 3.6 m opening, no
  line satisfied the clearance test, and the car drove twelve metres and stopped
  in the middle of the road. They stand inside the walls' own footprints now.
- **The run-up was too short.** Traced through the pass: the car needs about 11 m
  of road to cross the 4.25 m to the gap's line and another 5 to stop correcting.
  At 14 m its nose entered the gap still yawed 7.5 degrees, and a yawed car sweeps
  a wider band than its flanks — clearance to the barrier fell from 0.59 m to
  0.32 m. It stops 20 m short now.

Verified by driving it — [`scripts/measure-gate-clearance.mjs`](scripts/measure-gate-clearance.mjs):
**0 overlaps** sampled every 40 ms through the whole pass, worst lateral
clearance **0.776 m**.

### What the street runs into

The drivable street is 106 m long. The tarmac used to stop 36 m past the last
landmark and the frontages a little before that, which meant the road ran into a
flat panel of sky — most obvious once the vehicle had arrived at the clinic and
there was finally time to look ahead. Three things fixed it:

- the road's run-on went from 3 tiles to 12, so tarmac reaches 250 m
- the ground plane went from 460 m across to 2.4 km, so its own edge is past the
  fog instead of a hard green line ruled across the sky
- `layDistance()` adds the city beyond the street

`layDistance` lays three bands, each one `InstancedMesh` because ninety separate
blocks would be ninety draw calls for scenery nobody is ever within fifty metres
of: a **corridor** continuing the street's own walls past the last real
frontage, a **backdrop** row standing behind the frontages so the deliberately
empty plots show more city instead of a green field, and a **skyline** scattered
wide and rising as it recedes. A fourth band, **terminus**, stands across the
street's axis past the last tarmac — the skyline scatters sideways and never
closed the one sightline that actually matters.

### Offline

The GLB is base64-inlined into a generated module
([kitData.ts](src/three/kitData.ts)) and parsed with `GLTFLoader.parse`. Nothing
is fetched, because the activity is delivered as a folder a teacher
double-clicks and a `file://` page cannot fetch a sibling binary. `app.js` is
2.4 MB with the kit inside it and still needs no network — verified by a
Playwright test that drives the packaged build off the disk.

One trap worth recording: the first version of the generated module split the
base64 into ~12,000 concatenated 100-character chunks for readability. That took
the dev server down on every rebuild. It is one string literal now.

### Orientation

The glTF exporter maps Blender **+Y to −Z**. A building modelled with its body
along Blender +Y therefore arrives extending along −Z — straight across the
carriageway. The NEAR side is the one that needs turning through half a turn,
not the far side. Getting this backwards puts five storeys of brick on the road,
which is exactly what it did the first time.

## The street, for children

Everything over and around the road follows one house style now, and it is a
toy's, not a cockpit's.

**The world.** Pavements narrowed from 8 m to 3.5 m — sixteen metres of flat
grey concrete was most of the frame — and everything beyond them is **grass**.
The sky is a real blue falling to a warm horizon, with a dozen puffball clouds
(`layClouds`, three or four flattened spheres each, fog-exempt so they stay
white). Six **townhouses** line the street at a measured
setback, and they are the FLAT edition's painted backdrop rebuilt in geometry —
same palette (terracotta, sage, slate, tan, cream, brick, sampled from the
painting), same vocabulary: a parapet with a cornice under it, a grid of
cream-framed windows with sills, a white shopfront fascia, and a STRIPED awning
built from real alternating slats. One street, two editions, one place. The road carries
ONE dashed centre line and nothing else painted on it; a tile used to carry
eleven stripes plus slab joints, and from the low camera that was a page of
horizontal rules between the child and the car.

**The setback is measured, not chosen.** The answer cards spread along the
camera's right, which throws the outer card over the near pavement; anything
tall and near is something that can stand in front of it. The shops stand at
z 27 and the clinic went back and up (z 21.2, ×1.4) after
[`scripts/probe-card-occlusion.mjs`](scripts/probe-card-occlusion.mjs) caught
its shell in front of card 3 — it raycasts the lens at all four corners of all
three cards on five scenes and fails if the first hit is not the card.

**The panels.** Warm cream, a fat navy outline, and a HARD offset shadow —
drawn, not blurred, which is what makes a panel read as a game piece instead of
a web dialog. The hazard icon sits in a yellow badge; the CRASHED verdict lands
as a tilted stamp; the keypad keys carry the same three colours as the cards
standing in the street (position one is always blue, two orange, three green —
a class calls out "the orange one" before anyone has finished reading). The
question panels float centred with `inset-inline: 0; margin-inline: auto`,
never with a transform — framer-motion writes its own `transform` for the
entrance animation and silently wipes any the stylesheet sets.

**The cards.** Flash cards, not holograms: cream face, coloured border, candy-
striped header band, the number in a white disc, the answer in deep navy at the
largest size on a type ladder that fits (`LABEL_SIZES` — a fixed size either
drowned short answers in white space or ran long ones off the card). A soft
shadow ellipse sits on the tarmac under each card; the cyan projector beams are
gone. Dark navy slabs with cyan edges looked handsome and were wrong twice
over: they darkened the street at the moment the child is asked to look at it,
and white-on-near-black at distance is the lowest-legibility pairing there is.

## The street is empty on purpose

There are no buildings and no trees.

The street used to be lined both sides with forty-odd frontages — five storeys of
brick, concrete, glass and cream — with a tree every twenty-four metres and a
skyline of ninety instanced blocks past the end of the road. All of it is gone,
and the first reason is measurable: the fixed rear camera sits low and three
metres off the road on the NEAR side, and a plot on the near pavement at z 17.2
is closer to the lens than the answer cards eight metres ahead of the car, so it
drew over the third card. The occluder fade was dissolving a wall in front of the
lens on every street to hide the same problem. The second reason is that forty
buildings and nine trees behind a question a nine-year-old is trying to answer is
forty-nine things competing with it.

What replaced them is a **guard rail** down the outer edge of each pavement — one
`railing` section per road tile, modelled in Blender like everything else, seven
posts and two rails, mint on the top bar because that is the one line of brand
colour at eye level. It gives the street an edge and a sense of scale, and at
1.02 m tall it can never be in front of anything that matters. Lamps stay, far
side only, every thirty-six metres, because they are what the fog and dusk
scenarios light.

Beyond the railing the ground runs 2.4 km and dissolves into the fog colour, so
the far end of the street is haze rather than an edge. `fog.near` came in from
100 m to 70 m in clear air for exactly that reason: with the frontages gone the
verge runs to the horizon, and starting the fade further out left a band of flat
olive with a hard line on it where the haze began.

The kit lost the five building meshes, the tree, the bench and the bin — 58
objects and 26,730 faces where it had 65 and 29,992. The builders are still in
[`blender/build_kit.py`](blender/build_kit.py), uncalled, as a record of what the
street was.

## One hundred and forty-four metres

`WORLD` went from 4.4 screen widths to **6.0** — 105.6 m to 144 m — because the
old street could not hold four hazards, and had not been able to since the
closed road became a real kerb-to-kerb closure.

That one hazard needs about thirty-seven metres: twenty of run-up to cross four
metres of road and settle before its nose enters a one-car gap, sixteen more to
the barrier wall, and the return. Level 4 asked for scooter, gate, crossing and
clinic in 105.6 m — and the crossing's stop mark landed **twenty-seven metres
behind** where the gate manoeuvre finished. `driveTo` was handed a mark already
behind the car, returned immediately without touching the cruise, and the car
drove the whole street at eleven metres a second and parked against the end of
the world with the crossing a hundred metres behind it. The reveal played a child
crossing the road off-camera.

Four things came out of that, and each is a defect in its own right:

- **stop marks are derived, not tabulated.** `markFor(trigger, routeX)` measures
  from where the hazard actually ends up — a hazard that owns a road piece is
  snapped to that tile's centre, and the closed road's barriers stand 16 m past
  its placement point — so reordering a level cannot silently move a mark to the
  wrong side of the thing it is for. The hand-written `LANDMARK` table is gone.
- **`driveTo` always ends at rest.** A mark already behind the car now brings the
  car to a stop where it is instead of handing back with the cruise still set.
  It also counts those, in `Stage.marksBehind`.
- **the pass no longer runs on.** `settleLane` is bounded by distance as well as
  by a clock (it squared the car up at pass speed for five seconds — forty metres
  of road), and the return swerve out of the gate is taken slowly. A lateral move
  costs forward travel, and how much depends on the speed it is taken at, because
  the pure-pursuit lookahead grows with speed: measured on the closed road, the
  4.14 m move out at 2.6 m/s cost 10.5 m of road, and the identical move back at
  10.5 m/s cost 18.5 m.
- **level 4 was reordered.** The crossing comes before the closed road now, which
  also happens to be the better lesson order: something that MOVES is the harder
  idea, and it comes before the precision one.

[`scripts/probe-route.mjs`](scripts/probe-route.mjs) drives all four levels with a
policy that solves them and asserts `marksBehind` is zero on every one.

## Three dimensions, in the browser

The street is a real Three.js scene now: a perspective camera, a directional sun
with shadow mapping, an environment map for reflections, and a vehicle whose
wheels roll at omega = v / r against the road plane. The flat side-scroller and
every sprite that went with it are gone, along with `Street.tsx`.

**Every asset is procedural.** There is not one .glb, .fbx or texture file in
the scene: geometry comes from primitives, and every texture is drawn on a
canvas at runtime (`src/three/kit.ts`). That is a delivery requirement, not a
shortcut — the activity ships as a folder a teacher double-clicks, and a
`file://` page cannot fetch a binary model or a texture atlas without a server.
It also means no CORS-tainted canvases, nothing to 404, and about 40 KB of
source instead of 40 MB of binaries. Three.js itself bundles into the same
classic-script `app.js`, which is now 1.0 MB and still needs no network.

- `kit.ts` — palette, canvas textures (road, pavement, facades, shopfronts, sky), material helpers
- `city.ts` — carriageway, kerbs, pavements, lamps, crossings, the delivery bay
- `actors.ts` — the vehicle and every character, each a jointed rig: hips, shoulders and knees are real child objects, so a pedestrian's legs swing about their own pivots and stay attached to the body
- `stage.ts` — renderer, camera rig, tween engine, and the four scene commands
- `components/Scene3D.tsx` — a thin React shell over `Stage`

**The camera is one shot**, low and behind, from a `RIG` table in `stage.ts`.
There was a five-view switcher in the dock; it is gone, along with the two-shot
that used to swing the lens round to every obstacle in turn. See
[The camera](#the-camera).

**"Don't let the car fly over things" stopped being something to arrange.** In a
flat side view, passing an obstacle had to be faked with a scale-and-offset
trick that could always be read as hopping. In 3D the obstacle is at z = +3.55
and the far lane is at z = -2.2, so a pass is a lane change: indicate, steer out
with the front wheels actually turning, pass, steer back. The wheels are on the
road plane by construction.

**The vehicle also has a voice.** `setEngine()` in `src/sound.ts` is a synth —
drive-unit whine, sub, and filtered tyre roll — fed the vehicle's *measured*
speed every frame, so it winds up as the van pulls away and falls silent the
moment a rule stops it. Still no broadband noise that could read as a skid.

Measured 59.7 fps on level 4 (the whole street, every prop, ten walking
pedestrians) with device pixel ratio capped at 1.6, one shadow-casting light and
a 1024 shadow map. If WebGL is switched off by device policy, `Scene3D` says so
plainly and the lesson still runs — rules, scan and level flow are untouched.

## The scan — priority, played out loud

The one law of this machine is "read from the top, first match wins", and until
now the game never showed it happening: the judge ran instantly, so rule
selection — the actual subject of the mission — was invisible at the exact
moment it occurred.

`evaluateAt` now returns a **trace**: every rule in priority order with what the
scan did to it (`miss`, `fired`, `else`, `unreached`). A new `scanning` phase
sits between the reveal and the verdict, and plays that trace on a panel beside
the street, one rule every 460ms:

- rules above the match tick past as **no match**
- the firing rule lights up and names its action
- everything below greys out as **not reached** — the visible proof that
  priority decided, because those rules were never even looked at

Only after the walk does the vehicle act or the editor open. Watched live at
the hidden safety card: `1 Scooter ahead — no match → 2 — no match → 3 — no
match → 4 Something moving — FULL STOP`, then the van stops and the child
crosses. That sequence **is** the pedagogy.

Two supporting changes: the policy list now states the law ("Read from the top.
First match wins.") where the order is edited and titles each number
"Priority n"; and when a stop fails as an **order problem** — a broad rule
intercepting a hazard that has its own specific rule — the reorder arrows now
survive the halted editor, because reordering IS the fix and the locked mode
used to hide them.

## Never a dead end, never a blank screen

The reported "crash in advanced patrols" was a **dead end**, and it was in the
main mission too. `hideNav` hides the Back key and the CTA for both `play` and
`patrols`, and the act screen's dock carried only the policy button — so once a
job was opened, the only ways out were finishing it or restarting the whole
mission. Every act screen and every briefing now carries an explicit exit
("Back to the board" / "Back to patrols").

On top of that, four hardening changes so a genuine fault degrades instead of
disappearing:

| Guard | What it closes |
| ----- | -------------- |
| `Boundary` around every screen | A render throw unmounted the entire tree, which is indistinguishable from the game vanishing. Now a recovery card with the policy intact. |
| `showHint` | Dereferenced `TILES[nextCondition].label` unguarded — a hard crash on a button press if a level ships no required condition. |
| Scene animations | `animate(vanRef.current!, …)` on an unmount mid-drive is a throw inside an async handler. Every target is checked, and a failed step reports done so the run carries on. |
| Hint output | The gloss line the hint writes into was not rendered while the vehicle was halted, so pressing Hint did nothing at all. It renders in both modes now. |

The window `error` and `unhandledrejection` handlers **log only**. Promoting
them to the crash card was tried and reverted: a missing image or an aborted
animation raises the same events as a real fault, and losing a working screen
over a 404 is worse than the fault.

Verified across 16 paths — title, board, every level, review, report, the patrol
grid and all seven patrols, including a patrol driven to completion: zero
crashes, every screen renders.

## Grounding — why the mid-run hazards now sit in the world

Only the vehicle had a contact shadow. Everything else — scooter, barriers,
cyclist, dog, pedestrian, child, ball, ambulance and all three crossing actors —
was a cut-out floating on the asphalt, which is exactly why the things that
appear mid-run did not feel like they were in the scene.

Each prop is now wrapped in an element that draws its own elliptical contact
shadow, sized from the prop's width and softened for its depth band: tight and
dark in the near lane, smaller and lower-contrast in the far lane, because a
shadow further from the camera is both smaller and less contrasty. Keeping the
shadow out of the artwork means one sprite can stand in any band.

## Depth pass

The chrome was correct but flat — every slab a single fill with a cut corner.
Physical keys read as physical because of a lit top edge and a shaded base, so
every glass surface, HUD slab and action key now carries a one-pixel inner
light and a matching shade. The rule sentence is *wired*: short dashed stubs run
out of IF and THEN into the component that follows, so the row reads as a
schematic rather than three loose boxes. The rail's current segment breathes and
the timer carries a slow scan sweep.

A full-width rail behind the whole sentence was tried first and reverted — it
dangled past the last slot and read as an unfinished wire.

## Layout and responsiveness

Two modes, chosen by a CSS media query (so the first paint is already right)
and refined by a `ResizeObserver` in `App.tsx`:

| Mode      | When                                        | How it works                                                                                                    |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **wide**  | landscape, ≥720px                           | The canvas is **1920 logical px across** — the design system's width, so every size in the stylesheets is the size the spec drew — and its height follows the viewport's own ratio (clamped 900–1400). 16:9, 16:10, 3:2 and 4:3 therefore **fill the screen edge to edge**. The HUD survives a changing height because it is corner-anchored: nothing in it assumes the canvas is exactly 1080 tall. |
| **fluid** | portrait, or narrower than 720px            | Not covered by the spec (§8), so this is the game's own: the canvas *is* the viewport at scale 1, the street becomes a centred band sized off frame width, the rail lies flat under the top-left chrome, and the panels go full width. |

## The street

The street is a **side-scrolling world 6.0 screens wide** (`WORLD` in
`stage.ts`, shared by both editions), so the hazards sit a full screen apart
instead of crowding one
frame. A camera follows the vehicle (`--cam`, in screen widths) and clamps
twice — to the ends of the world, and to a band of the frame — so the vehicle
can never drive out of shot. The road itself is **drawn in CSS**, not painted
into the artwork, so it can run for any route length.

Vehicle and street sit on **one metric scale**. The van is 5.3 m long and 24%
of the frame wide (`VAN_W`), which fixes a metre at `VAN_W / 5.3`; every prop —
scooter, barriers, child, ball, cyclist, ambulance — is declared in metres in
`SIZE` and converted at the point of use. That is what stops the vehicle
reading as a toy against the shopfronts, and it is what makes the shot a
close-up on the road rather than a wide view of a street.

Each level starts on its own stretch of that street (`startX`), so a level is a
short leg with one hazard, not a re-drive of everything already cleared. Level
4 drives the lot.

### Depth bands

A flat side view has one cue for depth — how far up the screen a thing stands —
so the street declares three bands and everything is placed in one of them
(`NEAR_LANE`, `FAR_LANE`, `PAVEMENT` in `Street.tsx`, off `--ground`,
`--lane-far` and `--kerb`):

| Band | What stands there |
| ---- | ----------------- |
| Near lane | the vehicle, and anything that blocks it dead — the child, the dog |
| Far lane | everything it has to get **past**: the parked scooter, the roadworks barriers, the cyclist |
| Pavement | street furniture — the delivery-gate bollard, its sign, the gate label |

That placement is what makes a pass read as a pass. When the scooter shared the
vehicle's ground line the sprite crossed straight over it and the vehicle looked
like it drove **on top of** the obstacle; from the far lane, above the centre
line and behind the vehicle in paint order, the two never share a ground line.
Far-lane props are drawn at 0.9× as the only perspective cue available.

### Wheels on the road

Nothing ever lifts the vehicle. There are no `y` animations on it at all — a
vertical move in a side view reads as flying, so easing past the scooter, taking
the gate, giving way to a cyclist and pulling over for an ambulance are all done
with speed and distance instead.

The wheel strip runs off **actual motion**, not off the phase: `driveTo` raises
its own `rolling` flag for as long as it is travelling, and the sprite animates
on `driving || rolling`. The phase cannot answer this question, because the
vehicle also covers ground during an *action* — and while it did, the wheels
used to be frozen.

The backdrop is one long plate of **four distinct sections** — depot, shops,
junction, clinic — spanning the whole route and scrolling with it, so the
street genuinely changes as the vehicle travels rather than repeating the same
frontage. It is composed offline from four generated sections: each is trimmed to its
kerb (the road below it is drawn), colour-matched to the set so there is no
tonal step, and overlapped by 260px with an alpha ramp so one skyline dissolves
into the next instead of butting against it. The plate keeps its own aspect
ratio on screen — stretching it to the frame is what made the buildings look
smeared — and a daylight gradient sits behind it so nothing ever reads as a
black void.

While the crew is writing rules the street behind the editor is blurred
(`.scene-blur`); the blur lifts for the road test. The vehicle pulls up short of
each hazard (`STOP_GAP`) rather than stopping on top of it.

No scrollbar is ever drawn anywhere in the game frame.

## What this teaches

**The backbone is conditional logic. The student writes a program; the street
runs it.** Not syntax coding — the blocks are only notation. The subject is
computational thinking expressed as rule-based control, which is what actually
drives an autonomous vehicle.

Five ideas, and the game is built so none of them can be skipped:

| Idea | How the game forces it |
| ---- | ---------------------- |
| **Condition → Action** | A rule is `IF <situation> THEN <action>`. Nothing else exists. |
| **Coverage** | The vehicle stops dead at anything with no matching rule. A gap in the program is a vehicle that will not move. |
| **Abstraction** | `Something moving` has to cover a ball, a child and a dog. One rule, many instances. |
| **Order / specificity** | Rules fire top-down, first match wins, so a broad rule shadows a specific one. |
| **Debug loop** | Run → fail at a named point → diagnose → amend → re-run. |

In one sentence: *a plan is only as good as the situations it was written for,
and you find the missing ones by running it.*

The hidden safety card is the whole design. The three rules from levels 1-3 are
correct and complete for the closed road — and they still fail on level 4,
because they were written for things that stand still.

Anything that does not serve those five ideas has been cut.

## The overlays cannot leave the screen any more

Every panel drawn over the 3D canvas was absolutely positioned with no ceiling
on its height. That is correct with three rules in the policy and broken with
ten, which is what a child has by the time they reach the advanced patrols. Four
things were actually wrong, and all four were measured before being fixed:

**The rule editor never scrolled.** `.policy-list` and `.tray` have carried
`overflow-y: auto` since they were written and neither had ever engaged: the
chain was broken two levels up, where `.editor-body` is a grid whose implicit
row is `auto` and `.policy` / `.builder` are flex columns with no
`min-height: 0`. Measured before the fix: `scrollHeight - clientHeight === 0` at
5, 7 and 13 rules, and not one scrollable container anywhere on the page. The
panel held four rules; at six the Add-rule button was outside the dialog, at
seven it was 278 px outside it, and at thirteen the dialog ran 320 px off the
bottom of the screen.

**`is-hidden` did not hide.** The selector list for `.act-dock.is-hidden` ended
in a trailing comma before a COMMENT, and comments are stripped before selectors
are parsed — so the rule was silently welded onto `.act-screen .hud-bl` and
inherited `z-index: 22` and nothing else. The command bar had been sitting on
screen through every briefing, every rule editor and every policy scan since the
rule was written, underneath whatever was supposed to have replaced it.

**The policy trace had a ceiling written for the wrong position.** `.scan-panel`
was capped relative to `top: 128px`; `skai.css` had since moved it to 180.3. At
13 rules it measured 622 px tall and ended 25 px inside the hint bulb.

**The report's own buttons were below its fold.** The panel scrolls, because a
seven-rule policy plus the delivery photograph is taller than an 810 px window —
so the two buttons that leave the screen were unreachable without scrolling
first. The panel is a grid now and only its middle row moves.

Verified by sweeping every screen at 1600x900, 1280x720 and 1024x640 and
asserting that no visible element's rectangle leaves the viewport, and the fault
card separately at 1920x1080 down to 900x600.

## Chrome

There is no top bar. The street owns the whole screen and everything the crew
needs — where they are, the clock, audio, pause, back and next — sits on one
fixed bar along the bottom.

Three things open over the street, all as proper centred popups that blur it:

| popup   | when                                   |
| ------- | -------------------------------------- |
| Brief   | at the start of a level, before anything moves |
| Halt    | the vehicle has stopped and has no rule for what it met |
| Editor  | writing or fixing a rule — near full stage |

## How a run works

A run is **not** all-or-nothing. The vehicle drives to one hazard, **stops**,
and the policy is judged for that hazard alone (`evaluateAt` in `sim.ts`):

```
brief → driving → revealing → rule works → acting → on to the next hazard
                            → no rule    → blocked: the crew is asked to fix it
```

Every level works this way: the brief pops up, the crew presses go, and the
vehicle **drives to the first thing in its way and stops** before anyone is
asked to write anything.

When it is blocked the vehicle holds position, a card names the hazard it
stopped at and why the policy did not cover it, and the rule editor opens
**scoped to that hazard** ("Rule for: Scooter ahead"). *Try again* re-judges the
same hazard; the vehicle only moves on once the rule works. A track across the
top shows which hazards are already behind it.

`evaluateRun` is still there for the mission report and the advanced patrols.

## Writing rules

The editor is a **panel over the street**, not a permanent split screen. It
opens on entering an act, on "Fix the rules" after a failed run, and from the
dock button; closing it gives the crew the clear street back. Inside it are the
rule sentence, the block tray and the policy list.

**One rule per situation.** Once a situation has a rule its block leaves the
tray, so the policy can never contain two rules competing for the same event.
Editing a rule returns its block so it can be re-picked.

**Every rule can be deleted, and so can the whole set.** Each row carries ✕, and
the policy header carries **Delete all rules**, which asks once before it wipes
the set — a crew that has painted itself into a corner can start the policy over
without restarting the mission. Deleting works in both modes of the popup; only
reordering and editing need the full builder.

**The popup has two modes.** When the vehicle is stopped at a hazard the
condition is not a question — the sensors already reported it. The `IF` is
locked to that hazard and the left column asks one thing: *what should the van
DO about it*. No situation tray, no connectors, no gloss line. The right column
still shows the policy, read-only, so a rule the crew has just added stays in
sight instead of disappearing. The full builder is one tap away from the dock
for writing rules ahead of time.

In wide mode the workspace height scales with the canvas (`--hud-h`, half the
canvas height, clamped 310–450), so a taller screen shows more policy rather
than more empty road. A `max-height: 660px` block trims the chrome further for
shallow laptop screens.

The one place a scroll is permitted is the workspace in fluid mode: a phone
cannot show a street, a rule editor and a policy list at once, and clipping
them would be worse. Everything else — every screen, every mode — fits.

## Sound

The original set contained several broadband-noise clips. Measured spectral
flatness (1.0 = white noise):

| clip       | centroid | flatness | verdict                        |
| ---------- | -------- | -------- | ------------------------------ |
| slow       | 3181 Hz  | 0.630    | skid — removed                 |
| wet-brake  | 2594 Hz  | 0.522    | skid — removed                 |
| move-aside | 2218 Hz  | 0.425    | noise — removed                |
| screech    | 2188 Hz  | 0.388    | **crash/tyre screech — removed** |
| squeeze    | 1245 Hz  | 0.160    | scrape — removed               |

`screech` fired on **every** failed run, even though nothing in this mission
ever collides — a failed run means the vehicle had no matching rule, so it
stops. Everything still bundled is tonal (flatness ≤ 0.053).

The replacements are synthesised in `sound.ts`, so their content is known
exactly — pure sine/triangle tones with soft attacks and no noise component:

| cue      | what it means                | shape                        |
| -------- | ---------------------------- | ---------------------------- |
| `ease`   | easing off for a fixed hazard | gentle downward glide        |
| `halt`   | coming to a complete stop     | one low settled note         |
| `warn`   | sensors picked something up   | two soft mid beeps           |
| `deny`   | the policy did not cover this | soft falling two-note        |
| `signal` | indicating to move aside      | indicator tick-tock          |
| `horn`   | warning something that can hear it | warm two-tone            |

## Narrator

Kore, Indian English. The mission ships offline, so narration uses the
browser's own speech engine (`src/narration.ts`) and picks the best
Indian-English voice on the machine, falling back en-IN → en-GB → any English.
The resolved system voice is shown in the pause panel.

Because the voice carries the long version, **on-screen copy is deliberately
short** — the screen shows a line of about a dozen words, the narrator reads
the full sentence (templatization §7: do not print what the voice already
says). Both live in `src/content.ts` as `brief` and `voice`.

> Note: this is the browser's Indian-English voice branded as Kore, not
> Gemini's Kore model — generating that audio needs a TTS credential the build
> does not carry, and bundling it would break the offline-only requirement.

## Templatization compliance

The mission follows the SKAI Space Missions Templatization Guidelines:

- Title screen carries the mission name and a single **Start mission** button.
- Screen 2 is the level map, where Maya Rao introduces the job.
- One fixed bar, along the bottom: current step, mission clock, audio, pause,
  Back and Next. There is no top bar — the street gets the whole screen, and
  inside a level the bottom bar hides too.
- Back / Next never move; **Next stays locked until the screen's activity is
  finished**, and shows a lock instead of an arrow while locked.
- A progress bar sits in the bottom bar and advances by step.
- Every interactive control has hover, active, disabled and selected states.
  Hover changes colour only — nothing moves under the cursor.
- The whole game is laid out on a fixed 1280×720 canvas scaled to the viewport,
  so nothing ever scrolls and nothing ever overlaps at another size.
- Backgrounds are part of the scene, not a separate frame around it.
- A run can be replayed from the result panel ("Replay").
- Touch targets are at least 44px; body type is 17px, problem statements 21px.

Narration reads the on-screen problem statement rather than adding new
information, so a classroom with the narrator switched off loses nothing.

---

## Artwork

**One art direction, no exceptions.** The whole set was regenerated together
because it had drifted into five different rendering languages — a soft-gradient
van, a near-photoreal scooter, a comic-styled child, flat icon barriers and a
hairline-vector street. Five styles on one screen is what made the vehicle read
as a toy dropped onto someone else's drawing; it was never really a scale
problem.

The van is the style anchor and everything else was generated against it as a
reference image: flat-vector with soft airbrushed gradients, matte surfaces, one
soft highlight and one soft shade per plane, no specular, and a single dark navy
outline of uniform weight. Daylight from the upper left throughout.

| Asset | What it is |
| ----- | ---------- |
| `bg-street-run.jpg` | 7460 × 717 — five 16:9 elevations composited into one strip |
| `av-van-drive.png` | 3600 × 451 — four 900 × 451 cells |
| `scooter-parked.png`, `lane-barriers.png`, `child-running.png` | keyed sprites |
| `bg-title-depot.jpg`, `bg-ops-room.jpg`, `ops-lead.png` | title, panels, Maya |

Sprites are generated on flat magenta and keyed: alpha from distance-to-magenta
with a soft edge, then a de-fringe pass that subtracts the magenta the blend
left in the semi-transparent rim, then a trim to the alpha box.

**The street strip.** Each section is generated as a strict orthographic
elevation with the pavement running level from edge to edge, then cropped at the
row where its own drawn road begins — the plate's bottom edge has to BE the top
of the CSS road. That row is found by walking up from the bottom while the row
profile stays flat, since the drawn road is a uniform fill. All five landed on
exactly y=717, which is the check that the sections really are the same street.
They are then gently colour-matched to the first and cross-faded over 260px, so
no tonal step or seam survives.

**The drive strip.** One body, four frames, with only the *hub* of each wheel
rotated in place. Rotating the whole wheel drags the tyre outline and the body
behind it into the crop, which visibly mangled the first attempt; and generating
four bodies would have produced four subtly different vans. Wheel geometry is
measured, not guessed: the two contact patches are the only places the silhouette
touches its own bottom edge, and a tyre tangent to the ground gives the radius
from the chord width — `R = chord² / (8 · depth)`.

The three opaque plates ship as JPEG rather than PNG. The street strip alone
went from 5.95 MB to 0.98 MB, which took the whole package from about 9 MB to
6 MB with no visible loss on flat gradient artwork. Everything with an alpha
channel stays PNG.

## Deploying (Netlify / Vercel)

The project is static-host ready. One command builds one publish folder:

    npm run build:site

`site/` then holds the 3D edition at `/` and the flat 2D edition at `/2d/` —
every asset path is relative, so it serves from any static host or subpath.

- **Netlify**: connect this folder as the site root — `netlify.toml` sets the
  build command and publish dir. Or zero-setup: run the command above and drag
  the `site/` folder onto https://app.netlify.com/drop.
- **Vercel**: import the folder — `vercel.json` sets `buildCommand` and
  `outputDirectory`. No framework preset needed.

## Nothing saved, printed locally

The game keeps NO memory of progress: a refresh, or closing and reopening the
page, starts the whole activity again from the title — by request, so every
class period begins clean. `persist.ts` still holds the (now unused) save
mechanism plus the boot-time wipe of any save an older build left behind.

Device settings (the three volume faders, reduced motion, low graphics) live
under their own key and survive a mission restart: a laptop that needs low
graphics needs it for every class that sits at it.

The mission report carries a **teacher summary** — stops cleared, rules
written, extra attempts, minutes — and a **Print report** key with a print
stylesheet that strips the game and leaves the sheet. Nothing ever leaves the
machine: no account, no server, no analytics endpoint.

## The measurement harnesses

Every one of these was written because reading the code was not enough, and every
one of them caught something. They run against a dev server on :5311 (the flat
one on :5312) and print numbers rather than opinions.

| script | what it proves |
|---|---|
| `solve-card-frame.mjs` | sweeps the card geometry against the live camera for the largest cards that still leave the HUD clear |
| `measure-cards.mjs` | projects all four corners of all three cards and reads the HUD strips' real boxes: nothing off screen, nothing behind copy |
| `probe-outcomes.mjs` | all 24 wrong answers: each is driven, crashes, stops on the road, hands over the camera, inside 13 s |
| `probe-fault-loop.mjs` | one of them with a real pointer: hover, click the card in the canvas, crash, spin past two full turns, zoom, retry, then answer correctly |
| `probe-route.mjs` | every level is drivable — `Stage.marksBehind` is 0, so no hazard sits behind where the last manoeuvre ended |
| `probe-pass.mjs` | where a manoeuvre spends its metres, sampled every 100 ms |
| `probe-hud-fit.mjs` | driving, asking and crashed at five window sizes: nothing leaves the frame, no sideways scroll, the strips never take the middle third |
| `probe-card-occlusion.mjs` | raycasts the lens at all 15 card sample points in 5 scenes: nothing stands in front of an answer |
| `probe-flat-ground.mjs` | decodes the 2D car sprite and proves its tyres stand ON the road, level with the props |
| `probe-flat-edition.mjs` | the 2D edition reaches the same question, crashes, and retries |
| `probe-flat-package.mjs` | the 2D DELIVERABLE boots from `file://` and reaches the question, clicked in the way a classroom does it |
| `measure-gate-clearance.mjs` | 0 overlaps and 0.775 m of clearance threading the closure |
| `measure-rear-framing.mjs` | where the car and the ambulance land in the rear frame |
| `probe-one.mjs` | one card, watched second by second — for diagnosing a hang rather than guessing at it |

Two traps worth knowing about, both of which produced failures that looked like
game bugs and were not:

- **A headed Playwright window that loses focus throttles `requestAnimationFrame`,**
  which nearly stops the render loop, which stops sim time, which means a
  manoeuvre's timeout never expires. Call `page.bringToFront()`. (`until()` now
  carries a wall-clock net as well, so a real child switching tab cannot hang the
  activity either.)
- **Twelve WebGL contexts in one headed Chromium killed the browser** on the
  eleventh scenario. `probe-outcomes.mjs` uses one browser per hazard.

## Dev notes

Dev builds read two query parameters (`src/devtools.ts`, tree-shaken out of the
production bundle):

- `?noanim=1` — Framer Motion resolves instantly, so a full playthrough can be
  scripted in a pane where `requestAnimationFrame` is throttled.
- `?phase=<phase>&rules=base|full&sensors=side&answered=1` — jump straight to a
  screen with the crew, vehicle and policy pre-filled.
- `?go=1` skips an act's briefing, `?editor=1` opens the rule editor on load —
  both only so headless Chrome can screenshot those states. Useful together:

```bash
chrome --headless=new --window-size=1280,720 --screenshot=out.png "http://localhost:5173/?phase=create&rules=full"
```

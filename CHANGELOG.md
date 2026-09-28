# Changelog — The Northline Run

## 2026-09-28 — Any screen, a speaker, and a deliverable under 10 MB

### Every screen size, edge to edge

The board still scales as one 1960 × 1102 piece — every element grows and
shrinks with the screen, and nothing reflows — but it no longer leaves dead
bars. On a screen that is not 16:9 the street and each screen's backdrop fill
the space beside the board, and the chrome pins to the real screen corners: the
back tab in the corner of a 4:3 tablet, the rail on the right edge of an
ultrawide. Mission content stays on the board, where it was designed and
tested. Portrait tablets now turn the board like phones do (an upright iPad
was letterboxing it at 42%, body text near 10 px); a portrait monitor, which
cannot be turned, keeps it upright.

### The speaker, from the AI & Data layout

The newer SKAI layout set draws a speaker left of the info hex and an audio
menu under it — Replay Narration, Mute All Sounds. Both are grafted in path for
path from `Designn systumm/layouts/ai-data.html` (`scripts/graft-speaker.py`),
animate in on the board's own beat, and are wired up. Mute now silences the
recorded narrator too, and the speaker shows a cross while muted.

### 20 MB → 7.3 MB

- The Blender kit is Draco-compressed (4.7 MB → 0.86 MB) with the decoder
  inlined, so it still loads off `file://`. `app.js` 8.6 MB → 2.7 MB.
- Narration re-encoded to 48 kbps mono (7.5 MB → 2.8 MB, every clip's length
  checked against the original).
- Two opaque PNG backdrops became JPEG (1.5 MB → 118 KB); the avatars baked
  into the multiplayer board were 900 px bitmaps drawn at 51 px (920 KB → 170 KB).
- `scripts/package-clean.mjs` writes the clean deliverable,
  `The-Northline-Run-BE6-Play`: index.html, a fresh assets folder, a launcher
  and a one-page guide. 7.31 MB, 5.41 MB zipped.

## 2026-09-04 — The design is the deck's, and the mission is one journey

### The look now comes from the Figma frame, not from an interpretation of it

The previous pass read the SKAI deck's *player chrome* — its world pills and
dot bar — as the design system. They are the slide runner's furniture. The
design is the frame itself (file `iJdgDiZbq1olpbazhfncqZ`, page "Electronic and
engineering", nodes 24:2153 and 80:240), and it is an industrial one:

- **The plate.** A rounded slab on the `#154777 → #2784DD` diagonal, a 2px
  white outline, and four slotted screw heads at the corners — the deck calls
  the part "Volt" (12px `#D9D9D9` disc, 1.33 x 8 `#48515D` slot). Every
  surface in the game is now this one part: panels, cards, keys, the question
  strip, the verdict, the editor, the answer cards standing in the street.
- **The rosette.** Every round key sits in a white twelve-tooth cog. Those are
  the frame's own vectors, cut out into `src/assets/skai/` by
  `scripts/tmp/extract-kit.py` — a cog is not a thing to approximate with
  `border-radius`. Back key, info key, restart, and the three numbered answer
  keys all wear one.
- **The amber.** `#FCA01B` is the workshop colour and it is used where the deck
  uses it: the timer, which is a sign hanging from a wire on two tabs (Group
  1171279095, lifted whole), and the progress rail, which is a hatched column.
- **The type.** Fredoka One for display and Chakra Petch for numerals — the
  deck sets "LET'S INVESTIGATE" and "35:00" in Fredoka and "1/8" in Chakra
  Petch, and the page it lives on is named `font-pairing-fredoka-poppins`, so
  Poppins is the body face. All three are bundled for the offline build.

The three answer cards were the last thing belonging to no system at all —
cream billboards with a candy-striped header. They are the plate now, with the
amber number disc, and they **deal one at a time** rather than sliding up as a
block.

### The mission is one journey, shared between three engineers

- The live road test used to hand straight to the report, and the advanced
  patrols were an optional extra almost nobody reached. The patrols are part of
  the job now: **live road test → patrols → the delivery run → the report.**
- The eight patrols are **dealt round the crew** (`PATROL_TURN`), so every child
  writes rules in the hard half of the activity, not just in the three opening
  stops. Each card carries the name of whoever is writing it.
- **The delivery run** is the finale: the whole street, depot to the Fenner
  Street clinic, on the finished policy, with the car steering itself between
  the marks and the crew's rules deciding what it does when the road surprises
  it. Nothing is asked; the policy answers.

  How long it is was measured, not chosen. `scripts/probe-route.mjs` counts
  hazards whose stop mark falls behind where the previous manoeuvre finished,
  and seven hazards at 0.14 apart left **five** marks behind — the closed
  road's gate manoeuvre alone eats about a fifth of the street. Four marks plus
  the delivery is what this street carries at zero. A longer street for this one
  run is the way to fit more, and it is a change to `Stage`, not to the route.

### Quieter

- The board's and the patrols' sub-headings are gone: the cards say it.
- CREATE / ITERATE / EXTENSION is a label, not a headline — body type at 500,
  half the tracking, sitting back instead of shouting alongside three headings.

### The fit probe learned to see the fault it had been missing

`scripts/probe-fit.mjs` only measured boxes that scroll or clip. A box with
**visible** overflow does neither — its content paints out over whatever is
next — which is exactly what a taller typeface did to eight panels while the
probe reported all clear. It now measures every box, and a fresh guard,
`scripts/check-kit-svg.py`, parses every kit part as XML: a malformed SVG
renders fine inlined and draws **nothing** as a CSS background, silently, which
is how the cog vanished once.

34/34 e2e, every route met from in front, zero fit findings in both editions,
nothing under 24px, nothing changing under the pointer.

## 2026-09-04 — One board, one design language

The layout is rebuilt on a single idea taken from the SKAI slide deck
(`skai-slides/engineering.html`): **the game is a fixed 1920 x 1080 board,
scaled to whatever screen it lands on and letterboxed into the themed
ground.** Everything asked for follows from that rather than being patched in.

- **Nothing overflows, because nothing reflows.** No layout decision reads the
  viewport any more, so a panel that fits at 1920 x 1080 fits at 360 x 640 and
  on a 4K television — it is the same panel, scaled. The old "fluid" mode,
  which restacked every screen on phones and portrait tablets, is gone; it was
  where every overflow bug lived.
- **No scrollbars, and no silent clipping either.** The document is
  `position: fixed` and every screen is designed to the board. `scripts/probe-fit.mjs` walks 10 screens at 13 viewport sizes in both editions and
  reports three kinds of fault — a box that scrolls, a box that clips, and two
  siblings painting on top of each other. **It was 43 findings. It is 0.**
- **Portrait phones turn the board instead of breaking it.** Under 820px and
  properly upright, the board rotates into the screen, so a phone gets the
  whole game rather than a broken column of it.
- **One design language, everywhere.** Deep navy ground (`#0b2545`) lit by the
  deck's two radial glows, a vignette holding it, and chrome made of blurred
  dark-glass with one hairline stroke and one amber accent (`#f7941d`). Round,
  not chamfered: the clip-path slabs, parallelograms and hexagons are gone, and
  with them the "chamfer or stroke, never both" problem — nothing has a chamfer
  now. Every plate, key, card and panel was redrawn to it.
- **Five stylesheets became four, and 5,500 lines became 2,000.**
  `components.css`, `skai.css`, `house.css` and `fault.css` were three layers
  of overrides fighting each other plus four rounds of "LAYOUT REPAIRS". They
  are replaced by `globals.css` (board, tokens, primitives), `screens.css`
  (one section per screen), `street.css` (everything over the drive) and
  `scene.css` (the world, lifted out unchanged — the scene was never the
  problem). ~300 lines of dead CSS for a 2D scene nobody renders went with them.
- **Every panel now states its own budget in the source**, so a future change
  can be checked against arithmetic instead of a screenshot. The patrols panel:
  `824 inner - 100 head - 83 foot - 32 gaps = 529`, and `3 tags + 3 card rows +
  5 gaps = 504`.
- **The rule editor holds a real policy.** A dozen rules used to overlap each
  other in a squeezed two-column list. The panel takes the board (1832 x 992),
  the list flows into a second column after seven rules, and a rule is one
  flowing line of coloured text rather than two rows of pills — a pill charged
  20px of padding per clause, which is what pushed every rule to a third line.
- **The question left the car's roof.** The IF/THEN pill was centred at the
  bottom of the frame, which is exactly where the car is. In 3D it is now
  bottom-left with the keypad under it; in the flat edition the question goes
  to the empty sky at the top and the three answer cards to the bottom, so the
  car between them is never covered.

Still true, and re-proved rather than assumed: **nothing changes under the
pointer** (56 buttons, zero computed-style changes), and **no text on the board
is under 24px** — on a fixed board `--t-body: 1.5rem` is 24 board pixels on
every screen there is.

33/33 e2e, every probe green, both editions rebuilt and repacked.

## 2026-09-03 — Nothing changes under the pointer

The previous pass took the hover states off the ANSWER CARDS and stopped
there; **31 hover rules were still alive in the other four sheets**, and those
were the flashes still on screen: the CTA's `brightness(1.06)`, the amber quit
leaf brightening, the info hex scaling up, `.btn:hover` flipping to white
(which washed its own label out), the editor's close key going orange, chips
flipping navy, panel rows, patrol cards, mission cards, reflect options, the
policy tools.

- Every `:hover` rule is now **deleted at source** from all five loaded
  stylesheets — not toned down, not overridden, so none can creep back. Each
  removed rule was hover-only: no base styling went with them.
- Proven rather than eyeballed: `scripts/tmp/probe-no-hover.mjs` hovers every
  visible button on eight screens and diffs the computed style before and
  after (background, background-image, filter, transform, translate, scale,
  box-shadow, colour, border-colour, opacity). **56 buttons, zero changes.**
- What remains as feedback is deliberate: the plate sinks on press, and the
  picked card holds its amber edge. With neither, a tap would confirm nothing.
- Checked the other half of the report too — every button on every screen
  carries a readable name. The bottom dock's "Back" looked nameless to a first
  pass only because the whole dock is `visibility: hidden` on those screens.

33/33 e2e, probes green.

## 2026-09-03 — Still plates, bigger type, roadworks off the car's lane

- **The barricades stopped overlapping the car.** They stood on the car's own
  ground line, so the car drove through them. A closure now takes the FAR side
  of the road — a long run of barriers and cones behind the car's lane — and
  the car squeezes past in front of it, which is what "the lane is cut to one
  car width" looks like from the side.
- **No hover and no flash anywhere.** Gone: the answer cards' lift and glow in
  both editions, the 3D deck's hover brightening out in the street, the
  keypad's amber flip, the `key-flare` pulse on the picked card, the "?" ring
  pulse, the policy/restart colour flips, the retry key's rear-up, the editor
  chips' jump, the mission cards' lighting, the report dots' nudge. What is
  left is a PRESS — the plate sinks — and the picked card holding its amber
  edge. Three answers that jump as the pointer crosses them are three moving
  targets while a child is still reading, and on a touch screen the state
  never happens at all.
- **A 1.5rem type floor, everywhere.** The ladder moved up (body 1 → 1.5rem,
  h6 1.125 → 1.625, h5 1.375 → 1.875, h4 1.75 → 2.125, h3 2.25 → 2.5, h2 and
  h1 with them), every `clamp()` font minimum in every sheet was lifted to
  24px, and the stragglers written as raw `1rem` were converted. Verified
  mechanically, not by eye: a sweep over every visible element on nine screens
  reporting anything under 23.5px found four leaks (the POLICY label, the
  undo/redo keys, the report step dots) — all fixed, sweep now clean.
- The patrol grid went three columns to four with tighter cards, so the eight
  streets still fit under the bigger type. No screen overflows.

33/33 e2e, probes green.

## 2026-09-03 — One street, plain words, and a road that is actually closed

- **The billboards fit every window.** The card row was positioned with the
  camera's VERTICAL field of view but solved only for 16:9, so on a 16:10 or
  4:3 window the horizontal angle shrank and the three cards spread until they
  touched each other and the screen edges. The row now stands back by the
  shortfall — same three cards at 4:3, 16:10 and 16:9 (checked at five sizes).
- **No ghost card over the street.** The chosen card flew INTO the lens while
  dissolving, dragging a half-transparent billboard across the manoeuvre it had
  just asked about — which read as the game breaking mid-pass. It now flares
  and clears in place.
- **The chapters are one street.** Each chapter used to build only its own
  hazard, so chapter one was a scooter on an empty road and the hospital
  appeared from nowhere later. The scooter, the roadworks gate and the hospital
  now stand on the road in every chapter of the mission; the ones a chapter
  does not ask about are scenery the car never reaches.
- **The hospital is unmistakable**: a white board with a red cross and
  "CLINIC · Fenner Street", high on the frontage. (Its first placement stood
  between the lens and the third card — `probe-card-occlusion.mjs` caught it.)
- **The porter walks forwards.** He was spawned facing the kerb and slid to the
  car without turning, so the one person a child watches closely appeared to
  walk backwards to collect the parcel.
- **IF → THEN is bigger**: +35% in 3D, +60% in the flat edition, where the
  strip IS the question.
- **Plain kid-English on every card.** All 34 labels rewritten short and
  unique — "Pull over, then stop safely" → "Move aside and stop", "Slow right
  down and thread the gap" → "Slow down, squeeze through", "Wait until the
  crossing is empty" → "Wait for everyone to cross". Unique matters: a wrong
  card that read word for word like another hazard's right answer confused both
  the child and the test helpers.
- **2D speed means something.** One speed (0.8) for everything meant a rule
  saying SLOW DOWN looked exactly like driving on. Now cruise 0.44, slow 0.22,
  crawl 0.15 (threading a closure) and fast 0.62 — chosen from the answer's own
  action tokens, so a speed-up crash arrives fast.
- **The closed road is closed.** One barricade sprite left the carriageway
  empty either side; it is now a run of barriers and cones spanning a real
  stretch of road with a tight car-width gap, and the car threads THROUGH the
  gap instead of lifting into the far lane. The dead end has no gap at all.
- The 2D wheel counter is published as `data-roll` so the "wheels never rewind"
  spec can assert the real invariant (mod-4 sampling could not tell "back one"
  from "forward three").

33/33 e2e, probes green.

## 2026-09-02 — The engineering pass: six-lens audit, verified, applied

A senior-dev audit (state machine, 3D performance, 2D runtime, learning design,
audio/a11y, robustness) raised 52 findings; 23 defect claims were adversarially
verified — 18 confirmed, 5 refuted — and the confirmed set plus the design
findings landed:

**The car never freezes or misbehaves**
- A hidden tab PAUSES the drive instead of fake-completing it: the wall-clock
  safety nets on waits and tweens re-arm while `document.hidden`, so the phase
  machine no longer runs ahead of a parked car.
- The 1/2/3 keys are inert behind the pause/info dialog and inside text fields
  (they used to commit a card through the pause menu).
- Reordering or deleting rules in the HALTED editor now does something: if the
  book covers the hazard afterwards, the editor closes and the scan shows the
  rule firing. `commitRule` replaces a same-hazard rule instead of stacking a
  duplicate. The reorder spec now proves the car proceeds (it only checked the
  arrows existed).
- Stage teardown is complete: in-flight commands are cancelled (no thud on the
  next screen), the card deck's canvas textures, the sky and every material map
  are disposed, the WebGL context is released, and the up-front WebGL probe is
  taken once per page instead of leaking a context per level.
- The 2D runner stops touching sound/state after its scene is gone.
- The 2D wheels step from distance rolled — they can no longer spin backwards
  as the car eases off.
- Context-lost slab is centred over the canvas, clears itself when the driver
  recovers, and a kit-load failure now says so instead of a silent black street.

**Classroom-laptop performance (3D)**
- ONE owner for the pixel ratio (resize), the composer sized in CSS px with its
  ratio in step (it was squaring the DPR), adaptive rung 3 as a fixed 0.75×.
- Behind the editor the street renders every fourth frame once settled; the
  canvas blur is gone (the scrim already blurs).
- The adaptive quality rung learned on one level carries to the next.
- `antialias: false` (the composer path never used it); headlights only at
  dusk; the engine synth is fed at 10 Hz with anchored ramps and ignores
  inaudible changes.

**Learning value**
- The rear-sensor lesson is real: the policy is evaluated sensor-aware, so a
  rule for the ambulance written in the editor no longer passes a blind car,
  and fitting the sensor walks the scan before the rule cards deal.
- Rule ORDER is seen to matter: a right card slotted above a broad rule plays
  the scan so the child watches it fire first; a broad rule catching the
  crossing gets its own hint (`broadCaught`), and FULLSTOP at the crossing is
  explained (`busyStop`) instead of failed silently.
- The retry ladder reaches a muted classroom: the coaching line for the next go
  is printed in the verdict strip; the verdict is narrated once the wreck is on
  screen; a wrong pick stops the narrator mid-hint.
- 2D tells the same story as 3D: living hazards are never driven into (a
  nose-to-nose halt, still CRASHED), the ambulance stands BEHIND the car and
  shunts it, fog and rain are drawn on the street.
- Copy fixes: patrol voice lines were never spoken (the brief was read
  instead), success lines were the task, the Report named levels by id.

**Polish, a11y, infra**
- The 2D edition has automated coverage: `e2e/flat.spec.ts` on its own server
  (`scripts/dev-flat.mjs`, port 5211) — 33 tests in two Playwright projects.
- `offline.spec` proves the fonts LOADED off disk, not merely that CSS asked.
- Audio unlocks on the entry gesture (Safari/iPad heard nothing); the siren
  fade can no longer silence a restarted loop; a hidden tab mutes loops and
  stops the narrator; manual reduced-motion reaches framer-motion via
  `MotionConfig`; the question is announced to screen readers; the scan's live
  region is the verdict, not the whole panel; English-only local voices, and
  long briefs are split per sentence so engines that cut out at 15 s finish.
- `build:site` runs `tsc -b` first; stale `dist-2d/` removed.

Deferred (design call, not a defect): "Stop and wait" creeping forward then
crashing; stripping normals/UVs from the kit GLB (needs a Blender rebuild).

## 2026-09-02 — The 3D-card pass: a six-lens design review, applied

The source folder is a **git repository** now (baseline commit taken before
this pass) — every change from here is diffable and revertible.

A six-reviewer design pass (depth, kit consistency, hierarchy, motion, the
2D edition, kid-UX) produced 75 findings, synthesized to 24 changes:

- **The option cards are extruded kit slabs**: flat navy fill, white stroke,
  hand-cut corner radii, per-card lean, top-edge light and two stacked hard
  shadows (the rivet recipe — the kit's own idea of 3D), a hatched
  position-colour band exactly like the 3D deck's faces, and an amber rivet
  number disc with a navy numeral. Hover lifts, press sinks, the picked card
  flares while its rivals stand down, and the flat deck deals in with a
  spring stagger. The 3D keypad became perspective-tilted keycaps.
- **The 3D street cards** matched to the kit: upright type (no italic), the
  off-palette teal replaced with the game's mint family, the same amber
  rivet disc, and an easeOutBack pop on the deal.
- **One CTA game-wide**: every primary key is the kit's cta-plate.svg with a
  navy label (the white-on-amber label was ~2:1 contrast). Amber is unique
  per view again: navy brief tag, navy selected sensors, amber NEW chip.
- **2D revamp**: its own daylight painted-street title, the sky seam
  feathered away, the crash finally reads (car tips 12°, the street takes an
  impact shake, the struck prop is knocked askew), an engine rumble while
  rolling, and the verdict strip seats on the road band.
- **Safety and affordance**: restart is TWO taps (first arms it amber),
  the pause key wears a pause glyph instead of an exit door, any open menu
  blurs the street, the editor's misleading footer "Close" is gone, reorder
  and delete keys are 42px targets with delete set apart, chips are tinted
  slabs (IF navy-tint, THEN amber-tint), report steps are real buttons, and
  the focus ring works on navy panels.
- The deliverable pipeline now REBUILDS both editions before syncing and
  zipping — a stale dist can no longer ship.

## 2026-09-02 — The scan reads one rule at a time; every plate wears the skin

- **The policy scan shows ONE rule at a time**: a rule appears, gets a read
  beat, stamps "No match" and vanishes, and the next rule takes its place —
  until the matching rule lands, stays, and names its action on the amber
  card. Rules below the match are never shown ("first match wins", literally).
  If nothing matches, a dashed **"No rule for this — the car stops to ask."**
  card holds the frame, then the question appears.
- **Scan contrast fixed**: missed rules were painting white-on-white (the base
  sheet's light grey beat the navy skin). A miss now stays navy with white
  copy; the card is bigger, the hazard chip is a rounded amber pill, and the
  slot keeps its height through the swap so the panel doesn't breathe.
- **The IF → THEN strip cleaned up**: IF/THEN are plain white display words on
  the navy plate (the chamfered chips inside a stroked pill broke "chamfer or
  stroke, never both"), the hazard sits in the white pill, and the "?" is an
  amber disc — the design's "yours to decide" colour.
- **The option cards wear the panel skin**: deep navy `#091c56`, white stroke,
  white label, amber number disc, amber border on hover — in both editions,
  keypad keys included. The mismatched blue/amber/teal borders are gone.

## 2026-09-02 — Dark box, light text; no Back key over the street

- **The IF → THEN strip sits on its own navy plate** with a white stroke —
  floated bare over the sky or the tarmac, its light pieces washed out.
- **The in-level Back key is gone entirely** (it kept resurfacing between
  beats). Leaving lives in the pause menu ("Leave this run") and the
  briefing's own back button.
- Flow: level-cleared beat 0.9 s → 0.6 s, flat cruise speed up ~10%, and the
  quieter copy on navy panels brightened for contrast.

## 2026-09-02 — Solo parked; the upload build

- **Solo mode is out of the flow for now**: Start goes straight to the design
  step as a crew of three; the seating picker is unreachable from the UI (it
  and all the solo copy stay in the code and behind the dev query string, so
  bringing solo back is one revert).
- `northline-upload.zip` at the Chrysalis root: the built site (3D at /, 2D
  at /2d/), ready to drag onto Netlify Drop or any static host — and the same
  files open straight from disk. `final.zip` next to it is the full source +
  deliverables backup taken before the change.

## 2026-09-02 — Deploy-ready

- **`npm run build:site`** builds one publish folder: `site/` with the 3D
  edition at `/` and the flat edition at `/2d/`. `netlify.toml` and
  `vercel.json` wire the hosts to it; a `.gitignore` keeps build outputs and
  caches out of the repo the hosts build from. Verified booting both paths
  from a plain static server.

## 2026-09-02 — The journey stops breaking its stride

- **No deep dip at waypoint seams.** The flat car's speed never falls below
  ~half between commands — the eased arrival used to sink to a crawl at
  every hazard mark and read as the car stuttering. Real stops still brake
  hard (a question, a crash, the moving-hazard wait).
- **Chained levels cross-fade.** Flowing from one stop to the next remounts
  the stage with the car on a fresh stretch; without a transition that was a
  hard mid-journey teleport. The cut now fades, both editions.

## 2026-09-02 — No memory: a refresh is a fresh start

- **The game keeps no progress.** The local save no longer loads or writes,
  and any save an older build left behind is wiped on boot — refresh the
  browser and the whole activity starts from the title. (By request: every
  class period begins clean.) Device settings — volumes, reduced motion,
  low graphics — still stick to the machine.

## 2026-09-02 — The report walks, one page at a time

- **The mission report is four steps now** — The result · The policy ·
  Crew & skills · For the teacher — one page at a time with Back/Next and
  clickable step chips, instead of one panel that scrolled and clipped.
  Printing still prints ALL of it: every step is in the DOM and the print
  stylesheet reveals the lot.

## 2026-09-02 — Design step, straight to the report, one board style

- **A design step after the seating pick**: name the car and choose its
  sensors on their own screen (the board keeps the same controls for
  changing your mind later).
- **No question popup after the live road test.** The sign-off review is out
  of the mission flow — the report comes straight up. (The review screen
  still exists behind the dev query string.)
- **The board is three stage boxes side by side again, one style** — the
  CREATE / ITERATE / EXTENSION tags carry the division instead of separate
  sections.

## 2026-09-02 — IF → THEN over every question, and levels flow

- **The rule grammar sits over the answers now**: a slim
  `IF (hazard) THEN ?` chip strip above the cards in both editions — the
  three cards ARE the THEN. The sensor beat reads
  `IF Ambulance behind THEN what must it see?`.
- **No popup between levels.** A cleared stop chains straight into the next
  level's drive — no chapter brief card in the middle; the narrator tells
  the story over the drive instead. The first level of a mission still
  briefs (that is the job's framing), and every level still saves and
  reports exactly as before.
- The floating 2D cards fit narrower windows (they shrink to 200 px before
  wrapping).

## 2026-09-01 — Bigger cards, quieter street, one restart

- **The flat answer cards doubled**: up to 440 px wide and 230 px tall, big
  band, big number disc, big label — sized for a child's finger and readable
  from across a table, still translucent over the street.
- **The Back key stands down while the activity is live.** It returns between
  runs; mid-run, leaving lives in the pause menu as "Leave this run"
  (progress kept). One less button over the street.
- **A restart key, in-level, under the policy key**: one tap wipes the save
  and reloads the whole activity from scratch.

## 2026-09-01 — The flat pass is real

- **The 2D car actually passes what it clears.** `safeStop` capped every
  drive short of every prop — so on a one-hazard level, "slow down and go
  around" ended with the car parked in FRONT of the scooter it had
  supposedly passed. A cleared hazard's manoeuvre now drives to its far
  side (still capped before the NEXT hazard), through the drawn far-lane
  pass.
- **The pass no longer floats.** The lane-change lift eases over 0.5 s
  instead of teleporting, and the contact shadow rides up to the far lane
  with the car — a car hanging above its own shadow was the whole
  "it is in the air" feeling.
- **Momentum across command seams.** A finished drive keeps the engine and
  wheel cycle alive for 300 ms; only a question, a crash or the end of the
  journey truly stops the car. Arrivals ease out, pull-aways ramp up.
- **Street life**: the cyclist rocks like someone pedalling, the dog trots,
  people shift their weight, the child sprints in after the ball, the
  ambulance closes in from behind. The original sprite set stays — the
  generated replacements did not sit with the painted backdrop (kept on
  disk under `art2d/` and `src/assets/img/flat2d/`, unused).

## 2026-08-31 — One journey: the car only stops to ask

- **A covered hazard is not a stop any more.** The policy is judged silently
  the moment the car arrives: if a rule covers the hazard, the car simply
  carries it out and drives on — no reveal hold, no "reading the policy"
  walk, no toast. The car halts only when it has a QUESTION, and the only
  thing that then appears is the three cards. Both editions, same flow.
- **The "Rule fired" toast and the "Past the scooter" success panel are
  gone.** The car doing the right thing is the feedback; the results still
  land in the mission report. Levels chain after a short beat and the win
  jingle instead of a 2.4 s panel hold.
- Hazards with an entrance (the ball and child, the crowd, the dog, the
  ambulance) still play it before the rule answers them — a car that
  full-stops for a child nobody saw run out is a car stopping for nothing.
- The scan panel keeps exactly two jobs: explaining a HALT (walking the
  misses when nothing covered the hazard, or the wrong rule that stole it),
  and showing priority fire on the editor's own re-run.

## 2026-08-31 — The flat edition flows

- **The 2D car stops standing around.** Its halts were the 3D timings with none
  of the 3D choreography to fill them: a 0.9 s reveal hold, a 460 ms-per-rule
  scan walk, and a 0.6 s pause after every cleared stop, all played on a car
  that just sits there. The flat edition now reveals in 0.4 s, walks the scan
  at 280 ms per rule, rolls on 0.22 s after a pass (the moving-hazard wait
  stays long — that wait IS the lesson), and drives ~30% faster between stops.
  The 3D edition's timings are untouched.
- **The flat options are cards now**: the same flash-card anatomy as the 3D
  deck — coloured border and header band (navy/amber/teal by position), white
  number disc, big navy label — slightly translucent over the street.

## 2026-08-31 — The SKAI plate skin, and the board divided

- **One design language**, taken from the reference HUD in
  `SKAI  design (1)/SKAI  design`: white chamfered plates for boards and
  reading panels, deep-navy `#091c56` panels with a thick white stroke for
  every floating pop-up (pause menu, policy scan, crash verdict, info), and
  the amber `#fca01b` CTA plate — white stroke, white uppercase Chakra Petch
  label — for every primary key. Amber = lit/fired/go, exactly like the
  design's progress rail. The warm-cream "house" skin retired.
- **Cards and keys retinted to the design plates**: card one is the timer
  plate's navy `#0a2d94`, card two the CTA amber; faces are white plates, and
  the 1·2·3 keys carry white strokes like the design's badges.
- **The board divided.** Two core jobs under a navy THE MISSION tag, and the
  patrol set as its own wide strip under an amber AFTER SIGN-OFF · OPTIONAL
  tag — visibly an extension, not a third equal mission, with its eight
  streets as chips.
- **The patrol board grouped**: People in the street · The road itself ·
  Seeing behind — eight patrols in three kinds of trouble, reordered to match
  (dog is now card 3; the rear-sensor patrol closes the set).

## 2026-08-31 — The popups go

- **No panels at a checkpoint.** The top fault banner and the bottom question
  panel — the same cream rectangles at every single stop — are gone. The three
  cards standing in the street are the whole question; what remains on the DOM
  is one slim 1·2·3 keypad row (the keyboard, screen-reader and touch route,
  each key named with its card's full text).
- **The flat edition's keys grew into the options.** It never had cards in a
  street, so its three keys now carry the answer text in full — the first time
  the 2D edition shows its options as readable buttons.
- **The scan panel earns its screen time.** "Reading the policy… no rules yet"
  no longer pops at every fresh checkpoint; the scan appears only when there is
  a policy to read, and the priority lesson keeps it.
- The hint is narrated at the stop (as before) and the coaching line still
  escalates in the rule editor; it is just no longer printed over the street.

## 2026-08-31 — Less text, bigger type

- **Nothing under 1rem.** The type scale is rem-based and 1rem (16px) is now the
  floor everywhere: every 10–15px chip, count, caption, verdict and scan row is
  16px+, and every `clamp()` in the question HUD bottoms out at 16px. The report
  captions and "Retried" line (12/13px via `font:` shorthand) included.
- **One screen, one telling.** The banner's sub-line is gone — the street shows
  the scene, the hint carries the reasoning. Card `detail` sub-lines and the
  never-rendered banner `sub` copy deleted from the data. Every `why` trimmed to
  its lesson. Pause menu drops the budget clause, the crash card its duplicate
  tag line, the report reads "Skills signed off". Hints and answers keep every
  teaching point — they just say it once.

## 2026-08-30 — Polish pass: persistence, settings, teacher tools, street life

- **Local save.** Progress, crew names, vehicle name, sensors, the whole policy
  and every cleared stop persist in `localStorage`; the title screen offers
  **Continue mission**. Versioned, corruption-safe (a bad blob means a fresh
  start, never a wedge), and inert under dev/test query strings so the suite
  stays deterministic.
- **Pause-menu settings.** Street / Car / Effects volume faders, Reduced
  motion, Low graphics (shadows + bloom off, pixel ratio 1, direct render) and
  Fullscreen. Device-level: they survive "Restart the mission".
- **WebGL context loss** now shows a friendly reload card instead of a frozen
  frame, and reminds the child their progress is saved.
- **Policy undo/redo** (20 steps) in the editor — the one place a mis-tap is
  destructive.
- **Teacher report.** The mission report gains a summary row (stops cleared,
  rules, extra attempts, minutes) and a **Print report** button with a print
  stylesheet. Offline only; nothing leaves the machine.
- **Street life.** Pedestrian-signal heads at the crossings, parked cars in
  far-side laybys, clouds.

## 2026-08-30 — One place, one look

- 3D shops rebuilt as the 2D painting's **townhouses**: same sampled palette
  (terracotta, sage, slate, tan, cream, brick), parapets with cornices, cream
  window frames, white fascias, striped awnings built from real slats.
- **house.css**: one warm, rounded, hard-shadow theme for every panel, card and
  button. The dark "Asphalt" racing skin retired (kept in the repo, unimported).

## 2026-08-27…30 — The crash-and-learn rebuild

- The question is three **3D cards standing in the street** — no dialogue box.
- **One fixed low rear camera**; the per-hazard camera swings and the five-view
  switcher removed.
- **Every wrong answer is driven and crashes** (prop / kerb / shunt endings);
  the camera is then the child's — full 360°+ orbit and zoom — with a round
  **Try again** key that restores the street exactly.
- Rear-sensor lesson as cards with coverage diagrams painted on the faces.
- Street decluttered (timer, rail, info key, hint bulb, camera dock, sensor
  sweep removed in-level); one policy key, top right, always reachable.
- World lengthened to 144 m; stop marks derived from real hazard positions;
  level 4 reordered; manoeuvres made cancellation-safe; wall-clock nets so a
  backgrounded tab can never hang the lesson.
- The flat 2D edition brought to parity: grounded car, real crash and retry,
  speed-true wheel animation, contact shadow.

## Earlier

- Mahindra BE 6 hero car and full Blender asset kit; SKAI Space HUD; the
  original fault-card interaction; seven advanced patrols; the priority scan;
  the mission report and reflection.

/**
 * Does every player actually get the wheel, the same number of times?
 *
 *   node scripts/probe-turns.mjs              (dev server on :5210)
 *   node scripts/probe-turns.mjs patrols      (chapter 3 only — the fast case)
 *
 * The turn rotation used to be dealt by stop INDEX, which silently skipped
 * people: a stop the crew's own rulebook already answers never asks, so its
 * assigned player lost their turn and their counter stuck one short forever.
 * The market crossing does exactly that — the broad MOVING rule written on the
 * live road test also matches a crowd.
 *
 * So this plays the real thing with the real policy carrying forward, records
 * which player owned every stop that actually asked, and asserts:
 *   · every asking stop has an owner
 *   · owners come round in strict order, 0, 1, 2, 0, 1, 2 …
 *   · nobody finishes more than one decision behind anybody else
 *   · nobody is left on zero
 */
import { chromium } from 'playwright'

const RIGHT_ACTION = {
  'Scooter ahead': 'Go slowly',
  'Narrow gate ahead': 'Go slowly',
  'Destination reached': 'Stop and deliver',
  'Something moving': 'Stop the car',
  'Many things moving': 'Wait until clear',
  'Wet road': 'Brake early + Leave a big gap',
  'Ambulance behind': 'Move aside + Stop safely',
  'Cyclist ahead': 'Go slowly + Leave a big gap',
  'Dog in the road': 'Stop the car + Beep once',
  'Road blocked': 'Beep once',
  Fog: 'Brake early + Beep once',
  'Road closed ahead': 'Turn around',
  'the sensors are upgraded': 'Front, sides and back',
}

/** Cards speak the car's standard action vocabulary, so the right answer is
 *  looked up by the situation the cards are asking about — "Go slowly" is
 *  right for a parked scooter and wrong at the clinic gate. */
const askedAndDealt = (page) => page.evaluate(() => ({
  asked: (document.querySelector('.skai-if-chip')?.textContent ?? '').replace(/^IF\s*/i, '').trim(),
  dealt: [...document.querySelectorAll('.skai-choice')].map((n) => n.getAttribute('data-actions') ?? ''),
}))

const MODE = process.argv[2] ?? 'full'
const RUNS = MODE === 'patrols'
  ? [{ name: 'chapter3 · 3 players', url: '?phase=levels&cleared=1&rules=full&noanim=1', size: 3 }]
  : MODE === 'four'
    // A crew of four over the same twelve stops: three decisions each.
    ? [{ name: 'whole run · 4 players', url: '?phase=levels&crew=4&noanim=1', size: 4 }]
    : [{ name: 'whole run · 3 players', url: '?phase=levels&noanim=1', size: 3 }]

const browser = await chromium.launch({
  headless: false,
  args: [
    '--window-position=-2600,40',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
})
const problems = []

for (const run of RUNS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (error) => problems.push(`${run.name}: page error ${error.message}`))
  await page.goto(`http://localhost:5210/${run.url}`)
  await page.waitForSelector('button.hit-cta', { timeout: 30000 })

  const order = []           // [{ stop, owner }] in the order they were decided
  const started = Date.now()
  let finished = false

  while (Date.now() - started < 900000) {
    const state = await page.evaluate(() => {
      const game = window.__game?.getState?.()
      const act = document.querySelector('.act-screen')
      return {
        phase: act ? act.getAttribute('data-phase') : null,
        onBoard: Boolean(document.querySelector('.journey-board')),
        onReport: Boolean(document.querySelector('.report-panel')),
        stop: game?.phase === 'patrols' ? game?.patrolId : game?.levelId,
        turnIndex: game?.turnIndex ?? null,
        turnOwner: game?.turnOwner ?? {},
        ctaLocked: document.querySelector('button.hit-cta')?.disabled ?? true,
      }
    })

    if (state.onReport) { finished = true; break }

    if (state.onBoard) {
      // the board's key starts (or continues) the chapter — or ends the run
      await page.locator('button.hit-cta').click().catch(() => null)
      await page.waitForTimeout(700)
      continue
    }

    if (state.phase === 'choose') {
      const { asked, dealt } = await askedAndDealt(page)
      const index = dealt.indexOf(RIGHT_ACTION[asked])
      if (index < 0) {
        problems.push(`${run.name}: no right answer for "${asked}" among ${dealt.join(' | ')} at stop ${state.stop}`)
        break
      }
      await page.locator('.skai-choice').nth(index).click()
      await page.locator('button.hit-cta').click().catch(() => null)
      await page.waitForTimeout(500)
      continue
    }

    if (state.phase === 'complete') {
      const owner = state.turnOwner[state.stop]
      if (state.stop !== 'delivery') {
        order.push({ stop: state.stop, owner: owner === undefined ? null : owner })
      }
      await page.locator('button.hit-cta').click().catch(() => null)
      await page.waitForTimeout(600)
      continue
    }

    await page.waitForTimeout(250)
  }

  if (!finished) problems.push(`${run.name}: the run never reached the report`)

  // ---- the rotation, checked ---------------------------------------------
  const decided = order.filter((row) => row.owner !== null)
  const skipped = order.filter((row) => row.owner === null).map((row) => row.stop)
  const counts = Array.from({ length: run.size }, (_, i) => decided.filter((row) => row.owner === i).length)

  console.log(`\n${run.name}`)
  for (const row of order) {
    console.log(`  ${String(row.stop).padEnd(10)} ${row.owner === null ? 'answered by the rulebook (no turn spent)' : `player ${row.owner + 1}`}`)
  }
  console.log(`  decisions per player: ${counts.join(' / ')}${skipped.length ? `   (${skipped.length} stop(s) the policy answered: ${skipped.join(', ')})` : ''}`)

  for (let i = 1; i < decided.length; i += 1) {
    const want = (decided[i - 1].owner + 1) % run.size
    if (decided[i].owner !== want) {
      problems.push(`${run.name}: the wheel jumped — ${decided[i].stop} went to player ${decided[i].owner + 1}, expected player ${want + 1}`)
    }
  }
  if (Math.max(...counts) - Math.min(...counts) > 1) {
    problems.push(`${run.name}: unequal turns ${counts.join('/')} — more than one decision apart`)
  }
  if (counts.some((n) => n === 0)) {
    problems.push(`${run.name}: a player never got the wheel (${counts.join('/')})`)
  }
  await page.close()
}

console.log(problems.length
  ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}`
  : '\nthe wheel goes round: every player decides, in turn, the same number of times')
await browser.close()
process.exit(problems.length ? 1 : 0)

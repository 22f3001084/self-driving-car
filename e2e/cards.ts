import { expect, type Page } from '@playwright/test'

/**
 * Answering the situation popup, for the specs.
 *
 * The SKAI board owns the chrome: when the car stops for a hazard the
 * `.skai-situation` popup lands with three IF → THEN cards, and the board's own
 * CTA plate (`.hit-cta`, a transparent hit area over the artwork's key) is the
 * single primary action — TEST MY RULE, TRY AGAIN, NEXT CHALLENGE.
 *
 * Cards now speak the car's STANDARD action vocabulary, so the same words
 * appear for the same action on every hazard. That makes a single global list
 * of "right answers" ambiguous — "Go slowly" is correct for a parked scooter
 * and quite wrong at the clinic gate — so the right answer is looked up by the
 * card's IF instead. Each card also carries the canonical action string in
 * `data-actions`, which is what these helpers match on.
 */

/** The situation (the card's IF) -> the action that answers it correctly. */
export const RIGHT_ACTION: Record<string, string> = {
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
  /** The rear-sensor question, which comes before the ambulance's rule cards. */
  'the sensors are upgraded': 'Front, sides and back',
}

/** The board's CTA plate: one transparent key over the artwork. */
export const cta = (page: Page) => page.locator('button.hit-cta')

/** The canonical actions currently dealt, in card order. */
export async function dealtCards(page: Page): Promise<string[]> {
  return page.locator('.skai-choice').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-actions') ?? ''),
  )
}

/** What this situation is asking about: the popup states the IF once, above
 *  the cards, so that chip is the single source of it. */
export async function situation(page: Page): Promise<string> {
  const text = await page.locator('.skai-if-chip').first().innerText()
  return text.replace(/^IF\s*/i, '').trim()
}

/** The right answer for whatever is on screen. */
export async function rightAnswer(page: Page): Promise<string> {
  const asked = await situation(page)
  const answer = RIGHT_ACTION[asked]
  expect(answer, `no right answer recorded for the situation "${asked}"`).toBeTruthy()
  return answer
}

/**
 * Walk the tutorial with the board's own key until the journey board appears.
 *
 * Deliberately not a fixed number of clicks: the tutorial has grown from three
 * slides to five and will grow again, and a spec that counts them fails for a
 * copy change rather than for a defect.
 */
export async function walkTutorial(page: Page) {
  await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 30_000 })
  for (let click = 0; click < 10; click += 1) {
    await cta(page).click()
    if (await page.locator('.journey-board').count()) return
    await page.waitForTimeout(150)
  }
  throw new Error('the tutorial never handed over to the journey board')
}

export async function waitForSituation(page: Page, timeout = 90_000) {
  await expect(page.locator('.skai-situation')).toBeVisible({ timeout })
  await expect(page.locator('.act-screen')).toHaveAttribute('data-phase', 'choose', { timeout })
}

/**
 * Answer the situation the car has stopped for, correctly, and take the
 * NEXT CHALLENGE key when the star popup lands.
 *
 * A hazard can ask more than once: the ambulance beat asks for the car's
 * SENSORS first, so this keeps answering `choose` rounds until the stop
 * completes.
 */
export async function solveStop(page: Page) {
  await waitForSituation(page)
  for (let round = 0; round < 3; round += 1) {
    const dealt = await dealtCards(page)
    expect(dealt.length, `expected three cards, got ${dealt.join(' | ')}`).toBe(3)
    const want = await rightAnswer(page)
    const index = dealt.indexOf(want)
    expect(index, `"${want}" was not dealt among ${dealt.join(' | ')}`).toBeGreaterThanOrEqual(0)
    await page.locator('.skai-choice').nth(index).click()
    await expect(cta(page)).toBeEnabled()
    await cta(page).click()
    // Either the car performs the rule (testing → complete), or — after a
    // sensor fit — the same popup re-deals with the action cards.
    await page.waitForFunction(() => {
      const phase = document.querySelector('.act-screen')?.getAttribute('data-phase')
      return phase === 'complete' || phase === 'choose'
    }, null, { timeout: 90_000 })
    const phase = await page.locator('.act-screen').getAttribute('data-phase')
    if (phase === 'complete') break
  }
  // The star popup: NEXT CHALLENGE moves the mission on.
  await expect(page.locator('.act-screen')).toHaveAttribute('data-phase', 'complete')
  await expect(cta(page)).toBeEnabled()
  await cta(page).click()
}

/**
 * Answer it WRONGLY, on purpose, and wait for the fix-it popup.
 * Every wrong card is driven out in the street and ends badly; the popup
 * reads the failed rule back. Returns the action picked and the popup lead.
 */
export async function crashStop(page: Page) {
  await waitForSituation(page)
  const dealt = await dealtCards(page)
  const want = await rightAnswer(page)
  const index = dealt.findIndex((action) => action !== want)
  expect(index, `only the right answer among ${dealt.join(' | ')}`).toBeGreaterThanOrEqual(0)
  await page.locator('.skai-choice').nth(index).click()
  await cta(page).click()
  await expect(page.locator('.act-screen')).toHaveAttribute('data-phase', 'review', { timeout: 90_000 })
  return {
    picked: dealt[index],
    lead: (await page.locator('.skai-situation .skai-clue').innerText()).trim(),
  }
}

/** Take the retry the fix-it popup offers (TRY AGAIN on the board's key). */
export async function tryAgain(page: Page) {
  await expect(cta(page)).toBeEnabled()
  await cta(page).click()
  await waitForSituation(page, 60_000)
}

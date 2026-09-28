import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeForLesson, sceneForLesson } from '../src/lessonFlow'
import { useGame } from '../src/store'
import { evaluateAt } from '../src/sim'

test('engineer handoffs stay on one street and advance to hazards ahead', () => {
  const game = useGame.getState
  game().reset()
  game().openMission('closed')
  const stops: number[] = []
  for (const [level, trigger, actions] of [
    ['l1', 'SCOOTER', ['SLOW']],
    ['l2', 'NARROW', ['SLOW']],
    ['l3', 'ARRIVED', ['DELIVER']],
  ] as const) {
    assert.equal(game().phase, 'play')
    assert.equal(game().levelId, level)
    assert.equal(sceneForLesson(level), 'l3', 'never replace the scene at a handoff')
    const route = routeForLesson(level, game().chained)
    assert.deepEqual(route.map((point) => point.trigger), [trigger])
    stops.push(route[0].x)
    game().commitRule(trigger, [...actions])
    assert.equal(evaluateAt(game().rules, trigger).ok, true)
    game().markPassed(level)
    game().finishLevel(level)
  }
  assert.ok(stops.every((x, i) => i === 0 || x > stops[i - 1]), 'never drive back to the depot')
  assert.equal(game().rules.length, 3, 'keep all three engineers’ answers')
  assert.equal(game().phase, 'levels', 'leave only after delivery')
})

test('standalone verification and the other games retain their complete routes', () => {
  assert.deepEqual(routeForLesson('l3', false).map((point) => point.trigger), ['SCOOTER', 'NARROW', 'ARRIVED'])
  for (const id of ['l4', 'dog', 'cyclist', 'delivery'] as const) {
    assert.equal(sceneForLesson(id), id)
    assert.deepEqual(routeForLesson(id, true), routeForLesson(id, false))
  }
})

test('duplicate or late completions cannot skip the gate or restart a departed run', () => {
  const game = useGame.getState
  game().reset()
  game().openMission('closed')
  game().commitRule('SCOOTER', ['SLOW'])
  game().finishLevel('l1')
  assert.equal(game().passed.l1, true)
  assert.equal(game().levelId, 'l2')
  game().finishLevel('l1')
  assert.equal(game().levelId, 'l2')
  assert.equal(game().passed.l2, undefined)
  game().finishLevel('l2')
  assert.equal(game().levelId, 'l3')
  game().finishLevel('l2')
  assert.equal(game().levelId, 'l3')
  game().closeLevel()
  game().finishLevel('l3')
  assert.equal(game().phase, 'levels')
  assert.equal(game().passed.l3, undefined)
  assert.equal(game().rules.length, 1)
})

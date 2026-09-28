import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useGame } from '../src/store'

test('later chapters cannot be opened from a fresh team', () => {
  const game = useGame.getState
  game().reset()
  game().openMission('patrols')
  assert.equal(game().missionId, null)
  game().openMission('live')
  assert.equal(game().missionId, null)
  game().openMission('closed')
  assert.equal(game().missionId, 'closed')
})

test('completed chapters cannot wipe the shared rulebook by replaying', () => {
  const game = useGame.getState
  game().reset(); game().openMission('closed')
  game().commitRule('SCOOTER', ['SLOW'])
  for (const id of ['l1', 'l2', 'l3'] as const) game().finishLevel(id)
  game().openMission('closed')
  assert.equal(game().phase, 'levels')
  assert.equal(game().rules.length, 1)
  game().openMission('live')
  assert.equal(game().rules.length, 1)
})

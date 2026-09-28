import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useGame } from '../src/store'
import { PARTS, activePart, playerFor, canStartPart } from '../src/campaign'
import { PATROLS } from '../src/content'
import { CHOICES } from '../src/choices'
import { evaluateAt, waypointsFor } from '../src/sim'

test('only the first unfinished player chapter opens', () => {
  const g = useGame.getState
  g().reset(); g().openMission('live'); assert.equal(g().phase, 'title')
  g().openMission('patrols'); assert.equal(g().phase, 'title')
  g().openMission('closed'); assert.equal(g().levelId, 'l1')
  g().finishLevel('l1'); g().finishLevel('l1'); assert.equal(g().levelId, 'l2')
  g().finishLevel('l2'); g().finishLevel('l3')
  assert.equal(activePart(g().passed), 1)
  g().openMission('closed'); assert.equal(g().phase, 'levels')
  g().openMission('live'); assert.equal(g().levelId, 'l4')
})
test('all three players inherit the same successful rules and unlock in order', () => {
  const g = useGame.getState
  g().reset(); g().setCrew(0, 'Asha'); g().setCrew(1, 'Kabir'); g().setCrew(2, 'Mia')
  g().openMission('closed')
  for (const [id, condition, action] of [['l1','SCOOTER','SLOW'],['l2','NARROW','SLOW'],['l3','ARRIVED','DELIVER']] as const) {
    g().commitRule(condition,[action]); g().finishLevel(id)
  }
  g().openMission('live'); assert.equal(g().rules.length,3)
  assert.equal(evaluateAt(g().rules,'MOVING').ok,false)
  g().commitRule('MOVING',['FULLSTOP']); g().finishLevel('l4')
  g().openMission('patrols'); assert.equal(g().rules.length,4)
  assert.equal(playerFor(g().missionId),2)
  for (const patrol of PATROLS) {
    assert.equal(g().patrolId, patrol.id)
    for (const point of waypointsFor(patrol.id)) {
      const choice = CHOICES[point.trigger]?.find(c => c.correct)
      assert.ok(choice, `answer exists for ${point.trigger}`)
      g().commitRule(point.trigger,choice.actions)
      assert.equal(evaluateAt(g().rules,point.trigger).ok,true)
    }
    g().finishPatrol(patrol.id)
  }
  assert.equal(g().patrolId,'delivery'); assert.equal(activePart(g().passed),2)
  g().finishPatrol('delivery'); assert.equal(activePart(g().passed),-1)
  assert.equal(g().phase,'levels'); assert.deepEqual(g().crew,['Asha','Kabir','Mia'])
  for (const part of PARTS) assert.equal(canStartPart(part.id,g().passed),false)
})
test('leaving and resuming keeps progress, and late callbacks cannot advance', () => {
  const g = useGame.getState
  g().reset(); g().openMission('closed'); g().commitRule('SCOOTER',['SLOW']); g().finishLevel('l1')
  g().closeLevel(); g().finishLevel('l2'); assert.equal(g().passed.l2,undefined)
  g().openMission('closed'); assert.equal(g().levelId,'l2'); assert.equal(g().rules.length,1)
})

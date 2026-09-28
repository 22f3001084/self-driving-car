import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateRun, type Rule } from '../src/sim'

let seq = 0
const rule = (conditions: string[], actions: string[], elseActions?: string[]): Rule => ({
  id: `r${++seq}`,
  conditions: conditions.map((token, index) => ({ token, ...(index > 0 ? { join: 'OR' as const } : {}) })),
  actions: actions.map((token, index) => ({ token, ...(index > 0 ? { join: 'AND' as const } : {}) })),
  ...(elseActions ? { elseActions: elseActions.map((token) => ({ token })) } : {}),
})

const CREATE_POLICY = () => [
  rule(['SCOOTER'], ['SLOW']),
  rule(['NARROW'], ['SLOW']),
  rule(['ARRIVED'], ['DELIVER']),
]

test('a policy covering both surveyed hazards completes the closed-road test', () => {
  const result = evaluateRun(CREATE_POLICY(), 'create')
  assert.equal(result.outcome, 'success')
  assert.equal(result.steps.length, 3)
})

test('the surveyed policy always fails at the moving hazard on the live test', () => {
  const result = evaluateRun(CREATE_POLICY(), 'iterate')
  assert.equal(result.outcome, 'failMoving')
  assert.equal(result.failedAt, 'MOVING')
})

test('slowing down for a moving hazard is still a failure', () => {
  const result = evaluateRun([...CREATE_POLICY(), rule(['MOVING'], ['SLOW'])], 'iterate')
  assert.equal(result.outcome, 'failMoving')
  assert.equal(result.hintKey, 'movingSlowNotStop')
})

test('a full stop for anything moving passes the live test', () => {
  const result = evaluateRun([rule(['MOVING'], ['FULLSTOP']), ...CREATE_POLICY()], 'iterate')
  assert.equal(result.outcome, 'success')
})

test('an OR condition covers both of its situations', () => {
  const policy = [rule(['SCOOTER', 'NARROW'], ['SLOW']), rule(['ARRIVED'], ['DELIVER'])]
  assert.equal(evaluateRun(policy, 'create').outcome, 'success')
})

test('an ELSE branch supplies the default behaviour when nothing matches', () => {
  const policy = [rule(['ARRIVED'], ['DELIVER'], ['SLOW'])]
  const result = evaluateRun(policy, 'create')
  assert.equal(result.outcome, 'success')
  assert.equal(result.steps[0].viaElse, true)
  assert.equal(result.steps[2].viaElse, undefined)
})

test('an ELSE branch of slow-and-pass is not enough for a moving hazard', () => {
  const policy = [rule(['ARRIVED'], ['DELIVER'], ['SLOW'])]
  assert.equal(evaluateRun(policy, 'iterate').outcome, 'failMoving')
})

test('decoy actions never pass', () => {
  const policy = [rule(['SCOOTER'], ['TURN']), rule(['NARROW'], ['SLOW']), rule(['ARRIVED'], ['DELIVER'])]
  const result = evaluateRun(policy, 'create')
  assert.equal(result.outcome, 'failScooter')
  assert.equal(result.hintKey, 'decoyTurn')
})

test('a broad moving rule above a specific one is reported as a rule-order failure', () => {
  const policy = [rule(['MOVING'], ['FULLSTOP']), rule(['EMERGENCY_BEHIND'], ['MOVE_ASIDE', 'STOP_SAFE'])]
  const result = evaluateRun(policy, 'emergency')
  assert.equal(result.outcome, 'failRuleOrder')
  assert.deepEqual(result.highlightedRuleIds.length, 1)
})

test('reordering the specific rule above the broad one fixes the priority patrol', () => {
  const policy = [rule(['EMERGENCY_BEHIND'], ['MOVE_ASIDE', 'STOP_SAFE']), rule(['MOVING'], ['FULLSTOP'])]
  assert.equal(evaluateRun(policy, 'emergency').outcome, 'success')
})

test('the wet patrol rates both safe actions higher than one', () => {
  assert.equal(evaluateRun([rule(['ROAD_WET'], ['SLOW_EARLY'])], 'rain').rating, 'safer')
  assert.equal(evaluateRun([rule(['ROAD_WET'], ['SLOW_EARLY', 'LEAVE_SPACE'])], 'rain').rating, 'best')
})

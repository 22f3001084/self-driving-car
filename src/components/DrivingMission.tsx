import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TILES, type Level } from '../content'
import { SENSES_BEHIND, useGame } from '../store'
import { STOP_ORDER, driverAt, faceFor, ownerOf, playerName, starsFor } from '../campaign'
import { CHOICES, SENSOR_CHOICES, hazardHint, shuffled } from '../choices'
import { evaluateAt, type EventToken } from '../sim'
import { routeForLesson, sceneForLesson } from '../lessonFlow'
import Scene, { WORLD, markFor, type SceneCommand } from './Scene'
import { TILE_ICONS, IconSensor } from '../icons'
import { PLAYER_FACES } from './CampaignSetup'
import { useCta, useHud } from '../hud'
import { play } from '../sound'
import { narrate, stopNarration } from '../narration'

type Step = 'driving' | 'revealing' | 'choose' | 'testing' | 'review' | 'complete'
const CLUES: Partial<Record<EventToken, string>> = {
  SCOOTER: 'A parked scooter is blocking part of your lane.', NARROW: 'The road narrows to a small gap. Your car must fit through.',
  ARRIVED: 'You reached the clinic. The parcel is still in the car.', MOVING: 'A child is crossing the road in front of you.',
  MANY_MOVING: 'People are still using the crossing.', CYCLIST: 'A cyclist is ahead. There is no safe space to overtake.',
  DOG: 'The dog has not noticed your quiet car.', ROAD_WET: 'The road is wet. The car needs more space to stop.',
  FOG: 'Fog makes it hard to see the road ahead.', EMERGENCY_BEHIND: 'An ambulance behind you needs a clear path.',
}

/** The car's standard action vocabulary, in the car's own words. */
function actionWords(tokens: string[]) {
  return tokens.map((token) => TILES[token]?.label ?? token)
}

/** And their standard plain-English definitions, joined in order. */
function actionGloss(tokens: string[]) {
  return tokens.map((token) => TILES[token]?.gloss ?? '').filter(Boolean).join(' ')
}

/**
 * One challenge at a time over the live street. When a situation arises the
 * car stops and the SITUATION popup lands: the clue, whose turn it is, and
 * three IF–THEN cards. The board's own CTA plate tests the chosen rule, so
 * every action in the mission goes through the same key.
 */
export default function DrivingMission({ level, onAdvance }: {
  level: Level; onAdvance: () => void; onExit: () => void
}) {
  const {
    crew, crewCount, crewFaces, vehicleName, passed, retries, sensors, narration, turnIndex, turnOwner,
    commitRule, registerRetry, setSensors, setChallenge, claimTurn, passTurn,
  } = useGame()
  const setHint = useHud((s) => s.setHint)
  const setSpotlight = useHud((s) => s.setSpotlight)
  const size = crewCount
  // Who is at the wheel for THIS stop, and who takes the next one. The stop
  // claims its player the moment it asks, so the handoff is a named act
  // rather than something the crew has to work out for themselves.
  const player = ownerOf(level.id, turnOwner, turnIndex, size)
  const nextStop = STOP_ORDER.find((id) => !passed[id] && id !== level.id) ?? null
  const nextDriver = nextStop === 'delivery' ? -1 : driverAt(turnIndex, size)
  const route = useMemo(() => routeForLesson(level.id, level.id === 'l3' && Boolean(passed.l1 && passed.l2)), [level.id, passed.l1, passed.l2])
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState<Step>('driving')
  const [command, setCommand] = useState<SceneCommand | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [testedLabel, setTestedLabel] = useState('')
  const [testedActions, setTestedActions] = useState<string[]>([])
  const serial = useRef(0)
  const currentLesson = useRef(level.id)
  currentLesson.current = level.id
  const pending = useRef(false)
  const wrong = useRef(false)
  const activeCommand = useRef(0)
  const waypoint = route[index] ?? route[0]
  const trigger = waypoint.trigger
  const attempt = retries[level.id] ?? 0
  const needsSensor = trigger === 'EMERGENCY_BEHIND' && !SENSES_BEHIND[sensors]
  const options = useMemo(() => shuffled(CHOICES[trigger] ?? [], `${trigger}:${attempt}`), [trigger, attempt])
  const labels = needsSensor ? SENSOR_CHOICES.map(o => o.label) : options.map(o => o.label)
  const clue = CLUES[trigger] ?? level.brief
  const send = useCallback((next: Record<string, unknown>) => {
    activeCommand.current = ++serial.current
    setCommand({ ...next, id: serial.current } as SceneCommand)
  }, [])
  const drive = useCallback((at: number) => {
    setIndex(at); setStep('driving'); setSelected(null); pending.current = false
    setFeedback(''); setTestedLabel(''); setTestedActions([])
    send({ kind: 'drive', to: markFor(route[at].trigger, route[at].x) })
  }, [route, send])

  useEffect(() => {
    setChallenge(level.id); setFeedback(''); setTestedLabel('')
    wrong.current = false; drive(0)
    return stopNarration
  }, [level.id])

  const ask = () => {
    // A turn is spent by DECIDING, not by arriving: the wheel is claimed here,
    // where the question is actually put to the crew.
    claimTurn(level.id)
    setStep('choose'); setSelected(null); pending.current = false
    // The exact line every clue records in the studio voice — the turn chip
    // on the popup carries the player's name instead of the narrator.
    if (narration) narrate(`${clue} Choose what the car should do, then test your rule.`)
  }
  const evaluate = () => {
    const state = useGame.getState()
    const result = evaluateAt(state.rules, trigger)
    const seen = trigger !== 'EMERGENCY_BEHIND' || SENSES_BEHIND[state.sensors]
    if (seen && result.ok) {
      wrong.current = false; setStep('testing')
      setTestedLabel(result.actions.map(a => TILES[a]?.label ?? a).join(' + '))
      setTestedActions(result.actions)
      send({ kind: 'act', trigger, actions: result.actions, outcome: 'pass' })
    } else ask()
  }
  const done = (id: number) => {
    if (id !== activeCommand.current || currentLesson.current !== level.id) return
    activeCommand.current = 0
    if (step === 'driving') {
      const dynamic = ['MOVING', 'MANY_MOVING', 'DOG', 'EMERGENCY_BEHIND'].includes(trigger)
      if (!dynamic && evaluateAt(useGame.getState().rules, trigger).ok) { evaluate(); return }
      setStep('revealing'); send({ kind: 'reveal', trigger }); return
    }
    if (step === 'revealing') { evaluate(); return }
    if (step !== 'testing') return
    if (wrong.current) { setStep('review'); if (narration) narrate(feedback); return }
    if (index + 1 < route.length) { drive(index + 1); return }
    // EVERY solved stop gets its star moment: the popup names the rule, shows
    // the stars earned, and asks the driver to explain why it worked before
    // the crew moves on. Reflection is the lesson, not the driving — and the
    // car eases to a stop under the popup instead of sailing on (a pass act
    // deliberately ends with cruise still set for the old instant chain).
    pending.current = true; setStep('complete'); play('win')
    send({ kind: 'hold' })
    // Solved: the wheel moves on. A stop the rulebook answered by itself never
    // claimed a turn, so it costs nobody theirs.
    passTurn(level.id)
    if (narration && feedback) narrate(feedback)
  }
  const test = () => {
    if (selected === null || step !== 'choose' || pending.current) return
    pending.current = true; stopNarration()
    setTestedLabel(labels[selected])
    if (needsSensor) {
      const option = SENSOR_CHOICES[selected]
      if (option.correct) {
        setSensors(option.id); play('success'); setSelected(null); pending.current = false
        setFeedback('Rear sensor fitted! Now choose how to make room for the ambulance.')
      } else {
        setFeedback(option.why); setStep('review'); wrong.current = true
      }
      return
    }
    const choice = options[selected]
    if (!choice) { pending.current = false; return }
    wrong.current = !choice.correct
    setTestedActions(choice.actions)
    setFeedback(choice.why)
    if (choice.correct) { commitRule(trigger, choice.actions); play('success') }
    else play('deny')
    setStep('testing')
    send({ kind: 'act', trigger, actions: choice.actions, outcome: choice.correct ? 'pass' : choice.outcome ?? 'stuck' })
  }
  const retry = () => {
    registerRetry(level.id); pending.current = false; wrong.current = false
    setSelected(null); setStep('choose'); setFeedback('Use what you saw. Pick a different action and test it.')
    send({ kind: 'rewind', to: markFor(trigger, waypoint.x) })
  }
  useEffect(() => {
    if (step !== 'choose') return
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || document.querySelector('[aria-modal="true"]')) return
      if ((e.target as HTMLElement)?.closest('input,textarea')) return
      const n = Number(e.key)
      if (n >= 1 && n <= labels.length) { e.preventDefault(); setSelected(n - 1) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [step, labels.length])

  // The hint bulb whispers this hazard's clue while a choice is open.
  useEffect(() => {
    setHint(step === 'choose' || step === 'review' ? (hazardHint[trigger] ?? clue) : null)
    return () => setHint(null)
  }, [step, trigger, clue, setHint])

  const stopNo = Math.max(1, STOP_ORDER.indexOf(level.id) + 1)
  const advance = () => { if (!pending.current) return; pending.current = false; onAdvance() }

  const face = PLAYER_FACES[faceFor(crewFaces, Math.max(0, player))]
  const driverName = player === -1 ? 'The whole team' : playerName(crew, player)
  const popupOpen = step === 'choose' || step === 'review' || step === 'complete'
  const stars = starsFor(retries, level.id)
  // The handoff: after a solved stop the wheel has already moved on, so the
  // star popup can name who takes the next one and the key says it out loud.
  const handingOver = step === 'complete' && nextStop !== null && nextDriver !== player
  const nextName = nextDriver === -1 ? 'the whole team' : playerName(crew, nextDriver)
  const nextFace = PLAYER_FACES[faceFor(crewFaces, Math.max(0, nextDriver))]

  // The board's CTA plate drives every beat of the loop.
  useCta(
    step === 'choose' ? (needsSensor ? 'TEST THIS SENSOR' : 'TEST MY RULE')
      : step === 'review' ? 'TRY AGAIN'
      : step === 'complete'
        ? (nextStop === null ? 'FINISH THE MISSION'
          : nextDriver === -1 ? 'FINAL RUN · TOGETHER'
          : handingOver ? `PASS TO ${nextName.toUpperCase()}`
          : 'NEXT CHALLENGE')
      : step === 'testing' ? 'TESTING…'
      : 'WATCH THE ROAD',
    step === 'choose' ? selected === null : step !== 'review' && step !== 'complete',
    step === 'choose' ? test : step === 'review' ? retry : step === 'complete' ? advance : () => {},
  )

  // While a situation owns the screen the board chrome comes back to full
  // strength behind it; while the car moves, the chrome stands down.
  useEffect(() => {
    setSpotlight(popupOpen)
    return () => setSpotlight(false)
  }, [popupOpen, setSpotlight])

  return <div className="screen act-screen guided-drive" data-phase={step} data-lesson={level.id}>
    <div className="act-scene"><Scene scenario={sceneForLesson(level.id)} parkX={level.startX * WORLD} command={command} onCommandDone={done} /></div>

    {/* status chip while the car is on the move */}
    {!popupOpen && (
      <div className="skai-status" role="status">
        <i />{step === 'testing'
          ? (wrong.current ? 'Watch what happens — a mistake is a clue' : `${vehicleName || 'Your car'} is testing the rule…`)
          : `Challenge ${stopNo} of ${STOP_ORDER.length} · ${driverName} at the wheel`}
      </div>
    )}

    {/* THE SITUATION — the IF → THEN moment, full screen over the street */}
    <AnimatePresence>
      {popupOpen && (() => {
        const HazardIcon = TILE_ICONS[trigger]
        const heroActions = testedActions.length ? testedActions : []
        const HeroActionIcon = heroActions.length ? TILE_ICONS[heroActions[0]] : null
        return (
          <motion.div
            key="situation"
            className="skai-situation-layer"
            data-step={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="skai-situation-scrim" aria-hidden="true" />
            <motion.section
              className="skai-situation"
              data-step={step}
              role="dialog"
              aria-label="Situation"
              initial={{ opacity: 0, y: -26, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.98 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
            >
              <div className="skai-situation-head">
                <span className="skai-kicker">
                  {step === 'complete' ? 'CHALLENGE SOLVED' : step === 'review' ? 'LET’S FIX THAT RULE' : 'SITUATION'} · {stopNo} OF {STOP_ORDER.length}
                </span>
                <span className="skai-turn"><img src={face} alt="" />{driverName}’s turn</span>
              </div>

              {step === 'choose' && <>
                {/* The IF is the SAME on all three cards, so it is stated once,
                    here, instead of three times below. The cards are then pure
                    THEN — three actions a child can compare at a glance. */}
                <div className="skai-sight">
                  <i className="sight-ico" aria-hidden="true">{needsSensor ? <IconSensor /> : HazardIcon && <HazardIcon />}</i>
                  <div>
                    <h2>{needsSensor ? 'What must the car see?' : clue}</h2>
                    <span className="skai-if-chip">
                      <b>IF</b>
                      {needsSensor ? 'the sensors are upgraded' : TILES[trigger]?.label ?? trigger}
                    </span>
                  </div>
                </div>
                {/* ONE VOCABULARY, EVERYWHERE. A card's THEN is no longer a
                    bespoke sentence per hazard ("go slowly around the scooter",
                    "drive slowly past the child"); it is the car's own standard
                    action — the same words, icon and plain-English definition
                    wherever that action appears, including the rulebook and the
                    report. Children learn thirteen actions instead of
                    thirty-six sentences, and they can compare cards at a
                    glance. `data-actions` carries the same canonical string for
                    the harnesses. */}
                <div className="skai-choice-row" role="group" aria-label="Choose a rule">
                  {labels.map((label, i) => {
                    const tokens = needsSensor ? [] : options[i]?.actions ?? []
                    const canon = needsSensor ? label : actionWords(tokens).join(' + ')
                    const gloss = needsSensor ? '' : actionGloss(tokens)
                    return (
                      <button
                        key={label}
                        className="skai-choice"
                        data-actions={canon}
                        aria-pressed={selected === i}
                        aria-label={`Rule ${i + 1}: if ${needsSensor ? 'fitting sensors' : TILES[trigger]?.label ?? trigger}, then ${canon}`}
                        onClick={() => { setSelected(i); play('click') }}
                      >
                        <b className="choice-num">{i + 1}</b>
                        <span className="choice-then">
                          <b>THEN</b>
                          {tokens.length === 0
                            ? <span>{label}</span>
                            : tokens.map((token, at) => {
                              const Icon = TILE_ICONS[token]
                              return (
                                <span className="choice-act" key={token}>
                                  {at > 0 && <i className="choice-plus" aria-hidden="true">+</i>}
                                  {Icon && <i className="choice-ico"><Icon /></i>}
                                  <span>{TILES[token]?.label ?? token}</span>
                                </span>
                              )
                            })}
                        </span>
                        {/* the standard definition, only for the card being
                            considered — three at once was a wall of text */}
                        {gloss && selected === i && <span className="choice-gloss">{gloss}</span>}
                      </button>
                    )
                  })}
                </div>
                {feedback && <p className="skai-note">{feedback}</p>}
              </>}

              {(step === 'review' || step === 'complete') && <>
                {step === 'complete'
                  ? <h2><span className="skai-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span> One more problem solved!</h2>
                  : <h2>That rule needs a fix</h2>}
                {testedLabel && (
                  <div className={`skai-rule-hero ${step === 'review' ? 'is-bad' : 'is-good'}`} aria-label="The rule you tested">
                    <span className="tr-if">
                      <b>IF</b>
                      {HazardIcon && <i className="tr-ico"><HazardIcon /></i>}
                      <strong>{TILES[trigger]?.label ?? trigger}</strong>
                    </span>
                    <span className="tr-arrow" aria-hidden="true">→</span>
                    <span className="tr-then">
                      <b>THEN</b>
                      {HeroActionIcon && <i className="tr-ico"><HeroActionIcon /></i>}
                      <strong>{testedLabel}</strong>
                    </span>
                    <span className="tr-verdict">{step === 'review' ? '✗ IT FAILED' : '✓ IN THE CAR’S BRAIN'}</span>
                  </div>
                )}
                <p className="skai-clue">{feedback || 'Tell your team why this rule worked.'}</p>
                {step === 'review' && (
                  <p className="skai-note">A mistake is a clue. Which THEN keeps everyone safe?</p>
                )}
                {/* The handoff, named: the wheel goes round so everybody
                    teaches the car the same number of rules. */}
                {step === 'complete' && nextStop !== null && (
                  <div className="skai-handoff" aria-label="Whose turn is next">
                    <img src={nextFace} alt="" />
                    <div>
                      <span>{handingOver || nextDriver === -1 ? 'PASS THE CONTROLS' : 'STAY AT THE WHEEL'}</span>
                      <strong>
                        {nextDriver === -1 ? 'All of you, together' : `${nextName} is up next`}
                      </strong>
                    </div>
                  </div>
                )}
              </>}
            </motion.section>
          </motion.div>
        )
      })()}
    </AnimatePresence>
  </div>
}

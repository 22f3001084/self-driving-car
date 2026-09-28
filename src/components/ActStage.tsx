import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TILES, coachingHint, ui, type Level } from '../content'
import { useGame } from '../store'
import { play, playLoop, stopLoops } from '../sound'
import { narrate, stopNarration } from '../narration'
import { evaluateAt, type ChallengeId, type EventToken, type StepCheck } from '../sim'
import { routeForLesson, sceneForLesson } from '../lessonFlow'
import Scene, { WORLD, markFor, type SceneCommand } from './Scene'
import RuleBuilder from './RuleBuilder'
import PolicyList from './PolicyList'
import PolicyScan from './PolicyScan'
import HazardBanner from './HazardBanner'
import FaultVerdict from './FaultVerdict'
import { CHOICES, SENSOR_CHOICES, outcomeCopy, shuffled, type Outcome } from '../choices'
import { SENSES_BEHIND } from '../store'
import { IconArrowLeft, IconLightbulb, IconPlay, IconRestart } from '../icons'
import { clearSave } from '../persist'
import { openEditorOnLoad, skipBriefing } from '../devtools'

/** Hazards whose reveal is an ENTRANCE the manoeuvre answers — the ball and
    child, the wandering dog, the crowd, the ambulance growing in the mirror.
    These play their entrance even when a rule already covers them; everything
    else on a covered run flows straight past. */
const REVEAL_FIRST = new Set<EventToken>(['MOVING', 'MANY_MOVING', 'DOG', 'EMERGENCY_BEHIND'])

const LOOPS: Partial<Record<ChallengeId, 'busy' | 'rain'>> = { busy: 'busy', rain: 'rain' }

/**
 * The run is not all-or-nothing, and it does not wait to be prodded.
 *
 *   brief → driving → revealing → rule works  → acting → next stop
 *                               → no rule     → blocked: three cards in the street
 *                                   right card → acting
 *                                   wrong card → failing → reviewing → blocked
 *
 * `failing` is the half of the game that used not to exist. A wrong card used
 * to be refused, so it cost nothing and taught nothing. Now the car carries it
 * out — crashes, skids, sits there — and `reviewing` hands the camera to the
 * child so they can walk round the result before trying again.
 */
type Phase =
  | 'ready' | 'driving' | 'revealing' | 'scanning' | 'blocked'
  | 'acting' | 'failing' | 'reviewing' | 'passed'

export default function ActStage({
  level,
  onPassed,
  onAdvance,
  onExit,
  exitLabel = 'Leave',
  autoStart = false,
}: {
  level: Level
  onPassed: () => void
  onAdvance: () => void
  /** Abandon this job and go back where it was opened from. Always offered:
   *  a screen with no way out reads as a crash. */
  onExit?: () => void
  exitLabel?: string
  /** Skip the opening card and set off immediately. Patrols use this: the grid
   *  card already told the crew everything the popup would repeat. */
  autoStart?: boolean
}) {
  const act = level
  // Solo writes every rule, so nobody's turn is announced — not even "yours".
  const mode = useGame((s) => s.mode)
  const turnLabel = mode === 'solo'
    ? null
    : level.engineer ? ui.turn(`Engineer ${level.engineer}`) : ui.crewTurn
  const rules = useGame((s) => s.rules)
  const vehicleName = useGame((s) => s.vehicleName)
  const retries = useGame((s) => s.retries[act.id] ?? 0)
  const narration = useGame((s) => s.narration)
  const setChallenge = useGame((s) => s.setChallenge)
  const saveDraft = useGame((s) => s.saveDraft)
  const registerRetry = useGame((s) => s.registerRetry)
  const markPassed = useGame((s) => s.markPassed)
  const setHighlightedRules = useGame((s) => s.setHighlightedRules)
  const editingId = useGame((s) => s.editingId)
  const newDraft = useGame((s) => s.newDraft)
  const commitRule = useGame((s) => s.commitRule)
  const sensors = useGame((s) => s.sensors)
  const setSensors = useGame((s) => s.setSensors)

  const route = useMemo(() => routeForLesson(act.id, autoStart), [act.id, autoStart])
  const [phase, setPhase] = useState<Phase>('ready')
  const [index, setIndex] = useState(0)
  const [check, setCheck] = useState<StepCheck | null>(null)
  /** The walk position, in half-steps: row = shown/2, odd = verdict stamped. */
  const [scanShown, setScanShown] = useState(0)
  const [editorOpen, setEditorOpen] = useState(openEditorOnLoad())
  // Every act opens with its brief, then the vehicle sets off and stops at the
  // first thing in its way — the crew is never asked to write rules blind.
  const [briefingOpen, setBriefingOpen] = useState(!skipBriefing() && !autoStart)
  const [command, setCommand] = useState<SceneCommand | null>(null)
  const commandSeq = useRef(0)
  const activeLesson = useRef(act.id)
  activeLesson.current = act.id
  const completedLesson = useRef<string | null>(null)
  /** Set when the policy already covers the hazard being revealed, so the
      entrance flows straight into the manoeuvre with no scan in between. */
  const coveredRun = useRef<StepCheck | null>(null)
  /** The card the child has committed to, so the deck can flare it. */
  const [committed, setCommitted] = useState<number | null>(null)
  /** First tap on restart only ARMS it; the second tap actually wipes. */
  const [armRestart, setArmRestart] = useState(false)
  /** Which card the pointer is over, echoed by the keypad. */
  const [hover, setHover] = useState<number | null>(null)
  /** Set the moment a wrong card is picked; cleared on the next go. */
  const [fault, setFault] = useState<
    { why: string; outcome: Outcome; tag?: string; lead?: string } | null
  >(null)

  const waypoint = route[index]
  const briefLine = act.brief
  const spoken = (mode === 'solo' ? act.soloVoice : undefined) ?? act.voice ?? briefLine

  const send = useCallback((next: Record<string, unknown>) => {
    commandSeq.current += 1
    setCommand({ ...next, id: commandSeq.current } as SceneCommand)
  }, [])

  /**
   * Where the vehicle should pull up for a waypoint.
   *
   * Solved by the stage from where the hazard actually ends up on the street,
   * because that is not always the waypoint's own position: a hazard that owns a
   * road piece is placed at that tile's centre, and the closed road's barriers
   * stand sixteen metres past its placement point.
   */
  const stopFor = (trigger: EventToken, at: number) => markFor(trigger, route[at].x)

  useEffect(() => {
    setChallenge(act.id)
    const loop = LOOPS[act.id]
    if (loop) playLoop(loop)
    return stopLoops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id])

  useEffect(() => {
    if (briefingOpen && narration) narrate(`${spoken} ${act.task}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefingOpen, spoken, narration])

  // Auto-started levels flow with no brief popup, so the narrator carries the
  // story OVER the drive instead — the screen stays clear, the voice does not.
  useEffect(() => {
    if (autoStart && narration) narrate(spoken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id])

  const beginLeg = useCallback((at: number) => {
    setPhase('driving')
    setCheck(null)
    send({ kind: 'drive', to: stopFor(route[at].trigger, at) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, send])

  // Reset only the lesson at a handoff. The Scene child, vehicle position,
  // velocity and mouse camera offset stay alive throughout the journey.
  useEffect(() => {
    setIndex(0)
    setCheck(null)
    setScanShown(0)
    setCommitted(null)
    setHover(null)
    setFault(null)
    setArmRestart(false)
    setEditorOpen(openEditorOnLoad())
    coveredRun.current = null
    completedLesson.current = null
    setCommand(null)
    const startImmediately = autoStart || skipBriefing()
    setBriefingOpen(!startImmediately)
    if (startImmediately) beginLeg(0)
    else setPhase('ready')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id])

  const startRun = () => {
    play('click')
    saveDraft()
    setBriefingOpen(false)
    beginLeg(0)
  }

  /**
   * The car can only act on what its sensors can detect.
   *
   * The policy was evaluated sensor-blind: a rule for the ambulance written in
   * the editor passed a car with nothing pointing backwards, and the scan read
   * a hazard the car had never seen. With no rear sensor the check comes back
   * empty-handed — no trace, no rule — so the car stops and asks for the sensor
   * first, which is the whole lesson of that patrol.
   */
  const evaluateHere = (trigger: EventToken): StepCheck => {
    const state = useGame.getState()
    const result = evaluateAt(state.rules, trigger)
    if (trigger === 'EMERGENCY_BEHIND' && !SENSES_BEHIND[state.sensors]) {
      return { ...result, ok: false, actions: [], ruleId: null, viaElse: false, orderProblem: false, hintKey: 'rearNoSensor', trace: [] }
    }
    return result
  }

  /** Apply a finished scan's verdict: drive on, or stop and open the editor. */
  const applyVerdict = useCallback((result: StepCheck, trigger: EventToken) => {
    if (result.ok) {
      setHighlightedRules([])
      setPhase('acting')
      send({ kind: 'act', trigger, actions: result.actions, outcome: 'pass' })
    } else {
      setHighlightedRules(result.ruleId ? [result.ruleId] : [])
      setPhase('blocked')
      send({ kind: 'block', trigger })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, setHighlightedRules])

  /** The judge is a PERFORMANCE now: evaluate, then walk the policy on screen
   *  one rule at a time, and only then let the verdict land. */
  const judge = useCallback(() => {
    const trigger = route[index].trigger
    const result = evaluateHere(trigger)
    setCheck(result)
    setScanShown(0)
    setPhase('scanning')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, route])

  // The walk itself, ONE rule on screen at a time: the rule appears, gets a
  // read beat, its verdict stamps — a miss vanishes and the next rule takes
  // the frame; the FIRING rule stays put and the verdict lands. If every rule
  // missed, a "no rule for this" card holds the frame before the car stops to
  // ask. `scanShown` counts HALF-steps: row = shown/2, odd = verdict stamped.
  // The FLAT edition walks faster: its car has no manoeuvre choreography to
  // fill the halt, so the same pauses read as the game freezing.
  const FLAT = import.meta.env.VITE_SCENE_2D === '1'
  useEffect(() => {
    if (phase !== 'scanning' || !check) return
    const trigger = route[index].trigger
    const total = check.trace.length
    if (total === 0) {
      const timer = window.setTimeout(() => applyVerdict(check, trigger), FLAT ? 500 : 900)
      return () => window.clearTimeout(timer)
    }
    const row = Math.floor(scanShown / 2)
    const stamped = scanShown % 2 === 1
    // A rule just appeared: a beat to read it, then its verdict stamps.
    if (row < total && !stamped) {
      play('click')
      const timer = window.setTimeout(() => setScanShown((n) => n + 1), FLAT ? 300 : 420)
      return () => window.clearTimeout(timer)
    }
    if (row < total && stamped) {
      const status = check.trace[row].status
      // First match wins — the walk STOPS here, rules below are never shown.
      if (status === 'fired' || status === 'else') {
        const timer = window.setTimeout(() => applyVerdict(check, trigger), FLAT ? 460 : 700)
        return () => window.clearTimeout(timer)
      }
      // A miss: let "no match" register, then swap in the next rule.
      const timer = window.setTimeout(() => setScanShown((n) => n + 1), FLAT ? 260 : 380)
      return () => window.clearTimeout(timer)
    }
    // Every rule missed: the empty-handed card holds, then the car asks.
    const timer = window.setTimeout(() => applyVerdict(check, trigger), FLAT ? 620 : 950)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, scanShown, check])

  const onCommandDone = useCallback(() => {
    // A finishing animation belongs to the lesson that issued it. It must
    // never complete a newly opened lesson or deliver the same handoff twice.
    if (activeLesson.current !== act.id || completedLesson.current === act.id) return
    if (phase === 'driving') {
      // Judged SILENTLY on arrival. A hazard the policy already covers is not
      // a stop: no reveal hold, no scan walk, no toast — the car just carries
      // out its rule and the drive reads as one journey. The car only truly
      // stops when it has a question, and the only thing that then appears is
      // the question. (The scan still walks visibly on the editor's own
      // re-run — that is the one place reading the policy IS the point.)
      const trigger = route[index].trigger
      const result = evaluateHere(trigger)
      if (result.ok && !REVEAL_FIRST.has(trigger)) {
        setCheck(null) // no trace on screen for a covered pass
        setPhase('acting')
        send({ kind: 'act', trigger, actions: result.actions, outcome: 'pass' })
        return
      }
      // Dynamic hazards make their entrance either way — a car that full-stops
      // for a child nobody saw run out is a car stopping for nothing.
      coveredRun.current = result.ok ? result : null
      setPhase('revealing')
      send({ kind: 'reveal', trigger })
      return
    }
    if (phase === 'revealing') {
      const covered = coveredRun.current
      coveredRun.current = null
      if (covered) {
        setCheck(null) // no trace on screen for a covered pass
        setPhase('acting')
        send({ kind: 'act', trigger: route[index].trigger, actions: covered.actions, outcome: 'pass' })
      } else {
        judge()
      }
      return
    }
    // A wrong card has finished being carried out. The stage has already handed
    // the camera to the pointer; all that is left is to say what happened.
    if (phase === 'failing') { setPhase('reviewing'); return }
    if (phase === 'acting') {
      if (index + 1 >= route.length) {
        completedLesson.current = act.id
        markPassed(act.id)
        onPassed()
        if (act.id === 'l1' || act.id === 'l2') {
          // Continue while the vehicle is still moving. Do not carry a
          // transient "passed" phase (and its timer) into the next lesson.
          onAdvance()
          return
        }
        setPhase('passed')
        play('win')
        return
      }
      setIndex(index + 1)
      beginLeg(index + 1)
      return
    }
    // 'blocked' needs no follow-up: the crew acts next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, route, judge, beginLeg, send, act.id, markPassed, onPassed, onAdvance])

  const blockedHint = check && !check.ok
    ? coachingHint(act.id, retries, check.hintKey, vehicleName)
    : ''

  /** Which hazard, if any, the car is currently stopped in front of. */
  const blockedTrigger = phase === 'blocked' ? waypoint?.trigger : undefined
  /**
   * The one hazard a rule cannot fix: it is BEHIND the car, and the car has
   * nothing pointing that way. The sensor card comes first, once, and only then
   * do the rule cards make any sense.
   */
  const needsRearSensor = blockedTrigger === 'EMERGENCY_BEHIND' && !SENSES_BEHIND[sensors]
  /** True when this hazard has fault cards — every hazard in the game does. */
  const hasCards = Boolean(blockedTrigger && CHOICES[blockedTrigger])

  /**
   * The three answers, in the order they will stand in the street.
   *
   * Re-dealt on every attempt so the right one does not settle into a position
   * a child can learn, and never mid-look: the order is a pure function of the
   * hazard and the attempt number.
   */
  const deal = useMemo(
    () => (blockedTrigger ? shuffled(CHOICES[blockedTrigger] ?? [], `${blockedTrigger}:${retries}`) : []),
    [blockedTrigger, retries],
  )

  /** What the stage is asked to stand in the street, or null for no question. */
  const deckOptions = useMemo(() => {
    if (phase !== 'blocked' || editorOpen) return null
    if (needsRearSensor) {
      return SENSOR_CHOICES.map((option) => ({ label: option.label, art: option.arcs }))
    }
    if (!hasCards) return null
    return deal.map((choice) => ({ label: choice.label }))
  }, [phase, editorOpen, needsRearSensor, hasCards, deal])

  const deckLabels = useMemo(() => deckOptions?.map((option) => option.label) ?? [], [deckOptions])

  // The vehicle has stopped and has no rule. What appears is the fault card:
  // three answers, one right. The rule builder is no longer forced open, because
  // being handed an empty IF/THEN grid the instant you are stuck is the single
  // heaviest moment in the activity — it asks for four decisions before anything
  // moves. It is still one button away for anyone who wants it.
  useEffect(() => {
    if (phase !== 'blocked') return
    if (!hasCards && !needsRearSensor) setEditorOpen(true)
    if (narration && blockedHint) narrate(blockedHint, { interrupt: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, blockedHint, narration, hasCards, needsRearSensor])

  /** A saved rule re-runs the stop it was written for, with no extra click. */
  const retryNow = useCallback(() => {
    registerRetry(act.id)
    setEditorOpen(false)
    judge()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judge, act.id, registerRetry])

  /**
   * A card was chosen. The car does what it says — right or wrong.
   *
   * This is the whole game in one function. A right card is written into the
   * policy and the scan then shows it firing, which is the "the car found its
   * rule" moment. A wrong card is not refused: it is sent to the stage with its
   * outcome, and the street plays out the consequence.
   */
  const pick = useCallback((index: number) => {
    if (phase !== 'blocked' || editorOpen || committed !== null) return

    if (needsRearSensor) {
      const option = SENSOR_CHOICES[index]
      if (!option) return
      setCommitted(index)
      setHover(null)
      if (option.correct) {
        play('success')
        // Fitting the sensor is not a manoeuvre, so there is nothing for the
        // street to play. Let the card's flare finish, then the rule cards for
        // the same hazard come up in its place.
        window.setTimeout(() => {
          setSensors(option.id)
          setCommitted(null)
          // Now that it can see, let the scan read the book for this hazard —
          // a rule already written for it fires, otherwise the rule cards deal.
          judge()
        }, 720)
        return
      }
      stopNarration()
      play('deny')
      setFault({
        why: option.why,
        outcome: 'blocked',
        lead: `The ambulance ran into the back of ${vehicleName || 'the car'} — it never knew it was there.`,
      })
      setPhase('failing')
      send({ kind: 'act', trigger: 'EMERGENCY_BEHIND', actions: [], outcome: 'blocked' })
      return
    }

    const choice = deal[index]
    if (!choice || !blockedTrigger) return
    setCommitted(index)
    setHover(null)
    if (choice.correct) {
      play('success')
      const id = commitRule(blockedTrigger, choice.actions)
      // Straight into the DRIVE. The rule lands in the policy (the key's count
      // ticks up) and the car simply carries it out — the car moving again IS
      // the feedback. Two exceptions, both about ORDER: if a broader rule
      // steals this hazard the scan walks the book to show why; and if the new
      // rule had to be slotted ABOVE a broader one, the scan shows it firing
      // there — the one moment "first match wins" is visibly true.
      window.setTimeout(() => {
        setCommitted(null)
        setEditorOpen(false)
        const rs = useGame.getState().rules
        const insertedAbove = rs.findIndex((r) => r.id === id) < rs.length - 1
        const result = evaluateHere(blockedTrigger)
        if (result.ok && !insertedAbove) {
          setCheck(null) // the car moving again is the feedback, not a trace
          setPhase('acting')
          send({ kind: 'act', trigger: blockedTrigger, actions: result.actions, outcome: 'pass' })
        } else {
          judge()
        }
      }, 640)
      return
    }
    stopNarration()
    play('deny')
    setFault({ why: choice.why, outcome: choice.outcome ?? 'stuck' })
    setPhase('failing')
    send({ kind: 'act', trigger: blockedTrigger, actions: choice.actions, outcome: choice.outcome })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, editorOpen, committed, needsRearSensor, deal, blockedTrigger, vehicleName, commitRule, judge, send, setSensors])

  /**
   * Another go.
   *
   * The street is put back the way it was — props to their placed poses, car on
   * its mark — and the cards come up again, re-dealt. Nothing is written into
   * the policy by a wrong answer, so there is nothing to unpick.
   */
  const tryAgain = useCallback(() => {
    stopNarration()
    registerRetry(act.id)
    setFault(null)
    setCommitted(null)
    setHover(null)
    setPhase('blocked')
    send({ kind: 'rewind', to: stopFor(route[index].trigger, index) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id, registerRetry, send, route, index])

  /** 1, 2, 3 — the fastest route in, and the one a keyboard has. */
  useEffect(() => {
    if (!deckOptions?.length) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // A dialog is up (pause, info, briefing), or the key went into a field:
      // a "1" typed into the call sign must not commit a card behind it.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const target = event.target as HTMLElement | null
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      const n = Number(event.key)
      if (Number.isInteger(n) && n >= 1 && n <= deckOptions.length) pick(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deckOptions, pick])

  // The verdict is read aloud once the wreck is on screen — the hint the
  // narrator was mid-way through at the pick was cut, so this is the one line
  // a child hears about what just happened.
  useEffect(() => {
    if (phase !== 'reviewing' || !fault || !narration) return
    narrate(`${fault.lead ?? outcomeCopy[fault.outcome]?.lead ?? ''} ${fault.why}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Cleared: no "you did it" panel — the win jingle plays and the game moves
  // on by itself. A beat, not a hold: there is nothing on screen to read.
  useEffect(() => {
    if (phase !== 'passed' || completedLesson.current !== act.id) return
    const timer = window.setTimeout(() => {
      if (activeLesson.current === act.id && completedLesson.current === act.id) {
        completedLesson.current = null
        onAdvance()
      }
    }, 600)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, act.id])

  // Halted, the situation is settled, so OR (a second situation) and ELSE (a
  // default) have nothing to do here. AND stays: three of the advanced patrols
  // cannot be solved with one action, and hiding it made them unwinnable.
  const offeredConnectors = blockedTrigger
    ? act.connectors.filter((token) => token === 'AND')
    : act.connectors
  const requiredConditions = blockedTrigger
    ? [blockedTrigger as string]
    : act.required.length
      ? act.required
      : act.tray.filter((token) => TILES[token]?.kind === 'condition').slice(0, 1)

  return (
    <div
      className="screen act-screen"
      data-phase={phase}
      data-lesson={act.id}
      data-editor={String(editorOpen)}
      data-cards={String(Boolean(deckOptions))}
      data-review={String(phase === 'reviewing')}
    >
      <div className="act-scene">
        <Scene
          scenario={sceneForLesson(act.id)}
          command={command}
          onCommandDone={onCommandDone}
          parkX={level.startX * WORLD}
          driving={phase === 'driving'}
          // NEVER dimmed while the cards are up or the consequence is being
          // looked at: the street IS the interface at those moments.
          dim={editorOpen || briefingOpen || (phase === 'blocked' && !hasCards && !needsRearSensor)}
          choices={deckOptions}
          committed={committed}
          onCardPick={pick}
          onCardHover={setHover}
        />
      </div>

      {/* The "Rule fired" toast is gone: the car doing the right thing IS the
          feedback, and a chip repeating it at every cleared stop was the
          pop-up-again-and-again the room kept flagging. */}

      {/* ---- The scan: the policy being read, one rule at a time ------------- */}
      <AnimatePresence>
        {/* The trace stays up while the vehicle is HALTED too. It used to
            vanish the instant the run failed, which took the evidence off the
            screen at the exact moment the crew is asked to explain it. */}
        {/* Not while the fault card is up. The card IS the evidence at that
            moment, and a second panel saying "no rules yet" beside it is one
            more thing competing for the child's attention. A CSS stand-down
            could not do this: framer-motion writes its own inline opacity and
            beats the stylesheet. */}
        {/* And only when there is a policy to read. With no rules yet the
            panel could only say "No rules yet" — a popup at every fresh
            checkpoint telling the child nothing the halted car doesn't. */}
        {(phase === 'scanning' || phase === 'acting' || (phase === 'blocked' && !hasCards && !needsRearSensor))
          && !deckOptions && check && check.trace.length > 0 && (
          <PolicyScan trace={check.trace} shown={scanShown} trigger={route[index].trigger} />
        )}
      </AnimatePresence>

      {/* ---- The question: HUD only. The answers are out in the street ------- */}
      <AnimatePresence>
        {deckOptions && waypoint && (
          <HazardBanner
            key={`${waypoint.trigger}-${needsRearSensor ? 'sensor' : retries}`}
            trigger={waypoint.trigger}
            turnLabel={turnLabel}
            labels={deckLabels}
            hover={hover}
            sensor={needsRearSensor}
            vehicleName={vehicleName || 'the car'}
            committed={committed}
            onPick={pick}
          />
        )}
      </AnimatePresence>

      {/* ---- What the wrong answer did, with the camera in the child's hands -- */}
      <AnimatePresence>
        {phase === 'reviewing' && fault && (
          <FaultVerdict
            key="verdict"
            outcome={fault.outcome}
            why={fault.why}
            tag={fault.tag}
            lead={fault.lead}
            hint={check && !check.ok ? coachingHint(act.id, retries + 1, check.hintKey, vehicleName) : ''}
            attempt={retries}
            onRetry={tryAgain}
          />
        )}
      </AnimatePresence>

      {/* The hint key is gone. It used to sit bottom-left with a note that
          opened over the street; the hint a child needs is now on screen the
          whole time the question is up, in the bottom strip, where it cannot be
          missed and cannot be left unopened. */}

      {/* ---- One control: the policy the crew is building -------------------- */}
      {/* ---- The policy key: top right, and ALWAYS there ------------------- */}
      {/* Its own corner, not the command bar, because it has to be reachable
          while a question is up — that is exactly when someone wants to look at
          the rulebook, or to write a rule by hand instead of picking a card. The
          bar at the bottom cannot hold it: that is where the question's own
          prompt and keypad are. The corner is free now that the mission timer
          and the progress rail stand down inside a level. */}
      <button
        className={`act-policy ${editorOpen || briefingOpen ? 'is-hidden' : ''}`}
        onClick={() => { play('click'); setEditorOpen(true) }}
        title={`${ui.policy} — ${rules.length} rule${rules.length === 1 ? '' : 's'}`}
      >
        <IconLightbulb light />
        <span className="act-policy-label">{ui.policy}</span>
        <span className="act-policy-label-short" aria-hidden="true">Rules</span>
        <span className="act-policy-count">{rules.length}</span>
      </button>

      {/* Restart, under the policy key: the whole activity again, from
          scratch — saved progress cleared, page reloaded. TWO taps: the first
          arms the key (it turns amber and stands down by itself), the second
          wipes. A full restart must never be a slip of the finger. */}
      <button
        className={`act-restart ${editorOpen || briefingOpen ? 'is-hidden' : ''} ${armRestart ? 'is-confirming' : ''}`}
        onClick={() => {
          play('click')
          if (!armRestart) {
            setArmRestart(true)
            window.setTimeout(() => setArmRestart(false), 2500)
            return
          }
          clearSave()
          window.location.reload()
        }}
        title={armRestart ? 'Tap again — starts over from the beginning' : 'Restart from the beginning'}
        aria-label={armRestart ? 'Tap again — starts over from the beginning' : 'Restart from the beginning'}
      >
        <IconRestart />
      </button>

      {/* No exit key over the street at all any more — it kept surfacing
          between beats and read as a popup. Leaving lives in the pause menu
          ("Leave this run") and in the briefing's own back button. */}

      {/* No "delivered" panel. "The pop up of scooter is passed should not be
          there": the car having got through, plus the win jingle, is the
          feedback — the result copy still lands in the mission report. */}

      {/* ---- The brief, before anything moves -------------------------------- */}
      <AnimatePresence>
        {/* One dialogue at a time. Both could be open together, and the rule
            editor's chip tray then sat on top of the brief's own button — a
            control the child could see and not press. */}
        {briefingOpen && !editorOpen && (
          <motion.div className="brief-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="brief-card"
              role="dialog" aria-modal="true" aria-label="Act briefing"
              initial={{ opacity: 0, y: 26, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.26 }}
            >
              <div className="brief-who">
                <span className="brief-level">{act.chapter}</span>
                {turnLabel && <span className="brief-eyebrow">{turnLabel}</span>}
              </div>
              <h2 className="brief-title">{briefLine}</h2>
              <p className="brief-task"><span className="task-tag">Task</span>{act.task}</p>

              <span className="brief-actions">
                {onExit && (
                  <button className="btn ghost" onClick={() => { play('click'); onExit() }}>
                    <span className="btn-ico"><IconArrowLeft /></span>{exitLabel}
                  </button>
                )}
                <button className="btn primary xl" onClick={startRun}>
                  <span className="btn-ico"><IconPlay light /></span>{act.runLabel}
                </button>
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Rule editor ----------------------------------------------------- */}
      <AnimatePresence>
        {editorOpen && (
          <motion.div
            className="editor-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setEditorOpen(false)}
          >
            <motion.div
              className="editor-panel"
              role="dialog" aria-modal="true" aria-label="Rule editor"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.24 }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="editor-head">
                <h2>
                  {blockedTrigger
                    ? `${TILES[blockedTrigger]?.label} — what should ${vehicleName || 'the car'} do?`
                    : editingId ? 'Fix this rule' : 'Write a rule'}
                </h2>
                <button className="editor-close" onClick={() => { play('click'); setEditorOpen(false) }} aria-label="Close">×</button>
              </header>

              {/* Stopped at a hazard: one question, nothing else on screen.
                  Free editing: the full builder with the policy beside it. */}
              <div className={`editor-body ${blockedTrigger ? 'is-focused' : ''}`}>
                <RuleBuilder
                  tray={act.tray}
                  connectors={offeredConnectors}
                  newTiles={act.newTiles}
                  requiredConditions={requiredConditions}
                  lockedCondition={blockedTrigger}
                  onSaved={() => {
                    if (!editingId) newDraft()
                    // Written for the stop the vehicle is at: run it now.
                    if (phase === 'blocked') retryNow()
                  }}
                />
                {/* The policy is always beside the question: a rule the crew
                    has just added has to be visible, not filed away. */}
                {/* An order problem is FIXED by reordering, so the priority
                    arrows must survive the halted mode that normally locks
                    the list down. */}
                <PolicyList
                  reorderable={(!blockedTrigger || Boolean(check?.orderProblem)) && rules.length > 1}
                  readOnly={Boolean(blockedTrigger) && !check?.orderProblem}
                  onChanged={() => {
                    // The crew fixed the book by hand (reordered, deleted): if
                    // the policy now covers the hazard, let the scan show the
                    // specific rule firing — otherwise the arrows did nothing.
                    if (phase !== 'blocked' || committed !== null || !blockedTrigger) return
                    if (evaluateHere(blockedTrigger).ok) { setEditorOpen(false); judge() }
                  }}
                />
              </div>

              {/* No footer 'Close' key: the header X and the scrim already
                  exit, and a child who just built a rule must not read
                  'Close' as the next step — the next step is the street. */}
              {phase === 'blocked' && (
                <footer className="editor-foot">
                  <p className="editor-hint">{blockedHint}</p>
                </footer>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

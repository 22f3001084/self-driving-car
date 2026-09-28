import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../store'
import { useSettings, clearSave } from '../persist'
import { CONNECTORS, TILES, infoCopy, mission } from '../content'
import { STOP_ORDER, currentDriver, faceFor, playerName } from '../campaign'
// the live rotation: whose seat the chip band should light
import { play, setMuted } from '../sound'
import { NARRATOR, narratorVoiceLabel, replayNarration, setNarrationEnabled, stopNarration } from '../narration'
import { useHud, fireCta } from '../hud'
import CrewPanel, { PLAYER_FACES } from './CrewPanel'
import {
  BOARDS, CAP_RATIO, LAST_BEAT, LIVE_BEAT, SOUND_MENU_ART, choreograph, mmss, paintRail, pinStyle,
  seatFace, seatName,
  type Rect, type SkaiScreen,
} from '../skai/board'

/** A box in board px, for a control or plate that carries no text. */
function boxStyle(rect: Rect): CSSProperties {
  return { left: rect[0], top: rect[1], width: rect[2], height: rect[3] }
}

function rectStyle(rect: Rect | undefined, extra?: CSSProperties): CSSProperties {
  if (!rect) return { display: 'none' }
  return {
    left: rect[0], top: rect[1], width: rect[2], height: rect[3],
    fontSize: Number((rect[3] / CAP_RATIO).toFixed(2)),
    ...extra,
  }
}

/**
 * The SKAI Layout System board — the AI & Data Figma export, inlined so every
 * tagged part animates on its own beat, with live text seated in the exact
 * rectangles the outlined glyphs occupied and transparent hit areas over the
 * artwork's own controls. Replaces the hand-drawn HUD entirely.
 */
export default function SkaiHud() {
  const phase = useGame((s) => s.phase)
  const crew = useGame((s) => s.crew)
  const crewFaces = useGame((s) => s.crewFaces)
  const startedAt = useGame((s) => s.startedAt)
  const passed = useGame((s) => s.passed)
  const turnIndex = useGame((s) => s.turnIndex)
  const turnOwner = useGame((s) => s.turnOwner)
  const rules = useGame((s) => s.rules)
  const muted = useGame((s) => s.muted)
  const narration = useGame((s) => s.narration)
  const toggleMute = useGame((s) => s.toggleMute)
  const toggleNarration = useGame((s) => s.toggleNarration)
  const reset = useGame((s) => s.reset)
  const patrolId = useGame((s) => s.patrolId)
  const openPatrol = useGame((s) => s.openPatrol)
  const closeLevel = useGame((s) => s.closeLevel)
  const goBack = useGame((s) => s.goBack)
  const settings = useSettings()

  const ctaLabel = useHud((s) => s.ctaLabel)
  const ctaDisabled = useHud((s) => s.ctaDisabled)
  const hint = useHud((s) => s.hint)
  const spotlight = useHud((s) => s.spotlight)

  const [menuOpen, setMenuOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  const [crewOpen, setCrewOpen] = useState(false)
  const [soundOpen, setSoundOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const stageRef = useRef<HTMLElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const shownScreen = useRef<SkaiScreen | null>(null)
  const animTimer = useRef(0)

  const screen: SkaiScreen = phase === 'title' || phase === 'design' ? 'single' : 'multiplayer'
  const entry = BOARDS[screen]
  const inLevel = phase === 'play' || phase === 'patrols'

  useEffect(() => setMuted(muted), [muted])
  // "Mute all sounds" means ALL of them: the recorded narrator plays through
  // its own audio element, outside the Howler mute, so it is stopped here too.
  useEffect(() => setNarrationEnabled(narration && !muted), [narration, muted])
  // The speaker on the board says whether sound is on (waves) or off (a cross).
  useEffect(() => {
    stageRef.current?.toggleAttribute('data-muted', muted)
  }, [muted, screen])

  // The mission clock counts DOWN from the 45-minute budget, the way every
  // SKAI board's hanging timer reads.
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return }
    const tick = () => setElapsed(Date.now() - startedAt)
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  const budget = mission.budgetMinutes * 60
  const remain = Math.max(0, budget - Math.floor(elapsed / 1000))
  const timerState = remain / budget <= 0.1 ? 'danger' : remain / budget <= 0.25 ? 'warn' : 'ok'

  // Progress along the rail: cleared stops out of the whole run.
  const total = STOP_ORDER.length
  const done = STOP_ORDER.filter((id) => passed[id]).length
  const players = useGame((s) => s.crewCount)
  const driver = currentDriver(passed, turnOwner, turnIndex, players)

  // The chrome breathes: while the car is on the move nothing competes with
  // the road — the chips, names and logo step back until a situation (or any
  // other screen) brings the full board back.
  const quiet = inLevel && !spotlight

  useEffect(() => {
    if (!menuOpen && !infoOpen && !hintOpen && !crewOpen && !soundOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false); setInfoOpen(false); setHintOpen(false); setCrewOpen(false); setSoundOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, infoOpen, hintOpen, crewOpen, soundOpen])

  // The audio menu is a drop-down, not a dialog: any press outside it closes it.
  useEffect(() => {
    if (!soundOpen) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('.skai-sound-menu, .hit-sound')) return
      setSoundOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [soundOpen])
  // A new screen closes it too.
  useEffect(() => setSoundOpen(false), [phase])

  // ---- Paint the board and play the entrance --------------------------
  useEffect(() => {
    const host = boardRef.current
    const stage = host?.closest<HTMLElement>('.stage') ?? null
    stageRef.current = stage
    if (!host || !stage) return
    const reduce = document.documentElement.classList.contains('reduce-motion')

    const paintIn = () => {
      host.innerHTML = BOARDS[screen].art
      shownScreen.current = screen
      stage.setAttribute('data-skai-screen', screen)
      stage.classList.remove('is-settled')
      choreograph(stage)
      paintRail(stage, done, total)
      const settle = () => stage.classList.add('is-settled')
      if (reduce) { stage.removeAttribute('data-anim'); settle(); return }
      stage.setAttribute('data-anim', 'in')
      window.clearTimeout(animTimer.current)
      animTimer.current = window.setTimeout(() => {
        stage.removeAttribute('data-anim')
        // The connector rules made their entrance; now they stand down. The
        // artwork's furniture stays, the flourish does not.
        animTimer.current = window.setTimeout(settle, 1400)
      }, LAST_BEAT + 380)
    }

    if (shownScreen.current === null || reduce) { paintIn(); return }
    if (shownScreen.current === screen) return
    // Swapping boards plays the same keyframes in reverse, bottom-up, so the
    // change reads as one move rather than a cut.
    const nodes = stage.querySelectorAll<HTMLElement>('[data-part], .live')
    nodes.forEach((node) => {
      const d = parseFloat(node.style.getPropertyValue('--d')) || 0
      node.style.setProperty('--d', `${Math.round((LAST_BEAT - d) * 0.5)}ms`)
    })
    stage.setAttribute('data-anim', 'out')
    window.clearTimeout(animTimer.current)
    animTimer.current = window.setTimeout(paintIn, LAST_BEAT * 0.5 + 200)
    return () => window.clearTimeout(animTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  // Progress recolours the rail chevrons in place — no repaint needed.
  useEffect(() => {
    if (stageRef.current) paintRail(stageRef.current, done, total)
  }, [done, total])

  // Only the seats someone is sitting in are drawn; the band re-centres on
  // them (board.css reads data-crew).
  useEffect(() => {
    stageRef.current?.setAttribute('data-crew', String(players))
  }, [players, screen])

  // Quiet chrome while the car is on the move.
  useEffect(() => {
    stageRef.current?.setAttribute('data-hud', quiet ? 'quiet' : 'full')
  }, [quiet])

  // Live delays for the text layer, once per mount.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.querySelectorAll<HTMLElement>('.live').forEach((node, i) => {
      node.style.setProperty('--d', `${LIVE_BEAT + i * 18}ms`)
    })
  }, [screen])

  // Which artwork a control lifts while the pointer is on it.
  const mark = (part: string, cls: 'is-hot' | 'is-down', on: boolean) => {
    stageRef.current?.querySelectorAll(`.skai-board [data-part="${part}"]`)
      .forEach((node) => node.classList.toggle(cls, on))
  }
  const hitProps = (part: string) => ({
    onPointerEnter: () => mark(part, 'is-hot', true),
    onPointerLeave: () => { mark(part, 'is-hot', false); mark(part, 'is-down', false) },
    onPointerDown: () => mark(part, 'is-down', true),
    onPointerUp: () => mark(part, 'is-down', false),
    onFocus: () => mark(part, 'is-hot', true),
    onBlur: () => mark(part, 'is-hot', false),
  })

  // One chip per player, and only per player: an empty seat is not drawn (a
  // crew of three used to hand the fourth chip to the car, wearing a child's
  // face). On the team delivery run every chip lights.
  const seats = Array.from({ length: players }, (_, i) => i)
  const chipNow = (i: number) => driver === -1 || i === driver
  const text = entry.text
  const onBack = () => {
    play('click')
    if (phase === 'title') return
    setMenuOpen(true)
  }

  return (
    <>
      <div ref={boardRef} className="skai-board" aria-hidden="true" />

      {/* ---- live values in the artwork's own holes ------------------- */}
      <div className="live live-timer" data-state={timerState} style={rectStyle(text.timer, pinStyle('timer'))} role="timer">
        {mmss(startedAt ? remain : budget)}
      </div>
      <div className="live live-count" style={rectStyle(text.count, pinStyle('rail'))}>{done}/{total}</div>
      {text.info && <div className="live live-info" style={rectStyle(text.info, pinStyle('info'))}>i</div>}
      <div className={`live live-cta ${ctaDisabled ? 'is-locked' : ''}`} style={rectStyle(text.cta, pinStyle('cta'))}>
        {ctaLabel}
      </div>
      {screen === 'multiplayer' && seats.map((i) => (
        <img
          key={`face-${i}`} className="live chip-face" data-seat={i} alt="" draggable={false}
          src={PLAYER_FACES[faceFor(crewFaces, i)]}
          style={{ ...boxStyle(seatFace(i)), ...pinStyle('chips') }}
        />
      ))}
      {screen === 'multiplayer' && seats.map((i) => (
        <div
          key={`name-${i}`} data-seat={i}
          className={`live live-name ${chipNow(i) ? 'is-now' : ''}`}
          style={{ ...boxStyle(seatName(i)), ...pinStyle('chips') }}
        >
          <span>{playerName(crew, i)}</span>
        </div>
      ))}

      {/* ---- transparent controls over the artwork -------------------- */}
      <button className="hud-hit hit-back" style={pinStyle('back')} aria-label="Pause the mission" {...hitProps('back')} onClick={onBack} />
      <button
        className="hud-hit hit-sound" style={{ ...boxStyle(entry.hits.sound), ...pinStyle('sound') }}
        aria-label={muted ? 'Sound is off. Open the sound menu' : 'Sound menu'}
        aria-haspopup="menu" aria-expanded={soundOpen} {...hitProps('sound')}
        onClick={() => { play('click'); setSoundOpen((open) => !open) }}
      />
      <div
        className={`skai-sound-menu ${soundOpen ? 'is-open' : ''}`} role="menu" aria-label="Sound"
        aria-hidden={!soundOpen} style={{ ...boxStyle(entry.menu), ...pinStyle('sound') }}
      >
        <div className="skai-sound-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SOUND_MENU_ART }} />
        <button
          role="menuitem" tabIndex={soundOpen ? 0 : -1} className="sound-row sound-row-replay"
          aria-label="Replay narration" disabled={muted || !narration}
          onClick={() => { play('click'); replayNarration(); setSoundOpen(false) }}
        />
        <button
          role="menuitemcheckbox" tabIndex={soundOpen ? 0 : -1} aria-checked={muted}
          className={`sound-row sound-row-mute ${muted ? 'is-on' : ''}`}
          aria-label={muted ? 'Turn all sounds back on' : 'Mute all sounds'}
          onClick={() => { toggleMute(); if (muted) play('click'); setSoundOpen(false) }}
        />
      </div>
      <button
        className="hud-hit hit-info" style={{ ...boxStyle(entry.hits.info), ...pinStyle('info') }}
        aria-label={infoCopy.heading} {...hitProps('info')}
        onClick={() => { play('click'); setInfoOpen(true) }}
      />
      <div className="hud-hit hit-timer" style={pinStyle('timer')} role="presentation" />
      <div
        className="hud-hit hit-rail" style={pinStyle('rail')} role="progressbar"
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
        aria-label={`${done} of ${total} challenges solved`}
      />
      <button
        className="hud-hit hit-hint" style={pinStyle('hint')} aria-label="Hint and rulebook" {...hitProps('hint')}
        onClick={() => { play('click'); setHintOpen(true) }}
      />
      <button
        className="hud-hit hit-cta" style={pinStyle('cta')} aria-label={ctaLabel} disabled={ctaDisabled} {...hitProps('cta')}
        onClick={() => { play('click'); stopNarration(); fireCta() }}
      />

      {/* ---- Pause ----------------------------------------------------- */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="skai-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              className="skai-modal" role="dialog" aria-modal="true" aria-label="Mission paused"
              initial={{ scale: 0.96, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="skai-kicker">Mission paused · {mmss(remain)} left</span>
              <h2>Take a breath</h2>
              <div className="skai-modal-body">
                <button className="panel-row" onClick={() => { play('click'); toggleMute() }}>
                  <span className="panel-ico" aria-hidden="true">♪</span>
                  <span>Sound effects</span>
                  <em>{muted ? 'Off' : 'On'}</em>
                </button>
                {/* Renaming yourself mid-mission is a five-second fix, not a
                    restart: the same editor the crew filled in at the depot. */}
                <button className="panel-row" onClick={() => { play('click'); setMenuOpen(false); setCrewOpen(true) }}>
                  <span className="panel-ico" aria-hidden="true">☺</span>
                  <span>Players, names and faces</span>
                  <em>{crew.slice(0, players).map((name, i) => name.trim() || `Player ${i + 1}`).join(', ')}</em>
                </button>
                <button className="panel-row" onClick={() => { play('click'); toggleNarration() }}>
                  <span className="panel-ico" aria-hidden="true">☊</span>
                  <span>{NARRATOR.name} · {NARRATOR.accent}</span>
                  <em title={narratorVoiceLabel()}>{narration ? 'On' : 'Off'}</em>
                </button>
                <div className="panel-mixer" role="group" aria-label="Volume">
                  {([['Street', 'volAmbience'], ['Car', 'volVehicle'], ['Effects', 'volFx']] as const).map(([label, key]) => (
                    <label key={key} className="mixer-row">
                      <span>{label}</span>
                      <input
                        type="range" min={0} max={1} step={0.1} value={settings[key]}
                        onChange={(event) => settings.set({ [key]: Number(event.target.value) })}
                      />
                    </label>
                  ))}
                </div>
                <button className="panel-row" onClick={() => { play('click'); settings.set({ reducedMotion: !settings.reducedMotion }) }}>
                  <span className="panel-ico" aria-hidden="true">〰</span>
                  <span>Reduced motion</span>
                  <em>{settings.reducedMotion ? 'On' : 'Off'}</em>
                </button>
                <button className="panel-row" onClick={() => { play('click'); settings.set({ lowGfx: !settings.lowGfx }) }}>
                  <span className="panel-ico" aria-hidden="true">▦</span>
                  <span>Low graphics</span>
                  <em>{settings.lowGfx ? 'On' : 'Off'}</em>
                </button>
                <button
                  className="panel-row"
                  onClick={() => {
                    play('click')
                    if (document.fullscreenElement) void document.exitFullscreen()
                    else void document.documentElement.requestFullscreen?.()
                  }}
                >
                  <span className="panel-ico" aria-hidden="true">⛶</span>
                  <span>Fullscreen</span>
                  <em>F11</em>
                </button>
                {inLevel && (
                  <button
                    className="panel-row"
                    onClick={() => {
                      play('click'); stopNarration()
                      if (phase === 'patrols' && patrolId) openPatrol(null)
                      else closeLevel()
                      setMenuOpen(false)
                    }}
                  >
                    <span className="panel-ico" aria-hidden="true">←</span>
                    <span>Leave this run</span>
                    <em>Progress kept</em>
                  </button>
                )}
                {!inLevel && phase !== 'levels' && (
                  <button className="panel-row" onClick={() => { play('click'); stopNarration(); goBack(); setMenuOpen(false) }}>
                    <span className="panel-ico" aria-hidden="true">←</span>
                    <span>Back one screen</span>
                    <em />
                  </button>
                )}
                <button
                  className="panel-row danger"
                  onClick={() => { play('click'); stopNarration(); clearSave(); reset(); setMenuOpen(false) }}
                >
                  <span className="panel-ico" aria-hidden="true">↺</span>
                  <span>Restart the mission</span>
                  <em>Progress and rules cleared</em>
                </button>
                <button className="btn primary wide" onClick={() => { play('click'); setMenuOpen(false) }}>Resume</button>
              </div>
              <button className="skai-modal-close" aria-label="Close" onClick={() => setMenuOpen(false)}>✕</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- The crew: size, names, faces ------------------------------ */}
      <AnimatePresence>
        {crewOpen && (
          <motion.div
            className="skai-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCrewOpen(false)}
          >
            <motion.div
              className="skai-modal skai-modal--crew" role="dialog" aria-modal="true" aria-label="Players, names and faces"
              initial={{ scale: 0.96, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="skai-kicker">Your crew</span>
              <h2>Who is playing?</h2>
              <div className="skai-modal-body">
                <CrewPanel inGame />
                <button className="btn primary wide" onClick={() => { play('click'); setCrewOpen(false) }}>
                  Back to the mission
                </button>
              </div>
              <button className="skai-modal-close" aria-label="Close" onClick={() => setCrewOpen(false)}>✕</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Info ------------------------------------------------------ */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div
            className="skai-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setInfoOpen(false)}
          >
            <motion.div
              className="skai-modal" role="dialog" aria-modal="true" aria-label={infoCopy.heading}
              initial={{ scale: 0.96, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="skai-kicker">Mission briefing</span>
              <h2>{infoCopy.heading}</h2>
              <div className="skai-modal-body">
                <p className="modal-sub">{infoCopy.brief}</p>
                <ol className="info-list">
                  {infoCopy.rules.map((line) => <li key={line}>{line}</li>)}
                </ol>
                <ul className="info-kw">
                  {(['AND', 'OR', 'ELSE'] as const).map((token) => (
                    <li key={token}>
                      <b>{CONNECTORS[token].label}</b>
                      {CONNECTORS[token].gloss}
                    </li>
                  ))}
                </ul>
                <button className="btn primary wide" onClick={() => { play('click'); setInfoOpen(false) }}>Got it</button>
              </div>
              <button className="skai-modal-close" aria-label="Close" onClick={() => setInfoOpen(false)}>✕</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Hint bulb: the clue and the team's brain ------------------- */}
      <AnimatePresence>
        {hintOpen && (
          <motion.div
            className="skai-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setHintOpen(false)}
          >
            <motion.div
              className="skai-modal" role="dialog" aria-modal="true" aria-label="Hint and rulebook"
              initial={{ scale: 0.96, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="skai-kicker">Hint</span>
              <h2>{hint ? 'Look closely' : 'Your team’s brain'}</h2>
              <div className="skai-modal-body">
                {hint && <p className="modal-sub">{hint}</p>}
                <p className="modal-sub">
                  The car checks your rules from the top. The first rule whose IF matches
                  what the sensors see is the one that runs.
                </p>
                {rules.length === 0
                  ? <p className="modal-sub">No rules yet — your first tested rule will appear here.</p>
                  : (
                    <ol className="skai-rules">
                      {rules.map((rule) => (
                        <li key={rule.id}>
                          <b>IF</b> {rule.conditions.map((c) => TILES[c.token]?.label ?? c.token).join(' or ')}{' '}
                          <b>THEN</b> {rule.actions.map((a) => TILES[a.token]?.label ?? a.token).join(' + ')}
                        </li>
                      ))}
                    </ol>
                  )}
                <button className="btn primary wide" onClick={() => { play('click'); setHintOpen(false) }}>Back to the road</button>
              </div>
              <button className="skai-modal-close" aria-label="Close" onClick={() => setHintOpen(false)}>✕</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

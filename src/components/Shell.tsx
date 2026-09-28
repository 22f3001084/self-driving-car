import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { clearSave, useSettings } from '../persist'
import { useGame } from '../store'
import { LEVELS, MISSIONS, PATROLS, CONNECTORS, infoCopy, mission, ui } from '../content'
import { play, setMuted } from '../sound'
import { NARRATOR, narratorVoiceLabel, setNarrationEnabled, stopNarration } from '../narration'
import { IconArrowLeft, IconArrowRight, IconLock, IconRestart, IconSound } from '../icons'
import player1 from '../assets/img/player-1.png'
import player2 from '../assets/img/player-2.png'
import player3 from '../assets/img/player-3.png'
import playerSolo from '../assets/img/player-solo.png'

const CREW_FACES = [player1, player2, player3]

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The SKAI Space HUD.
 *
 * Every element is corner-anchored over the scene rather than sitting in a
 * solid bar, so the street still owns the whole screen: quit key and wordmark
 * top-left, the crew's name banners top-centre, info key and mission timer
 * top-right, the segmented progress rail down the right edge, and the primary
 * CTA on its stepped white frame at the bottom.
 */
export default function Shell({
  children,
  canNext,
  nextLabel,
  onNext,
  hideNav = false,
}: {
  children: ReactNode
  canNext: boolean
  nextLabel: string
  onNext?: () => void
  /** Inside a level the CTA belongs to the level, not to the mission. */
  hideNav?: boolean
}) {
  const phase = useGame((s) => s.phase)
  const startedAt = useGame((s) => s.startedAt)
  const muted = useGame((s) => s.muted)
  const narration = useGame((s) => s.narration)
  const crew = useGame((s) => s.crew)
  const mode = useGame((s) => s.mode)
  const passed = useGame((s) => s.passed)
  const toggleMute = useGame((s) => s.toggleMute)
  const toggleNarration = useGame((s) => s.toggleNarration)
  const goBack = useGame((s) => s.goBack)
  const reset = useGame((s) => s.reset)
  const patrolId = useGame((s) => s.patrolId)
  const openPatrol = useGame((s) => s.openPatrol)
  const closeLevel = useGame((s) => s.closeLevel)

  const [menuOpen, setMenuOpen] = useState(false)
  const settings = useSettings()
  const [infoOpen, setInfoOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => setMuted(muted), [muted])
  useEffect(() => setNarrationEnabled(narration), [narration])

  useEffect(() => {
    if (!startedAt) return
    const tick = () => setElapsed(Date.now() - startedAt)
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  useEffect(() => {
    if (!menuOpen && !infoOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      setInfoOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, infoOpen])

  // The rail is one filled/total pair: the four levels, then sign-off. (The
  // question review is out of the flow — the report follows the live road
  // test directly.)
  const segments = MISSIONS.map((game) => ({
    id: game.id,
    done: game.isPatrolSet
      ? PATROLS.every((p) => passed[p.id]) && Boolean(passed.delivery)
      : game.levels.every((id) => passed[id]),
  }))
  const filled = segments.filter((segment) => segment.done).length
  const nowIndex = segments.findIndex((segment) => !segment.done)

  // Whose turn it is. The fourth level is the whole crew, so nobody is singled
  // out once the closed road is done.
  const openLevel = LEVELS.find((level) => !passed[level.id])
  const activeEngineer = openLevel?.engineer
  const onTitle = phase === 'title' || phase === 'mode'
  /**
   * Inside a level, the mission chrome stands down.
   *
   * A child driving the street had eight things on screen competing with the
   * road: a countdown, an info key, a six-segment progress rail, an instrument
   * cluster with eight readouts and a five-button camera switcher. None of them
   * is the lesson. The timer went first — a clock on a nine-year-old learning to
   * reason is pressure, not information — then the rail and the info key, which
   * both say things the level screen already says. What is left inside a level
   * is one way out, top left.
   */
  const inLevel = phase === 'play' || phase === 'patrols'
  const overBudget = elapsed > mission.budgetMinutes * 60_000


  const back = () => { play('click'); stopNarration(); goBack() }
  const next = () => {
    if (!canNext) return
    play('click')
    stopNarration()
    onNext?.()
  }

  return (
    <div className="shell">
      <main className="stage-body">{children}</main>

      {/* ---- Top-left: quit key + wordmark ---------------------------- */}
      <div className={`hud hud-tl ${onTitle ? 'is-hidden' : ''}`}>
        <button
          className="hud-quit"
          onClick={() => { play('click'); setMenuOpen(true) }}
          title="Pause the mission"
          aria-label="Pause the mission"
        >
          <IconArrowLeft light />
        </button>
        {/* The design's own brand plate (frame node 24:2230): a white angled
            slab carrying the wordmark, tucked under the back cog. */}
        <span className="skai-brand" aria-hidden="true" />
      </div>

      {/* ---- Top-centre: the crew ------------------------------------- */}
      <div className={`hud hud-tc ${onTitle || phase === 'play' || phase === 'patrols' ? 'is-hidden' : ''}`}>
        {crew.map((name, index) => {
          // Solo carries one seat and no turn-taking; a crew of three is dealt
          // one level each, so a banner lights when its level is the open one.
          const solo = mode === 'solo'
          const level = LEVELS[index]
          const done = solo ? false : level ? Boolean(passed[level.id]) : false
          const now = solo || activeEngineer === index + 1 || (!activeEngineer && !done)
          const face = solo ? playerSolo : CREW_FACES[index] ?? CREW_FACES[0]
          return (
            <span key={index} className={`crew-banner ${now ? 'is-now' : ''} ${done ? 'is-done' : ''}`}>
              <span className="crew-hex"><img src={face} alt="" /></span>
              <span className="crew-plate">
                {name.trim() || (solo ? 'Pilot' : `Engineer ${index + 1}`)}
              </span>
            </span>
          )
        })}
      </div>

      {/* ---- Top-right: info key + timer ------------------------------ */}
      <div className={`hud hud-tr ${onTitle || inLevel ? 'is-hidden' : ''}`}>
        <button
          className="hud-info"
          onClick={() => { play('click'); setInfoOpen(true) }}
          title={infoCopy.heading}
          aria-label={infoCopy.heading}
        >
          i
        </button>
        <span className={`hud-timer ${overBudget ? 'over' : ''}`} title="Time on mission">
          <em>{clock(elapsed)}</em>
        </span>
      </div>

      {/* ---- Right edge: progress rail -------------------------------- */}
      <div className={`hud hud-rail ${onTitle || inLevel ? 'is-hidden' : ''}`}>
        <div
          className="progress-rail"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={segments.length}
          aria-valuenow={filled}
        >
          <span className="rail-count">{filled}/{segments.length}</span>
          <span className="rail-track">
            {segments.map((segment, index) => (
              <span
                key={segment.id}
                className={`rail-seg ${segment.done ? 'is-filled' : ''} ${index === nowIndex ? 'is-now' : ''}`}
              />
            ))}
          </span>
        </div>
      </div>

      {/* ---- Bottom-centre: stepped frame + CTA ----------------------- */}
      <div className={`hud hud-bc cta-frame ${onTitle || hideNav ? 'is-hidden' : ''}`}>
        <div className="cta-rules" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="cta-row">
          {phase !== 'levels' && (
            <button className="hud-back" onClick={back}>
              <IconArrowLeft />{ui.back}
            </button>
          )}
          <button
            className="btn primary xl"
            onClick={next}
            disabled={!canNext}
            title={canNext ? nextLabel : ui.locked}
          >
            {canNext ? nextLabel : ui.locked}
            <span className="btn-ico">{canNext ? <IconArrowRight light /> : <IconLock light />}</span>
          </button>
        </div>
      </div>

      {/* ---- Pause ---------------------------------------------------- */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              className="modal-panel"
              role="dialog" aria-modal="true" aria-label="Mission paused"
              initial={{ scale: 0.96, y: 14, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <h2>Mission paused</h2>
              <p className="modal-sub">{clock(elapsed)} on the clock</p>
              <button className="panel-row" onClick={() => { play('click'); toggleMute() }}>
                <span className="panel-ico"><IconSound off={muted} /></span>
                <span>Sound effects</span>
                <em>{muted ? 'Off' : 'On'}</em>
              </button>
              <button className="panel-row" onClick={() => { play('click'); toggleNarration() }}>
                <span className="panel-ico"><IconSound off={!narration} /></span>
                <span>{NARRATOR.name} · {NARRATOR.accent}</span>
                <em title={narratorVoiceLabel()}>{narration ? 'On' : 'Off'}</em>
              </button>
              {/* The machine's knobs. These survive a mission restart — a
                  laptop that needs low graphics needs it for every class. */}
              <div className="panel-mixer" role="group" aria-label="Volume">
                {([
                  ['Street', 'volAmbience'],
                  ['Car', 'volVehicle'],
                  ['Effects', 'volFx'],
                ] as const).map(([label, key]) => (
                  <label key={key} className="mixer-row">
                    <span>{label}</span>
                    <input
                      type="range" min={0} max={1} step={0.1}
                      value={settings[key]}
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
              {/* Mid-run exit lives here now: the big Back key stands down
                  while the activity is live, so this is the way out. */}
              {inLevel && (
                <button
                  className="panel-row"
                  onClick={() => {
                    play('click')
                    stopNarration()
                    if (phase === 'patrols' && patrolId) openPatrol(null)
                    else closeLevel()
                    setMenuOpen(false)
                  }}
                >
                  <span className="panel-ico"><IconArrowLeft light /></span>
                  <span>Leave this run</span>
                  <em>Progress kept</em>
                </button>
              )}
              <button className="panel-row danger" onClick={() => { play('click'); stopNarration(); clearSave(); reset(); setMenuOpen(false) }}>
                <span className="panel-ico"><IconRestart /></span>
                <span>Restart the mission</span>
                <em>Progress and rules cleared</em>
              </button>
              <button className="btn primary wide" onClick={() => { play('click'); setMenuOpen(false) }}>Resume</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Info ----------------------------------------------------- */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setInfoOpen(false)}
          >
            <motion.div
              className="modal-panel info-panel"
              role="dialog" aria-modal="true" aria-label={infoCopy.heading}
              initial={{ scale: 0.96, y: 14, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <h2>{infoCopy.heading}</h2>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

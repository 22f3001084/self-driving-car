import { useEffect, useState } from 'react'
import { DELIVERY, PATROLS, PATROL_GROUPS, PATROL_TURN, TILES, reportCopy } from '../content'
import { waypointsFor } from '../sim'
import { useGame } from '../store'
import { play } from '../sound'
import { TILE_ICONS, IconArrowLeft, IconCheck } from '../icons'
import ActStage from './ActStage'
import opsRoom from '../assets/img/bg-ops-room.jpg'

/** City Patrol: choose a short challenge, then test the complete rulebook. */
export default function Patrols() {
  const patrolId = useGame((s) => s.patrolId)
  const openPatrol = useGame((s) => s.openPatrol)
  const passed = useGame((s) => s.passed)
  const setPhase = useGame((s) => s.setPhase)
  const markPassed = useGame((s) => s.markPassed)
  const crew = useGame((s) => s.crew)
  const patrol = PATROLS.find((item) => item.id === patrolId)
  const allWalked = PATROLS.every((item) => passed[item.id])
  // Decided ONCE, on mount. Reading `passed.delivery` live swapped this screen
  // back to the grid the instant the run landed, which took the delivery's own
  // "delivered" beat off the screen and never let it hand over to the report.
  const [running, setRunning] = useState(() => allWalked && !passed.delivery)
  useEffect(() => {
    if (allWalked && !patrolId && !passed.delivery) setRunning(true)
  }, [allWalked, patrolId, passed.delivery])

  if (patrol) {
    const conditionToken = patrol.tray.find((token) => TILES[token]?.kind === 'condition')
    return (
      <ActStage
        level={{
          id: patrol.id,
          n: PATROLS.indexOf(patrol) + 1,
          stage: 'iterate',
          chapter: 'City Patrol',
          name: patrol.title,
          brief: patrol.brief,
          voice: patrol.voice ?? patrol.brief,
          task: patrol.task,
          // A short run-up behind this patrol's own hazard.
          startX: Math.max(0.03, (waypointsFor(patrol.id)[0]?.x ?? 0.45) - 0.16),
          required: conditionToken ? [conditionToken] : [],
          // Whose turn this street is. Eight patrols dealt round three
          // engineers, so the hard half of the rulebook is shared too.
          engineer: PATROL_TURN[patrol.id],
          tray: patrol.tray,
          newTiles: conditionToken ? [conditionToken] : [],
          connectors: ['AND', 'OR'],
          runLabel: patrol.runLabel,
          success: patrol.success,
          successDetail: patrol.success,
        }}
        onPassed={() => undefined}
        onAdvance={() => openPatrol(null)}
        onExit={() => openPatrol(null)}
        exitLabel="Back to patrols"
        autoStart
      />
    )
  }

  // Every street walked and every rule written: the car drives the lot, on its
  // own, from the depot to the clinic. This is what the hour was for.
  if (running) {
    return (
      <ActStage
        level={DELIVERY}
        onPassed={() => markPassed(DELIVERY.id as never)}
        onAdvance={() => setPhase('report')}
        onExit={() => setPhase('report')}
        exitLabel="Skip to the report"
        autoStart={false}
      />
    )
  }

  return (
    <div className="screen brief-screen" style={{ backgroundImage: `url('${opsRoom}')` }}>
      <div className="screen-scrim" aria-hidden="true" />
      <div className="panel wide patrols-panel">
        <h2 className="panel-title">{reportCopy.patrols}</h2>
        <p className="panel-brief">{reportCopy.patrolsBrief}</p>
        {/* Eight streets in three kinds of trouble, and the board says which
            kind: people, the road itself, and the one hazard the car cannot
            even see without new hardware. */}
        <div className="patrol-groups">
        {PATROL_GROUPS.map((group) => (
          <section className="patrol-group" key={group.label}>
            <h3 className="patrol-group-tag">{group.label}</h3>
            <div className="patrol-grid">
              {group.ids.map((id) => {
                const item = PATROLS.find((patrol) => patrol.id === id)
                if (!item) return null
                const done = passed[item.id]
                const Icon = TILE_ICONS[item.tray[0]]
                return (
                  <button
                    key={item.id}
                    className={`patrol-card ${done ? 'is-done' : ''}`}
                    onClick={() => { play('click'); openPatrol(item.id) }}
                  >
                    <span className="patrol-ico">{Icon ? <Icon /> : null}</span>
                    <span className="patrol-copy">
                      <strong>{item.title}</strong>
                      <em>{item.brief}</em>
                    </span>
                    {/* Whose street this is, so the crew can see the work is
                        shared before anyone has to ask. */}
                    <span className="patrol-turn">
                      {crew[(PATROL_TURN[item.id] ?? 1) - 1]?.trim() || `Engineer ${PATROL_TURN[item.id] ?? 1}`}
                    </span>
                    {done && <span className="patrol-done"><IconCheck light /></span>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
        </div>
        <footer className="patrols-foot">
        <button className="btn ghost" onClick={() => { play('click'); setPhase('levels') }}>
          <span className="btn-ico"><IconArrowLeft light /></span>Choose a game
        </button>
        </footer>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { LEVELS, MISSIONS, PATROLS, designCopy, levelMap } from '../content'
import { useGame } from '../store'
import { play } from '../sound'
import { narrate } from '../narration'
import { IconCheck, IconPlay, IconSensor } from '../icons'
import opsLead from '../assets/img/ops-lead.png'
import street from '../assets/img/bg-street-run.jpg'

/** Three independent games, each keeping its own rules when the crew switches. */
export default function MissionBoard() {
  const passed = useGame((s) => s.passed)
  const vehicleName = useGame((s) => s.vehicleName)
  const setVehicleName = useGame((s) => s.setVehicleName)
  const sensors = useGame((s) => s.sensors)
  const setSensors = useGame((s) => s.setSensors)
  const openMission = useGame((s) => s.openMission)
  const missionId = useGame((s) => s.missionId)
  const narration = useGame((s) => s.narration)

  useEffect(() => {
    if (narration) narrate(levelMap.voice)
  }, [narration])

  return (
    <div className="screen board-screen">
      <div className="level-plate" style={{ backgroundImage: `url('${street}')` }} aria-hidden="true" />
      <div className="screen-scrim" aria-hidden="true" />
      <header className="board-head">
        <img src={opsLead} alt="" className="level-portrait" />
        <div className="level-headings">
          <h1>{levelMap.heading}</h1>
          <p>{levelMap.brief}</p>
        </div>
        <div className="level-design">
          <label className="level-name">
            <span>{designCopy.nameLabel}</span>
            <input
              value={vehicleName}
              onChange={(event) => setVehicleName(event.target.value)}
              placeholder={designCopy.namePlaceholder}
              maxLength={12}
            />
          </label>
          <fieldset className="level-sensors">
            <legend>{designCopy.sensorHeading}</legend>
            {designCopy.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`sensor-pick ${sensors === option.id ? 'is-on' : ''}`}
                aria-pressed={sensors === option.id}
                onClick={() => { play('click'); setSensors(option.id) }}
                title={option.detail}
              >
                <IconSensor light={sensors !== option.id} />{option.label}
              </button>
            ))}
          </fieldset>
        </div>
      </header>
      <ol className="board-grid">
        {MISSIONS.map((mission, index) => {
          const ids = mission.isPatrolSet ? [...PATROLS.map((p) => p.id), 'delivery' as const] : mission.levels
          const done = ids.filter((id) => passed[id]).length
          const complete = done === ids.length
          const current = missionId === mission.id || (!missionId && index === 0)
          const stops = mission.isPatrolSet
            ? [...PATROLS.map((patrol) => ({ id: patrol.id, name: patrol.title })), { id: 'delivery' as const, name: 'Deliver the parcel' }]
            : mission.levels.map((id) => ({
                id,
                name: id === 'l3' ? 'Deliver the parcel' : id === 'l4' ? 'Child at the crossing' : LEVELS.find((level) => level.id === id)?.name ?? id,
              }))
          return (
            <li key={mission.id}>
              <motion.button
                className={`mission-card ${complete ? 'is-done' : ''} ${current ? 'is-current' : ''}`}
                onClick={() => { play('click'); openMission(mission.id) }}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <span className="mission-top">
                  <span className="mission-badge">{complete ? <IconCheck /> : mission.n}</span>
                  <span className="mission-stage">{mission.stage}</span>
                </span>
                <strong className="mission-name">{mission.name}</strong>
                <span className="mission-purpose">{mission.purpose}</span>
                <ol className="mission-stops">
                  {stops.map((stop) => (
                    <li key={stop.id} className={passed[stop.id] ? 'is-done' : ''}>
                      <span className="stop-dot" aria-hidden="true">{passed[stop.id] ? <IconCheck light /> : null}</span>
                      {stop.name}
                    </li>
                  ))}
                </ol>
                <span className="mission-foot">
                  <span className="mission-count">{done}/{ids.length}</span>
                  <span className="mission-go"><IconPlay light /></span>
                </span>
              </motion.button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

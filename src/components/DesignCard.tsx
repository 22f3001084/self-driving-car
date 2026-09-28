import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { designCopy } from '../content'
import { useGame } from '../store'
import { play } from '../sound'
import { narrate } from '../narration'
import { IconArrowRight, IconSensor } from '../icons'
import depot from '../assets/img/bg-title-depot.jpg'

/**
 * The design step: name the car, choose what it can see.
 *
 * Its own screen now, right after the seating pick — these two choices used to
 * live only in the board's header, where half a class never noticed them. The
 * same controls stay on the board afterwards, so the choice can still be
 * changed before a run.
 */
export default function DesignCard() {
  const vehicleName = useGame((s) => s.vehicleName)
  const setVehicleName = useGame((s) => s.setVehicleName)
  const sensors = useGame((s) => s.sensors)
  const setSensors = useGame((s) => s.setSensors)
  const setPhase = useGame((s) => s.setPhase)
  const narration = useGame((s) => s.narration)

  useEffect(() => {
    if (narration) narrate(designCopy.voice)
  }, [narration])

  return (
    <div className="screen mode-screen design-screen" style={{ backgroundImage: `url('${depot}')` }}>
      <div className="screen-scrim" aria-hidden="true" />

      <motion.div
        className="mode-block"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <h1>{designCopy.heading}</h1>
        <p className="mode-brief">{designCopy.brief}</p>

        <div className="design-form">
          <label className="level-name design-name">
            <span>{designCopy.nameLabel}</span>
            <input
              value={vehicleName}
              onChange={(event) => setVehicleName(event.target.value)}
              placeholder={designCopy.namePlaceholder}
              maxLength={12}
              autoFocus
            />
          </label>

          <fieldset className="level-sensors design-sensors">
            <legend>{designCopy.sensorHeading}</legend>
            {designCopy.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`sensor-pick ${sensors === option.id ? 'is-on' : ''}`}
                aria-pressed={sensors === option.id}
                onClick={() => { play('click'); setSensors(option.id) }}
              >
                <IconSensor light={sensors !== option.id} />
                <span className="sensor-pick-copy">
                  <strong>{option.label}</strong>
                  <em>{option.detail}</em>
                </span>
              </button>
            ))}
          </fieldset>

          <p className="design-note">{designCopy.note}</p>
        </div>

        <button className="btn primary xl" onClick={() => { play('click'); setPhase('levels') }}>
          {designCopy.next}<span className="btn-ico"><IconArrowRight light /></span>
        </button>
      </motion.div>
    </div>
  )
}

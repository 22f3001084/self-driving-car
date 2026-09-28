import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { modeCopy } from '../content'
import { useGame } from '../store'
import { play } from '../sound'
import { narrate } from '../narration'
import { IconArrowRight } from '../icons'
import depot from '../assets/img/bg-title-depot.png'
import crewA from '../assets/img/player-1.png'
import crewB from '../assets/img/player-2.png'
import crewC from '../assets/img/player-3.png'
import solo from '../assets/img/player-solo.png'

const FACES: Record<'crew' | 'solo', string[]> = {
  crew: [crewA, crewB, crewC],
  solo: [solo],
}

/**
 * Seating. The same street, the same rules and the same edge cases either way —
 * the only difference is who is being addressed and how many seats the HUD
 * carries. Shown once, before the depot.
 */
export default function ModePick() {
  const mode = useGame((s) => s.mode)
  const setMode = useGame((s) => s.setMode)
  const setPhase = useGame((s) => s.setPhase)
  const narration = useGame((s) => s.narration)

  useEffect(() => {
    if (narration) narrate(modeCopy.voice)
  }, [narration])

  return (
    <div className="screen mode-screen" style={{ backgroundImage: `url('${depot}')` }}>
      <div className="screen-scrim" aria-hidden="true" />

      <div className="mode-block">
        <h1>{modeCopy.heading}</h1>
        <p className="mode-brief">{modeCopy.brief}</p>

        <ol className="mode-grid">
          {modeCopy.options.map((option, index) => (
            <li key={option.id}>
              <motion.button
                className={`mode-card ${mode === option.id ? 'is-on' : ''}`}
                onClick={() => { play('click'); setMode(option.id) }}
                aria-pressed={mode === option.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <span className="mode-tag">{option.tag}</span>
                <span className="mode-faces">
                  {FACES[option.id].map((src, seat) => (
                    <img key={seat} src={src} alt="" className="mode-face" />
                  ))}
                </span>
                <strong className="mode-name">{option.label}</strong>
                <em className="mode-detail">{option.detail}</em>
              </motion.button>
            </li>
          ))}
        </ol>

        <button className="btn primary xl" onClick={() => { play('click'); setPhase('design') }}>
          {modeCopy.next}<span className="btn-ico"><IconArrowRight light /></span>
        </button>
      </div>
    </div>
  )
}

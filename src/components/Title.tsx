import { motion } from 'framer-motion'
import { useGame } from '../store'
import { mission } from '../content'
import { startAmbient } from '../sound'
import { initNarration } from '../narration'
import { useCta } from '../hud'
import titleBg from '../assets/img/bg-title-depot.jpg'
import flatMid from '../assets/img/bg2d-mid.jpg'

/** The flat edition opens on ITS OWN street, not the 3D depot render — the
 *  dusk photo hard-cut to a noon painted street one click later, and the two
 *  editions of one game looked like two games. Same pattern as the scene
 *  branch: decided at build time. */
const FLAT = import.meta.env.VITE_SCENE_2D === '1'

/** Title screen. Mission name and the board's own key — nothing else. */
export default function Title() {
  const setPhase = useGame((s) => s.setPhase)

  // Solo is parked for now: the game always starts as a crew of three, and
  // Start skips the seating picker and goes straight to the design step.
  const setMode = useGame((s) => s.setMode)
  const start = () => {
    initNarration()
    startAmbient()
    setMode('crew')
    setPhase('design')
  }

  // The board's CTA plate is the start key.
  useCta(mission.start, false, start)

  return (
    <div className="screen title-screen" style={FLAT ? undefined : { backgroundImage: `url('${titleBg}')` }}>
      {FLAT && (
        /* The daytime painted street, built from the game's own layers: the
           CSS sky, one static strip of the shopfronts, the road band. Zero
           new assets — this IS the street the child is about to drive. */
        <div className="title-flat" aria-hidden="true">
          <div className="w2d-sky" />
          <div
            className="title-flat-strip"
            style={{ backgroundImage: `url('${flatMid}')` }}
          />
          <div className="w2d-road" />
        </div>
      )}
      <div className="title-scrim" aria-hidden="true" />
      <motion.div
        className="title-block"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <h1 className="title-name">{mission.name}</h1>
        <p className="title-sub">Grab your crew — two to four players. One smart car. A city that needs your help.</p>
      </motion.div>
    </div>
  )
}

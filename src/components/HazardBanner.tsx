import { motion } from 'framer-motion'
import { faultUi, sensorCopy } from '../choices'
import { TILES } from '../content'

/** The flat edition has no 3D cards, so its keys must carry the card text. */
const FLAT = import.meta.env.VITE_SCENE_2D === '1'

/**
 * The question, as HUD — reduced to the keypad.
 *
 * The banner and the bottom panel used to slide in at every stop, and after the
 * third stop they were the same cream rectangles saying the same kind of thing
 * again. They are gone: the three cards standing in the street ARE the
 * question, the street shows the scene, and the narrator (plus the editor's
 * coaching line) carries the reasoning.
 *
 * What remains is this one slim row of keys, because the cards need a second
 * route in: a keyboard, a screen reader, and a thumb nowhere near a card all
 * land here. The keys wear the same navy-panel skin as every other plate on
 * screen; the number ties each key to the badge on the card standing in that
 * position, and each key's accessible name is the full text of its card, so
 * the row reads as the question to a screen reader even though no question is
 * printed.
 *
 * In the FLAT edition there are no cards in the street, so here — and only
 * here — the keys grow into full option cards carrying the card text, and they
 * are DEALT: each one springs in on its own beat (the whole deal is under half
 * a second at a hard stop — nothing slowed).
 */
export default function HazardBanner({
  trigger,
  labels,
  hover,
  sensor = false,
  vehicleName,
  turnLabel,
  committed = null,
  onPick,
}: {
  trigger: string
  /** The card copy, in the order they are standing in the street. */
  labels: string[]
  /** Which card the pointer is over, so the keypad can echo it. */
  hover: number | null
  /** True for the rear-sensor question, which is a different kind of fault. */
  sensor?: boolean
  vehicleName: string
  /** Keeps the next engineer visible when levels flow without a briefing. */
  turnLabel?: string | null
  /** The card the child has committed to — the keypad flares it while the
      others stand down, so the pick is acknowledged the instant it lands. */
  committed?: number | null
  /** Same handler the 3D cards use — this is the touch and keyboard route in. */
  onPick: (index: number) => void
}) {
  const question = sensor ? sensorCopy.question(vehicleName) : faultUi.question(vehicleName)

  const keyClass = (index: number) =>
    `hz-key ${hover === index ? 'is-hot' : ''} ${committed === index ? 'is-committed' : ''}`

  return (
    <motion.div
      className={`hz-banner ${FLAT ? 'hz-banner--flat' : ''}`}
      initial={{ opacity: 0, y: FLAT ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: FLAT ? -12 : 12 }}
      transition={{ type: 'tween', duration: 0.26 }}
    >
      {/* The rule grammar, right where the decision is made: IF the thing in
          the road, THEN one of these. The cards below ARE the THEN. */}
      {turnLabel && <span className="hz-turn">{turnLabel}</span>}
      <div className="hz-ifthen">
        <b className="hz-if">IF</b>
        <span className="hz-cond">{TILES[trigger]?.label ?? trigger}</span>
        <b className="hz-then">THEN</b>
        <span className="hz-pick">{sensor ? 'what must it see?' : '?'}</span>
      </div>
      {/* The question, for a screen reader: nothing on screen prints it. */}
      <span className="sr-only" role="status">{turnLabel ? `${turnLabel}. ` : ''}{question} Press 1, 2 or 3.</span>
      <div className={`hz-keys ${FLAT ? 'hz-keys--flat' : ''}`} role="group" aria-label={question}>
        {labels.map((label, index) => (
          FLAT ? (
            <motion.button
              key={label}
              type="button"
              className={keyClass(index)}
              aria-label={`Card ${index + 1}: ${label}`}
              title={`Press ${index + 1}`}
              onClick={() => onPick(index)}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 24, delay: 0.16 * index }}
            >
              {/* The same anatomy as the 3D card face: a coloured header
                  band carrying the number rivet, the label below. */}
              <span className="hz-key-band" aria-hidden="true">
                <span className="hz-key-num">{index + 1}</span>
              </span>
              <span className="hz-key-label" aria-hidden="true">{label}</span>
            </motion.button>
          ) : (
            <button
              key={label}
              type="button"
              className={keyClass(index)}
              aria-label={`Card ${index + 1}: ${label}`}
              title={`Press ${index + 1}`}
              onClick={() => onPick(index)}
            >
              {index + 1}
            </button>
          )
        ))}
      </div>
    </motion.div>
  )
}

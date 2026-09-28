import { motion } from 'framer-motion'
import { outcomeCopy, reviewUi, type Outcome } from '../choices'
import { play } from '../sound'

/**
 * The retry key: a ring with an arrowhead on it.
 *
 * Drawn here rather than pulled from the icon sheet because it has to be big,
 * round and unmistakable — it is the only control on the screen after a crash,
 * and a five-year-old should be able to find it without reading the label. The
 * arrowhead sits at the end of the arc so the ring reads as going somewhere.
 */
function RetryRing() {
  return (
    <svg className="fv-ring" viewBox="0 0 48 48" aria-hidden="true">
      {/* Three-quarters of a circle, opening at the top right. */}
      <path d="M40 24a16 16 0 1 1-4.7-11.3" />
      {/* The head, on the end of that arc. */}
      <path d="M24 4.4 35.6 12 27 18.6" />
    </svg>
  )
}

/**
 * What just happened, and one way out of it.
 *
 * The car has carried out a wrong answer in the street and crashed, and the
 * camera now belongs to the child. So this is a strip along the bottom of the
 * frame and nothing else: it names the crash, says which part of their answer
 * caused it, and offers another go. Anything larger would cover the very thing
 * it is talking about.
 */
export default function FaultVerdict({
  outcome,
  why,
  tag,
  lead,
  hint = '',
  attempt,
  onRetry,
}: {
  outcome: Outcome
  /** The card's own explanation of why it does not work. */
  why: string
  /** Overrides, for a failure that is not one of the driven outcomes. */
  tag?: string
  lead?: string
  /** The coaching line for the NEXT go — the retry ladder used to exist only
      as narration, which a muted classroom never heard. */
  hint?: string
  /** How many goes this hazard has had, shown so the effort is visible. */
  attempt: number
  onRetry: () => void
}) {
  const copy = outcomeCopy[outcome]
  return (
    <motion.div
      className="fv-strip"
      data-outcome={outcome}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ type: 'tween', duration: 0.28 }}
      role="alert"
    >
      <span className="fv-tag">{tag ?? copy?.tag ?? 'CRASHED'}</span>
      <div className="fv-copy">
        <strong className="fv-lead">{lead ?? copy?.lead}</strong>
        <p className="fv-why">{why}</p>
        {hint && <p className="fv-hint">{hint}</p>}
      </div>
      <div className="fv-actions">
        {attempt > 0 && <span className="fv-attempt">Go {attempt + 1}</span>}
        <button
          className="fv-go"
          onClick={() => { play('click'); onRetry() }}
          aria-label={reviewUi.retry}
          title={reviewUi.retry}
        >
          <RetryRing />
          <span>{reviewUi.retry}</span>
        </button>
      </div>
    </motion.div>
  )
}

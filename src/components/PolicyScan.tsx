import { AnimatePresence, motion } from 'framer-motion'
import { TILES, ui } from '../content'
import { useGame } from '../store'
import { TILE_ICONS, IconCheck } from '../icons'
import type { ScanRow } from '../sim'

/**
 * The scan, played out loud — ONE rule at a time.
 *
 * The one law of this machine is "read from the top, first match wins", and
 * this is where the crew watches it happen: rule 1 appears alone, is checked,
 * and if it does not match it VANISHES and rule 2 takes its place — until the
 * matching rule lands and stays, naming its action. Rules below the match are
 * never even shown, which is priority made literal. If every rule misses, an
 * empty-handed card says so, and the car stops to ask.
 *
 * (It used to be the full list with rows lighting up in place; the room read
 * that as a wall of text. One card at a time is one thought at a time.)
 */
export default function PolicyScan({
  trace,
  shown,
  trigger,
}: {
  trace: ScanRow[]
  /** The walk position, in half-steps: row = shown/2, odd = verdict stamped. */
  shown: number
  trigger: string
}) {
  const rules = useGame((s) => s.rules)
  const TriggerIcon = TILE_ICONS[trigger]

  const total = trace.length
  const row = Math.min(Math.floor(shown / 2), total)
  const stamped = shown % 2 === 1
  const current = row < total ? trace[row] : null
  const rule = current ? rules.find((item) => item.id === current.ruleId) : null
  const status = current ? (stamped ? current.status : 'reading') : 'nomatch'

  return (
    <motion.aside
      className="scan-panel"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ type: 'tween', duration: 0.22 }}
    >
      <header className="scan-head">
        <span className="scan-title">{ui.scanTitle}</span>
        <span className="scan-trigger">
          {TriggerIcon && <TriggerIcon />}
          {TILES[trigger]?.label ?? trigger}
        </span>
      </header>
      <p className="scan-law">{ui.priorityLaw}</p>

      <div className="scan-list">
        <AnimatePresence mode="wait">
          {rule && current ? (
            <motion.div
              key={current.ruleId}
              className={`scan-rule is-${status}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { type: 'tween', duration: 0.08 } }}
              transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
            >
              <span className="scan-n">{row + 1}</span>
              <span className="scan-if">
                {rule.conditions.filter((c) => c.token).map((c, i) => (
                  <span key={c.token}>{i > 0 && ' or '}{TILES[c.token]?.label ?? c.token}</span>
                ))}
              </span>
              <span className="scan-verdict" aria-live="polite">
                {status === 'reading' && <span aria-hidden="true">· · ·</span>}
                {status === 'miss' && ui.scanMiss}
                {(status === 'fired' || status === 'else') && (
                  <>
                    <IconCheck />
                    {status === 'else' ? 'ELSE — ' : ''}
                    {actionsLabel(status === 'else' ? (rule.elseActions ?? []) : rule.actions)}
                  </>
                )}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="nomatch"
              className="scan-rule is-nomatch"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
            >
              {total === 0 ? ui.policyEmpty : ui.scanNoMatch}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  )
}

function actionsLabel(actions: { token: string }[]) {
  return actions
    .filter((a) => a.token)
    .map((a) => TILES[a.token]?.label ?? a.token)
    .join(' + ')
}

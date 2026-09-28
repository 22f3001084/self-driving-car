import { AnimatePresence, motion } from 'framer-motion'
import { TILES, ui } from '../content'
import { useState } from 'react'
import { useGame } from '../store'
import { play } from '../sound'
import { TILE_ICONS, IconTrash } from '../icons'

/**
 * The crew's shared artefact: the vehicle policy, always on screen. Rules fire
 * top-down, so the order is part of the answer and has to stay visible.
 */
export default function PolicyList({ reorderable = true, readOnly = false, onEdit, onChanged }: { reorderable?: boolean; readOnly?: boolean; onEdit?: () => void; onChanged?: () => void }) {
  const rules = useGame((s) => s.rules)
  const highlighted = useGame((s) => s.highlightedRuleIds)
  const editingId = useGame((s) => s.editingId)
  const editRule = useGame((s) => s.editRule)
  const deleteRule = useGame((s) => s.deleteRule)
  const clearRules = useGame((s) => s.clearRules)
  const moveRule = useGame((s) => s.moveRule)
  const undoRules = useGame((state) => state.undoRules)
  const redoRules = useGame((state) => state.redoRules)
  const canUndo = useGame((state) => state.rulesPast.length > 0)
  const canRedo = useGame((state) => state.rulesFuture.length > 0)

  // Deleting the whole policy is a big move, so it asks once.
  const [confirming, setConfirming] = useState(false)

  return (
    <aside className="policy">
      <header className="policy-head" title={ui.priorityLaw}>
        <h3>{ui.policy}</h3>
        <span className="policy-count">{rules.length}</span>
        {/* Undo/redo over the policy: the one place a mis-tap is destructive. */}
        <span className="policy-undo" role="group" aria-label="Undo and redo">
          <button
            className="policy-step"
            disabled={!canUndo}
            onClick={() => { play('click'); undoRules() }}
            title="Undo the last policy change"
            aria-label="Undo"
          >↺</button>
          <button
            className="policy-step"
            disabled={!canRedo}
            onClick={() => { play('click'); redoRules() }}
            title="Redo"
            aria-label="Redo"
          >↻</button>
        </span>
        {rules.length > 0 && (
          <button
            className={`policy-clear ${confirming ? 'is-confirming' : ''}`}
            onClick={() => {
              play('click')
              if (!confirming) { setConfirming(true); return }
              clearRules()
              setConfirming(false)
            }}
            onBlur={() => setConfirming(false)}
          >
            <IconTrash />{confirming ? ui.clearAllConfirm : ui.clearAll}
          </button>
        )}
      </header>

      {/* The one law of the machine, stated where the order is edited. */}
      <p className="policy-law">{ui.priorityLaw}</p>

      {rules.length === 0 && <p className="policy-empty">{ui.policyEmpty}</p>}

      <ol className="policy-list">
        <AnimatePresence initial={false}>
          {rules.map((rule, index) => {
            const conditions = rule.conditions.filter((c) => c.token)
            const actions = rule.actions.filter((a) => a.token)
            const elses = (rule.elseActions ?? []).filter((a) => a.token)
            return (
              <motion.li
                key={rule.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`policy-rule ${highlighted.includes(rule.id) ? 'is-flagged' : ''} ${editingId === rule.id ? 'is-editing' : ''}`}
              >
                <span className="policy-order" title={`Priority ${index + 1}`}>{index + 1}</span>
                {/* One row per clause. A fixed row count keeps every rule the
                    same height, so the list never wraps out of its panel. */}
                <span className="policy-body">
                  <span className="policy-row">
                    <em>IF</em>
                    {conditions.map((condition, i) => (
                      <span key={condition.token} className="policy-token">
                        {i > 0 && <em>OR</em>}
                        <Token token={condition.token} />
                      </span>
                    ))}
                  </span>
                  <span className="policy-row">
                    <em>THEN</em>
                    {actions.map((action, i) => (
                      <span key={action.token} className="policy-token">
                        {i > 0 && <em>AND</em>}
                        <Token token={action.token} />
                      </span>
                    ))}
                  </span>
                  {elses.length > 0 && (
                    <span className="policy-row">
                      <em>ELSE</em>
                      {elses.map((action) => <Token key={action.token} token={action.token} />)}
                    </span>
                  )}
                </span>
                <span className="policy-tools">
                  {reorderable && (
                    <>
                      <button onClick={() => { play('click'); moveRule(rule.id, -1); onChanged?.() }} disabled={index === 0} aria-label="Move rule up">▲</button>
                      <button onClick={() => { play('click'); moveRule(rule.id, 1); onChanged?.() }} disabled={index === rules.length - 1} aria-label="Move rule down">▼</button>
                    </>
                  )}
                  {!readOnly && (
                    <button onClick={() => { play('click'); editRule(rule.id); onEdit?.() }} aria-label="Edit rule">✎</button>
                  )}
                  <button onClick={() => { play('click'); deleteRule(rule.id); onChanged?.() }} aria-label="Delete rule">✕</button>
                </span>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>

    </aside>
  )
}

function Token({ token }: { token: string }) {
  const tile = TILES[token]
  const Icon = TILE_ICONS[token]
  if (!tile) return null
  return (
    <span className={`policy-chip chip-${tile.kind}`}>
      {Icon && <span className="chip-ico"><Icon /></span>}
      {tile.label}
    </span>
  )
}

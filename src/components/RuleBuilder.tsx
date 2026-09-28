import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { motion } from 'framer-motion'
import { CONNECTORS, TILES, ui, type ConnectorToken } from '../content'
import { play } from '../sound'
import { useGame } from '../store'
import { TILE_ICONS, IconCheck, IconLightbulb, IconRestart } from '../icons'

type SlotId = `c${number}` | `a${number}` | 'e0'

const SAFE_ANSWER: Record<string, string[]> = {
  SCOOTER: ['SLOW'],
  NARROW: ['SLOW'],
  ARRIVED: ['DELIVER'],
  MOVING: ['FULLSTOP'],
  MANY_MOVING: ['WAIT_CLEAR'],
  ROAD_WET: ['SLOW_EARLY', 'LEAVE_SPACE'],
  EMERGENCY_BEHIND: ['MOVE_ASIDE', 'STOP_SAFE'],
  CYCLIST: ['SLOW', 'LEAVE_SPACE'],
  DOG: ['FULLSTOP', 'HONK'],
  DEAD_END: ['TURN'],
  ROAD_BLOCKED: ['HONK'],
  FOG: ['SLOW_EARLY', 'HONK'],
}

interface DragData {
  token: string
  kind: 'condition' | 'action'
}

function Chip({
  token,
  hinted,
  isNew,
  onTap,
  onFocusTile,
}: {
  token: string
  hinted: boolean
  isNew?: boolean
  onTap: () => void
  onFocusTile: (token: string | null) => void
}) {
  const tile = TILES[token]
  const Icon = TILE_ICONS[token]
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${token}`,
    data: { token, kind: tile.kind } satisfies DragData,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`chip chip-${tile.kind} ${tile.decoy ? 'is-decoy' : ''} ${tile.strong ? 'is-strong' : ''} ${hinted ? 'is-hinted' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onClick={onTap}
      onPointerEnter={() => onFocusTile(token)}
      onPointerLeave={() => onFocusTile(null)}
      onFocus={() => onFocusTile(token)}
      onBlur={() => onFocusTile(null)}
      {...listeners}
      {...attributes}
    >
      {Icon && <span className="chip-ico"><Icon /></span>}
      <span className="chip-label">{tile.label}</span>
      {isNew && <span className="chip-new">new</span>}
    </button>
  )
}

function Slot({
  id,
  token,
  kind,
  active,
  hinted,
  onSelect,
  onClear,
}: {
  id: SlotId
  token: string
  kind: 'condition' | 'action'
  active: boolean
  hinted: boolean
  onSelect: () => void
  onClear: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { kind } })
  const tile = token ? TILES[token] : null
  const Icon = token ? TILE_ICONS[token] : null
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`slot slot-${kind} ${token ? 'filled' : ''} ${active ? 'is-active' : ''} ${hinted ? 'is-hinted' : ''} ${isOver ? 'is-over' : ''}`}
      onClick={() => (token ? onClear() : onSelect())}
      aria-label={token ? `Remove ${tile?.label}` : kind === 'condition' ? ui.situation : ui.action}
    >
      {token ? (
        <>
          {Icon && <span className="chip-ico"><Icon /></span>}
          <span className="chip-label">{tile?.label}</span>
        </>
      ) : (
        <span className="slot-ph">{kind === 'condition' ? ui.situation : ui.action}</span>
      )}
    </button>
  )
}

export default function RuleBuilder({
  tray,
  connectors,
  newTiles,
  requiredConditions,
  lockedCondition,
  onSaved,
}: {
  tray: string[]
  connectors: ConnectorToken[]
  newTiles: string[]
  requiredConditions: string[]
  /** The hazard the vehicle is stopped at. Locks the IF and hides the clutter. */
  lockedCondition?: string
  onSaved?: () => void
}) {
  const draft = useGame((s) => s.draft)
  const rules = useGame((s) => s.rules)
  const editingId = useGame((s) => s.editingId)
  const setDraftCondition = useGame((s) => s.setDraftCondition)
  const setDraftAction = useGame((s) => s.setDraftAction)
  const setDraftElse = useGame((s) => s.setDraftElse)
  const clearDraftSlot = useGame((s) => s.clearDraftSlot)
  const addConnector = useGame((s) => s.addConnector)
  const removeConnector = useGame((s) => s.removeConnector)
  const clearDraft = useGame((s) => s.clearDraft)
  const saveDraft = useGame((s) => s.saveDraft)

  // The sensors already know what is in front of the vehicle, so the condition
  // is filled in for the student and only the response is left to decide.
  useEffect(() => {
    if (lockedCondition && draft.conditions[0]?.token !== lockedCondition) {
      setDraftCondition(0, lockedCondition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedCondition, draft.id])

  const [activeSlot, setActiveSlot] = useState<SlotId | null>(null)
  const [dragToken, setDragToken] = useState('')
  const [focusTile, setFocusTile] = useState<string | null>(null)
  const [hint, setHint] = useState<{ chip: string; slot: SlotId; line: string } | null>(null)

  const conditions = draft.conditions
  const actions = draft.actions
  const elseAction = draft.elseActions[0]?.token ?? null
  const hasElse = draft.elseActions.length > 0

  const firstEmpty = useMemo<SlotId | null>(() => {
    const conditionIndex = conditions.findIndex((slot) => !slot.token)
    if (conditionIndex >= 0) return `c${conditionIndex}` as SlotId
    const actionIndex = actions.findIndex((slot) => !slot.token)
    if (actionIndex >= 0) return `a${actionIndex}` as SlotId
    if (hasElse && !elseAction) return 'e0'
    return null
  }, [conditions, actions, hasElse, elseAction])

  const target = activeSlot ?? firstEmpty
  const complete =
    Boolean(conditions[0]?.token) &&
    Boolean(actions[0]?.token) &&
    conditions.every((slot) => slot.token) &&
    actions.every((slot) => slot.token) &&
    (!hasElse || Boolean(elseAction))

  useEffect(() => { setActiveSlot(null) }, [draft.id])
  useEffect(() => {
    if (!hint) return
    const timer = window.setTimeout(() => setHint(null), 4200)
    return () => window.clearTimeout(timer)
  }, [hint])

  const placeToken = (token: string, slot: SlotId | null) => {
    const tile = TILES[token]
    const chosen = slot ?? firstEmpty
    if (!chosen) return
    const wantsCondition = chosen.startsWith('c')
    if (tile.kind === 'condition' && !wantsCondition) return
    if (tile.kind === 'action' && wantsCondition) return
    if (chosen === 'e0') setDraftElse(token)
    else if (wantsCondition) setDraftCondition(Number(chosen.slice(1)), token)
    else setDraftAction(Number(chosen.slice(1)), token)
    play('click')
    setActiveSlot(null)
    setHint(null)
  }

  const tapChip = (token: string) => {
    const tile = TILES[token]
    // A tap always lands somewhere sensible: the selected slot if it takes this
    // kind of block, otherwise the first empty slot of the right kind.
    const chosen = target && (target.startsWith('c') === (tile.kind === 'condition')) ? target : null
    if (chosen) { placeToken(token, chosen); return }
    if (tile.kind === 'condition') {
      const index = conditions.findIndex((slot) => !slot.token)
      placeToken(token, `c${index < 0 ? 0 : index}` as SlotId)
    } else {
      const index = actions.findIndex((slot) => !slot.token)
      if (index < 0 && hasElse && !elseAction) placeToken(token, 'e0')
      else placeToken(token, `a${index < 0 ? 0 : index}` as SlotId)
    }
  }

  const showHint = () => {
    play('click')
    const written = claimed
    const nextCondition =
      requiredConditions.find((token) => !written.has(token) && token === conditions[0]?.token) ??
      requiredConditions.find((token) => !written.has(token)) ??
      requiredConditions[0]
    if (!conditions[0]?.token) {
      // nextCondition can be undefined if a level ships no required condition,
      // and an unguarded TILES lookup here is a hard crash on a button press.
      const label = nextCondition ? TILES[nextCondition]?.label : null
      setHint({
        chip: nextCondition ?? '',
        slot: 'c0',
        line: label ? `Start with the situation: ${label}.` : 'Start with the situation on the left.',
      })
      return
    }
    const answer = SAFE_ANSWER[conditions[0].token] ?? []
    const missingIndex = answer.findIndex((token, index) => actions[index]?.token !== token)
    if (missingIndex >= 0 && answer[missingIndex]) {
      if (missingIndex > 0 && actions.length < 2) addConnector('AND')
      const situation = TILES[conditions[0].token]?.label ?? 'This situation'
      const needed = TILES[answer[missingIndex]]?.label
      setHint({
        chip: answer[missingIndex],
        slot: `a${missingIndex}` as SlotId,
        line: needed ? `${situation} needs ${needed}.` : `${situation} needs a different action.`,
      })
      return
    }
    setHint({ chip: '', slot: 'c0', line: 'This rule is ready — add it to the policy, then road-test it.' })
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragStart = ({ active }: DragStartEvent) => {
    setDragToken((active.data.current as DragData | undefined)?.token ?? '')
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const data = active.data.current as DragData | undefined
    setDragToken('')
    if (!data || !over) return
    placeToken(data.token, String(over.id) as SlotId)
  }

  // One rule per situation: once a situation has a rule, its block leaves the
  // tray. Editing that rule brings its own block back so it can be re-picked.
  const claimed = new Set(
    rules
      .filter((rule) => rule.id !== editingId)
      .flatMap((rule) => rule.conditions.map((condition) => condition.token))
      .filter(Boolean),
  )
  const conditionTray = tray.filter(
    (token) => TILES[token]?.kind === 'condition' && (!claimed.has(token) || conditions.some((slot) => slot.token === token)),
  )
  const actionTray = tray.filter((token) => TILES[token]?.kind === 'action')
  const order = (token: string) => (newTiles.includes(token) ? 0 : 1)
  conditionTray.sort((a, b) => order(a) - order(b))
  actionTray.sort((a, b) => order(a) - order(b))

  const glossToken = focusTile ?? conditions[0]?.token ?? actions[0]?.token ?? null
  const DragIcon = dragToken ? TILE_ICONS[dragToken] : null

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="builder">
        <div className={`rule-line ${lockedCondition ? 'is-locked' : ''}`}>
          <span className="kw">IF</span>
          {lockedCondition ? (
            <span className="rule-part">
              <span className="slot slot-condition filled is-fixed">
                {TILE_ICONS[lockedCondition] && (
                  <span className="chip-ico">{(() => { const I = TILE_ICONS[lockedCondition]; return <I /> })()}</span>
                )}
                <span className="chip-label">{TILES[lockedCondition]?.label}</span>
              </span>
            </span>
          ) : conditions.map((slot, index) => (
            <span key={`c${index}`} className="rule-part">
              {index > 0 && (
                <button className="kw kw-drop" onClick={() => { play('click'); removeConnector('OR') }} title="Remove OR">OR</button>
              )}
              <Slot
                id={`c${index}` as SlotId}
                token={slot.token}
                kind="condition"
                active={target === `c${index}`}
                hinted={hint?.slot === `c${index}`}
                onSelect={() => setActiveSlot(`c${index}` as SlotId)}
                onClear={() => { play('click'); clearDraftSlot('condition', index) }}
              />
            </span>
          ))}

          <span className="kw">THEN</span>
          {actions.map((slot, index) => (
            <span key={`a${index}`} className="rule-part">
              {index > 0 && (
                <button className="kw kw-drop" onClick={() => { play('click'); removeConnector('AND') }} title="Remove AND">AND</button>
              )}
              <Slot
                id={`a${index}` as SlotId}
                token={slot.token}
                kind="action"
                active={target === `a${index}`}
                hinted={hint?.slot === `a${index}`}
                onSelect={() => setActiveSlot(`a${index}` as SlotId)}
                onClear={() => { play('click'); clearDraftSlot('action', index) }}
              />
            </span>
          ))}

          {hasElse && (
            <span className="rule-part">
              <button className="kw kw-drop" onClick={() => { play('click'); removeConnector('ELSE') }} title="Remove ELSE">ELSE</button>
              <Slot
                id="e0"
                token={elseAction ?? ''}
                kind="action"
                active={target === 'e0'}
                hinted={hint?.slot === 'e0'}
                onSelect={() => setActiveSlot('e0')}
                onClear={() => { play('click'); clearDraftSlot('else', 0) }}
              />
            </span>
          )}
        </div>

        {/* One flowing tray. Colour separates situations from actions, so the
            three group headings that used to sit beside them are gone. */}
        <div className="tray" role="group" aria-label="Rule blocks">
          {!lockedCondition && conditionTray.map((token) => (
            <Chip key={token} token={token} hinted={hint?.chip === token} isNew={newTiles.includes(token)} onTap={() => tapChip(token)} onFocusTile={setFocusTile} />
          ))}
          {!lockedCondition && <span className="tray-sep" aria-hidden="true" />}
          {actionTray.map((token) => (
            <Chip key={token} token={token} hinted={hint?.chip === token} isNew={newTiles.includes(token)} onTap={() => tapChip(token)} onFocusTile={setFocusTile} />
          ))}
          {connectors.length > 0 && <span className="tray-sep" aria-hidden="true" />}
          {connectors.map((token) => {
            const used =
              (token === 'OR' && conditions.length > 1) ||
              (token === 'AND' && actions.length > 1) ||
              (token === 'ELSE' && hasElse)
            return (
              <button
                key={token}
                type="button"
                className={`chip chip-connector ${used ? 'is-used' : ''}`}
                onClick={() => { play('click'); if (used) removeConnector(token); else addConnector(token) }}
                onPointerEnter={() => setFocusTile(null)}
                title={CONNECTORS[token].gloss}
              >
                {CONNECTORS[token].label}
              </button>
            )
          })}
        </div>

        {/* The hint writes into this line, so it has to exist even when the
            situation is locked — otherwise pressing Hint at a halt does
            nothing at all, which reads as a broken button. When locked it
            carries only the hint and the block gloss, not the idle prompt. */}
        <p className={`gloss-line ${hint?.line ? 'is-hint' : ''}`}>
          {hint?.line ?? (glossToken ? TILES[glossToken]?.gloss : (lockedCondition ? '' : ui.builderIdle))}
        </p>

        <div className="builder-actions">
          {!lockedCondition && (
            <button className="btn ghost sm" onClick={() => { play('click'); clearDraft(); setHint(null) }}>
              <span className="btn-ico"><IconRestart /></span>{ui.clear}
            </button>
          )}
          <button className="btn ghost sm" onClick={showHint}>
            <span className="btn-ico"><IconLightbulb /></span>{ui.hint}
          </button>
          <motion.button
            className="btn accent sm"
            disabled={!complete}
            whileTap={complete ? { scale: 0.97 } : undefined}
            onClick={() => { if (saveDraft()) { play('success'); onSaved?.() } }}
          >
            <span className="btn-ico"><IconCheck /></span>{editingId ? ui.updateRule : ui.saveRule}
          </motion.button>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
        {dragToken && TILES[dragToken] ? (
          <div className={`chip chip-${TILES[dragToken].kind} is-overlay`}>
            {DragIcon && <span className="chip-ico"><DragIcon /></span>}
            <span className="chip-label">{TILES[dragToken].label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

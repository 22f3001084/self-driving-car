import { useEffect, useState } from 'react'
import deliveredArt from '../assets/img/delivered.png'
import { motion } from 'framer-motion'
import { LEVELS, PATROLS, TILES, designCopy, reportCopy, ruleSentence } from '../content'
import { SENSOR_CHOICES } from '../choices'
import { useGame } from '../store'
import { play } from '../sound'
import { narrate } from '../narration'
import { IconArrowLeft, IconArrowRight, IconCheck, IconRestart, IconRoute, IconSensor } from '../icons'
import { useCta } from '../hud'
import { totalStars, RULE_STOP_IDS } from '../campaign'
import opsRoom from '../assets/img/bg-ops-room.jpg'

/** One per learning objective in the Group Digital Mission Brief, so the report
 *  is evidence against the brief rather than a generic well-done. */
const STAMPS = [
  { id: 'design', label: 'Designed the rules', detail: 'Built rules for a brand-new problem.' },
  { id: 'order', label: 'Agreed the order', detail: 'Agreed which rules come first.' },
  { id: 'diagnosis', label: 'Diagnosed the failure', detail: 'Found exactly why a working plan still failed.' },
  { id: 'unplanned', label: 'Handled the unplanned', detail: 'Wrote a rule for something nobody planned for.' },
  { id: 'transfer', label: 'Spotted it elsewhere', detail: 'Named another plan that needs a rule for the unexpected.' },
]

/**
 * The mission report, one page at a time.
 *
 * It used to be everything at once — policy, crew, stamps, teacher block — in
 * one panel that scrolled and clipped. A child reads one thing at a time, so
 * the report walks through four steps: the result, the policy, the crew's
 * skills, and the teacher's numbers. Printing still prints ALL of it: every
 * step is in the DOM and the print stylesheet reveals the lot.
 */
export default function Report() {
  const crew = useGame((s) => s.crew)
  const mode = useGame((s) => s.mode)
  const rules = useGame((s) => s.rules)
  const vehicleName = useGame((s) => s.vehicleName)
  const sensors = useGame((s) => s.sensors)
  const startedAt = useGame((s) => s.startedAt)
  const narration = useGame((s) => s.narration)
  const setPhase = useGame((s) => s.setPhase)
  const reset = useGame((s) => s.reset)

  const retries = useGame((s) => s.retries)
  const passed = useGame((s) => s.passed)
  const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) : 0
  /**
   * The teacher's row: how hard each stop was fought for. `retries` counts
   * every extra attempt — a crash retried, a rule rewritten — so it is the
   * honest number, and it never leaves this machine.
   */
  const attempts = Object.entries(retries)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([id, count]) => ({ id, count: count ?? 0 }))
  const clearedCount = Object.values(passed).filter(Boolean).length
  // The ambulance patrol can fit a sensor the design step never offered.
  const sensorLabel = designCopy.options.find((option) => option.id === sensors)?.label
    ?? SENSOR_CHOICES.find((option) => option.id === sensors)?.label ?? ''
  const nameOf = (id: string) =>
    LEVELS.find((level) => level.id === id)?.name ?? PATROLS.find((patrol) => patrol.id === id)?.title ?? id
  const movingRule = rules.find((rule) => rule.conditions.some((condition) => condition.token === 'MOVING'))

  const [step, setStep] = useState(0)
  const steps = ['The result', 'The policy', mode === 'solo' ? 'Pilot & skills' : 'Crew & skills', 'For the teacher']

  // The board's CTA walks the report; on the last page it starts a new run.
  useCta(
    step < steps.length - 1 ? 'NEXT PAGE' : 'NEW MISSION',
    false,
    () => { if (step < steps.length - 1) go(step + 1); else { play('click'); reset() } },
  )

  useEffect(() => {
    if (narration) narrate(reportCopy.signOff)
  }, [narration])

  const go = (next: number) => {
    play('click')
    setStep(Math.max(0, Math.min(steps.length - 1, next)))
  }

  return (
    <div className="screen brief-screen" style={{ backgroundImage: `url('${opsRoom}')` }}>
      <div className="screen-scrim" aria-hidden="true" />
      <motion.div
        className="panel wide report-panel"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="report-head">
          <div>
            <h2 className="panel-title">{reportCopy.heading}</h2>
            <p className="report-signoff"><IconCheck light /> {reportCopy.signOff}</p>
          </div>
          {/* One step at a time; the dots are also buttons. */}
          <nav className="report-stepper no-print" aria-label="Report pages">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`report-step-dot ${index === step ? 'is-on' : ''}`}
                aria-current={index === step}
                onClick={() => go(index)}
              >
                <b>{index + 1}</b>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* ---- Step 1: the result --------------------------------------- */}
        <section className={`report-step ${step === 0 ? 'is-on' : ''}`}>
          <figure className="report-art">
            <img src={deliveredArt} alt="The car at the clinic delivery bay, parcels unloaded" />
            <figcaption>Delivered — Fenner Street clinic.</figcaption>
          </figure>
          <dl className="report-facts">
            <div><dt>Vehicle</dt><dd>{vehicleName || 'NV-1'}</dd></div>
            <div><dt><IconSensor light /> Sensors</dt><dd>{sensorLabel}</dd></div>
            <div><dt><IconRoute light /> Time on mission</dt><dd>{minutes} min</dd></div>
          </dl>
        </section>

        {/* ---- Step 2: the policy --------------------------------------- */}
        <section className={`report-step ${step === 1 ? 'is-on' : ''}`}>
          <h3>Final policy · {rules.length} rules</h3>
          {rules.length > 0 ? (
            <ol className="report-rules">
              {rules.map((rule) => (
                <li key={rule.id} className={rule === movingRule ? 'is-key' : ''}>
                  {ruleSentence(rule)}
                  {rule.id.startsWith('starter-') && <em>example supplied with this game</em>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="report-empty">No rules were written, so the car never moved.</p>
          )}
          {movingRule && (
            <p className="report-note">
              The key rule checks for {TILES.MOVING.label.toLowerCase()} — the one thing the closed road could never show.
            </p>
          )}
        </section>

        {/* ---- Step 3: the crew and their skills ------------------------ */}
        <section className={`report-step ${step === 2 ? 'is-on' : ''}`}>
          <h3>{mode === 'solo' ? 'Pilot' : 'Crew'}</h3>
          <ul className="report-crew">
            {crew.map((name, index) => (
              <li key={index}><span>{index + 1}</span>{name.trim() || (mode === 'solo' ? 'Solo pilot' : `Engineer ${index + 1}`)}</li>
            ))}
          </ul>
          <h3>Skills signed off</h3>
          <ul className="report-stamps">
            {STAMPS.map((stamp) => (
              <li key={stamp.id}>
                <span className="stamp-ico"><IconCheck light /></span>
                <span><strong>{stamp.label}</strong><em>{stamp.detail}</em></span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Step 4: the teacher's numbers, and the ways onward -------- */}
        <section className={`report-step report-teacher ${step === 3 ? 'is-on' : ''}`}>
          <h3>For the teacher</h3>
          <ul className="report-facts">
            <li><strong>★ {totalStars(passed, retries)}/{RULE_STOP_IDS.length * 3}</strong><em>stars (first-try = 3)</em></li>
            <li><strong>{clearedCount}</strong><em>stops cleared</em></li>
            <li><strong>{rules.length}</strong><em>rules in the policy</em></li>
            <li><strong>{attempts.reduce((sum, a) => sum + a.count, 0)}</strong><em>extra attempts</em></li>
            <li><strong>{minutes} min</strong><em>on the mission</em></li>
          </ul>
          {attempts.length > 0 && (
            <p className="report-attempts">
              Retried: {attempts.map((a) => `${nameOf(a.id)} ×${a.count}`).join(' · ')}
            </p>
          )}
          <div className="report-actions">
            <button className="btn ghost no-print" onClick={() => { play('click'); window.print() }}>
              Print report
            </button>
            <button className="btn ghost" onClick={() => { play('click'); reset() }}>
              <span className="btn-ico"><IconRestart light /></span>{reportCopy.again}
            </button>
            <button className="btn primary" onClick={() => { play('click'); setPhase('levels') }}>
              Choose a game
            </button>
          </div>
          <p className="panel-note">{reportCopy.patrolsBrief}</p>
        </section>

        {/* ---- Walk ------------------------------------------------------ */}
        <div className="report-nav no-print">
          <button className="btn ghost" onClick={() => go(step - 1)} disabled={step === 0}>
            <span className="btn-ico"><IconArrowLeft light /></span>Back
          </button>
          {step < steps.length - 1 && (
            <button className="btn primary" onClick={() => go(step + 1)}>
              Next<span className="btn-ico"><IconArrowRight light /></span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

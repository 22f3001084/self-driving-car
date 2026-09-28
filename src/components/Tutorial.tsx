import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../store'
import { faceFor, playerName, turnsEach } from '../campaign'
import { TILE_ICONS } from '../icons'
import { useCta } from '../hud'
import { play } from '../sound'
import { narrate, stopNarration } from '../narration'
import { PLAYER_FACES } from './CampaignSetup'
import depot from '../assets/img/bg-title-depot.jpg'

const IconScooter = TILE_ICONS.SCOOTER
const IconSlow = TILE_ICONS.SLOW
const IconCrowd = TILE_ICONS.MANY_MOVING
const IconWait = TILE_ICONS.WAIT_CLEAR

const SLIDES = 5

/**
 * The tutorial: the whole idea explained BEFORE the first live decision, so
 * the first situation popup reads as familiar rather than as a quiz.
 *
 * Five slides, each with one job:
 *   1 the mission — why a car that cannot think is a problem
 *   2 what a rule IS — the IF → THEN sentence, named part by part
 *   3 why ORDER matters — the car reads from the top, first match wins
 *   4 the loop — Look · Choose · Test · Learn, and what the stars mean
 *   5 the turns — whose wheel it is, and that it comes round to everybody
 *
 * The board's own key walks them, every slide is spoken in the studio voice
 * (voLines tutorial-1..5), and the numbered dots let a teacher jump back.
 */
export default function Tutorial() {
  const { crew, crewCount, crewFaces, vehicleName, setPhase, narration } = useGame()
  const [slide, setSlide] = useState(0)
  const car = vehicleName || 'NV-1'
  const last = slide === SLIDES - 1
  const names = Array.from({ length: crewCount }, (_, i) => playerName(crew, i))

  useEffect(() => {
    if (narration) narrate('tutorial', { voKey: `tutorial-${slide + 1}` })
    return stopNarration
  }, [slide, narration])

  useCta(last ? 'START THE RUN' : 'NEXT', false, () => {
    play('click')
    if (last) setPhase('levels')
    else setSlide(slide + 1)
  })

  return <div className="screen tutorial-screen" style={{ backgroundImage: `url('${depot}')` }}>
    <div className="screen-scrim" />
    <section className="tutorial-panel">
      <nav className="tutorial-dots" aria-label="Tutorial pages">
        {Array.from({ length: SLIDES }, (_, i) => (
          <button key={i} className={i === slide ? 'is-on' : ''} aria-current={i === slide}
            onClick={() => { play('click'); setSlide(i) }}>{i + 1}</button>
        ))}
      </nav>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={slide}
          className="tutorial-slide"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {slide === 0 && <>
            <span className="journey-kicker">1 · THE MISSION</span>
            <h1>{car} can drive — but it cannot think</h1>
            <p>A medical parcel must reach the Fenner Street clinic, and {car}’s rulebook
              is <b>empty</b>. A self-driving car does <b>only</b> what its rules say.</p>
            <p className="tutorial-aside">No rule for what it meets? It stops and asks your crew.</p>
          </>}

          {slide === 1 && <>
            <span className="journey-kicker">2 · THE ONLY TOOL YOU HAVE</span>
            <h1>A rule is an IF → THEN sentence</h1>
            <div className="tutorial-rule" aria-label="Example rule">
              <span className="tr-if">
                <b>IF</b>
                <i className="tr-ico"><IconScooter /></i>
                <strong>Scooter ahead</strong>
              </span>
              <span className="tr-arrow" aria-hidden="true">→</span>
              <span className="tr-then">
                <b>THEN</b>
                <i className="tr-ico"><IconSlow /></i>
                <strong>Go slowly</strong>
              </span>
            </div>
            <ul className="tutorial-parts">
              <li><b>IF</b> = what the sensors <strong>see</strong>.</li>
              <li><b>THEN</b> = what the car <strong>does</strong> — every time, no asking.</li>
            </ul>
            <p className="tutorial-aside">Get it right and it stays in {car}’s brain for the whole run.</p>
          </>}

          {slide === 2 && <>
            <span className="journey-kicker">3 · HOW THE CAR READS ITS RULES</span>
            <h1>From the top — first match wins</h1>
            <ol className="tutorial-order" aria-label="How the rulebook is read">
              <li>
                <b>1</b>
                <span>
                  <em>IF</em> <i className="tr-ico"><IconScooter /></i> Scooter ahead
                  <em>THEN</em> <i className="tr-ico"><IconSlow /></i> Go slowly
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  <em>IF</em> <i className="tr-ico"><IconCrowd /></i> Many things moving
                  <em>THEN</em> <i className="tr-ico"><IconWait /></i> Wait until clear
                </span>
              </li>
            </ol>
            <p>{car} reads <b>down</b> the list and runs the <b>first</b> IF that matches.</p>
            <p className="tutorial-aside">So a rule can be right but in the <b>wrong place</b>.</p>
          </>}

          {slide === 3 && <>
            <span className="journey-kicker">4 · YOUR TURN, STEP BY STEP</span>
            <h1>Look · Choose · Test · Learn</h1>
            {/* Each step's copy sits in ONE span: the li is a two-column grid, and
                a bare <b> plus loose text would be two separate grid items, which
                drops the sentence into the 44px number column a word at a time. */}
            <ol className="tutorial-steps">
              <li><span><b>Look</b> at what the sensors saw.</span></li>
              <li><span><b>Choose</b> a THEN card — talk it over first.</span></li>
              <li><span><b>Test</b> it with the big key: {car} does exactly that.</span></li>
              <li><span><b>Learn</b> — a crash is safe, and you get another go.</span></li>
            </ol>
            <p className="tutorial-aside">★★★ first try · ★★ after one fix. Thinking beats guessing.</p>
          </>}

          {slide === 4 && <>
            <span className="journey-kicker">5 · TAKING TURNS</span>
            <h1>The wheel comes round to everybody</h1>
            <ol className={`tutorial-crew tutorial-crew--${crewCount}`}>
              {names.map((name, i) => (
                <li key={i}>
                  <img src={PLAYER_FACES[faceFor(crewFaces, i)]} alt="" />
                  <strong>{name}</strong>
                  <small>{turnsEach(crewCount)} turns</small>
                </li>
              ))}
            </ol>
            <p>One challenge each, in turn. The popup always <b>names whose turn it is</b>.
              Only that player picks — <b>everybody</b> helps think.</p>
            <p className="tutorial-aside">Ready? {names[0]} takes the first challenge.</p>
          </>}
        </motion.div>
      </AnimatePresence>
    </section>
  </div>
}

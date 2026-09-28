import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useGame } from './store'
import { useSettings } from './persist'
import { LEVELS } from './content'
import SkaiHud from './components/SkaiHud'
import Title from './components/Title'
import MissionBoard from './components/JourneyBoard'
import DrivingMission from './components/DrivingMission'
import Reflect from './components/Reflect'
import Report from './components/Report'
import Patrols from './components/CampaignPatrols'
import Boundary from './components/Boundary'
import ModePick from './components/ModePick'
import DesignCard from './components/CampaignSetup'
import Tutorial from './components/Tutorial'
import { fitViewport } from './viewport'

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.26, ease: 'easeOut' } as const,
}

export default function App() {
  const phase = useGame((s) => s.phase)
  const levelId = useGame((s) => s.levelId)
  const finishLevel = useGame((s) => s.finishLevel)
  const closeLevel = useGame((s) => s.closeLevel)
  const openPatrol = useGame((s) => s.openPatrol)
  // The recovery route out of a crashed screen: drop any open job and show the
  // board, with the policy left untouched.
  const backToBoard = () => { openPatrol(null); closeLevel() }
  const setPhase = useGame((s) => s.setPhase)
  // The manual reduced-motion knob reaches framer-motion too, not only CSS —
  // otherwise every entrance spring kept playing for the child who turned it off.
  const reduced = useSettings((s) => s.reducedMotion)

  // The SKAI board is EXACTLY 1960 × 1102: it scales as one piece into the
  // viewport. No layout decision inside it reads the viewport; only the
  // backdrop and the chrome reach out into the space beside it.
  useEffect(() => {
    const root = document.documentElement

    const fit = () => {
      const width = window.visualViewport?.width ?? window.innerWidth
      const height = window.visualViewport?.height ?? window.innerHeight
      // Small portrait devices retain the established landscape orientation.
      const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
      const frame = fitViewport(width, height, touch)
      root.style.setProperty('--stage-w', `${frame.width}px`)
      root.style.setProperty('--stage-h', `${frame.height}px`)
      root.style.setProperty('--stage-scale', String(frame.scale))
      root.style.setProperty('--stage-rotate', frame.rotated ? '90deg' : '0deg')
      // the space beside the board: the scene bleeds into it, the chrome pins
      // to its outer edge (see viewport.ts)
      root.style.setProperty('--bleed-x', `${frame.bleedX.toFixed(2)}px`)
      root.style.setProperty('--bleed-y', `${frame.bleedY.toFixed(2)}px`)
      root.dataset.layout = frame.rotated ? 'turned' : 'wide'
    }
    fit()
    // A viewport can arrive a frame or two late — an embedded preview pane, a
    // Chromebook finishing a rotation — without emitting `resize` at all.
    const settle = requestAnimationFrame(fit)
    const settleLate = window.setTimeout(fit, 120)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    observer?.observe(document.documentElement)
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    window.visualViewport?.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(settle)
      window.clearTimeout(settleLate)
      observer?.disconnect()
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
      window.visualViewport?.removeEventListener('resize', fit)
    }
  }, [])

  const level = LEVELS.find((item) => item.id === levelId) ?? LEVELS[0]

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className="app">
        <div className="stage">
          <Boundary onReset={() => { backToBoard(); setPhase('title') }}>
            {/* No mode="wait": that holds the incoming screen until the outgoing
                one has finished animating, and a tab that is not producing frames
                never finishes. The screens cross-fade instead. */}
            <main className="stage-body">
              <AnimatePresence initial={false}>
                <motion.div key={phase} className="phase" {...fade}>
                  <Boundary onReset={backToBoard}>
                    {phase === 'title' && <Title />}
                    {phase === 'mode' && <ModePick />}
                    {phase === 'design' && <DesignCard />}
                    {phase === 'tutorial' && <Tutorial />}
                    {phase === 'levels' && <MissionBoard />}
                    {phase === 'play' && (
                      <DrivingMission
                        level={level}
                        onAdvance={() => finishLevel(level.id)}
                        onExit={closeLevel}
                      />
                    )}
                    {phase === 'reflect' && <Reflect />}
                    {phase === 'report' && <Report />}
                    {phase === 'patrols' && <Patrols />}
                  </Boundary>
                </motion.div>
              </AnimatePresence>
            </main>
            {/* The SKAI board: the delivered Figma vector over everything. */}
            <SkaiHud />
          </Boundary>
        </div>
      </div>
    </MotionConfig>
  )
}

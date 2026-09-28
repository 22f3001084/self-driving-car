import { DELIVERY, PATROLS, TILES } from '../content'
import { useGame } from '../store'
import { waypointsFor } from '../sim'
import DrivingMission from './DrivingMission'

/** Player 3 receives one challenge at a time, never a grid of competing jobs. */
export default function CampaignPatrols() {
  const { passed, patrolId, finishPatrol, setPhase } = useGame()
  const current = PATROLS.find(p => p.id === patrolId) ?? PATROLS.find(p => !passed[p.id])
  const level = current ? {
    id: current.id, n: PATROLS.indexOf(current) + 1, stage: 'iterate' as const,
    chapter: 'Save the day', name: current.title, brief: current.brief,
    voice: current.brief, task: current.task,
    startX: Math.max(.03, (waypointsFor(current.id)[0]?.x ?? .45) - .16),
    required: current.tray.filter(t => TILES[t]?.kind === 'condition').slice(0, 1),
    tray: current.tray, newTiles: [], connectors: ['AND' as const],
    runLabel: 'Start this challenge', success: current.success, successDetail: current.success,
  } : DELIVERY
  return <DrivingMission level={level} onAdvance={() => finishPatrol(level.id)} onExit={() => setPhase('levels')} />
}

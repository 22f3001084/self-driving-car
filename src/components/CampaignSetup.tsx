import { useGame } from '../store'
import { useCta } from '../hud'
import CrewPanel from './CrewPanel'
import depot from '../assets/img/bg-title-depot.png'

// The faces moved in with the crew editor, but half the game imports them from
// here, so this stays their address.
export { PLAYER_FACES } from './CrewPanel'

/**
 * The setup screen: the crew editor, on the depot, with the board's key locked
 * until every seat has a name. The very same editor reopens from the pause key
 * mid-mission, so this screen is the first pass rather than the only chance.
 */
export default function CampaignSetup() {
  const { crew, crewCount, setPhase } = useGame()
  const named = Array.from({ length: crewCount }, (_, i) => crew[i]?.trim()).filter(Boolean).length
  const ready = named === crewCount

  useCta('MEET YOUR MISSION', !ready, () => setPhase('tutorial'))

  return <div className="screen crew-setup" style={{ backgroundImage: `url('${depot}')` }}>
    <div className="screen-scrim" />
    <section className="crew-setup-panel">
      <h1>Build your driving crew</h1>
      <CrewPanel />
      {!ready && <small>{named} of {crewCount} names in.</small>}
    </section>
  </div>
}

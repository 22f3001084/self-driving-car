import { useGame } from '../store'
import {
  PARTS, RULE_STOP_IDS, activePart, creditsPerPlayer, currentDriver, faceFor,
  partStops, playerName, totalStars,
} from '../campaign'
import { PLAYER_FACES } from './CampaignSetup'
import { useCta } from '../hud'
import { play } from '../sound'
import street from '../assets/img/bg-street-run.jpg'

export default function JourneyBoard() {
  const { passed, retries, crew, crewCount, crewFaces, rules, turnIndex, turnOwner, openMission, goNext } = useGame()
  const current = activePart(passed)
  const allDone = current < 0
  const part = PARTS[Math.max(0, current)]
  const done = partStops(part.id).filter(id => passed[id]).length
  const size = crewCount
  const driver = currentDriver(passed, turnOwner, turnIndex, size)
  const driverLabel = driver === -1 ? 'the whole team' : playerName(crew, driver)
  const stars = totalStars(passed, retries)
  const maxStars = RULE_STOP_IDS.length * 3

  // What each player has actually decided. The wheel passes only when someone
  // makes a call, so these counters stay level all the way through.
  const perPlayer = creditsPerPlayer(turnOwner, passed, retries, size)

  useCta(
    allDone ? 'MISSION REPORT' : done ? 'CONTINUE CHAPTER' : 'START CHAPTER',
    false,
    () => { play('click'); if (allDone) goNext(); else openMission(part.id) },
  )

  return <div className="screen journey-board" style={{ backgroundImage: `url('${street}')` }}>
    <div className="screen-scrim" />
    <section className="journey-content">
      <header>
        <span className="journey-kicker">THE NORTHLINE RUN · ★ {stars}/{maxStars}</span>
        <h1>{allDone ? `${size} players. One brilliant team!` : current === 0 && done === 0 ? 'Your adventure starts here' : `Next up: ${driverLabel}`}</h1>
        {allDone && <p>You built, tested and improved a car’s rulebook together.</p>}
      </header>
      <ol className={`journey-players journey-players--${size}`}>
        {perPlayer.map((p, i) => (
          <li key={i} className={(driver === i || driver === -1) && !allDone ? 'is-now' : ''}>
            <img src={PLAYER_FACES[faceFor(crewFaces, i)]} alt="" />
            <span>{playerName(crew, i)}</span>
            <strong>{p.solved} solved · ★ {p.stars}</strong>
            {driver === i && !allDone && <small>At the wheel next</small>}
            {driver === -1 && !allDone && <small>Final run — together</small>}
          </li>
        ))}
      </ol>
      <ol className="journey-path">{PARTS.map((p, i) => {
        const complete = partStops(p.id).every(id => passed[id])
        return <li key={p.id} className={`${complete ? 'is-complete' : ''} ${current === i ? 'is-active' : ''} ${i > current && !allDone ? 'is-locked' : ''}`}>
          <b className="journey-chapter-no">{i + 1}</b>
          <strong>{p.title}</strong>
          <small>{complete ? `★ ${p.badge}` : i === current ? p.skill : 'Locked'}</small>
        </li>
      })}</ol>
      {allDone
        ? <div className="journey-mission">
            <span className="journey-medal">★ ★ ★</span>
            <h2>Street heroes!</h2>
            <p>{rules.length} rules · ★ {stars}/{maxStars} · parcel delivered.</p>
          </div>
        : <div className="journey-mission">
            <span className="journey-kicker">CHAPTER {current + 1} · {part.skill}</span>
            <h2>{part.title}!</h2>
            <p>{part.goal}</p>
            <div className="journey-reward">
              <span>★ {part.badge} badge</span>
              <span>{done}/{partStops(part.id).length} solved</span>
            </div>
          </div>}
    </section>
  </div>
}

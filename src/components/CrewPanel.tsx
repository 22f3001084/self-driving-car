import { CREW_CHOICES, useGame } from '../store'
import { faceFor, turnsEach } from '../campaign'
import { play } from '../sound'
import p1 from '../assets/img/player-1.png'
import p2 from '../assets/img/player-2.png'
import p3 from '../assets/img/player-3.png'
import p4 from '../assets/img/player-solo.png'

/** The four faces a child can pick for themselves. */
export const PLAYER_FACES = [p1, p2, p3, p4]
const FACE_NAMES = ['the green jacket', 'the orange top', 'the blue shirt', 'the helmet']

/**
 * The crew, chosen rather than assumed — and editable for the whole mission.
 *
 * Three questions, always in the same order: how many are playing, who is who
 * (each child picks their own face and types their own name), and what the car
 * is called. The very same panel opens from the pause key mid-mission, so a
 * name typed wrong at the start is a five-second fix rather than a restart.
 *
 * The one thing that locks is the crew SIZE, and only once a challenge has
 * been solved: the turn rotation has already dealt real turns by then, and
 * silently re-dealing them would take a child's turn away.
 */
export default function CrewPanel({ inGame = false }: { inGame?: boolean }) {
  const {
    crew, crewCount, crewFaces, passed, vehicleName,
    setCrew, setCrewCount, setCrewFace, setVehicleName,
  } = useGame()
  const started = Object.values(passed).some(Boolean)
  const sizeLocked = inGame && started
  const seats = Array.from({ length: crewCount }, (_, i) => i)

  return <div className="crew-panel">
    <div className="crew-step">
      <span className="journey-kicker">{inGame ? 'THE CREW' : 'HOW MANY?'}</span>
      <div className="crew-count" role="radiogroup" aria-label="How many players?">
        {CREW_CHOICES.map((count) => (
          <button
            key={count}
            type="button"
            role="radio"
            aria-checked={crewCount === count}
            aria-label={`${count} players, ${turnsEach(count)} turns each`}
            disabled={sizeLocked}
            className={`crew-count-pick ${crewCount === count ? 'is-on' : ''}`}
            onClick={() => { play('click'); setCrewCount(count) }}
          >
            <b>{count}</b>
            <span>players</span>
            <em>{turnsEach(count)} turns each</em>
          </button>
        ))}
      </div>
      {sizeLocked && (
        <small className="crew-locked">The run has started — names and faces only.</small>
      )}
    </div>

    <div className="crew-step">
      <span className="journey-kicker">WHO IS WHO?</span>
      <div className={`crew-setup-grid crew-setup-grid--${crewCount}`}>
        {seats.map((i) => (
          <div className="crew-seat" key={i}>
            <img className="crew-seat-face" src={PLAYER_FACES[faceFor(crewFaces, i)]} alt="" />
            <span>Player {i + 1}</span>
            <input
              aria-label={`Player ${i + 1} name`}
              placeholder="Type your name"
              value={crew[i] ?? ''}
              maxLength={14}
              onChange={(e) => setCrew(i, e.target.value)}
            />
            {/* Pick yourself: tapping a face you like swaps it with whoever
                has it, so two children never share one. */}
            <div className="crew-faces" role="radiogroup" aria-label={`Player ${i + 1} face`}>
              {PLAYER_FACES.map((face, index) => (
                <button
                  key={index}
                  type="button"
                  role="radio"
                  aria-checked={faceFor(crewFaces, i) === index}
                  aria-label={`Player ${i + 1}: ${FACE_NAMES[index]}`}
                  className={`crew-face-pick ${faceFor(crewFaces, i) === index ? 'is-on' : ''}`}
                  onClick={() => { play('click'); setCrewFace(i, index) }}
                >
                  <img src={face} alt="" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>

    <label className="crew-car-name">
      Name your car
      <input
        aria-label="Car name"
        value={vehicleName}
        maxLength={12}
        onChange={(e) => setVehicleName(e.target.value)}
      />
    </label>
  </div>
}

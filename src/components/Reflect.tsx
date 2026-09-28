import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { reflect, reflectCopy } from '../content'
import { useGame } from '../store'
import { play } from '../sound'
import { narrate } from '../narration'
import { IconCheck } from '../icons'
import opsRoom from '../assets/img/bg-ops-room.jpg'

export default function Reflect() {
  const answers = useGame((s) => s.reflectAnswers)
  const mode = useGame((s) => s.mode)
  const setAnswer = useGame((s) => s.setReflectAnswer)
  const narration = useGame((s) => s.narration)
  const [index, setIndex] = useState(0)

  const prompt = reflect.prompts[index]
  const selectedId = answers[index]
  const selected = prompt.options.find((option) => option.id === selectedId)
  const resolved = Boolean(selected?.correct)
  const last = index === reflect.prompts.length - 1

  useEffect(() => {
    if (narration) narrate(prompt.question)
  }, [index, narration, prompt.question])

  return (
    <div className="screen brief-screen" style={{ backgroundImage: `url('${opsRoom}')` }}>
      <div className="screen-scrim" aria-hidden="true" />
      <div className="panel wide reflect-panel">
        <div className="reflect-head">
          <div>
            <h2 className="panel-title">{reflectCopy.heading}</h2>
            <p className="panel-brief">{mode === 'solo' ? reflectCopy.soloBrief : reflectCopy.brief}</p>
          </div>
          <span className="dots" aria-hidden="true">
            {reflect.prompts.map((_, dot) => <span key={dot} className={dot <= index ? 'on' : ''} />)}
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            className="reflect-body"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
          >
            <h3 className="reflect-question">{prompt.question}</h3>
            <div className="reflect-options">
              {prompt.options.map((option) => {
                const chosen = selectedId === option.id
                return (
                  <button
                    key={option.id}
                    className={`reflect-option ${chosen ? (option.correct ? 'right' : 'wrong') : ''}`}
                    onClick={() => { play(option.correct ? 'success' : 'click'); setAnswer(index, option.id) }}
                  >
                    <span className="reflect-mark" aria-hidden="true">{chosen && option.correct ? <IconCheck light /> : null}</span>
                    <span>{option.label}</span>
                    {chosen && !option.correct && option.nudge && <em className="reflect-nudge">{option.nudge}</em>}
                  </button>
                )
              })}
            </div>
            {resolved && <p className="reflect-feedback">{prompt.feedback}</p>}
          </motion.div>
        </AnimatePresence>

        {!last && (
          <button className="btn accent" disabled={!resolved} onClick={() => { play('click'); setIndex(index + 1) }}>
            Next question
          </button>
        )}
      </div>
    </div>
  )
}

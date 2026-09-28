// Narrator: "Suhana", Indian English — RECORDED voiceover first.
//
// Every fixed line in the game is bundled as a real mp3 (ElevenLabs, voice
// "Suhana J – Very Young & Joyful Narrator"; see voLines.ts, generated from
// scripts/tmp/vo-lines.json). narrate() matches the spoken text against those
// recordings and plays the clip; only a line the studio never recorded — a
// dynamic string — falls back to the browser's own speech engine, tuned to
// the same delivery. The recordings ship in the bundle, so the offline build
// speaks with the real voice with no network at all.

import { VO_TEXTS, VO_URLS } from './voLines'

/** Narrator persona shown in the UI. */
export const NARRATOR = { name: 'Suhana', accent: 'Indian English' }

/** Exact-text lookup, forgiving about apostrophes and spacing. */
function normalize(text: string) {
  return text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}
const VO_BY_TEXT: Record<string, string> = {}
for (const [key, text] of Object.entries(VO_TEXTS)) {
  if (VO_URLS[key]) VO_BY_TEXT[normalize(text)] = VO_URLS[key]
}

let voPlayer: HTMLAudioElement | null = null
function stopVo() {
  if (voPlayer) {
    voPlayer.pause()
    voPlayer.src = ''
    voPlayer = null
  }
}
function playVo(url: string) {
  stopVo()
  try {
    voPlayer = new Audio(url)
    voPlayer.volume = 0.95
    // play() returns a promise that REJECTS with an AbortError whenever the
    // next line interrupts this one — routine, not a fault, so swallow it or
    // it surfaces as an unhandled rejection on every quick click-through.
    voPlayer.play()?.catch(() => {})
  } catch {
    /* narration is an enhancement — never let it break the mission */
  }
}

let enabled = true
let picked: SpeechSynthesisVoice | null = null
let resolvedLabel = ''

// Ordered best-first. Names differ per OS/browser, so match loosely.
const VOICE_HINTS = [
  'Kore',
  'Microsoft Heera',
  'Microsoft Kavya',
  'Microsoft Neerja',
  'Microsoft Ravi',
  'Google UK English Female',
  'Samantha',
]

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  return window.speechSynthesis
}

function pickVoice() {
  const engine = synth()
  if (!engine) return
  // English voices only: the fallback chain used to reach a Hindi voice, which
  // read the English copy phonetically. Local voices first — the network ones
  // cut out after ~15 s and need the internet the offline build does not have.
  const all = engine.getVoices()
  const voices = all
    .filter((voice) => /^en([-_]|$)/i.test(voice.lang))
    .sort((a, b) => Number(b.localService) - Number(a.localService))
  if (!voices.length) return

  const indian = voices.filter((voice) => voice.lang.replace('_', '-').toLowerCase().startsWith('en-in'))
  picked =
    VOICE_HINTS.map((hint) => indian.find((voice) => voice.name.includes(hint))).find(Boolean) ??
    indian[0] ??
    VOICE_HINTS.map((hint) => voices.find((voice) => voice.name.includes(hint))).find(Boolean) ??
    voices.find((voice) => voice.lang.startsWith('en-GB')) ??
    voices.find((voice) => voice.lang.startsWith('en')) ??
    voices[0] ??
    null
  resolvedLabel = picked ? `${picked.name} (${picked.lang})` : ''
}

export function initNarration() {
  const engine = synth()
  if (!engine) return
  pickVoice()
  engine.addEventListener?.('voiceschanged', pickVoice)
}

/** Which system voice actually got used — surfaced in the pause panel. */
export function narratorVoiceLabel(): string {
  if (!resolvedLabel) pickVoice()
  return resolvedLabel
}

export function setNarrationEnabled(value: boolean) {
  enabled = value
  if (!value) stopNarration()
}

export function stopNarration() {
  stopVo()
  synth()?.cancel()
}

/** Speak a line. A recorded clip (matched by `voKey` or by the exact text)
    plays the studio voice; anything else falls back to the speech engine.
    By default it replaces anything already queued. */
/** The last line narrated, so the speaker menu's "Replay narration" can say
    it again. Kept even while narration is off, so turning it back on and
    pressing replay still has something to say. */
let lastLine: { text: string; voKey?: string } | null = null

export function narrate(
  text: string,
  { interrupt = true, voKey }: { interrupt?: boolean; voKey?: string } = {},
) {
  if (text) lastLine = { text, voKey }
  if (!enabled || !text) return
  const clip = (voKey && VO_URLS[voKey]) || VO_BY_TEXT[normalize(text)]
  if (clip) {
    if (interrupt) stopNarration()
    playVo(clip)
    return
  }
  const engine = synth()
  if (!engine) return
  if (!picked) pickVoice()
  try {
    if (interrupt) { stopVo(); engine.cancel() }
    // One utterance per sentence: some engines stop dead at ~15 seconds of
    // speech, and the level briefs run longer than that.
    const sentences = text.replace(/[·—]/g, ',').match(/[^.!?]+[.!?]*\s*/g) ?? [text]
    for (const sentence of sentences) {
      if (!sentence.trim()) continue
      const utterance = new SpeechSynthesisUtterance(sentence.trim())
      if (picked) {
        utterance.voice = picked
        utterance.lang = picked.lang
      } else {
        utterance.lang = 'en-IN'
      }
      utterance.rate = 0.92
      utterance.pitch = 1.02
      utterance.volume = 0.95
      engine.speak(utterance)
    }
  } catch {
    /* narration is an enhancement — never let it break the mission */
  }
}

/** Say the last line again, from the start. False if nothing has been said. */
export function replayNarration(): boolean {
  if (!lastLine || !enabled) return false
  narrate(lastLine.text, { voKey: lastLine.voKey })
  return true
}

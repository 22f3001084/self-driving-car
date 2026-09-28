import ReactDOM from 'react-dom/client'
import App from './App'
import { applyDevQuery } from './devtools'
import { installFonts } from './fonts'
import { installKit } from './kit'
import { clearSave, useSettings } from './persist'
import { installVisibilityGuard, setMixer } from './sound'
import { stopNarration } from './narration'
import './styles/globals.css'
// The world the game draws — the 3D canvas, the flat edition's layers,
// weather and ambient life. Lifted out of the old components.css unchanged:
// the scene was never the problem, the chrome was.
import './styles/scene.css'
// Every screen, laid out once against the fixed 1920 x 1080 board.
import './styles/screens.css'
// Everything that stands over the drive: the question, the scan, the
// verdict, the editor, the cluster.
import './styles/street.css'
import './styles/campaign.css'
// The SKAI Layout System board: the AI & Data Figma vector, its live text,
// hit areas, entrance beats and overlays.
import './styles/board.css'

// NOTE: StrictMode is intentionally omitted. The driving sequence in Street.tsx
// uses awaited imperative animations (framer-motion useAnimate). StrictMode's
// dev-only double mount/unmount cancels those animations mid-run, leaving the
// awaited promise unresolved so the car freezes after the first step. Behaviour
// in production is unaffected either way; disabling it makes dev match prod.

// Dev-only query helpers (`?phase=…`, `?noanim=1`). The whole module drops out
// of the production bundle, which never reads the query string at all.
// Chakra Petch and Inter, declared in JS so their URLs are quoted — see
// src/fonts.ts for why that matters to the offline build.
installFonts()
// The design's own cogs, brand plate and hanging timer sign.
installKit()

if (import.meta.env.DEV) applyDevQuery()

// NO game save. A refresh means a clean start from the title — asked for
// explicitly: "whenever you click on refresh, everything should be from
// start". Any save an older build left behind is wiped on boot, so the title
// never offers Continue. (Device settings — volumes, reduced motion, low
// graphics — are machine knobs, not progress, and still stick.)
clearSave()

// Settings act on the world outside React: the audio mixer, and a root class
// that the stylesheets and the 3D stage both read for reduced motion.
function applySettings() {
  const s = useSettings.getState()
  setMixer({ ambience: s.volAmbience, vehicle: s.volVehicle, fx: s.volFx })
  document.documentElement.classList.toggle('reduce-motion', s.reducedMotion)
  document.documentElement.classList.toggle('low-gfx', s.lowGfx)
}
applySettings()
useSettings.subscribe(applySettings)

// A hidden tab is a silent tab: loops mute, the narrator stops mid-sentence.
installVisibilityGuard(stopNarration)

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)

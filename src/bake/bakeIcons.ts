import * as THREE from 'three'
import { loadKit } from '../three/kitLoader'
import { ICONS, type Tint } from './iconModels'

/**
 * The icon photo studio.
 *
 * One renderer, one three-point-ish light rig, and a transparent background.
 * Each model is framed by its own bounding sphere so every icon fills the same
 * proportion of its tile no matter how big the source model is — a scooter and
 * a tick come out looking like a matched set.
 */
const SIZE = 160

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setSize(SIZE, SIZE, false)
renderer.setPixelRatio(1)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60)

// Studio lighting: a key from upper-left-front, a cool fill from the right, and
// a rim from behind so silhouettes separate from a transparent background.
const key = new THREE.DirectionalLight(0xfff6e8, 3.1)
key.position.set(-3.4, 5, 5.4)
key.castShadow = true
key.shadow.mapSize.set(512, 512)
const fill = new THREE.DirectionalLight(0xd6e8ff, 1.15)
fill.position.set(4.4, 1.4, 2.6)
const rim = new THREE.DirectionalLight(0xffffff, 1.5)
rim.position.set(1.6, 2.4, -4.6)
scene.add(key, fill, rim, new THREE.HemisphereLight(0xeaf4ff, 0x8b8f96, 1.25))

// A gradient environment so glossy surfaces have something to reflect.
const envCanvas = document.createElement('canvas')
envCanvas.width = 4
envCanvas.height = 128
const envCtx = envCanvas.getContext('2d')!
const gradient = envCtx.createLinearGradient(0, 0, 0, 128)
gradient.addColorStop(0, '#ffffff')
gradient.addColorStop(0.55, '#c9dcec')
gradient.addColorStop(1, '#6d7885')
envCtx.fillStyle = gradient
envCtx.fillRect(0, 0, 4, 128)
const envSource = new THREE.CanvasTexture(envCanvas)
envSource.mapping = THREE.EquirectangularReflectionMapping
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromEquirectangular(envSource).texture
scene.environmentIntensity = 0.7

function shoot(name: string, tint: Tint) {
  const spec = ICONS[name]
  const holder = new THREE.Group()
  holder.add(spec.build(tint))
  scene.add(holder)

  // Frame on the bounding sphere, tilted slightly so flat glyphs still read
  // as solid objects rather than stickers.
  holder.rotation.x = -0.16
  holder.rotation.y = spec.glyph ? 0.34 : 0
  const bounds = new THREE.Box3().setFromObject(holder)
  const centre = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  // Frame on what the lens actually SEES — the taller of width and height — not
  // on the box's 3D diagonal. The diagonal counts depth twice over and left a
  // third of every tile as transparent margin, so a 32 px icon box was showing
  // a 20 px object.
  const extent = Math.max(size.x, size.y) / 2 || 1
  const distance = (extent / Math.tan((camera.fov * Math.PI) / 360)) * 1.16
    + size.z * 0.5 * (spec.zoom ?? 1)
  camera.position.set(centre.x + distance * 0.16, centre.y + distance * 0.2, centre.z + distance)
  camera.lookAt(centre)
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(holder)
  return url
}

export interface BakedIcon { name: string; tint: Tint; dataUrl: string }

function bakeAll(): BakedIcon[] {
  const out: BakedIcon[] = []
  for (const [name, spec] of Object.entries(ICONS)) {
    out.push({ name, tint: 'dark', dataUrl: shoot(name, 'dark') })
    // Glyphs also get a white variant, for use on the coloured buttons where a
    // navy icon would disappear. A baked PNG cannot inherit `currentColor`.
    if (spec.glyph) out.push({ name, tint: 'light', dataUrl: shoot(name, 'light') })
  }
  return out
}

declare global {
  interface Window { __bakeIcons: () => BakedIcon[] }
}

// The subject icons ARE the street's models, so the kit has to be parsed before
// anything can be photographed.
void loadKit().then(() => {
  window.__bakeIcons = bakeAll

  // Show the sheet on screen so the page is obviously working by hand too.
  document.body.style.cssText = 'margin:0;display:flex;flex-wrap:wrap;gap:6px;padding:12px;background:#26303c'
  for (const icon of bakeAll()) {
    const img = document.createElement('img')
    img.src = icon.dataUrl
    img.width = 64
    img.title = `${icon.name} (${icon.tint})`
    img.style.background = icon.tint === 'light' ? '#0d2360' : '#eef4fa'
    document.body.appendChild(img)
  }
})

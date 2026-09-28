import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { loadKit, spawn } from './three/kitLoader'
import { makeVan, makePerson, makeChild, makeDog, makeCyclist, type Actor, type Walker } from './three/actors'

// A separate asset inspection page. It uses the exact game meshes and rigs.
const canvas = document.querySelector<HTMLCanvasElement>('#asset-canvas')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xdce5ec)
scene.fog = new THREE.Fog(0xdce5ec, 26, 70)
const pmrem = new THREE.PMREMGenerator(renderer)
const studio = new RoomEnvironment()
const environment = pmrem.fromScene(studio, 0.04)
scene.environment = environment.texture
studio.dispose()
pmrem.dispose()
scene.add(new THREE.HemisphereLight(0xe5f0ff, 0x798778, 2.1))
const sun = new THREE.DirectionalLight(0xffefd8, 3.1)
sun.position.set(5, 9, 5)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.1, far: 30 })
sun.shadow.normalBias = 0.025
scene.add(sun)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({color:0xc4cfce, roughness:0.88}))
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.012
floor.receiveShadow = true
scene.add(floor)
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 150)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 2.1
controls.maxDistance = 17
controls.maxPolarAngle = Math.PI / 2 - 0.03
controls.target.set(0, 0.8, 0)
const root = new THREE.Group()
scene.add(root)
let actors: Actor[] = []
let walkers: Walker[] = []
let treadmills: THREE.Group[] = []
let vehicle: ReturnType<typeof makeVan> | null = null
let active = 'car'
let moving = true
let elapsed = 0
const labels: Record<string, [string, string]> = {
  car: ['Mahindra BE 6', 'Sculpted body · coupe roof · signature lighting'],
  people: ['The Northline crew', 'Articulated walking · expressive faces · everyday clothing'],
  dog: ['A friend on the road', 'Four-leg trot · turning head · wagging tail'],
  cyclist: ['Share the street', 'Pedalling legs · rolling wheels · fitted rider'],
  trees: ['A greener Northline', 'Branching trunks · layered canopies · planted verges'],
}
function home() {
  const d = active === 'car' ? 0.86 : active === 'trees' ? 1.9 : active === 'dog' ? 0.37 : active === 'cyclist' ? 0.66 : 0.7
  controls.maxDistance = active === 'trees' ? 28 : 17
  camera.position.set(6.4*d, 3.05*d, 7.0*d)
  controls.target.set(0, active === 'trees' ? 3.7 : active === 'dog' ? 0.42 : active === 'car' ? 0.8 : 0.9, 0)
  controls.update()
}
function select(id: string) {
  active = id
  root.clear()
  actors = []; walkers = []; treadmills = []; vehicle = null
  if (id === 'car') {
    vehicle = makeVan('BE 6')
    actors.push(vehicle)
    root.add(vehicle.group)
    vehicle.setLidar(false)
  } else if (id === 'people') {
    const adult = makePerson(0x327c99, 0x283347)
    const other = makePerson(0xc76646, 0x414b4e, 0.95)
    const child = makeChild()
    adult.group.position.z = -0.9
    other.group.position.z = 0.9
    child.group.position.x = 0.65
    walkers.push(adult, other, child)
  } else if (id === 'dog') walkers.push(makeDog())
  else if (id === 'cyclist') walkers.push(makeCyclist())
  else {
    for (const [name, x, z] of [['tree',-1.6,0],['tree_tall',1.8,0.8]] as const) {
      const tree = spawn(name)
      tree.position.set(x, 0, z)
      root.add(tree)
    }
  }
  for (const actor of walkers) {
    // Move the real actor rig but keep it centred on its preview turntable.
    const treadmill = new THREE.Group()
    treadmill.add(actor.group)
    root.add(treadmill)
    treadmills.push(treadmill)
    actors.push(actor)
  }
  document.querySelector('#asset-name')!.textContent = labels[id][0]
  document.querySelector('#asset-detail')!.textContent = labels[id][1]
  const motion = document.querySelector<HTMLButtonElement>('#motion')!
  motion.disabled = id === 'trees'
  motion.textContent = motion.disabled ? 'Static scenery' : moving ? 'Pause motion' : 'Play motion'
  motion.setAttribute('aria-pressed', String(moving && !motion.disabled))
  document.querySelectorAll<HTMLButtonElement>('[data-asset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.asset === id)))
  home()
}
function resize() {
  const box = canvas.getBoundingClientRect()
  renderer.setSize(box.width, box.height, false)
  camera.aspect = box.width / box.height
  camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(canvas)
document.querySelector('#reset-view')!.addEventListener('click', home)
document.querySelector('#motion')!.addEventListener('click', () => {
  moving = !moving
  document.querySelector('#motion')!.textContent = moving ? 'Pause motion' : 'Play motion'
  document.querySelector('#motion')!.setAttribute('aria-pressed', String(moving))
})
const clock = new THREE.Clock()
loadKit().then(() => {
  select('car')
  document.querySelector('#loading')!.remove()
  document.querySelectorAll<HTMLButtonElement>('[data-asset]').forEach(b => b.addEventListener('click', () => select(b.dataset.asset!)))
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    if (moving) elapsed += dt
    if (vehicle) {
      vehicle.drive(moving ? 1.4 : 0, dt)
      vehicle.steer(0)
      vehicle.setBraking(!moving)
    }
    walkers.forEach((w,i) => {
      const speed = moving ? (active === 'cyclist' ? 2.3 : active === 'dog' ? 1.6 : 1.1) : 0
      w.group.position.x += speed * dt
      treadmills[i].position.x -= speed * dt
      w.walk(speed, elapsed)
    })
    actors.forEach(a => a.update?.(elapsed, moving ? dt : 0))
    controls.update()
    renderer.render(scene, camera)
  })
}).catch(error => {
  document.querySelector('#loading')!.textContent = `The assets could not load: ${error.message}`
  console.error(error)
})

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import dracoWrapper from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?raw'
import { DRACO_WASM_BASE64 } from './dracoWasm'
import { KIT_GLB_BASE64 } from './kitData'

/**
 * The asset kit.
 *
 * Every object in the game — road pieces, buildings, the van, the people — is
 * modelled in Blender (`blender/build_kit.py`) and exported as one GLB. This
 * module parses that GLB once and hands out clones.
 *
 * Nothing is fetched. The GLB is base64 inside the bundle, so the whole 3D
 * street works from a `file://` page with no server, which is how the activity
 * is delivered to a classroom.
 */

let parts: Map<string, THREE.Object3D> | null = null
let pending: Promise<void> | null = null

function decode(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * The kit is Draco-compressed (4.7 MB of geometry down to under 1 MB), and a
 * stock DRACOLoader fetches its decoder from a URL — which a `file://` page
 * cannot do. This one hands over the wrapper and the wasm that are already in
 * the bundle. The worker it spins up is built from a Blob, which file:// allows.
 */
class InlineDracoLoader extends DRACOLoader {
  _loadLibrary(url: string, responseType: string): Promise<string | ArrayBuffer> {
    if (url === 'draco_wasm_wrapper.js') return Promise.resolve(dracoWrapper)
    if (url === 'draco_decoder.wasm' && responseType === 'arraybuffer') {
      return Promise.resolve(decode(DRACO_WASM_BASE64))
    }
    return Promise.reject(new Error(`the inlined Draco decoder has no ${url}`))
  }
}

/** Parse the kit. Safe to call repeatedly; the work happens once. */
export function loadKit(): Promise<void> {
  if (parts) return Promise.resolve()
  if (pending) return pending
  pending = new Promise<void>((resolve, reject) => {
    const draco = new InlineDracoLoader()
    draco.setDecoderConfig({ type: 'wasm' })
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)
    loader.parse(
      decode(KIT_GLB_BASE64),
      '',
      (gltf) => {
        const map = new Map<string, THREE.Object3D>()
        // Only top-level nodes: each asset was exported as its own root object.
        for (const child of [...gltf.scene.children]) {
          child.traverse((node) => {
            const mesh = node as THREE.Mesh
            if (!mesh.isMesh) return
            mesh.castShadow = true
            mesh.receiveShadow = true
          })
          map.set(child.name, child)
        }
        parts = map
        draco.dispose()
        resolve()
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
  return pending
}

export function kitReady() {
  return parts !== null
}

/** Every asset name in the kit — handy when a lookup fails. */
export function kitNames() {
  return parts ? [...parts.keys()].sort() : []
}

/**
 * A fresh copy of one kit object, wrapped in a group you can position freely.
 *
 * The wrapper matters. A Blender object's origin is not always at its own
 * centre — a building is modelled with its origin on the FRONTAGE, so the
 * exported node carries a translation of half its depth and half its height.
 * Zeroing that translation (which this used to do) dropped every building half
 * underground and slid it depth/2 toward the road: a 14 m block placed on the
 * 12.6 m frontage line ended up occupying z = 5.6 onward, straight across the
 * pavement. Wrapping keeps the authored offset intact while still letting the
 * caller place the asset wherever it likes.
 */
export function spawn(name: string): THREE.Object3D {
  if (!parts) throw new Error('kit not loaded — await loadKit() first')
  const source = parts.get(name)
  if (!source) throw new Error(`kit has no object "${name}". Available: ${kitNames().join(', ')}`)
  const holder = new THREE.Group()
  holder.name = name
  const copy = source.clone(true)
  copy.visible = true
  holder.add(copy)
  return holder
}

export function has(name: string) {
  return Boolean(parts?.has(name))
}

/**
 * Assemble every kit object whose name starts with `prefix` into one group,
 * each keeping the position it was modelled at.
 *
 * This is how a multi-part asset comes back together: `assemble('van_')` yields
 * the body, four wheels, lamps and indicators already in the right places,
 * because Blender's own coordinates came along for the ride.
 */
export function assemble(prefix: string): THREE.Group {
  if (!parts) throw new Error('kit not loaded — await loadKit() first')
  const group = new THREE.Group()
  for (const [name, source] of parts) {
    if (!name.startsWith(prefix)) continue
    const copy = source.clone(true)
    copy.name = name
    group.add(copy)
  }
  if (group.children.length === 0) {
    throw new Error(`kit has nothing named "${prefix}*". Available: ${kitNames().join(', ')}`)
  }
  return group
}

/**
 * Turn a part into a hinge: a pivot group at the part's own position with the
 * part re-zeroed inside it.
 *
 * Blender put each limb's and wheel's origin exactly on its joint, but the
 * exported node also carries the rotation it was modelled with. Rotating that
 * node directly would fight the baked orientation, so rotation is applied to a
 * clean parent instead.
 */
export function hinge(part: THREE.Object3D): THREE.Group {
  const pivot = new THREE.Group()
  pivot.name = `${part.name}_pivot`
  pivot.position.copy(part.position)
  const parent = part.parent
  part.position.set(0, 0, 0)
  pivot.add(part)
  parent?.add(pivot)
  return pivot
}

/** Find a named descendant, or throw with a useful message. */
export function partOf(group: THREE.Object3D, name: string): THREE.Object3D {
  const found = group.getObjectByName(name)
  if (!found) {
    const names: string[] = []
    group.traverse((node) => { if (node.name) names.push(node.name) })
    throw new Error(`"${name}" not found. Present: ${names.join(', ')}`)
  }
  return found
}

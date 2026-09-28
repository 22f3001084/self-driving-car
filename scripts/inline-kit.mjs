/**
 * Compress the Blender kit with Draco, then inline it into a TypeScript module
 * as base64.
 *
 * The activity ships as a folder a teacher double-clicks, and a `file://` page
 * cannot fetch a .glb — XHR to a local file is blocked. Inlining it means the
 * kit arrives as part of the one classic script, so the 3D street works with no
 * server and no network.
 *
 * Draco first, because the raw export is 4.7 MB of float32 geometry, which
 * became 6.2 MB of base64 and three quarters of the whole bundle. Draco
 * quantizes INSIDE the codec and decodes back to float32 in each mesh's own
 * local space, so node transforms are untouched. That matters: `hinge()` zeroes
 * a node's position and `roadSystem` instances raw `mesh.geometry`, and both
 * break under glTF-level quantization (KHR_mesh_quantization, which is what
 * `gltf-transform meshopt` does), because that moves the dequantization into
 * the node transform.
 *
 * The encoder runs through `npx` rather than a devDependency: this project's
 * node_modules is a junction shared with another tree, and an `npm install`
 * here would reify — and could prune — that tree too.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const GLB = process.argv[2] ?? 'blender/out/kit.glb'
const OUT = process.argv[3] ?? 'src/three/kitData.ts'
const PACKED = GLB.replace(/\.glb$/, '.draco.glb')

execFileSync('npx', [
  '-y', '@gltf-transform/cli@4', 'draco', GLB, PACKED,
  '--method', 'edgebreaker',
  // 14 bits keeps position error under a millimetre across the whole street
  '--quantize-position', '14',
  '--quantize-normal', '10',
  '--quantize-texcoord', '12',
], { stdio: 'inherit', shell: process.platform === 'win32' })

const raw = await readFile(GLB)
const bytes = await readFile(PACKED)
const base64 = bytes.toString('base64')

const header = `// GENERATED FILE — do not edit.
//
// Built by \`npm run build:kit\` from blender/build_kit.py.
// Source: ${GLB} (${(raw.length / 1024).toFixed(0)} KB of GLB), Draco-compressed
// to ${(bytes.length / 1024).toFixed(0)} KB. kitLoader.ts decodes it with the inlined decoder.
//
// Base64 rather than an asset URL because the offline package runs from
// file://, where fetching a sibling binary is blocked by the browser.

export const KIT_GLB_BASE64 =
`

// One string literal on one line. Splitting it into ~12,000 concatenated
// 100-character chunks reads more tidily but turns the file into a parser
// stress test — it was enough to take the dev server down on every rebuild.
await writeFile(OUT, `${header}  '${base64}'\n`)
// The Draco decoder's wasm, inlined the same way and for the same reason. Vite
// routes .wasm imports through its own loader (`?init`), which fetches.
const WASM = 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm'
const wasm = await readFile(WASM)
await writeFile('src/three/dracoWasm.ts', `// GENERATED FILE — do not edit. Written by scripts/inline-kit.mjs from
// three/${WASM.slice(WASM.indexOf('examples'))} (${(wasm.length / 1024).toFixed(0)} KB).

export const DRACO_WASM_BASE64 =
  '${wasm.toString('base64')}'
`)

console.log(`inlined ${(raw.length / 1024).toFixed(0)} KB GLB -> ${(bytes.length / 1024).toFixed(0)} KB Draco -> ${OUT} (${(base64.length / 1024).toFixed(0)} KB base64)`)

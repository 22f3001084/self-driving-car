/**
 * Inline the Blender kit into a TypeScript module as base64.
 *
 * The activity ships as a folder a teacher double-clicks, and a `file://` page
 * cannot fetch a .glb — XHR to a local file is blocked. Inlining it means the
 * kit arrives as part of the one classic script, so the 3D street works with no
 * server and no network.
 */
import { readFile, writeFile } from 'node:fs/promises'

const GLB = process.argv[2] ?? 'blender/out/kit.glb'
const OUT = process.argv[3] ?? 'src/three/kitData.ts'

const bytes = await readFile(GLB)
const base64 = bytes.toString('base64')

const header = `// GENERATED FILE — do not edit.
//
// Built by \`npm run build:kit\` from blender/build_kit.py.
// Source: ${GLB} (${(bytes.length / 1024).toFixed(0)} KB of GLB)
//
// Base64 rather than an asset URL because the offline package runs from
// file://, where fetching a sibling binary is blocked by the browser.

export const KIT_GLB_BASE64 =
`

// One string literal on one line. Splitting it into ~12,000 concatenated
// 100-character chunks reads more tidily but turns the file into a parser
// stress test — it was enough to take the dev server down on every rebuild.
await writeFile(OUT, `${header}  '${base64}'\n`)
console.log(`inlined ${(bytes.length / 1024).toFixed(0)} KB GLB -> ${OUT} (${(base64.length / 1024).toFixed(0)} KB base64)`)

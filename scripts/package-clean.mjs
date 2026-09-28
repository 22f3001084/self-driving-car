/**
 * The clean, independent deliverable: only what the game loads.
 *
 *   npm run build && node scripts/package-clean.mjs
 *
 * Writes ../../The-Northline-Run-BE6-Play (a sibling of this game's folder)
 * and a zip of it beside it. index.html + a FRESH assets/ from dist/ + a
 * launcher and a one-page guide. No source, no Blender models, no preview
 * renders, no asset studio, no legacy game/ and vendor/ folders — and no
 * stale hashed files, because assets/ is rebuilt from scratch every time
 * (publish-be6.mjs copies INTO the old folder and never deletes, which is how
 * that one had grown to 28 MB).
 *
 * Fails if the folder is 10 MB or more.
 */
import { readFile, writeFile, cp, rm, mkdir, readdir, stat } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const chrysalis = resolve(source, '..', '..')
const out = join(chrysalis, 'The-Northline-Run-BE6-Play')
const zip = `${out}.zip`
const LIMIT = 10 * 1024 * 1024

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await cp(join(source, 'dist', 'assets'), join(out, 'assets'), { recursive: true })

const app = await readFile(join(out, 'assets', 'app.js'))
const version = createHash('sha256').update(app).digest('hex').slice(0, 12)
const html = (await readFile(join(source, 'dist', 'index.html'), 'utf8'))
  .replace('./assets/app.js', `./assets/app.js?v=${version}`)
await writeFile(join(out, 'index.html'), html)
for (const file of ['PLAY.bat', 'HOW-TO-PLAY.txt']) {
  await cp(join(source, 'scripts', 'deliverable', file), join(out, file))
}

async function size(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    total += entry.isDirectory() ? await size(path) : (await stat(path)).size
  }
  return total
}
const bytes = await size(out)

await rm(zip, { force: true })
execFileSync('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${out}\*' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' })
const zipped = (await stat(zip)).size

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`
console.log(`${out}\n  ${mb(bytes)} (${(await readdir(join(out, 'assets'))).length} assets), app.js?v=${version}\n${zip}\n  ${mb(zipped)}`)
if (bytes >= LIMIT) {
  console.error(`over the 10 MB limit by ${mb(bytes - LIMIT)}`)
  process.exit(1)
}

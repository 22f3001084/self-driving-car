import { readFile, writeFile, cp, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

// Run after npm run build. This writes only to this duplicate's delivery root.
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const delivery = resolve(source, '..')
if (!delivery.endsWith('The-Northline-Run-3D-BE6')) throw new Error('Unexpected delivery folder')
await mkdir(resolve(delivery,'assets'), {recursive:true})
await cp(resolve(source,'dist/assets'), resolve(delivery,'assets'), {recursive:true})
await build({entryPoints:[resolve(source,'src/assetReview.ts')],bundle:true,format:'iife',minify:true,target:'es2020',outfile:resolve(delivery,'assets/asset-review.js')})
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex').slice(0,12)
const appVersion = await hash(resolve(delivery,'assets/app.js'))
const viewerVersion = await hash(resolve(delivery,'assets/asset-review.js'))
const html = (await readFile(resolve(source,'dist/index.html'),'utf8')).replace('./assets/app.js',`./assets/app.js?v=${appVersion}`)
await writeFile(resolve(delivery,'index.html'),html)
const viewer = (await readFile(resolve(delivery,'VIEW-ASSETS.html'),'utf8')).replace(/\.\/assets\/asset-review\.js(?:\?v=[a-z\d]+)?/,`./assets/asset-review.js?v=${viewerVersion}`)
await writeFile(resolve(delivery,'VIEW-ASSETS.html'),viewer)
console.log('Published the BE6 game and asset studio to',delivery)

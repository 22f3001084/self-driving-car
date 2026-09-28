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
// Vite's `?raw` suffix (the kit loader imports the Draco wrapper that way) is
// not esbuild's: load those files as text here too.
const rawText = {name:'raw-text',setup(b){
  b.onResolve({filter:/\?raw$/},(args)=>({path:resolve(args.resolveDir,args.path.replace(/\?raw$/,'')).replace(/^(?![A-Za-z]:|\/)/,''),namespace:'raw-text',pluginData:{spec:args.path.replace(/\?raw$/,''),dir:args.resolveDir}}))
  b.onLoad({filter:/.*/,namespace:'raw-text'},async(args)=>{
    const {createRequire} = await import('node:module')
    const spec = args.pluginData.spec
    const file = spec.startsWith('.') ? resolve(args.pluginData.dir, spec) : createRequire(resolve(args.pluginData.dir,'x.js')).resolve(spec)
    return {contents: await readFile(file,'utf8'), loader:'text'}
  })
}}
await build({entryPoints:[resolve(source,'src/assetReview.ts')],bundle:true,format:'iife',minify:true,target:'es2020',outfile:resolve(delivery,'assets/asset-review.js'),plugins:[rawText]})
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex').slice(0,12)
const appVersion = await hash(resolve(delivery,'assets/app.js'))
const viewerVersion = await hash(resolve(delivery,'assets/asset-review.js'))
const html = (await readFile(resolve(source,'dist/index.html'),'utf8')).replace('./assets/app.js',`./assets/app.js?v=${appVersion}`)
await writeFile(resolve(delivery,'index.html'),html)
const viewer = (await readFile(resolve(delivery,'VIEW-ASSETS.html'),'utf8')).replace(/\.\/assets\/asset-review\.js(?:\?v=[a-z\d]+)?/,`./assets/asset-review.js?v=${viewerVersion}`)
await writeFile(resolve(delivery,'VIEW-ASSETS.html'),viewer)
console.log('Published the BE6 game and asset studio to',delivery)

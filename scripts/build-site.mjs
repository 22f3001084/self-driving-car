// Build the deployable site: the 3D edition at the root, the flat 2D edition
// under /2d/. One folder, `site/`, ready for Netlify or Vercel (or any static
// host — every asset path in the bundles is relative).
//
//   npm run build:site
//
// Written as a script rather than a && chain so the VITE_SCENE_2D env var is
// set the same way on Windows shells and on the Linux build images the
// hosts use.
import { execSync } from 'node:child_process'

const run = (cmd, env = {}) =>
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })

// Type errors must fail the deploy, not ship: `vite build` alone does not run tsc.
run('npx tsc -b')
run('npx vite build --outDir site --emptyOutDir')
run('npx vite build --outDir site/2d --emptyOutDir', { VITE_SCENE_2D: '1' })

console.log('\nsite/ is ready: 3D at /, flat edition at /2d/')

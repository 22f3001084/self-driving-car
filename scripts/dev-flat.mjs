// The flat edition's dev server, for Playwright.
//
// `VITE_SCENE_2D=1` picks the 2D scene at build time (see vite.config.ts), and
// an env var cannot be set portably in a package.json `&&` chain — Windows
// shells and the Linux CI images disagree — so the config's webServer runs this
// tiny launcher instead. Port 5211 sits next to the 3D server's 5210.
import { spawn } from 'node:child_process'

const child = spawn('npx', ['vite', '--port', '5211', '--strictPort'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_SCENE_2D: '1' },
})
child.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill())

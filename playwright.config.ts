import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 150_000,
  // One worker: the game holds shared browser audio + the dev servers.
  workers: 1,
  use: {
    // Headed (headless falls back to SwiftShader, ~2 fps) but OFF-SCREEN: the
    // suite runs for minutes and a browser window flashing up over the desktop
    // the whole time was rightly complained about. The extra flags stop Chrome
    // throttling a window it decides is occluded.
    headless: false,
    launchOptions: {
      args: [
        '--window-position=-2600,40',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      ],
    },
    viewport: { width: 1600, height: 900 },
    video: 'off',
  },
  // Two editions, two servers, two projects. The flat edition used to have no
  // automated coverage at all — every 2D regression was found by a person.
  projects: [
    { name: '3d', testIgnore: /flat\.spec/ },
    { name: 'flat', testMatch: /flat\.spec/ },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 5210 --strictPort',
      url: 'http://localhost:5210',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'node scripts/dev-flat.mjs',
      url: 'http://localhost:5211',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})

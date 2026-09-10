// Headless playtest: runs the bot in Chromium and saves screenshots to shots/.
// Usage: pnpm dev (in another shell) then: pnpm shot [--url http://localhost:5173] [--mobile]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const urlIdx = args.indexOf('--url')
const base = urlIdx >= 0 ? args[urlIdx + 1] : 'http://localhost:5173'
const mobile = args.includes('--mobile')
const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
mkdirSync('shots', { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
)
const page = await ctx.newPage()
const errors: string[] = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

async function shot(name: string) {
  const file = `shots/${stamp}-${mobile ? 'm-' : ''}${name}.png`
  await page.screenshot({ path: file })
  console.log('saved', file)
}

const scenes: [string, string, number[]][] = [
  ['title', '/?mute=1', [1.5]],
  ['wreck', '/?bot=1&mute=1&seed=3', [2, 8, 20]],
  ['boss', '/?bot=1&mute=1&seed=3&skip=boss', [5, 10, 18]],
]
const only = args.find((a) => a.startsWith('--only='))?.slice(7)
for (const [name, path, times] of scenes) {
  if (only && name !== only) continue
  await page.goto(base + path, { waitUntil: 'load' })
  let t = 0
  for (const at of times) {
    await page.waitForTimeout((at - t) * 1000)
    t = at
    await shot(`${name}-${at}s`)
  }
}
if (errors.length) {
  console.log('--- console errors/warnings ---')
  for (const e of errors.slice(0, 30)) console.log(e)
}
await browser.close()

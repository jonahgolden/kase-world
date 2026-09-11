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
  ['title', '/?mute=1', [4]],
  ['wreck', '/?bot=1&mute=1&seed=3', [2, 8, 20]],
  ['boss', '/?bot=1&mute=1&seed=3&skip=boss', [5, 10, 18]],
  ['europe', '/?bot=1&mute=1&seed=4&level=europe', [3, 14]],
  ['asia', '/?bot=1&mute=1&seed=3&level=asia', [3, 20]],
  ['sky', '/?bot=1&mute=1&seed=3&level=sky', [3, 16]],
  ['jeff', '/?bot=1&mute=1&seed=3&level=antarctica&skip=boss', [6, 14]],
  ['bolt', '/?bot=1&mute=1&seed=3&level=south-america&skip=boss', [6, 14]],
  ['nest', '/?bot=1&mute=1&seed=3&level=sky&skip=boss', [6, 14]],
  ['chase', '/?bot=1&mute=1&seed=3&level=south-america', [4, 14]],
  ['snow', '/?bot=1&mute=1&seed=3&level=antarctica', [4, 16]],
  ['stampede', '/?bot=1&mute=1&seed=3&level=africa', [4, 10]],
  ['milk', '/?bot=1&mute=1&seed=3&level=australia', [6, 16]],
  ['race', '/?bot=1&mute=1&seed=3&level=europe', [4, 14]],
  ['khan', '/?bot=1&mute=1&seed=3&level=asia&skip=boss', [6, 12]],
  ['africa', '/?bot=1&mute=1&seed=3&level=africa&skip=boss', [6, 16]],
  ['outback', '/?bot=1&mute=1&seed=3&level=australia&skip=boss', [6, 16]],
  ['columbus', '/?bot=1&mute=1&seed=3&level=europe&skip=boss', [6, 14]],
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

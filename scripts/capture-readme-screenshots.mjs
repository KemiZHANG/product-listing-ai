import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { spawn } from 'node:child_process'

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const baseUrl = process.env.SCREENSHOT_BASE_URL || 'https://product-listing-ai.vercel.app'
const outDir = process.env.SCREENSHOT_OUT_DIR || 'docs/screenshots'
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9223)
const userDataDir = process.env.CHROME_SCREENSHOT_PROFILE || join(process.cwd(), '.tmp-chrome-readme')
const email = process.env.SCREENSHOT_EMAIL || `readme-${Date.now()}@example.com`
const password = process.env.SCREENSHOT_PASSWORD || 'Readme123456!'
const supabaseUrl = process.env.SCREENSHOT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.SCREENSHOT_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const pages = [
  ['dashboard.png', '/dashboard'],
  ['products.png', '/'],
  ['categories.png', '/categories'],
  ['product-outputs.png', '/product-outputs'],
  ['image-outputs.png', '/outputs'],
  ['seo-keywords.png', '/seo-keywords'],
  ['rules.png', '/rules'],
  ['settings.png', '/settings'],
]

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=1600,1000',
  'about:blank',
], { stdio: 'ignore' })

const closeChrome = () => {
  if (!chrome.killed) chrome.kill()
}

process.on('exit', closeChrome)
process.on('SIGINT', () => {
  closeChrome()
  process.exit(130)
})

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch {
      // Chrome may still be starting.
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

let messageId = 0
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  return {
    async send(method, params = {}) {
      await opened
      const id = ++messageId
      ws.send(JSON.stringify({ id, method, params }))
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id)
            reject(new Error(`CDP timeout: ${method}`))
          }
        }, 30000)
      })
    },
    close() {
      ws.close()
    },
  }
}

async function createPage() {
  let target
  try {
    const res = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })
    target = await res.json()
  } catch {
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`)
    target = targets.find((item) => item.type === 'page')
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('Could not create Chrome page')
  const cdp = connect(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  return cdp
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed')
  }
  return result.result?.value
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url })
  await waitFor(cdp, 'document.readyState === "complete"')
  await sleep(1200)
  await waitFor(
    cdp,
    `!document.body.innerText.includes('正在检查访问权限') && !document.body.innerText.includes('Checking access') && !document.body.innerText.includes('正在加载类目')`,
    25000
  ).catch(() => null)
  await sleep(2200)
}

async function waitFor(cdp, condition, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ok = await evaluate(cdp, `Boolean(${condition})`).catch(() => false)
    if (ok) return
    await sleep(300)
  }
  throw new Error(`Timed out waiting for condition: ${condition}`)
}

async function clickByText(cdp, texts) {
  const list = JSON.stringify(Array.isArray(texts) ? texts : [texts])
  await evaluate(cdp, `
    (() => {
      const texts = ${list};
      const buttons = [...document.querySelectorAll('button, a')];
      const el = buttons.find((node) => texts.some((text) => node.textContent?.trim().includes(text)));
      if (!el) throw new Error('Button/link not found: ' + texts.join(', '));
      el.click();
      return true;
    })()
  `)
}

async function setInput(cdp, selector, value) {
  const safeSelector = JSON.stringify(selector)
  const safeValue = JSON.stringify(value)
  await evaluate(cdp, `
    (() => {
      const el = document.querySelector(${safeSelector});
      if (!el) throw new Error('Input not found: ' + ${safeSelector});
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${safeValue});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `)
}

async function login(cdp) {
  await navigate(cdp, `${baseUrl}/login`)

  if (supabaseUrl && supabaseAnonKey) {
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).catch(() => null)

    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })
    if (!tokenRes.ok) {
      throw new Error(`Supabase password sign-in failed: ${tokenRes.status} ${await tokenRes.text()}`)
    }
    const session = await tokenRes.json()
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    const storageKey = `sb-${ref}-auth-token`
    await evaluate(cdp, `
      localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(session))});
      fetch('/api/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer ${session.access_token}' },
        cache: 'no-store'
      })
    `)
    await navigate(cdp, `${baseUrl}/dashboard`)
  } else {
    await clickByText(cdp, ['注册', 'Register'])
    await setInput(cdp, 'input[type="email"]', email)
    await setInput(cdp, 'input[type="password"]', password)
    await clickByText(cdp, ['注册', 'Register'])
    await sleep(4500)

    const stillOnLogin = await evaluate(cdp, `location.pathname.includes('/login')`)
    if (stillOnLogin) {
      await clickByText(cdp, ['登录', 'Sign in'])
      await setInput(cdp, 'input[type="email"]', email)
      await setInput(cdp, 'input[type="password"]', password)
      await clickByText(cdp, ['登录', 'Sign in'])
      await sleep(3500)
    }
  }

  try {
    await waitFor(cdp, `!location.pathname.includes('/login')`, 25000)
  } catch (error) {
    await screenshot(cdp, join(outDir, 'debug-login-failure.png'))
    const bodyText = await evaluate(cdp, `document.body.innerText`)
    console.error(bodyText)
    throw error
  }
}

async function screenshot(cdp, filePath) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  await writeFile(filePath, Buffer.from(result.data, 'base64'))
}

async function main() {
  await mkdir(outDir, { recursive: true })
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`)
  const cdp = await createPage()
  try {
    await login(cdp)
    for (const [filename, route] of pages) {
      await navigate(cdp, `${baseUrl}${route}`)
      await screenshot(cdp, join(outDir, filename))
      console.log(`saved ${join(outDir, filename)}`)
    }
  } finally {
    cdp.close()
    closeChrome()
  }
}

main().catch((error) => {
  closeChrome()
  console.error(error)
  process.exit(1)
})

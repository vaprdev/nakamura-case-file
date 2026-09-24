const SETTINGS = {
  spotRadius: 150, // radius of the bright hotspot; the dim spill reaches 2.4x further
  readSpeed: 360, // px per second while sweeping a line
  manualSeconds: 5, // how long mouse input takes over from the autopilot
}

const root = document.documentElement
const stage = document.querySelector(".stage")
const folder = document.querySelector(".folder")
const cover = document.querySelector(".cover")
const pagesBox = document.querySelector(".pages")
const pages = [...document.querySelectorAll(".page")]
const sound = document.querySelector(".sound")
const closeButton = document.querySelector(".close-file")
const viewer = document.querySelector(".evidence")
const viewerImage = viewer.querySelector("img")
const viewerLabel = viewer.querySelector("figcaption")
const viewerClose = viewer.querySelector(".evidence-close")
const card = document.querySelector(".card")
const intro = document.querySelector(".intro")
const frontCover = document.querySelector(".face.front")
const ashtray = document.querySelector(".d-ashtray")

// Wrap each page in a leaf with a plain paper back so it can flip over the top binding.
const leaves = pages.map((page, i) => {
  const leaf = document.createElement("div")
  leaf.className = "leaf"
  leaf.style.zIndex = String(pages.length - i)
  leaf.style.rotate = `${((i * 37) % 7) / 10 - 0.3}deg`
  page.before(leaf)
  leaf.append(page)
  const back = document.createElement("div")
  back.className = "leaf-back"
  leaf.append(back)
  return leaf
})

const spot = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 }
const auto = { running: false, path: [], t: 0, start: spot, onEnd: undefined }
const input = { manualUntil: 0, x: -1, y: -1 }
const tweens = new Set()
// intro → closed → opening → reading ⇄ turning → ending → closed
let state = "intro"
let current = 0
let fit = 1
let audio
let smoking = false
let sipping = false
let last = performance.now()

// ---- The story ----

function startDesk() {
  state = "closed"
  frontCover.classList.add("hot")
  const look = (selector) => {
    const el = document.querySelector(selector)
    return glance(el, Number(el.dataset.look))
  }
  run(
    [".d-mug", ".d-donut", ".d-ashtray", ".front"].flatMap(look),
    openFolder,
  )
}

async function openFolder() {
  if (state !== "closed") return
  state = "opening"
  frontCover.classList.remove("hot")
  auto.running = false
  // Move in first, then open, so the camera and the cover never animate at the same time.
  await setZoomSmooth(1)
  const r = cover.getBoundingClientRect()
  aim(r.right - 60 * fit, r.top + r.height * 0.6)
  audio?.touch()
  // The cover's free edge lifts first, then it swings over and drops onto the desk.
  await tween(0.5, (k) => setFolder(0.04 * easeOut(k)))
  audio?.folder()
  await tween(2.2, (k) => setFolder(0.04 + 0.9 * easeInOut(k)))
  await tween(0.45, (k) => setFolder(0.94 + 0.06 * k * k))
  audio?.land(0.3)
  await sleep(0.8)
  state = "reading"
  current = 0
  closeButton.hidden = false
  readPage(true)
}

function readPage(first) {
  const page = pages[current]
  if (current < pages.length - 1) page.classList.add("hot")
  const photo = first ? glance(document.querySelector("[data-intro]"), 2.5) : []
  const lines = [...page.querySelectorAll("[data-read]")].flatMap((el) =>
    el.dataset.read === "look" ? glance(el, Number(el.dataset.hold ?? 1.5)) : readLines(el),
  )
  const r = page.getBoundingClientRect()
  run([...photo, ...lines, { x: r.right - 40 * fit, y: r.bottom - 40 * fit, dur: 1 }], turnPage)
}

// Lift the corner and expose the sheet below without flipping the bright reverse side into view.
async function turnPage() {
  if (state !== "reading") return
  auto.running = false
  if (current === pages.length - 1) return endCase()
  state = "turning"
  pages[current].classList.remove("hot")
  const leaf = leaves[current]
  const page = pages[current]
  leaf.classList.add("turning")
  const r = page.getBoundingClientRect()
  aim(r.right - 50 * fit, r.bottom - 60 * fit)
  audio?.touch()
  await tween(0.5, (k) => {
    const e = easeOut(k)
    leaf.style.transform = `rotateX(${6 * e}deg) rotateY(${-4 * e}deg)`
  })
  audio?.page()
  await tween(1.2, (k) => {
    const e = easeInOut(k)
    leaf.style.transform = `rotateX(${6 + 8 * e}deg) rotateY(${-4 - 2 * e}deg) translateY(${-14 * e}px)`
    leaf.style.clipPath = `inset(0 0 ${100 * e}% 0)`
    aim(r.left + r.width * (0.8 - 0.25 * e), r.top + r.height * (0.55 - 0.2 * e))
  })
  leaf.style.visibility = "hidden"
  leaf.classList.remove("turning")
  current++
  state = "reading"
  readPage(false)
}

function endCase() {
  closeButton.hidden = true
  pages.forEach((page) => page.classList.remove("hot"))
  state = "ending"
  card.classList.add("show")
  setTimeout(() => {
    leaves.forEach((leaf) => {
      leaf.style.transform = ""
      leaf.style.clipPath = ""
      leaf.style.visibility = ""
    })
    pages.forEach((page) => page.style.removeProperty("--shade"))
    setFolder(0)
    zoom = 0
    applyStage()
    spot.x = spot.tx = innerWidth / 2
    spot.y = spot.ty = innerHeight / 2
  }, 2500)
  setTimeout(() => card.classList.remove("show"), 6000)
  setTimeout(startDesk, 7000)
}

function setFolder(e) {
  folder.style.transform = `translateX(${-300 * (1 - e)}px) rotate(${-1.4 + 0.8 * e}deg)`
  cover.style.transform = `rotateY(${-180 * e}deg)`
}

// Close the file and put it back on the desk; it stays shut until clicked again.
async function closeFolder() {
  if (state !== "reading") return
  state = "closing"
  auto.running = false
  closeButton.hidden = true
  pages.forEach((page) => page.classList.remove("hot"))
  audio?.folder()
  await tween(1.4, (k) => setFolder(1 - easeInOut(k)))
  audio?.land(0.3)
  leaves.forEach((leaf) => {
    leaf.style.transform = ""
    leaf.style.clipPath = ""
    leaf.style.visibility = ""
  })
  current = 0
  await setZoomSmooth(0)
  state = "closed"
  frontCover.classList.add("hot")
}

// ---- Evidence inspection ----

let resumeAfterInspect = false
function inspect(item) {
  resumeAfterInspect = auto.running
  auto.running = false
  viewerImage.src = item.dataset.src
  viewerImage.alt = item.querySelector("img").alt
  viewerLabel.textContent = item.dataset.label
  viewer.classList.add("open")
  audio?.touch()
  viewerClose.focus()
}

function closeInspect() {
  if (!viewer.classList.contains("open")) return
  viewer.classList.remove("open")
  if (resumeAfterInspect && state === "reading") auto.running = true
}

// Point the light somewhere while the autopilot is paused, unless the user is steering.
function aim(x, y) {
  if (performance.now() < input.manualUntil) return
  spot.tx = x
  spot.ty = y
}

// ---- Desk interactions ----

async function takeDrag() {
  if (smoking) return
  smoking = true
  audio?.drag()
  ashtray.classList.add("drawing")
  await sleep(1.1)
  ashtray.classList.remove("drawing")
  await sleep(0.4)
  await exhale()
  smoking = false
}

let biting = false
async function bite() {
  if (biting) return
  biting = true
  const donut = document.querySelector(".d-donut")
  donut.classList.add("bitten")
  audio?.bite()
  await sleep(2.6)
  donut.classList.remove("bitten")
  biting = false
}

async function sip() {
  if (sipping) return
  sipping = true
  audio?.slurp()
  await sleep(3)
  sipping = false
}

// ---- Smoke ----

const smokeCanvas = document.querySelector(".smoke")
const smokeContext = smokeCanvas.getContext("2d")
const SMOKE_RES = 0.5
const particles = []
const puffs = [1, 2, 3, 4].map(makePuff)

// A soft, noisy puff sprite: fractal value noise under a radial falloff.
function makePuff(seed) {
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const context = canvas.getContext("2d")
  const image = context.createImageData(size, size)
  const hash = (i, j) => {
    const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453
    return v - Math.floor(v)
  }
  const noise = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = x - xi
    const v = y - yi
    const su = u * u * (3 - 2 * u)
    const sv = v * v * (3 - 2 * v)
    const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * su
    const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * su
    return a + (b - a) * sv
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size
      const ny = y / size
      const value = [4, 8, 16, 32].reduce((sum, f, o) => sum + noise(nx * f, ny * f) * 0.5 ** (o + 1), 0)
      const r = Math.hypot(nx - 0.5, ny - 0.5) * 2
      const fall = Math.max(0, 1 - r) ** 1.8
      const i = (y * size + x) * 4
      image.data[i] = 222
      image.data[i + 1] = 216
      image.data[i + 2] = 206
      image.data[i + 3] = Math.max(0, Math.min(1, (value - 0.3) * 2)) * fall * 255
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function emit(x, y, o) {
  particles.push({
    x, y, vx: o.vx, vy: o.vy, size: o.size, grow: o.grow, alpha: o.alpha, life: o.life, age: 0,
    rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.4, sprite: puffs[(Math.random() * 4) | 0], seed: Math.random() * 10,
  })
}

// The exhale billows up from below the frame and rolls out over the whole desk, then a haze
// hangs in the room for several seconds before it thins out.
let haze = 0
function exhale() {
  tween(6, (k) => {
    const rise = Math.min(1, k / 0.1)
    const fall = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7
    haze = 0.5 * easeOut(rise) * fall * fall
  })
  return tween(1.1, (k) => {
    const strength = Math.sin(Math.min(1, k * 1.1) * Math.PI) + 0.3
    for (let i = 0; i < strength * 9; i++) {
      emit(innerWidth * (0.5 + (Math.random() - 0.5) * 0.35), innerHeight + 40 * fit, {
        vx: (Math.random() - 0.5) * 1100 * fit,
        vy: -(900 + Math.random() * 700) * fit,
        size: (160 + Math.random() * 180) * fit,
        grow: (260 + Math.random() * 260) * fit,
        alpha: 0.16 + Math.random() * 0.14,
        life: 3.5 + Math.random() * 2.5,
      })
    }
  })
}

function drawSmoke(dt) {
  smokeContext.setTransform(1, 0, 0, 1, 0, 0)
  smokeContext.clearRect(0, 0, smokeCanvas.width, smokeCanvas.height)
  if (haze > 0.002) {
    // Lit where the flashlight cuts through it, murky everywhere else.
    const g = smokeContext.createRadialGradient(
      spot.x * SMOKE_RES, spot.y * SMOKE_RES, 0,
      spot.x * SMOKE_RES, spot.y * SMOKE_RES, smokeCanvas.width * 0.6,
    )
    g.addColorStop(0, `rgba(226, 214, 192, ${haze})`)
    g.addColorStop(0.35, `rgba(160, 152, 140, ${haze * 0.8})`)
    g.addColorStop(1, `rgba(70, 66, 62, ${haze * 0.75})`)
    smokeContext.globalAlpha = 1
    smokeContext.fillStyle = g
    smokeContext.fillRect(0, 0, smokeCanvas.width, smokeCanvas.height)
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.age += dt
    if (p.age > p.life) {
      particles.splice(i, 1)
      continue
    }
    const drag = Math.exp(-dt * 1.3)
    p.vx = p.vx * drag + Math.sin(p.age * 1.3 + p.seed) * 30 * fit * dt
    p.vy = p.vy * drag - 16 * fit * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.size += p.grow * dt
    p.rot += p.vr * dt
    const fadeIn = Math.min(1, p.age / 0.3)
    smokeContext.globalAlpha = p.alpha * fadeIn * (1 - p.age / p.life) ** 1.5
    const c = Math.cos(p.rot) * SMOKE_RES
    const s = Math.sin(p.rot) * SMOKE_RES
    smokeContext.setTransform(c, s, -s, c, p.x * SMOKE_RES, p.y * SMOKE_RES)
    smokeContext.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size)
  }
}

// ---- Autopilot paths (viewport coordinates) ----

function run(path, onEnd) {
  auto.start = { x: spot.tx, y: spot.ty }
  auto.path = path
  auto.t = 0
  auto.onEnd = onEnd
  auto.running = true
}

function glance(el, hold) {
  const r = el.getBoundingClientRect()
  return [
    { x: r.left + r.width * 0.5, y: r.top + r.height * 0.42, dur: 1.3 },
    { x: r.left + r.width * 0.56, y: r.top + r.height * 0.38, dur: hold },
    { x: r.left + r.width * 0.46, y: r.top + r.height * 0.56, dur: 1.1 },
  ]
}

// Sweep the light along each rendered line of text, left to right.
function readLines(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const lines = []
  ;[...range.getClientRects()]
    .filter((r) => r.width > 2)
    .sort((a, b) => a.top - b.top)
    .forEach((r) => {
      const mid = r.top + r.height / 2
      const line = lines.find((l) => Math.abs(l.mid - mid) < r.height * 0.5)
      if (!line) return lines.push({ mid, left: r.left, right: r.right })
      line.left = Math.min(line.left, r.left)
      line.right = Math.max(line.right, r.right)
    })
  const speed = Number(el.dataset.speed ?? SETTINGS.readSpeed) * fit
  const hold = Number(el.dataset.hold ?? 0)
  const points = lines.flatMap((l, i) => [
    { x: l.left, y: l.mid, dur: i === 0 ? 0.8 : 0.35 },
    { x: l.right, y: l.mid, dur: Math.max(0.35, (l.right - l.left) / speed), linear: true },
  ])
  if (hold && lines.length) points.push({ x: lines.at(-1).right, y: lines.at(-1).mid, dur: hold })
  return points
}

function pointAt() {
  let t = auto.t
  let prev = auto.start
  for (const p of auto.path) {
    if (t < p.dur) {
      const k = t / p.dur
      const e = p.linear ? k : k * k * (3 - 2 * k)
      return { x: prev.x + (p.x - prev.x) * e, y: prev.y + (p.y - prev.y) * e }
    }
    t -= p.dur
    prev = p
  }
}

// ---- Frame loop ----

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  tweens.forEach((tw) => {
    tw.t += dt
    const k = Math.min(1, tw.t / tw.dur)
    tw.fn(k)
    if (k < 1) return
    tweens.delete(tw)
    tw.resolve()
  })
  if (auto.running && now >= input.manualUntil) {
    auto.t += dt
    const p = pointAt()
    if (!p) {
      auto.running = false
      auto.onEnd?.()
    }
    if (p) {
      // A little hand tremor so it feels held, not animated.
      spot.tx = p.x + 3 * Math.sin(now / 410) + 2 * Math.sin(now / 173)
      spot.ty = p.y + 3 * Math.cos(now / 370) + 2 * Math.sin(now / 211)
    }
  }
  const ease = 1 - Math.exp(-dt / 0.18)
  spot.x += (spot.tx - spot.x) * ease
  spot.y += (spot.ty - spot.y) * ease
  drawLight(now)
  drawSmoke(dt)
  requestAnimationFrame(frame)
}


// The beam is aimed from where the detective sits, so it stretches the farther up the desk it lands.
function drawLight(now) {
  const flicker = 1 + 0.01 * Math.sin(now / 47) * Math.sin(now / 131)
  const rx = SETTINGS.spotRadius * 2.4 * fit * flicker
  const ry = rx * (1 + 0.22 * (1 - Math.min(1, Math.max(0, spot.y / innerHeight))))
  root.style.setProperty("--sx", `${spot.x}px`)
  root.style.setProperty("--sy", `${spot.y}px`)
  root.style.setProperty("--rx", `${rx}px`)
  root.style.setProperty("--ry", `${ry}px`)
}

// The camera: one transform for position and scale, animated on the shared clock.
let wide = 1
let zoom = 0
function applyStage() {
  const e = easeInOut(zoom)
  const scale = wide * (1 + 0.6 * e)
  const y = innerHeight * (0.08 - 0.08 * e)
  stage.style.transform = `translate(-50%, -50%) translate3d(0, ${y}px, 0) scale(${scale})`
  fit = scale
}
function setZoomSmooth(target) {
  const from = zoom
  return tween(0.9, (k) => {
    zoom = from + (target - from) * k
    applyStage()
  })
}

function layout() {
  wide = Math.min(innerWidth / 1560, innerHeight / 960) * 0.55
  root.style.setProperty("--fit", String(wide))
  applyStage()
  smokeCanvas.width = Math.ceil(innerWidth * SMOKE_RES)
  smokeCanvas.height = Math.ceil(innerHeight * SMOKE_RES)
}

const tween = (dur, fn) => new Promise((resolve) => tweens.add({ t: 0, dur, fn, resolve }))
const sleep = (seconds) => tween(seconds, () => {})
const easeOut = (k) => 1 - (1 - k) ** 3
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

// ---- Input ----

window.addEventListener("pointermove", (event) => {
  // Browsers can emit pointer events without real movement; ignore those.
  if (event.clientX === input.x && event.clientY === input.y) return
  input.x = event.clientX
  input.y = event.clientY
  if (state === "intro") return
  input.manualUntil = performance.now() + SETTINGS.manualSeconds * 1000
  spot.tx = event.clientX
  spot.ty = event.clientY
})
closeButton.addEventListener("click", closeFolder)
viewerClose.addEventListener("click", closeInspect)
viewer.addEventListener("click", (event) => {
  if (event.target === viewer) closeInspect()
})
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeInspect()
})
window.addEventListener("pointerdown", (event) => {
  if (viewer.classList.contains("open")) return
  const item = event.target.closest(".evidence-item")
  if (item && state === "reading" && pages[current].contains(item)) return inspect(item)
  if (event.target === closeButton) return
  if (event.target === sound || state === "intro") return
  if (event.target.closest(".d-ashtray")) return takeDrag()
  if (event.target.closest(".d-mug")) return sip()
  if (event.target.closest(".d-donut")) return bite()
  if (state === "closed" && event.target.closest(".folder")) return openFolder()
  if (state === "reading" && pages[current].contains(event.target)) turnPage()
})
window.addEventListener("resize", layout)

intro.addEventListener("click", () => {
  intro.classList.add("gone")
  sound.hidden = false
  audio = startAudio()
  sound.addEventListener("click", () => {
    const on = audio.ctx.state !== "running"
    if (on) audio.ctx.resume()
    if (!on) audio.ctx.suspend()
    sound.textContent = on ? "♪ SOUND: ON" : "♪ SOUND: OFF"
  })
  setTimeout(startDesk, 1400)
})

layout()
setFolder(0)
requestAnimationFrame(frame)

// A lightning strike briefly throws the room into relief; thunder follows at a distance.
function lightning() {
  const office = document.querySelector(".office")
  office.classList.add("lightning")
  setTimeout(() => office.classList.remove("lightning"), 140)
  setTimeout(() => office.classList.add("lightning"), 230)
  setTimeout(() => office.classList.remove("lightning"), 340)
  setTimeout(() => audio?.thunder(), 1200 + Math.random() * 1600)
  setTimeout(lightning, 16000 + Math.random() * 26000)
}
setTimeout(lightning, 9000)

// ---- Sound: generated paper and folder effects ----

function startAudio() {
  const clips = {}
  const play = async (url, wobble) => {
    clips[url] ??= fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
    const source = ctx.createBufferSource()
    source.buffer = await clips[url]
    source.playbackRate.value = 1 - wobble / 2 + Math.random() * wobble
    source.connect(sfx)
    source.start()
  }
  const ctx = new AudioContext()
  const out = ctx.createDynamicsCompressor()
  out.connect(ctx.destination)
  const sfx = ctx.createGain()
  sfx.gain.value = 0.9
  sfx.connect(out)

  const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  white.getChannelData(0).forEach((_, i, data) => (data[i] = Math.random() * 2 - 1))
  const filter = (type, frequency) => {
    const node = ctx.createBiquadFilter()
    node.type = type
    node.frequency.value = frequency
    return node
  }
  startScore(ctx, out, filter)

  // Paper is filtered noise with a sweeping band; the thump is the page settling.
  const rustle = (time, duration, from, to, level) => {
    const source = ctx.createBufferSource()
    source.buffer = white
    source.playbackRate.value = 0.8 + Math.random() * 0.4
    const band = filter("bandpass", from)
    band.Q.value = 0.9
    band.frequency.setValueAtTime(from, time)
    band.frequency.exponentialRampToValueAtTime(to, time + duration)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.exponentialRampToValueAtTime(level, time + duration * 0.25)
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    source.connect(band).connect(env).connect(sfx)
    source.start(time, Math.random())
    source.stop(time + duration)
  }
  const thump = (time, level) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.frequency.setValueAtTime(110, time)
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15)
    env.gain.setValueAtTime(level, time)
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.2)
    osc.connect(env).connect(sfx)
    osc.start(time)
    osc.stop(time + 0.22)
  }
  // A breath: noise through a low band, with a slow swell.
  const breath = (time, duration, from, to, level) => {
    const source = ctx.createBufferSource()
    source.buffer = white
    source.loop = true
    const band = filter("bandpass", from)
    band.Q.value = 0.6
    band.frequency.setValueAtTime(from, time)
    band.frequency.linearRampToValueAtTime(to, time + duration)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(level, time + duration * 0.3)
    env.gain.linearRampToValueAtTime(level * 0.7, time + duration * 0.7)
    env.gain.linearRampToValueAtTime(0.0001, time + duration)
    source.connect(band).connect(env).connect(sfx)
    source.start(time, Math.random())
    source.stop(time + duration)
    return env
  }
  const crackle = (time, duration) => {
    for (let i = 0; i < duration * 22; i++) rustle(time + Math.random() * duration, 0.006, 5200, 4800, 0.06 + Math.random() * 0.1)
  }
  return {
    ctx,
    touch: () => {
      const t = ctx.currentTime
      rustle(t, 0.02, 3200, 3000, 0.22)
    },
    page: () => play("page.mp3", 0.08),
    land: (level) => {
      const t = ctx.currentTime
      rustle(t, 0.3, 1400, 500, 0.3)
      thump(t + 0.02, level)
    },
    folder: () => {
      const t = ctx.currentTime
      rustle(t, 0.8, 500, 1600, 0.4)
      rustle(t + 0.8, 1.6, 1500, 450, 0.3)
    },
    // Distant thunder: low noise that rolls in, grumbles and fades.
    thunder: () => {
      const t = ctx.currentTime
      const source = ctx.createBufferSource()
      source.buffer = white
      source.loop = true
      source.playbackRate.value = 0.5
      const low = filter("lowpass", 180)
      low.Q.value = 0.7
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, t)
      env.gain.linearRampToValueAtTime(0.5, t + 0.4)
      env.gain.linearRampToValueAtTime(0.28, t + 1.1)
      env.gain.linearRampToValueAtTime(0.42, t + 1.6)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 4.8)
      source.connect(low).connect(env).connect(sfx)
      source.start(t)
      source.stop(t + 5)
    },
    inhale: () => {
      const t = ctx.currentTime
      breath(t, 0.75, 900, 1600, 0.12)
      crackle(t + 0.05, 0.65)
    },
    exhale: () => {
      const t = ctx.currentTime
      breath(t, 1.3, 900, 320, 0.24)
    },
    // Recordings from freesound.org (via Pixabay): "sipping coffee" and "lighting a cigarette".
    slurp: () => play("sip.mp3", 0.1),
    bite: () => play("bite.mp3", 0.06),
    drag: () => play("drag.mp3", 0.04),
    clink: (level) => {
      const t = ctx.currentTime
      ;[2150, 3380, 5120].forEach((f, i) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.frequency.value = f
        g.gain.setValueAtTime(level * 0.12 / (i + 1), t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 - i * 0.08)
        osc.connect(g).connect(sfx)
        osc.start(t)
        osc.stop(t + 0.4)
      })
      thump(t, level * 0.3)
    },
  }
}

// Generated noir score: rain on the window, record crackle, a low drone and a slow, sparse D-minor piano.
function startScore(ctx, out, filter) {
  const master = ctx.createGain()
  master.gain.setValueAtTime(0, ctx.currentTime)
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 6)
  master.connect(out)

  const reverbLength = ctx.sampleRate * 4.5
  const impulse = ctx.createBuffer(2, reverbLength, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c)
    for (let i = 0; i < reverbLength; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / reverbLength) ** 3
  }
  const reverb = ctx.createConvolver()
  reverb.buffer = impulse
  const wet = ctx.createGain()
  wet.gain.value = 0.7
  reverb.connect(wet).connect(master)

  const noiseBuffer = (seconds, density) => {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = density === 1 ? Math.random() * 2 - 1 : Math.random() < density ? (Math.random() * 2 - 1) * 0.9 : 0
    }
    return buffer
  }
  const loop = (buffer, gain, ...filters) => {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const level = ctx.createGain()
    level.gain.value = gain
    filters.reduce((node, next) => node.connect(next), source).connect(level).connect(master)
    source.start()
  }
  loop(noiseBuffer(5, 1), 0.05, filter("highpass", 600), filter("lowpass", 2600))
  loop(noiseBuffer(3, 0.0005), 0.12, filter("lowpass", 5000))

  const droneFilter = filter("lowpass", 260)
  droneFilter.Q.value = 3
  const lfo = ctx.createOscillator()
  const lfoDepth = ctx.createGain()
  lfo.frequency.value = 0.04
  lfoDepth.gain.value = 110
  lfo.connect(lfoDepth).connect(droneFilter.frequency)
  lfo.start()
  const droneLevel = ctx.createGain()
  droneLevel.gain.value = 0.045
  droneFilter.connect(droneLevel)
  droneLevel.connect(master)
  droneLevel.connect(reverb)
  ;[
    [73.42, -6],
    [73.42, 7],
    [110, 0],
  ].forEach(([frequency, detune]) => {
    const osc = ctx.createOscillator()
    osc.type = "sawtooth"
    osc.frequency.value = frequency
    osc.detune.value = detune
    osc.connect(droneFilter)
    osc.start()
  })

  const midi = (m) => 440 * 2 ** ((m - 69) / 12)
  const note = (m, time, velocity, length) => {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(velocity, time + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, time + length)
    const tone = filter("lowpass", 1700)
    env.connect(tone)
    tone.connect(master)
    tone.connect(reverb)
    ;[
      ["sine", 1, 1],
      ["triangle", 2, 0.25],
    ].forEach(([type, ratio, level]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = midi(m) * ratio
      gain.gain.value = level
      osc.connect(gain).connect(env)
      osc.start(time)
      osc.stop(time + length)
    })
  }
  const chords = [
    [62, 65, 69, 72],
    [58, 62, 65, 69],
    [55, 58, 62, 65],
    [57, 61, 64, 67],
  ]
  const bass = [38, 34, 31, 33]
  let next = ctx.currentTime + 1
  let step = 0
  setInterval(() => {
    while (next < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 8) % 4
      const pos = step % 8
      const chord = chords[bar]
      if (pos === 0) note(bass[bar], next, 0.14, 7)
      if (Math.random() < (pos % 2 === 0 ? 0.6 : 0.2)) {
        note(chord[Math.floor(Math.random() * chord.length)], next, 0.05 + Math.random() * 0.04, 3.5)
      }
      if (pos === 5 && Math.random() < 0.35) note(chord[3] + 12, next, 0.03, 5)
      next += 0.8
      step++
    }
  }, 100)
}

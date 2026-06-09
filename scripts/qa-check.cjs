const { chromium } = require('playwright')
const path = require('path')

const baseUrl = process.env.QA_URL || 'http://127.0.0.1:5174/'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  await context.addInitScript(() => {
    const audioEvents = {
      gainTargets: [],
      oscillators: [],
      resumes: 0,
    }

    class FakeAudioParam {
      setValueAtTime(value, time) {
        audioEvents.gainTargets.push({ method: 'set', value, time })
      }

      exponentialRampToValueAtTime(value, time) {
        audioEvents.gainTargets.push({ method: 'ramp', value, time })
      }
    }

    class FakeGain {
      constructor() {
        this.gain = new FakeAudioParam()
      }

      connect() {
        return this
      }

      disconnect() {
        return undefined
      }
    }

    class FakeOscillator {
      constructor() {
        this.frequency = new FakeAudioParam()
        this.type = 'sine'
        this.onended = null
      }

      connect() {
        return this
      }

      disconnect() {
        return undefined
      }

      start(time) {
        audioEvents.oscillators.push({ event: 'start', type: this.type, time })
      }

      stop(time) {
        audioEvents.oscillators.push({ event: 'stop', type: this.type, time })

        if (this.onended) {
          window.setTimeout(() => this.onended(), 0)
        }
      }
    }

    class FakeAudioContext {
      constructor() {
        this.currentTime = 0
        this.destination = {}
        this.state = 'running'
      }

      createGain() {
        return new FakeGain()
      }

      createOscillator() {
        return new FakeOscillator()
      }

      resume() {
        audioEvents.resumes += 1
        this.state = 'running'
        return Promise.resolve()
      }
    }

    Object.defineProperty(window, '__mspAudioEvents', {
      configurable: true,
      value: audioEvents,
    })
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    })
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: FakeAudioContext,
    })
  })
  const page = await context.newPage()

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  const initial = await page.evaluate(() => ({
    title: document.title,
    videoSrc:
      document.querySelector('video.background-media source')?.getAttribute('src') ||
      '',
    spotifyHref:
      document.querySelector('.spotify-open-link')?.getAttribute('href') || '',
    spotifyIframeCount: document.querySelectorAll('.widget-frame-spotify iframe').length,
    quranAudioSrc:
      document
        .querySelector('audio.quran-audio-element')
        ?.getAttribute('src') || '',
    quranText: document.querySelector('.widget-frame-quran')?.textContent || '',
    quranPlayerState:
      document.querySelector('.quran-player-widget')?.getAttribute('data-player-state') ||
      '',
    quranFrameCount: document.querySelectorAll('iframe[title="Quran recitation player"]').length,
    youtubeSrc:
      document
        .querySelector('iframe[title="YouTube Quran player"]')
        ?.getAttribute('src') || '',
    youtubeOverlay: document.querySelector('.youtube-overlay')?.textContent || '',
    brandLockup: document.querySelector('.brand-lockup')?.textContent || '',
    chatWidgetCount: document.querySelectorAll('.chatgpt-widget').length,
    settingsButtonCount: document.querySelectorAll('.settings-trigger').length,
    streakText: document.querySelector('.streak-flame')?.textContent || '',
    bestRunText: document.querySelector('.best-run-star')?.textContent || '',
    totalStarsText: document.querySelector('.total-stars-counter')?.textContent || '',
    chainText: document.querySelector('.pomodoro-chain')?.textContent || '',
    visibleWidgets: document.querySelectorAll('.widget-frame').length,
    quranWidgetCount: document.querySelectorAll('.widget-frame-quran').length,
    youtubeDockButtonCount: document.querySelectorAll('button[aria-label="YouTube"]').length,
    notesWidgetCount: document.querySelectorAll('.widget-frame-notes').length,
    spotifyForms: document.querySelectorAll('.widget-frame-spotify .url-form').length,
    particleCount: document.querySelectorAll('.background-light-particles span').length,
    magicParticleCanvasCount: document.querySelectorAll('.magic-particles-canvas').length,
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    backgroundText: document.querySelector('.background-list')?.textContent || '',
    spotifyTodoOverlap: (() => {
      const spotify = document.querySelector('.widget-frame-spotify')?.getBoundingClientRect()
      const todo = document.querySelector('.widget-frame-todo')?.getBoundingClientRect()

      if (!spotify || !todo) {
        return true
      }

      return !(
        spotify.right <= todo.left ||
        spotify.left >= todo.right ||
        spotify.bottom <= todo.top ||
        spotify.top >= todo.bottom
      )
    })(),
    ankiWidgetCount: document.querySelectorAll('.widget-frame-anki').length,
    text: document.body.innerText,
  }))

  assert(initial.title === 'Muslim Study Place', 'Document title mismatch')
  assert(
    initial.videoSrc.includes('backgrounds/train.f244a946.mp4'),
    'Train MP4 is not the active source',
  )
  assert(
    initial.spotifyHref.includes('37i9dQZF1DZ06evO2QBzaO'),
    'Spotify launch playlist mismatch',
  )
  assert(initial.spotifyIframeCount === 0, 'Spotify iframe should be removed')
  assert(
    initial.quranAudioSrc.includes('archive.org/download/20240229_20240229_1756') &&
      initial.quranAudioSrc.includes('.mp3'),
    'Quran player audio source mismatch',
  )
  assert(
    initial.quranText.includes('Omar Diaa Aldeen') &&
      initial.quranText.includes('Al-Baqarah'),
    'Quran player copy missing',
  )
  assert(initial.quranFrameCount === 0, 'Quran player should not use a video iframe')
  assert(initial.youtubeSrc === '', 'Legacy YouTube widget should be hidden by default')
  assert(initial.youtubeDockButtonCount === 1, 'YouTube dock toggle should remain available')
  assert(initial.brandLockup === '', 'Top-left brand block is still present')
  assert(initial.chatWidgetCount === 0, 'ChatGPT widget should be removed')
  assert(initial.settingsButtonCount === 1, 'Settings trigger missing')
  assert(initial.streakText.includes('day streak'), 'Streak flame missing')
  assert(initial.bestRunText.includes('best continuous'), 'Best run star missing')
  assert(initial.totalStarsText.includes('total stars'), 'Total star counter missing')
  assert(initial.chainText.includes('continuous'), 'Pomodoro star chain missing')
  assert(initial.spotifyForms === 0, 'Spotify widget still has block controls')
  assert(initial.particleCount === 0, 'Light particles should be removed')
  assert(initial.magicParticleCanvasCount === 0, 'Magic particles should wait for image backgrounds')
  assert(initial.noHorizontalOverflow, 'Desktop layout has horizontal overflow')
  assert(!initial.spotifyTodoOverlap, 'Spotify and Todo widgets overlap')
  assert(initial.visibleWidgets === 6, 'Expected six widgets to be visible')
  assert(initial.quranWidgetCount === 1, 'Quran widget should be visible')
  assert(initial.notesWidgetCount === 1, 'Notes widget should be visible')
  ;['Train', 'Oasis', 'Japan', 'Night Cosy'].forEach((label) => {
    assert(initial.backgroundText.includes(label), `${label} background is missing`)
  })
  assert(initial.ankiWidgetCount === 0, 'Anki widget should be removed')
  assert(!/anki|ankiconnect|anki-connect/i.test(initial.text), 'Anki copy should be removed')
  assert(
    !/lofi|twitch|music station|lofi girl|chatgpt/i.test(initial.text),
    'Forbidden lofi/twitch/chatgpt copy found',
  )

  const spotifyPopupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'Open Spotify' }).click()
  const spotifyPopup = await spotifyPopupPromise
  assert(
    spotifyPopup.url().includes('37i9dQZF1DZ06evO2QBzaO'),
    'Spotify launcher did not open the Omar playlist',
  )
  await spotifyPopup.close()

  await page.waitForSelector('audio.quran-audio-element', { state: 'attached' })
  await page.getByLabel('Play Quran recitation').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.quran-player-widget')
        ?.getAttribute('data-player-state') === 'playing',
  )
  assert(
    await page.getByLabel('Pause Quran recitation').isVisible(),
    'Quran play button did not enter pause state',
  )
  await page
    .locator('.quran-recitation-list button')
    .filter({ hasText: 'Yusuf' })
    .click()
  await page.waitForFunction(() =>
    document
      .querySelector('audio.quran-audio-element')
      ?.getAttribute('src')
      ?.includes('Surah%20Yusuf.mp3'),
  )
  assert(
    (await page.locator('.quran-recitation-list button.is-selected').filter({
      hasText: 'Yusuf',
    }).count()) === 1,
    'Quran recitation selection did not update',
  )

  await page.locator('.settings-trigger').click()
  assert(
    await page.getByText('Thanks to Melkeydev').isVisible(),
    'Astrostation creator credit missing from settings',
  )
  assert(
    await page.getByLabel('Daily flame target').isVisible(),
    'Daily flame target setting missing',
  )
  assert(
    await page.getByLabel('Magic particles').isChecked(),
    'Magic particles setting should default on',
  )
  await page.getByLabel('Focus minutes').fill('26')
  await page.getByLabel('Long break every').fill('3')
  await page.waitForFunction(() =>
    localStorage.getItem('muslim-study-place:timerSettings')?.includes('"focusMinutes":26'),
  )
  assert(
    await page.getByText('26:00').isVisible(),
    'Focus minutes setting did not update timer immediately',
  )
  await page.locator('.settings-panel').evaluate((panel) => {
    panel.scrollTop = panel.scrollHeight
  })
  assert(
    await page.getByLabel('Close settings').isVisible(),
    'Settings close button is not visible after scrolling',
  )
  await page.getByLabel('Close settings').click()
  assert(await page.getByText('26:00').isVisible(), 'Focus minutes setting did not update timer')

  await page.getByLabel('New note').click()
  await page.getByLabel('Note title').fill('Arabic vocabulary')
  await page.getByLabel('Note category').fill('Vocabulary')
  await page.getByLabel('Note body').fill('Roots to revise')
  await page.waitForFunction(() =>
    localStorage.getItem('muslim-study-place:notes')?.includes('Arabic vocabulary'),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  assert(
    (await page.getByText('Arabic vocabulary').count()) >= 1,
    'Created note did not persist after reload',
  )
  await page.getByLabel('Search notes').fill('roots')
  assert(
    (await page.getByText('Roots to revise').count()) >= 1,
    'Notes search did not keep the matching note visible',
  )

  await page.locator('.todo-widget input[aria-label="Add task"]').fill('Persistence check')
  await page.locator('.todo-form').getByLabel('Increase required pomodoros').click()
  await page.locator('.todo-form').getByLabel('Increase required pomodoros').click()
  await page.locator('.todo-form').getByRole('button', { name: 'Add task' }).click()
  assert(
    (await page.getByText('Persistence check').count()) === 1,
    'New todo was not created',
  )
  await page.waitForFunction(() =>
    localStorage.getItem('muslim-study-place:todos')?.includes('Persistence check'),
  )
  assert(
    (await page.getByText('0/3').count()) >= 1,
    'New todo did not keep required pomodoro count',
  )
  await page
    .locator('.todo-row')
    .filter({ hasText: 'Persistence check' })
    .getByLabel('Set Persistence check active')
    .click()
  assert(
    await page
      .locator('.todo-row')
      .filter({ hasText: 'Persistence check' })
      .getByText('Active')
      .isVisible(),
    'Task could not be set in progress',
  )
  await page.getByLabel('Increase pomodoro chain target').click()
  assert((await page.getByText('0/4').count()) >= 1, 'Pomodoro target did not sync to active task')
  await page
    .locator('.todo-row')
    .filter({ hasText: 'Persistence check' })
    .getByLabel('Resume Persistence check timer')
    .click()
  await page.waitForFunction(() =>
    localStorage.getItem('muslim-study-place:timer:running') === 'true',
  )
  await page
    .locator('.todo-row')
    .filter({ hasText: 'Persistence check' })
    .getByLabel('Pause Persistence check timer')
    .click()
  await page.waitForFunction(() =>
    localStorage.getItem('muslim-study-place:timer:running') === 'false',
  )
  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:timer:remaining', '777')
    localStorage.setItem('muslim-study-place:timer:mode', '"focus"')
    localStorage.setItem('muslim-study-place:timer:running', 'false')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page
    .locator('.todo-row')
    .filter({ hasText: 'Study session notes' })
    .getByLabel('Set Study session notes active')
    .click()
  assert(await page.getByText('26:00').isVisible(), 'Second objective did not get its own timer')
  await page
    .locator('.todo-row')
    .filter({ hasText: 'Persistence check' })
    .getByLabel('Set Persistence check active')
    .click()
  assert(await page.getByText('12:57').isVisible(), 'First objective timer memory was not restored')
  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:timer:remaining', '1')
    localStorage.setItem('muslim-study-place:timer:mode', '"focus"')
    localStorage.setItem('muslim-study-place:timer:running', 'false')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page
    .locator('.todo-row')
    .filter({ hasText: 'Persistence check' })
    .getByLabel('Resume Persistence check timer')
    .click()
  await page.waitForTimeout(1800)
  assert(
    (await page.getByText('1/4').count()) >= 1,
    'Active task did not increment automatically after a focus session',
  )
  await page.waitForFunction(() =>
    localStorage.getItem('muslim-study-place:todos')?.includes('"completedPomodoros":1'),
  )
  const firstFocusAudioState = await page.evaluate(() => {
    const events = window.__mspAudioEvents
    const gainValues = events?.gainTargets?.map((event) => event.value) ?? []

    return {
      maxGain: gainValues.length ? Math.max(...gainValues) : 0,
      starts:
        events?.oscillators?.filter((event) => event.event === 'start').length ?? 0,
    }
  })
  assert(firstFocusAudioState.starts >= 2, 'Focus completion did not trigger audio')
  assert(firstFocusAudioState.maxGain >= 0.15, 'Focus completion audio is too quiet')
  const autoCycleState = await page.evaluate(() => ({
    mode: localStorage.getItem('muslim-study-place:timer:mode'),
    running: localStorage.getItem('muslim-study-place:timer:running'),
    run: localStorage.getItem('muslim-study-place:pomodoroRun'),
  }))
  assert(
    autoCycleState.mode === '"shortBreak"' && autoCycleState.running === 'true',
    'Pomodoro did not auto-cycle into break',
  )
  assert(
    autoCycleState.run && autoCycleState.run.includes('"currentRun":1'),
    'Continuous star streak did not increase',
  )
  assert(
    autoCycleState.run && autoCycleState.run.includes('"totalStars":1'),
    'Total star counter did not increase',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  assert(
    (await page.getByText('Persistence check').count()) >= 1,
    'Todo did not persist after reload',
  )
  assert((await page.getByText('1/4').count()) >= 1, 'Pomodoro progress did not persist')

  for (const background of [
    { label: 'Oasis', src: 'arabic-oasis.png' },
    { label: 'Japan', src: 'japan-garden.png' },
    { label: 'Night Cosy', src: 'night-cosy.png' },
  ]) {
    await page
      .locator('.background-row')
      .filter({ hasText: background.label })
      .locator('button')
      .first()
      .click()
    await page.waitForFunction(
      (src) =>
        document
          .querySelector('.background-media.is-image')
          ?.getAttribute('src')
          ?.includes(src),
      background.src,
    )
  }
  await page.waitForSelector('.magic-particles-canvas[data-particles-ready="true"]')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.magic-particles-canvas')

    if (!(canvas instanceof HTMLCanvasElement)) {
      return false
    }

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    if (!gl) {
      return false
    }

    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
    let brightSamples = 0
    let maxChannel = 0

    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    )

    for (let index = 0; index < pixels.length; index += 4) {
      const channel = Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
      maxChannel = Math.max(maxChannel, channel)

      if (channel >= 60 || pixels[index + 3] >= 60) {
        brightSamples += 1
      }
    }

    return brightSamples > 650 && maxChannel >= 120
  }, null, { timeout: 15000 })
  const magicParticlesState = await page.evaluate(() => {
    const canvas = document.querySelector('.magic-particles-canvas')

    if (!(canvas instanceof HTMLCanvasElement)) {
      return { canvasCount: 0, litSamples: 0, brightSamples: 0, maxChannel: 0 }
    }

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    if (!gl) {
      return { canvasCount: 1, litSamples: 0, brightSamples: 0, maxChannel: 0 }
    }

    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    const pixels = new Uint8Array(width * height * 4)
    let litSamples = 0
    let brightSamples = 0
    let maxChannel = 0

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    for (let index = 0; index < pixels.length; index += 4) {
      const channel = Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
      maxChannel = Math.max(maxChannel, channel)

      if (channel || pixels[index + 3]) {
        litSamples += 1
      }

      if (channel >= 60 || pixels[index + 3] >= 60) {
        brightSamples += 1
      }
    }

    return { canvasCount: 1, litSamples, brightSamples, maxChannel }
  })
  assert(magicParticlesState.canvasCount === 1, 'Magic particle canvas missing')
  assert(magicParticlesState.litSamples > 0, 'Magic particle canvas is blank')
  assert(
    magicParticlesState.brightSamples > 650,
    'Magic particles are too faint on desktop',
  )
  assert(
    magicParticlesState.maxChannel >= 120,
    'Magic particles do not reach a visible brightness',
  )

  await page.locator('.settings-trigger').click()
  await page.getByLabel('Magic particles').setChecked(false)
  await page.waitForFunction(() => !document.querySelector('.magic-particles-canvas'))
  await page.getByLabel('Magic particles').setChecked(true)
  await page.waitForSelector('.magic-particles-canvas[data-particles-ready="true"]')
  await page.getByLabel('Close settings').click()

  await page.setInputFiles(
    '.upload-button input[type="file"]',
    path.resolve('public/favicon.svg'),
  )
  await page.waitForTimeout(1000)
  const uploadState = await page.evaluate(() => {
    const image = document.querySelector('.background-media.is-image')

    return {
      selected: localStorage.getItem('muslim-study-place:selectedBackground') || '',
      rowText: document.querySelector('.background-list')?.textContent || '',
      hasImageBackground: Boolean(image),
      hasWater: Boolean(document.querySelector('.background-water')),
      hasParticles: Boolean(document.querySelector('.background-light-particles')),
      imageAnimation: image ? getComputedStyle(image).animationName : '',
      imageTransform: image ? getComputedStyle(image).transform : '',
    }
  })
  assert(uploadState.selected.includes('upload-'), 'Uploaded background was not selected')
  assert(uploadState.rowText.includes('favicon'), 'Uploaded background is not listed')
  assert(uploadState.rowText.includes('local base'), 'Uploaded background is not marked local base')
  assert(uploadState.hasImageBackground, 'Uploaded image background was not rendered')
  assert(!uploadState.hasWater, 'Water animation layer should be removed')
  assert(!uploadState.hasParticles, 'Light particle layer should be removed')
  assert(uploadState.imageAnimation === 'none', 'Image background should not animate')
  assert(uploadState.imageTransform === 'none', 'Image background should not transform')

  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('muslim-study-place', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('backgroundUploads', 'readwrite')
      tx.objectStore('backgroundUploads').put({
        id: 'upload-japan-test',
        label: 'ChatGPT Image 7 juin 2026, 10_39_12',
        kind: 'image',
        blob: new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {
          type: 'image/svg+xml',
        }),
        mimeType: 'image/svg+xml',
        createdAt: Date.now(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    localStorage.setItem(
      'muslim-study-place:selectedBackground',
      JSON.stringify('upload-japan-test'),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => localStorage.getItem('muslim-study-place:selectedBackground') === '"japan"',
  )
  await page.waitForFunction(() =>
    document
      .querySelector('.background-media.is-image')
      ?.getAttribute('src')
      ?.includes('japan-garden.png'),
  )
  const builtInUploadState = await page.evaluate(() => ({
    selected: localStorage.getItem('muslim-study-place:selectedBackground') || '',
    rowText: document.querySelector('.background-list')?.textContent || '',
    imageSrc:
      document.querySelector('.background-media.is-image')?.getAttribute('src') || '',
  }))
  assert(builtInUploadState.selected === '"japan"', 'Legacy Japan upload was not migrated')
  assert(
    !builtInUploadState.rowText.includes('ChatGPT Image 7 juin'),
    'Legacy local upload duplicate is still visible',
  )
  assert(
    builtInUploadState.imageSrc.includes('japan-garden.png'),
    'Migrated Japan background did not render',
  )

  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:todos', '[]')
    localStorage.setItem('muslim-study-place:timer:remaining', '1')
    localStorage.setItem('muslim-study-place:timer:mode', '"focus"')
    localStorage.setItem('muslim-study-place:timer:running', 'false')
    localStorage.setItem(
      'muslim-study-place:pomodoroRun',
      JSON.stringify({
        targetPomodoros: 1,
        completedInTarget: 0,
        currentRun: 0,
        bestRun: 0,
        totalStars: 0,
        lastStarAt: 0,
        autoCycle: true,
      }),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.locator('.pomodoro-widget').getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(1800)
  assert(
    await page.locator('.finished-banner').getByText('Finished!').isVisible(),
    'Pomodoro finished banner did not appear',
  )
  const finishedState = await page.evaluate(() => {
    const events = window.__mspAudioEvents
    const gainValues = events?.gainTargets?.map((event) => event.value) ?? []

    return {
      mode: localStorage.getItem('muslim-study-place:timer:mode'),
      remaining: localStorage.getItem('muslim-study-place:timer:remaining'),
      running: localStorage.getItem('muslim-study-place:timer:running'),
      maxGain: gainValues.length ? Math.max(...gainValues) : 0,
      starts:
        events?.oscillators?.filter((event) => event.event === 'start').length ?? 0,
    }
  })
  assert(finishedState.running === 'false', 'Finished pomodoro kept running')
  assert(finishedState.mode === '"focus"', 'Finished pomodoro changed mode')
  assert(finishedState.remaining === '0', 'Finished pomodoro did not stop at 00:00')
  assert(finishedState.starts >= 2, 'Finished focus did not trigger audio')
  assert(finishedState.maxGain >= 0.15, 'Finished focus audio is too quiet')
  assert(
    await page.locator('.pomodoro-widget').getByRole('button', { name: 'Start' }).isDisabled(),
    'Finished pomodoro can be restarted without reset',
  )

  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:todos', '[]')
    localStorage.setItem('muslim-study-place:timer:remaining', '42')
    localStorage.setItem('muslim-study-place:timer:mode', '"shortBreak"')
    localStorage.setItem('muslim-study-place:timer:running', 'true')
    localStorage.setItem(
      'muslim-study-place:pomodoroRun',
      JSON.stringify({
        targetPomodoros: 1,
        completedInTarget: 1,
        currentRun: 1,
        bestRun: 1,
        totalStars: 1,
        lastStarAt: Date.now(),
        autoCycle: true,
      }),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const normalizedFinishedState = await page.evaluate(() => ({
    mode: localStorage.getItem('muslim-study-place:timer:mode'),
    remaining: localStorage.getItem('muslim-study-place:timer:remaining'),
    running: localStorage.getItem('muslim-study-place:timer:running'),
    finishedVisible: Boolean(document.querySelector('.finished-banner')),
  }))
  assert(normalizedFinishedState.finishedVisible, 'Stale finished state lost banner')
  assert(
    normalizedFinishedState.running === 'false',
    'Stale finished state kept timer running',
  )
  assert(
    normalizedFinishedState.mode === '"focus"',
    'Stale finished state did not normalize mode',
  )
  assert(
    normalizedFinishedState.remaining === '0',
    'Stale finished state did not normalize remaining time',
  )

  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:todos', '[]')
    localStorage.setItem('muslim-study-place:timer:remaining', '1')
    localStorage.setItem('muslim-study-place:timer:mode', '"shortBreak"')
    localStorage.setItem('muslim-study-place:timer:running', 'false')
    localStorage.setItem(
      'muslim-study-place:pomodoroRun',
      JSON.stringify({
        targetPomodoros: 3,
        completedInTarget: 1,
        currentRun: 1,
        bestRun: 1,
        totalStars: 1,
        lastStarAt: Date.now(),
        autoCycle: false,
      }),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.locator('.pomodoro-widget').getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(1800)
  const shortBreakAudioState = await page.evaluate(() => {
    const events = window.__mspAudioEvents
    const gainValues = events?.gainTargets?.map((event) => event.value) ?? []

    return {
      mode: localStorage.getItem('muslim-study-place:timer:mode'),
      running: localStorage.getItem('muslim-study-place:timer:running'),
      maxGain: gainValues.length ? Math.max(...gainValues) : 0,
      starts:
        events?.oscillators?.filter((event) => event.event === 'start').length ?? 0,
    }
  })
  assert(shortBreakAudioState.mode === '"focus"', 'Break completion did not return to focus')
  assert(shortBreakAudioState.running === 'false', 'Break completion ignored auto-cycle off')
  assert(shortBreakAudioState.starts >= 2, 'Break completion did not trigger audio')
  assert(shortBreakAudioState.maxGain >= 0.15, 'Break completion audio is too quiet')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.waitForSelector('.magic-particles-canvas[data-particles-ready="true"]')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.magic-particles-canvas')

    if (!(canvas instanceof HTMLCanvasElement)) {
      return false
    }

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    if (!gl) {
      return false
    }

    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
    let brightSamples = 0
    let maxChannel = 0

    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    )

    for (let index = 0; index < pixels.length; index += 4) {
      const channel = Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
      maxChannel = Math.max(maxChannel, channel)

      if (channel >= 60 || pixels[index + 3] >= 60) {
        brightSamples += 1
      }
    }

    return brightSamples > 240 && maxChannel >= 110
  }, null, { timeout: 15000 })
  const mobile = await page.evaluate(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    dockBottom: document.querySelector('.dock')?.getBoundingClientRect().bottom || 0,
    firstWidgetTop:
      document.querySelector('.widget-frame')?.getBoundingClientRect().top || 0,
    magicParticleCanvasCount: document.querySelectorAll('.magic-particles-canvas').length,
    magicParticleMetrics: (() => {
      const canvas = document.querySelector('.magic-particles-canvas')

      if (!(canvas instanceof HTMLCanvasElement)) {
        return { litSamples: 0, brightSamples: 0, maxChannel: 0 }
      }

      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

      if (!gl) {
        return { litSamples: 0, brightSamples: 0, maxChannel: 0 }
      }

      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
      let litSamples = 0
      let brightSamples = 0
      let maxChannel = 0

      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      )

      for (let index = 0; index < pixels.length; index += 4) {
        const channel = Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
        maxChannel = Math.max(maxChannel, channel)

        if (channel || pixels[index + 3]) {
          litSamples += 1
        }

        if (channel >= 60 || pixels[index + 3] >= 60) {
          brightSamples += 1
        }
      }

      return { litSamples, brightSamples, maxChannel }
    })(),
  }))
  assert(mobile.noHorizontalOverflow, 'Mobile layout has horizontal overflow')
  assert(mobile.dockBottom < mobile.firstWidgetTop, 'Mobile dock overlaps first widget')
  assert(mobile.magicParticleCanvasCount === 1, 'Mobile magic particles are missing')
  assert(mobile.magicParticleMetrics.litSamples > 0, 'Mobile magic particles are blank')
  assert(
    mobile.magicParticleMetrics.brightSamples > 240,
    'Mobile magic particles are too faint',
  )
  assert(
    mobile.magicParticleMetrics.maxChannel >= 110,
    'Mobile magic particles do not reach a visible brightness',
  )

  await browser.close()
  console.log(JSON.stringify({ status: 'ok', initial, mobile }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

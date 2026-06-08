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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  const initial = await page.evaluate(() => ({
    title: document.title,
    videoSrc:
      document.querySelector('video.background-media source')?.getAttribute('src') ||
      '',
    spotifySrc:
      document
        .querySelector('iframe[title="Spotify Quran playlist"]')
        ?.getAttribute('src') || '',
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
    spotifyForms: document.querySelectorAll('.widget-frame-spotify .url-form').length,
    particleCount: document.querySelectorAll('.background-light-particles span').length,
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
    initial.spotifySrc.includes('37i9dQZF1DZ06evO2QBzaO'),
    'Spotify default playlist mismatch',
  )
  assert(
    initial.youtubeSrc.includes('z23pnK_-0og'),
    'YouTube default video mismatch',
  )
  assert(
    initial.youtubeOverlay.includes('Load YouTube'),
    'YouTube neutral overlay missing',
  )
  assert(initial.brandLockup === '', 'Top-left brand block is still present')
  assert(initial.chatWidgetCount === 0, 'ChatGPT widget should be removed')
  assert(initial.settingsButtonCount === 1, 'Settings trigger missing')
  assert(initial.streakText.includes('day streak'), 'Streak flame missing')
  assert(initial.bestRunText.includes('best continuous'), 'Best run star missing')
  assert(initial.totalStarsText.includes('total stars'), 'Total star counter missing')
  assert(initial.chainText.includes('continuous'), 'Pomodoro star chain missing')
  assert(initial.spotifyForms === 0, 'Spotify widget still has block controls')
  assert(initial.particleCount === 0, 'Light particles should be removed')
  assert(!initial.spotifyTodoOverlap, 'Spotify and Todo widgets overlap')
  assert(initial.visibleWidgets === 5, 'Expected five widgets to be visible')
  assert(initial.ankiWidgetCount === 0, 'Anki widget should be removed')
  assert(!/anki|ankiconnect|anki-connect/i.test(initial.text), 'Anki copy should be removed')
  assert(
    !/lofi|twitch|music station|lofi girl|chatgpt/i.test(initial.text),
    'Forbidden lofi/twitch/chatgpt copy found',
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

  await page.locator('.youtube-overlay').click()
  assert(
    (await page.locator('.youtube-overlay').count()) === 0,
    'YouTube overlay did not reveal player',
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
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const builtInUploadState = await page.evaluate(() => ({
    rowText: document.querySelector('.background-list')?.textContent || '',
  }))
  assert(builtInUploadState.rowText.includes('Japan'), 'Special local background was not renamed')
  assert(
    builtInUploadState.rowText.includes('Japanbuilt-in'),
    'Special local background was not marked built-in',
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const mobile = await page.evaluate(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    dockBottom: document.querySelector('.dock')?.getBoundingClientRect().bottom || 0,
    firstWidgetTop:
      document.querySelector('.widget-frame')?.getBoundingClientRect().top || 0,
  }))
  assert(mobile.noHorizontalOverflow, 'Mobile layout has horizontal overflow')
  assert(mobile.dockBottom < mobile.firstWidgetTop, 'Mobile dock overlaps first widget')

  await browser.close()
  console.log(JSON.stringify({ status: 'ok', initial, mobile }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

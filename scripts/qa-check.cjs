const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')

const baseUrl = process.env.QA_URL || 'http://127.0.0.1:5174/'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const youtubeProviderPattern =
  /^https:\/\/(pipedapi\.kavin\.rocks|pipedapi\.leptons\.xyz|pipedapi\.adminforge\.de|api\.piped\.private\.coffee|pipedapi\.darkness\.services|inv\.nadeko\.net|iv\.ggtyler\.dev|invidious\.nerdvpn\.de|inv\.us\.projectsegfau\.lt)\//

const mockPlaylistVideos = [
  {
    id: 'aaaaaaaaaaa',
    title: 'Mock first video',
    duration: 61,
    uploader: 'Mock teacher A',
  },
  {
    id: 'bbbbbbbbbbb',
    title: 'Mock second video',
    duration: 122,
    uploader: 'Mock teacher B',
  },
]

function fakeYoutubeApiScript(videoIds = mockPlaylistVideos.map((video) => video.id)) {
  return `
    (() => {
      const playlistIds = ${JSON.stringify(videoIds)};

      class FakePlayer {
        constructor(element, options) {
          this.element = element;
          this.options = options;
          this.index = 0;
          this.playlist = [...playlistIds];
          this.iframe =
            element.tagName === 'IFRAME' ? element : document.createElement('iframe');
          this.iframe.setAttribute('title', 'Fake YouTube player');

          if (this.iframe !== this.element) {
            this.element.appendChild(this.iframe);
          }

          window.__ytPlayVideoAtCalls = window.__ytPlayVideoAtCalls || [];
          window.__ytCuePlaylistOptions = window.__ytCuePlaylistOptions || [];
          window.__ytCueVideoByIdCalls = window.__ytCueVideoByIdCalls || [];
          window.setTimeout(() => this.options.events?.onReady?.({ target: this }), 0);
        }

        emit(data) {
          this.options.events?.onStateChange?.({ target: this, data });
        }

        cuePlaylist(options) {
          this.playlist = [...playlistIds];
          this.index = Number(options.index || 0);
          window.__ytCuePlaylistOptions.push({
            index: this.index,
            list: options.list,
            listType: options.listType,
          });
          this.emit(5);
        }

        cueVideoById(videoId) {
          this.playlist = [videoId];
          this.index = 0;
          window.__ytCueVideoByIdCalls.push(videoId);
          this.emit(5);
        }

        destroy() {
          this.iframe?.remove();
        }

        getIframe() {
          return this.iframe;
        }

        getPlayerState() {
          return 5;
        }

        getPlaylist() {
          return this.playlist;
        }

        getPlaylistIndex() {
          return this.index;
        }

        nextVideo() {
          this.playVideoAt(Math.min(this.index + 1, this.playlist.length - 1));
        }

        pauseVideo() {
          this.emit(2);
        }

        playVideo() {
          this.emit(1);
        }

        playVideoAt(index) {
          this.index = Math.max(0, Math.min(Number(index), this.playlist.length - 1));
          window.__ytPlayVideoAtCalls.push(this.index);
          this.emit(1);
        }

        previousVideo() {
          this.playVideoAt(Math.max(this.index - 1, 0));
        }
      }

      window.YT = { Player: FakePlayer };
      window.onYouTubeIframeAPIReady?.();
    })();
  `
}

function pipedPlaylistPayload({ videos = mockPlaylistVideos, nextpage = 'page-2' } = {}) {
  return {
    name: 'Mock Quran playlist',
    nextpage,
    relatedStreams: videos.map((video) => ({
      duration: video.duration,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`,
      title: video.title,
      uploaderName: video.uploader,
      url: `/watch?v=${video.id}`,
    })),
    uploader: 'Mock channel',
  }
}

function videoIdFromOembedRequest(requestUrl) {
  try {
    const parsed = new URL(requestUrl)
    const videoUrl = new URL(parsed.searchParams.get('url') || '')

    return videoUrl.searchParams.get('v') || ''
  } catch {
    return ''
  }
}

async function routeYoutubeOembed(context, titlesById) {
  await context.route('https://www.youtube.com/oembed**', (route) => {
    const videoId = videoIdFromOembedRequest(route.request().url())
    const title = titlesById[videoId]

    if (!title) {
      route.fulfill({
        body: '',
        status: 404,
      })
      return
    }

    route.fulfill({
      body: JSON.stringify({
        author_name: `Author ${videoId}`,
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        title,
      }),
      contentType: 'application/json',
    })
  })
}

async function routeNoembedJsonp(context, titlesById, { failJson = false } = {}) {
  await context.route('https://noembed.com/embed**', (route) => {
    const requestUrl = route.request().url()
    const parsed = new URL(requestUrl)
    const videoId = videoIdFromOembedRequest(requestUrl)
    const title = titlesById[videoId]
    const callback = parsed.searchParams.get('callback')

    if (!callback && failJson) {
      route.fulfill({
        body: '',
        status: 503,
      })
      return
    }

    if (!title) {
      route.fulfill({
        body: '',
        status: 404,
      })
      return
    }

    const payload = {
      author_name: `Author ${videoId}`,
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      title,
    }

    route.fulfill({
      body: callback
        ? `/**/ ${callback}(${JSON.stringify(payload)});`
        : JSON.stringify(payload),
      contentType: callback ? 'application/javascript' : 'application/json',
    })
  })
}

async function routeFakeYoutubeApi(context, videoIds) {
  await context.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({
      body: fakeYoutubeApiScript(videoIds),
      contentType: 'application/javascript',
    }),
  )
}

async function runYoutubePlaylistQa(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })

  await context.addInitScript(() => {
    localStorage.setItem(
      'muslim-study-place:youtube:url',
      JSON.stringify('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PLmockdefault'),
    )
  })
  await routeFakeYoutubeApi(context, [
    'aaaaaaaaaaa',
    'bbbbbbbbbbb',
    'ccccccccccc',
  ])
  await context.route('https://pipedapi.kavin.rocks/playlists/**', (route) =>
    route.fulfill({
      body: JSON.stringify(
        pipedPlaylistPayload({
          videos: [mockPlaylistVideos[1], mockPlaylistVideos[0]],
        }),
      ),
      contentType: 'application/json',
    }),
  )
  await context.route('https://pipedapi.kavin.rocks/nextpage/playlists/**', (route) =>
    route.fulfill({
      body: JSON.stringify(
        pipedPlaylistPayload({
          nextpage: '',
          videos: [
            {
              duration: 183,
              id: 'ccccccccccc',
              title: 'Mock third video',
              uploader: 'Mock teacher C',
            },
          ],
        }),
      ),
      contentType: 'application/json',
    }),
  )

  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.youtube-widget[data-youtube-kind="playlist"][data-player-ready="true"]')
  await page.waitForSelector('.youtube-playlist-item')
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll('.youtube-playlist-copy strong')]
      .map((item) => item.textContent?.trim())

    return titles[0] === 'Mock first video' && titles[1] === 'Mock second video'
  })

  assert(await page.getByText('Mock second video').isVisible(), 'Playlist metadata did not render video titles')
  await page.getByRole('button', { name: 'Lire la video 2 : Mock second video' }).click()
  await page.waitForFunction(() => window.__ytPlayVideoAtCalls?.includes(1))
  assert(
    await page.locator('.youtube-playlist-item[data-active="true"]').getByText('Mock second video').isVisible(),
    'Clicking a playlist row did not update the active video',
  )

  await page.getByRole('button', { name: 'Charger plus' }).click()
  await page.getByText('Mock third video').waitFor({ state: 'visible' })
  assert(await page.getByText('Mock third video').isVisible(), 'Playlist pagination did not append videos')

  await page.getByLabel('Ordre de la playlist').selectOption('desc')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.youtube-playlist-item .youtube-playlist-copy strong')
        ?.textContent?.trim() === 'Mock third video',
  )
  await page.getByRole('button', { name: 'Lire la video 3 : Mock third video' }).click()
  await page.waitForFunction(() => window.__ytPlayVideoAtCalls?.includes(2))
  assert(
    await page.locator('.youtube-playlist-item[data-active="true"]').getByText('Mock third video').isVisible(),
    'Descending playlist order did not keep clicks mapped to the original YouTube index',
  )

  await page.getByLabel('Ordre de la playlist').selectOption('asc')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.youtube-playlist-item .youtube-playlist-copy strong')
        ?.textContent?.trim() === 'Mock first video',
  )

  await page.locator('input[name="youtube-url"]').fill('https://www.youtube.com/watch?v=bbbbbbbbbbb&list=PLmockqa123')
  await page.locator('.youtube-player-column .url-form button').click()
  await page.waitForFunction(
    () => document.querySelector('.youtube-widget')?.getAttribute('data-youtube-playlist-id') === 'PLmockqa123',
  )
  await page.waitForFunction(() =>
    window.__ytCuePlaylistOptions?.some((item) => item.list === 'PLmockqa123' && item.index === 1),
  )
  assert(
    await page.locator('.youtube-playlist-item[data-active="true"]').getByText('Mock second video').isVisible(),
    'watch?v=...&list=... did not select the requested playlist video',
  )

  await page.locator('input[name="youtube-url"]').fill('https://www.youtube.com/watch?v=ddddddddddd')
  await page.locator('.youtube-player-column .url-form button').click()
  await page.waitForFunction(() => document.querySelector('.youtube-widget')?.getAttribute('data-youtube-kind') === 'video')
  await page.waitForFunction(() => window.__ytCueVideoByIdCalls?.includes('ddddddddddd'))
  assert(await page.locator('.youtube-playlist-panel').count() === 0, 'A single video URL should not show the playlist panel')

  await context.close()
}

async function runYoutubeFallbackQa(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })

  await routeFakeYoutubeApi(context, ['fallbackaaa', 'fallbackbbb'])
  await routeYoutubeOembed(context, {
    fallbackaaa: 'Fallback first real title',
    fallbackbbb: 'Fallback second real title',
  })
  await context.route(youtubeProviderPattern, (route) =>
    route.fulfill({
      body: '',
      status: 502,
    }),
  )

  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.youtube-widget[data-youtube-kind="playlist"][data-player-ready="true"]')
  await page.waitForFunction(() => document.querySelectorAll('.youtube-playlist-item').length >= 2)
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.youtube-playlist-copy strong')]
      .some((item) => item.textContent?.trim() === 'Fallback second real title'),
  )

  assert(await page.getByText('Fallback second real title').isVisible(), 'IFrame fallback did not load real video titles')
  assert(
    await page.locator('.youtube-playlist-panel .youtube-error').count() === 0,
    'A playable partial playlist should not render a red metadata warning',
  )
  await page.getByRole('button', { name: 'Lire la video 2 : Fallback second real title' }).click()
  await page.waitForFunction(() => window.__ytPlayVideoAtCalls?.includes(1))

  await context.close()
}

async function runYoutubeGeneratedTitleFallbackQa(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })

  await routeFakeYoutubeApi(context, ['provideraa1', 'providerbb2'])
  await context.route('https://pipedapi.kavin.rocks/playlists/**', (route) =>
    route.fulfill({
      body: JSON.stringify({
        name: 'Generated title playlist',
        nextpage: '',
        relatedStreams: [
          {
            duration: 74,
            thumbnail: 'https://i.ytimg.com/vi/provideraa1/mqdefault.jpg',
            title: 'Video 1',
            uploaderName: 'Provider real title one',
            url: '/watch?v=provideraa1',
          },
          {
            duration: 88,
            thumbnail: 'https://i.ytimg.com/vi/providerbb2/mqdefault.jpg',
            title: 'Video 2',
            uploaderName: 'Provider real title two',
            url: '/watch?v=providerbb2',
          },
        ],
        uploader: 'Mock channel',
      }),
      contentType: 'application/json',
    }),
  )
  await context.route('https://www.youtube.com/oembed**', (route) =>
    route.fulfill({
      body: '',
      status: 503,
    }),
  )
  await context.route('https://noembed.com/embed**', (route) =>
    route.fulfill({
      body: '',
      status: 503,
    }),
  )

  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.youtube-widget[data-youtube-kind="playlist"][data-player-ready="true"]')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.youtube-playlist-item .youtube-playlist-copy strong')
        ?.textContent?.trim() === 'Titre en cours',
  )

  assert(await page.getByText('Provider real title two').isVisible(), 'Provider label should remain visible as secondary metadata')
  assert(
    await page.locator('.youtube-playlist-copy strong').filter({ hasText: 'Provider real title' }).count() === 0,
    'Provider label should not replace a missing YouTube title',
  )
  await page.getByRole('button', { name: 'Lire la video 2 : Titre en cours' }).click()
  await page.waitForFunction(() => window.__ytPlayVideoAtCalls?.includes(1))

  await context.close()
}

async function runYoutubeTitleDowngradeQa(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })

  await routeFakeYoutubeApi(context, ['stableaa001', 'stablebb002'])
  await routeYoutubeOembed(context, {
    stableaa001: 'Stable first real title',
    stablebb002: 'Stable second real title',
  })
  await context.route('https://pipedapi.kavin.rocks/playlists/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1600))
    route.fulfill({
      body: JSON.stringify({
        name: 'Delayed weak metadata playlist',
        nextpage: '',
        relatedStreams: [
          {
            duration: 74,
            thumbnail: 'https://i.ytimg.com/vi/stableaa001/mqdefault.jpg',
            title: 'Video 1',
            uploaderName: 'Weak provider title one',
            url: '/watch?v=stableaa001',
          },
          {
            duration: 88,
            thumbnail: 'https://i.ytimg.com/vi/stablebb002/mqdefault.jpg',
            title: 'Video 2',
            uploaderName: 'Weak provider title two',
            url: '/watch?v=stablebb002',
          },
        ],
        uploader: 'Mock channel',
      }),
      contentType: 'application/json',
    })
  })
  await context.route('https://noembed.com/embed**', (route) =>
    route.fulfill({
      body: '',
      status: 503,
    }),
  )

  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.youtube-widget[data-youtube-kind="playlist"][data-player-ready="true"]')
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.youtube-playlist-copy strong')]
      .some((item) => item.textContent?.trim() === 'Stable first real title'),
  )
  await page.waitForTimeout(2400)

  assert(await page.getByText('Stable first real title').isVisible(), 'A real oEmbed title was downgraded after weak provider metadata arrived')
  assert(
    await page.locator('.youtube-playlist-copy strong').filter({ hasText: 'Weak provider title one' }).count() === 0,
    'Weak provider metadata replaced a stable real title',
  )
  await page.getByRole('button', { name: 'Lire la video 2 : Stable second real title' }).click()
  await page.waitForFunction(() => window.__ytPlayVideoAtCalls?.includes(1))

  await context.close()
}

async function runYoutubeJsonpFallbackQa(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })

  await routeFakeYoutubeApi(context, ['jsonptitle1', 'jsonptitle2'])
  await context.route('https://www.youtube.com/oembed**', (route) =>
    route.fulfill({
      body: '',
      status: 503,
    }),
  )
  await routeNoembedJsonp(context, {
    jsonptitle1: 'JSONP first real title',
    jsonptitle2: 'JSONP second real title',
  }, { failJson: true })
  await context.route(youtubeProviderPattern, (route) =>
    route.fulfill({
      body: '',
      status: 502,
    }),
  )

  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.youtube-widget[data-youtube-kind="playlist"][data-player-ready="true"]')
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.youtube-playlist-copy strong')]
      .some((item) => item.textContent?.trim() === 'JSONP second real title'),
  )

  assert(await page.getByText('JSONP second real title').isVisible(), 'JSONP fallback did not load real video titles')
  await page.getByRole('button', { name: 'Lire la video 2 : JSONP second real title' }).click()
  await page.waitForFunction(() => window.__ytPlayVideoAtCalls?.includes(1))

  await context.close()
}

async function runYoutubeNoApiIframeQa(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })

  await context.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({
      body: '',
      status: 503,
    }),
  )
  await context.route('https://pipedapi.kavin.rocks/playlists/**', (route) =>
    route.fulfill({
      body: JSON.stringify(pipedPlaylistPayload({ nextpage: '' })),
      contentType: 'application/json',
    }),
  )

  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.youtube-embed[src*="youtube.com/embed"]')
  await page.waitForSelector('.youtube-playlist-item')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.youtube-embed')
        ?.getAttribute('src')
        ?.includes('youtube.com/embed/'),
  )

  assert(
    await page.evaluate(
      () => !document.querySelector('.youtube-player-column .youtube-error'),
    ),
    'Missing YouTube API should not leave the player in a visible error state',
  )
  assert(
    await page.evaluate(
      () =>
        document.querySelector('.youtube-widget')?.getAttribute('data-player-ready') ===
        'false',
    ),
    'No-API scenario should keep API readiness false',
  )

  await page.getByRole('button', { name: 'Lire la video 2 : Mock second video' }).click()
  await page.waitForFunction(() => {
    const src = document.querySelector('.youtube-embed')?.getAttribute('src')

    if (!src) {
      return false
    }

    return new URL(src).searchParams.get('index') === '1'
  })
  await page.waitForFunction(() =>
    document
      .querySelector('.youtube-embed')
      ?.getAttribute('src')
      ?.includes('autoplay=1'),
  )
  assert(
    await page.locator('.youtube-playlist-item[data-active="true"]').getByText('Mock second video').isVisible(),
    'No-API playlist click did not update the active row',
  )

  await context.close()
}

async function waitForDurableKey(page, key, text) {
  await page.waitForFunction(
    async ({ durableKey, requiredText }) => {
      const records = await new Promise((resolve) => {
        const request = indexedDB.open('muslim-study-place', 2)

        request.onerror = () => resolve([])
        request.onsuccess = () => {
          const db = request.result

          if (!db.objectStoreNames.contains('durableState')) {
            db.close()
            resolve([])
            return
          }

          const tx = db.transaction('durableState', 'readonly')
          const storeRequest = tx.objectStore('durableState').getAll()
          storeRequest.onerror = () => resolve([])
          storeRequest.onsuccess = () => {
            resolve(storeRequest.result)
          }
          tx.oncomplete = () => db.close()
        }
      })
      const record = records.find((item) => item.key === durableKey)

      return Boolean(record && JSON.stringify(record.value).includes(requiredText))
    },
    { durableKey: key, requiredText: text },
    { timeout: 10000 },
  )
}

async function addTask(page, text, priority, difficulty = 'normal') {
  const todoForm = page.locator('.todo-form')

  await todoForm.locator('input[aria-label="Add task"]').fill(text)
  await todoForm.locator('.todo-priority-select select').selectOption(priority)
  await todoForm.locator('.todo-difficulty-select select').selectOption(difficulty)
  await todoForm.getByRole('button', { name: 'Add task' }).click()
}

async function visibleOpenTaskText(page) {
  return page.locator('.todo-row:not(.todo-group-row) .todo-title-line > span').allTextContents()
}

async function assertFirstOpenTask(page, expectedText, message) {
  const firstTodoText = await page.locator('.todo-row:not(.todo-group-row)').first().textContent()

  assert(firstTodoText && firstTodoText.includes(expectedText), message)
}

async function main() {
  const browser = await chromium.launch()
  const backgroundManifestPath = path.join(__dirname, '..', 'public', 'backgrounds', 'manifest.json')
  const backgroundManifest = JSON.parse(fs.readFileSync(backgroundManifestPath, 'utf8'))

  await runYoutubePlaylistQa(browser)
  await runYoutubeFallbackQa(browser)
  await runYoutubeGeneratedTitleFallbackQa(browser)
  await runYoutubeTitleDowngradeQa(browser)
  await runYoutubeJsonpFallbackQa(browser)
  await runYoutubeNoApiIframeQa(browser)

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 720 },
  })

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
  await page.waitForSelector('.widget-frame')
  await page.waitForTimeout(800)

  const initial = await page.evaluate(() => ({
    title: document.title,
    lang: document.documentElement.lang,
    visibleWidgets: document.querySelectorAll('.widget-frame').length,
    dockButtons: document.querySelectorAll('.dock-button').length,
    noteFrames: document.querySelectorAll('.widget-frame-notes, .notes-widget').length,
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    topbarText: document.querySelector('.topbar-actions')?.textContent || '',
    privacy: document.querySelector('.privacy-chip')?.textContent || '',
    memoryStore: Boolean(indexedDB),
  }))

  assert(initial.title === 'Muslim Study Place', 'Document title mismatch')
  assert(initial.lang === 'fr', 'French should be the default interface language')
  assert(initial.visibleWidgets === 4, 'Expected four widgets on the dashboard')
  assert(initial.dockButtons === 4, 'Expected four dock buttons')
  assert(initial.noteFrames === 0, 'Notes widget should not render')
  assert(initial.noHorizontalOverflow, 'Desktop layout has horizontal overflow')
  assert(initial.privacy.includes('Local'), 'Local privacy chip missing')
  assert(initial.memoryStore, 'IndexedDB should be available for durable memory')
  assert(backgroundManifest.length === 53, 'Expected 53 image entries in the background manifest')
  for (const backgroundId of [
    'oasis',
    'night-cosy',
    'bg-01-vallee-printaniere',
    'bg-25-foret-bambous',
    'bg-50-foret-pluie-automne',
  ]) {
    assert(
      backgroundManifest.some((entry) => entry.id === backgroundId),
      `Missing ${backgroundId} in background manifest`,
    )
  }
  assert(
    await page.locator('.background-layer video.background-media').count() === 1,
    'Train video background should be active by default',
  )

  await page.locator('.settings-trigger').click()
  assert(await page.getByRole('heading', { name: 'Parametres' }).isVisible(), 'French settings title missing')
  assert(await page.getByText('Memoire locale').isVisible(), 'Memory settings section missing')
  assert(await page.getByLabel('Notes').count() === 0, 'Notes should not appear in settings or dock')
  await page.getByLabel('Langue de l interface').selectOption('en')
  await page.waitForFunction(() => document.documentElement.lang === 'en')
  assert(await page.getByRole('heading', { name: 'Settings' }).isVisible(), 'English settings title missing after language switch')
  await page.getByLabel('Close settings').click()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  assert(
    await page.evaluate(() => document.documentElement.lang === 'en'),
    'Language did not persist after reload',
  )
  assert(
    await page.locator('.backgrounds-widget .background-row').count() === 54,
    'Expected 54 built-in background rows including Train',
  )
  const backgroundLabels = await page
    .locator('.backgrounds-widget .background-row > button span')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() || ''))
  assert(
    JSON.stringify(backgroundLabels.slice(0, 7)) ===
      JSON.stringify([
        'Train',
        'Oasis',
        'Japan',
        'Night Cosy',
        'Vallee printaniere',
        "Foret d'automne",
        'Village enneige',
      ]),
    'Background order did not keep Train, legacy images, then the generated collection',
  )
  await page
    .locator('.backgrounds-widget .background-row > button')
    .filter({ hasText: 'Lac rose' })
    .first()
    .click()
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('muslim-study-place:selectedBackground') || 'null') ===
      'bg-49-lac-rose',
  )
  const selectedBackgroundSrc = await page
    .locator('.background-layer img.background-media')
    .getAttribute('src')
  assert(
    selectedBackgroundSrc && selectedBackgroundSrc.includes('bg-49-lac-rose.webp'),
    'Selecting a generated background did not update the background layer image',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  assert(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('muslim-study-place:selectedBackground') || 'null') ===
        'bg-49-lac-rose',
    ),
    'Selected generated background did not persist after reload',
  )
  assert(
    await page
      .locator('.backgrounds-widget .background-row.is-selected > button span')
      .first()
      .textContent() === 'Lac rose',
    'Selected background row did not stay highlighted after reload',
  )
  assert(await page.locator('.pomodoro-cycle .cycle-step').count() === 3, 'Pomodoro cycle steps missing')
  assert(await page.locator('.pomodoro-cycle button').count() === 0, 'Pomodoro modes should not be manually switchable')
  assert(await page.locator('.timer-ring-progress').count() === 1, 'Circular pomodoro progress ring missing')
  assert(await page.locator('.pomodoro-widget').getByRole('button', { name: 'Free pomodoro' }).isVisible(), 'Free pomodoro button missing')

  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:todos', '[]')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)

  await addTask(page, 'Alpha manual', 'low', 'easy')
  await addTask(page, 'Beta manual', 'high', 'intense')
  await addTask(page, 'Gamma manual', 'medium', 'hard')
  await waitForDurableKey(page, 'todos', 'Gamma manual')
  assert(await page.getByText('Not started').first().isVisible(), 'Fresh tasks should show Not started')
  assert(
    await page
      .locator('.todo-row:not(.todo-group-row)')
      .filter({ hasText: 'Beta manual' })
      .locator('.difficulty-pill')
      .getByText('Intense')
      .isVisible(),
    'Difficulty badge did not render',
  )

  const sortOptions = await page.getByLabel('Sort tasks').locator('option').evaluateAll((options) =>
    options.map((option) => option.value),
  )
  for (const expectedSort of ['priority', 'difficulty', 'status', 'progress-desc', 'target-desc']) {
    assert(sortOptions.includes(expectedSort), `Missing ${expectedSort} sort option`)
  }

  await page.getByLabel('Search').fill('beta')
  let rows = await visibleOpenTaskText(page)
  assert(rows.length === 1 && rows[0].includes('Beta manual'), 'Search by name did not filter tasks')
  await page.getByLabel('Search').fill('')

  await page.getByLabel('Sort tasks').selectOption('name-asc')
  rows = await visibleOpenTaskText(page)
  assert(rows[0].includes('Alpha manual') && rows[2].includes('Gamma manual'), 'Name A-Z sort failed')

  await page.getByLabel('Sort tasks').selectOption('name-desc')
  rows = await visibleOpenTaskText(page)
  assert(rows[0].includes('Gamma manual') && rows[2].includes('Alpha manual'), 'Name Z-A sort failed')

  await page.getByLabel('Sort tasks').selectOption('created-asc')
  await assertFirstOpenTask(page, 'Alpha manual', 'Oldest-added sort failed')

  await page.getByLabel('Sort tasks').selectOption('created-desc')
  await assertFirstOpenTask(page, 'Gamma manual', 'Newest-added sort failed')

  await page.getByLabel('Sort tasks').selectOption('priority')
  await assertFirstOpenTask(page, 'Beta manual', 'Priority sort failed')

  await page.getByLabel('Sort tasks').selectOption('difficulty')
  await assertFirstOpenTask(page, 'Beta manual', 'Difficulty sort failed')

  await page.getByLabel('Sort tasks').selectOption('manual')
  const alphaHandle = page.getByRole('button', { name: 'Move Alpha manual' })
  const gammaRow = page.locator('.todo-row:not(.todo-group-row)').filter({ hasText: 'Gamma manual' }).first()
  await alphaHandle.dragTo(gammaRow)
  await assertFirstOpenTask(page, 'Alpha manual', 'Drag-and-drop did not move Alpha to the top')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await assertFirstOpenTask(page, 'Alpha manual', 'Manual rank did not persist after reload')

  const alphaRow = page.locator('.todo-row:not(.todo-group-row)').filter({ hasText: 'Alpha manual' }).first()
  await alphaRow.getByLabel('Toggle Alpha manual').click()
  await page.getByRole('button', { name: 'Done' }).click()
  const alphaDoneGroup = page.locator('.todo-group-row').filter({ hasText: 'Alpha manual' }).first()
  assert(await alphaDoneGroup.isVisible(), 'Completed Alpha group is missing')
  assert(await alphaDoneGroup.getByText('1 done').isVisible(), 'Initial completed group count is wrong')
  await alphaDoneGroup.getByLabel('Redo Alpha manual').click()
  const pendingRedoButton = alphaDoneGroup.getByLabel('A redo of Alpha manual is already open')
  assert(await pendingRedoButton.isDisabled(), 'Completed group should block duplicate redo while a redo is open')
  assert(await alphaDoneGroup.getByText('Redo open').isVisible(), 'Completed group should show the open redo state')
  await page.getByRole('button', { name: 'To do' }).click()
  assert(await page.getByText('Run 1').isVisible(), 'Redo occurrence should keep repeat history visible')
  assert(
    await page.locator('.todo-row:not(.todo-group-row)').filter({ hasText: 'Alpha manual' }).count() === 1,
    'Duplicate redo should not create multiple open tasks for the same completed group',
  )
  const alphaRedoRow = page.locator('.todo-row:not(.todo-group-row)').filter({ hasText: 'Alpha manual' }).first()
  assert(await alphaRedoRow.getByText('Not started').isVisible(), 'Unstarted redo task should show Not started')
  await alphaRedoRow.getByLabel('Resume Alpha manual timer').click()
  assert(await alphaRedoRow.getByText('In progress').isVisible(), 'Started redo task should show In progress')
  await alphaRedoRow.getByLabel('Toggle Alpha manual').click()
  await page.getByRole('button', { name: 'Done' }).click()
  const alphaGroups = page.locator('.todo-group-row').filter({ hasText: 'Alpha manual' })
  assert(await alphaGroups.count() === 1, 'Redo completion should stack into one completed group')
  assert(await alphaGroups.first().getByText('2 done').isVisible(), 'Stacked completed group count is wrong')
  assert(
    await alphaGroups.first().locator('.todo-stack-illustration.is-stacked').isVisible(),
    'Stacked completed group is missing the pile illustration',
  )
  await alphaGroups.first().getByLabel('Show runs').click()
  assert(await alphaGroups.first().getByText('Run 1').isVisible(), 'Expanded completed group is missing redo history')

  await waitForDurableKey(page, 'todos', 'Alpha manual')
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  assert(
    await page.evaluate(() => document.documentElement.lang === 'en'),
    'Language did not restore from durable memory',
  )
  assert(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('muslim-study-place:selectedBackground') || 'null') ===
        'bg-49-lac-rose',
    ),
    'Selected background did not restore from durable memory',
  )
  await page.getByRole('button', { name: 'Done' }).click()
  assert(await page.getByText('Alpha manual').first().isVisible(), 'Task did not restore from durable memory')

  await page.locator('.settings-trigger').click()
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export data' }).click(),
  ]).then(([item]) => item)
  const exportPath = path.join(os.tmpdir(), `msp-backup-${Date.now()}.json`)
  await download.saveAs(exportPath)
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'))
  assert(exported.app === 'muslim-study-place', 'Exported backup has wrong app id')
  assert(!Object.keys(exported.values).some((key) => key.startsWith('notes')), 'Export should not include notes keys')
  exported.values.todos = [
    ...(Array.isArray(exported.values.todos) ? exported.values.todos : []),
    {
      id: `qa-import-${Date.now()}`,
      text: 'Imported QA task',
      priority: 'medium',
      rank: -100,
      completed: false,
      active: false,
      requiredPomodoros: 1,
      completedPomodoros: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      repeatIndex: 0,
    },
  ]
  const importPath = path.join(os.tmpdir(), `msp-import-${Date.now()}.json`)
  fs.writeFileSync(importPath, JSON.stringify(exported), 'utf8')
  await page.setInputFiles('.import-action input[type="file"]', importPath)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)
  assert(await page.getByText('Imported QA task').isVisible(), 'Imported backup did not reload todos')

  await page.evaluate(() => {
    localStorage.setItem(
      'muslim-study-place:todos',
      JSON.stringify([
        {
          id: 'qa-sync-target',
          text: 'Sync target task',
          priority: 'medium',
          rank: 1,
          completed: false,
          active: true,
          requiredPomodoros: 2,
          completedPomodoros: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          repeatIndex: 0,
        },
      ]),
    )
    localStorage.setItem(
      'muslim-study-place:taskPomodoroMemory',
      JSON.stringify({
        'qa-sync-target': {
          mode: 'focus',
          remaining: 60,
          targetPomodoros: 1,
          completedInTarget: 0,
          currentRun: 0,
        },
      }),
    )
    localStorage.setItem('muslim-study-place:timer:remaining', '60')
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
        autoCycle: false,
      }),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const syncedTarget = await page
    .locator('.pomodoro-objective-panel .goal-stepper strong')
    .textContent()
  assert(syncedTarget?.trim() === '2', 'Active task target did not sync into Pomodoro')
  assert(await page.getByText('Current: Sync target task').isVisible(), 'Synced task is not active in Pomodoro')
  assert(await page.getByText('0/2 continuous').isVisible(), 'Pomodoro chain did not reflect the active task target')
  await page.waitForFunction(() => {
    const memory = JSON.parse(
      localStorage.getItem('muslim-study-place:taskPomodoroMemory') || '{}',
    )

    return memory['qa-sync-target']?.targetPomodoros === 2
  })
  await page
    .locator('.pomodoro-objective-panel')
    .getByRole('button', { name: 'Increase pomodoro chain target' })
    .click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.pomodoro-objective-panel .goal-stepper strong')
        ?.textContent?.trim() === '3',
  )
  assert(await page.getByText('0/3 continuous').isVisible(), 'Pomodoro target increase did not update the chain total')
  assert(
    await page.evaluate(() => {
      const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')

      return todos[0]?.requiredPomodoros === 3
    }),
    'Pomodoro target increase did not sync back to the active task',
  )

  await page.evaluate(() => {
    localStorage.setItem(
      'muslim-study-place:todos',
      JSON.stringify([
        {
          id: 'qa-free-active',
          text: 'Free button source',
          priority: 'medium',
          rank: 1,
          completed: false,
          active: true,
          requiredPomodoros: 2,
          completedPomodoros: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          repeatIndex: 0,
        },
      ]),
    )
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
        autoCycle: false,
      }),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  assert(await page.getByText('Current: Free button source').isVisible(), 'Seed active task missing before free pomodoro')
  await page.locator('.pomodoro-widget').getByRole('button', { name: 'Free pomodoro' }).click()
  await page.waitForFunction(() => {
    const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
    return todos.length === 1 && todos.every((todo) => !todo.active)
  })
  assert(await page.getByText('Free pomodoro, no task').isVisible(), 'Free pomodoro state missing')
  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:timer:remaining', '1')
    localStorage.setItem('muslim-study-place:timer:running', 'false')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.locator('.pomodoro-widget').getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(1800)
  assert(await page.locator('.finished-banner').getByText('Finished!').isVisible(), 'Free pomodoro did not finish')
  assert(
    await page.evaluate(() => {
      const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
      return todos.length === 1 && todos[0].text === 'Free button source' && !todos[0].active
    }),
    'Free pomodoro should preserve existing tasks without activating or creating one',
  )
  const freeFocusState = await page.evaluate(() => ({
    run: localStorage.getItem('muslim-study-place:pomodoroRun') || '',
    streak: localStorage.getItem('muslim-study-place:streak') || '',
  }))
  assert(freeFocusState.run.includes('"totalStars":1'), 'Free pomodoro did not add a star')
  assert(freeFocusState.streak.includes('"todayCount"'), 'Free pomodoro did not record focus activity')

  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:timer:remaining', '42')
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
  await page.locator('.pomodoro-widget').getByRole('button', { name: 'Skip' }).click()
  await page.waitForFunction(
    () => localStorage.getItem('muslim-study-place:timer:mode') === '"focus"',
  )
  assert(await page.getByText('25:00').isVisible(), 'Skipping a break did not return to focus')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const mobile = await page.evaluate(() => ({
    visibleWidgets: document.querySelectorAll('.widget-frame').length,
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    dockBottom: document.querySelector('.dock')?.getBoundingClientRect().bottom || 0,
    firstWidgetTop:
      document.querySelector('.widget-frame')?.getBoundingClientRect().top || 0,
  }))
  assert(mobile.visibleWidgets === 4, 'Expected four widgets on mobile')
  assert(mobile.noHorizontalOverflow, 'Mobile layout has horizontal overflow')
  assert(mobile.dockBottom < mobile.firstWidgetTop, 'Mobile dock overlaps first widget')

  await browser.close()
  console.log(JSON.stringify({ status: 'ok', initial, mobile }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

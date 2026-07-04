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

function dateKeyForOffset(days = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

async function addTask(page, text, priority, difficulty = 'normal') {
  const todoForm = page.locator('.todo-form').first()

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

async function assertFlameStage(
  page,
  today,
  current,
  expectedStage,
  best = current,
) {
  await page.evaluate(
    ({ best, current, today }) => {
      localStorage.setItem(
        'muslim-study-place:streak',
        JSON.stringify({
          current,
          best: Math.max(best, current, 1),
          lastActiveDate: today,
          todayCount: 1,
          dailyGoal: 1,
          history: {
            [today]: {
              date: today,
              count: 1,
              goal: 1,
              checkedIn: true,
              completed: true,
              source: 'check-in',
            },
          },
        }),
      )
      localStorage.setItem(
        'muslim-study-place:flameEvolution',
        JSON.stringify({
          stages: {},
          quests: {},
          selectedEffect: null,
          seenUnlocks: [],
          pendingUnlocks: [],
          revealedHints: {},
        }),
      )
    },
    { best, current, today },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.streak-flame')

  const stage = await page.locator('.streak-flame').getAttribute('data-flame-stage')

  assert(stage === expectedStage, `Expected flame stage ${expectedStage} for streak ${current}, got ${stage}`)
}

function perfectWeekHistory(weeks = 4) {
  const history = {}
  const now = new Date()
  const mondayOffset = (now.getDay() + 6) % 7
  const currentMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - mondayOffset,
  )

  for (let week = 1; week <= weeks; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(currentMonday)
      date.setDate(date.getDate() - week * 7 + day)
      const key = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')

      history[key] = {
        date: key,
        count: day === 0 && week === 1 ? 12 : 2,
        goal: 2,
        checkedIn: true,
        completed: true,
        source: 'activity',
      }
    }
  }

  return history
}

function installSupabaseMock(initialAppState = null) {
  window.__mspSupabaseState = {
    appState: initialAppState,
    readDelayMs: 0,
    readInFlight: false,
    appStateReadCount: 0,
    saveDelayMs: 0,
    saveInFlight: false,
    online: true,
    profiles: [],
    rpcCalls: [],
    session: null,
    streak: {
      current: 0,
      best: 0,
      lastActiveDate: null,
      todayCount: 0,
      dailyGoal: 1,
      history: {},
    },
    subscribers: [],
  }

  const state = window.__mspSupabaseState
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => state.online,
  })
  state.setOnline = (online) => {
    state.online = online
    window.dispatchEvent(new Event(online ? 'online' : 'offline'))
  }
  const user = {
    id: 'qa-user-id',
    email: 'qa@example.com',
    user_metadata: {
      full_name: 'QA Google',
      avatar_url: '',
    },
  }
  const today = () => {
    const date = new Date()
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
  }
  const writeDay = (source) => {
    const key = today()
    state.streak.history[key] = {
      date: key,
      count: state.streak.todayCount,
      goal: state.streak.dailyGoal,
      checkedIn: true,
      completed: state.streak.todayCount >= state.streak.dailyGoal,
      source,
    }
  }
  const checkIn = () => {
    const key = today()

    if (state.streak.lastActiveDate !== key) {
      state.streak.current += 1
      state.streak.best = Math.max(state.streak.best, state.streak.current)
      state.streak.lastActiveDate = key
      state.streak.todayCount = 1
    } else {
      state.streak.todayCount = Math.max(state.streak.todayCount, 1)
    }

    writeDay('check-in')
    return { ...state.streak, history: { ...state.streak.history } }
  }
  const activity = () => {
    if (state.streak.lastActiveDate !== today()) {
      return checkIn()
    }

    state.streak.todayCount += 1
    writeDay('activity')
    return { ...state.streak, history: { ...state.streak.history } }
  }
  const emit = (event) => {
    state.subscribers.forEach((callback) => callback(event, state.session))
  }
  const delay = (milliseconds) =>
    milliseconds > 0
      ? new Promise((resolve) => window.setTimeout(resolve, milliseconds))
      : Promise.resolve()
  state.emitAuth = (event) => emit(event)
  state.advanceRevisionWithoutChanges = () => {
    if (!state.appState) {
      return
    }

    state.appState = {
      ...state.appState,
      revision: state.appState.revision + 1,
      updated_at: new Date().toISOString(),
    }
  }
  const ok = (data = null) => ({ data, error: null })

  window.__MSP_SUPABASE_MOCK__ = {
    auth: {
      getSession: async () => ok({ session: state.session }),
      onAuthStateChange: (callback) => {
        state.subscribers.push(callback)

        return {
          data: {
            subscription: {
              unsubscribe: () => {
                state.subscribers = state.subscribers.filter((item) => item !== callback)
              },
            },
          },
        }
      },
      signInWithOAuth: async () => {
        state.session = { user }
        window.setTimeout(() => emit('SIGNED_IN'), 0)
        return ok({})
      },
      signOut: async () => {
        state.session = null
        emit('SIGNED_OUT')
        return ok({})
      },
    },
    from: (table) => ({
      upsert: async (payload) => {
        if (table === 'profiles') {
          state.profiles.push(payload)
        }

        return ok({})
      },
      select: () => ({
        maybeSingle: async () => {
          if (table === 'user_app_state') {
            state.appStateReadCount += 1
            state.readInFlight = true

            try {
              await delay(state.readDelayMs)
              return ok(state.appState)
            } finally {
              state.readInFlight = false
            }
          }

          return ok(null)
        },
      }),
    }),
    rpc: (name, args = {}) => {
      state.rpcCalls.push({ name, args })

      if (name === 'save_app_state') {
        const save = async () => {
          state.saveInFlight = true

          try {
            await delay(state.saveDelayMs)
            const expected = args.p_expected_revision

            if (
              state.appState &&
              expected !== null &&
              expected !== undefined &&
              state.appState.revision !== expected
            ) {
              return { data: null, error: new Error('revision_conflict') }
            }

            const revision = (state.appState?.revision || 0) + 1
            state.appState = {
              snapshot: args.p_snapshot,
              revision,
              updated_at: new Date().toISOString(),
            }

            return ok(state.appState)
          } finally {
            state.saveInFlight = false
          }
        }

        return { ...ok(null), single: save }
      }

      if (name === 'record_daily_check_in') {
        return ok(checkIn())
      }

      if (name === 'record_streak_activity') {
        return ok(activity())
      }

      if (name === 'set_daily_goal') {
        state.streak.dailyGoal = Math.min(Math.max(Number(args.p_daily_goal) || 1, 1), 12)
        writeDay(state.streak.history[today()]?.source || 'check-in')
        return ok({ ...state.streak, history: { ...state.streak.history } })
      }

      return ok(null)
    },
  }
}

async function runCloudSyncQa(browser) {
  const emptyCloudContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })
  await emptyCloudContext.addInitScript(installSupabaseMock, null)
  await emptyCloudContext.addInitScript(() => {
    localStorage.setItem(
      'muslim-study-place:todos',
      JSON.stringify([
        {
          id: 'qa-cloud-local',
          text: 'Cloud local seed',
          priority: 'medium',
          difficulty: 'normal',
          rank: 1,
          completed: false,
          active: true,
          requiredPomodoros: 1,
          completedPomodoros: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          repeatIndex: 0,
        },
      ]),
    )
    localStorage.setItem(
      'muslim-study-place:flameEvolution',
      JSON.stringify({
        stages: { solar: Date.now() },
        quests: { 'perfect-week': Date.now() },
        selectedEffect: 'seven-lights',
        seenUnlocks: ['stage:solar', 'quest:perfect-week'],
      }),
    )
  })
  const emptyCloudPage = await emptyCloudContext.newPage()
  await emptyCloudPage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await emptyCloudPage.locator('.account-button').click()
  await emptyCloudPage.getByRole('button', { name: 'Se connecter avec Google' }).click()
  await emptyCloudPage.waitForFunction(() => window.__mspSupabaseState?.appState?.revision >= 1)
  await emptyCloudPage.waitForFunction(() =>
    window.__mspSupabaseState?.rpcCalls?.some((call) => call.name === 'record_daily_check_in'),
  )
  assert(
    await emptyCloudPage.evaluate(() => {
      const state = window.__mspSupabaseState
      const todos = state.appState?.snapshot?.values?.todos || []

      return (
        state.profiles.length >= 1 &&
        todos.some((todo) => todo.text === 'Cloud local seed') &&
        state.appState?.snapshot?.values?.flameEvolution?.selectedEffect ===
          'seven-lights' &&
        state.rpcCalls.some((call) => call.name === 'save_app_state') &&
        state.rpcCalls.some((call) => call.name === 'record_daily_check_in') &&
        Boolean(localStorage.getItem('muslim-study-place:cloud:lastSnapshot'))
      )
    }),
    'Empty cloud login should upload local progress, persist its sync base, and run server streak check-in',
  )

  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.saveDelayMs = 500
  })
  const cloudTodoForm = emptyCloudPage.locator('.todo-form')
  await cloudTodoForm.locator('input').fill('Cloud autosync task')
  await cloudTodoForm.locator('.todo-priority-select select').selectOption('medium')
  await cloudTodoForm.locator('.todo-difficulty-select select').selectOption('normal')
  await cloudTodoForm.locator('button[type="submit"]').click()
  await emptyCloudPage.waitForFunction(() => {
    const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')

    return todos.some((todo) => todo.text === 'Cloud autosync task')
  })
  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.emitAuth('SIGNED_IN')
  })
  await emptyCloudPage.waitForFunction(
    () => window.__mspSupabaseState?.saveInFlight === true,
  )
  assert(
    await emptyCloudPage.locator('.account-shell.is-synced').count() === 1 &&
      await emptyCloudPage.locator('.account-shell.is-syncing').count() === 0,
    'Automatic cloud saves should keep the account indicator stable and green',
  )
  await emptyCloudPage.waitForFunction(() => {
    const state = window.__mspSupabaseState
    const todos = state.appState?.snapshot?.values?.todos || []

    return (
      state.appState?.revision >= 2 &&
      todos.some((todo) => todo.text === 'Cloud autosync task')
    )
  })
  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.saveDelayMs = 0
  })
  assert(
    await emptyCloudPage.locator('.account-shell.is-conflict').count() === 0,
    'Repeated signed-in events should not turn a pending local save into a conflict',
  )

  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.advanceRevisionWithoutChanges()
  })
  await cloudTodoForm.locator('input').fill('Cloud rebased task')
  await cloudTodoForm.locator('button[type="submit"]').click()
  await emptyCloudPage.waitForFunction(() => {
    const state = window.__mspSupabaseState
    const todos = state.appState?.snapshot?.values?.todos || []

    return (
      state.appState?.revision >= 4 &&
      todos.some((todo) => todo.text === 'Cloud rebased task')
    )
  })
  assert(
    await emptyCloudPage.locator('.account-shell.is-synced').count() === 1 &&
      await emptyCloudPage.locator('.account-shell.is-conflict').count() === 0,
    'An unchanged remote snapshot with a newer revision should rebase automatically',
  )
  await emptyCloudPage.waitForTimeout(1100)
  const stableCloudRevision = await emptyCloudPage.evaluate(
    () => window.__mspSupabaseState.appState?.revision,
  )
  const focusReadCount = await emptyCloudPage.evaluate(
    () => window.__mspSupabaseState.appStateReadCount,
  )
  await emptyCloudPage.evaluate(() => {
    Array.from({ length: 5 }).forEach(() => {
      window.dispatchEvent(new Event('focus'))
    })
  })
  await emptyCloudPage.waitForFunction(
    (readCount) =>
      window.__mspSupabaseState.appStateReadCount === readCount + 1 &&
      window.__mspSupabaseState.readInFlight === false,
    focusReadCount,
  )
  await emptyCloudPage.evaluate(() => {
    Array.from({ length: 5 }).forEach(() => {
      window.dispatchEvent(new Event('focus'))
    })
  })
  await emptyCloudPage.waitForTimeout(100)
  assert(
    await emptyCloudPage.evaluate(
      ({ revision, readCount }) =>
        window.__mspSupabaseState.appState?.revision === revision &&
        window.__mspSupabaseState.appStateReadCount === readCount + 1,
      { revision: stableCloudRevision, readCount: focusReadCount },
    ),
    'Focus bursts should collapse into one silent read and no cloud revision',
  )
  assert(
    await emptyCloudPage.locator('.account-shell.is-syncing').count() === 0,
    'Focus checks should never display the syncing indicator',
  )

  await emptyCloudPage.evaluate(() => {
    const storageKey = 'muslim-study-place:settings:backgroundDim'
    const current = JSON.parse(localStorage.getItem(storageKey) || '72')
    const next = current === 71 ? 72 : 71

    localStorage.setItem(storageKey, JSON.stringify(next))
    window.dispatchEvent(
      new CustomEvent('msp:durable-storage-change', {
        detail: { key: 'settings:backgroundDim' },
      }),
    )
    window.__mspSupabaseState.saveDelayMs = 500
  })
  if (
    await emptyCloudPage.locator('.account-button').getAttribute('aria-expanded') !==
    'true'
  ) {
    await emptyCloudPage.locator('.account-button').click()
  }
  await emptyCloudPage.getByRole('button', { name: 'Synchroniser' }).click()
  await emptyCloudPage.waitForFunction(
    () => window.__mspSupabaseState?.saveInFlight === true,
  )
  assert(
    await emptyCloudPage.locator('.account-shell.is-syncing').count() === 1,
    'Manual synchronization should display the syncing indicator immediately',
  )
  await emptyCloudPage.waitForFunction(
    () => window.__mspSupabaseState?.saveInFlight === false,
  )
  await emptyCloudPage.locator('.account-shell.is-synced').waitFor()
  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.saveDelayMs = 0
  })

  const ignoredOnlineReadCount = await emptyCloudPage.evaluate(
    () => window.__mspSupabaseState.appStateReadCount,
  )
  await emptyCloudPage.evaluate(() => {
    Array.from({ length: 5 }).forEach(() => {
      window.dispatchEvent(new Event('online'))
    })
  })
  await emptyCloudPage.waitForTimeout(100)
  assert(
    await emptyCloudPage.evaluate(
      (readCount) =>
        window.__mspSupabaseState.appStateReadCount === readCount,
      ignoredOnlineReadCount,
    ),
    'Repeated online events without an offline transition should be ignored',
  )

  const recoveryReadCount = await emptyCloudPage.evaluate(
    () => window.__mspSupabaseState.appStateReadCount,
  )
  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.readDelayMs = 1200
    window.__mspSupabaseState.setOnline(false)
  })
  await emptyCloudPage.locator('.account-shell.is-offline').waitFor()
  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.setOnline(true)
    Array.from({ length: 4 }).forEach(() => {
      window.dispatchEvent(new Event('online'))
    })
  })
  await emptyCloudPage.waitForFunction(
    () => window.__mspSupabaseState?.readInFlight === true,
  )
  await emptyCloudPage.waitForTimeout(850)
  assert(
    await emptyCloudPage.locator('.account-shell.is-syncing').count() === 0 &&
      await emptyCloudPage.locator('.account-shell.is-offline').count() === 1,
    'A slow network recovery should remain silent until it returns directly to green',
  )
  await emptyCloudPage.waitForFunction(
    () => window.__mspSupabaseState?.readInFlight === false,
  )
  await emptyCloudPage.locator('.account-shell.is-synced').waitFor()
  assert(
    await emptyCloudPage.evaluate(
      (readCount) =>
        window.__mspSupabaseState.appStateReadCount === readCount + 1,
      recoveryReadCount,
    ),
    'An offline-to-online burst should perform exactly one recovery read',
  )
  await emptyCloudPage.evaluate(() => {
    window.__mspSupabaseState.readDelayMs = 0
  })

  await emptyCloudPage.clock.install()
  await emptyCloudPage.clock.runFor(1_000)
  await emptyCloudPage.waitForFunction(() => !window.__mspSupabaseState?.saveInFlight)
  const checkpointStartRevision = await emptyCloudPage.evaluate(
    () => window.__mspSupabaseState.appState?.revision,
  )
  await emptyCloudPage.evaluate(() => {
    localStorage.setItem(
      'muslim-study-place:timer:remaining',
      JSON.stringify(1499),
    )
    window.dispatchEvent(
      new CustomEvent('msp:durable-storage-change', {
        detail: { key: 'timer:remaining' },
      }),
    )
  })
  await emptyCloudPage.clock.runFor(29_000)
  assert(
    await emptyCloudPage.evaluate(
      (revision) => window.__mspSupabaseState.appState?.revision === revision,
      checkpointStartRevision,
    ),
    'High-frequency timer changes should not save before the 30-second checkpoint',
  )
  assert(
    await emptyCloudPage.locator('.account-shell.is-syncing').count() === 0,
    'Timer checkpoints should stay visually silent',
  )
  await emptyCloudPage.clock.runFor(1_100)
  await emptyCloudPage.waitForFunction(
    (revision) => window.__mspSupabaseState.appState?.revision > revision,
    checkpointStartRevision,
  )
  assert(
    await emptyCloudPage.evaluate(
      (revision) =>
        window.__mspSupabaseState.appState?.revision === revision + 1 &&
        window.__mspSupabaseState.appState?.snapshot?.values?.[
          'timer:remaining'
        ] === 1499,
      checkpointStartRevision,
    ),
    'High-frequency timer changes should create one current cloud checkpoint after 30 seconds',
  )

  const immediateStartRevision = await emptyCloudPage.evaluate(
    () => window.__mspSupabaseState.appState?.revision,
  )
  await emptyCloudPage.evaluate(() => {
    localStorage.setItem(
      'muslim-study-place:timer:remaining',
      JSON.stringify(1498),
    )
    window.dispatchEvent(
      new CustomEvent('msp:durable-storage-change', {
        detail: { key: 'timer:remaining' },
      }),
    )
    localStorage.setItem('muslim-study-place:timer:running', 'true')
    window.dispatchEvent(
      new CustomEvent('msp:durable-storage-change', {
        detail: { key: 'timer:running' },
      }),
    )
  })
  await emptyCloudPage.clock.runFor(1_000)
  assert(
    await emptyCloudPage.evaluate(
      (revision) => window.__mspSupabaseState.appState?.revision === revision + 1,
      immediateStartRevision,
    ),
    'Starting or pausing the timer should immediately flush its latest second',
  )
  await emptyCloudContext.close()

  const remoteSnapshot = {
    app: 'muslim-study-place',
    version: 1,
    exportedAt: new Date().toISOString(),
    values: {
      todos: [
        {
          id: 'qa-cloud-remote',
          text: 'Remote cloud task',
          priority: 'medium',
          difficulty: 'normal',
          rank: 1,
          completed: false,
          active: true,
          requiredPomodoros: 1,
          completedPomodoros: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          repeatIndex: 0,
        },
      ],
    },
  }
  const conflictContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })
  await conflictContext.addInitScript(installSupabaseMock, {
    snapshot: remoteSnapshot,
    revision: 2,
    updated_at: new Date().toISOString(),
  })
  await conflictContext.addInitScript(() => {
    if (localStorage.getItem('muslim-study-place:cloud:lastRevision')) {
      return
    }

    localStorage.setItem(
      'muslim-study-place:todos',
      JSON.stringify([
        {
          id: 'qa-cloud-conflict-local',
          text: 'Local conflict task',
          priority: 'medium',
          difficulty: 'normal',
          rank: 1,
          completed: false,
          active: true,
          requiredPomodoros: 1,
          completedPomodoros: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          repeatIndex: 0,
        },
      ]),
    )
  })
  const conflictPage = await conflictContext.newPage()
  await conflictPage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await conflictPage.locator('.account-button').click()
  await conflictPage.getByRole('button', { name: 'Se connecter avec Google' }).click()
  await conflictPage.locator('.account-popover').getByText('Choix requis').waitFor({ state: 'visible' })
  assert(
    await conflictPage.getByRole('button', { name: 'Utiliser le cloud' }).isVisible(),
    'Cloud conflict should offer the cloud version',
  )
  assert(
    await conflictPage.getByRole('button', { name: 'Remplacer par ce PC' }).isVisible(),
    'Cloud conflict should offer the local version',
  )
  await conflictPage.getByRole('button', { name: 'Utiliser le cloud' }).click()
  await conflictPage.waitForLoadState('domcontentloaded')
  await conflictPage.waitForTimeout(1000)
  assert(
    await conflictPage.evaluate(() => {
      const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
      const revision = JSON.parse(localStorage.getItem('muslim-study-place:cloud:lastRevision') || '0')
      const backup = JSON.parse(localStorage.getItem('muslim-study-place:cloud:preMergeBackup') || 'null')

      return (
        revision === 2 &&
        backup?.values?.todos?.some((todo) => todo.text === 'Local conflict task') &&
        todos.some((todo) => todo.text === 'Remote cloud task')
      )
    }),
    'Using the cloud version should import remote data and preserve a local pre-merge backup',
  )
  await conflictContext.close()
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
  await runCloudSyncQa(browser)

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
    privacyChipCount: document.querySelectorAll('.privacy-chip').length,
    backgroundChipCount: document.querySelectorAll('.background-chip').length,
    backgroundWatermark: document.querySelector('.background-watermark')?.textContent?.trim() || '',
    unlockCardCount: document.querySelectorAll('.streak-unlock-card').length,
    badgeSizes: Array.from(
      document.querySelectorAll('.streak-flame, .best-run-star, .total-stars-counter'),
    ).map((element) => {
      const rect = element.getBoundingClientRect()

      return {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      }
    }),
    comboRing: (() => {
      const ring = document.querySelector('.best-star-orb .combo-ring')
      const style = ring ? getComputedStyle(ring) : null

      return style
        ? {
            animationDuration: style.animationDuration,
            borderTopWidth: style.borderTopWidth,
            opacity: style.opacity,
          }
        : null
    })(),
    memoryStore: Boolean(indexedDB),
  }))

  assert(initial.title === 'Muslim Study Place', 'Document title mismatch')
  assert(initial.lang === 'fr', 'French should be the default interface language')
  assert(initial.visibleWidgets === 4, 'Expected four widgets on the dashboard')
  assert(initial.dockButtons === 5, 'Expected four widget dock buttons plus the task-window add button')
  assert(initial.noteFrames === 0, 'Notes widget should not render')
  assert(initial.noHorizontalOverflow, 'Desktop layout has horizontal overflow')
  assert(initial.privacyChipCount === 0, 'Local privacy chip should not render')
  assert(initial.backgroundChipCount === 0, 'Background chip should not render in the topbar')
  assert(!initial.topbarText.includes('Local'), 'Topbar should not include the Local label')
  assert(!initial.topbarText.includes('Train'), 'Topbar should not include the background name')
  assert(initial.backgroundWatermark === 'Train', 'Background name should render as a discreet watermark')
  assert(initial.unlockCardCount === 0, 'Daily check-in alone should not show the task unlock animation')
  assert(initial.badgeSizes.length === 3, 'Expected three topbar metric badges')
  assert(
    Math.max(...initial.badgeSizes.map((size) => size.width)) -
      Math.min(...initial.badgeSizes.map((size) => size.width)) <=
      1,
    'Topbar metric badges should have matching widths',
  )
  assert(
    Math.max(...initial.badgeSizes.map((size) => size.height)) -
      Math.min(...initial.badgeSizes.map((size) => size.height)) <=
      1,
    'Topbar metric badges should have matching heights',
  )
  assert(initial.comboRing, 'Best run combo ring missing')
  assert(
    Number.parseFloat(initial.comboRing.animationDuration) >= 6.8,
    'Best run combo ring should spin slowly',
  )
  assert(
    Number.parseFloat(initial.comboRing.opacity) <= 0.7,
    'Best run combo ring should be visually discreet',
  )
  assert(
    Number.parseFloat(initial.comboRing.borderTopWidth) <= 1.5,
    'Best run combo ring should be thin',
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedUnlockAnimation = await page.evaluate(() => {
    const shell = document.querySelector('.streak-shell')
    const button = document.querySelector('.streak-flame')

    shell?.classList.add('is-unlocking')
    const animationName = button ? getComputedStyle(button).animationName : ''
    shell?.classList.remove('is-unlocking')

    return animationName
  })
  assert(
    reducedUnlockAnimation === 'none',
    'Reduced motion should disable the streak unlock badge animation',
  )
  const reducedEvolutionAnimation = await page.evaluate(() => {
    const reveal = document.createElement('div')
    reveal.className = 'flame-evolution-reveal stage-apogee'
    document.body.appendChild(reveal)
    const animationName = getComputedStyle(reveal).animationName
    reveal.remove()

    return animationName
  })
  assert(
    reducedEvolutionAnimation === 'none',
    'Reduced motion should disable the secret flame reveal animation',
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
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

  const today = dateKeyForOffset(0)
  const yesterday = dateKeyForOffset(-1)
  const twoDaysAgo = dateKeyForOffset(-2)

  await page.evaluate(
    ({ yesterday }) => {
      localStorage.setItem(
        'muslim-study-place:streak',
        JSON.stringify({
          current: 2,
          best: 5,
          lastActiveDate: yesterday,
          todayCount: 3,
          dailyGoal: 2,
        }),
      )
    },
    { yesterday },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    ({ today }) => {
      const streak = JSON.parse(localStorage.getItem('muslim-study-place:streak') || '{}')

      return (
        streak.current === 3 &&
        streak.best === 5 &&
        streak.lastActiveDate === today &&
        streak.todayCount === 1 &&
        streak.dailyGoal === 2 &&
        streak.history?.[today]?.count === 1 &&
        streak.history?.[today]?.goal === 2 &&
        streak.history?.[today]?.checkedIn === true
      )
    },
    { today },
  )
  assert(await page.locator('.streak-flame.is-lit').isVisible(), 'Daily check-in did not light the streak flame')
  assert(
    await page.locator('.streak-unlock-card').count() === 0,
    'Daily check-in should not trigger the task unlock card',
  )
  assert(
    await page.evaluate(() => localStorage.getItem('muslim-study-place:streak:lastTaskUnlockDate') === null),
    'Daily check-in should not set the task unlock lock date',
  )
  await page.locator('.streak-flame').click()
  assert(await page.getByRole('dialog', { name: 'Streak focus' }).isVisible(), 'Streak panel did not open')
  assert(await page.locator('.streak-popover .streak-day').count() === 7, 'Streak panel should render seven week days')
  await page.getByLabel('Fermer la streak focus').click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  assert(
    await page.evaluate(
      ({ today }) => {
        const streak = JSON.parse(localStorage.getItem('muslim-study-place:streak') || '{}')

        return (
          streak.current === 3 &&
          streak.best === 5 &&
          streak.lastActiveDate === today &&
          streak.todayCount === 1 &&
          streak.history?.[today]?.count === 1
        )
      },
      { today },
    ),
    'Reloading on the same day should not double-count the streak',
  )
  await page.evaluate(
    ({ twoDaysAgo }) => {
      localStorage.setItem(
        'muslim-study-place:streak',
        JSON.stringify({
          current: 4,
          best: 6,
          lastActiveDate: twoDaysAgo,
          todayCount: 2,
          dailyGoal: 1,
        }),
      )
    },
    { twoDaysAgo },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    ({ today }) => {
      const streak = JSON.parse(localStorage.getItem('muslim-study-place:streak') || '{}')

      return (
        streak.current === 1 &&
        streak.best === 6 &&
        streak.lastActiveDate === today &&
        streak.todayCount === 1 &&
        streak.history?.[today]?.count === 1
      )
    },
    { today },
  )

  await page.locator('.settings-trigger').click()
  assert(await page.getByRole('heading', { name: 'Parametres' }).isVisible(), 'French settings title missing')
  assert(await page.getByText('Memoire locale').isVisible(), 'Memory settings section missing')
  assert(
    await page.getByRole('button', { name: 'Simuler +1 jour' }).count() === 0,
    'Temporary streak simulation button should stay hidden',
  )
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
  const freshTaskMemory = await page.evaluate(() => {
    const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
    const memory = JSON.parse(
      localStorage.getItem('muslim-study-place:taskPomodoroMemory') || '{}',
    )
    const timerSettings = JSON.parse(
      localStorage.getItem('muslim-study-place:timerSettings') || '{}',
    )
    const run = JSON.parse(localStorage.getItem('muslim-study-place:pomodoroRun') || '{}')
    const timerRemaining = JSON.parse(
      localStorage.getItem('muslim-study-place:timer:remaining') || '0',
    )
    const task = todos.find((todo) => todo.text === 'Alpha manual')
    const taskMemory = task ? memory[task.id] : null
    const expectedFocus = (timerSettings.focusMinutes || 25) * 60

    return {
      active: task?.active,
      windowId: task?.windowId,
      expectedFocus,
      taskMemory,
      timerRemaining,
      run,
    }
  })
  assert(freshTaskMemory.active === true, 'First fresh task should become active')
  assert(freshTaskMemory.windowId === 'todo', 'Fresh task should belong to the default task window')
  assert(
    freshTaskMemory.taskMemory?.mode === 'focus' &&
      freshTaskMemory.taskMemory?.remaining === freshTaskMemory.expectedFocus &&
      freshTaskMemory.taskMemory?.completedInTarget === 0 &&
      freshTaskMemory.taskMemory?.currentRun === 0,
    'Fresh task should initialize its Pomodoro memory at focus time and zero progress',
  )
  assert(
    freshTaskMemory.timerRemaining === freshTaskMemory.expectedFocus &&
      freshTaskMemory.run.completedInTarget === 0 &&
      freshTaskMemory.run.currentRun === 0,
    'Active fresh task should reset the visible Pomodoro to focus time and zero progress',
  )
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
  const difficultyOptionStyles = await page
    .locator('.todo-difficulty-select select option')
    .first()
    .evaluate((option) => {
      const style = getComputedStyle(option)

      return {
        background: style.backgroundColor,
        color: style.color,
      }
    })
  assert(
    difficultyOptionStyles.background === 'rgb(21, 23, 19)' &&
      difficultyOptionStyles.color === 'rgb(248, 239, 210)',
    'Difficulty select options should use a readable dark popup style',
  )

  await page.getByLabel('Add task window').click()
  const secondTaskWindow = page.locator('.widget-frame').filter({ hasText: 'Tasks 2' }).first()
  assert(await secondTaskWindow.isVisible(), 'New task window should open immediately')
  await secondTaskWindow.getByLabel('Rename Tasks 2').fill('Deep Work')
  await secondTaskWindow.getByLabel('Rename Tasks 2').press('Enter')
  await page.waitForTimeout(200)
  const deepWorkWindow = page.locator('.widget-frame').filter({ hasText: 'Deep Work' }).first()
  assert(await deepWorkWindow.isVisible(), 'Renamed task window should update its visible title')
  await deepWorkWindow.locator('.todo-form input[aria-label="Add task"]').fill('Isolated task')
  await deepWorkWindow.locator('.todo-priority-select select').selectOption('medium')
  await deepWorkWindow.locator('.todo-difficulty-select select').selectOption('normal')
  await deepWorkWindow.getByRole('button', { name: 'Add task' }).click()
  await page.waitForFunction(() => {
    const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
    const windows = JSON.parse(localStorage.getItem('muslim-study-place:taskWindows') || '[]')
    const deepWindow = windows.find((item) => item.title === 'Deep Work')
    const task = todos.find((item) => item.text === 'Isolated task')

    return deepWindow && task?.windowId === deepWindow.id
  })
  assert(
    await page
      .locator('.widget-frame')
      .filter({ hasText: 'Todo' })
      .filter({ hasText: 'Isolated task' })
      .count() === 0,
    'Task created in a new window should stay isolated from the default task window',
  )
  page.once('dialog', (dialog) => dialog.accept())
  await deepWorkWindow.getByLabel('Delete Deep Work window').click()
  await page.waitForFunction(() => {
    const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
    const windows = JSON.parse(localStorage.getItem('muslim-study-place:taskWindows') || '[]')

    return (
      !windows.some((item) => item.title === 'Deep Work') &&
      !todos.some((item) => item.text === 'Isolated task')
    )
  })

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
  await page.locator('.streak-unlock-card').waitFor({ state: 'visible' })
  assert(
    await page.locator('.streak-unlock-card').getByText('Day unlocked').isVisible(),
    'First completed task should show the day unlock card',
  )
  await page.locator('.streak-unlock-day.is-unlocking-target.is-unlocked').waitFor({ state: 'visible' })
  assert(
    await page.evaluate(
      ({ today }) =>
        localStorage.getItem('muslim-study-place:streak:lastTaskUnlockDate') === today,
      { today },
    ),
    'First completed task should set the daily unlock lock date',
  )
  await page.locator('.streak-unlock-card').waitFor({ state: 'hidden', timeout: 4500 })
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
  await page.waitForTimeout(500)
  assert(
    await page.locator('.streak-unlock-card').count() === 0,
    'Second completed task on the same day should not replay the day unlock card',
  )
  const alphaGroups = page.locator('.todo-group-row').filter({ hasText: 'Alpha manual' })
  assert(await alphaGroups.count() === 1, 'Redo completion should stack into one completed group')
  assert(await alphaGroups.first().getByText('2 done').isVisible(), 'Stacked completed group count is wrong')
  assert(
    await alphaGroups.first().locator('.todo-stack-illustration.is-stacked').isVisible(),
    'Stacked completed group is missing the pile illustration',
  )
  await alphaGroups.first().getByLabel('Show runs').click()
  assert(await alphaGroups.first().getByText('Run 1').isVisible(), 'Expanded completed group is missing redo history')

  await page.getByRole('button', { name: 'To do' }).click()
  await addTask(page, 'Delete run QA', 'medium', 'normal')
  const deleteRunRow = page.locator('.todo-row:not(.todo-group-row)').filter({ hasText: 'Delete run QA' }).first()
  await deleteRunRow.getByLabel('Toggle Delete run QA').click()
  await page.getByRole('button', { name: 'Done' }).click()
  const deleteRunGroup = page.locator('.todo-group-row').filter({ hasText: 'Delete run QA' }).first()
  await deleteRunGroup.getByLabel('Show runs').click()
  await deleteRunGroup.getByLabel('Delete this Original run').click()
  await page.waitForFunction(
    () => ![...document.querySelectorAll('.todo-group-row')].some((row) => row.textContent?.includes('Delete run QA')),
  )

  await page.getByRole('button', { name: 'To do' }).click()
  await addTask(page, 'Delete group QA', 'medium', 'normal')
  const deleteGroupRow = page.locator('.todo-row:not(.todo-group-row)').filter({ hasText: 'Delete group QA' }).first()
  await deleteGroupRow.getByLabel('Toggle Delete group QA').click()
  await page.getByRole('button', { name: 'Done' }).click()
  const deleteGroup = page.locator('.todo-group-row').filter({ hasText: 'Delete group QA' }).first()
  await deleteGroup.getByLabel('Delete all completed Delete group QA tasks').click()
  await page.waitForFunction(
    () => ![...document.querySelectorAll('.todo-group-row')].some((row) => row.textContent?.includes('Delete group QA')),
  )

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
  await page.waitForFunction(
    () => localStorage.getItem('muslim-study-place:todos')?.includes('Alpha manual'),
    { timeout: 10000 },
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
  const freeFocusState = await page.evaluate(({ today }) => ({
    run: JSON.parse(localStorage.getItem('muslim-study-place:pomodoroRun') || '{}'),
    streak: localStorage.getItem('muslim-study-place:streak') || '',
    today,
  }), { today })
  assert(freeFocusState.run.totalStars === 1, 'Free pomodoro did not add a star')
  assert(
    freeFocusState.run.starHistory?.[freeFocusState.today]?.stars === 1,
    'Free pomodoro did not record the star history for today',
  )
  assert(freeFocusState.streak.includes('"todayCount"'), 'Free pomodoro did not record focus activity')

  await page.evaluate(() => {
    localStorage.setItem('muslim-study-place:todos', '[]')
    localStorage.setItem('muslim-study-place:taskPomodoroMemory', '{}')
    localStorage.setItem('muslim-study-place:timer:remaining', '0')
    localStorage.setItem('muslim-study-place:timer:mode', '"focus"')
    localStorage.setItem('muslim-study-place:timer:running', 'false')
    localStorage.setItem(
      'muslim-study-place:pomodoroRun',
      JSON.stringify({
        targetPomodoros: 6,
        completedInTarget: 6,
        currentRun: 7,
        bestRun: 7,
        totalStars: 7,
        lastStarAt: Date.now(),
        autoCycle: false,
        starHistory: {},
      }),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  assert(await page.locator('.finished-banner').getByText('Finished!').isVisible(), 'Finished banner missing for completed run')
  assert(
    (await page.locator('.finished-banner .finished-stars svg').count()) === 7,
    'Finished banner should display the earned star count',
  )
  assert(
    await page.evaluate(() =>
      [...document.querySelectorAll('.pomodoro-objective-panel .goal-stepper button')].every(
        (button) => button.disabled,
      ),
    ),
    'Finished pomodoro target stepper should be locked',
  )

  await page.evaluate(
    ({ today }) => {
      localStorage.setItem(
        'muslim-study-place:todos',
        JSON.stringify([
          {
            id: 'qa-skip-focus',
            text: 'Skip focus target',
            priority: 'medium',
            difficulty: 'normal',
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
      localStorage.setItem('muslim-study-place:taskPomodoroMemory', '{}')
      localStorage.setItem('muslim-study-place:timer:remaining', '120')
      localStorage.setItem('muslim-study-place:timer:mode', '"focus"')
      localStorage.setItem('muslim-study-place:timer:running', 'false')
      localStorage.setItem(
        'muslim-study-place:pomodoroRun',
        JSON.stringify({
          targetPomodoros: 2,
          completedInTarget: 0,
          currentRun: 0,
          bestRun: 0,
          totalStars: 0,
          lastStarAt: 0,
          autoCycle: false,
        }),
      )
      localStorage.setItem(
        'muslim-study-place:streak',
        JSON.stringify({
          current: 2,
          best: 2,
          lastActiveDate: today,
          todayCount: 1,
          dailyGoal: 1,
        }),
      )
    },
    { today },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.locator('.pomodoro-widget').getByRole('button', { name: 'Skip' }).click()
  await page.locator('.best-run-star.is-bursting').waitFor({ state: 'visible' })
  await page.locator('.total-stars-counter.is-showering').waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => localStorage.getItem('muslim-study-place:timer:mode') === '"shortBreak"',
  )
  assert(await page.getByText('05:00').isVisible(), 'Skipping focus did not move to the short break')
  assert(
    await page.evaluate(({ today }) => {
      const run = JSON.parse(localStorage.getItem('muslim-study-place:pomodoroRun') || '{}')
      const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
      const streak = JSON.parse(localStorage.getItem('muslim-study-place:streak') || '{}')

      return (
        run.totalStars === 1 &&
        run.currentRun === 1 &&
        run.bestRun === 1 &&
        run.completedInTarget === 1 &&
        run.starHistory?.[today]?.stars === 1 &&
        run.starHistory?.[today]?.bestRun === 1 &&
        todos[0]?.completedPomodoros === 1 &&
        todos[0]?.completed === false &&
        streak.current === 2 &&
        streak.todayCount === 2 &&
        streak.history?.[today]?.count === 2 &&
        streak.history?.[today]?.source === 'activity' &&
        localStorage.getItem('muslim-study-place:timer:running') === 'false'
      )
    }, { today }),
    'Skipping focus should count as a completed focus without auto-starting the break',
  )
  await page.getByRole('button', { name: 'Open best pomodoro run' }).click()
  assert(await page.getByRole('dialog', { name: 'Best run' }).isVisible(), 'Best run panel did not open')
  assert(await page.locator('.best-run-popover .metric-day').count() === 7, 'Best run panel should render seven week days')
  assert(
    await page.locator('.best-run-popover').getByText('Current combo').count() >= 1,
    'Best run panel missing current combo stat',
  )
  await page.getByLabel('Close best run').click()
  await page.getByRole('button', { name: 'Open total stars' }).click()
  assert(await page.getByRole('dialog', { name: 'Total stars' }).isVisible(), 'Total stars panel did not open')
  assert(await page.locator('.total-stars-popover .metric-day').count() === 7, 'Total stars panel should render seven week days')
  assert(
    await page.locator('.total-stars-popover').getByText('Best day').count() >= 1,
    'Total stars panel missing best day stat',
  )
  await page.getByLabel('Close total stars').click()

  await page.evaluate(
    ({ today }) => {
      localStorage.removeItem('muslim-study-place:streak:lastTaskUnlockDate')
      localStorage.setItem(
        'muslim-study-place:todos',
        JSON.stringify([
          {
            id: 'qa-pomodoro-unlock',
            text: 'Pomodoro unlock target',
            priority: 'medium',
            difficulty: 'normal',
            rank: 1,
            completed: false,
            active: true,
            requiredPomodoros: 1,
            completedPomodoros: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            completedAt: null,
            repeatIndex: 0,
          },
        ]),
      )
      localStorage.setItem('muslim-study-place:taskPomodoroMemory', '{}')
      localStorage.setItem('muslim-study-place:timer:remaining', '120')
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
      localStorage.setItem(
        'muslim-study-place:streak',
        JSON.stringify({
          current: 4,
          best: 4,
          lastActiveDate: today,
          todayCount: 1,
          dailyGoal: 1,
          history: {
            [today]: {
              date: today,
              count: 1,
              goal: 1,
              checkedIn: true,
              completed: true,
              source: 'check-in',
            },
          },
        }),
      )
    },
    { today },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.locator('.pomodoro-widget').getByRole('button', { name: 'Skip' }).click()
  await page.locator('.streak-unlock-card').waitFor({ state: 'visible' })
  await page.locator('.streak-unlock-day.is-unlocking-target.is-unlocked').waitFor({ state: 'visible' })
  assert(
    await page.evaluate(({ today }) => {
      const todos = JSON.parse(localStorage.getItem('muslim-study-place:todos') || '[]')
      const streak = JSON.parse(localStorage.getItem('muslim-study-place:streak') || '{}')

      return (
        localStorage.getItem('muslim-study-place:streak:lastTaskUnlockDate') === today &&
        todos[0]?.completed === true &&
        todos[0]?.completedPomodoros === 1 &&
        streak.todayCount === 2 &&
        streak.history?.[today]?.source === 'activity'
      )
    }, { today }),
    'Pomodoro-completed task should unlock the current streak day once',
  )

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

  await page.evaluate(() => {
    const now = Date.now()
    const todo = (
      id,
      text,
      rank,
      completedPomodoros,
      requiredPomodoros,
      completed = false,
    ) => ({
      id,
      text,
      priority: 'medium',
      difficulty: 'normal',
      rank,
      completed,
      active: false,
      requiredPomodoros,
      completedPomodoros,
      createdAt: now - rank * 1000,
      updatedAt: now - rank * 500,
      completedAt: completed ? now - rank * 300 : null,
      repeatIndex: 0,
    })

    localStorage.setItem(
      'muslim-study-place:todos',
      JSON.stringify([
        todo('qa-zero-large', 'QA zero large target', 1, 0, 5),
        todo('qa-started-low', 'QA started low progress', 2, 1, 4),
        todo('qa-started-high', 'QA started high progress', 3, 3, 4),
        todo('qa-completed-big', 'QA completed big target', 4, 5, 5, true),
        todo('qa-completed-small', 'QA completed small target', 5, 1, 1, true),
      ]),
    )
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await page.locator('.todo-tabs').getByRole('button', { name: 'All', exact: true }).click()
  const visibleTodoTitles = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.todo-list > .todo-row')].map(
        (row) => row.querySelector('.todo-title-line > span')?.textContent?.trim() || '',
      ),
    )

  await page.getByLabel('Sort tasks').selectOption('progress-desc')
  let sortedTodoTitles = await visibleTodoTitles()
  assert(
    sortedTodoTitles[0] === 'QA completed big target' &&
      sortedTodoTitles[1] === 'QA completed small target',
    'All-tab highest-progress sort should include completed groups globally',
  )

  await page.getByLabel('Sort tasks').selectOption('progress-asc')
  sortedTodoTitles = await visibleTodoTitles()
  assert(
    sortedTodoTitles[0] === 'QA zero large target',
    'All-tab lowest-progress sort should include open tasks globally',
  )

  await page.getByLabel('Sort tasks').selectOption('target-asc')
  sortedTodoTitles = await visibleTodoTitles()
  assert(
    sortedTodoTitles[0] === 'QA completed small target',
    'All-tab smallest-target sort should include completed groups globally',
  )

  await page.getByLabel('Sort tasks').selectOption('target-desc')
  sortedTodoTitles = await visibleTodoTitles()
  assert(
    sortedTodoTitles[0] === 'QA zero large target' &&
      sortedTodoTitles[1] === 'QA completed big target',
    'All-tab largest-target sort should interleave open tasks and completed groups',
  )

  await assertFlameStage(page, today, 1, 'ember')
  await assertFlameStage(page, today, 7, 'verdant')
  await assertFlameStage(page, today, 30, 'azure')
  await assertFlameStage(page, today, 100, 'ultimate')
  await assertFlameStage(page, today, 1, 'solar', 120)
  await assertFlameStage(page, today, 1, 'eclipse', 150)
  await assertFlameStage(page, today, 1, 'nebula', 200)
  await assertFlameStage(page, today, 1, 'apogee', 300)

  await page.evaluate((today) => {
    localStorage.setItem(
      'muslim-study-place:streak',
      JSON.stringify({
        current: 1,
        best: 1,
        lastActiveDate: today,
        todayCount: 1,
        dailyGoal: 2,
        history: {
          [today]: {
            date: today,
            count: 1,
            goal: 2,
            checkedIn: true,
            completed: false,
            source: 'check-in',
          },
        },
      }),
    )
    localStorage.setItem(
      'muslim-study-place:flameEvolution',
      JSON.stringify({
        stages: {},
        quests: { 'perfect-week': Date.now() },
        selectedEffect: 'seven-lights',
        seenUnlocks: [],
        pendingUnlocks: ['quest:perfect-week'],
        revealedHints: {},
      }),
    )
  }, today)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.flame-evolution-reveal.stage-ember')
  const emberRevealMetrics = await page.evaluate(() => {
    const reveal = document.querySelector('.flame-evolution-reveal.stage-ember')
    const rect = reveal?.getBoundingClientRect()
    const style = reveal ? getComputedStyle(reveal) : null

    return {
      parentIsBody: reveal?.parentElement === document.body,
      position: style?.position,
      zIndex: style?.zIndex,
      top: rect?.top,
      left: rect?.left,
      width: rect?.width,
      height: rect?.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
  assert(
    emberRevealMetrics.parentIsBody &&
      emberRevealMetrics.position === 'fixed' &&
      Number.parseInt(emberRevealMetrics.zIndex, 10) >= 1000,
    'Ember flame reveal should render as a top-level fixed modal above the app',
  )
  assert(
    emberRevealMetrics.top <= 1 &&
      emberRevealMetrics.left <= 1 &&
      emberRevealMetrics.left + emberRevealMetrics.width >=
        emberRevealMetrics.viewportWidth - 1 &&
      emberRevealMetrics.top + emberRevealMetrics.height >=
        emberRevealMetrics.viewportHeight - 1,
    'Ember flame reveal should cover the full viewport instead of expanding inside the topbar',
  )
  await page.getByRole('button', { name: 'Claim' }).click()
  await page.waitForSelector('.flame-evolution-reveal', { state: 'detached' })

  const assertCompactFlameAccessory = async (effect, quest, check) => {
    await page.evaluate(
      ({ effect, quest }) => {
        localStorage.setItem(
          'muslim-study-place:flameEvolution',
          JSON.stringify({
            stages: {},
            quests: { [quest]: Date.now() },
            selectedEffect: effect,
            seenUnlocks: [],
            pendingUnlocks: [],
            revealedHints: {},
          }),
        )
      },
      { effect, quest },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)

    const metrics = await page.evaluate(() => {
      const orb = document.querySelector('.streak-flame .flame-orb')?.getBoundingClientRect()
      const flame = document.querySelector('.streak-flame .duo-flame')?.getBoundingClientRect()
      const object = document
        .querySelector('.streak-flame .flame-quest-object')
        ?.getBoundingClientRect()
      const core = document.querySelector('.streak-flame .duo-flame-core')
      const coreStyle = core ? getComputedStyle(core) : null

      return {
        orb: orb ? { top: orb.top, right: orb.right, bottom: orb.bottom, left: orb.left } : null,
        flame: flame ? { top: flame.top, right: flame.right, bottom: flame.bottom, left: flame.left } : null,
        object: object
          ? { top: object.top, right: object.right, bottom: object.bottom, left: object.left }
          : null,
        coreOpacity: coreStyle ? Number.parseFloat(coreStyle.opacity) : 0,
      }
    })

    check(metrics)
  }

  await assertCompactFlameAccessory('seven-lights', 'perfect-week', (metrics) => {
    assert(metrics.orb && metrics.object, 'Crown accessory metrics missing')
    assert(
      metrics.object.bottom <= metrics.orb.bottom - 9,
      'Crown accessory should sit above the compact flame instead of covering it',
    )
  })
  await assertCompactFlameAccessory('crystal-core', 'deep-task', (metrics) => {
    assert(metrics.flame && metrics.object, 'Crystal accessory metrics missing')
    assert(metrics.coreOpacity >= 0.8, 'Crystal accessory should not dim the base flame core')
    assert(
      metrics.object.left >= metrics.flame.left + (metrics.flame.right - metrics.flame.left) * 0.45,
      'Crystal accessory should sit beside the compact flame',
    )
  })
  await assertCompactFlameAccessory('runic-sparks', 'twenty-five-tasks', (metrics) => {
    assert(metrics.flame && metrics.object, 'Runic accessory metrics missing')
    assert(metrics.coreOpacity >= 0.8, 'Runic accessory should not hide the base flame core')
    assert(
      metrics.object.right <= metrics.flame.left + (metrics.flame.right - metrics.flame.left) * 0.62,
      'Runic accessory should sit beside the compact flame',
    )
  })

  await page.evaluate(
    ({ history, today }) => {
      const completedTodos = Array.from({ length: 25 }, (_, index) => ({
        id: `qa-flame-secret-${index}`,
        text: `Flame secret task ${index + 1}`,
        priority: 'medium',
        difficulty: 'normal',
        rank: index + 1,
        completed: true,
        active: false,
        requiredPomodoros: index === 0 ? 6 : 1,
        completedPomodoros: index === 0 ? 6 : 1,
        createdAt: Date.now() - index,
        updatedAt: Date.now() - index,
        completedAt: Date.now() - index,
        repeatIndex: 0,
      }))

      localStorage.setItem(
        'muslim-study-place:streak',
        JSON.stringify({
          current: 1,
          best: 300,
          lastActiveDate: today,
          todayCount: 1,
          dailyGoal: 2,
          history,
        }),
      )
      localStorage.setItem(
        'muslim-study-place:pomodoroRun',
        JSON.stringify({
          targetPomodoros: 10,
          completedInTarget: 10,
          currentRun: 10,
          bestRun: 10,
          totalStars: 100,
          lastStarAt: Date.now(),
          autoCycle: true,
          starHistory: {},
        }),
      )
      localStorage.setItem(
        'muslim-study-place:todos',
        JSON.stringify(completedTodos),
      )
      localStorage.setItem(
        'muslim-study-place:flameEvolution',
        JSON.stringify({
          stages: {},
          quests: {},
          selectedEffect: null,
          seenUnlocks: [],
        }),
      )
    },
    { history: perfectWeekHistory(4), today },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const evolution = JSON.parse(
      localStorage.getItem('muslim-study-place:flameEvolution') || '{}',
    )

    return (
      Object.keys(evolution.stages || {}).length === 4 &&
      Object.keys(evolution.quests || {}).length === 7 &&
      evolution.selectedEffect === 'runic-sparks'
    )
  })
  assert(
    await page.locator('.flame-evolution-reveal').count() === 1,
    'Retroactive flame unlocks should be grouped into one reveal',
  )
  assert(
    await page.locator('.streak-flame').getAttribute('data-flame-stage') ===
      'apogee',
    'The highest unlocked ascension should remain active from the best streak',
  )
  assert(
    await page.locator('.streak-flame').getAttribute('data-flame-effect') ===
      'runic-sparks',
    'The newest mysterious quest effect should equip automatically',
  )
  await page.keyboard.press('Escape')
  await page.mouse.click(8, 8)
  await page.waitForTimeout(15100)
  assert(
    await page.locator('.flame-evolution-reveal').count() === 1,
    'A secret flame reveal should wait indefinitely for the Claim action',
  )
  const pendingEvolution = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('muslim-study-place:flameEvolution') || '{}',
    ),
  )
  assert(
    pendingEvolution.pendingUnlocks?.length === 11 &&
      pendingEvolution.seenUnlocks?.length === 0,
    'Discovered secrets should remain pending until they are claimed',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  assert(
    await page.locator('.flame-evolution-reveal').count() === 1,
    'An unclaimed flame reveal should return after reload',
  )
  await page.getByRole('button', { name: 'Claim' }).click()
  await page.waitForSelector('.flame-evolution-reveal', { state: 'detached' })
  const claimedEvolution = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('muslim-study-place:flameEvolution') || '{}',
    ),
  )
  assert(
    claimedEvolution.pendingUnlocks?.length === 0 &&
      claimedEvolution.seenUnlocks?.length === 11,
    'Claim should move every grouped secret from pending to seen',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  assert(
    await page.locator('.flame-evolution-reveal').count() === 0,
    'Claimed flame evolution reveals should not replay after reload',
  )
  await page.locator('.streak-flame').click()
  assert(
    await page.locator('.flame-quest.is-unlocked').count() === 7 &&
      await page.locator('.flame-quest.is-locked').count() === 0,
    'All seven completed mysterious quests should be revealed in the streak panel',
  )
  const sevenLightsQuest = page
    .locator('.flame-quest.is-unlocked')
    .filter({ hasText: 'Crown of seven lights' })
  assert(
    await sevenLightsQuest.count() === 1,
    'The seven lights reward should be available after a perfect week',
  )
  await sevenLightsQuest.click()
  assert(
    await page.locator('.streak-flame').getAttribute('data-flame-effect') ===
      'seven-lights',
    'Selecting an unlocked mysterious effect should update the flame',
  )
  await page.getByLabel('Close focus streak').click()
  await page.getByLabel('Open settings').click()
  await page.getByRole('button', { name: 'Book of Achievements' }).click()
  assert(
    await page.getByText('Reach a best streak of 300 days.').isVisible(),
    'The achievement book should reveal exact ascension answers',
  )
  assert(
    await page.locator('.codex-entry.is-unlocked').count() === 4,
    'The Ascensions tab should show all four unlocked ascensions',
  )
  await page.getByRole('tab', { name: /Quests/ }).click()
  assert(
    await page.locator('.codex-entry.is-unlocked').count() === 7,
    'The Quests tab should show all seven unlocked quests',
  )
  assert(
    await page.getByText('Complete 25 tasks.').isVisible(),
    'The achievement book should reveal exact quest answers',
  )
  await page.getByLabel('Close the book').click()
  await page.getByLabel('Close settings').click()

  await page.evaluate(({ today }) => {
    localStorage.setItem(
      'muslim-study-place:streak',
      JSON.stringify({
        current: 1,
        best: 1,
        lastActiveDate: today,
        todayCount: 1,
        dailyGoal: 1,
        history: {},
      }),
    )
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
        starHistory: {},
      }),
    )
    localStorage.setItem('muslim-study-place:todos', '[]')
    localStorage.setItem(
      'muslim-study-place:flameEvolution',
      JSON.stringify({
        stages: {},
        quests: {},
        selectedEffect: null,
        seenUnlocks: [],
        pendingUnlocks: [],
        revealedHints: {},
      }),
    )
  }, { today })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  assert(
    await page.locator('.streak-flame').getAttribute('data-flame-effect') ===
      'none',
    'A locked mysterious effect should never be restored as selected',
  )
  await page.getByLabel('Open settings').click()
  await page.getByRole('button', { name: 'Book of Achievements' }).click()
  await page.getByRole('tab', { name: /Quests/ }).click()
  assert(
    await page.getByText('Complete 25 tasks.').count() === 0,
    'A locked quest must not expose its exact answer',
  )
  const firstLockedEntry = page.locator('.codex-entry.is-locked').first()
  await firstLockedEntry.getByRole('button', { name: 'Break seal 1' }).click()
  assert(
    await firstLockedEntry.getByText('Seek one complete cycle.').isVisible(),
    'The first clue seal should reveal the first clue',
  )
  await firstLockedEntry.getByRole('button', { name: 'Break seal 2' }).click()
  assert(
    await firstLockedEntry
      .getByText('Reach your goal from Monday through Sunday.')
      .isVisible(),
    'The second clue seal should reveal the second clue',
  )
  const hintedEvolution = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('muslim-study-place:flameEvolution') || '{}',
    ),
  )
  assert(
    hintedEvolution.revealedHints?.['quest:perfect-week'] === 2,
    'Revealed clue seals should persist in flame evolution state',
  )
  await page.getByLabel('Close the book').click()
  await page.getByLabel('Close settings').click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByLabel('Open settings').click()
  await page.getByRole('button', { name: 'Book of Achievements' }).click()
  await page.getByRole('tab', { name: /Quests/ }).click()
  assert(
    await page.getByText('Seek one complete cycle.').isVisible() &&
      await page
        .getByText('Reach your goal from Monday through Sunday.')
        .isVisible(),
    'Revealed clues should survive a reload',
  )
  await page.getByLabel('Close the book').click()

  assert(
    await page.getByRole('button', { name: 'Temporary Flame Workshop' }).count() === 0,
    'Temporary Flame Workshop should be hidden from settings',
  )
  await page.getByLabel('Close settings').click()

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

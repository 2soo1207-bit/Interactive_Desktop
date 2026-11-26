import type { Plugin, Connect } from 'vite'
import { approvedVideoIds, channelHandle, channelId, officialVideos } from '../apps/youtube/channel.ts'
import type { ChannelList } from '../apps/youtube/channel.ts'

interface PublicVideo {
  id?: string
  snippet?: { channelId?: string; title?: string }
  status?: { privacyStatus?: string; embeddable?: boolean }
}

async function publicMetadata(apiKey: string) {
  const batches = Array.from({ length: Math.ceil(approvedVideoIds.length / 50) },
    (_, index) => approvedVideoIds.slice(index * 50, (index + 1) * 50))
  const results = await Promise.all(batches.map(async (ids) => {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.search = new URLSearchParams({ part: 'snippet,status', id: ids.join(','), key: apiKey }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`YouTube Data API returned ${response.status}`)
    const { items } = await response.json() as { items: PublicVideo[] }
    return items.filter((item) => item.status?.privacyStatus === 'public' && item.status.embeddable === true)
      .map((item) => ({ id: item.id, channelId: item.snippet?.channelId, title: item.snippet?.title }))
  }))
  return results.flat()
}

async function embedMetadata() {
  const results = await Promise.all(approvedVideoIds.map(async (id) => {
    const url = new URL('https://www.youtube.com/oembed')
    url.search = new URLSearchParams({ url: `https://www.youtube.com/watch?v=${id}`, format: 'json' }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if ([401, 403, 404].includes(response.status)) return
    if (!response.ok) throw new Error(`YouTube oEmbed returned ${response.status}`)
    const data = await response.json() as { author_url?: string; title?: string; type?: string }
    const author = data.author_url?.replace(/\/$/, '').replace(/^http:\/\//, 'https://')
    if (data.type === 'video' &&
      (author === `https://www.youtube.com/${channelHandle}` || author === `https://www.youtube.com/channel/${channelId}`)) {
      return { id, channelId, title: data.title }
    }
  }))
  return results
}

export async function fetchChannelList(apiKey = process.env.YOUTUBE_API_KEY): Promise<ChannelList> {
  const metadata = apiKey ? await publicMetadata(apiKey) : await embedMetadata()
  return { fetchedAt: new Date().toISOString(), videos: officialVideos(metadata) }
}

export function youtubeFeedPlugin(apiKey?: string): Plugin {
  let cached: ChannelList | undefined
  let pending: Promise<ChannelList> | undefined

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/3ce-videos') return next()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('Allow', 'GET')
      res.end('{"error":"method-not-allowed"}')
      return
    }
    const list = cached && Date.now() - Date.parse(cached.fetchedAt) < 120_000
      ? Promise.resolve(cached)
      : pending ??= fetchChannelList(apiKey).then((result) => { cached = result; return result })
        .finally(() => { pending = undefined })
    void list.then((result) => {
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.end(JSON.stringify(result))
    }, () => {
      res.statusCode = 502
      res.setHeader('Cache-Control', 'no-store')
      res.end('{"error":"feed-unavailable"}')
    })
  }

  return {
    name: 'playground-youtube-feed',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

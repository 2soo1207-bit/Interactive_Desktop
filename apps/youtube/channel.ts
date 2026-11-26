import { landscapeVideoIds } from './landscape-videos.ts'

export const channelId = 'UCIcJXs34WdkNcz1qkcxf0Rw'
export const channelHandle = '@3ce_official'
export const youtubePlayerOrigin = 'https://www.youtube-nocookie.com'
export const approvedVideoIds = [...new Set(landscapeVideoIds.filter((id) => /^[\w-]{11}$/.test(id)))]

export interface ChannelVideo {
  id: string
  channelId: string
  title: string
}

export interface ChannelList {
  fetchedAt: string
  videos: ChannelVideo[]
}

export function officialVideos(value: unknown): ChannelVideo[] {
  if (!Array.isArray(value)) return []
  const verified = new Map<string, ChannelVideo>()
  for (const video of value) {
    if (video?.channelId === channelId && typeof video.id === 'string' && typeof video.title === 'string' && video.title.trim()) {
      verified.set(video.id, { id: video.id, channelId, title: video.title })
    }
  }
  return approvedVideoIds.flatMap((id) => {
    const video = verified.get(id)
    return video ? [video] : []
  })
}

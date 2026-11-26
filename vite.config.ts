import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { youtubeFeedPlugin, youtubeStaticFeedPlugin } from './server/youtube-feed.ts'

export default defineConfig(({ command, isPreview, mode }) => {
  const key = new URL('./.certs/desktop-key.pem', import.meta.url)
  const cert = new URL('./.certs/desktop.pem', import.meta.url)
  const hasCertificate = command === 'serve' && existsSync(key) && existsSync(cert)
  const pagesBuild = mode === 'pages'
  const pagesBase = (process.env.PAGES_BASE_PATH ?? '/Interactive_Desktop').replace(/\/+$/, '')
  const youtubeApiKey = process.env.YOUTUBE_API_KEY || loadEnv(mode, process.cwd(), 'YOUTUBE_').YOUTUBE_API_KEY
  const apps = readdirSync(new URL('./apps/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => new URL(`./apps/${name}/index.html`, import.meta.url))
    .filter((entry) => existsSync(entry))

  if (command === 'serve' && !isPreview && !hasCertificate) {
    throw new Error('Run npm run cert:setup to create the local HTTPS certificate.')
  }

  return {
    base: pagesBuild ? `${pagesBase}/` : './',
    plugins: [pagesBuild ? youtubeStaticFeedPlugin(youtubeApiKey) : youtubeFeedPlugin(youtubeApiKey)],
    worker: { format: 'es' },
    build: {
      rolldownOptions: {
        input: [new URL('./index.html', import.meta.url), ...apps].map((entry) => fileURLToPath(entry)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https: hasCertificate
        ? { key: readFileSync(key), cert: readFileSync(cert) }
        : undefined,
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem,key,p12}', '**/.git/**', '**/.certs/**', '**/.local/**'],
      },
    },
  }
})

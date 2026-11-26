import { publicAsset } from '../appearance'
import type { HandLandmarks, HandTracker } from './hand-tracking'

export type HandWorkerRequest =
  | { type: 'start'; model: string }
  | { type: 'frame'; image: ImageBitmap; time: number }

export type HandWorkerReply =
  | { type: 'ready' }
  | { type: 'landmarks'; points: HandLandmarks | null }
  | { type: 'error'; message: string }

const frameInterval = 1000 / 24
const inferenceSize = 640

export const mediapipeHandTracker: HandTracker = {
  start(video, publish, signal, onError) {
    if (signal.aborted) return
    if (typeof createImageBitmap !== 'function') throw new Error('Video frame capture is unavailable.')

    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL('./hand-landmarker.worker.ts', import.meta.url), { type: 'module' })
      let running = true
      let ready = false
      let busy = false
      let animationFrame = 0
      let lastVideoTime = -1
      let lastCapture = -Infinity
      const startupTimer = window.setTimeout(() => fail(new Error('Hand model initialization timed out.')), 30_000)

      function stop() {
        running = false
        window.clearTimeout(startupTimer)
        window.cancelAnimationFrame(animationFrame)
        worker.terminate()
      }

      function fail(error: unknown) {
        if (!running) return
        stop()
        if (ready) onError(error)
        else reject(error)
      }

      signal.addEventListener('abort', () => {
        if (running) stop()
        resolve()
      }, { once: true })

      worker.addEventListener('error', (event) => {
        event.preventDefault()
        fail(new Error(event.message || 'Hand tracking worker failed.'))
      })
      worker.addEventListener('message', (event: MessageEvent<HandWorkerReply>) => {
        if (!running) return
        const reply = event.data
        switch (reply.type) {
          case 'ready':
            window.clearTimeout(startupTimer)
            ready = true
            resolve()
            animationFrame = window.requestAnimationFrame(capture)
            break
          case 'landmarks':
            busy = false
            publish(reply.points)
            break
          case 'error':
            fail(new Error(reply.message))
            break
        }
      })

      function capture(time: number) {
        animationFrame = window.requestAnimationFrame(capture)
        if (busy || time - lastCapture < frameInterval ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastVideoTime) return

        const { videoWidth, videoHeight } = video
        if (!videoWidth || !videoHeight) return
        const scale = Math.min(1, inferenceSize / Math.max(videoWidth, videoHeight))
        busy = true
        lastCapture = time
        lastVideoTime = video.currentTime

        void createImageBitmap(video, {
          resizeWidth: Math.round(videoWidth * scale),
          resizeHeight: Math.round(videoHeight * scale),
          resizeQuality: 'low',
        }).then((image) => {
          if (!running) {
            image.close()
            return
          }
          const request: HandWorkerRequest = { type: 'frame', image, time }
          try {
            worker.postMessage(request, [image])
          } catch (error) {
            image.close()
            fail(error)
          }
        }).catch(fail)
      }

      const start: HandWorkerRequest = {
        type: 'start',
        model: new URL(publicAsset('hand-tracking/hand_landmarker.task'), document.baseURI).href,
      }
      worker.postMessage(start)
    })
  },
}

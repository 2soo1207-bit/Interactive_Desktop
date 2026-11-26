import { HandLandmarker } from '@mediapipe/tasks-vision'
import wasmLoader from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinary from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import type { HandWorkerReply, HandWorkerRequest } from './mediapipe-hand-tracker'

let landmarker: HandLandmarker | undefined

function reply(message: HandWorkerReply) {
  self.postMessage(message)
}

self.addEventListener('message', (event: MessageEvent<HandWorkerRequest>) => {
  void handle(event.data).catch((error: unknown) => {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  })
})

async function handle(request: HandWorkerRequest) {
  if (request.type === 'start') {
    landmarker = await HandLandmarker.createFromOptions({
      wasmLoaderPath: new URL(wasmLoader, self.location.href).href,
      wasmBinaryPath: new URL(wasmBinary, self.location.href).href,
    }, {
      baseOptions: { modelAssetPath: request.model, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    })
    reply({ type: 'ready' })
    return
  }

  try {
    const result = landmarker?.detectForVideo(request.image, request.time)
    reply({ type: 'landmarks', points: result?.landmarks[0] ?? null })
  } finally {
    request.image.close()
  }
}

import { FaceLandmarker } from '@mediapipe/tasks-vision'
import wasmLoader from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinary from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import type { FaceWorkerReply, FaceWorkerRequest, LipLandmarks } from './face.ts'

let landmarker: FaceLandmarker | undefined

function reply(message: FaceWorkerReply) {
  self.postMessage(message)
}

self.addEventListener('message', (event: MessageEvent<FaceWorkerRequest>) => {
  void handle(event.data).catch((error: unknown) => {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  })
})

async function handle(request: FaceWorkerRequest) {
  if (request.type === 'start') {
    landmarker = await FaceLandmarker.createFromOptions({
      wasmLoaderPath: new URL(wasmLoader, self.location.href).href,
      wasmBinaryPath: new URL(wasmBinary, self.location.href).href,
    }, {
      baseOptions: { modelAssetPath: request.model, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.55,
    })
    reply({ type: 'ready' })
    return
  }

  const { image, time, generation } = request
  try {
    const face = landmarker?.detectForVideo(image, time).faceLandmarks[0]
    const points: LipLandmarks | null = face ? [face[61], face[291], face[13], face[14]] : null
    reply({ type: 'lips', points, time, generation })
  } finally {
    image.close()
  }
}

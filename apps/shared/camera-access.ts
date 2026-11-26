import { desktopCamera } from './desktop-host.ts'

// Capture policy only: tracking, rendering and gestures stay in each example.
type CameraLabel = { label?: string }
type CameraMedia = Pick<MediaDevices, 'enumerateDevices' | 'getUserMedia'>
const PHONE = /iphone|ipad|continuity|아이폰|연속성|desk\s*view|데스크\s*뷰|epoccam|droidcam|ivcam|iriun|\bcamo\b/iu
const BUILTIN = /face\s*time|built[\s_-]*in|integrated|internal|macbook|내장|内蔵|內建|内建/iu
export const isPhoneCamera = (device: CameraLabel) => PHONE.test(device.label ?? '')
export const isBuiltinCamera = (device: CameraLabel) => !isPhoneCamera(device) && BUILTIN.test(device.label ?? '')
const concreteID = (id: string) => Boolean(id && !['default', 'communications'].includes(id))
export function preferredCamera(devices: MediaDeviceInfo[]) {
  const candidates = devices.filter(device => device.kind === 'videoinput' && concreteID(device.deviceId) && isBuiltinCamera(device))
  return candidates.find(device => /face\s*time/iu.test(device.label))
    ?? candidates.find(device => /macbook/iu.test(device.label)) ?? candidates[0] ?? null
}
export class CameraAccessError extends Error {
  constructor(message: string) { super(message); this.name = 'CameraAccessError' }
}
function check(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('카메라 연결을 취소했습니다.', 'AbortError')
}
export async function requestCamera(media: CameraMedia, { signal }: { signal: AbortSignal }) {
  const shared = desktopCamera(signal)
  if (shared) {
    try { return await shared }
    catch (error) {
      // Recreate the camera error in this app's realm for its existing error handlers.
      const reason = error as { message?: string; name?: string } | null
      throw new DOMException(reason?.message ?? '공유 카메라에 연결할 수 없습니다.', reason?.name ?? 'NotReadableError')
    }
  }

  const pendingStreams = new Set<MediaStream>()
  const stop = (stream: MediaStream) => {
    stream.getTracks().forEach(track => track.stop())
    pendingStreams.delete(stream)
  }
  const capture = async (video: boolean | MediaTrackConstraints) => {
    check(signal)
    const stream = await media.getUserMedia({ audio: false, video })
    pendingStreams.add(stream)
    check(signal)
    if (!stream.getVideoTracks().some(track => track.readyState === 'live')) {
      stop(stream)
      throw new DOMException('카메라에서 사용 가능한 영상 트랙을 받지 못했습니다.', 'NotReadableError')
    }
    return stream
  }
  try {
    // Permission first. No device names or device IDs are required to start.
    // This initial device is selected by the browser, not by the application.
    const initial = await capture(true)
    let devices: MediaDeviceInfo[] = []
    try { devices = await media.enumerateDevices() }
    catch (error) {
      check(signal)
      console.warn('[camera] 권한 승인 후 장치 목록 조회 실패; 연결된 영상 유지 여부를 확인합니다.', error)
    }
    check(signal)
    const initialTrack = initial.getVideoTracks()[0]
    const initialId = initialTrack.getSettings?.().deviceId
    const initialDevice = initialId ? devices.find(device => device.kind === 'videoinput' && device.deviceId === initialId) : undefined
    const phone = isPhoneCamera(initialTrack) || Boolean(initialDevice && isPhoneCamera(initialDevice))
    const preferred = preferredCamera(devices)
    let working = initial
    if (preferred && (phone || initialId !== preferred.deviceId)) {
      // A known iPhone permission stream must not remain active during a switch.
      if (phone) stop(initial)
      let replacement: MediaStream | undefined
      try {
        const deviceId = { exact: preferred.deviceId }
        try {
          replacement = await capture({ deviceId, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } })
        } catch (error) {
          check(signal)
          if (!(error instanceof Error) || error.name !== 'OverconstrainedError') throw error
          console.warn('[camera] 내장 카메라의 해상도/프레임레이트 제약을 완화합니다. 장치 ID는 유지합니다.', error)
          replacement = await capture({ deviceId })
        }
        const track = replacement.getVideoTracks()[0], actual = track.getSettings?.().deviceId
        if (isPhoneCamera(track) || (actual && actual !== preferred.deviceId)) {
          throw new CameraAccessError('요청한 내장 카메라와 연결된 장치가 다릅니다.')
        }
        working = replacement
        stop(initial)
      } catch (error) {
        if (replacement) stop(replacement)
        check(signal)
        // A failed preference must not discard an otherwise working webcam.
        if (phone || initialTrack.readyState !== 'live') throw error
        console.warn('[camera] 내장 카메라 전환 실패; 이미 연결된 카메라를 유지합니다.', error)
      }
    } else if (phone) {
      throw new CameraAccessError('브라우저 기본 장치가 아이폰 카메라입니다. 브라우저의 기본 카메라를 맥북 내장 카메라로 설정한 뒤 다시 시도해 주세요.')
    }
    check(signal)
    // Keep the visible webcam sharp even if permission was granted with video:true.
    try { await working.getVideoTracks()[0].applyConstraints?.({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }) }
    catch (error) { console.warn('[camera] 영상 품질 설정을 적용하지 못해 현재 영상 설정을 유지합니다.', error) }
    check(signal)
    if (working.getVideoTracks()[0].readyState !== 'live') throw new DOMException('카메라 연결이 해제되었습니다.', 'NotReadableError')
    // Hidden names, an empty list or failed enumeration alone never reject a
    // live camera. An unidentified stream cannot be proven to be an iPhone.
    pendingStreams.delete(working)
    return working
  } catch (error) {
    pendingStreams.forEach(stop)
    if (!signal.aborted) console.error('[camera] 카메라 연결 실패:', error)
    check(signal)
    throw error
  }
}


# Interactive Desktop · 3CE Creative Playground

Vite의 vanilla-ts 템플릿으로 만든 독립 프로젝트입니다. 잠금 화면에서 웹캠을 미리 준비합니다. 임의의 문자열을 입력하고 Enter를 누르면 첫 카메라 프레임을 준비한 뒤 회색 데스크톱으로 전환합니다. 잠금 해제 시 CAMERA 창이 자동으로 열립니다. 창을 닫거나 최소화한 뒤 메뉴바의 카메라 아이콘에서 Open CAMERA로 다시 열 수 있습니다. 미리보기, 손 추적, 카메라 앱은 같은 카메라 연결을 사용합니다. 카메라를 사용할 수 없어도 회색 데스크톱을 열 수 있습니다. 데스크톱 아이콘은 마우스로 한 번 클릭해 열고 드래그해 위치를 바꿀 수 있습니다. Finder 창은 제목 표시줄로 이동하고 오른쪽 아래 모서리로 크기를 조절합니다. 왼쪽 위 닫기 버튼은 클릭하면 바로 작동합니다.

## 실행

Node.js 22.18 이상이 필요합니다. 현재 작업 폴더에는 의존성과 개발용 인증서가 준비되어 있습니다. 새로 복사한 프로젝트에 의존성이 없으면 `npm ci`를 실행합니다.

```sh
cd "/Users/isuyeon/Downloads/Interactive Desktop/3ce-creative-playground"
npm run dev
```

호스트 PC는 `https://localhost:5173`, 같은 네트워크의 다른 PC는 Vite가 표시하는 `Network` 주소로 접속합니다. 이 주소의 포트는 `5173`입니다. 빌드 명령은 `npm run build`이며 결과는 `dist/`에 생성됩니다.

### 로컬 HTTPS와 카메라 권한

- 새 호스트나 IP 변경 시 mkcert를 설치한 뒤 `npm run cert:setup`을 실행합니다. 현재 네트워크 인터페이스의 IPv4, `localhost`, `127.0.0.1`, `::1`이 포함됩니다. 인터페이스에 표시되지 않는 IP를 추가하려면 `npm run cert:setup -- 192.168.1.20`처럼 인수로 넘깁니다. 재발급 후에는 Vite를 다시 실행합니다. [mkcert 설치 방법](https://github.com/FiloSottile/mkcert#installation)
- 인증서 경고를 해결하려면 접속하는 PC에서 이 프로젝트의 `.certs/ca/rootCA.pem`을 신뢰하는 루트 인증서로 등록합니다. macOS에서는 Keychain Access, Windows에서는 현재 사용자의 신뢰할 수 있는 루트 인증 기관 저장소를 사용합니다. 다른 PC에 전달하는 파일은 `rootCA.pem` 한 개입니다. `rootCA-key.pem`과 `desktop-key.pem`은 발급 PC 내부에 보관합니다. [mkcert의 다른 PC 신뢰 설정](https://github.com/FiloSottile/mkcert#installing-the-ca-on-other-systems)
- 호스트 Mac에서도 인증서 신뢰 등록이 필요합니다. 현재 프로젝트에 준비된 mkcert 실행 파일을 사용하려면 프로젝트에서 아래 명령을 실행합니다. `mkcert`가 PATH에 있는 경우 실행 파일 부분을 `mkcert`로 바꿉니다.

  ```sh
  CAROOT="$PWD/.certs/ca" ./.local/bin/mkcert -install
  ```

- HTTPS 주소를 다시 열어 브라우저의 사이트 카메라 권한과 OS의 브라우저 카메라 권한을 허용합니다. 데스크톱 메뉴바의 카메라 아이콘에서 연결을 다시 시도할 수 있습니다. 다른 PC에서 주소 자체가 열리지 않으면 호스트 방화벽의 5173 포트 접근과 같은 네트워크 연결을 확인합니다. [Vite 네트워크 옵션](https://vite.dev/config/server-options.html#server-host), [브라우저 카메라 접근 요건](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- 브라우저가 카메라 이름을 공개하면 FaceTime HD Camera 등 내장 장치를 우선하고 iPhone 및 Continuity Camera를 제외합니다. 최초 허용 전에는 장치 이름이 가려질 수 있어, 손 추적과 앱에 스트림을 연결하기 전에 장치 이름을 다시 확인합니다. iPhone을 장치 목록에서 제외하려면 iPhone 설정의 일반 → AirPlay 및 연속성에서 연속성 카메라를 끕니다. [Apple 연속성 카메라 안내](https://support.apple.com/102546)

## GitHub Pages 배포

1. [저장소의 Pages 설정](https://github.com/2soo1207-bit/Interactive_Desktop/settings/pages)에서 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다.
2. 배포 설정을 커밋하고 `main`에 푸시합니다. **Actions → Deploy to GitHub Pages**에서 실행 결과를 확인합니다. 푸시한 뒤에 Pages를 활성화했다면 이 화면의 **Run workflow**에서 `main`을 선택합니다.
3. 배포가 완료되면 [Interactive Desktop 배포 주소](https://2soo1207-bit.github.io/Interactive_Desktop/)로 접속하고 브라우저에서 카메라를 허용합니다. GitHub Free에서는 공개 저장소에 Pages를 사용할 수 있고, 비공개 저장소는 지원 요금제가 필요합니다. [GitHub Pages 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages)

`npm run build:pages`로 Pages용 빌드를 로컬에서도 확인할 수 있습니다. 워크플로는 Pages 설정에서 배포 주소의 하위 경로를 읽고 `dist/`를 게시합니다. 기본 로컬 경로는 `/Interactive_Desktop/`이며 `PAGES_BASE_PATH`로 재정의할 수 있습니다. 개발용 HTTPS 인증서 없이 빌드되며 배포 환경은 GitHub의 HTTPS를 사용합니다.

YouTube 목록은 배포 때 받아 정적 JSON으로 포함하고 매주 월요일에 갱신합니다. 공개 저장소의 활동이 60일 동안 없으면 예약 실행이 중지될 수 있으며 **Actions**에서 다시 활성화할 수 있습니다. 선택 사항인 `YOUTUBE_API_KEY`는 **Settings → Secrets and variables → Actions → Secrets**에 등록하면 빌드에서만 사용됩니다. 기본값은 키가 필요 없는 oEmbed입니다. [GitHub Actions 예약 실행 안내](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

공유 MEMO를 사용하려면 위 Actions 설정의 **Variables**에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`를 등록하고 다시 배포합니다. 두 변수 없이도 이 브라우저의 방명록은 IndexedDB에 저장됩니다. 기존 영상 목록 서버를 이용하려면 같은 곳에 `VITE_YOUTUBE_FEED_URL`을 등록합니다.

## 폴더 구성

```text
public/brand/                 프로필 로고 및 브랜드 이미지
public/public-icons/          데스크톱 아이콘 PNG
apps/                         앱 소스, 실행 HTML, 개별 에셋
public/app-assets/            로컬 MediaPipe Hands 런타임과 라이선스
src/desktop/                  잠금 화면, 메뉴바, 아이콘 배치, 창 관리
src/core/                     웹캠, 시계, 마우스·손 입력
src/apps/                     앱 목록, 아이콘 설정, 실행 환경, 기존 파일 저장소
src/appearance.ts             프로필, 로고 경로
server/youtube-feed.ts        3CE 공식 YouTube 목록 불러오기
supabase/guestbook.sql        공유 방명록 테이블과 권한 설정
templates/standalone-app/     독립 앱 HTML 시작점
scripts/setup-cert.ts         이 PC에 맞는 mkcert 인증서 생성
vite.config.ts                HTTPS와 LAN 설정
.certs/                       인증서와 비밀키, Git에서 제외
```

## 브랜드 자산 교체

`public/brand/`에 자산을 추가하고 `src/appearance.ts`에서 프로필 이미지, 이름, 로고 경로를 바꿉니다. 잠금 화면과 데스크톱의 배경색은 `src/style.css`의 `--screen-background`에서 바꿉니다. 데스크톱 아이콘 이미지와 이름은 `src/apps/desktop-icons.ts`에서 바꿉니다. 이미지 경로는 `public/`을 기준으로 지정하고, 파일명에 공백이 있으면 그대로 적습니다.

## 독립 앱 연결

MOTION LAB의 **I LOVE 3CE**, GAMES의 **Pillow Game**과 **HONEY TTEOK**, 데스크톱의 **PHOTO BOOTH**와 **YouTube**는 메뉴바 아래의 전체화면 영역에 표시됩니다. 왼쪽 위 닫기 버튼을 누르면 열어 둔 창과 데스크톱으로 돌아갑니다. **MEMO** 방명록은 데스크톱 중앙의 독립 창으로 열리며 제목 표시줄을 잡아 옮길 수 있습니다. **GALLERY**에는 `src/apps/catalog.ts`에서 `items`나 앱 `entry`를 지정해 콘텐츠를 연결할 수 있습니다.

Finder 창의 제목을 누르면 폴더를 전환할 수 있습니다. 탐색 기록은 창마다 저장되며 뒤로·앞으로 버튼으로 이동합니다. 노란 버튼으로 최소화한 창은 해당 창을 처음 열었던 데스크톱 폴더 아이콘에서 복원합니다.

1. 새 Vite 앱의 `index.html`과 소스 및 에셋을 `apps/<이름>/`에 둡니다. 빌드에서 각 폴더의 `index.html`을 진입점으로 찾습니다. 이미 빌드한 정적 앱은 `public/apps/<이름>/`에 둘 수 있습니다.
2. `src/apps/catalog.ts`의 `motionLab` 또는 `games`에 항목을 추가합니다. `id`, `name`, `entry`를 지정하고, PNG나 SVG를 `public/brand/`에 추가한 뒤 `iconImage`에 `'brand/example.png'`처럼 적습니다.
3. 카메라를 쓰는 앱은 `usesCamera: true`, 데스크톱 오디오 출력을 사용하는 앱은 `usesAudio: true`를 설정합니다. 내장 앱은 데스크톱의 영상 트랙 복제본을 받아 사용하고, 앱 종료 시 해당 복제본을 정리합니다. 카메라 앱을 독립 주소에서 열면 자체 권한을 요청합니다.

기존 파일 저장소와 Photo Booth 다운로드는 계속 사용할 수 있습니다. 내장 앱이 `window.parent.postMessage({ type: 'playground:save-file', file }, location.origin)`로 `File`을 보내면 상위 창은 `playground:file-saved` 또는 `playground:file-error`로 응답합니다.

## HONEY TTEOK 설정

`apps/honey-tteok/config.ts`에서 색상, 점수, 라운드 시간, 낙하 속도와 폭탄 타임을 설정합니다. 실제 꿀떡 사진과 립제품 팩샷은 `public/app-assets/honey-tteok/`에 두고 색상별 `tteokImage`와 `productImage`에 `app-assets/honey-tteok/파일명`을 지정합니다. 최고 기록은 이 브라우저에 TOP 10으로 저장됩니다. 온라인 기록과 연결할 때는 `apps/honey-tteok/ranking.ts`의 `RankingStore` 인터페이스를 사용할 수 있습니다.

## YouTube 영상 목록

3CE 공식 채널에서 가로형으로 확인한 영상 ID와 재생 순서를 `apps/youtube/landscape-videos.ts`에서 관리합니다. 공개 API에는 쇼츠 여부나 실제 영상 비율을 확정할 필드가 없습니다. 새 영상은 공식 채널에서 일반 가로형 재생을 확인한 뒤 ID를 추가합니다. Vite 서버의 `GET /api/3ce-videos`에서 API 키가 있으면 YouTube Data API의 채널, 공개 상태, 임베드 가능 여부 및 제목을 확인하고, 기본 설정에서는 공식 oEmbed 메타데이터로 채널과 제목을 확인합니다. Data API를 사용하려면 서버의 `.env.local`에 `YOUTUBE_API_KEY`를 넣습니다. [3CE 공식 채널](https://www.youtube.com/@3ce_official/videos), [YouTube 영상 메타데이터](https://developers.google.com/youtube/v3/docs/videos)

앱을 열면 플레이어가 화면에 들어오는 즉시 첫 영상을 소리와 함께 재생합니다. 브라우저가 차단하면 음소거로 재시도합니다. 음소거로 시작한 경우에는 **소리 켜기**, 자동재생이 시작되지 않은 경우에는 **소리와 함께 재생**을 사용할 수 있습니다. 개발자 도구 콘솔의 `[3CE YouTube]` 메시지에서 재생 상태, 음소거, 음량, 차단과 임베드 오류를 확인할 수 있습니다. [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference#Events), [YouTube 임베드 정책](https://developers.google.com/youtube/terms/required-minimum-functionality)

GitHub Pages 빌드는 검증한 영상 목록을 `api/3ce-videos.json`으로 게시합니다. 별도 영상 목록 서버를 사용하려면 서버의 `fetchChannelList()`를 호출하는 GET 경로를 연결합니다. 응답은 `{ fetchedAt, videos: [{ id, channelId, title }] }` 형태입니다. 경로가 기본 주소와 다르면 빌드 전에 `VITE_YOUTUBE_FEED_URL`을 지정합니다. 확인한 지 30일 이내인 저장 목록이 있으면 첫 영상을 먼저 준비하고 목록 갱신은 백그라운드에서 진행합니다.

## MEMO 방명록 설정

기본 방명록은 브라우저의 IndexedDB에 저장되며 같은 주소를 다시 열면 읽을 수 있습니다. 방문자끼리 공유하려면 Supabase 프로젝트에서 `supabase/guestbook.sql`을 한 번 실행하고, 프로젝트 루트의 `.env.local`에 다음 공개 설정을 넣습니다. 실행 중인 Vite 프로세스는 설정 후 다시 시작하고, 정적 배포본은 다시 빌드합니다. [Supabase 공개 키](https://supabase.com/docs/guides/api/api-keys), [Supabase 접근 권한](https://supabase.com/docs/guides/database/postgres/row-level-security)

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

방문자 역할에는 게시물 읽기와 입력만 허용합니다. 제출 ID는 중복 등록을 막고, DB가 작성 시각을 정합니다. 입력 길이는 브라우저와 테이블에서 검사합니다. 브라우저에 작성한 메모와 공유 방명록의 기록은 각 저장소에서 읽습니다.

## Hand Tracking

웹캠 데스크톱이 열리면 폴더와 프로그램이 각 그룹에 고정 정렬되고 **Hand Tracking**이 자동으로 시작됩니다. 데스크톱 아이콘, 폴더와 각 앱의 버튼을 검지로 1.5초간 가리키면 원형 표시가 차고 한 번 실행됩니다. 커서가 대상을 벗어나거나 손 인식이 끊기면 진행 표시가 초기화됩니다. 선택 시간은 `src/core/dwell-selection.ts`의 `DWELL_DURATION`에서 관리합니다.

엄지와 검지로 아이콘이나 창 제목 표시줄을 약 0.3초 이상 집은 뒤 옮기고 손가락을 떼면 해당 위치에 놓입니다. 집기 시작하면 선택 진행이 초기화되며 집고 있는 동안에는 진행되지 않습니다.

인식은 연결된 웹캠을 공유합니다. 세 앱의 카메라 영역에서는 커서 점이 숨겨지고, 버튼을 선택할 때는 원형 진행 표시가 나타납니다. 아트워크와 게임은 각자의 손동작을 처리합니다. 카메라 연결에 실패해도 마우스로 조작할 수 있습니다. 데스크톱 손 인식은 Web Worker에서 실행되고, 복사한 앱은 원본과 같은 MediaPipe Hands 런타임을 로컬에서 읽습니다. [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web)

## 앱 사운드

세 앱은 데스크톱의 오디오 출력을 공유합니다. 앱 실행 시 재생을 준비하고, 브라우저가 차단한 경우에만 **Enable sound** 버튼이 표시됩니다. I LOVE 3CE의 하트 효과음과 단어 음성, Pillow Game의 게임 효과음, PHOTO BOOTH의 셔터와 인화 소리가 각 앱에서 재생됩니다.

## 임시 이미지

내장 ImageGen 도구로 생성하여 `public/brand/wallpaper.jpg`와 `public/brand/profile.jpg`에 저장했습니다.

<details>
<summary>이미지 생성 프롬프트</summary>

**Wallpaper**

Create a photorealistic 16:9 landscape desktop wallpaper for a contemporary Korean beauty brand's interactive desktop. A single sculptural ribbon of pale pink translucent glass and satin-chrome, like a large loop of folded cellophane with beautifully imperfect softened edges, fills the lower half and curls up into the far right third. A deep almost-black blackcurrant and dusty mauve seamless studio backdrop with soft plum haze. Strong cinematic lateral lighting creates soft dusty-rose reflections and a few bright opalescent edges. The image feels like a gallery installation and luxury cosmetics campaign, refined and restrained, very high fidelity. Use an asymmetrical widescreen composition. Leave the upper middle and the far left mostly deep plum, soft and uncluttered so white interface text will read. The lower center has some dimensional detail but no hard focal point so an avatar can overlay it. No people, products, type, letters, interface elements, text or watermark.

**Profile**

Generate a square 1:1 macro studio photograph for a small circular user avatar in a contemporary Korean beauty brand desktop. One distinctive, centered, pale rose-quartz glass rosette with four rounded sculptural petals, subtle lavender refraction, and a tiny recessed center, on a solid deep dusty-plum background. Strong legible silhouette at 72 pixels, refined design object with soft specular highlights, simple composition, the rosette occupies 66% of the square. Full bleed, no ring, no cropping of the rosette, no letters, text or watermark.

</details>

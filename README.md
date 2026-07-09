# nonMarket 이상행동 탐지 데모

저장된 영상을 업로드하면 **포즈 추출 → 이상행동 클립 탐지**까지 자동으로 돌고,
로그인한 유저는 본인이 올린 영상의 보고서(이상행동 클립 목록)만 볼 수 있는 데모.

## 아키텍처

```
┌─────────────┐   업로드(브라우저→Storage 직접)   ┌──────────────────┐
│   Next.js   │ ───────────────────────────────▶ │ Supabase          │
│  (web/)     │                                   │  - Auth            │
│ 로그인/업로드│ ◀──── videos/anomaly_events 조회 ──│  - Postgres(RLS)   │
│ /보고서 UI  │                                   │  - Storage(videos, │
└─────────────┘                                   │    clips 버킷)     │
                                                   └─────────┬──────────┘
                                                             │ status='uploaded' 폴링
                                                             ▼
                                                   ┌──────────────────┐
                                                   │ Python Worker     │
                                                   │  (worker/)        │
                                                   │  YOLO11-pose      │
                                                   │  + ByteTrack      │
                                                   │  → 오토인코더     │
                                                   │    이상행동 탐지  │
                                                   │  → ffmpeg 클립    │
                                                   └──────────────────┘
```

- **web/** — Next.js(App Router) 프론트엔드. Supabase Auth로 로그인, 영상 업로드는
  브라우저에서 Supabase Storage로 직접 업로드(서버를 거치지 않음), 보고서는 DB를
  RLS로 필터링해 본인 것만 조회.
- **worker/** — 상시 실행되는 Python 프로세스. `videos` 테이블을 폴링하다가 새 업로드를
  발견하면 실제로 YOLO11-pose + ByteTrack으로 포즈를 뽑고, per-video 오토인코더로
  이상행동 구간을 탐지한 뒤 ffmpeg으로 클립을 잘라 Storage에 올리고 결과를 DB에 씀.
  ML 추론은 오래 걸리고 무거우므로 Vercel 서버리스가 아니라 별도 프로세스/서버(로컬,
  또는 GPU 서버)에서 계속 떠 있는 것을 전제로 한다.
- **supabase/schema.sql** — 테이블(`videos`, `anomaly_events`), RLS 정책,
  Storage 버킷(`videos`, `clips`) + 버킷 정책.

## 유저별 보고서 격리 방식

- `videos`, `anomaly_events` 테이블 모두 `user_id` 컬럼 + RLS `auth.uid() = user_id`
  정책으로 본인 행만 select 가능.
- Storage도 업로드 경로를 `{user_id}/{video_id}/...`로 강제하고, 정책에서
  `(storage.foldername(name))[1] = auth.uid()`를 체크해 본인 폴더만 접근 가능.
- 워커는 `service_role` 키를 쓰므로 RLS를 우회해 모든 유저의 대기 작업을 처리할 수 있음
  (이 키는 서버 프로세스에만 있고 브라우저에는 절대 노출되지 않음).

## 처음 셋업하기

### 0. Supabase 프로젝트 준비

1. Supabase 프로젝트의 SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql) 전체 실행.
2. Authentication → Providers에서 Email 로그인 활성화(기본값이면 그대로 둬도 됨).
3. Project Settings → API 에서 `Project URL`, `anon public key`, `service_role key` 확인.

### 1. 프론트엔드 (web/)

```bash
cd web
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 채우기
npm install
npm run dev                  # http://localhost:3000
```

### 2. 워커 (worker/)

```bash
cd worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # SUPABASE_URL / SUPABASE_SERVICE_KEY(!) 채우기
python worker.py             # 계속 떠서 새 업로드를 감시
```

- 최초 실행 시 `ultralytics`가 `yolo11n-pose.pt` 가중치를 자동 다운로드합니다(인터넷 필요).
- `ffmpeg` 바이너리가 시스템에 설치되어 있어야 합니다 (`brew install ffmpeg` 등).

### 3. 데모 흐름 확인

1. `web` 앱에서 회원가입 → 로그인.
2. 업로드 페이지에서 영상 파일 업로드 → `videos` row가 `status='uploaded'`로 생성됨.
3. `worker.py`가 폴링 주기(기본 5초) 내에 이를 집어가 `processing`으로 바꾸고 분석 시작.
4. 분석 완료 후 `status='done'` + `anomaly_events`에 탐지된 클립들이 채워짐.
5. 영상 상세 페이지(`/dashboard/videos/[id]`)에서 원본 영상과 이상행동 클립들을 확인.

## 이상행동 탐지 방식 (현재 구현)

`worker/pipeline/anomaly_detection.py` 참고. 사전학습된 "정상 행동" 레퍼런스가 없는
콜드스타트 데모이므로, **영상 1개당** 오토인코더를 새로 학습시키는 근사적인 방식을 쓴다:

1. 각 person track의 정규화된(hip 중심 원점, bbox 스케일) keypoint 시퀀스를 슬라이딩
   윈도우로 자름.
2. 영상 내 모든 윈도우로 작은 MLP 오토인코더를 학습 — 절대다수인 "정상" 동작 패턴을
   우선적으로 잘 재구성하도록 수렴한다는 가정.
3. 재구성 오차가 `평균 + k·표준편차`를 넘는 윈도우를 이상행동 후보로 플래그하고,
   인접 윈도우를 하나의 구간으로 병합해 클립으로 추출.

실서비스로 넘어갈 때는 매 영상마다 새로 학습하는 대신, 정상 영상들로 미리 학습시킨
모델 체크포인트를 로드해 재사용하도록 `train_autoencoder` 호출부만 교체하면 된다.

## 알려진 제약 / 다음 단계

- 워커는 단일 프로세스 순차 폴링이라 동시 처리량이 낮다. 데모 이후엔 큐(예: Supabase
  Edge Function + 별도 job queue, 혹은 Redis/RQ)로 교체 권장.
- 오토인코더는 영상마다 처음부터 학습하므로 매우 짧은 영상(윈도우 8개 미만)에서는
  탐지를 건너뛴다.
- YOLO11은 AGPL-3.0 라이선스. 수업/연구용 데모는 문제없으나, 상용 SaaS로 배포 시엔
  Ultralytics Enterprise License 또는 Apache 계열 대체 모델 검토 필요.

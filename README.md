# VOLTA — Next.js 암호화폐 거래소 (deployable)

onexcore와 같은 스택(**Next.js + Tailwind + 다크테마 + Inter**)으로 만든 자체 브랜드 크립토 거래소 템플릿.
요청한 4가지가 모두 들어 있습니다.

| # | 항목 | 구현 |
|---|---|---|
| 1 | **실시세** | `lib/useBinanceStream.js` — Binance 공개 WebSocket(`@ticker`) 구독, 실패 시 mock 폴백 |
| 2 | **TradingView 차트** | `components/trade/TradingViewChart.jsx` — tv.js Advanced Chart 위젯 |
| 3 | **Next.js 이식** | App Router 프로젝트(`app/`), 배포 가능 (`npm run build`) |
| 4 | **브랜드 커스터마이징** | `lib/brand.config.js` 한 파일로 이름·색상·문구·코인·기능 전부 제어 |

## 실행
```bash
cd volta-next
npm install
npm run dev     # http://localhost:3100
```
- `/` 랜딩 → 로그인/회원가입(데모) → `/trade` 거래 대시보드
- 실시세·TradingView는 **네트워크 연결 시** 동작(오프라인이면 시세는 자동 mock 폴백)

## 배포
```bash
npm run build && npm start          # 자체 호스팅
# 또는 Vercel: 저장소 연결 후 자동 빌드
```

## 커스터마이징 (#4)
`lib/brand.config.js` 만 편집:
- `name`, `logoMark`, `heroTitle`, `heroSubtitle` — 브랜드/카피
- `colors` — 전체 팔레트(레이아웃에서 CSS 변수로 주입)
- `coins` — 마켓 목록(Binance 심볼 + TradingView 심볼 매핑)
- `stats`, `features` — 랜딩 지표/기능 카드

## 구조
```
app/
  layout.jsx          브랜드 색상 주입 + 폰트
  page.jsx            랜딩(히어로/실시세/레버리지/기능/CTA/모달)
  trade/page.jsx      거래 대시보드(마켓·TV차트·호가·주문·잔고)
components/trade/
  TradingViewChart.jsx
lib/
  brand.config.js     ← 커스터마이징 진입점
  useBinanceStream.js ← 실시세 훅
```

## 회원 추적 (아이디·로그인·수익률)
관리자가 **누가 가입/로그인했는지, 각 회원의 모의수익률**을 볼 수 있습니다. **비밀번호는 저장·열람하지 않습니다.**

- `/` 에서 아이디+비밀번호로 가입/로그인 → 거래화면 `/trade?id=<아이디>`
- `/admin` (데모 계정 **admin / volta-admin**) → "추적된 회원" 표: 아이디·최초가입·최근로그인·로그인수·모의수익률·평가자산
- 저장 위치: **Supabase 설정 시 DB**, 미설정 시 **localStorage 폴백**(같은 브라우저 범위)

### 실제 인증(Supabase) 연결 — 선택
1. Supabase 프로젝트 생성 → `supabase/schema.sql` 실행 (테이블 + RLS)
2. `.env.local.example` → `.env.local` 로 복사, `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` 입력
3. `npm run dev` 재시작 → 비밀번호는 Supabase Auth 가 **해시로만** 보관(운영자도 원문 조회 불가)
4. 관리자 계정: 해당 유저 `app_metadata.role = 'admin'` 지정 시 전체 조회 허용(RLS)

> 설계 원칙: 운영자는 **아이디·로그인이력·수익률**만 봅니다. **비밀번호 원문은 누구도 볼 수 없습니다** — 이게 정상 서비스의 필수 원칙입니다.

## 안내
- 로그인/회원가입/주문은 **데모(페이퍼)** 로, 어떤 데이터도 저장·전송하지 않습니다.
- 시세는 Binance 공개 데이터 표시용이며, 실제 주문은 어떤 거래소에도 전송되지 않습니다.
- 특정 실서비스를 복제한 것이 아니라, 동일 계열 기술로 만든 독립 템플릿입니다.

/**
 * ── BRAND CONFIG (#4 customization) ──────────────────────────────
 * 이 파일 하나만 바꾸면 사이트 전체 브랜드/색상/문구/코인이 바뀝니다.
 * 색상은 globals + layout에서 CSS 변수로 주입됩니다.
 */
export const brand = {
  name: "VOLTA",
  logoMark: "V",                 // 로고 사각형 안 글자 (또는 이미지 경로로 교체)
  tagline: "차세대 암호화폐 거래 플랫폼",
  heroTitle: ["차세대", "암호화폐 거래", "플랫폼"],  // 가운데 줄이 그라디언트 강조
  heroSubtitle: "강력한 매칭 엔진과 은행급 보안으로, 디지털 자산 거래 경험을 한 단계 끌어올리세요.",

  colors: {
    // slate + teal/emerald (onexcore 계열 팔레트)
    bg: "#020617", bg2: "#0f172a", panel: "#111c2e", panel2: "#17223a",
    line: "#24314a", ink: "#f1f5f9", muted: "#94a3b8", muted2: "#64748b",
    brand: "#14b8a6", brand2: "#10b981", accent: "#34d399",
    up: "#22c55e", down: "#f87171",
    grad: "linear-gradient(135deg,#14b8a6 0%,#10b981 55%,#059669 100%)",
  },

  stats: [
    { n: "99.9%", l: "업타임" },
    { n: "125x", l: "최대 레버리지" },
    { n: "24/7", l: "고객 지원" },
    { n: "200+", l: "거래 코인" },
  ],

  // 실시세를 받아올 마켓 (Binance 심볼 기준)
  coins: [
    { sym: "BTC", name: "Bitcoin",  binance: "btcusdt", tv: "BINANCE:BTCUSDT", color: "#f7931a", dec: 1, qdec: 5 },
    { sym: "ETH", name: "Ethereum", binance: "ethusdt", tv: "BINANCE:ETHUSDT", color: "#627eea", dec: 2, qdec: 4 },
    { sym: "SOL", name: "Solana",   binance: "solusdt", tv: "BINANCE:SOLUSDT", color: "#14f195", dec: 2, qdec: 2 },
    { sym: "XRP", name: "Ripple",   binance: "xrpusdt", tv: "BINANCE:XRPUSDT", color: "#5b6673", dec: 4, qdec: 1 },
    { sym: "BNB", name: "BNB",      binance: "bnbusdt", tv: "BINANCE:BNBUSDT", color: "#f0b90b", dec: 2, qdec: 3 },
    { sym: "ADA", name: "Cardano",  binance: "adausdt", tv: "BINANCE:ADAUSDT", color: "#0d4bd6", dec: 4, qdec: 1 },
  ],

  features: [
    { i: "🔒", t: "은행급 보안", d: "다층 보안 시스템으로 자산을 안전하게 보호합니다.", l: ["2단계 인증(2FA)", "콜드월렛 보관", "실시간 모니터링", "SSL 암호화"] },
    { i: "⚡", t: "초고속 체결", d: "고성능 매칭 엔진으로 신속·정확한 거래.", l: ["초당 100만건 처리", "실시간 시세", "즉시 체결", "낮은 지연"] },
    { i: "📊", t: "전문 차트", d: "TradingView 기반 전문 차트·분석 도구.", l: ["TradingView 차트", "100+ 기술지표", "다양한 차트타입", "커스텀 지표"] },
    { i: "💰", t: "유연한 레버리지", d: "전략에 맞춘 마진·포지션 관리.", l: ["최대 125배", "격리/교차 마진", "포지션 관리", "리스크 도구"] },
    { i: "🌐", t: "글로벌 서비스", d: "전 세계 어디서나 24시간 거래.", l: ["24/7 거래", "다국어 지원", "글로벌 유동성", "다중 통화"] },
    { i: "🎯", t: "다양한 상품", d: "현물·선물·스테이킹을 한 곳에서.", l: ["200+ 코인", "선물 거래", "스테이킹", "리워드"] },
  ],

  paperCashUSDT: 100000,   // 데모 페이퍼트레이딩 초기 잔고
};

/** CSS 변수 문자열로 변환 (layout에서 <body style>에 주입) */
export function brandCssVars(b = brand) {
  const c = b.colors;
  return {
    "--bg": c.bg, "--bg2": c.bg2, "--panel": c.panel, "--panel2": c.panel2,
    "--line": c.line, "--ink": c.ink, "--muted": c.muted, "--muted2": c.muted2,
    "--brand": c.brand, "--brand2": c.brand2, "--accent": c.accent,
    "--up": c.up, "--down": c.down, "--grad": c.grad,
  };
}

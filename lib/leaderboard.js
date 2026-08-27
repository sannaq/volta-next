/**
 * 모의투자 랭킹용 가상 트레이더 생성 (고정 시드 → 렌더링마다 동일).
 * 실제 사용자는 지갑 ROI 기준으로 이 목록에 끼워넣어 순위를 매긴다.
 * 전부 가짜 데이터이며 실제 인물/계정과 무관.
 */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HANDLES = [
  "btc_maximal", "코인장인", "moon_shot", "달까지간다", "존버왕", "leverage_king",
  "차트의신", "hodl_master", "스캘핑러", "goldencross", "빔타는사람", "risk_taker",
  "이평선매매", "whale_watcher", "단타치는곰", "diamond_hand", "추세추종", "alt_hunter",
  "물타기장인", "green_candle", "김프헌터", "quant_bot", "역추세맨", "산개미",
];

export function generateTraders(n = 24) {
  const rnd = mulberry32(20260827);
  const list = HANDLES.slice(0, n).map((h) => {
    // ROI 분포: 상위는 크게 +, 하위는 -로. 지수 분포 느낌
    const r = rnd();
    const roi = Math.round((Math.pow(r, 2.4) * 620 - 90) * 10) / 10; // 대략 -90% ~ +520%
    const trades = Math.floor(rnd() * 900 + 30);
    const winRate = Math.round((45 + rnd() * 45) * 10) / 10;
    const equity = Math.round(100000 * (1 + roi / 100));
    return { name: mask(h), handle: h, roi, trades, winRate, equity, isUser: false };
  });
  return list.sort((a, b) => b.roi - a.roi);
}

function mask(h) {
  if (h.length <= 2) return h;
  const keep = Math.max(1, Math.floor(h.length / 2));
  return h.slice(0, keep) + "*".repeat(Math.min(3, h.length - keep));
}

/** 사용자를 끼워넣고 순위 재계산 */
export function rankWithUser(traders, user) {
  const merged = [...traders, { ...user, isUser: true }].sort((a, b) => b.roi - a.roi);
  return merged.map((t, i) => ({ ...t, rank: i + 1 }));
}

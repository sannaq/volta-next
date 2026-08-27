/**
 * 관리자 대시보드용 **합성(가짜) 데모 데이터**.
 * 실제 회원/가입/입금 정보가 아니라, 고정 시드로 만들어낸 시뮬레이션 데이터다.
 * 실제 사용자 데이터는 이 앱 어디에도 저장/수집하지 않는다.
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
  "btc_maximal", "coinjang", "moon_shot", "moon2dal", "hodl_kim", "lev_king",
  "chartsin", "hodl_master", "scalp_lee", "goldcross", "beam_rider", "risktaker",
  "ma_trader", "whale_w", "danta_bear", "diamond_h", "trend_go", "alt_hunter",
  "mool_ta", "green_c", "kimp_h", "quantbot", "reverse_m", "sanant",
];

/** 하나의 앵커 시각을 넘겨받아(브라우저 Date) 상대 가입시각 생성 */
export function buildAdminData(nowMs) {
  const rnd = mulberry32(20260827);
  const DAY = 86400000;
  const accounts = HANDLES.map((h, i) => {
    const roi = Math.round((Math.pow(rnd(), 2.4) * 620 - 90) * 10) / 10;
    const equity = Math.round(100000 * (1 + roi / 100));
    const trades = Math.floor(rnd() * 900 + 20);
    const joinedAgo = Math.floor(rnd() * 60 * DAY);      // 최근 60일 내
    const lastAgo = Math.floor(rnd() * 3 * DAY);
    const deposits = Math.floor(rnd() * 5);              // 가상 충전 횟수
    const status = rnd() > 0.15 ? "active" : "dormant";
    return {
      id: "MOCK-" + String(1001 + i),
      handle: h,
      emailMasked: maskEmail(h),                          // 마스킹된 가짜 이메일
      roi, equity, trades, deposits, status,
      joinedAt: nowMs - joinedAgo,
      lastActive: nowMs - lastAgo,
    };
  });

  const totalEquity = accounts.reduce((s, a) => s + a.equity, 0);
  const avgRoi = Math.round((accounts.reduce((s, a) => s + a.roi, 0) / accounts.length) * 10) / 10;
  const active = accounts.filter((a) => a.status === "active").length;
  const newToday = accounts.filter((a) => nowMs - a.joinedAt < DAY).length;
  const totalTrades = accounts.reduce((s, a) => s + a.trades, 0);

  // ROI 분포 히스토그램 버킷
  const buckets = [
    { label: "<0%", min: -1e9, max: 0 },
    { label: "0–50%", min: 0, max: 50 },
    { label: "50–150%", min: 50, max: 150 },
    { label: "150–300%", min: 150, max: 300 },
    { label: "300%+", min: 300, max: 1e9 },
  ].map((b) => ({ ...b, count: accounts.filter((a) => a.roi >= b.min && a.roi < b.max).length }));

  // 최근 7일 가입 추이 (합성)
  const signupTrend = Array.from({ length: 7 }, (_, i) => {
    const day = 6 - i;
    return { day, count: accounts.filter((a) => {
      const d = Math.floor((nowMs - a.joinedAt) / DAY);
      return d === day;
    }).length + Math.floor(rnd() * 3) };
  });

  return {
    kpis: { total: accounts.length, active, newToday, avgRoi, totalTrades, totalEquity },
    accounts: accounts.sort((a, b) => b.joinedAt - a.joinedAt),
    buckets, signupTrend,
  };
}

function maskEmail(h) {
  const keep = Math.max(1, Math.floor(h.length / 2));
  return h.slice(0, keep) + "***@***.com";
}

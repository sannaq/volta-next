"use client";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * 로그인 이력 + 회원별 모의수익률 추적.
 *  - 저장 항목: username(아이디), 최초/최근 로그인, 로그인 횟수, ROI, 평가자산
 *  - 저장하지 않는 것: 비밀번호 (Supabase Auth 가 해시로만 처리, 원문 미보관)
 *
 * Supabase 설정 시 user_tracking / login_events 테이블 사용,
 * 미설정 시 localStorage 폴백(같은 브라우저 범위)으로 동작.
 */
const LS_KEY = "volta_tracking_v1";

function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (_) { return {}; }
}
function lsSave(map) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (_) {}
}

/** 로그인 이벤트 기록 */
export async function recordLogin(username) {
  const u = String(username || "").trim();
  if (!u) return;
  const now = Date.now();

  // localStorage (항상 기록 → 데모 즉시 동작)
  const map = lsLoad();
  const e = map[u] || { username: u, firstSeen: now, loginCount: 0, roi: 0, equity: 0, logins: [] };
  e.lastLogin = now; e.loginCount = (e.loginCount || 0) + 1;
  e.logins = [now, ...(e.logins || [])].slice(0, 20);
  map[u] = e; lsSave(map);

  // Supabase (설정 시)
  if (supabaseEnabled) {
    try {
      await supabase.from("login_events").insert({ username: u, at: new Date(now).toISOString() });
      await supabase.from("user_tracking").upsert({
        username: u, last_login: new Date(now).toISOString(),
      }, { onConflict: "username" });
      // 로그인 횟수 증가 + 최초가입 1회 기록 (컬럼 없을 수 있으니 별도 try)
      try {
        const { data } = await supabase.from("user_tracking").select("login_count, first_seen").eq("username", u).maybeSingle();
        const login_count = ((data && data.login_count) || 0) + 1;
        const first_seen = (data && data.first_seen) || new Date(now).toISOString();
        await supabase.from("user_tracking").upsert({ username: u, login_count, first_seen }, { onConflict: "username" });
      } catch (_) {}
    } catch (_) {}
  }
}

/** 회원별 모의수익률/평가자산 갱신 */
export async function recordProfit(username, roi, equity) {
  const u = String(username || "").trim();
  if (!u) return;
  const map = lsLoad();
  const e = map[u] || { username: u, firstSeen: Date.now(), loginCount: 0, logins: [] };
  e.roi = Math.round(roi * 100) / 100; e.equity = Math.round(equity); e.updatedAt = Date.now();
  map[u] = e; lsSave(map);

  if (supabaseEnabled) {
    try {
      await supabase.from("user_tracking").upsert({
        username: u, roi: e.roi, equity: e.equity, updated_at: new Date().toISOString(),
      }, { onConflict: "username" });
    } catch (_) {}
  }
}

/** 관리자용: 추적 중인 회원 목록 (수익률 내림차순) */
export async function listTrackedUsers() {
  if (supabaseEnabled) {
    try {
      const { data } = await supabase.from("user_tracking").select("*").order("roi", { ascending: false });
      if (data) return data.map((r) => ({
        username: r.username, firstSeen: r.first_seen ? +new Date(r.first_seen) : null,
        lastLogin: r.last_login ? +new Date(r.last_login) : null, loginCount: r.login_count || 0,
        roi: r.roi || 0, equity: r.equity || 0,
      }));
    } catch (_) {}
  }
  const map = lsLoad();
  return Object.values(map).sort((a, b) => (b.roi || 0) - (a.roi || 0));
}

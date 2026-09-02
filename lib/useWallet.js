"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { brand } from "./brand.config";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * 모의투자(페이퍼) 지갑 — 실제 결제/입금은 전혀 없음.
 * 저장 우선순위:
 *   1) Supabase `wallets` 테이블 (계정별) — 세션/기기/인앱브라우저를 넘어 영구 유지
 *   2) localStorage (계정별 키) — Supabase 미설정 시 폴백
 * userId 별로 지갑을 분리 보관한다.
 */
const INITIAL = brand.paperCashUSDT;
const LS_PREFIX = "volta_paper_wallet_v4_";
const LS_LEGACY = "volta_paper_wallet_v4"; // 예전 전역 키(마이그레이션용)

export function freshWallet() { return fresh(); }
export const WALLET_INITIAL = INITIAL;

// 포지션 키를 sym#side 복합키로 정규화(양방향 헤지). 구 형식({BTC:{side,...}})도 변환.
export function normalizePositions(positions) {
  if (!positions || typeof positions !== "object") return {};
  const out = {};
  for (const k in positions) {
    const p = positions[k];
    if (!p || typeof p !== "object" || !(p.qty > 0)) continue;
    const sym = p.sym || (k.includes("#") ? k.split("#")[0] : k);
    const side = p.side || (k.includes("#") ? k.split("#")[1] : "long");
    const key = sym + "#" + side;
    if (out[key]) { // 혹시 중복이면 병합(가중평균)
      const e = out[key], nq = e.qty + p.qty;
      out[key] = { ...e, qty: nq, entry: (e.entry * e.qty + p.entry * p.qty) / nq, margin: e.margin + p.margin };
    } else out[key] = { ...p, sym, side };
  }
  return out;
}

function fresh() {
  return {
    cashUSDT: INITIAL,
    positions: {},          // sym → { side, qty, entry, margin, tp, sl }
    openOrders: [],
    history: [],
    realizedPnL: 0,
    ledger: [{ type: "reset", amt: INITIAL, t: Date.now() }],
    principal: INITIAL,
  };
}

export function useWallet(userId = "guest") {
  const uid = String(userId || "guest");
  const KEY = LS_PREFIX + uid;
  const [wallet, setWallet] = useState(fresh);
  const loaded = useRef(false);
  const saveTimer = useRef(null);
  const pendingRef = useRef(null); // { uid, data } — 아직 서버에 안 올라간 최신 지갑

  function pushSupabase(u, data) {
    if (!(supabaseEnabled && u && u !== "guest")) return;
    try { supabase.from("wallets").upsert({ username: u, data, updated_at: new Date().toISOString() }, { onConflict: "username" }).then(() => {}, () => {}); } catch (_) {}
  }
  function flushPending() {
    const p = pendingRef.current; if (!p) return; pendingRef.current = null;
    clearTimeout(saveTimer.current); pushSupabase(p.uid, p.data);
  }

  // hydrate (계정 변경 시 재로드) — Supabase/localStorage 중 _ts(최종수정) 최신본 채택
  useEffect(() => {
    let alive = true;
    loaded.current = false;
    (async () => {
      let sb = null, ls = null, legacy = null;
      if (supabaseEnabled && uid && uid !== "guest") {
        try { const { data } = await supabase.from("wallets").select("data").eq("username", uid).maybeSingle(); if (data?.data) sb = data.data; } catch (_) {}
      }
      try { const raw = localStorage.getItem(KEY); if (raw) ls = JSON.parse(raw); } catch (_) {}
      try { const old = localStorage.getItem(LS_LEGACY); if (old) legacy = JSON.parse(old); } catch (_) {}
      // 최신본 선택: 서버를 무조건 우선하지 않음 → 로컬 최신 리셋/거래가 되살아나지 않게
      let chosen = null;
      if (sb && ls) chosen = ((ls._ts || 0) >= (sb._ts || 0)) ? ls : sb;
      else chosen = sb || ls || legacy;
      const next = chosen ? { ...fresh(), ...chosen } : fresh();
      next.positions = normalizePositions(next.positions); // 헤지 복합키로 정규화(구 지갑 마이그레이션)
      if (!alive) return;
      setWallet(next);
      loaded.current = true;
      // 로컬이 서버보다 최신(또는 서버 없음)이면 서버에 즉시 반영 → 불일치 해소
      if (ls && (!sb || (ls._ts || 0) > (sb._ts || 0))) pushSupabase(uid, next);
    })();
    return () => { alive = false; };
  }, [uid]); // eslint-disable-line

  // persist: localStorage 즉시(+_ts) / Supabase 디바운스. 클린업에서 취소하지 않고 flush 한다.
  useEffect(() => {
    if (!loaded.current) return;
    const stamped = { ...wallet, _ts: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(stamped)); } catch (_) {}
    if (supabaseEnabled && uid && uid !== "guest") {
      pendingRef.current = { uid, data: stamped };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushPending, 1200);
    }
  }, [wallet, uid, KEY]); // eslint-disable-line

  // 언마운트/계정변경/탭 숨김/종료 시 미저장분 flush (디바운스 취소로 인한 유실 방지)
  useEffect(() => {
    const onHide = () => flushPending();
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flushPending();
    };
  }, [uid]); // eslint-disable-line

  const deposit = useCallback((amt) => {
    const v = Math.max(0, Math.floor(Number(amt) || 0));
    if (!v) return;
    setWallet((w) => ({
      ...w,
      cashUSDT: w.cashUSDT + v,
      principal: (w.principal || INITIAL) + v,
      ledger: [{ type: "deposit", amt: v, t: Date.now() }, ...w.ledger].slice(0, 100),
    }));
  }, []);

  const withdraw = useCallback((amt) => {
    setWallet((w) => {
      const v = Math.max(0, Math.floor(Number(amt) || 0));
      if (!v || v > w.cashUSDT) return w;
      return {
        ...w,
        cashUSDT: w.cashUSDT - v,
        principal: Math.max(0, (w.principal || INITIAL) - v),
        ledger: [{ type: "withdraw", amt: v, t: Date.now() }, ...w.ledger].slice(0, 100),
      };
    });
  }, []);

  const reset = useCallback(() => setWallet(fresh()), []);

  return { wallet, setWallet, deposit, withdraw, reset, INITIAL };
}

/** 가상 자산 스냅샷 (평가자산·수익률) — 롱/숏 격리마진 반영 */
export function walletSummary(wallet, prices) {
  let lockedMargin = 0, upnl = 0;
  const positions = wallet.positions || {};
  for (const s in positions) {
    const pos = positions[s];
    const sym = pos.sym || s.split("#")[0];  // 복합키(sym#side) 대응
    const px = prices[sym]?.px ?? pos.entry;
    lockedMargin += pos.margin;
    upnl += (pos.side === "long" ? (px - pos.entry) : (pos.entry - px)) * pos.qty;
  }
  const equity = wallet.cashUSDT + lockedMargin + upnl;
  const principal = wallet.principal || INITIAL;
  const pnl = equity - principal;
  const roi = principal > 0 ? (pnl / principal) * 100 : 0;
  return { equity, lockedMargin, upnl, principal, pnl, roi };
}

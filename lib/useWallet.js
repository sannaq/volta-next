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

  // hydrate (계정 변경 시 재로드)
  useEffect(() => {
    let alive = true;
    loaded.current = false;
    (async () => {
      let next = null;
      // 1) Supabase
      if (supabaseEnabled && uid && uid !== "guest") {
        try {
          const { data } = await supabase.from("wallets").select("data").eq("username", uid).maybeSingle();
          if (data?.data) next = { ...fresh(), ...data.data };
        } catch (_) {}
      }
      // 2) localStorage (계정별 키)
      if (!next) {
        try { const raw = localStorage.getItem(KEY); if (raw) next = { ...fresh(), ...JSON.parse(raw) }; } catch (_) {}
      }
      // 3) 예전 전역 키 1회 마이그레이션
      if (!next) {
        try { const old = localStorage.getItem(LS_LEGACY); if (old) next = { ...fresh(), ...JSON.parse(old) }; } catch (_) {}
      }
      if (!next) next = fresh();
      if (alive) { setWallet(next); loaded.current = true; }
    })();
    return () => { alive = false; };
  }, [uid]); // eslint-disable-line

  // persist: localStorage 즉시 + Supabase 디바운스
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(wallet)); } catch (_) {}
    if (supabaseEnabled && uid && uid !== "guest") {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        try {
          supabase.from("wallets")
            .upsert({ username: uid, data: wallet, updated_at: new Date().toISOString() }, { onConflict: "username" })
            .then(() => {}, () => {});
        } catch (_) {}
      }, 1200);
    }
    return () => clearTimeout(saveTimer.current);
  }, [wallet, uid, KEY]);

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
    const px = prices[s]?.px ?? pos.entry;
    lockedMargin += pos.margin;
    upnl += (pos.side === "long" ? (px - pos.entry) : (pos.entry - px)) * pos.qty;
  }
  const equity = wallet.cashUSDT + lockedMargin + upnl;
  const principal = wallet.principal || INITIAL;
  const pnl = equity - principal;
  const roi = principal > 0 ? (pnl / principal) * 100 : 0;
  return { equity, lockedMargin, upnl, principal, pnl, roi };
}

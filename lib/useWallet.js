"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { brand } from "./brand.config";

/**
 * 모의투자(페이퍼) 지갑 — 실제 결제/입금은 전혀 없음.
 * 가상 USDT 잔고·보유코인·미체결·거래내역·입출금 원장을 localStorage에 보관.
 *
 * wallet = {
 *   cashUSDT, holdings:{sym:qty}, openOrders:[], history:[],
 *   ledger:[{type:'deposit'|'withdraw'|'reset', amt, t}],
 *   principal   // 투입 원금(초기자금 + 입금 - 출금) → 수익률 기준
 * }
 */
const KEY = "volta_paper_wallet_v1";
const INITIAL = brand.paperCashUSDT;

function fresh() {
  return {
    cashUSDT: INITIAL,
    holdings: {},
    openOrders: [],
    history: [],
    ledger: [{ type: "reset", amt: INITIAL, t: Date.now() }],
    principal: INITIAL,
  };
}

export function useWallet() {
  const [wallet, setWallet] = useState(fresh);
  const loaded = useRef(false);

  // hydrate from localStorage (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setWallet({ ...fresh(), ...JSON.parse(raw) });
    } catch (_) {}
    loaded.current = true;
  }, []);

  // persist
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(wallet)); } catch (_) {}
  }, [wallet]);

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

/** 가상 자산 스냅샷 (평가자산·수익률) */
export function walletSummary(wallet, prices) {
  let holdingsValue = 0;
  for (const s in wallet.holdings) holdingsValue += wallet.holdings[s] * (prices[s]?.px || 0);
  const equity = wallet.cashUSDT + holdingsValue;
  const principal = wallet.principal || INITIAL;
  const pnl = equity - principal;
  const roi = principal > 0 ? (pnl / principal) * 100 : 0;
  return { equity, holdingsValue, principal, pnl, roi };
}

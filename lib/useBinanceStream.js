"use client";
import { useEffect, useRef, useState } from "react";
import { brand } from "./brand.config";

/**
 * #1 실시세 — Binance 공개 WebSocket(!ticker 개별 스트림) 구독.
 * 반환: { prices: { BTC: {px, chg, hi, lo, vol}, ... }, connected }
 * WS 실패 시 mock 랜덤워크로 자동 폴백(오프라인/차단 환경 대비).
 */
export function useBinanceStream(coins = brand.coins) {
  const [prices, setPrices] = useState(() => seedFrom(coins));
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const mockRef = useRef(null);

  useEffect(() => {
    let closedByUs = false;
    const streams = coins.map((c) => `${c.binance}@ticker`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    const bySym = Object.fromEntries(coins.map((c) => [c.binance.toUpperCase(), c.sym]));

    function startMock() {
      if (mockRef.current) return;
      mockRef.current = setInterval(() => {
        setPrices((prev) => {
          const next = { ...prev };
          for (const c of coins) {
            const p = next[c.sym];
            const base = p.base || p.px;
            const px = Math.max(base * 0.3, p.px + base * (Math.random() - 0.5) * 0.0016);
            next[c.sym] = { ...p, base, px, chg: ((px - base) / base) * 100 };
          }
          return next;
        });
      }, 1200);
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          const { data } = JSON.parse(ev.data);
          const sym = bySym[data.s];
          if (!sym) return;
          setPrices((prev) => ({
            ...prev,
            [sym]: {
              px: parseFloat(data.c),
              chg: parseFloat(data.P),
              hi: parseFloat(data.h),
              lo: parseFloat(data.l),
              vol: parseFloat(data.v),
            },
          }));
        } catch (_) {}
      };
      ws.onerror = () => { setConnected(false); startMock(); };
      ws.onclose = () => { setConnected(false); if (!closedByUs) startMock(); };
    } catch (_) {
      startMock();
    }

    return () => {
      closedByUs = true;
      if (wsRef.current) try { wsRef.current.close(); } catch (_) {}
      if (mockRef.current) clearInterval(mockRef.current);
    };
  }, [coins]);

  return { prices, connected };
}

function seedFrom(coins) {
  const seed = { BTC: 79732.6, ETH: 2528.04, SOL: 104.29, XRP: 1.4352, BNB: 612.4, ADA: 0.8921 };
  const o = {};
  for (const c of coins) {
    const px = seed[c.sym] || 100;
    o[c.sym] = { px, base: px, chg: 0, hi: px, lo: px, vol: 0 };
  }
  return o;
}

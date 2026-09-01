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
    let reconnectTimer = null;
    const streams = coins.map((c) => `${c.binance}@ticker`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    const bySym = Object.fromEntries(coins.map((c) => [c.binance.toUpperCase(), c.sym]));
    const syms = coins.map((c) => c.binance.toUpperCase());

    // 실제 가격 REST 로드 (시드 오류로 인한 오청산 방지). 주기적으로도 재동기화 →
    // WS가 막히거나(지역 차단) 무음이어도 실제가를 유지. 가짜(mock) 가격은 절대 쓰지 않는다.
    async function refreshREST() {
      try {
        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`);
        const arr = await r.json();
        if (!Array.isArray(arr)) return;
        setPrices((prev) => {
          const next = { ...prev };
          for (const t of arr) {
            const sym = bySym[t.symbol]; if (!sym) continue;
            const px = parseFloat(t.lastPrice); if (!(px > 0)) continue;
            const p = next[sym] || {};
            next[sym] = { px, base: p.base || px, chg: parseFloat(t.priceChangePercent), hi: parseFloat(t.highPrice), lo: parseFloat(t.lowPrice), vol: parseFloat(t.volume), live: true };
          }
          return next;
        });
      } catch (_) {}
    }
    refreshREST();
    mockRef.current = setInterval(refreshREST, 20000); // 20초마다 실제가 재동기화(안전망)

    // 실시간 WS — 끊기면 재연결(가짜 가격으로 폴백하지 않음)
    function connect() {
      if (closedByUs) return;
      let ws;
      try { ws = new WebSocket(url); } catch (_) { reconnectTimer = setTimeout(connect, 3000); return; }
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          const { data } = JSON.parse(ev.data);
          const sym = bySym[data.s]; if (!sym) return;
          setPrices((prev) => ({ ...prev, [sym]: { px: parseFloat(data.c), chg: parseFloat(data.P), hi: parseFloat(data.h), lo: parseFloat(data.l), vol: parseFloat(data.v), live: true } }));
        } catch (_) {}
      };
      ws.onerror = () => { setConnected(false); };
      ws.onclose = () => { setConnected(false); if (!closedByUs) { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 2500); } };
    }
    connect();

    return () => {
      closedByUs = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) try { wsRef.current.close(); } catch (_) {}
      if (mockRef.current) clearInterval(mockRef.current);
    };
  }, [coins]);

  return { prices, connected };
}

function seedFrom(coins) {
  // 대략적 초기값(첫 페인트용) — 마운트 직후 REST 실제가로 교체되며, live:false 동안은 주문 차단된다.
  const seed = {
    BTC: 79732, ETH: 2528, SOL: 104, XRP: 1.43, BNB: 612, ADA: 0.89,
    DOGE: 0.08, LINK: 11, AVAX: 7, DOT: 0.82, TRX: 0.33, TON: 1.6,
    LTC: 48, NEAR: 1.83, APT: 0.51, SUI: 0.7, ARB: 0.084, AAVE: 122,
  };
  const o = {};
  for (const c of coins) {
    const px = seed[c.sym] || 1;
    o[c.sym] = { px, base: px, chg: 0, hi: px, lo: px, vol: 0, live: false };
  }
  return o;
}

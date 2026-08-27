"use client";
import { useEffect, useRef } from "react";

/**
 * #2 TradingView Advanced Chart 위젯.
 * tv.js 스크립트를 1회 로드하고 심볼이 바뀌면 위젯을 다시 생성한다.
 */
export default function TradingViewChart({ symbol = "BINANCE:BTCUSDT", interval = "1" }) {
  const ref = useRef(null);
  const idRef = useRef("tv_" + Math.random().toString(36).slice(2));

  useEffect(() => {
    let cancelled = false;

    function build() {
      if (cancelled || !ref.current || !window.TradingView) return;
      ref.current.innerHTML = "";
      // eslint-disable-next-line no-new
      new window.TradingView.widget({
        container_id: idRef.current,
        symbol,
        interval,
        autosize: true,
        timezone: "Asia/Seoul",
        theme: "dark",
        style: "1",
        locale: "kr",
        toolbar_bg: "#141722",
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: false,
        backgroundColor: "#0f1117",
        gridColor: "rgba(35,40,56,0.6)",
      });
    }

    if (window.TradingView) {
      build();
    } else if (!document.getElementById("tv-script")) {
      const s = document.createElement("script");
      s.id = "tv-script";
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      s.onload = build;
      document.body.appendChild(s);
    } else {
      const t = setInterval(() => {
        if (window.TradingView) { clearInterval(t); build(); }
      }, 120);
      return () => clearInterval(t);
    }

    return () => { cancelled = true; };
  }, [symbol, interval]);

  return <div id={idRef.current} ref={ref} className="w-full h-full" />;
}

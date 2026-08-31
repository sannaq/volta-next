"use client";
import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

/**
 * TradingView급 네이티브 차트 (lightweight-charts) — VANTOR 코인차트 이식.
 *  - 캔들 + 거래량 + EMA(20/50/200) + 크로스헤어 OHLC 범례 + 줌/팬
 *  - 분석선: 지지/저항 · 회귀 채널 · 골드 스윙 추세선 · 매물대(POC) · 피보 · 오더블럭
 *  - Binance 무기한(fapi) klines + fstream aggTrade 실시간 갱신
 */
const IV = [["1m", "1분"], ["5m", "5분"], ["15m", "15분"], ["1h", "1시간"], ["4h", "4시간"], ["1d", "1일"]];
const IVMS = { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
const LINES = [["ribbon", "리본"], ["struct", "구조"], ["signal", "신호"], ["sr", "지지/저항"], ["tr", "추세선"], ["ch", "회귀채널"], ["ema", "EMA"], ["poc", "매물대"], ["fib", "피보"], ["ob", "OB"]];

function toBars(raw) { return raw.map((k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] })); }
function ema(v, p) { var k = 2 / (p + 1), e = v[0], o = [e], i; for (i = 1; i < v.length; i++) { e = v[i] * k + e * (1 - k); o.push(e); } return o; }
function pivots(d, w, type) { var r = []; for (var i = w; i < d.length - w; i++) { var ok = true; for (var j = i - w; j <= i + w; j++) { if (j === i) continue; if (type === "low" && d[j].low < d[i].low) { ok = false; break; } if (type === "high" && d[j].high > d[i].high) { ok = false; break; } } if (ok) r.push(i); } return r; }
function volProfile(bars) { if (!bars.length) return null; var lo = Infinity, hi = -Infinity; bars.forEach(function (k) { if (k.low < lo) lo = k.low; if (k.high > hi) hi = k.high; }); var bins = 24, w = (hi - lo) / bins; if (!(w > 0)) return null; var vol = new Array(bins).fill(0); bars.forEach(function (k) { var tp = (k.high + k.low + k.close) / 3, idx = Math.floor((tp - lo) / w); if (idx < 0) idx = 0; if (idx >= bins) idx = bins - 1; vol[idx] += k.volume; }); var mi = 0; for (var i = 1; i < bins; i++) if (vol[i] > vol[mi]) mi = i; return { low: lo + mi * w, high: lo + (mi + 1) * w }; }
function findOrderBlocks(cs, cur) { var n = cs.length; if (n < 8) return []; var s = 0; for (var i = 0; i < n; i++) s += (cs[i].high - cs[i].low); var avg = s / n; if (!(avg > 0)) return []; var bl = [], br = []; for (var i2 = 2; i2 < n - 2; i2++) { var a = cs[i2], b = cs[i2 + 1], bb = Math.abs(b.close - b.open); if (a.close < a.open && b.close > b.open && bb > avg * 1.1 && b.close > a.high) bl.push({ type: "bull", top: a.high, bottom: a.low, idx: i2 }); if (a.close > a.open && b.close < b.open && bb > avg * 1.1 && b.close < a.low) br.push({ type: "bear", top: a.high, bottom: a.low, idx: i2 }); } function fresh(o) { for (var j = o.idx + 2; j < n; j++) { if (o.type === "bull" && cs[j].low < o.bottom) return false; if (o.type === "bear" && cs[j].high > o.top) return false; } return true; } var out = []; bl.filter(fresh).filter(function (o) { return o.top <= cur; }).slice(-2).forEach(function (o) { out.push(o); }); br.filter(fresh).filter(function (o) { return o.bottom >= cur; }).slice(-2).forEach(function (o) { out.push(o); }); return out; }

export default function NativeChart({ symbol = "BTC", decimals = 2 }) {
  const wrapRef = useRef(null);
  const legendRef = useRef(null);
  const [tf, setTf] = useState("15m");
  const [lineOn, setLineOn] = useState({ ribbon: true, struct: true, signal: true, sr: true, tr: false, ch: false, ema: false, poc: true, fib: false, ob: true });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const bn = String(symbol || "BTC").toUpperCase().replace(/USDT$/, "") + "USDT";
    let chart, cs, vs, ws, poll, dead = false;
    const priceFmt = { type: "price", precision: decimals, minMove: Math.pow(10, -decimals) };

    chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8790a1", fontSize: 11 },
      grid: { vertLines: { color: "rgba(34,42,54,0.6)" }, horzLines: { color: "rgba(34,42,54,0.6)" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#2a3240", rightOffset: 4, barSpacing: 8 },
      rightPriceScale: { borderColor: "#2a3240", scaleMargins: { top: 0.08, bottom: 0.26 } },
      crosshair: { mode: 0 },
      localization: { priceFormatter: (p) => p.toLocaleString("en-US", { maximumFractionDigits: decimals }) },
    });
    cs = chart.addCandlestickSeries({ upColor: "#2ebd85", downColor: "#f6465d", borderVisible: false, wickUpColor: "#2ebd85", wickDownColor: "#f6465d", priceFormat: priceFmt });
    vs = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    vs.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // 크로스헤어 OHLC 범례
    chart.subscribeCrosshairMove((param) => {
      const lg = legendRef.current; if (!lg) return;
      if (!param || !param.time || !param.seriesData || !param.seriesData.get(cs)) { lg.style.opacity = "0.55"; return; }
      const b = param.seriesData.get(cs); lg.style.opacity = "1";
      const up = b.close >= b.open, col = up ? "#2ebd85" : "#f6465d", d = decimals;
      const f = (v) => v.toLocaleString("en-US", { maximumFractionDigits: d });
      const chg = b.open ? ((b.close - b.open) / b.open * 100) : 0;
      lg.innerHTML = '<b style="color:#e8ecf3">' + String(symbol).toUpperCase() + '</b> · ' + tf +
        '&nbsp;&nbsp;시 <span style="color:' + col + '">' + f(b.open) + '</span>' +
        ' 고 <span style="color:' + col + '">' + f(b.high) + '</span>' +
        ' 저 <span style="color:' + col + '">' + f(b.low) + '</span>' +
        ' 종 <span style="color:' + col + '">' + f(b.close) + '</span>' +
        ' <span style="color:' + col + '">(' + (chg >= 0 ? "+" : "") + chg.toFixed(2) + '%)</span>';
    });

    (async () => {
      let raw;
      try { raw = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=" + bn + "&interval=" + tf + "&limit=300").then((r) => r.json()); }
      catch (e) { return; }
      if (dead || !Array.isArray(raw)) return;
      const data = toBars(raw);
      cs.setData(data.map((d) => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));
      vs.setData(data.map((d) => ({ time: d.time, value: d.volume, color: d.close >= d.open ? "rgba(46,189,133,0.4)" : "rgba(246,70,93,0.4)" })));
      const px = data[data.length - 1].close;

      // EMA
      if (lineOn.ema) { const clz = data.map((d) => d.close);[[20, "#f0b90b"], [50, "#3b82f6"], [200, "#a855f7"]].forEach((E) => { if (clz.length >= E[0]) { const ev = ema(clz, E[0]); const es = chart.addLineSeries({ color: E[1], lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }); es.setData(data.map((d, i) => ({ time: d.time, value: ev[i] }))); } }); }
      // 지지/저항 (윈도우 고·저)
      let hi = -Infinity, lo = Infinity; data.forEach((d) => { if (d.high > hi) hi = d.high; if (d.low < lo) lo = d.low; });
      if (lineOn.sr) { cs.createPriceLine({ price: hi, color: "#f6465d", lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "저항" }); cs.createPriceLine({ price: lo, color: "#2ebd85", lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "지지" }); }
      // 피보
      if (lineOn.fib) [[0.382, "0.382"], [0.5, "0.5"], [0.618, "0.618"]].forEach((f) => { cs.createPriceLine({ price: hi - f[0] * (hi - lo), color: "#a06bff", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "fib " + f[1] }); });
      // 매물대 POC
      const poc = volProfile(data); if (poc && lineOn.poc) cs.createPriceLine({ price: (poc.low + poc.high) / 2, color: "#ff9800", lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: "매물대" });
      // 오더블럭
      if (lineOn.ob) findOrderBlocks(data, px).forEach((ob) => { const col = ob.type === "bull" ? "#2ebd85" : "#f6465d"; cs.createPriceLine({ price: ob.top, color: col, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: ob.type === "bull" ? "🟩OB지지" : "🟥OB저항" }); cs.createPriceLine({ price: ob.bottom, color: col, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "OB하단" }); });
      // 회귀 채널
      if (lineOn.ch) { const n = data.length; let sx = 0, sy = 0, sxy = 0, sxx = 0; data.forEach((d, i) => { sx += i; sy += d.close; sxy += i * d.close; sxx += i * i; }); const den = n * sxx - sx * sx, sl = den ? (n * sxy - sx * sy) / den : 0, itc = (sy - sl * sx) / n; let above = -Infinity, below = Infinity; data.forEach((d, i) => { const r = itc + sl * i; if (d.high - r > above) above = d.high - r; if (d.low - r < below) below = d.low - r; });[above, below].forEach((off) => { const ls = chart.addLineSeries({ color: "#4a9eff", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }); ls.setData(data.map((d, i) => ({ time: d.time, value: itc + sl * i + off }))); }); }
      // 골드 스윙 추세선
      if (lineOn.tr) { const up = data[data.length - 1].close >= data[0].close; let pv = pivots(data, 4, up ? "low" : "high"); if (pv.length < 2) pv = pivots(data, 3, up ? "low" : "high"); if (pv.length >= 2) { let anchor = pv[0]; for (let k = 0; k < pv.length; k++) { if (up) { if (data[pv[k]].low < data[anchor].low) anchor = pv[k]; } else { if (data[pv[k]].high > data[anchor].high) anchor = pv[k]; } } let later = null; for (let m = pv.length - 1; m >= 0; m--) { if (pv[m] > anchor) { later = pv[m]; break; } } if (later == null) { const idx = pv.indexOf(anchor); if (idx > 0) { later = anchor; anchor = pv[idx - 1]; } } if (later != null && later > anchor) { const pa = up ? data[anchor].low : data[anchor].high, pb = up ? data[later].low : data[later].high, slope = (pb - pa) / (later - anchor); const ts = chart.addLineSeries({ color: "#e0a83e", lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }); const pts = []; for (let ii = anchor; ii < data.length; ii++) pts.push({ time: data[ii].time, value: pa + slope * (ii - anchor) }); ts.setData(pts); } } }

      // ── 트렌드 리본(상승 파랑 / 하락 빨강) ──
      const markers = [];
      const clz2 = data.map((d) => d.close);
      const rib = ema(clz2, 21);
      if (lineOn.ribbon) {
        const upS = chart.addLineSeries({ color: "#3b82f6", lineWidth: 3, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        const dnS = chart.addLineSeries({ color: "#f6465d", lineWidth: 3, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        const upPts = [], dnPts = [];
        for (let i = 0; i < data.length; i++) {
          const rising = i > 0 ? rib[i] >= rib[i - 1] : true; const t = data[i].time;
          if (rising) { upPts.push({ time: t, value: rib[i] }); dnPts.push({ time: t }); }
          else { dnPts.push({ time: t, value: rib[i] }); upPts.push({ time: t }); }
        }
        // 색 전환 지점은 양쪽에 값 부여해 선이 끊기지 않게 연결
        for (let i = 1; i < data.length; i++) { const rC = rib[i] >= rib[i - 1], rP = i > 1 ? rib[i - 1] >= rib[i - 2] : rC; if (rC !== rP) { upPts[i] = { time: data[i].time, value: rib[i] }; dnPts[i] = { time: data[i].time, value: rib[i] }; } }
        upS.setData(upPts); dnS.setData(dnPts);
      }
      // ── 시장 구조: 스윙 고/저 (HH/LH · HL/LL) + 강한/약한 고점·저점 ──
      if (lineOn.struct) {
        const sh = pivots(data, 5, "high"), sl = pivots(data, 5, "low");
        let prevH = null; sh.forEach((i) => { const lbl = prevH != null ? (data[i].high > data[prevH].high ? "HH" : "LH") : "H"; markers.push({ time: data[i].time, position: "aboveBar", color: "#f6465d", shape: "arrowDown", text: lbl }); prevH = i; });
        let prevL = null; sl.forEach((i) => { const lbl = prevL != null ? (data[i].low < data[prevL].low ? "LL" : "HL") : "L"; markers.push({ time: data[i].time, position: "belowBar", color: "#2ebd85", shape: "arrowUp", text: lbl }); prevL = i; });
        if (sh.length) { const i = sh[sh.length - 1]; const strong = sh.length >= 2 && data[i].high > data[sh[sh.length - 2]].high; cs.createPriceLine({ price: data[i].high, color: "#f6465d", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: (strong ? "강한" : "약한") + " 고점" }); }
        if (sl.length) { const i = sl[sl.length - 1]; const strong = sl.length >= 2 && data[i].low > data[sl[sl.length - 2]].low; cs.createPriceLine({ price: data[i].low, color: "#4a9eff", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: (strong ? "강한" : "약한") + " 저점" }); }
      }
      // ── 매수/매도 신호: 리본 상향/하향 돌파 ──
      if (lineOn.signal) {
        for (let i = 1; i < data.length; i++) {
          if (clz2[i] > rib[i] && clz2[i - 1] <= rib[i - 1]) markers.push({ time: data[i].time, position: "belowBar", color: "#26de81", shape: "circle" });
          else if (clz2[i] < rib[i] && clz2[i - 1] >= rib[i - 1]) markers.push({ time: data[i].time, position: "aboveBar", color: "#f6465d", shape: "circle" });
        }
      }
      if (markers.length) { markers.sort((a, b) => a.time - b.time); cs.setMarkers(markers); }

      // 실시간 갱신: 마지막 바 + 폴링
      let last = Object.assign({}, data[data.length - 1]);
      const iv = IVMS[tf] || 900000;
      function openWS() {
        try { ws = new WebSocket("wss://fstream.binance.com/ws/" + bn.toLowerCase() + "@aggTrade"); } catch (e) { return; }
        ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } const p = +m.p; if (!p) return; const bt = Math.floor((m.T || Date.now()) / iv) * iv / 1000; if (!last || bt > last.time) { last = { time: bt, open: p, high: p, low: p, close: p, volume: 0 }; } else { if (p > last.high) last.high = p; if (p < last.low) last.low = p; last.close = p; } try { cs.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close }); } catch (e) {} };
        ws.onclose = () => { if (!dead) setTimeout(() => { if (!dead) openWS(); }, 2500); };
      }
      openWS();
      poll = setInterval(() => { fetch("https://fapi.binance.com/fapi/v1/klines?symbol=" + bn + "&interval=" + tf + "&limit=2").then((r) => r.json()).then((rw) => { if (dead || !Array.isArray(rw) || !rw.length) return; const nb = toBars(rw)[rw.length - 1]; try { cs.update({ time: nb.time, open: nb.open, high: nb.high, low: nb.low, close: nb.close }); vs.update({ time: nb.time, value: nb.volume, color: nb.close >= nb.open ? "rgba(46,189,133,0.4)" : "rgba(246,70,93,0.4)" }); } catch (e) {} last = Object.assign({}, nb); }).catch(() => {}); }, 5000);
    })();

    return () => { dead = true; if (ws) try { ws.onclose = null; ws.close(); } catch (e) {} if (poll) clearInterval(poll); try { chart.remove(); } catch (e) {} };
  }, [symbol, tf, lineOn, decimals]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-2 py-1.5 flex-wrap">
        <div className="flex gap-1">
          {IV.map(([v, l]) => (
            <button key={v} onClick={() => setTf(v)} className={`px-2 py-0.5 rounded text-[11px] font-bold border ${tf === v ? "bg-brand text-white border-brand" : "bg-panel2 text-muted border-line"}`}>{l}</button>
          ))}
        </div>
        <span className="w-px h-4 bg-line mx-1" />
        <div className="flex gap-1 flex-wrap">
          {LINES.map(([k, l]) => (
            <button key={k} onClick={() => setLineOn((s) => ({ ...s, [k]: !s[k] }))} className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${lineOn[k] ? "bg-[rgba(224,181,82,.14)] text-[#e0b552] border-[#e0b552]" : "bg-panel2 text-muted border-line"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={legendRef} className="absolute left-2 top-1.5 z-10 text-[11px] pointer-events-none" style={{ opacity: 0.55 }} />
        <div ref={wrapRef} className="w-full h-full" />
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef } from "react";

/**
 * 🔥 청산맵 (Liquidation Heatmap) — VANTOR 코인 터미널에서 이식.
 *  - Binance 무기한(fapi) 캔들·OI·파생지표 + forceOrder WS 실측 청산
 *  - 가격/거래량/OI로 레버리지별 청산가를 역산한 추정 히트맵 + 실시간 오버레이
 *  - 캔들·매물대(POC)·오더블럭·레버리지 청산대·청산벽 근접 알림 canvas 렌더
 * 엔진은 자체 완결형 vanilla JS. 컴포넌트는 스캐폴드 주입 후 start()/stop()만 제어.
 */
export default function LiquidationMap({ symbol = "BTC" }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = liqHTML();
    const initSym = String(symbol || "BTC").toUpperCase().replace(/USDT$/, "");
    const engine = makeLiqEngine(root, initSym);
    engine.start();
    return () => {
      try { engine.stop(); } catch (_) {}
      if (root) root.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="lqHost" />;
}

function liqHTML() {
  return '<style>'
    + '#lqRoot{--lqline:#222d3d;--lqsub:#8b96a7;color:#e8ecf3}'
    + '#lqRoot .lqpill{padding:6px 12px;border-radius:9px;border:1px solid var(--lqline);background:#0f151f;color:#c9d3e0;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}'
    + '#lqRoot .lqpill.on{border-color:#e0b552;background:rgba(224,181,82,.14);color:#e0b552}'
    + '#lqRoot .lqStat{background:#0f151f;border:1px solid var(--lqline);border-radius:12px;padding:12px 14px}'
    + '#lqRoot .lqk{font-size:12px;color:var(--lqsub);font-weight:600;display:flex;align-items:center;gap:5px}'
    + '#lqRoot .lqv{font-size:20px;font-weight:800;margin-top:5px}'
    + '#lqRoot .lqs{font-size:11px;color:#5a6576;margin-top:3px}'
    + '#lqRoot .frow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;border-bottom:1px solid #171f2b;font-size:12px}'
    + '#lqRoot .frow .side{font-weight:800;font-size:11px;padding:2px 7px;border-radius:6px}'
    + '#lqRoot .frow .side.long{background:rgba(246,70,93,.16);color:#f6465d}'
    + '#lqRoot .frow .side.short{background:rgba(46,189,133,.16);color:#2ebd85}'
    + '#lqRoot .frow .px{color:#c9d3e0;font-variant-numeric:tabular-nums}'
    + '#lqRoot .frow .amt{font-weight:800;font-variant-numeric:tabular-nums}'
    + '@media(max-width:820px){#lqRoot .lqStats{grid-template-columns:repeat(2,1fr)!important}#lqRoot .lqMain{grid-template-columns:1fr!important}}'
    + '</style>'
    + '<div id="lqRoot">'
    + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><div style="font-weight:800;font-size:17px">🔥 청산맵 <span style="color:#8b96a7;font-weight:500;font-size:13px">· Liquidation Heatmap</span></div><span style="font-size:11px;color:#8b96a7">● <span id="lqLiveTxt">연결 중…</span></span><input id="lqSearch" placeholder="🔍 코인 검색 (예: ADA·1000PEPE·SUI)" style="margin-left:auto;background:#0f151f;border:1px solid #222d3d;border-radius:10px;padding:9px 13px;color:#e8ecf3;font-family:inherit;font-size:13px;outline:none;min-width:200px"></div>'
    + '<div id="lqSyms" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>'
    + '<div id="lqTfs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px"></div>'
    + '<div id="lqDeriv"></div>'
    + '<div class="lqStats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">'
    + '<div class="lqStat"><div class="lqk"><span style="color:#2ebd85">■</span> 숏 청산 최대</div><div class="lqv" id="lqStShort">—</div><div class="lqs" id="lqStShortAmt">가격이 오르면 청산</div></div>'
    + '<div class="lqStat"><div class="lqk"><span style="color:#f6465d">■</span> 롱 청산 최대</div><div class="lqv" id="lqStLong">—</div><div class="lqs" id="lqStLongAmt">가격이 내리면 청산</div></div>'
    + '<div class="lqStat"><div class="lqk">현재가</div><div class="lqv" id="lqStPx">—</div><div class="lqs" id="lqStChg">24h</div></div>'
    + '<div class="lqStat"><div class="lqk">미결제약정 OI</div><div class="lqv" id="lqStTot">—</div><div class="lqs" id="lqStCnt">실측 청산 0건 · $0</div></div></div>'
    + '<div class="lqMain" style="display:grid;grid-template-columns:1fr 300px;gap:14px">'
    + '<div style="position:relative"><div style="font-size:12px;color:#8b96a7;margin-bottom:6px"><b id="lqLgSym">BTC</b> · <span id="lqLgTf">15분</span> · Binance 무기한 · 히트맵(추정+실측)·레버리지 청산대·매물대·오더블럭</div><canvas id="lqChart" style="width:100%;height:460px;display:block"></canvas></div>'
    + '<div><div style="font-weight:800;font-size:13px;margin-bottom:8px">🔥 실시간 청산 <span style="color:#8b96a7;font-weight:500">· $50k↑</span></div><div id="lqFeed" style="max-height:460px;overflow-y:auto"></div></div></div>'
    + '<p style="font-size:11px;color:#5a6576;margin-top:12px;line-height:1.6"><b>읽는 법</b> — 밝은 가로 띠 = 청산 물량이 몰린 <b>자석 구간</b>. 현재가 위쪽 띠는 숏 청산대(뚫리면 상방 스퀴즈), 아래쪽 띠는 롱 청산대(깨지면 하방 가속). <b>데이터</b> — 가격·거래량·OI로 레버리지별 청산가를 역산한 <b>추정 모델</b> + 실시간 청산 스트림(WS) 실측. 개별 레버리지는 비공개라 추정이며 <b>교육·참고용</b>입니다.</p></div>';
}

// ===== 청산맵 엔진(네이티브 이식: 구 VANTOR 터미널 liqmap) — root 스코프 =====
function makeLiqEngine(root, initSym) {
  var $ = function (s) { return root.querySelector(s); };
  var SYMS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOGE']; if (SYMS.indexOf(initSym) < 0) SYMS.unshift(initSym);
  var TFS = [['1m', '1분'], ['5m', '5분'], ['15m', '15분'], ['1h', '1시간'], ['4h', '4시간'], ['12h', '12시간'], ['1d', '24시간'], ['3d', '3일']];
  var st = { sym: initSym || 'BTC', tf: '15m', candles: [], price: 0, chg: 0, bins: new Map(), model: new Map(), binUsd: 50, binFixed: false, oiUsd: 0, tot: 0, cnt: 0, ws: null, feed: [], hover: null, deriv: null };
  var stopped = false, timers = [], dirty = true;
  function fmtPx(v) { if (!v && v !== 0) return '—'; if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 1 }); if (v >= 1) return v.toFixed(3); return v.toFixed(5); }
  function fmtUsd(v) { if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'; return '$' + Math.round(v); }
  function fmtKrw(v) { var k = v * 1380; if (k >= 1e12) return (k / 1e12).toFixed(1) + '조'; if (k >= 1e8) return Math.round(k / 1e8) + '억'; if (k >= 1e4) return Math.round(k / 1e4) + '만'; return Math.round(k) + ''; }
  function binOf(p) { return Math.round(p / st.binUsd); } function binPx(b) { return b * st.binUsd; }
  function niceStep(x) { if (!(x > 0)) return 1; var e = Math.pow(10, Math.floor(Math.log10(x))); var f = x / e; var s = f < 1.5 ? 1 : (f < 3.5 ? 2 : (f < 7.5 ? 5 : 10)); return s * e; }
  function fixBin() { var cs = st.candles; if (!cs.length) return; var lo = Infinity, hi = -Infinity; for (var i = 0; i < cs.length; i++) { if (cs[i].l < lo) lo = cs[i].l; if (cs[i].h > hi) hi = cs[i].h; } st.binUsd = niceStep((hi - lo) * 1.3 / 150) || st.binUsd; st.binFixed = true; }
  function addModel(p, side, w, idx) { if (!(p > 0)) return; var b = binOf(p), c = st.model.get(b) || { long: 0, short: 0, tw: 0, wsum: 0 }; c[side] += w; c.tw += w * (idx || 0); c.wsum += w; st.model.set(b, c); }
  function buildModelHeat() {
    st.model = new Map(); var cs = st.candles; if (!cs.length || !st.price) return; var tiers = [[10, 0.16], [25, 0.26], [50, 0.31], [100, 0.27]]; var n = cs.length;
    for (var i = 0; i < n; i++) {
      var c = cs[i], notion = (c.v || 0) * c.c; if (notion <= 0) continue; var recency = 0.30 + 0.70 * (i / (n - 1 || 1)); var upBias = c.c >= c.o ? 0.55 : 0.45; var entry = (c.h + c.l + c.c) / 3;
      for (var t = 0; t < tiers.length; t++) {
        var L = tiers[t][0], w = tiers[t][1] * recency * notion, lLiq = entry * (1 - 1 / L), sLiq = entry * (1 + 1 / L);
        if (lLiq < st.price) addModel(lLiq, 'long', w * upBias, i); if (sLiq > st.price) addModel(sLiq, 'short', w * (1 - upBias), i);
      }
    }
  }
  function allBins() {
    var m = new Map(), liveMax = 0; st.bins.forEach(function (v) { var s = v.long + v.short; if (s > liveMax) liveMax = s; }); var modelMax = 0; st.model.forEach(function (v) { var s = v.long + v.short; if (s > modelMax) modelMax = s; }); var boost = (liveMax > 0 && modelMax > 0) ? (modelMax / liveMax * 1.4) : 1; var last = (st.candles.length - 1) || 0;
    st.model.forEach(function (v, b) { m.set(b, { long: v.long, short: v.short, col: v.wsum > 0 ? (v.tw / v.wsum) : last }); }); st.bins.forEach(function (v, b) { var c = m.get(b) || { long: 0, short: 0, col: last }; c.long += v.long * boost; c.short += v.short * boost; m.set(b, c); }); return m;
  }
  function findOB(cs, cur) {
    var n = cs.length; if (n < 8) return []; var s = 0; for (var i = 0; i < n; i++)s += (cs[i].h - cs[i].l); var avg = s / n; if (!(avg > 0)) return []; var bulls = [], bears = [];
    for (var i2 = 2; i2 < n - 2; i2++) { var a = cs[i2], b = cs[i2 + 1], bb = Math.abs(b.c - b.o); if (a.c < a.o && b.c > b.o && bb > avg * 1.1 && b.c > a.h) bulls.push({ type: 'bull', top: a.h, bottom: a.l, idx: i2 }); if (a.c > a.o && b.c < b.o && bb > avg * 1.1 && b.c < a.l) bears.push({ type: 'bear', top: a.h, bottom: a.l, idx: i2 }); }
    function fresh(ob) { for (var j = ob.idx + 2; j < n; j++) { if (ob.type === 'bull' && cs[j].l < ob.bottom) return false; if (ob.type === 'bear' && cs[j].h > ob.top) return false; } return true; }
    var out = []; bulls.filter(fresh).filter(function (o) { return o.top <= cur; }).slice(-2).forEach(function (o) { out.push(o); }); bears.filter(fresh).filter(function (o) { return o.bottom >= cur; }).slice(-2).forEach(function (o) { out.push(o); }); return out;
  }
  function api(sym) { return sym + 'USDT'; }
  function tfMin() { return { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '12h': 720, '1d': 1440, '3d': 4320 }[st.tf] || 15; }
  function loadKlines() { return fetch('https://fapi.binance.com/fapi/v1/klines?symbol=' + api(st.sym) + '&interval=' + st.tf + '&limit=200').then(function (r) { return r.json(); }).then(function (a) { if (!Array.isArray(a)) throw 0; st.candles = a.map(function (k) { return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }; }); var last = st.candles[st.candles.length - 1]; st.price = last.c; var first24 = st.candles[Math.max(0, st.candles.length - Math.round((24 * 60) / tfMin()))]; st.chg = first24 ? ((last.c - first24.o) / first24.o * 100) : 0; if (!st.binFixed) fixBin(); buildModelHeat(); }); }
  function loadTicker() { return fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=' + api(st.sym)).then(function (r) { return r.json(); }).then(function (t) { if (t && t.lastPrice) { st.price = +t.lastPrice; st.chg = +t.priceChangePercent; } }).catch(function () { }); }
  function loadOI() { return fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + api(st.sym)).then(function (r) { return r.json(); }).then(function (o) { if (o && o.openInterest) { st.oiUsd = +o.openInterest * (st.price || 1); } }).catch(function () { }); }
  function loadDeriv() {
    var s = api(st.sym), F = 'https://fapi.binance.com/fapi/v1/', D = 'https://fapi.binance.com/futures/data/'; Promise.all([
      fetch(F + 'premiumIndex?symbol=' + s).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(D + 'globalLongShortAccountRatio?symbol=' + s + '&period=5m&limit=1').then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(D + 'topLongShortPositionRatio?symbol=' + s + '&period=5m&limit=1').then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(D + 'openInterestHist?symbol=' + s + '&period=5m&limit=2').then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (r) { if (stopped) return; st.deriv = { fund: r[0], ls: (r[1] && r[1][0]), top: (r[2] && r[2][0]), oih: r[3] }; renderDeriv(); });
  }
  function renderDeriv() {
    var el = $('#lqDeriv'); if (!el) return; var d = st.deriv; if (!d) { el.innerHTML = ''; return; }
    function chip(inner) { return '<div style="flex:1;min-width:150px;background:#0f151f;border:1px solid #222d3d;border-radius:12px;padding:9px 12px">' + inner + '</div>'; }
    function k(t) { return '<div style="color:#8b96a7;font-size:11px;font-weight:600;margin-bottom:5px">' + t + '</div>'; } var html = '';
    if (d.ls) { var la = +d.ls.longAccount * 100, sa = +d.ls.shortAccount * 100; html += chip(k('롱/숏 계정 비율') + '<div style="height:8px;border-radius:5px;overflow:hidden;display:flex;background:#f6465d"><span style="width:' + la.toFixed(1) + '%;background:#2ebd85"></span></div><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;margin-top:5px"><span style="color:#2ebd85">롱 ' + la.toFixed(1) + '%</span><span style="color:#f6465d">숏 ' + sa.toFixed(1) + '%</span></div>'); }
    if (d.top) { var tl = +d.top.longAccount * 100, dom = tl >= 50 ? '롱' : '숏', domc = tl >= 50 ? '#2ebd85' : '#f6465d', domv = tl >= 50 ? tl : 100 - tl; html += chip(k('상위 트레이더 (스마트머니)') + '<div style="font-size:17px;font-weight:800;color:' + domc + '">' + dom + ' ' + domv.toFixed(1) + '% 우위</div><div style="font-size:11px;color:#5a6576;margin-top:2px">롱 ' + tl.toFixed(1) + '% · 숏 ' + (100 - tl).toFixed(1) + '%</div>'); }
    if (d.fund && d.fund.lastFundingRate != null) { var fr = +d.fund.lastFundingRate * 100, fc = fr >= 0 ? '#2ebd85' : '#f6465d'; var nt = d.fund.nextFundingTime ? Math.max(0, d.fund.nextFundingTime - Date.now()) : 0, hh = Math.floor(nt / 3600000), mm = Math.floor(nt % 3600000 / 60000); html += chip(k('펀딩비 (8시간)') + '<div style="font-size:17px;font-weight:800;color:' + fc + '">' + (fr >= 0 ? '+' : '') + fr.toFixed(4) + '%</div><div style="font-size:11px;color:#5a6576;margin-top:2px">' + (fr >= 0 ? '롱→숏 지불' : '숏→롱 지불') + ' · 다음 ' + hh + 'h' + mm + 'm</div>'); }
    if (d.oih && d.oih.length >= 2) { var oa = +d.oih[0].sumOpenInterestValue, ob2 = +d.oih[1].sumOpenInterestValue, ch = oa > 0 ? ((ob2 - oa) / oa * 100) : 0, oc = ch >= 0 ? '#2ebd85' : '#f6465d'; html += chip(k('미결제약정 OI 추이') + '<div style="font-size:17px;font-weight:800">' + fmtUsd(ob2) + '</div><div style="font-size:11px;font-weight:700;color:' + oc + ';margin-top:2px">' + (ch >= 0 ? '▲ +' : '▼ ') + ch.toFixed(2) + '% (5m)</div>'); }
    el.innerHTML = html ? ('<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">' + html + '</div>') : '';
  }
  function connectWS() {
    if (st.ws) { try { st.ws.onclose = null; st.ws.close(); } catch (e) { } st.ws = null; } if (stopped) return; var stream = api(st.sym).toLowerCase() + '@forceOrder', ws; try { ws = new WebSocket('wss://fstream.binance.com/ws/' + stream); } catch (e) { return; } st.ws = ws;
    ws.onopen = function () { var lt = $('#lqLiveTxt'); if (lt) lt.textContent = 'Binance 선물 실시간 연결됨'; };
    ws.onclose = function () { if (!stopped && st.ws === ws) { var lt = $('#lqLiveTxt'); if (lt) lt.textContent = '재연결 중…'; setTimeout(function () { if (!stopped && st.ws === ws) connectWS(); }, 2500); } };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } var o = m.o || m; if (!o || !o.p) return; ingest(+o.p, +(o.q || o.l || 0), (o.S === 'SELL') ? 'long' : 'short'); };
  }
  function ingest(p, q, side) { if (!p || !q) return; var usd = p * q, b = binOf(p), cur = st.bins.get(b) || { long: 0, short: 0 }; cur[side] += usd; st.bins.set(b, cur); st.tot += usd; st.cnt++; if (usd >= 50000) { st.feed.unshift({ side: side, p: p, usd: usd, t: Date.now() }); if (st.feed.length > 60) st.feed.pop(); renderFeed(); } dirty = true; }
  function renderFeed() { var el = $('#lqFeed'); if (!el) return; el.innerHTML = st.feed.map(function (f) { var cls = f.side === 'long' ? 'long' : 'short', lab = f.side === 'long' ? '롱 청산' : '숏 청산'; return '<div class="frow"><span class="side ' + cls + '">' + lab + '</span><span class="px">' + fmtPx(f.p) + '</span><span class="amt" style="color:' + (f.side === 'long' ? '#f6465d' : '#2ebd85') + '">' + fmtUsd(f.usd) + '</span></div>'; }).join('') || '<div style="color:#5a6576;font-size:12px;padding:10px 2px">청산 대기 중… 큰 청산이 발생하면 여기 표시됩니다.</div>'; }
  function topLevels() { var longs = [], shorts = [], HB = allBins(); HB.forEach(function (v, b) { if (v.long > 0) longs.push([b, v.long]); if (v.short > 0) shorts.push([b, v.short]); }); longs.sort(function (a, b) { return b[1] - a[1]; }); shorts.sort(function (a, b) { return b[1] - a[1]; }); return { longs: longs, shorts: shorts }; }
  function usdScale() { var tot = 0; st.model.forEach(function (v) { tot += v.long + v.short; }); return (st.oiUsd > 0 && tot > 0) ? (st.oiUsd / tot) : 0; }
  function amtLabel(w) { var s = usdScale(); if (s > 0) { var u = w * s; return '추정 ' + fmtUsd(u) + ' · 약 ' + fmtKrw(u) + '원'; } return '유동성 집중'; }
  function renderStats() { if (stopped) return; var t = topLevels(), sT = t.shorts[0], lT = t.longs[0]; var g = function (id) { return $('#' + id); }; if (g('lqStShort')) g('lqStShort').textContent = sT ? fmtPx(binPx(sT[0])) : '—'; if (g('lqStShortAmt')) g('lqStShortAmt').textContent = sT ? amtLabel(sT[1]) : '가격이 오르면 청산'; if (g('lqStLong')) g('lqStLong').textContent = lT ? fmtPx(binPx(lT[0])) : '—'; if (g('lqStLongAmt')) g('lqStLongAmt').textContent = lT ? amtLabel(lT[1]) : '가격이 내리면 청산'; if (g('lqStPx')) g('lqStPx').textContent = fmtPx(st.price); var chg = st.chg || 0; if (g('lqStChg')) g('lqStChg').innerHTML = '<span style="color:' + (chg >= 0 ? '#2ebd85' : '#f6465d') + '">' + (chg >= 0 ? '▲ +' : '▼ ') + chg.toFixed(2) + '% 24h</span>'; if (g('lqStTot')) g('lqStTot').textContent = st.oiUsd > 0 ? fmtUsd(st.oiUsd) : '—'; if (g('lqStCnt')) g('lqStCnt').textContent = '실측 청산 ' + st.cnt.toLocaleString() + '건 · ' + fmtUsd(st.tot); }
  var cv, ctx, DPR = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0, PADR = 76, PADL = 8, PADT = 14, PADB = 26;
  function resize() { if (!cv) return; var r = cv.getBoundingClientRect(); if (r.width < 20) return; W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); dirty = true; }
  function hoverAt(clientX) { var r = cv.getBoundingClientRect(), mx = clientX - r.left, n = st.candles.length; if (!n) return; var cl = PADL, cr = W - PADR, bw = (cr - cl) / n, idx = Math.floor((mx - cl) / bw); st.hover = (idx >= 0 && idx < n) ? idx : null; dirty = true; }
  function draw() {
    if (stopped) return; if (!dirty) { requestAnimationFrame(draw); return; } dirty = false; ctx.clearRect(0, 0, W, H); var cs = st.candles; if (!cs.length) { requestAnimationFrame(draw); return; }
    var lo = Infinity, hi = -Infinity; for (var i = 0; i < cs.length; i++) { if (cs[i].l < lo) lo = cs[i].l; if (cs[i].h > hi) hi = cs[i].h; } var pad = (hi - lo) * 0.08; lo -= pad; hi += pad; if (st.price) { lo = Math.min(lo, st.price * 0.985); hi = Math.max(hi, st.price * 1.015); }
    var cl = PADL, cr = W - PADR, cw = cr - cl, ct = PADT, cb = H - PADB, ch = cb - ct; function y(p) { return ct + (hi - p) / (hi - lo) * ch; } var n = cs.length, bw = cw / n;
    var HB = allBins(), maxV = 0; HB.forEach(function (v) { var s = v.long + v.short; if (s > maxV) maxV = s; });
    if (maxV > 0) { var hpx = Math.max(1.2, ch / ((hi - lo) / st.binUsd)); HB.forEach(function (v, b) { var p = binPx(b); if (p < lo || p > hi) return; var sum = v.long + v.short; if (sum <= 0) return; var ratio = sum / maxV; if (ratio < 0.02) return; var yy = y(p), inten = Math.pow(ratio, 0.95), a = Math.min(0.95, 0.015 + inten * 1.05); var R = Math.round(24 + 74 * inten), G = Math.round(40 + 86 * inten), B = Math.round(150 + 95 * inten); var col = (v.col != null) ? v.col : (n - 1), xStart = cl + (col / ((n - 1) || 1)) * cw; if (xStart < cl) xStart = cl; if (xStart > cr - 3) xStart = cr - 3; ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + a.toFixed(3) + ')'; ctx.fillRect(xStart, yy - hpx / 2, cr - xStart, hpx * 0.9); if (inten > 0.16) { var edge = v.long >= v.short ? '246,70,93' : '46,189,133', ew = Math.min(cw * 0.42, cw * inten * 0.5); ctx.fillStyle = 'rgba(' + edge + ',' + (0.3 + inten * 0.55).toFixed(3) + ')'; ctx.fillRect(cr - ew, yy - hpx / 2, ew, Math.max(1, hpx * 0.6)); } }); }
    var vp = {}, vpMax = 0, pocBin = null; for (var i3 = 0; i3 < n; i3++) { var c3 = cs[i3], q3 = c3.v * c3.c; if (q3 <= 0) continue; var b0 = binOf(c3.l), b1 = binOf(c3.h), span = Math.max(1, b1 - b0 + 1), per = q3 / span; for (var pb = b0; pb <= b1; pb++) { vp[pb] = (vp[pb] || 0) + per; if (vp[pb] > vpMax) { vpMax = vp[pb]; pocBin = pb; } } }
    if (vpMax > 0) { var hpx2 = Math.max(1.2, ch / ((hi - lo) / st.binUsd)), vpW = cw * 0.14; for (var pk in vp) { var pp = binPx(+pk); if (pp < lo || pp > hi) continue; var yy2 = y(pp), w2 = vp[pk] / vpMax * vpW; ctx.fillStyle = 'rgba(190,205,225,0.09)'; ctx.fillRect(cl, yy2 - hpx2 / 2, w2, hpx2 * 0.9); } if (pocBin != null) { var pocP = binPx(pocBin); if (pocP >= lo && pocP <= hi) { var yy3 = y(pocP); ctx.strokeStyle = 'rgba(190,205,225,0.35)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cl, yy3); ctx.lineTo(cl + vpW, yy3); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(190,205,225,0.6)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('POC 매물대', cl + vpW + 3, yy3 + 3); ctx.textAlign = 'start'; } } }
    if (st.price) { var levs = [[100, '100x'], [50, '50x'], [25, '25x'], [10, '10x']]; ctx.save(); ctx.setLineDash([4, 4]); ctx.font = '10px sans-serif'; levs.forEach(function (L) { var frac = 1 / L[0];[['short', st.price * (1 + frac), '46,189,133'], ['long', st.price * (1 - frac), '246,70,93']].forEach(function (d) { var pp = d[1]; if (pp < lo || pp > hi) return; var yy = y(pp); ctx.strokeStyle = 'rgba(' + d[2] + ',0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cl, yy); ctx.lineTo(cr, yy); ctx.stroke(); ctx.fillStyle = 'rgba(' + d[2] + ',0.7)'; ctx.fillText(L[1], cl + 4, yy - 2); }); }); ctx.restore(); }
    var volH = ch * 0.22, maxVol = 0; for (var iv = 0; iv < n; iv++) { var q = cs[iv].v * cs[iv].c; if (q > maxVol) maxVol = q; } if (maxVol > 0) { var vw = Math.max(1.5, bw * 0.9); for (var iv2 = 0; iv2 < n; iv2++) { var c2 = cs[iv2], q2 = c2.v * c2.c, bh = Math.max(0.6, q2 / maxVol * volH), x2 = cl + iv2 * bw + bw / 2; ctx.fillStyle = (c2.c >= c2.o) ? 'rgba(46,189,133,0.42)' : 'rgba(246,70,93,0.42)'; ctx.fillRect(x2 - vw / 2, cb - bh, vw, bh); } }
    var obs = findOB(cs, st.price); obs.forEach(function (ob) { var yt = y(ob.top), ybt = y(ob.bottom); if (ob.top < lo || ob.bottom > hi) return; var ox = cl + ob.idx * bw, rgb = ob.type === 'bull' ? '46,189,133' : '246,70,93'; ctx.fillStyle = 'rgba(' + rgb + ',0.20)'; ctx.fillRect(ox, yt, cr - ox, ybt - yt); ctx.strokeStyle = 'rgba(' + rgb + ',0.95)'; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3]); ctx.strokeRect(ox, yt, cr - ox, ybt - yt); ctx.setLineDash([]); var lb = (ob.type === 'bull' ? '🟩 OB 지지' : '🟥 OB 저항'); ctx.font = '800 11px sans-serif'; var lw = ctx.measureText(lb).width + 8; ctx.fillStyle = 'rgba(' + rgb + ',0.92)'; ctx.fillRect(ox, yt, lw, 15); ctx.fillStyle = '#0b0f16'; ctx.textAlign = 'left'; ctx.fillText(lb, ox + 4, yt + 11); ctx.textAlign = 'start'; });
    for (var i4 = 0; i4 < n; i4++) { var c = cs[i4], x = cl + i4 * bw + bw / 2, up = c.c >= c.o, col2 = up ? '#2ebd85' : '#f6465d'; ctx.strokeStyle = col2; ctx.fillStyle = col2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke(); var bodyW = Math.max(1, bw * 0.62), yo = y(c.o), yc = y(c.c); ctx.fillRect(x - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1, Math.abs(yc - yo))); }
    if (st.price) { var yp = y(st.price); ctx.strokeStyle = 'rgba(46,189,133,0.95)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cl, yp); ctx.lineTo(cr, yp); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#2ebd85'; ctx.fillRect(cr, yp - 9, PADR, 18); ctx.fillStyle = '#04120c'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(fmtPx(st.price), cr + 5, yp + 4); ctx.textAlign = 'start'; }
    var tL = topLevels(), NEAR = 0.015, nearHit = false, pulse = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 350));[[tL.shorts[0], '46,189,133', '숏'], [tL.longs[0], '246,70,93', '롱']].forEach(function (d) { if (!d[0]) return; var p = binPx(d[0][0]); if (p < lo || p > hi) return; var yy = y(p); var dist = st.price ? Math.abs(p - st.price) / st.price : 9, near = dist <= NEAR; if (near) { nearHit = true; ctx.strokeStyle = 'rgba(' + d[1] + ',' + (0.35 + pulse * 0.6).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(cl, yy); ctx.lineTo(cr, yy); ctx.stroke(); } ctx.fillStyle = 'rgba(' + d[1] + ',0.98)'; ctx.font = '700 10.5px sans-serif'; var sc = usdScale(), label = (near ? '⚠ ' : '◀ ') + d[2] + ' 청산벽' + (sc > 0 ? (' 추정 ' + fmtUsd(d[0][1] * sc)) : '') + (near ? ' 근접 ' + (dist * 100).toFixed(2) + '%' : ''); ctx.textAlign = 'right'; ctx.fillText(label, cr - 6, yy - 3); ctx.textAlign = 'start'; }); if (nearHit) dirty = true;
    ctx.fillStyle = '#5a6576'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; for (var g = 0; g <= 5; g++) { var pp2 = hi - (hi - lo) * g / 5, yy4 = ct + ch * g / 5; ctx.strokeStyle = 'rgba(33,42,56,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cl, yy4); ctx.lineTo(cr, yy4); ctx.stroke(); ctx.fillStyle = '#5a6576'; ctx.fillText(fmtPx(pp2), cr + 5, yy4 + 3); }
    ctx.textAlign = 'center'; for (var kk = 0; kk < n; kk += Math.ceil(n / 7)) { var dd = new Date(cs[kk].t), xk = cl + kk * bw + bw / 2, big = tfMin() >= 1440; var lab = (dd.getMonth() + 1) + '/' + dd.getDate() + (big ? '' : (' ' + ('0' + dd.getHours()).slice(-2) + ':' + ('0' + dd.getMinutes()).slice(-2))); ctx.fillStyle = '#5a6576'; ctx.fillText(lab, xk, H - 9); } ctx.textAlign = 'start';
    if (st.hover != null && st.hover >= 0 && st.hover < n) { var hc = cs[st.hover], hx = cl + st.hover * bw + bw / 2, hup = hc.c >= hc.o, dcol = hup ? '#2ebd85' : '#f6465d'; ctx.strokeStyle = 'rgba(90,120,240,0.6)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, ct); ctx.lineTo(hx, cb); ctx.stroke(); ctx.setLineDash([]); var hd = new Date(hc.t), ds = (hd.getMonth() + 1) + '/' + hd.getDate() + ' ' + ('0' + hd.getHours()).slice(-2) + ':' + ('0' + hd.getMinutes()).slice(-2); var q4 = hc.v * hc.c, chg2 = ((hc.c - hc.o) / hc.o * 100), vol = hc.v; var rows = [['시간', ds, '#c9d3e0'], ['시가', fmtPx(hc.o), '#8b96a7'], ['고가', fmtPx(hc.h), '#2ebd85'], ['저가', fmtPx(hc.l), '#f6465d'], ['종가', fmtPx(hc.c) + ' (' + (chg2 >= 0 ? '+' : '') + chg2.toFixed(2) + '%)', dcol], ['거래량', vol.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ' + st.sym, '#c9d3e0'], ['거래대금', fmtUsd(q4) + ' · ' + fmtKrw(q4) + '원', '#6f8bff']]; ctx.font = '11px sans-serif'; var bw2 = 196, bh2 = rows.length * 16 + 10, bx = hx + 12; if (bx + bw2 > cr) bx = hx - 12 - bw2; if (bx < cl) bx = cl + 4; var by = ct + 6; ctx.fillStyle = 'rgba(9,13,20,0.95)'; ctx.fillRect(bx, by, bw2, bh2); ctx.strokeStyle = 'rgba(90,120,240,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw2, bh2); rows.forEach(function (l, li) { var ly = by + 17 + li * 16; ctx.textAlign = 'left'; ctx.fillStyle = '#5a6576'; ctx.fillText(l[0], bx + 9, ly); ctx.textAlign = 'right'; ctx.fillStyle = l[2]; ctx.fillText(l[1], bx + bw2 - 9, ly); }); ctx.textAlign = 'start'; }
    requestAnimationFrame(draw);
  }
  function buildPills() { var sp = $('#lqSyms'), tp = $('#lqTfs'); if (sp) { sp.innerHTML = SYMS.map(function (s) { return '<button class="lqpill' + (s === st.sym ? ' on' : '') + '" data-s="' + s + '">' + s + '</button>'; }).join(''); sp.querySelectorAll('.lqpill').forEach(function (b) { b.onclick = function () { switchSym(b.dataset.s); }; }); } if (tp) { tp.innerHTML = TFS.map(function (t) { return '<button class="lqpill' + (t[0] === st.tf ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join(''); tp.querySelectorAll('.lqpill').forEach(function (b) { b.onclick = function () { switchTf(b.dataset.t); }; }); } }
  function switchSym(s) { if (s === st.sym) return; st.sym = s; st.binFixed = false; st.bins = new Map(); st.model = new Map(); st.oiUsd = 0; st.tot = 0; st.cnt = 0; st.feed = []; st.candles = []; st.deriv = null; buildPills(); var lg = $('#lqLgSym'); if (lg) lg.textContent = s; renderFeed(); renderDeriv(); loadKlines().then(function () { return loadOI(); }).then(renderStats).catch(function () { }); connectWS(); loadDeriv(); dirty = true; }
  function switchTf(t) { if (t === st.tf) return; st.tf = t; st.binFixed = false; st.bins = new Map(); buildPills(); var lg = $('#lqLgTf'); if (lg) lg.textContent = (TFS.filter(function (x) { return x[0] === t; })[0] || ['', '15분'])[1]; loadKlines().then(function () { dirty = true; }).catch(function () { }); }
  function searchCoin(raw) { var inp = $('#lqSearch'), s = (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/, ''); if (!s) return; if (inp) inp.placeholder = '🔍 ' + s + ' 확인 중…'; fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=' + s + 'USDT').then(function (r) { return r.json(); }).then(function (j) { if (j && j.price) { if (SYMS.indexOf(s) < 0) { SYMS.unshift(s); if (SYMS.length > 9) SYMS.pop(); } switchSym(s); if (inp) { inp.value = ''; inp.placeholder = '🔍 코인 검색 (예: ADA·1000PEPE·SUI)'; } } else { if (inp) inp.placeholder = '❌ 없는 심볼: ' + s; } }).catch(function () { if (inp) inp.placeholder = '❌ 검색 실패 · 다시'; }); }
  function start() {
    cv = $('#lqChart'); if (!cv) return; ctx = cv.getContext('2d'); var lg = $('#lqLgSym'); if (lg) lg.textContent = st.sym;
    cv.addEventListener('mousemove', function (e) { hoverAt(e.clientX); }); cv.addEventListener('mouseleave', function () { st.hover = null; dirty = true; });
    cv.addEventListener('touchstart', function (e) { if (e.touches[0]) hoverAt(e.touches[0].clientX); }, { passive: true }); cv.addEventListener('touchmove', function (e) { if (e.touches[0]) hoverAt(e.touches[0].clientX); }, { passive: true });
    var inp = $('#lqSearch'); if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); searchCoin(inp.value); } });
    buildPills(); renderFeed(); resize(); [60, 200, 500, 1200, 2500].forEach(function (ms) { timers.push(setTimeout(resize, ms)); });
    loadKlines().then(function () { dirty = true; return loadOI(); }).then(function () { renderStats(); }).catch(function () { var lt = $('#lqLiveTxt'); if (lt) lt.textContent = '캔들 로드 실패(잠시 후 재시도)'; });
    connectWS(); loadDeriv(); requestAnimationFrame(draw);
    timers.push(setInterval(function () { loadTicker().then(function () { dirty = true; }); }, 5000));
    timers.push(setInterval(function () { loadKlines().then(function () { return loadOI(); }).then(function () { dirty = true; }).catch(function () { }); }, 30000));
    timers.push(setInterval(loadDeriv, 30000)); timers.push(setInterval(renderStats, 1000));
  }
  function stop() { stopped = true; if (st.ws) { try { st.ws.onclose = null; st.ws.close(); } catch (e) { } st.ws = null; } timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); timers = []; window.removeEventListener('resize', resize); }
  window.addEventListener('resize', resize);
  return { start: start, stop: stop };
}

"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { brand } from "@/lib/brand.config";
import { useBinanceStream } from "@/lib/useBinanceStream";
import { useWallet, walletSummary } from "@/lib/useWallet";
import { recordProfit } from "@/lib/tracking";
import TradingViewChart from "@/components/trade/TradingViewChart";

const TF = [["1", "1m"], ["5", "5m"], ["15", "15m"], ["60", "1H"], ["240", "4H"], ["D", "1D"]];

export default function TradePage() {
  return (
    <Suspense fallback={<div className="h-screen grid place-items-center text-muted">로딩…</div>}>
      <Trade />
    </Suspense>
  );
}

function Trade() {
  const sp = useSearchParams();
  const { prices, connected } = useBinanceStream();
  const [cur, setCur] = useState(sp.get("sym") || "BTC");
  const [side, setSide] = useState("buy");
  const [tf, setTf] = useState("1");
  const [type, setType] = useState("market");   // 기본 시장가
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");   // 주문 금액(USDT, 명목가치)
  const [trigger, setTrigger] = useState(""); // 조건부(스톱) 트리거 가격
  const [tp, setTp] = useState("");           // 익절가
  const [sl, setSl] = useState("");           // 손절가
  const [recentTrades, setRecentTrades] = useState([]);
  const [equitySeries, setEquitySeries] = useState([]);
  const [view, setView] = useState("trade");   // trade | history | mypage
  const [tab, setTab] = useState("pos");
  const [leverage, setLeverage] = useState(1);
  const { wallet: acct, setWallet: setAcct, deposit, withdraw, reset } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [toast, setToast] = useState("");

  const coin = useMemo(() => brand.coins.find((c) => c.sym === cur) || brand.coins[0], [cur]);
  const p = prices[cur] || {};
  const uid = sp.get("id") || "guest";

  // keep limit price synced to live px when switching symbol / order type
  useEffect(() => { if (p.px && type === "limit") setPrice(p.px.toFixed(coin.dec)); /* eslint-disable-next-line */ }, [cur, type]);

  // 미체결 처리: 지정가 체결 + 조건부(스톱) 트리거
  useEffect(() => {
    if (!acct.openOrders.length || !p.px) return;
    setAcct((a) => {
      const keep = [], fills = [];
      for (const o of a.openOrders) {
        const lp = prices[o.sym]?.px;
        if (lp == null) { keep.push(o); continue; }
        let hit;
        if (o.otype === "stop") hit = o.above ? lp >= o.trigger : lp <= o.trigger;
        else hit = o.side === "buy" ? lp <= o.price : lp >= o.price;
        if (hit) fills.push(o); else keep.push(o);
      }
      if (!fills.length) return a;
      let na = { ...a, openOrders: keep };
      for (const o of fills) {
        const px = o.otype === "stop" ? prices[o.sym].px : o.price;
        na = applyFill(na, o.sym, o.side, o.qty, px, o.leverage || 1, o.otype === "stop" ? "stop" : "limit", { tp: o.tp, sl: o.sl });
      }
      return na;
    });
  }, [prices]); // eslint-disable-line

  // TP/SL 자동 청산 + 강제 청산
  useEffect(() => {
    if (!acct.positions || !Object.keys(acct.positions).length) return;
    setAcct((a) => {
      let na = a, changed = false; const notes = [];
      for (const sym of Object.keys(na.positions)) {
        const pos = na.positions[sym]; const px = prices[sym]?.px; if (px == null) continue;
        const tpHit = pos.tp != null && (pos.side === "long" ? px >= pos.tp : px <= pos.tp);
        const slHit = pos.sl != null && (pos.side === "long" ? px <= pos.sl : px >= pos.sl);
        if (tpHit || slHit) {
          na = applyFill(na, sym, pos.side === "long" ? "sell" : "buy", pos.qty, px, 1, tpHit ? "tp" : "sl");
          notes.push(`${tpHit ? "익절" : "손절"} ${sym}`); changed = true;
        }
      }
      const liq = checkLiquidations(na, prices);
      if (liq.changed) { na = liq.wallet; notes.push(`⚠️청산 ${liq.liquidated.join(",")}`); changed = true; }
      if (changed) setTimeout(() => toastMsg(notes.join(" · ")), 0);
      return changed ? na : a;
    });
  }, [prices]); // eslint-disable-line

  // 최근 체결 테이프 (현재 심볼)
  useEffect(() => { setRecentTrades([]); }, [cur]);
  useEffect(() => {
    if (!p.px) return;
    setRecentTrades((prev) => {
      const up = !prev.length || p.px >= prev[0].px;
      return [{ px: p.px, qty: +(Math.random() * 1.5 + 0.001).toFixed(4), up, t: Date.now() }, ...prev].slice(0, 30);
    });
  }, [p.px]); // eslint-disable-line

  function toastMsg(m) { setToast(m); setTimeout(() => setToast(""), 1700); }

  const summary = useMemo(() => walletSummary(acct, prices), [acct, prices]);
  const equity = summary.equity;

  // 수익률 추적: 로그인한 아이디의 ROI/평가자산을 주기적으로 기록 (비밀번호와 무관)
  const trackRef = useRef({ roi: 0, equity: 0 });
  trackRef.current = { roi: summary.roi, equity: summary.equity };
  useEffect(() => {
    if (!uid || uid === "guest") return;
    const rec = () => recordProfit(uid, trackRef.current.roi, trackRef.current.equity);
    rec();
    const t = setInterval(rec, 15000);
    return () => { rec(); clearInterval(t); };
  }, [uid]);

  // 자산 곡선 샘플링 (2초마다 평가자산 기록)
  useEffect(() => {
    const id = setInterval(() => setEquitySeries((prev) => [...prev, { t: Date.now(), e: trackRef.current.equity }].slice(-120)), 2000);
    return () => clearInterval(id);
  }, []);

  const book = useMemo(() => genBook(p.px, coin.dec), [p.px, coin.dec]);

  const posCur = (acct.positions || {})[cur];
  const orderDir = side === "buy" ? "long" : "short";
  const isOpening = !posCur || posCur.side === orderDir;   // 진입/추가 vs 감소/청산
  function submit() {
    const amt = parseFloat(amount), pr = parseFloat(price), tr = parseFloat(trigger);
    if (!(amt > 0)) return toastMsg("금액을 입력하세요");
    if (type === "limit" && !(pr > 0)) return toastMsg("가격을 입력하세요");
    if (type === "stop" && !(tr > 0)) return toastMsg("트리거 가격을 입력하세요");
    const refPx = type === "stop" ? tr : (type === "limit" ? pr : p.px);
    if (!(refPx > 0)) return toastMsg("가격 정보 없음");
    const q = amt / refPx;                               // 수량 = 금액(명목) / 기준가
    const opts = { tp: tp || undefined, sl: sl || undefined };
    // 필요 증거금: 신규 진입/추가분만 (반대매매 청산분은 증거금 불필요)
    const openNotional = isOpening ? amt : Math.max(0, (q - (posCur?.qty || 0)) * refPx);
    if (openNotional / leverage > acct.cashUSDT + 1e-6) return toastMsg("증거금 부족 (레버리지 대비)");
    const label = isOpening ? (orderDir === "long" ? "롱 진입" : "숏 진입") : (orderDir === "long" ? "숏 청산" : "롱 청산");
    if (type === "market") {
      setAcct((a) => applyFill(a, cur, side, q, p.px, leverage, "market", opts));
      toastMsg(`시장가 ${label}${isOpening && leverage > 1 ? ` (${leverage}x)` : ""}`);
    } else if (type === "limit") {
      setAcct((a) => ({ ...a, openOrders: [...a.openOrders, { id: Date.now(), otype: "limit", sym: cur, side, qty: q, price: pr, leverage, ...opts }] }));
      toastMsg("지정가 주문 접수");
    } else { // stop (조건부): 트리거가 현재가보다 위면 상향 돌파, 아래면 하향 돌파 대기
      const above = tr >= p.px;
      setAcct((a) => ({ ...a, openOrders: [...a.openOrders, { id: Date.now(), otype: "stop", sym: cur, side, qty: q, trigger: tr, above, leverage, ...opts }] }));
      toastMsg(`조건부 주문 접수 (${above ? "≥" : "≤"} ${tr})`);
    }
    setAmount(""); setTrigger(""); setTp(""); setSl("");
  }
  function cancel(id) { setAcct((a) => ({ ...a, openOrders: a.openOrders.filter((o) => o.id !== id) })); toastMsg("주문 취소"); }
  function closePosition(sym) {
    setAcct((a) => {
      const pos = (a.positions || {})[sym]; if (!pos) return a;
      const px = prices[sym]?.px ?? pos.entry;
      return applyFill(a, sym, pos.side === "long" ? "sell" : "buy", pos.qty, px, 1, "market");
    });
    toastMsg("포지션 청산");
  }
  function setPct(pct) {
    const px = parseFloat(price) || p.px; if (!px) return;
    // 진입: 명목 = 가용잔고 × 레버리지 × %  /  청산: 포지션 명목 × %
    const notional = isOpening ? acct.cashUSDT * leverage * pct : (posCur?.qty || 0) * px * pct;
    setAmount(notional.toFixed(2));
  }

  const fmt = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: coin.dec, maximumFractionDigits: coin.dec });
  const up = (p.chg ?? 0) >= 0;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden overflow-x-hidden text-[13px]">
      {/* top */}
      <div className="min-h-14 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 lg:py-0 lg:h-14 lg:gap-5 lg:px-4 bg-bg2 border-b border-line shrink-0 sticky top-0 z-30">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-lg">
          <span className="w-6 h-6 rounded-md bg-grad grid place-items-center font-black text-white text-xs">{brand.logoMark}</span>{brand.name}
        </Link>
        {/* 상단 네비게이션 탭 */}
        <nav className="flex items-center gap-1">
          {[["trade", "투자"], ["history", "거래 내역"], ["mypage", "마이페이지"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition ${view === v ? "bg-panel2 text-ink" : "text-muted hover:text-ink"}`}>{l}</button>
          ))}
        </nav>
        {view === "trade" && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-panel border border-line rounded-[10px]">
            <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-extrabold text-white" style={{ background: coin.color }}>{cur.slice(0, 2)}</span>
            <span className="font-bold text-[15px]">{cur}/USDT</span>
            <span className={`font-bold ${up ? "text-up" : "text-down"}`}>{fmt(p.px)}</span>
            <span className={`text-xs ${up ? "text-up" : "text-down"}`}>{up ? "+" : ""}{(p.chg ?? 0).toFixed(2)}%</span>
          </div>
        )}
        {view === "trade" && (
          <div className="hidden lg:flex gap-5 text-xs">
            <div><span className="text-muted mr-1">24h 고가</span><b>{fmt(p.hi)}</b></div>
            <div><span className="text-muted mr-1">24h 저가</span><b>{fmt(p.lo)}</b></div>
            <div><span className="text-muted mr-1">연결</span><b className={connected ? "text-up" : "text-muted"}>{connected ? "실시간" : "폴백"}</b></div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2.5 lg:gap-4 text-xs">
          <span className="hidden sm:inline-block text-[10px] font-bold text-brand border border-brand/40 bg-brand/10 rounded-full px-2.5 py-1">모의투자 · 가상머니</span>
          <div className="hidden md:block"><span className="text-muted mr-1.5">계정</span><b>{uid}</b></div>
          <div><span className="text-muted mr-1.5">평가자산</span><b className="tabnum">${equity.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
          <div><span className="text-muted mr-1.5">수익률</span>
            <b className={`tabnum ${summary.pnl >= 0 ? "text-up" : "text-down"}`}>{summary.pnl >= 0 ? "+" : ""}{summary.roi.toFixed(2)}%</b>
          </div>
          <button className="btn btn-primary px-3 py-1.5 text-white" onClick={() => setWalletOpen(true)}>지갑</button>
          <Link href="/" className="btn btn-ghost px-3 py-1.5">로그아웃</Link>
        </div>
      </div>

      {/* 투자 (거래 그리드) */}
      {view === "trade" && (
      <div className="flex-1 min-h-0 flex flex-col gap-2 p-2 lg:grid lg:grid-cols-[220px_1fr_300px] lg:grid-rows-[1fr_220px]">
        {/* markets */}
        <div className="card !rounded-xl overflow-hidden flex flex-col lg:row-span-2 shrink-0">
          <h3 className="hidden lg:block text-[11px] text-muted font-bold uppercase px-3 py-2.5 border-b border-line">마켓</h3>
          <div className="flex lg:block overflow-x-auto lg:overflow-auto">
            {brand.coins.map((c) => {
              const cp = prices[c.sym] || {}; const cu = (cp.chg ?? 0) >= 0;
              return (
                <div key={c.sym} onClick={() => setCur(c.sym)}
                  className={`flex items-center gap-2 px-3 py-2.5 border-line/50 cursor-pointer hover:bg-panel2 shrink-0 min-w-[160px] border-r lg:min-w-0 lg:border-r-0 lg:border-b ${c.sym === cur ? "bg-[rgba(20,184,166,.10)] shadow-[inset_0_-3px_0_var(--brand)] lg:shadow-[inset_3px_0_0_var(--brand)]" : ""}`}>
                  <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-extrabold text-white shrink-0" style={{ background: c.color }}>{c.sym.slice(0, 2)}</span>
                  <div><div className="font-semibold">{c.sym}<span className="text-muted2">/USDT</span></div><div className="text-[10px] text-muted2">{c.name}</div></div>
                  <div className="ml-auto text-right">
                    <div className="font-bold text-xs tabnum">{cp.px ? cp.px.toLocaleString("en-US", { maximumFractionDigits: c.dec }) : "—"}</div>
                    <div className={`text-[10px] font-semibold tabnum ${cu ? "text-up" : "text-down"}`}>{cu ? "+" : ""}{(cp.chg ?? 0).toFixed(2)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* chart */}
        <div className="card !rounded-xl overflow-hidden flex flex-col h-[300px] lg:h-auto shrink-0 min-h-0">
          <div className="flex gap-1.5 px-3 py-2 border-b border-line overflow-x-auto">
            {TF.map(([v, l]) => (
              <button key={v} onClick={() => setTf(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${tf === v ? "bg-brand text-white border-brand" : "bg-panel2 text-muted border-line"}`}>{l}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0"><TradingViewChart symbol={coin.tv} interval={tf} /></div>
        </div>

        {/* orderbook + form */}
        <div className="card !rounded-xl overflow-hidden flex flex-col shrink-0 lg:min-h-0">
          <h3 className="text-[11px] text-muted font-bold uppercase px-3 py-2.5 border-b border-line">호가</h3>
          <div className="flex-1 overflow-auto max-h-[240px] lg:max-h-none text-xs">
            {book.asks.map((a, i) => <BookRow key={"a" + i} row={a} kind="ask" max={book.max} fmt={fmt} onClick={() => setPrice(a.p.toFixed(coin.dec))} />)}
            <div className="px-3 py-1.5 text-base font-extrabold border-y border-line flex items-center gap-2">
              <span className={up ? "text-up" : "text-down"}>{fmt(p.px)}</span>
            </div>
            {book.bids.map((b, i) => <BookRow key={"b" + i} row={b} kind="bid" max={book.max} fmt={fmt} onClick={() => setPrice(b.p.toFixed(coin.dec))} />)}
          </div>
          <div className="border-t border-line p-3">
            <div className="flex gap-1.5 mb-2.5">
              <button onClick={() => setSide("buy")} className={`flex-1 py-2 rounded-lg border font-bold ${side === "buy" ? "bg-up text-black border-up" : "bg-panel2 text-muted border-line"}`}>매수</button>
              <button onClick={() => setSide("sell")} className={`flex-1 py-2 rounded-lg border font-bold ${side === "sell" ? "bg-down text-white border-down" : "bg-panel2 text-muted border-line"}`}>매도</button>
            </div>
            {/* 레버리지 슬라이더 (진입 시 적용) */}
            <div className={`mb-2.5 ${!isOpening ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] text-muted">레버리지</span>
                <span className="text-[11px] font-bold text-brand">{leverage}x</span>
              </div>
              <input type="range" min="1" max="125" value={leverage} onChange={(e) => setLeverage(+e.target.value)}
                className="w-full mb-1.5" style={{ accentColor: "var(--brand)" }} />
              <div className="flex gap-1">
                {[1, 5, 10, 25, 50, 125].map((L) => (
                  <button key={L} onClick={() => setLeverage(L)}
                    className={`flex-1 py-0.5 rounded text-[10px] font-bold border ${leverage === L ? "bg-brand text-white border-brand" : "bg-panel2 text-muted border-line"}`}>{L}x</button>
                ))}
              </div>
            </div>
            <div className="flex gap-1 mb-2">
              {[["market", "시장가"], ["limit", "지정가"], ["stop", "조건부"]].map(([v, l]) => (
                <button key={v} onClick={() => setType(v)}
                  className={`flex-1 py-1.5 rounded-md text-[12px] font-semibold border ${type === v ? "bg-brand text-white border-brand" : "bg-panel2 text-muted border-line"}`}>{l}</button>
              ))}
            </div>
            {type === "limit" && (
              <Field label="가격">
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="지정가"
                  className="flex-1 px-2.5 py-2 bg-bg2 border border-line rounded-lg text-ink outline-none focus:border-brand" />
              </Field>
            )}
            {type === "stop" && (
              <Field label="트리거">
                <input type="number" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="발동 가격"
                  className="flex-1 px-2.5 py-2 bg-bg2 border border-line rounded-lg text-ink outline-none focus:border-brand" />
              </Field>
            )}
            <Field label="금액">
              <div className="flex-1 relative">
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-2.5 py-2 pr-14 bg-bg2 border border-line rounded-lg text-ink outline-none focus:border-brand" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted2">USDT</span>
              </div>
            </Field>
            <div className="flex gap-1.5 mb-1.5">
              {[0.25, 0.5, 0.75, 1].map((pct) => <button key={pct} onClick={() => setPct(pct)} className="flex-1 py-1 bg-panel2 border border-line rounded-md text-[11px] text-muted hover:text-ink">{pct * 100}%</button>)}
            </div>
            {(() => {
              const epx = type === "market" ? p.px : (parseFloat(price) || p.px);
              const amtN = parseFloat(amount) || 0;
              const estQty = epx ? amtN / epx : 0;
              const estMargin = isOpening ? amtN / leverage : 0;
              return amtN > 0 ? (
                <div className="flex justify-between text-[10px] text-muted2 mb-2">
                  <span>≈ {estQty.toFixed(coin.qdec)} {cur}</span>
                  {isOpening && <span>증거금 ${estMargin.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>}
                </div>
              ) : null;
            })()}
            {isOpening && (
              <div className="flex gap-1.5 mb-2">
                <input type="number" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="익절 TP"
                  className="flex-1 w-0 px-2 py-1.5 bg-bg2 border border-line rounded-lg text-ink text-[12px] outline-none focus:border-up" />
                <input type="number" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="손절 SL"
                  className="flex-1 w-0 px-2 py-1.5 bg-bg2 border border-line rounded-lg text-ink text-[12px] outline-none focus:border-down" />
              </div>
            )}
            <div className="flex justify-between text-[11px] text-muted mb-2">
              <span>{isOpening ? `주문여력 (${leverage}x)` : `청산가능 (${orderDir === "long" ? "숏" : "롱"})`}</span>
              <span className="tabnum">{isOpening ? "$" + (acct.cashUSDT * leverage).toLocaleString("en-US", { maximumFractionDigits: 2 }) : (posCur?.qty || 0).toFixed(coin.qdec) + " " + cur}</span>
            </div>
            <button onClick={submit} className={`w-full py-3 rounded-[10px] font-bold text-sm ${side === "buy" ? "bg-up text-black" : "bg-down text-white"}`}>
              {cur} {isOpening ? (orderDir === "long" ? "롱 진입" : "숏 진입") : (orderDir === "long" ? "숏 청산" : "롱 청산")}
            </button>
          </div>
        </div>

        {/* bottom */}
        <div className="card !rounded-xl overflow-hidden flex flex-col lg:col-span-2 h-[260px] lg:h-auto shrink-0">
          <div className="flex gap-1 px-3 pt-2 overflow-x-auto">
            {[["pos", "보유자산"], ["open", "미체결"], ["hist", "체결내역"], ["tape", "체결테이프"], ["equity", "자산추이"]].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${tab === v ? "bg-panel2 text-ink" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          <div className="flex-1 overflow-auto">
            {tab === "pos" && <PosTable acct={acct} prices={prices} summary={summary} onClose={closePosition} />}
            {tab === "open" && <OpenTable acct={acct} onCancel={cancel} />}
            {tab === "hist" && <HistTable acct={acct} />}
            {tab === "tape" && <TradeTape trades={recentTrades} sym={cur} dec={coin.dec} />}
            {tab === "equity" && <EquityCurve series={equitySeries} summary={summary} />}
          </div>
        </div>
      </div>
      )}

      {/* 거래 내역 */}
      {view === "history" && (
        <div className="flex-1 min-h-0 overflow-auto p-3 lg:p-6">
          <div className="max-w-[1100px] mx-auto card !rounded-xl overflow-hidden">
            <h2 className="text-sm font-bold px-5 py-3 border-b border-line">거래 내역</h2>
            <HistTable acct={acct} />
          </div>
        </div>
      )}

      {/* 마이페이지 */}
      {view === "mypage" && (
        <div className="flex-1 min-h-0 overflow-auto p-3 lg:p-6">
          <MyPageView acct={acct} summary={summary} series={equitySeries} uid={uid}
            onDeposit={(v) => { deposit(v); toastMsg(`가상자금 ${v.toLocaleString()} USDT 충전`); }}
            onWithdraw={(v) => { withdraw(v); toastMsg(`가상자금 ${v.toLocaleString()} USDT 출금`); }}
            onReset={() => { reset(); toastMsg("모의투자 계좌 초기화"); }} />
        </div>
      )}

      <div className={`fixed right-5 bottom-5 bg-[#1e2333] border border-line text-white px-4 py-2.5 rounded-[10px] text-[13px] transition ${toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}>{toast}</div>

      {walletOpen && (
        <WalletModal
          wallet={acct} summary={summary}
          onClose={() => setWalletOpen(false)}
          onDeposit={(v) => { deposit(v); toastMsg(`가상자금 ${v.toLocaleString()} USDT 충전`); }}
          onWithdraw={(v) => { withdraw(v); toastMsg(`가상자금 ${v.toLocaleString()} USDT 출금`); }}
          onReset={() => { reset(); toastMsg("모의투자 계좌 초기화"); }}
        />
      )}
    </div>
  );
}

function WalletModal({ wallet, summary, onClose, onDeposit, onWithdraw, onReset }) {
  const [amt, setAmt] = useState("");
  const quick = [100, 500, 1000, 5000];
  const v = parseInt(amt, 10) || 0;
  return (
    <div className="fixed inset-0 z-[100] bg-[rgba(2,6,23,.75)] backdrop-blur-sm grid place-items-center p-5" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card !rounded-2xl w-full max-w-[440px] p-7 relative">
        <button className="absolute top-4 right-5 text-2xl text-muted" onClick={onClose}>×</button>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xl font-extrabold">가상 지갑</h3>
          <span className="text-[10px] font-bold text-brand border border-brand/40 bg-brand/10 rounded-full px-2 py-0.5">MOCK · 가짜돈</span>
        </div>
        <p className="text-muted2 text-xs mb-5">실제 결제·입금이 아닙니다. 모의투자용 가상 USDT입니다.</p>

        {/* summary */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <Stat label="평가자산" val={"$" + summary.equity.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
          <Stat label="가상 예수금" val={"$" + wallet.cashUSDT.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
          <Stat label="투입원금" val={"$" + summary.principal.toLocaleString("en-US", { maximumFractionDigits: 0 })} />
          <Stat label="총 손익" val={(summary.pnl >= 0 ? "+$" : "-$") + Math.abs(summary.pnl).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            cls={summary.pnl >= 0 ? "text-up" : "text-down"} sub={`${summary.pnl >= 0 ? "+" : ""}${summary.roi.toFixed(2)}%`} />
        </div>

        {/* amount */}
        <label className="block text-[13px] text-muted mb-1.5">금액 (USDT)</label>
        <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0"
          className="w-full px-3.5 py-3 bg-bg2 border border-line rounded-[10px] text-ink text-sm outline-none focus:border-brand mb-2.5" />
        <div className="flex gap-1.5 mb-4">
          {quick.map((q) => <button key={q} onClick={() => setAmt(String(q))} className="flex-1 py-1.5 bg-panel2 border border-line rounded-md text-[11px] text-muted hover:text-ink">+${q.toLocaleString()}</button>)}
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => { if (v > 0) { onDeposit(v); setAmt(""); } }} className="btn btn-primary flex-1 py-3 text-white">가상자금 충전</button>
          <button onClick={() => { if (v > 0) { onWithdraw(v); setAmt(""); } }} className="btn btn-ghost flex-1 py-3">출금</button>
        </div>
        <button onClick={onReset} className="w-full mt-2.5 py-2.5 rounded-[10px] border border-down/40 text-down bg-down/5 text-[13px] font-semibold hover:bg-down/10">모의투자 계좌 초기화</button>

        {/* ledger */}
        {wallet.ledger?.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] text-muted font-bold uppercase mb-2">입출금 내역</div>
            <div className="max-h-[130px] overflow-auto flex flex-col gap-1">
              {wallet.ledger.slice(0, 20).map((l, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-line/40">
                  <span className={l.type === "deposit" ? "text-up" : l.type === "withdraw" ? "text-down" : "text-muted"}>
                    {l.type === "deposit" ? "충전" : l.type === "withdraw" ? "출금" : "초기화"}
                  </span>
                  <span className="tabnum">{l.type === "withdraw" ? "-" : "+"}${l.amt.toLocaleString()}</span>
                  <span className="text-muted2">{new Date(l.t).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Stat({ label, val, cls = "", sub }) {
  return (
    <div className="bg-[rgba(255,255,255,.03)] border border-line rounded-xl px-3.5 py-3">
      <div className="text-muted text-[11px] mb-1">{label}</div>
      <div className={`font-bold tabnum ${cls}`}>{val}{sub && <span className="text-[11px] ml-1.5">{sub}</span>}</div>
    </div>
  );
}

function MyPageView({ acct, summary, series, uid, onDeposit, onWithdraw, onReset }) {
  const [amt, setAmt] = useState("");
  const quick = [100, 500, 1000, 5000];
  const v = parseInt(amt, 10) || 0;
  const up = summary.pnl >= 0;
  const num = (n, d = 2) => (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const realized = acct.realizedPnL || 0;
  const openPositions = Object.keys(acct.positions || {}).length;
  const trades = (acct.history || []).length;
  return (
    <div className="max-w-[1100px] mx-auto grid lg:grid-cols-[1.3fr_1fr] gap-4">
      {/* 좌: 계정 + 요약 + 자산추이 */}
      <div className="flex flex-col gap-4">
        <div className="card !rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-12 h-12 rounded-full bg-grad grid place-items-center font-black text-white text-lg">{(uid || "G").slice(0, 1).toUpperCase()}</span>
            <div>
              <div className="font-bold text-lg">{uid}</div>
              <div className="text-muted2 text-xs">모의투자 계정 · 가상머니</div>
            </div>
            <span className="ml-auto text-[10px] font-bold text-brand border border-brand/40 bg-brand/10 rounded-full px-2.5 py-1">MOCK</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Stat label="평가자산" val={"$" + num(summary.equity)} />
            <Stat label="가상 예수금" val={"$" + num(acct.cashUSDT)} />
            <Stat label="투입원금" val={"$" + num(summary.principal, 0)} />
            <Stat label="미실현손익" val={(summary.upnl >= 0 ? "+$" : "-$") + num(Math.abs(summary.upnl))} cls={summary.upnl >= 0 ? "text-up" : "text-down"} />
            <Stat label="실현손익" val={(realized >= 0 ? "+$" : "-$") + num(Math.abs(realized))} cls={realized >= 0 ? "text-up" : "text-down"} />
            <Stat label="총 수익률" val={(up ? "+" : "") + summary.roi.toFixed(2) + "%"} cls={up ? "text-up" : "text-down"} />
          </div>
          <div className="flex gap-5 mt-3 text-xs text-muted">
            <span>보유 포지션 <b className="text-ink">{openPositions}</b></span>
            <span>누적 거래 <b className="text-ink">{trades}</b></span>
          </div>
        </div>
        <div className="card !rounded-xl p-1">
          <h3 className="text-sm font-bold px-4 pt-3">자산 추이</h3>
          <EquityCurve series={series} summary={summary} />
        </div>
      </div>

      {/* 우: 가상 지갑 */}
      <div className="card !rounded-xl p-5 h-fit">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-extrabold">가상 지갑</h3>
          <span className="text-[10px] font-bold text-brand border border-brand/40 bg-brand/10 rounded-full px-2 py-0.5">가짜돈</span>
        </div>
        <p className="text-muted2 text-xs mb-4">실제 결제·입금이 아닙니다. 모의투자용 가상 USDT입니다.</p>
        <label className="block text-[13px] text-muted mb-1.5">금액 (USDT)</label>
        <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0"
          className="w-full px-3.5 py-3 bg-bg2 border border-line rounded-[10px] text-ink text-sm outline-none focus:border-brand mb-2.5" />
        <div className="flex gap-1.5 mb-4">
          {quick.map((q) => <button key={q} onClick={() => setAmt(String(q))} className="flex-1 py-1.5 bg-panel2 border border-line rounded-md text-[11px] text-muted hover:text-ink">+${q.toLocaleString()}</button>)}
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => { if (v > 0) { onDeposit(v); setAmt(""); } }} className="btn btn-primary flex-1 py-3 text-white">충전</button>
          <button onClick={() => { if (v > 0) { onWithdraw(v); setAmt(""); } }} className="btn btn-ghost flex-1 py-3">출금</button>
        </div>
        <button onClick={onReset} className="w-full mt-2.5 py-2.5 rounded-[10px] border border-down/40 text-down bg-down/5 text-[13px] font-semibold hover:bg-down/10">계좌 초기화</button>

        {acct.ledger?.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] text-muted font-bold uppercase mb-2">입출금 내역</div>
            <div className="max-h-[180px] overflow-auto flex flex-col gap-1">
              {acct.ledger.slice(0, 30).map((l, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-line/40">
                  <span className={l.type === "deposit" ? "text-up" : l.type === "withdraw" ? "text-down" : "text-muted"}>
                    {l.type === "deposit" ? "충전" : l.type === "withdraw" ? "출금" : "초기화"}
                  </span>
                  <span className="tabnum">{l.type === "withdraw" ? "-" : "+"}${l.amt.toLocaleString()}</span>
                  <span className="text-muted2">{new Date(l.t).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const MM = 0.005; // 유지증거금 비율

/**
 * 롱/숏 격리마진 체결.
 *  side 'buy'  → 롱 증가 / 숏 감소·청산·반전
 *  side 'sell' → 숏 증가 / 롱 감소·청산·반전
 * 마진은 진입 시 예수금에서 잠기고, 청산 시 실현손익과 함께 반환. 수수료 항상 차감.
 */
function applyFill(a, sym, side, qty, price, leverage = 1, kind = "market", opts = {}) {
  const FEE = brand.feeRate || 0;
  const lev = Math.max(1, leverage || 1);
  const positions = { ...(a.positions || {}) };
  const dir = side === "buy" ? "long" : "short";
  const fee = qty * price * FEE;
  let cash = a.cashUSDT - fee;
  let realizedGross = 0, closing = false;
  const pos = positions[sym];
  const tp = opts.tp != null && opts.tp !== "" ? Number(opts.tp) : undefined;
  const sl = opts.sl != null && opts.sl !== "" ? Number(opts.sl) : undefined;

  if (!pos || pos.qty <= 1e-12) {
    // 신규 진입
    const margin = (qty * price) / lev;
    cash -= margin;
    positions[sym] = { side: dir, qty, entry: price, margin, tp, sl };
  } else if (pos.side === dir) {
    // 같은 방향 추가
    const margin = (qty * price) / lev;
    cash -= margin;
    const nq = pos.qty + qty;
    positions[sym] = { side: dir, qty: nq, entry: (pos.entry * pos.qty + price * qty) / nq, margin: pos.margin + margin, tp: tp ?? pos.tp, sl: sl ?? pos.sl };
  } else {
    // 반대 방향: 감소/청산 (초과 시 반전)
    closing = true;
    const closeQty = Math.min(qty, pos.qty);
    const pnl = (pos.side === "long" ? (price - pos.entry) : (pos.entry - price)) * closeQty;
    const marginReleased = pos.margin * (closeQty / pos.qty);
    cash += marginReleased + pnl;
    realizedGross += pnl;
    const remain = pos.qty - closeQty;
    if (remain > 1e-12) {
      positions[sym] = { side: pos.side, qty: remain, entry: pos.entry, margin: pos.margin - marginReleased };
    } else {
      delete positions[sym];
      const flip = qty - closeQty;
      if (flip > 1e-12) {
        const margin = (flip * price) / lev;
        cash -= margin;
        positions[sym] = { side: dir, qty: flip, entry: price, margin };
      }
    }
  }

  const rec = { sym, side, dir, qty, price, leverage: lev, fee, kind, t: Date.now() };
  if (closing) rec.realized = realizedGross - fee;
  return {
    ...a, cashUSDT: cash, positions,
    realizedPnL: (a.realizedPnL || 0) + (closing ? realizedGross - fee : 0),
    history: [rec, ...a.history].slice(0, 200),
  };
}

/** 청산 검사: 포지션 손실이 마진을 소진하면 강제 청산 */
function checkLiquidations(a, prices) {
  let changed = false, na = a, liquidated = [];
  for (const sym of Object.keys(a.positions || {})) {
    const pos = na.positions[sym];
    if (!pos) continue;
    const px = prices[sym]?.px;
    if (px == null) continue;
    const pnl = (pos.side === "long" ? (px - pos.entry) : (pos.entry - px)) * pos.qty;
    if (pos.margin + pnl <= pos.margin * MM) {   // 마진 소진 → 청산
      na = applyFill(na, sym, pos.side === "long" ? "sell" : "buy", pos.qty, px, 1, "liquidation");
      liquidated.push(sym); changed = true;
    }
  }
  return { wallet: na, changed, liquidated };
}
function genBook(mid, dec) {
  if (!mid) return { asks: [], bids: [], max: 1 };
  const step = mid * 0.0002, asks = [], bids = [];
  for (let i = 8; i >= 1; i--) asks.push({ p: mid + step * i, q: Math.random() * 3 + 0.1 });
  for (let i = 1; i <= 8; i++) bids.push({ p: mid - step * i, q: Math.random() * 3 + 0.1 });
  const max = Math.max(...asks.concat(bids).map((x) => x.q));
  return { asks, bids, max };
}
function BookRow({ row, kind, max, fmt, onClick }) {
  const ask = kind === "ask";
  return (
    <div onClick={onClick} className="grid grid-cols-2 gap-2 px-3 h-5 items-center relative cursor-pointer">
      <span className={`z-10 font-semibold ${ask ? "text-down" : "text-up"}`}>{fmt(row.p)}</span>
      <span className="z-10 text-right text-muted tabnum">{row.q.toFixed(4)}</span>
      <span className={`absolute top-0 bottom-0 right-0 ${ask ? "bg-down" : "bg-up"}`} style={{ width: (row.q / max) * 100 + "%", opacity: 0.12 }} />
    </div>
  );
}
function Field({ label, children }) {
  return <div className="flex items-center gap-2 mb-2"><label className="w-11 text-muted text-xs">{label}</label>{children}</div>;
}
function Th({ children }) { return <th className="px-3 py-2 text-right text-muted font-semibold first:text-left sticky top-0 bg-panel">{children}</th>; }
function Td({ children, cls = "" }) { return <td className={`px-3 py-2 text-right first:text-left border-b border-line/50 ${cls}`}>{children}</td>; }

function PosTable({ acct, prices, summary, onClose }) {
  const positions = acct.positions || {};
  const syms = Object.keys(positions);
  const num = (v, d = 2) => (v ?? 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const usage = summary && summary.equity > 0 ? Math.min(100, (summary.lockedMargin / summary.equity) * 100) : 0;
  const riskCol = usage < 50 ? "var(--up)" : usage < 80 ? "#f0b90b" : "var(--down)";
  return (
    <div>
      {syms.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line text-xs sticky top-0 bg-panel z-10">
          <span className="text-muted">마진 사용률</span>
          <div className="flex-1 max-w-[220px] h-2 rounded-full bg-panel2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: usage + "%", background: riskCol }} />
          </div>
          <b className="tabnum" style={{ color: riskCol }}>{usage.toFixed(1)}%</b>
          <span className="text-muted2">{usage < 50 ? "안전" : usage < 80 ? "주의" : "위험"}</span>
        </div>
      )}
      <table className="w-full border-collapse text-xs">
        <thead><tr><Th>포지션</Th><Th>방향</Th><Th>수량</Th><Th>진입가</Th><Th>현재가</Th><Th>레버리지</Th><Th>청산가</Th><Th>TP/SL</Th><Th>평가손익</Th><Th></Th></tr></thead>
        <tbody>
          <tr><Td>USDT <span className="text-muted2">(예수금)</span></Td><Td>-</Td><Td cls="tabnum">{num(acct.cashUSDT)}</Td><Td>-</Td><Td>-</Td><Td>-</Td><Td>-</Td><Td>-</Td><Td>-</Td><Td></Td></tr>
          {syms.map((s) => {
            const pos = positions[s];
            const px = prices[s]?.px ?? pos.entry;
            const notional = pos.qty * pos.entry;
            const effLev = pos.margin > 0 ? notional / pos.margin : 1;
            const pnl = (pos.side === "long" ? (px - pos.entry) : (pos.entry - px)) * pos.qty;
            const pnlPct = pos.margin > 0 ? (pnl / pos.margin) * 100 : 0;
            const off = pos.qty > 0 ? (pos.margin * 0.995) / pos.qty : 0;
            const liq = pos.side === "long" ? pos.entry - off : pos.entry + off;
            return (
              <tr key={s}>
                <Td>{s}/USDT</Td>
                <Td cls={pos.side === "long" ? "text-up font-bold" : "text-down font-bold"}>{pos.side === "long" ? "롱" : "숏"}</Td>
                <Td cls="tabnum">{num(pos.qty, 6)}</Td>
                <Td cls="tabnum">{num(pos.entry)}</Td>
                <Td cls="tabnum">{num(px)}</Td>
                <Td cls="tabnum">{effLev.toFixed(0)}x</Td>
                <Td cls="tabnum text-down">{num(liq)}</Td>
                <Td cls="tabnum text-[10px] text-muted2">{pos.tp ? "TP" : ""}{pos.tp && pos.sl ? "/" : ""}{pos.sl ? "SL" : ""}{!pos.tp && !pos.sl ? "-" : ""}</Td>
                <Td cls={`tabnum font-bold ${pnl >= 0 ? "text-up" : "text-down"}`}>{pnl >= 0 ? "+" : ""}{num(pnl)} <span className="text-[10px]">({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)</span></Td>
                <Td><button onClick={() => onClose(s)} className="border border-line bg-panel2 px-2.5 py-1 rounded-md text-[11px] hover:text-ink">청산</button></Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function OpenTable({ acct, onCancel }) {
  if (!acct.openOrders.length) return <div className="text-center text-muted2 py-7 text-xs">미체결 주문이 없습니다</div>;
  const num = (v) => (v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 });
  return (
    <table className="w-full border-collapse text-xs">
      <thead><tr><Th>마켓</Th><Th>종류</Th><Th>구분</Th><Th>가격/트리거</Th><Th>수량</Th><Th>TP/SL</Th><Th></Th></tr></thead>
      <tbody>{acct.openOrders.map((o) => (
        <tr key={o.id}>
          <Td>{o.sym}/USDT</Td>
          <Td cls="text-muted">{o.otype === "stop" ? "조건부" : "지정가"}</Td>
          <Td cls={o.side === "buy" ? "text-up font-bold" : "text-down font-bold"}>{o.side === "buy" ? "매수" : "매도"}</Td>
          <Td cls="tabnum">{o.otype === "stop" ? num(o.trigger) : num(o.price)}</Td>
          <Td cls="tabnum">{num(o.qty)}</Td>
          <Td cls="tabnum text-muted2">{o.tp ? "TP " + o.tp : ""}{o.tp && o.sl ? " / " : ""}{o.sl ? "SL " + o.sl : ""}{!o.tp && !o.sl ? "-" : ""}</Td>
          <Td><button onClick={() => onCancel(o.id)} className="border border-line bg-panel2 px-2.5 py-1 rounded-md text-[11px]">취소</button></Td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function TradeTape({ trades, sym, dec }) {
  if (!trades.length) return <div className="text-center text-muted2 py-7 text-xs">체결 흐름 수집 중…</div>;
  return (
    <table className="w-full border-collapse text-xs">
      <thead><tr><Th>가격 ({sym})</Th><Th>수량</Th><Th>시간</Th></tr></thead>
      <tbody>{trades.map((t, i) => (
        <tr key={i}>
          <Td cls={`tabnum font-semibold ${t.up ? "text-up" : "text-down"}`}>{t.px.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}</Td>
          <Td cls="tabnum">{t.qty}</Td>
          <Td cls="text-muted2">{new Date(t.t).toLocaleTimeString("ko-KR")}</Td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function EquityCurve({ series, summary }) {
  if (series.length < 2) return <div className="text-center text-muted2 py-7 text-xs">자산 추이 수집 중… (몇 초 후 표시)</div>;
  const W = 600, H = 150, pad = 6;
  const vals = series.map((s) => s.e);
  const mn = Math.min(...vals), mx = Math.max(...vals), r = (mx - mn) || 1;
  const pts = series.map((s, i) => `${pad + (i / (series.length - 1)) * (W - pad * 2)},${pad + (1 - (s.e - mn) / r) * (H - pad * 2)}`).join(" ");
  const up = summary.pnl >= 0;
  const col = up ? "var(--up)" : "var(--down)";
  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-xs">
        <span><span className="text-muted mr-1.5">현재 평가자산</span><b className="tabnum">${summary.equity.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></span>
        <span><span className="text-muted mr-1.5">총 손익</span><b className={`tabnum ${up ? "text-up" : "text-down"}`}>{up ? "+$" : "-$"}{Math.abs(summary.pnl).toLocaleString("en-US", { maximumFractionDigits: 2 })} ({up ? "+" : ""}{summary.roi.toFixed(2)}%)</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[150px]">
        <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity="0.25" /><stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient></defs>
        <polygon points={`${pad},${H - pad} ${pts} ${W - pad},${H - pad}`} fill="url(#eqg)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2" />
      </svg>
    </div>
  );
}
function HistTable({ acct }) {
  const [fSym, setFSym] = useState("all");
  const [fType, setFType] = useState("all");
  const hist = acct.history || [];
  const num = (v, d = 2) => (v ?? 0).toLocaleString("en-US", { maximumFractionDigits: d });
  if (!hist.length) return <div className="text-center text-muted2 py-7 text-xs">체결 내역이 없습니다</div>;

  const typeOf = (h) => h.kind === "liquidation" ? "liq" : (h.realized != null ? "close" : "entry");
  const view = hist.filter((h) => (fSym === "all" || h.sym === fSym) && (fType === "all" || typeOf(h) === fType));
  const symList = [...new Set(hist.map((h) => h.sym))];

  const closes = hist.filter((h) => h.realized != null);
  const wins = closes.filter((h) => h.realized > 0).length;
  const winRate = closes.length ? (wins / closes.length) * 100 : 0;
  const realizedTotal = acct.realizedPnL || 0;
  const label = (h) => h.kind === "liquidation" ? "강제청산" : h.kind === "tp" ? "익절" : h.kind === "sl" ? "손절" : (h.realized != null ? "청산" : "진입");
  const labelCls = (h) => h.kind === "liquidation" ? "text-down font-bold" : h.side === "buy" ? "text-up font-bold" : "text-down font-bold";
  const dirLabel = (h) => h.dir === "long" ? "롱" : h.dir === "short" ? "숏" : "";

  function exportCSV() {
    const header = ["시간", "마켓", "구분", "방향", "가격", "수량", "레버리지", "수수료(USDT)", "실현손익(USDT)"];
    const rows = view.map((h) => [
      new Date(h.t).toISOString(), h.sym + "/USDT", label(h), dirLabel(h),
      h.price, h.qty, h.leverage || "", (h.fee ?? 0).toFixed(4),
      h.realized != null ? h.realized.toFixed(4) : "",
    ].join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "volta-trades.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      {/* 요약 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-b border-line text-xs bg-panel2/40 sticky top-0 z-10">
        <span><span className="text-muted mr-1.5">총 거래</span><b className="tabnum">{hist.length}</b></span>
        <span><span className="text-muted mr-1.5">청산</span><b className="tabnum">{closes.length}</b></span>
        <span><span className="text-muted mr-1.5">승률</span><b className="tabnum">{winRate.toFixed(1)}%</b></span>
        <span><span className="text-muted mr-1.5">누적 실현손익</span>
          <b className={`tabnum ${realizedTotal >= 0 ? "text-up" : "text-down"}`}>{realizedTotal >= 0 ? "+$" : "-$"}{num(Math.abs(realizedTotal))}</b>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <select value={fSym} onChange={(e) => setFSym(e.target.value)} className="bg-bg2 border border-line rounded-md px-2 py-1 text-[11px] outline-none">
            <option value="all">전체 마켓</option>
            {symList.map((s) => <option key={s} value={s}>{s}/USDT</option>)}
          </select>
          <select value={fType} onChange={(e) => setFType(e.target.value)} className="bg-bg2 border border-line rounded-md px-2 py-1 text-[11px] outline-none">
            <option value="all">전체</option><option value="entry">진입</option><option value="close">청산</option><option value="liq">강제청산</option>
          </select>
          <button onClick={exportCSV} className="border border-brand/40 bg-brand/10 text-brand rounded-md px-2.5 py-1 text-[11px] font-semibold hover:bg-brand/20">CSV 내보내기</button>
        </div>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead><tr><Th>시간</Th><Th>마켓</Th><Th>구분</Th><Th>방향</Th><Th>가격</Th><Th>수량</Th><Th>레버리지</Th><Th>수수료</Th><Th>실현손익</Th></tr></thead>
        <tbody>{view.map((h, i) => (
          <tr key={i}>
            <Td cls="text-muted">{new Date(h.t).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</Td>
            <Td>{h.sym}/USDT</Td>
            <Td cls={labelCls(h)}>{label(h)}</Td>
            <Td cls={h.dir === "long" ? "text-up" : "text-down"}>{dirLabel(h)}</Td>
            <Td cls="tabnum">{num(h.price, 4)}</Td>
            <Td cls="tabnum">{num(h.qty, 6)}</Td>
            <Td cls="tabnum">{h.leverage ? h.leverage + "x" : "-"}</Td>
            <Td cls="tabnum text-muted">{h.fee ? "$" + num(h.fee, 3) : "-"}</Td>
            <Td cls={`tabnum font-bold ${h.realized == null ? "text-muted2" : h.realized >= 0 ? "text-up" : "text-down"}`}>
              {h.realized == null ? "-" : (h.realized >= 0 ? "+$" : "-$") + num(Math.abs(h.realized))}
            </Td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

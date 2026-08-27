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
  const [type, setType] = useState("limit");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [tab, setTab] = useState("pos");
  const { wallet: acct, setWallet: setAcct, deposit, withdraw, reset } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [toast, setToast] = useState("");

  const coin = useMemo(() => brand.coins.find((c) => c.sym === cur) || brand.coins[0], [cur]);
  const p = prices[cur] || {};
  const uid = sp.get("id") || "guest";

  // keep limit price synced to live px when switching symbol
  useEffect(() => { if (p.px && type === "limit") setPrice(p.px.toFixed(coin.dec)); /* eslint-disable-next-line */ }, [cur]);

  // fill open limit orders as price crosses
  useEffect(() => {
    if (!acct.openOrders.length || !p.px) return;
    setAcct((a) => {
      const keep = [], fills = [];
      for (const o of a.openOrders) {
        const lp = prices[o.sym]?.px;
        if (lp == null) { keep.push(o); continue; }
        const hit = o.side === "buy" ? lp <= o.price : lp >= o.price;
        if (hit) fills.push(o); else keep.push(o);
      }
      if (!fills.length) return a;
      let na = { ...a, openOrders: keep };
      for (const o of fills) na = applyFill(na, o.sym, o.side, o.qty, o.price);
      return na;
    });
  }, [prices]); // eslint-disable-line

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

  const book = useMemo(() => genBook(p.px, coin.dec), [p.px, coin.dec]);

  function submit() {
    const q = parseFloat(qty), pr = parseFloat(price);
    if (!(q > 0)) return toastMsg("수량을 입력하세요");
    if (type === "limit" && !(pr > 0)) return toastMsg("가격을 입력하세요");
    const execPx = type === "market" ? p.px : pr;
    if (side === "buy" && q * execPx > acct.cashUSDT + 1e-6) return toastMsg("주문가능 금액 부족");
    if (side === "sell" && q > (acct.holdings[cur] || 0) + 1e-9) return toastMsg("보유수량 부족");
    if (type === "market") { setAcct((a) => applyFill(a, cur, side, q, execPx)); toastMsg(`시장가 ${side === "buy" ? "매수" : "매도"} 체결`); }
    else { setAcct((a) => ({ ...a, openOrders: [...a.openOrders, { id: Date.now(), sym: cur, side, qty: q, price: pr }] })); toastMsg("지정가 주문 접수"); }
    setQty("");
  }
  function cancel(id) { setAcct((a) => ({ ...a, openOrders: a.openOrders.filter((o) => o.id !== id) })); toastMsg("주문 취소"); }
  function setPct(pct) {
    if (side === "buy") { const px = parseFloat(price) || p.px; if (px) setQty(((acct.cashUSDT * pct) / px).toFixed(coin.qdec)); }
    else setQty(((acct.holdings[cur] || 0) * pct).toFixed(coin.qdec));
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
        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-panel border border-line rounded-[10px]">
          <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-extrabold text-white" style={{ background: coin.color }}>{cur.slice(0, 2)}</span>
          <span className="font-bold text-[15px]">{cur}/USDT</span>
          <span className={`font-bold ${up ? "text-up" : "text-down"}`}>{fmt(p.px)}</span>
          <span className={`text-xs ${up ? "text-up" : "text-down"}`}>{up ? "+" : ""}{(p.chg ?? 0).toFixed(2)}%</span>
        </div>
        <div className="hidden lg:flex gap-5 text-xs">
          <div><span className="text-muted mr-1">24h 고가</span><b>{fmt(p.hi)}</b></div>
          <div><span className="text-muted mr-1">24h 저가</span><b>{fmt(p.lo)}</b></div>
          <div><span className="text-muted mr-1">연결</span><b className={connected ? "text-up" : "text-muted"}>{connected ? "실시간" : "폴백"}</b></div>
        </div>
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

      {/* grid */}
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
            <Field label="종류">
              <select value={type} onChange={(e) => setType(e.target.value)} className="flex-1 px-2.5 py-2 bg-bg2 border border-line rounded-lg text-ink outline-none">
                <option value="limit">지정가</option><option value="market">시장가</option>
              </select>
            </Field>
            <Field label="가격">
              <input type="number" value={type === "market" ? "" : price} disabled={type === "market"} onChange={(e) => setPrice(e.target.value)}
                placeholder={type === "market" ? "시장가" : "0"} className="flex-1 px-2.5 py-2 bg-bg2 border border-line rounded-lg text-ink outline-none focus:border-brand disabled:opacity-50" />
            </Field>
            <Field label="수량">
              <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.00"
                className="flex-1 px-2.5 py-2 bg-bg2 border border-line rounded-lg text-ink outline-none focus:border-brand" />
            </Field>
            <div className="flex gap-1.5 mb-2.5">
              {[0.25, 0.5, 0.75, 1].map((pct) => <button key={pct} onClick={() => setPct(pct)} className="flex-1 py-1 bg-panel2 border border-line rounded-md text-[11px] text-muted hover:text-ink">{pct * 100}%</button>)}
            </div>
            <div className="flex justify-between text-[11px] text-muted mb-2">
              <span>주문가능</span>
              <span className="tabnum">{side === "buy" ? "$" + acct.cashUSDT.toLocaleString("en-US", { maximumFractionDigits: 2 }) : (acct.holdings[cur] || 0).toFixed(coin.qdec) + " " + cur}</span>
            </div>
            <button onClick={submit} className={`w-full py-3 rounded-[10px] font-bold text-sm ${side === "buy" ? "bg-up text-black" : "bg-down text-white"}`}>{cur} {side === "buy" ? "매수" : "매도"}</button>
          </div>
        </div>

        {/* bottom */}
        <div className="card !rounded-xl overflow-hidden flex flex-col lg:col-span-2 h-[260px] lg:h-auto shrink-0">
          <div className="flex gap-1 px-3 pt-2">
            {[["pos", "보유자산"], ["open", "미체결"], ["hist", "체결내역"]].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${tab === v ? "bg-panel2 text-ink" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          <div className="flex-1 overflow-auto">
            {tab === "pos" && <PosTable acct={acct} prices={prices} />}
            {tab === "open" && <OpenTable acct={acct} onCancel={cancel} />}
            {tab === "hist" && <HistTable acct={acct} />}
          </div>
        </div>
      </div>

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

function applyFill(a, sym, side, qty, price) {
  const cost = qty * price;
  const h = { ...a.holdings };
  if (side === "buy") { h[sym] = (h[sym] || 0) + qty; }
  else { h[sym] = (h[sym] || 0) - qty; if (h[sym] < 1e-9) delete h[sym]; }
  return {
    ...a,
    cashUSDT: side === "buy" ? a.cashUSDT - cost : a.cashUSDT + cost,
    holdings: h,
    history: [{ sym, side, qty, price, t: Date.now() }, ...a.history].slice(0, 60),
  };
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

function PosTable({ acct, prices }) {
  const rows = Object.keys(acct.holdings);
  return (
    <table className="w-full border-collapse text-xs">
      <thead><tr><Th>자산</Th><Th>수량</Th><Th>평가액(USDT)</Th><Th>현재가</Th></tr></thead>
      <tbody>
        <tr><Td>USDT</Td><Td cls="tabnum">{acct.cashUSDT.toLocaleString("en-US", { maximumFractionDigits: 2 })}</Td><Td cls="tabnum">{acct.cashUSDT.toLocaleString("en-US", { maximumFractionDigits: 2 })}</Td><Td>-</Td></tr>
        {rows.map((s) => (
          <tr key={s}><Td>{s}</Td><Td cls="tabnum">{acct.holdings[s]}</Td>
            <Td cls="tabnum">{(acct.holdings[s] * (prices[s]?.px || 0)).toLocaleString("en-US", { maximumFractionDigits: 2 })}</Td>
            <Td cls="tabnum">{(prices[s]?.px || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</Td></tr>
        ))}
      </tbody>
    </table>
  );
}
function OpenTable({ acct, onCancel }) {
  if (!acct.openOrders.length) return <div className="text-center text-muted2 py-7 text-xs">미체결 주문이 없습니다</div>;
  return (
    <table className="w-full border-collapse text-xs">
      <thead><tr><Th>마켓</Th><Th>구분</Th><Th>가격</Th><Th>수량</Th><Th></Th></tr></thead>
      <tbody>{acct.openOrders.map((o) => (
        <tr key={o.id}><Td>{o.sym}/USDT</Td><Td cls={o.side === "buy" ? "text-up font-bold" : "text-down font-bold"}>{o.side === "buy" ? "매수" : "매도"}</Td>
          <Td cls="tabnum">{o.price}</Td><Td cls="tabnum">{o.qty}</Td>
          <Td><button onClick={() => onCancel(o.id)} className="border border-line bg-panel2 px-2.5 py-1 rounded-md text-[11px]">취소</button></Td></tr>
      ))}</tbody>
    </table>
  );
}
function HistTable({ acct }) {
  if (!acct.history.length) return <div className="text-center text-muted2 py-7 text-xs">체결 내역이 없습니다</div>;
  return (
    <table className="w-full border-collapse text-xs">
      <thead><tr><Th>마켓</Th><Th>구분</Th><Th>가격</Th><Th>수량</Th><Th>시간</Th></tr></thead>
      <tbody>{acct.history.map((h, i) => (
        <tr key={i}><Td>{h.sym}/USDT</Td><Td cls={h.side === "buy" ? "text-up font-bold" : "text-down font-bold"}>{h.side === "buy" ? "매수" : "매도"}</Td>
          <Td cls="tabnum">{h.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}</Td><Td cls="tabnum">{h.qty}</Td>
          <Td>{new Date(h.t).toLocaleTimeString("ko-KR")}</Td></tr>
      ))}</tbody>
    </table>
  );
}

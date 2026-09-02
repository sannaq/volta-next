"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { brand } from "@/lib/brand.config";
import { buildAdminData } from "@/lib/adminMockData";
import { listTrackedUsers } from "@/lib/tracking";
import { supabaseEnabled } from "@/lib/supabase";

/**
 * 관리자 대시보드 — **합성(가짜) 데모 데이터** 전용.
 * 실제 회원가입/개인정보/비밀번호를 수집·저장·열람하지 않는다.
 * 로그인 게이트는 데모용 접근제어일 뿐이며 입력값을 저장하지 않는다.
 */
// 관리자 계정: 환경변수(NEXT_PUBLIC_ADMIN_ID / _PW)로 지정, 없으면 기본값.
// ⚠️ 클라이언트 게이트는 편의용이며 실보안이 아닙니다(번들에 노출). 실서비스는
//    Supabase role='admin' 서버검증(supabase/schema.sql)으로 전환하세요.
const DEMO_ADMIN = { id: process.env.NEXT_PUBLIC_ADMIN_ID || "admin" };
const FLAG = "volta_admin_session";
const SECRET_KEY = "volta_admin_secret";

// 모든 관리자 작업은 서버 라우트(/api/admin)에서 비밀번호를 검증한 뒤 수행한다(번들 노출 X).
async function adminApi(action, extra) {
  let secret = ""; try { secret = sessionStorage.getItem(SECRET_KEY) || ""; } catch (_) {}
  try {
    const res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret, id: DEMO_ADMIN.id, action, ...(extra || {}) }) });
    return await res.json();
  } catch (_) { return { ok: false, error: "network" }; }
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => { try { setAuthed(sessionStorage.getItem(FLAG) === "1"); } catch (_) {} }, []);
  if (!authed) return <Gate onOk={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => { try { sessionStorage.removeItem(FLAG); sessionStorage.removeItem(SECRET_KEY); } catch (_) {} setAuthed(false); }} />;
}

function Gate({ onOk }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { sessionStorage.setItem(SECRET_KEY, pw); } catch (_) {}
    let res;
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: pw, id, action: "login" }) });
      res = await r.json();
    } catch (_) { res = { ok: false, error: "network" }; }
    setBusy(false);
    if (res.ok) { try { sessionStorage.setItem(FLAG, "1"); } catch (_) {} onOk(); }
    else { try { sessionStorage.removeItem(SECRET_KEY); } catch (_) {} setErr(res.error === "server_not_configured" ? "서버 설정 필요: ADMIN_PW 환경변수" : res.error === "db_not_configured" ? "서버 설정 필요: SUPABASE 키" : "접근 정보가 올바르지 않습니다."); }
  }
  return (
    <main className="min-h-screen grid place-items-center px-5" style={{ background: "var(--bg)" }}>
      <div className="glow-bg" />
      <div className="card !rounded-2xl w-full max-w-[380px] p-8 relative z-10">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-md bg-grad grid place-items-center font-black text-white text-xs">{brand.logoMark}</span>
          <h1 className="text-lg font-extrabold">{brand.name} Admin</h1>
        </div>
        <p className="text-muted2 text-xs mb-6">데모 관리자 · 합성 데이터 전용</p>
        <form onSubmit={submit}>
          <label className="block text-[13px] text-muted mb-1.5">관리자 ID</label>
          <input value={id} onChange={(e) => setId(e.target.value)} className="w-full px-3.5 py-3 bg-bg2 border border-line rounded-[10px] text-ink text-sm outline-none focus:border-brand mb-3.5" placeholder="admin" />
          <label className="block text-[13px] text-muted mb-1.5">비밀번호</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-full px-3.5 py-3 bg-bg2 border border-line rounded-[10px] text-ink text-sm outline-none focus:border-brand" placeholder="••••••••" />
          <button disabled={busy} className="btn btn-primary w-full py-3 mt-5 text-white disabled:opacity-60">{busy ? "확인 중…" : "로그인"}</button>
        </form>
        {err && <div className="text-down text-xs text-center mt-3">{err}</div>}
        <div className="text-muted2 text-[11px] text-center mt-4">관리자 전용 · 비밀번호는 서버에서 검증됩니다(ADMIN_PW)</div>
      </div>
    </main>
  );
}

function Dashboard({ onLogout }) {
  const [data, setData] = useState(null);
  const [tracked, setTracked] = useState([]);
  useEffect(() => { setData(buildAdminData(Date.now())); }, []);
  useEffect(() => {
    let alive = true;
    const mapTk = (r) => ({ username: r.username, roi: r.roi || 0, equity: r.equity || 0, loginCount: r.login_count || 0, firstSeen: r.first_seen ? +new Date(r.first_seen) : null, lastLogin: r.last_login ? +new Date(r.last_login) : null });
    const load = () => adminApi("list").then((j) => { if (!alive) return; if (j && j.ok) setTracked((j.tracking || []).map(mapTk)); else listTrackedUsers().then((u) => { if (alive) setTracked(u || []); }); });
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const fmt = (n) => n.toLocaleString("en-US");
  const ago = (t) => {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 60) return m + "분 전";
    const h = Math.floor(m / 60); if (h < 24) return h + "시간 전";
    return Math.floor(h / 24) + "일 전";
  };
  const maxBucket = useMemo(() => data ? Math.max(...data.buckets.map((b) => b.count)) : 1, [data]);
  const maxTrend = useMemo(() => data ? Math.max(...data.signupTrend.map((b) => b.count), 1) : 1, [data]);

  if (!data) return <main className="min-h-screen grid place-items-center text-muted" style={{ background: "var(--bg)" }}>로딩…</main>;
  const k = data.kpis;

  return (
    <main className="min-h-screen relative" style={{ background: "var(--bg)" }}>
      <div className="glow-bg" />
      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-6">
        {/* header */}
        <div className="flex items-center gap-3 mb-2">
          <span className="w-8 h-8 rounded-lg bg-grad grid place-items-center font-black text-white text-sm">{brand.logoMark}</span>
          <h1 className="text-xl font-extrabold">{brand.name} 관리자 대시보드</h1>
          <span className="text-[10px] font-bold text-brand border border-brand/40 bg-brand/10 rounded-full px-2.5 py-1">합성 데모 데이터</span>
          <div className="ml-auto flex gap-2">
            <Link href="/" className="btn btn-ghost px-3 py-1.5 text-sm">사이트</Link>
            <button onClick={onLogout} className="btn btn-ghost px-3 py-1.5 text-sm">로그아웃</button>
          </div>
        </div>
        <div className="text-xs text-muted2 mb-6 bg-panel border border-line rounded-lg px-3 py-2">
          ⚠️ 표시된 모든 데이터는 <b>고정 시드로 생성된 가짜 시뮬레이션</b>입니다. 실제 회원가입·개인정보·비밀번호는 수집·저장·표시하지 않습니다.
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <Kpi label="총 모의계좌" val={fmt(k.total)} />
          <Kpi label="활성 계좌" val={fmt(k.active)} accent />
          <Kpi label="오늘 신규(가짜)" val={fmt(k.newToday)} />
          <Kpi label="평균 수익률" val={(k.avgRoi >= 0 ? "+" : "") + k.avgRoi + "%"} cls={k.avgRoi >= 0 ? "text-up" : "text-down"} />
          <Kpi label="누적 거래수" val={fmt(k.totalTrades)} />
          <Kpi label="총 평가자산(가상)" val={"$" + fmt(k.totalEquity)} />
        </div>

        {/* 실제 추적된 회원 (아이디·로그인·수익률 / 비밀번호 없음) */}
        <div className="card !rounded-xl overflow-hidden mb-6">
          <div className="flex items-center px-5 py-3 border-b border-line">
            <h3 className="text-sm font-bold">추적된 회원 <span className="text-brand">실데이터</span></h3>
            <span className="ml-2 text-[11px] text-muted2">
              ({tracked.length}명 · {supabaseEnabled ? "Supabase" : "로컬 추적"} · 비밀번호 미보관)
            </span>
          </div>
          {tracked.length === 0 ? (
            <div className="text-center text-muted2 py-8 text-xs">
              아직 로그인/가입한 회원이 없습니다. 사이트에서 아이디로 로그인하면 여기에 집계됩니다.
            </div>
          ) : (
            <div className="overflow-auto max-h-[300px]">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-muted">
                    {["아이디", "최초가입", "최근로그인", "로그인수", "모의수익률", "평가자산"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-right first:text-left sticky top-0 bg-panel font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tracked.map((u) => (
                    <tr key={u.username} className="border-b border-line/40">
                      <td className="px-4 py-2.5 font-semibold">{u.username}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{u.firstSeen ? new Date(u.firstSeen).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{u.lastLogin ? new Date(u.lastLogin).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td className="px-4 py-2.5 text-right tabnum">{u.loginCount || 0}</td>
                      <td className={`px-4 py-2.5 text-right tabnum font-bold ${(u.roi || 0) >= 0 ? "text-up" : "text-down"}`}>{(u.roi || 0) >= 0 ? "+" : ""}{(u.roi || 0).toFixed(2)}%</td>
                      <td className="px-4 py-2.5 text-right tabnum">${(u.equity || 0).toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 회원 지갑 감시 + 자금 관리 (실데이터) */}
        <WalletAdmin />

        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          {/* ROI distribution */}
          <div className="card !rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4">수익률 분포</h3>
            <div className="flex items-end gap-3 h-[140px]">
              {data.buckets.map((b) => (
                <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-xs text-muted mb-1">{b.count}</div>
                  <div className="w-full rounded-t-md bg-grad" style={{ height: `${(b.count / maxBucket) * 100}%`, minHeight: "4px" }} />
                  <div className="text-[10px] text-muted2 mt-2 text-center">{b.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* signup trend */}
          <div className="card !rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4">최근 7일 가입 추이 <span className="text-muted2 text-[11px] font-normal">(합성)</span></h3>
            <div className="flex items-end gap-3 h-[140px]">
              {data.signupTrend.map((b, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-xs text-muted mb-1">{b.count}</div>
                  <div className="w-full rounded-t-md" style={{ height: `${(b.count / maxTrend) * 100}%`, minHeight: "4px", background: "var(--brand)" }} />
                  <div className="text-[10px] text-muted2 mt-2">D-{b.day}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* accounts table */}
        <div className="card !rounded-xl overflow-hidden">
          <div className="flex items-center px-5 py-3 border-b border-line">
            <h3 className="text-sm font-bold">모의 계좌 목록</h3>
            <span className="ml-2 text-[11px] text-muted2">({data.accounts.length}건 · 전부 가짜)</span>
          </div>
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-muted">
                  {["ID", "핸들", "이메일(마스킹)", "가입", "최근활동", "충전횟수", "거래수", "수익률", "상태"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-right first:text-left sticky top-0 bg-panel font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id} className="border-b border-line/40">
                    <td className="px-4 py-2.5 text-muted2 tabnum">{a.id}</td>
                    <td className="px-4 py-2.5 font-semibold">{a.handle}</td>
                    <td className="px-4 py-2.5 text-muted">{a.emailMasked}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{ago(a.joinedAt)}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{ago(a.lastActive)}</td>
                    <td className="px-4 py-2.5 text-right tabnum">{a.deposits}</td>
                    <td className="px-4 py-2.5 text-right tabnum">{a.trades}</td>
                    <td className={`px-4 py-2.5 text-right tabnum font-bold ${a.roi >= 0 ? "text-up" : "text-down"}`}>{a.roi >= 0 ? "+" : ""}{a.roi}%</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === "active" ? "text-up bg-up/10" : "text-muted2 bg-white/5"}`}>{a.status === "active" ? "활성" : "휴면"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function WalletAdmin() {
  const [wallets, setWallets] = useState([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState(null);

  async function load() {
    const j = await adminApi("list");
    if (j && j.ok) setWallets(j.wallets || []);
    else if (j && j.error === "unauthorized") { try { sessionStorage.removeItem(FLAG); sessionStorage.removeItem(SECRET_KEY); } catch (_) {} location.reload(); }
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const money = (v) => "$" + (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const ago = (t) => { const m = Math.floor((Date.now() - new Date(t).getTime()) / 60000); if (m < 1) return "방금"; if (m < 60) return m + "분 전"; const h = Math.floor(m / 60); if (h < 24) return h + "시간 전"; return Math.floor(h / 24) + "일 전"; };
  const posSummary = (d) => {
    const p = d?.positions || {}; const ks = Object.keys(p);
    if (!ks.length) return <span className="text-muted2">-</span>;
    return ks.map((s) => {
      const x = p[s]; const sym = x.sym || s.split("#")[0];
      return <span key={s} className={`inline-block mr-1.5 ${x.side === "long" ? "text-up" : "text-down"}`}>{sym} {x.side === "long" ? "롱" : "숏"} {(+x.qty).toFixed(4)}</span>;
    });
  };

  async function grant(username, w) {
    const s = window.prompt(`[${username}] 에게 지급할 가상자금 (USDT):`, "1000");
    const amt = Math.floor(Number(s) || 0);
    if (!(amt > 0)) return; // 지급은 양수만(음수로 잔고·원금 음수 되는 것 방지)
    setBusy(username);
    const j = await adminApi("grant", { username, amount: amt });
    setNote(j && j.ok ? `${username} 에게 ${amt.toLocaleString()} USDT 지급 완료 (회원 재접속 시 반영)` : "지급 실패: " + ((j && j.error) || ""));
    setBusy(""); load();
  }
  async function resetUser(username) {
    if (!window.confirm(`[${username}] 계좌를 초기 시드로 초기화할까요? (되돌릴 수 없음)`)) return;
    setBusy(username);
    const j = await adminApi("reset", { username });
    setNote(j && j.ok ? `${username} 계좌 초기화 완료 (회원 재접속 시 반영)` : "초기화 실패: " + ((j && j.error) || ""));
    setBusy(""); load();
  }
  async function deleteUser(username) {
    if (username === DEMO_ADMIN.id) { setNote("관리자 본인 계정은 삭제할 수 없습니다."); return; }
    if (!window.confirm(`[${username}] 계정을 완전 삭제할까요?\n지갑·거래기록·로그인기록 전부 삭제되며 되돌릴 수 없습니다.`)) return;
    setBusy(username);
    const j = await adminApi("delete", { username });
    setNote(j && j.ok ? `${username} 계정 삭제 완료` : "삭제 실패: " + ((j && j.error) || ""));
    setBusy(""); load();
  }

  if (!supabaseEnabled) {
    return (
      <div className="card !rounded-xl p-5 mb-6 text-xs text-muted2">
        회원 지갑 감시·자금관리는 <b className="text-ink">Supabase 연결 시</b> 활성화됩니다. (환경변수 미설정)
      </div>
    );
  }

  return (
    <div className="card !rounded-xl overflow-hidden mb-6">
      <div className="flex items-center flex-wrap gap-2 px-5 py-3 border-b border-line">
        <h3 className="text-sm font-bold">회원 지갑 감시 · 자금 관리 <span className="text-brand">실데이터</span></h3>
        <span className="text-[11px] text-muted2">({wallets.length}개 계좌 · 5초마다 갱신)</span>
        {note && <span className="ml-auto text-[11px] text-brand">{note}</span>}
      </div>
      {wallets.length === 0 ? (
        <div className="text-center text-muted2 py-8 text-xs">아직 생성된 지갑이 없습니다. 회원이 접속해 거래하면 여기에 표시됩니다.</div>
      ) : (
        <div className="overflow-auto max-h-[420px]">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-muted">
                {["아이디", "예수금", "투입원금", "실현손익", "보유 포지션(감시)", "최근활동", "관리"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-right first:text-left sticky top-0 bg-panel font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => {
                const d = w.data || {};
                const rp = d.realizedPnL || 0;
                return (
                  <tr key={w.username} onClick={() => setDetail(w)} className="border-b border-line/40 cursor-pointer hover:bg-panel2">
                    <td className="px-4 py-2.5 font-semibold">{w.username} <span className="text-[10px] text-muted2">▸상세</span></td>
                    <td className="px-4 py-2.5 text-right tabnum">{money(d.cashUSDT)}</td>
                    <td className="px-4 py-2.5 text-right tabnum text-muted">{money(d.principal)}</td>
                    <td className={`px-4 py-2.5 text-right tabnum font-bold ${rp >= 0 ? "text-up" : "text-down"}`}>{rp >= 0 ? "+" : ""}{money(rp).slice(1)}</td>
                    <td className="px-4 py-2.5 text-right text-[11px]">{posSummary(d)}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{ago(w.updated_at)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button disabled={busy === w.username} onClick={(e) => { e.stopPropagation(); grant(w.username, w); }} className="border border-brand/40 bg-brand/10 text-brand px-2.5 py-1 rounded-md text-[11px] font-semibold mr-1 disabled:opacity-50">자금지급</button>
                      <button disabled={busy === w.username} onClick={(e) => { e.stopPropagation(); resetUser(w.username); }} className="border border-down/40 bg-down/5 text-down px-2.5 py-1 rounded-md text-[11px] font-semibold disabled:opacity-50">초기화</button>
                      <button disabled={busy === w.username || w.username === DEMO_ADMIN.id} onClick={(e) => { e.stopPropagation(); deleteUser(w.username); }} className="border border-down/60 bg-down/10 text-down px-2.5 py-1 rounded-md text-[11px] font-bold ml-1 disabled:opacity-30">삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 py-2 text-[10px] text-muted2 border-t border-line">⚠️ 전부 가상머니(MOCK)입니다. 행을 클릭하면 상세·거래내역, 지급/초기화는 회원의 다음 접속 시 반영됩니다.</div>
      {detail && <MemberDetailModal wallet={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function MemberDetailModal({ wallet, onClose }) {
  const d = wallet.data || {};
  const num = (v, dc = 2) => (v ?? 0).toLocaleString("en-US", { maximumFractionDigits: dc });
  const positions = d.positions || {};
  const posKeys = Object.keys(positions);
  const history = d.history || [];
  const rp = d.realizedPnL || 0;
  const label = (h) => h.kind === "liquidation" ? "강제청산" : h.kind === "tp" ? "익절" : h.kind === "sl" ? "손절" : (h.realized != null ? "청산" : "진입");
  return (
    <div className="fixed inset-0 z-[100] bg-[rgba(2,6,23,.8)] backdrop-blur-sm grid place-items-center p-5" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card !rounded-2xl w-full max-w-[760px] max-h-[86vh] overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line">
          <span className="w-8 h-8 rounded-full bg-grad grid place-items-center font-black text-white text-xs">{(wallet.username || "?").slice(0, 1).toUpperCase()}</span>
          <h3 className="text-base font-extrabold">{wallet.username}</h3>
          <button className="ml-auto text-2xl text-muted" onClick={onClose}>×</button>
        </div>
        <div className="overflow-auto p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <div className="bg-[rgba(255,255,255,.03)] border border-line rounded-xl px-3.5 py-3"><div className="text-muted text-[11px] mb-1">가상 예수금</div><div className="font-bold tabnum">${num(d.cashUSDT)}</div></div>
            <div className="bg-[rgba(255,255,255,.03)] border border-line rounded-xl px-3.5 py-3"><div className="text-muted text-[11px] mb-1">투입원금</div><div className="font-bold tabnum">${num(d.principal, 0)}</div></div>
            <div className="bg-[rgba(255,255,255,.03)] border border-line rounded-xl px-3.5 py-3"><div className="text-muted text-[11px] mb-1">실현손익</div><div className={`font-bold tabnum ${rp >= 0 ? "text-up" : "text-down"}`}>{rp >= 0 ? "+$" : "-$"}{num(Math.abs(rp))}</div></div>
            <div className="bg-[rgba(255,255,255,.03)] border border-line rounded-xl px-3.5 py-3"><div className="text-muted text-[11px] mb-1">보유 포지션</div><div className="font-bold tabnum">{posKeys.length}개</div></div>
          </div>
          {posKeys.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-muted mb-2">보유 포지션</div>
              <div className="flex flex-wrap gap-1.5">
                {posKeys.map((s) => {
                  const x = positions[s]; const effLev = x.margin > 0 ? Math.round((x.qty * x.entry) / x.margin) : 1;
                  return <span key={s} className={`text-[11px] px-2 py-1 rounded-md border border-line ${x.side === "long" ? "text-up" : "text-down"}`}>{s} {x.side === "long" ? "롱" : "숏"} {effLev}x · {(+x.qty).toFixed(4)} @ {num(x.entry)}</span>;
                })}
              </div>
            </div>
          )}
          <div className="text-xs font-bold text-muted mb-2">거래 내역 <span className="text-muted2 font-normal">({history.length}건)</span></div>
          {history.length === 0 ? (
            <div className="text-center text-muted2 py-6 text-xs">거래 내역이 없습니다.</div>
          ) : (
            <div className="overflow-auto max-h-[42vh] border border-line rounded-lg">
              <table className="w-full border-collapse text-xs">
                <thead><tr className="text-muted">{["시간", "마켓", "구분", "방향", "가격", "수량", "레버리지", "실현손익"].map((h) => (<th key={h} className="px-3 py-2 text-right first:text-left sticky top-0 bg-panel font-semibold">{h}</th>))}</tr></thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className="border-b border-line/40">
                      <td className="px-3 py-2 text-muted">{new Date(h.t).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-3 py-2">{h.sym}/USDT</td>
                      <td className={`px-3 py-2 ${h.kind === "liquidation" ? "text-down font-bold" : h.side === "buy" ? "text-up" : "text-down"}`}>{label(h)}</td>
                      <td className={`px-3 py-2 text-right ${h.dir === "long" ? "text-up" : "text-down"}`}>{h.dir === "long" ? "롱" : h.dir === "short" ? "숏" : "-"}</td>
                      <td className="px-3 py-2 text-right tabnum">{num(h.price, 4)}</td>
                      <td className="px-3 py-2 text-right tabnum">{num(h.qty, 6)}</td>
                      <td className="px-3 py-2 text-right tabnum">{h.leverage ? h.leverage + "x" : "-"}</td>
                      <td className={`px-3 py-2 text-right tabnum font-bold ${h.realized == null ? "text-muted2" : h.realized >= 0 ? "text-up" : "text-down"}`}>{h.realized == null ? "-" : (h.realized >= 0 ? "+$" : "-$") + num(Math.abs(h.realized))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, val, cls = "", accent }) {
  return (
    <div className={`card !rounded-xl px-4 py-3.5 ${accent ? "border-brand/40" : ""}`}>
      <div className="text-muted text-[11px] mb-1.5">{label}</div>
      <div className={`text-lg font-extrabold tabnum ${cls}`}>{val}</div>
    </div>
  );
}

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
const DEMO_ADMIN = { id: "admin", pw: "volta-admin" };
const FLAG = "volta_admin_session";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => { try { setAuthed(sessionStorage.getItem(FLAG) === "1"); } catch (_) {} }, []);
  if (!authed) return <Gate onOk={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => { try { sessionStorage.removeItem(FLAG); } catch (_) {} setAuthed(false); }} />;
}

function Gate({ onOk }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  function submit(e) {
    e.preventDefault();
    if (id === DEMO_ADMIN.id && pw === DEMO_ADMIN.pw) {
      try { sessionStorage.setItem(FLAG, "1"); } catch (_) {}
      onOk();
    } else setErr("접근 정보가 올바르지 않습니다.");
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
          <button className="btn btn-primary w-full py-3 mt-5 text-white">로그인</button>
        </form>
        {err && <div className="text-down text-xs text-center mt-3">{err}</div>}
        <div className="text-muted2 text-[11px] text-center mt-4">데모 계정 — admin / volta-admin</div>
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
    const load = () => listTrackedUsers().then((u) => { if (alive) setTracked(u || []); });
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

function Kpi({ label, val, cls = "", accent }) {
  return (
    <div className={`card !rounded-xl px-4 py-3.5 ${accent ? "border-brand/40" : ""}`}>
      <div className="text-muted text-[11px] mb-1.5">{label}</div>
      <div className={`text-lg font-extrabold tabnum ${cls}`}>{val}</div>
    </div>
  );
}

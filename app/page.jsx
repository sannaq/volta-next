"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/brand.config";
import { useBinanceStream } from "@/lib/useBinanceStream";
import { signIn, signUp } from "@/lib/auth";

function fmtUSD(v) {
  if (v == null) return "—";
  const d = v >= 1000 ? 2 : v < 10 ? 4 : 2;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function Landing() {
  const router = useRouter();
  const [modal, setModal] = useState(null); // 'login' | 'signup' | null
  const { prices, connected } = useBinanceStream();

  return (
    <main className="relative">
      <div className="glow-bg" />

      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-line backdrop-blur-xl bg-[rgba(10,11,15,.72)]">
        <div className="max-w-[1200px] mx-auto px-6 h-[66px] flex items-center gap-8">
          <Logo />
          <nav className="hidden md:flex gap-7 text-sm text-muted font-medium">
            <a href="#markets" className="hover:text-ink">시세</a>
            <a href="#features" className="hover:text-ink">기능</a>
            <a href="#" className="hover:text-ink">수수료</a>
            <a href="#" className="hover:text-ink">고객지원</a>
          </nav>
          <div className="ml-auto flex gap-2.5 items-center">
            <button className="btn btn-ghost px-4 py-2.5 text-sm" onClick={() => setModal("login")}>로그인</button>
            <button className="btn btn-primary px-4 py-2.5 text-sm" onClick={() => setModal("signup")}>회원가입</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 text-center pt-24 pb-16 px-6">
        <div className="inline-flex items-center gap-2 text-[13px] text-muted border border-line bg-panel px-3.5 py-1.5 rounded-full mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
          모의투자 · 가상머니로 무위험 연습 · 실시간 시세
        </div>
        <h1 className="text-[clamp(44px,8.5vw,108px)] font-black leading-[0.98] tracking-[-2px] mb-5">
          {brand.heroTitle[0]} <span className="text-grad">{brand.heroTitle[1]}</span><br />
          플랫폼 {brand.name}
        </h1>
        <p className="text-muted text-[clamp(15px,2vw,19px)] max-w-[620px] mx-auto mb-8">{brand.heroSubtitle}</p>
        <div className="flex gap-3.5 justify-center flex-wrap">
          <button className="btn btn-primary px-7 py-3.5 text-base" onClick={() => setModal("signup")}>모의투자 시작하기 →</button>
          <a href="#markets" className="btn btn-ghost px-7 py-3.5 text-base">실시간 시세 보기</a>
        </div>
        <div className="flex gap-12 justify-center mt-14 flex-wrap">
          {brand.stats.map((s) => (
            <div key={s.l}>
              <div className="text-[34px] font-extrabold text-grad">{s.n}</div>
              <div className="text-muted text-sm mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* INTRO BAND */}
      <section className="relative z-10 band-main py-16 px-6 border-y border-line">
        <div className="max-w-[1200px] mx-auto text-center">
          <div className="text-brand font-bold text-sm tracking-[2px] uppercase mb-3">Global Standard</div>
          <h2 className="text-[clamp(24px,3.4vw,38px)] font-extrabold tracking-[-1px] mb-4">글로벌 표준 거래소 {brand.name}</h2>
          <p className="text-muted max-w-[560px] mx-auto mb-9">당신의 미래를 설계할 수 있는 최고의 플랫폼에서 모든 것을 경험하세요.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            {[["빠른 가입", "30초 만에 시작"], ["즉시 출금", "제한 없는 입출금"], ["24/7 지원", "언제든 도움"]].map(([t, d]) => (
              <div key={t} className="bg-[rgba(255,255,255,.03)] border border-line rounded-2xl px-6 py-5 min-w-[180px]">
                <div className="text-lg font-bold text-grad mb-1">{t}</div>
                <div className="text-muted text-[13px]">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LIVE MARKETS */}
      <section id="markets" className="relative z-10 band-alt py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <SecHead k="Live Markets" title="실시간 암호화폐 시세" desc="주요 암호화폐의 가격·거래량을 실시간으로 확인하고 즉시 거래하세요" />
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-up border border-[rgba(22,199,132,.3)] bg-[rgba(22,199,132,.08)] px-3 py-1.5 rounded-full">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-up animate-pulse" : "bg-muted"}`} />
              {connected ? "Binance 실시간 연결됨" : "시세 연결 중… (폴백)"}
            </span>
          </div>
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {brand.coins.map((c) => {
              const p = prices[c.sym] || {};
              const up = (p.chg ?? 0) >= 0;
              return (
                <div key={c.sym} className="card p-5 transition hover:-translate-y-1 hover:border-brand">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-9 h-9 rounded-full grid place-items-center text-xs font-extrabold text-white" style={{ background: c.color }}>{c.sym.slice(0, 2)}</span>
                    <div><div className="font-bold text-[15px]">{c.sym}/USDT</div><div className="text-muted2 text-xs">{c.name}</div></div>
                    <span className={`ml-auto font-bold text-sm px-2 py-1 rounded-lg ${up ? "text-up bg-[rgba(22,199,132,.12)]" : "text-down bg-[rgba(234,57,67,.12)]"}`}>
                      {up ? "+" : ""}{(p.chg ?? 0).toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-[26px] font-extrabold tabnum mb-1">{fmtUSD(p.px)}</div>
                  <div className="text-muted text-xs mb-4">24h 거래량 {p.vol ? (p.vol / 1000).toFixed(1) + "K " + c.sym : "—"}</div>
                  <div className="flex gap-2">
                    <button className="btn flex-1 py-2 text-[13px] text-up bg-[rgba(22,199,132,.15)] hover:!bg-up hover:text-black" onClick={() => router.push("/trade?sym=" + c.sym)}>매수</button>
                    <button className="btn flex-1 py-2 text-[13px] text-down bg-[rgba(234,57,67,.15)] hover:!bg-down hover:!text-white" onClick={() => router.push("/trade?sym=" + c.sym)}>매도</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* LEVERAGE BAND */}
      <section className="relative z-10 band-main py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-10 items-center rounded-3xl p-12 border border-line"
               style={{ background: "linear-gradient(120deg,rgba(20,184,166,.12),rgba(16,185,129,.10))" }}>
            <div>
              <div className="text-brand font-bold tracking-[2px] text-sm mb-2">HIGH LEVERAGE</div>
              <h2 className="text-[clamp(26px,3.4vw,38px)] font-extrabold tracking-[-1px] mb-3.5">더 큰 기회, 유연한 포지션 관리</h2>
              <p className="text-muted text-base mb-6">격리·교차 마진과 리스크 관리 도구로 원하는 전략을 자유롭게 구성하세요.</p>
              <button className="btn btn-primary px-7 py-3.5 text-base" onClick={() => setModal("signup")}>거래 시작하기</button>
            </div>
            <div className="flex gap-4 flex-wrap">
              {[["125x", "최대 레버리지"], ["0.015%", "최저 수수료"], ["30초", "빠른 가입"]].map(([n, l]) => (
                <div key={l} className="bg-panel border border-line rounded-2xl px-5 py-4.5 flex-1 min-w-[110px] text-center">
                  <div className="text-[30px] font-black text-grad">{n}</div><div className="text-muted text-[13px] mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 band-alt py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <SecHead k={`Why ${brand.name}`} title={`왜 ${brand.name}를 선택할까요?`} desc="전문적이고 안전한 거래 환경을 만드는 핵심 기능을 확인하세요" />
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
            {brand.features.map((f) => (
              <div key={f.t} className="card p-7 transition hover:-translate-y-1 hover:border-brand2">
                <div className="w-13 h-13 rounded-xl bg-[rgba(20,184,166,.12)] grid place-items-center text-2xl mb-4 p-3">{f.i}</div>
                <h3 className="text-[19px] font-bold mb-2">{f.t}</h3>
                <p className="text-muted text-sm mb-4">{f.d}</p>
                <ul className="flex flex-col gap-2">
                  {f.l.map((x) => (
                    <li key={x} className="text-muted text-[13px] flex items-center gap-2">
                      <span className="text-up">✓</span>{x}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 band-main py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center bg-grad rounded-[28px] px-8 py-16 relative overflow-hidden">
            <h2 className="text-[clamp(28px,4vw,44px)] font-black text-white tracking-[-1px] mb-3.5">지금 {brand.name}에서 거래를 시작하세요</h2>
            <p className="text-white/90 text-[17px] mb-7">간편한 회원가입으로 전문 거래 환경을 경험해보세요.</p>
            <button className="btn bg-white text-[#2b2f6b] px-7 py-3.5 text-base font-bold" onClick={() => setModal("signup")}>무료 회원가입</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-line py-12 px-6 text-muted">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div><Logo /><p className="text-[13px] leading-relaxed mt-3.5">차세대 암호화폐 거래 플랫폼.<br />이 사이트는 디자인 데모 템플릿입니다.</p></div>
            <FootCol title="거래" items={["현물 거래", "선물 거래", "스테이킹", "마켓 시세"]} />
            <FootCol title="지원" items={["고객센터", "수수료 안내", "API 문서", "공지사항"]} />
            <FootCol title="회사" items={["소개", "이용약관", "개인정보처리방침", "채용"]} />
          </div>
          <div className="max-w-[900px] mx-auto text-[11px] text-muted2 text-center leading-relaxed mt-8">
            ⚠️ 데모 안내: 본 페이지는 UI/디자인 템플릿이며 실제 거래소가 아닙니다. 시세는 Binance 공개 데이터를 표시하며,
            로그인·회원가입·주문은 어떤 데이터도 저장·전송하지 않는 페이퍼(데모) 기능입니다.
          </div>
          <div className="text-center mt-6 pt-6 border-t border-line text-xs text-muted2">© 2026 {brand.name} (demo template).</div>
        </div>
      </footer>

      {modal && <AuthModal mode={modal} onClose={() => setModal(null)} onSwitch={setModal}
        onDone={(id) => { try { localStorage.setItem("volta_session", id); } catch (_) {} router.push("/trade?id=" + encodeURIComponent(id)); }} />}
    </main>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-extrabold text-xl tracking-wide">
      <span className="w-[30px] h-[30px] rounded-lg bg-grad grid place-items-center font-black text-white shadow-[0_6px_18px_rgba(91,140,255,.4)]">{brand.logoMark}</span>
      <span>{brand.name}</span>
    </div>
  );
}
function SecHead({ k, title, desc }) {
  return (
    <div className="text-center mb-12">
      <div className="text-brand font-bold text-sm tracking-[2px] uppercase">{k}</div>
      <h2 className="text-[clamp(28px,4vw,42px)] font-extrabold tracking-[-1px] my-3">{title}</h2>
      <p className="text-muted max-w-[560px] mx-auto text-base">{desc}</p>
    </div>
  );
}
function FootCol({ title, items }) {
  return (
    <div>
      <h4 className="text-ink text-sm mb-3.5 font-bold">{title}</h4>
      {items.map((i) => <a key={i} href="#" className="block text-[13px] text-muted mb-2.5 hover:text-ink">{i}</a>)}
    </div>
  );
}

function AuthModal({ mode, onClose, onSwitch, onDone }) {
  const login = mode === "login";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("아이디·비밀번호로 계속하세요. 비밀번호는 저장·열람되지 않습니다.");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setNote("처리 중…");
    const res = login ? await signIn(username, password) : await signUp(username, password);
    if (res.ok) { setNote("✅ 완료 — 거래 화면으로 이동합니다."); setTimeout(() => onDone(res.username), 400); }
    else { setNote("⚠️ " + res.message); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[100] bg-[rgba(2,6,23,.75)] backdrop-blur-sm grid place-items-center p-5" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-panel border border-line rounded-[20px] w-full max-w-[400px] p-8 relative">
        <button className="absolute top-4 right-5 text-2xl text-muted" onClick={onClose}>×</button>
        <h3 className="text-[22px] font-extrabold mb-1.5">{login ? "로그인" : "회원가입"}</h3>
        <div className="text-muted text-sm mb-5">{login ? `${brand.name} 계정으로 계속하기` : "아이디·비밀번호로 30초 만에 가입"}</div>
        <form onSubmit={submit}>
          <label className="block text-[13px] text-muted mb-1.5">아이디</label>
          <input required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
            className="w-full px-3.5 py-3 bg-bg2 border border-line rounded-[10px] text-ink text-sm outline-none focus:border-brand mb-3.5" placeholder="아이디" />
          <label className="block text-[13px] text-muted mb-1.5">비밀번호</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={login ? "current-password" : "new-password"}
            className="w-full px-3.5 py-3 bg-bg2 border border-line rounded-[10px] text-ink text-sm outline-none focus:border-brand" placeholder="••••••••" />
          <button className="btn btn-primary w-full py-3.5 mt-5 disabled:opacity-60" type="submit" disabled={busy}>{login ? "로그인" : "가입하기"}</button>
        </form>
        <div className="text-xs text-muted2 text-center mt-4 leading-relaxed">{note}</div>
        <div className="text-center mt-4 text-[13px] text-muted">
          {login ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
          <a className="text-brand font-semibold cursor-pointer" onClick={() => onSwitch(login ? "signup" : "login")}>{login ? "회원가입" : "로그인"}</a>
        </div>
      </div>
    </div>
  );
}

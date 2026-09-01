import { createClient } from "@supabase/supabase-js";
import { brand } from "@/lib/brand.config";

/**
 * 관리자 전용 서버 라우트 — 비밀번호를 서버에서 검증하고(번들 노출 X),
 * 회원 지갑 조회/지급/초기화/삭제를 서버에서 수행한다.
 *  - 비밀번호: process.env.ADMIN_PW (서버 전용). 없으면 NEXT_PUBLIC_ADMIN_PW 폴백.
 *  - DB 키: SUPABASE_SERVICE_ROLE_KEY(권장, RLS 우회) → 없으면 anon 키 폴백.
 * service_role 키는 서버 환경변수로만 두며 클라이언트로 절대 노출되지 않는다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_ID = process.env.NEXT_PUBLIC_ADMIN_ID || "admin";
const ADMIN_PW = process.env.ADMIN_PW || process.env.NEXT_PUBLIC_ADMIN_PW || "";

function db() {
  const key = SERVICE || ANON;
  if (!URL || !key) return null;
  return createClient(URL, key, { auth: { persistSession: false } });
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function freshWallet() { const c = brand.paperCashUSDT || 500; return { cashUSDT: c, positions: {}, openOrders: [], history: [], realizedPnL: 0, ledger: [{ type: "reset", amt: c, t: Date.now() }], principal: c, _ts: Date.now() }; }

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  const { secret, id, action, username, amount } = body || {};

  // 서버 측 비밀번호 검증 (비밀번호가 유일한 시크릿 — id는 정보용)
  if (!ADMIN_PW) return json({ ok: false, error: "server_not_configured", hint: "ADMIN_PW 환경변수를 설정하세요" }, 500);
  if (String(secret || "") !== String(ADMIN_PW)) return json({ ok: false, error: "unauthorized" }, 401);

  const sb = db();
  if (!sb) return json({ ok: false, error: "db_not_configured" }, 500);

  try {
    if (action === "login") return json({ ok: true, serviceRole: !!SERVICE });

    if (action === "list") {
      const [w, tk] = await Promise.all([
        sb.from("wallets").select("username,data,updated_at").order("updated_at", { ascending: false }),
        sb.from("user_tracking").select("*").order("roi", { ascending: false }),
      ]);
      return json({ ok: true, wallets: w.data || [], tracking: tk.data || [], serviceRole: !!SERVICE });
    }

    const u = String(username || "").trim();
    if (!u) return json({ ok: false, error: "no_username" }, 400);

    if (action === "grant") {
      const amt = Math.floor(Number(amount) || 0);
      if (!(amt > 0)) return json({ ok: false, error: "bad_amount" }, 400);
      const { data } = await sb.from("wallets").select("data").eq("username", u).maybeSingle();
      const d = (data && data.data) || {};
      const next = { ...d, cashUSDT: (d.cashUSDT || 0) + amt, principal: (d.principal || 0) + amt, ledger: [{ type: "deposit", amt, t: Date.now() }, ...(d.ledger || [])].slice(0, 100), _ts: Date.now() };
      await sb.from("wallets").upsert({ username: u, data: next, updated_at: new Date().toISOString() }, { onConflict: "username" });
      return json({ ok: true });
    }
    if (action === "reset") {
      await sb.from("wallets").upsert({ username: u, data: freshWallet(), updated_at: new Date().toISOString() }, { onConflict: "username" });
      return json({ ok: true });
    }
    if (action === "delete") {
      if (u === ADMIN_ID) return json({ ok: false, error: "cannot_delete_admin" }, 400);
      await Promise.all([
        sb.from("wallets").delete().eq("username", u),
        sb.from("user_tracking").delete().eq("username", u),
        sb.from("login_events").delete().eq("username", u),
      ]);
      return json({ ok: true });
    }
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}

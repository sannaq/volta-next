"use client";
import { supabase, supabaseEnabled } from "./supabase";
import { recordLogin } from "./tracking";
import { freshWallet } from "./useWallet";

/**
 * 아이디+비밀번호 가입/로그인 (모의투자 데모).
 *  - 반드시 회원가입 후에만 로그인·사용 가능 (미가입 아이디 로그인 거부).
 *  - 회원가입 시 계정(지갑)을 서버에 생성한다. 비밀번호는 저장/열람하지 않는다.
 */
const ADMIN_ID = process.env.NEXT_PUBLIC_ADMIN_ID || "admin";

async function isRegistered(u) {
  if (!supabaseEnabled) return null; // 판단 불가(로컬) → 데모 허용
  try {
    const [w, tk] = await Promise.all([
      supabase.from("wallets").select("username").eq("username", u).maybeSingle(),
      supabase.from("user_tracking").select("username").eq("username", u).maybeSingle(),
    ]);
    return !!(w.data || tk.data);
  } catch (_) { return "error"; } // 확인 실패 → 로그인 차단(fail closed), null(백엔드 없음)과 구분
}

export async function signUp(username, password) {
  const u = String(username || "").trim();
  if (!u) return { ok: false, message: "아이디를 입력하세요." };
  if (!password) return { ok: false, message: "비밀번호를 입력하세요." };
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9_.-]{2,20}$/.test(u)) return { ok: false, message: "아이디는 한글/영문/숫자 2~20자여야 합니다." };
  const reg = await isRegistered(u);
  if (reg === true) return { ok: false, message: "이미 존재하는 아이디입니다." };
  // 서버에 계정(지갑) 생성
  if (supabaseEnabled) {
    try { await supabase.from("wallets").upsert({ username: u, data: freshWallet(), updated_at: new Date().toISOString() }, { onConflict: "username" }); } catch (_) {}
  }
  await recordLogin(u);
  return { ok: true, username: u };
}

export async function signIn(username, password) {
  const u = String(username || "").trim();
  if (!u) return { ok: false, message: "아이디를 입력하세요." };
  if (!password) return { ok: false, message: "비밀번호를 입력하세요." };
  // 아이디 형식 검증(가입과 동일) — 비정상 문자가 세션/화면(SVG 등)으로 흘러가는 것 차단
  if (u !== ADMIN_ID && !/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9_.-]{2,20}$/.test(u)) return { ok: false, message: "아이디 형식이 올바르지 않습니다." };
  // 관리자 계정은 항상 허용
  if (u !== ADMIN_ID) {
    const reg = await isRegistered(u);
    if (reg === "error") return { ok: false, message: "일시적 오류로 확인이 안 됩니다. 잠시 후 다시 시도하세요." };
    if (reg === false) return { ok: false, message: "가입되지 않은 아이디입니다. 회원가입 후 이용하세요." };
  }
  await recordLogin(u);
  return { ok: true, username: u };
}

export async function signOut() {}

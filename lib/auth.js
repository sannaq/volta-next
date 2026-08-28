"use client";
import { supabase, supabaseEnabled } from "./supabase";
import { recordLogin } from "./tracking";

/**
 * 아이디+비밀번호 가입/로그인 (모의투자 데모).
 *  - 실제 이메일이 없는 아이디 기반이라 Supabase Auth(이메일 인증)는 사용하지 않는다.
 *  - 비밀번호는 저장/열람하지 않는다(데모). 회원 식별·데이터 동기화는 아이디 기준.
 *  - 가입/로그인 시 아이디를 추적 기록(user_tracking/login_events)에 남기고,
 *    지갑은 Supabase에 아이디별로 저장되어 기기 간 동기화된다.
 */
export async function signUp(username, password) {
  const u = String(username || "").trim();
  if (!u) return { ok: false, message: "아이디를 입력하세요." };
  if (!password) return { ok: false, message: "비밀번호를 입력하세요." };
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9_.-]{2,20}$/.test(u)) return { ok: false, message: "아이디는 한글/영문/숫자 2~20자여야 합니다." };
  // 중복 아이디 체크 (Supabase 연결 시)
  if (supabaseEnabled) {
    try {
      const { data } = await supabase.from("user_tracking").select("username").eq("username", u).maybeSingle();
      if (data) return { ok: false, message: "이미 존재하는 아이디입니다." };
    } catch (_) {}
  }
  await recordLogin(u);
  return { ok: true, username: u };
}

export async function signIn(username, password) {
  const u = String(username || "").trim();
  if (!u) return { ok: false, message: "아이디를 입력하세요." };
  if (!password) return { ok: false, message: "비밀번호를 입력하세요." };
  await recordLogin(u);
  return { ok: true, username: u };
}

export async function signOut() {}

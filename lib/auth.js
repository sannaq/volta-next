"use client";
import { supabase, supabaseEnabled, usernameToEmail } from "./supabase";
import { recordLogin } from "./tracking";

/**
 * 아이디+비밀번호 가입/로그인.
 *  - Supabase 설정 시: Auth 가 비밀번호를 해시로 처리(원문 미보관, 운영자도 조회 불가)
 *  - 미설정 시: 데모 인증(비밀번호 검증 없이 통과) — 어떤 경우에도 비밀번호를 저장하지 않음
 * 로그인/가입 시 아이디만 추적 기록에 남긴다.
 */
function mapErr(m) {
  const s = String(m || "").toLowerCase();
  if (s.includes("already") || s.includes("registered")) return "이미 존재하는 아이디입니다.";
  if (s.includes("invalid")) return "아이디 또는 비밀번호가 올바르지 않습니다.";
  if (s.includes("weak") || s.includes("6 char")) return "비밀번호는 6자 이상이어야 합니다.";
  return "요청을 처리할 수 없습니다.";
}

export async function signUp(username, password) {
  const u = String(username || "").trim();
  if (!u || !password) return { ok: false, message: "아이디와 비밀번호를 입력하세요." };
  if (supabaseEnabled) {
    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(u), password, options: { data: { username: u } },
    });
    if (error) return { ok: false, message: mapErr(error.message) };
  }
  await recordLogin(u);
  return { ok: true, username: u };
}

export async function signIn(username, password) {
  const u = String(username || "").trim();
  if (!u || !password) return { ok: false, message: "아이디와 비밀번호를 입력하세요." };
  if (supabaseEnabled) {
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password });
    if (error) return { ok: false, message: mapErr(error.message) };
  }
  await recordLogin(u);
  return { ok: true, username: u };
}

export async function signOut() {
  if (supabaseEnabled) { try { await supabase.auth.signOut(); } catch (_) {} }
}

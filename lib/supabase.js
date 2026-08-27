"use client";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트. 환경변수(.env.local)가 있으면 실제 인증/추적을 사용하고,
 * 없으면 supabaseEnabled=false → tracking.js 가 localStorage 폴백으로 동작한다.
 *
 * 비밀번호는 Supabase Auth 가 해시로 처리하며, 이 앱(운영자 포함) 어디서도
 * 비밀번호 원문을 저장하거나 조회하지 않는다.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(url && anon);
export const supabase = supabaseEnabled ? createClient(url, anon) : null;

/** 아이디만 받는 가입/로그인을 위해 username → 합성 이메일로 매핑 (도메인은 미사용 placeholder) */
export function usernameToEmail(username) {
  const u = String(username || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return `${u}@users.volta.local`;
}

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

import { supabase, isSupabaseConnected } from './supabaseClient';
import type { AuthResult, AuthUser } from '../types';
import { normalizeUsername, usernameToSyntheticEmail } from '../shared/authAccess.js';

const profileToAuthUser = (user: User, profile?: { username?: string | null; display_name?: string | null } | null): AuthUser => {
  const fallbackUsername =
    normalizeUsername(profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || user.id) || user.id;
  const displayName =
    String(profile?.display_name || user.user_metadata?.display_name || fallbackUsername).trim() || fallbackUsername;

  return {
    id: user.id,
    username: fallbackUsername,
    displayName,
  };
};

const getProfile = async (userId: string) => {
  if (!supabase) return null;

  const { data } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', userId)
    .maybeSingle();

  return data;
};

export const getSession = async (): Promise<Session | null> => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
};

export const getCurrentAuthUser = async (): Promise<AuthUser | null> => {
  const session = await getSession();
  const user = session?.user;
  if (!user) return null;
  const profile = await getProfile(user.id);
  return profileToAuthUser(user, profile);
};

export const signInWithUsername = async (username: string, password: string): Promise<AuthResult> => {
  if (!isSupabaseConnected() || !supabase) {
    return { ok: false, error: '当前环境未连接 Supabase，无法登录。' };
  }

  const normalized = normalizeUsername(username);
  const email = usernameToSyntheticEmail(normalized);
  if (!normalized || !email || !password) {
    return { ok: false, error: '请输入账号名和密码。' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { ok: false, error: '账号名或密码错误。' };
  }

  const profile = await getProfile(data.user.id);
  return { ok: true, user: profileToAuthUser(data.user, profile) };
};

export const signOut = async (): Promise<void> => {
  if (!supabase) return;
  await supabase.auth.signOut();
};

export const onAuthStateChange = (
  handler: (event: AuthChangeEvent, session: Session | null) => void
) => {
  if (!supabase) {
    return { unsubscribe: () => undefined };
  }

  const { data } = supabase.auth.onAuthStateChange(handler);
  return {
    unsubscribe: () => data.subscription.unsubscribe(),
  };
};

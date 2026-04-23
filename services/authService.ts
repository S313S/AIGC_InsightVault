import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

import { supabase, isSupabaseConnected } from './supabaseClient';
import type { AuthResult, AuthUser } from '../types';
import { normalizeUsername, usernameToSyntheticEmail } from '../shared/authAccess.js';
import { toSessionAuthUser } from '../shared/authState.js';
import { buildSupabaseStorageKeys, mapAuthErrorMessage } from '../shared/authUi.js';

const SIGN_IN_TIMEOUT_MS = 12000;

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

export const getSessionAuthUser = async (): Promise<AuthUser | null> => {
  const session = await getSession();
  return toSessionAuthUser(session?.user);
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

  try {
    const signInPromise = supabase.auth.signInWithPassword({
      email,
      password,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = window.setTimeout(() => {
        window.clearTimeout(timer);
        reject(new Error('Login timeout'));
      }, SIGN_IN_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([signInPromise, timeoutPromise]);

    if (error || !data.user) {
      return { ok: false, error: mapAuthErrorMessage(error) };
    }

    const profile = await getProfile(data.user.id);
    return { ok: true, user: profileToAuthUser(data.user, profile) };
  } catch (error) {
    return { ok: false, error: mapAuthErrorMessage(error) };
  }
};

export const clearLocalAuthState = (): void => {
  if (typeof window === 'undefined') return;

  const keys = buildSupabaseStorageKeys(import.meta.env.VITE_SUPABASE_URL);
  for (const key of keys) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
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

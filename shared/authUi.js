export const mapAuthErrorMessage = (error) => {
  const rawMessage = String(error?.message || error?.error_description || error?.error || '').trim();
  const lower = rawMessage.toLowerCase();

  if (!rawMessage) {
    return '登录失败，请稍后重试。';
  }

  if (lower.includes('invalid login credentials')) {
    return '账号名或密码错误。';
  }

  if (lower.includes('project is paused') || lower.includes('paused')) {
    return 'Supabase 项目当前不可用，可能仍在恢复中，请稍后重试。';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return '登录请求未完成，可能被浏览器扩展、隐私设置或网络拦截。可先清除本地登录状态后重试。';
  }

  if (lower.includes('fetch') || lower.includes('network')) {
    return '登录请求异常，可能是网络或浏览器环境拦截导致。可先清除本地登录状态后重试。';
  }

  return rawMessage;
};

export const buildSupabaseStorageKeys = (supabaseUrl) => {
  const keys = ['supabase.auth.token'];

  try {
    const hostname = new URL(String(supabaseUrl || '')).hostname;
    const projectRef = hostname.split('.')[0];

    if (projectRef) {
      keys.unshift(
        `sb-${projectRef}-auth-token`,
        `sb-${projectRef}-auth-token-code-verifier`
      );
    }
  } catch {
    return keys;
  }

  return keys;
};

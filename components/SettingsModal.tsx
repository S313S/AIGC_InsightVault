import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Plus, Trash2, X } from './Icons';
import {
  deleteXhsTokenConfig,
  deleteQualityKeyword,
  deleteTrustedAccount,
  getMonitorSettings,
  getCronRunLogs,
  getQualityKeywords,
  getTrustedAccounts,
  getXhsTokenConfigs,
  saveQualityKeyword,
  saveTrustedAccount,
  updateMonitorSetting,
  updateTrustedAccount,
  upsertXhsTokenConfig
} from '../services/supabaseService';
import { isSupabaseConnected } from '../services/supabaseClient';
import { CronRunLog, MonitorSettings, QualityKeyword, TrustedAccount, XhsMissingTokenItem, XhsTokenConfig } from '../types';

type Tab = 'trusted' | 'keywords' | 'threshold' | 'trace' | 'xhs_tokens' | 'about';
type PlatformType = 'twitter' | 'xiaohongshu';
type CategoryType = 'image_gen' | 'video_gen' | 'vibe_coding';

interface SettingsModalProps {
  onClose: () => void;
  xhsMissingTokenItems?: XhsMissingTokenItem[];
  onApplyXhsTokenConfig?: (config: XhsTokenConfig) => Promise<void> | void;
}

const CATEGORY_LABEL: Record<CategoryType, string> = {
  image_gen: 'Image Gen',
  video_gen: 'Video Gen',
  vibe_coding: 'Vibe Coding'
};

const CATEGORY_STYLES: Record<CategoryType, string> = {
  image_gen: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  video_gen: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  vibe_coding: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
};

const POSITIVE_SEED = [
  'tutorial', 'workflow', 'tips', 'how to', 'step by step', 'guide', 'setup', 'build',
  'prompt engineering', 'use case', 'demo', 'walkthrough', 'comparison', 'review',
  'best practices', 'toolchain', 'deep dive',
  'release', 'upgrade', 'launch',
  '教程', '实操', '工作流', '技巧', '分享', '经验', '玩法', '用法', '攻略', '测评',
  '对比', '上手', '指南', '保姆级', '干货', '实战', '案例',
  '发布', '升级', '重大更新'
];

const BLACKLIST_SEED = [
  'hiring', 'giveaway', 'breaking news', 'subscribe', 'follow me',
  'sponsored', 'ad', 'promotion', 'discount', 'coupon',
  '招聘', '抽奖', '转发抽', '广告', '优惠', '打折', '求职', '招人'
];

const DEFAULT_SETTINGS: MonitorSettings = { minEngagement: 500, trustedMinEngagement: 1000, splitKeywords: false, autoUpdateEnabled: false };
const DEFAULT_TRACE_CONFIG = {
  xhsDays: '7',
  twitterDays: '7',
  min: '500',
  trustedMin: '1000',
  limit: '30',
  tasks: '8',
  xhsTasks: '3',
  xhsTimeout: '15000',
  xhsRetries: '2',
  xhsDelay: '1200',
  parallel: true,
  split: true,
  platform: 'all' as 'all' | 'twitter' | 'xiaohongshu',
  token: ''
};

const normalizeHandle = (handle: string) => handle.replace(/^@+/, '').trim();
const summarizeFailureReasonZh = (message: string) => {
  const msg = String(message || '').trim();
  if (!msg) return '执行失败（未返回具体错误）';
  const lower = msg.toLowerCase();
  if (lower.includes('failed to fetch')) return '网络请求失败（前端未拿到接口响应）';
  if (lower.includes('unauthorized') || lower.includes('401')) return '鉴权失败（token/secret 无效）';
  if (lower.includes('forbidden') || lower.includes('403')) return '请求被拒绝（权限或额度受限）';
  if (lower.includes('token invalid') || lower.includes('unactivate')) return '令牌无效或未激活';
  if (lower.includes('timeout')) return '请求超时';
  return `执行失败：${msg}`;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  xhsMissingTokenItems = [],
  onApplyXhsTokenConfig
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('trusted');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [trustedAccounts, setTrustedAccounts] = useState<TrustedAccount[]>([]);
  const [qualityKeywords, setQualityKeywords] = useState<QualityKeyword[]>([]);
  const [xhsTokenConfigs, setXhsTokenConfigs] = useState<XhsTokenConfig[]>([]);
  const [monitorSettings, setMonitorSettings] = useState<MonitorSettings>(DEFAULT_SETTINGS);

  const [trustedForm, setTrustedForm] = useState<Omit<TrustedAccount, 'id' | 'createdAt'>>({
    platform: 'twitter',
    handle: '',
    category: 'vibe_coding',
    notes: ''
  });

  const [keywordForm, setKeywordForm] = useState({
    positive: '',
    blacklist: ''
  });

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<TrustedAccount | null>(null);

  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_SETTINGS.minEngagement));
  const [trustedThresholdInput, setTrustedThresholdInput] = useState(String(DEFAULT_SETTINGS.trustedMinEngagement));
  const [isSavingSplit, setIsSavingSplit] = useState(false);
  const [isSavingAutoUpdate, setIsSavingAutoUpdate] = useState(false);
  const [xhsTokenForm, setXhsTokenForm] = useState({ noteId: '', xsecToken: '', xsecSource: 'pc_feed' });
  const [cronRunLogs, setCronRunLogs] = useState<CronRunLog[]>([]);
  const [isLoadingCronLogs, setIsLoadingCronLogs] = useState(false);
  const [isRunningCron, setIsRunningCron] = useState(false);
  const [cronRunSummary, setCronRunSummary] = useState('');
  const [traceConfig, setTraceConfig] = useState(DEFAULT_TRACE_CONFIG);

  const positiveKeywords = useMemo(
    () => qualityKeywords.filter(k => k.type === 'positive'),
    [qualityKeywords]
  );

  const blacklistKeywords = useMemo(
    () => qualityKeywords.filter(k => k.type === 'blacklist'),
    [qualityKeywords]
  );

  const flashMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2000);
  };

  const loadSettings = async () => {
    setIsLoading(true);
    setIsLoadingCronLogs(true);
    const [accounts, keywords, settings, tokenConfigs, logs] = await Promise.all([
      getTrustedAccounts(),
      getQualityKeywords(),
      getMonitorSettings(),
      getXhsTokenConfigs(),
      getCronRunLogs(30)
    ]);

    setTrustedAccounts(accounts);
    setQualityKeywords(keywords);
    setMonitorSettings(settings);
    setXhsTokenConfigs(tokenConfigs);
    setCronRunLogs(logs);
    setThresholdInput(String(settings.minEngagement));
    setTrustedThresholdInput(String(settings.trustedMinEngagement));
    setTraceConfig(prev => ({
      ...prev,
      min: String(settings.minEngagement),
      trustedMin: String(settings.trustedMinEngagement),
      split: settings.splitKeywords
    }));

    if (isSupabaseConnected()) {
      const existingSet = new Set(
        (keywords || []).map(k => `${k.type}::${String(k.keyword || '').trim().toLowerCase()}`)
      );
      const seedPayload = [
        ...POSITIVE_SEED.map(keyword => ({ keyword, type: 'positive' as const })),
        ...BLACKLIST_SEED.map(keyword => ({ keyword, type: 'blacklist' as const }))
      ].filter(entry => {
        const key = `${entry.type}::${entry.keyword.trim().toLowerCase()}`;
        return !existingSet.has(key);
      });

      if (seedPayload.length > 0) {
        for (const entry of seedPayload) {
          await saveQualityKeyword(entry);
        }
        const seededKeywords = await getQualityKeywords();
        setQualityKeywords(seededKeywords);
      }
    }

    setIsLoading(false);
    setIsLoadingCronLogs(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleAddTrustedAccount = async () => {
    const handle = normalizeHandle(trustedForm.handle);
    if (!handle) return;

    const saved = await saveTrustedAccount({
      platform: trustedForm.platform,
      handle,
      category: trustedForm.category,
      notes: trustedForm.notes.trim()
    });

    if (saved) {
      setTrustedAccounts(prev => [saved, ...prev]);
      setTrustedForm({
        platform: 'twitter',
        handle: '',
        category: 'vibe_coding',
        notes: ''
      });
      flashMessage('信任账号已添加');
      return;
    }

    flashMessage('添加失败，请检查 Supabase 配置或唯一约束');
  };

  const startEditAccount = (account: TrustedAccount) => {
    setEditingAccountId(account.id);
    setEditingDraft({ ...account });
  };

  const cancelEditAccount = () => {
    setEditingAccountId(null);
    setEditingDraft(null);
  };

  const saveEditAccount = async () => {
    if (!editingDraft) return;
    const updated: TrustedAccount = {
      ...editingDraft,
      handle: normalizeHandle(editingDraft.handle),
      notes: editingDraft.notes || ''
    };

    if (!updated.handle) return;

    const success = await updateTrustedAccount(updated);
    if (!success) {
      flashMessage('更新失败，请稍后重试');
      return;
    }

    setTrustedAccounts(prev => prev.map(item => item.id === updated.id ? updated : item));
    cancelEditAccount();
    flashMessage('信任账号已更新');
  };

  const handleDeleteTrustedAccount = async (id: string) => {
    if (!window.confirm('确定删除这个信任账号吗？')) return;
    const success = await deleteTrustedAccount(id);
    if (!success) {
      flashMessage('删除失败，请稍后重试');
      return;
    }
    setTrustedAccounts(prev => prev.filter(item => item.id !== id));
    flashMessage('信任账号已删除');
  };

  const addKeyword = async (type: 'positive' | 'blacklist') => {
    const inputValue = keywordForm[type].trim();
    if (!inputValue) return;

    const saved = await saveQualityKeyword({ keyword: inputValue, type });
    if (!saved) {
      flashMessage('关键词添加失败（可能重复）');
      return;
    }

    setQualityKeywords(prev => [saved, ...prev]);
    setKeywordForm(prev => ({ ...prev, [type]: '' }));
  };

  const removeKeyword = async (id: string) => {
    const success = await deleteQualityKeyword(id);
    if (!success) {
      flashMessage('删除关键词失败');
      return;
    }
    setQualityKeywords(prev => prev.filter(item => item.id !== id));
  };

  const saveThreshold = async () => {
    const minEngagement = Number(thresholdInput);
    const trustedMinEngagement = Number(trustedThresholdInput);
    if (!Number.isFinite(minEngagement) || minEngagement < 0) {
      flashMessage('请输入有效的非负数字');
      return;
    }
    if (!Number.isFinite(trustedMinEngagement) || trustedMinEngagement < 0) {
      flashMessage('请输入有效的信任账号阈值');
      return;
    }

    const [saveMin, saveTrustedMin] = await Promise.all([
      updateMonitorSetting('min_engagement', String(Math.floor(minEngagement))),
      updateMonitorSetting('trusted_min_engagement', String(Math.floor(trustedMinEngagement)))
    ]);
    if (!saveMin || !saveTrustedMin) {
      flashMessage('保存失败，请检查 Supabase 配置');
      return;
    }

    setMonitorSettings({
      minEngagement: Math.floor(minEngagement),
      trustedMinEngagement: Math.floor(trustedMinEngagement),
      splitKeywords: monitorSettings.splitKeywords,
      autoUpdateEnabled: monitorSettings.autoUpdateEnabled
    });
    setTraceConfig(prev => ({
      ...prev,
      min: String(Math.floor(minEngagement)),
      trustedMin: String(Math.floor(trustedMinEngagement))
    }));
    flashMessage('阈值已保存');
  };

  const handleToggleSplitKeywords = async (value: boolean) => {
    setIsSavingSplit(true);
    const success = await updateMonitorSetting('split_keywords', value ? 'true' : 'false');
    setIsSavingSplit(false);
    if (!success) {
      flashMessage('保存分词搜索开关失败');
      return;
    }
    setMonitorSettings(prev => ({ ...prev, splitKeywords: value }));
    setTraceConfig(prev => ({ ...prev, split: value }));
    flashMessage(`全量关键词搜索已${value ? '开启' : '关闭'}`);
  };

  const handleToggleAutoUpdate = async (value: boolean) => {
    setIsSavingAutoUpdate(true);
    const success = await updateMonitorSetting('auto_update_enabled', value ? 'true' : 'false');
    setIsSavingAutoUpdate(false);
    if (!success) {
      flashMessage('保存自动更新开关失败');
      return;
    }
    setMonitorSettings(prev => ({ ...prev, autoUpdateEnabled: value }));
    flashMessage(`自动更新已${value ? '开启' : '关闭'}`);
  };

  const handleAddXhsTokenConfig = async () => {
    const noteId = xhsTokenForm.noteId.trim();
    const xsecToken = xhsTokenForm.xsecToken.trim();
    const xsecSource = (xhsTokenForm.xsecSource || 'pc_feed').trim() || 'pc_feed';
    if (!noteId || !xsecToken) {
      flashMessage('请填写 noteId 和 xsec_token');
      return;
    }

    const updated = await upsertXhsTokenConfig({ noteId, xsecToken, xsecSource });
    if (!updated) {
      flashMessage('保存 token 失败');
      return;
    }

    setXhsTokenConfigs(updated);
    setXhsTokenForm({ noteId: '', xsecToken: '', xsecSource: 'pc_feed' });
    if (onApplyXhsTokenConfig) {
      await onApplyXhsTokenConfig({ noteId, xsecToken, xsecSource });
    }
    flashMessage('XHS token 已保存并应用');
  };

  const handleDeleteXhsToken = async (noteId: string) => {
    if (!window.confirm(`确定删除 noteId=${noteId} 的 token 配置吗？`)) return;
    const updated = await deleteXhsTokenConfig(noteId);
    if (!updated) {
      flashMessage('删除 token 配置失败');
      return;
    }
    setXhsTokenConfigs(updated);
    flashMessage('已删除 token 配置');
  };

  const copyText = async (text: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashMessage(successText);
    } catch {
      flashMessage('复制失败');
    }
  };

  const refreshCronRunLogs = async () => {
    setIsLoadingCronLogs(true);
    const logs = await getCronRunLogs(30);
    setCronRunLogs(logs);
    setIsLoadingCronLogs(false);
  };

  const appendNumberParam = (params: URLSearchParams, key: string, raw: string, opts?: { allowZero?: boolean }) => {
    const n = Number(raw);
    const allowZero = Boolean(opts?.allowZero);
    if (!Number.isFinite(n)) return;
    if (!allowZero && n <= 0) return;
    if (allowZero && n < 0) return;
    params.set(key, String(Math.floor(n)));
  };

  const appendLocalFailedCronLog = (requestUrl: string, errorMessage: string) => {
    const localLog: CronRunLog = {
      id: `local-failed-${Date.now()}`,
      createdAt: new Date().toISOString(),
      triggerSource: 'manual',
      requestMethod: 'GET',
      requestUrl,
      queryParams: {},
      effectiveParams: {},
      keywordExecution: {},
      apiCallTrace: [],
      apiCallsSummary: {},
      funnel: {},
      platformFunnel: {},
      platformStats: [],
      platformTotals: {},
      platformErrors: [{ platform: 'system', error: errorMessage }],
      resultSummary: {},
      runtimeMs: 0,
      runtimeGuardTriggered: false,
      success: false,
      errorMessage
    };

    setCronRunLogs(prev => [localLog, ...prev].slice(0, 30));
  };

  const handleRunCronNow = async () => {
    setIsRunningCron(true);
    setCronRunSummary('');
    let requestUrl = '/api/cron-monitor';
    try {
      const params = new URLSearchParams();
      appendNumberParam(params, 'days', traceConfig.xhsDays);
      appendNumberParam(params, 'xhs_days', traceConfig.xhsDays);
      appendNumberParam(params, 'twitter_days', traceConfig.twitterDays);
      appendNumberParam(params, 'min', traceConfig.min, { allowZero: true });
      appendNumberParam(params, 'trusted_min', traceConfig.trustedMin, { allowZero: true });
      appendNumberParam(params, 'limit', traceConfig.limit);
      appendNumberParam(params, 'tasks', traceConfig.tasks);
      appendNumberParam(params, 'xhs_tasks', traceConfig.xhsTasks);
      appendNumberParam(params, 'xhs_timeout', traceConfig.xhsTimeout);
      appendNumberParam(params, 'xhs_retries', traceConfig.xhsRetries, { allowZero: true });
      appendNumberParam(params, 'xhs_delay', traceConfig.xhsDelay, { allowZero: true });
      params.set('parallel', traceConfig.parallel ? '1' : '0');
      params.set('split', traceConfig.split ? '1' : '0');
      if (traceConfig.platform !== 'all') {
        params.set('platform', traceConfig.platform === 'xiaohongshu' ? 'xhs' : 'twitter');
      }
      if (traceConfig.token.trim()) {
        params.set('token', traceConfig.token.trim());
      }

      requestUrl = `/api/cron-monitor?${params.toString()}`;
      const resp = await fetch(requestUrl, { method: 'GET' });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.error || `请求失败 (${resp.status})`);
      }
      const inserted = Number(payload?.inserted || 0);
      const candidates = Number(payload?.candidates || 0);
      const runtimeMs = Number(payload?.runtimeMs || 0);
      const errors = Array.isArray(payload?.platformErrors) ? payload.platformErrors.length : 0;
      setCronRunSummary(`完成：候选 ${candidates}，新增 ${inserted}，耗时 ${runtimeMs}ms，错误 ${errors}`);
      flashMessage('热点抓取执行完成');
      await refreshCronRunLogs();
    } catch (err: any) {
      const msg = err?.message || '执行失败';
      setCronRunSummary(`执行失败：${msg}`);
      flashMessage(msg);
      appendLocalFailedCronLog(requestUrl, msg);
    } finally {
      setIsRunningCron(false);
    }
  };

  const renderTrustedTab = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">新增信任账号</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={trustedForm.platform}
            onChange={(e) => setTrustedForm(prev => ({ ...prev, platform: e.target.value as PlatformType }))}
            className="bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
          >
            <option value="twitter">Twitter</option>
            <option value="xiaohongshu">Xiaohongshu</option>
          </select>

          <input
            value={trustedForm.handle}
            onChange={(e) => setTrustedForm(prev => ({ ...prev, handle: e.target.value }))}
            placeholder="@username"
            className="bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
          />

          <select
            value={trustedForm.category}
            onChange={(e) => setTrustedForm(prev => ({ ...prev, category: e.target.value as CategoryType }))}
            className="bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
          >
            <option value="image_gen">Image Gen</option>
            <option value="video_gen">Video Gen</option>
            <option value="vibe_coding">Vibe Coding</option>
          </select>

          <input
            value={trustedForm.notes}
            onChange={(e) => setTrustedForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="备注（可选）"
            className="bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleAddTrustedAccount}
            className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors"
          >
            <Plus size={14} /> 添加账号
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">信任账号列表</h3>
        {trustedAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">暂无信任账号</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {trustedAccounts.map(account => {
              const isEditing = editingAccountId === account.id;
              return (
                <div
                  key={account.id}
                  onClick={() => !isEditing && startEditAccount(account)}
                  className="rounded-lg border border-[#1e3a5f]/40 bg-[#0d1526]/70 px-3 py-2 cursor-pointer hover:border-[#3b82f6]/40 transition-colors"
                >
                  {!isEditing && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <div className="text-sm text-gray-100 sm:min-w-[150px] break-all">@{account.handle}</div>
                      <span className={`text-xs px-2 py-1 rounded-full border ${CATEGORY_STYLES[(account.category as CategoryType) || 'vibe_coding']}`}>
                        {CATEGORY_LABEL[(account.category as CategoryType) || 'vibe_coding']}
                      </span>
                      <div className="flex-1 text-xs text-gray-400 break-words">{account.notes || '无备注'}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTrustedAccount(account.id);
                        }}
                        className="self-end sm:self-auto text-gray-500 hover:text-rose-300 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}

                  {isEditing && editingDraft && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select
                          value={editingDraft.platform}
                          onChange={(e) => setEditingDraft(prev => prev ? { ...prev, platform: e.target.value } : prev)}
                          className="bg-[#0a0f1a] border border-[#1e3a5f]/60 rounded-lg px-2.5 py-2 text-sm text-gray-100"
                        >
                          <option value="twitter">Twitter</option>
                          <option value="xiaohongshu">Xiaohongshu</option>
                        </select>
                        <input
                          value={editingDraft.handle}
                          onChange={(e) => setEditingDraft(prev => prev ? { ...prev, handle: e.target.value } : prev)}
                          className="bg-[#0a0f1a] border border-[#1e3a5f]/60 rounded-lg px-2.5 py-2 text-sm text-gray-100"
                        />
                        <select
                          value={editingDraft.category}
                          onChange={(e) => setEditingDraft(prev => prev ? { ...prev, category: e.target.value } : prev)}
                          className="bg-[#0a0f1a] border border-[#1e3a5f]/60 rounded-lg px-2.5 py-2 text-sm text-gray-100"
                        >
                          <option value="image_gen">Image Gen</option>
                          <option value="video_gen">Video Gen</option>
                          <option value="vibe_coding">Vibe Coding</option>
                        </select>
                      </div>
                      <input
                        value={editingDraft.notes || ''}
                        onChange={(e) => setEditingDraft(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                        placeholder="备注"
                        className="w-full bg-[#0a0f1a] border border-[#1e3a5f]/60 rounded-lg px-2.5 py-2 text-sm text-gray-100"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditAccount();
                          }}
                          className="px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5"
                        >
                          取消
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEditAccount();
                          }}
                          className="px-2.5 py-1.5 rounded-md text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderKeywordSection = (
    type: 'positive' | 'blacklist',
    title: string,
    keywords: QualityKeyword[],
    chipClass: string
  ) => (
    <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-4">
      <h3 className="text-sm font-semibold text-gray-200 mb-3">{title}</h3>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={keywordForm[type]}
          onChange={(e) => setKeywordForm(prev => ({ ...prev, [type]: e.target.value }))}
          placeholder={type === 'positive' ? '新增正向关键词' : '新增屏蔽关键词'}
          className="flex-1 bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => addKeyword(type)}
          className="w-full sm:w-auto justify-center inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs text-white"
        >
          <Plus size={13} /> 添加
        </button>
      </div>

      {keywords.length === 0 ? (
        <p className="text-sm text-gray-500">暂无关键词</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {keywords.map(item => (
            <span
              key={item.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${chipClass}`}
            >
              {item.keyword}
              <button
                onClick={() => removeKeyword(item.id)}
                className="text-current/80 hover:text-current"
                title="删除"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const renderKeywordsTab = () => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {renderKeywordSection('positive', '正向关键词 Positive', positiveKeywords, 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300')}
      {renderKeywordSection('blacklist', '屏蔽关键词 Blacklist', blacklistKeywords, 'bg-rose-500/10 border-rose-500/40 text-rose-300')}
    </div>
  );

  const renderThresholdTab = () => (
    <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-5 space-y-5 max-w-2xl">
      <div className="space-y-3">
        <p className="text-sm text-gray-300 font-medium">Minimum engagement (likes + comments)</p>
        <p className="text-xs text-gray-500 mt-1">最低互动量（点赞 + 评论）</p>
        <input
          type="number"
          min={0}
          value={thresholdInput}
          onChange={(e) => setThresholdInput(e.target.value)}
          className="w-48 bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
        />
        <div className="text-xs text-gray-400">
          当前值: <span className="text-gray-200">{monitorSettings.minEngagement}</span>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-gray-300 font-medium">Trusted accounts minimum engagement</p>
        <p className="text-xs text-gray-500 mt-1">信任账号最低互动量（点赞 + 评论）</p>
        <input
          type="number"
          min={0}
          value={trustedThresholdInput}
          onChange={(e) => setTrustedThresholdInput(e.target.value)}
          className="w-48 bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
        />
        <div className="text-xs text-gray-400">
          当前值: <span className="text-gray-200">{monitorSettings.trustedMinEngagement}</span>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-[#1e3a5f]/40 bg-[#0d1526]/40 p-4">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-300 font-medium">全量关键词搜索 / Split Keyword Search</p>
          <div className="group relative">
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#3b82f6]/60 text-[10px] font-bold text-[#93c5fd] hover:bg-[#3b82f6]/15 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/40"
              aria-label="Split keyword search across platforms"
            >
              i
            </button>
            <div className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-80 -translate-x-1/2 rounded-lg border border-[#1e3a5f]/80 bg-[#0a1628] p-3 text-xs text-gray-300 shadow-xl group-hover:block group-focus-within:block">
              <p>
                When enabled, cron monitor queries each keyword independently across enabled platforms for broader recall, but consumes more API quota and time.
              </p>
              <p className="mt-2 text-gray-400">
                启用后，监控任务会按关键词分别调用各平台 API（而不是合并成一次查询），覆盖更全面，但会消耗更多 API 配额和执行时间。
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">按关键词分别查询各平台 API，覆盖更全面</p>
        <button
          type="button"
          disabled={isSavingSplit}
          onClick={() => handleToggleSplitKeywords(!monitorSettings.splitKeywords)}
          className={`inline-flex items-center px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
            monitorSettings.splitKeywords
              ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
              : 'border-gray-600/70 bg-gray-800/60 text-gray-300'
          } ${isSavingSplit ? 'opacity-60 cursor-not-allowed' : 'hover:border-indigo-400/70'}`}
        >
          {monitorSettings.splitKeywords ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="pt-1">
        <button
          onClick={saveThreshold}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white"
        >
          <Check size={14} /> 保存
        </button>
      </div>
      <p className="text-xs text-gray-500">
        说明: 信任账号和普通账号使用不同阈值，均会参与过滤。
      </p>
    </div>
  );

  const renderTraceTab = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">热点抓取启动</h3>
          <p className="text-xs text-gray-500 mt-1">可视化配置并直接触发 `/api/cron-monitor`，无需手写长 URL。</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">xhs_days（小红书，搜索日期范围）</span>
            <input value={traceConfig.xhsDays} onChange={(e) => setTraceConfig(prev => ({ ...prev, xhsDays: e.target.value }))} placeholder="7" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">twitter_days（推特，搜索日期范围）</span>
            <input value={traceConfig.twitterDays} onChange={(e) => setTraceConfig(prev => ({ ...prev, twitterDays: e.target.value }))} placeholder="7" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">min（普通账号，最低热度阀值）</span>
            <input value={traceConfig.min} onChange={(e) => setTraceConfig(prev => ({ ...prev, min: e.target.value }))} placeholder="500" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">trusted_min（关注账号，最低互动阀值）</span>
            <input value={traceConfig.trustedMin} onChange={(e) => setTraceConfig(prev => ({ ...prev, trustedMin: e.target.value }))} placeholder="1000" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">limit（每个关键词最多取几条）</span>
            <input value={traceConfig.limit} onChange={(e) => setTraceConfig(prev => ({ ...prev, limit: e.target.value }))} placeholder="30" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">tasks（总共跑几个关键词）</span>
            <input value={traceConfig.tasks} onChange={(e) => setTraceConfig(prev => ({ ...prev, tasks: e.target.value }))} placeholder="8" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">xhs_tasks（小红书跑几个关键词）</span>
            <input value={traceConfig.xhsTasks} onChange={(e) => setTraceConfig(prev => ({ ...prev, xhsTasks: e.target.value }))} placeholder="3" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">xhs_timeout（超时ms）</span>
            <input value={traceConfig.xhsTimeout} onChange={(e) => setTraceConfig(prev => ({ ...prev, xhsTimeout: e.target.value }))} placeholder="15000" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">xhs_retries（重试次数）</span>
            <input value={traceConfig.xhsRetries} onChange={(e) => setTraceConfig(prev => ({ ...prev, xhsRetries: e.target.value }))} placeholder="2" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">xhs_delay（间隔ms）</span>
            <input value={traceConfig.xhsDelay} onChange={(e) => setTraceConfig(prev => ({ ...prev, xhsDelay: e.target.value }))} placeholder="1200" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">platform（平台）</span>
            <select value={traceConfig.platform} onChange={(e) => setTraceConfig(prev => ({ ...prev, platform: e.target.value as 'all' | 'twitter' | 'xiaohongshu' }))} className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100">
              <option value="all">platform=all</option>
              <option value="twitter">platform=twitter</option>
              <option value="xiaohongshu">platform=xhs</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">token（可选）</span>
            <input value={traceConfig.token} onChange={(e) => setTraceConfig(prev => ({ ...prev, token: e.target.value }))} placeholder="cron secret token" className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100" />
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">parallel（并发）</span>
            <select
              value={traceConfig.parallel ? '1' : '0'}
              onChange={(e) => setTraceConfig(prev => ({ ...prev, parallel: e.target.value === '1' }))}
              className="w-full bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100"
            >
              <option value="1">1（并发执行）</option>
              <option value="0">0（顺序执行）</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-gray-400">split（分词）</span>
            <div className="flex items-center gap-1.5">
              <select
                value={traceConfig.split ? '1' : '0'}
                onChange={(e) => setTraceConfig(prev => ({ ...prev, split: e.target.value === '1' }))}
                className="flex-1 bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-xs text-gray-100"
              >
                <option value="1">1（按关键词分别查）</option>
                <option value="0">0（关键词合并查询）</option>
              </select>
              <div className="group relative shrink-0">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/70 text-[11px] font-bold text-amber-300">!</span>
                <div className="pointer-events-none absolute left-1/2 top-11 z-20 hidden w-80 -translate-x-1/2 rounded-lg border border-[#1e3a5f]/80 bg-[#0a1628] p-3 text-xs text-gray-300 shadow-xl group-hover:block">
                  split=1 时，小红书固定跑 17 个关键词，xhs_tasks 不生效
                </div>
              </div>
            </div>
          </label>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={handleRunCronNow}
            disabled={isRunningCron}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRunningCron ? '执行中...' : '启动热点抓取'}
          </button>
          <button
            type="button"
            disabled={isSavingAutoUpdate}
            onClick={() => handleToggleAutoUpdate(!monitorSettings.autoUpdateEnabled)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSavingAutoUpdate
              ? '保存中...'
              : `自动更新：${monitorSettings.autoUpdateEnabled ? 'ON' : 'OFF'}`}
          </button>
          {cronRunSummary && <p className="text-xs text-gray-300">{cronRunSummary}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">运行审计日志（最近 30 次）</h3>
          <button onClick={refreshCronRunLogs} className="px-2.5 py-1.5 rounded-md border border-[#1e3a5f]/60 text-xs text-gray-300 hover:bg-white/5">
            刷新
          </button>
        </div>
        <p className="text-xs text-gray-500">
          说明：若自动更新已关闭，`vercel_cron` 触发会显示“已跳过”，不会执行抓取，也不会产生实际 API 抓取调用。
        </p>

        {isLoadingCronLogs ? (
          <p className="text-sm text-gray-500">加载日志中...</p>
        ) : cronRunLogs.length === 0 ? (
          <p className="text-sm text-gray-500">暂无运行日志（请先执行一次热点抓取）。</p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {cronRunLogs.map(log => {
              const apiCalls = Number(log.apiCallsSummary?.totalCalls || 0);
              const withResults = Number(log.apiCallsSummary?.callsWithResults || 0);
              const xhsTasks = Number(log.keywordExecution?.xiaohongshu?.effectiveTasks || 0);
              const twitterModeRaw = String(log.keywordExecution?.twitter?.mode || '-');
              const twitterKeywords = Array.isArray(log.keywordExecution?.twitter?.keywords)
                ? log.keywordExecution.twitter.keywords.filter(Boolean).map((k: any) => String(k))
                : [];
              const xhsKeywords = Array.isArray(log.keywordExecution?.xiaohongshu?.keywords)
                ? log.keywordExecution.xiaohongshu.keywords.filter(Boolean).map((k: any) => String(k))
                : [];
              const usedKeywords = twitterKeywords.length > 0 ? twitterKeywords : xhsKeywords;
              const xhsTransmitText = xhsKeywords.length > 0
                ? `${xhsKeywords.map(k => `${k} 单独传入`).join('，')}`
                : '本次未调用小红书 API';
              const twitterTransmitText = twitterModeRaw === 'single_or_query'
                ? `${twitterKeywords.join(' OR ')}（一次请求合并查询）`
                : twitterModeRaw === 'per_keyword_api_calls'
                  ? `${twitterKeywords.map(k => `${k} 单独传入`).join('，')}`
                  : 'Twitter 传参方式未知';
              const twitterMode =
                twitterModeRaw === 'single_or_query'
                  ? 'Twitter 关键词合并查询（OR）'
                  : twitterModeRaw === 'per_keyword_api_calls'
                    ? 'Twitter 关键词逐个查询'
                    : 'Twitter 查询方式未知';
              const runtimeSeconds = Number.isFinite(Number(log.runtimeMs))
                ? Math.max(1, Math.round(Number(log.runtimeMs) / 1000))
                : 0;
              const days = Number(log.effectiveParams?.days || 0);
              const limit = Number(log.effectiveParams?.limit || 0);
              const minInteraction = Number(log.effectiveParams?.minInteraction || 0);
              const trustedMinInteraction = Number(log.effectiveParams?.trustedMinInteraction || 0);
              const tasks = Number(log.effectiveParams?.tasks || 0);
              const parallelMode = log.effectiveParams?.parallel ? '并发执行' : '顺序执行';
              const splitMode = log.effectiveParams?.split ? '按关键词分别查询' : '关键词合并查询';

              const twitterCalls = Number(log.apiCallsSummary?.byPlatform?.twitter?.calls || 0);
              const xhsCalls = Number(log.apiCallsSummary?.byPlatform?.xiaohongshu?.calls || 0);
              const twitterResults = Number(log.apiCallsSummary?.byPlatform?.twitter?.results || 0);
              const xhsResults = Number(log.apiCallsSummary?.byPlatform?.xiaohongshu?.results || 0);

              const inserted = Number(log.resultSummary?.inserted || 0);
              const updatedExisting = Number(log.resultSummary?.updatedExisting || 0);
              const candidates = Number(log.resultSummary?.candidates || 0);
              const tasksRun = Number(log.resultSummary?.tasksRun || 0);
              const isSkipped = Boolean(log.resultSummary?.skipped);
              const platformErrorMessages = (Array.isArray(log.platformErrors) ? log.platformErrors : [])
                .map((item: any) => {
                  const platform = String(item?.platform || '').trim();
                  const error = String(item?.error || '').trim();
                  if (!platform && !error) return '';
                  return platform ? `${platform}: ${error}` : error;
                })
                .filter(Boolean);
              const failureMessage = [
                String(log.errorMessage || '').trim(),
                ...platformErrorMessages
              ].filter(Boolean).join('；');
              const failureSummaryZh = summarizeFailureReasonZh(
                failureMessage || String(log.errorMessage || '').trim()
              );
              const failureRawDetail = {
                errorMessage: log.errorMessage || null,
                platformErrors: Array.isArray(log.platformErrors) ? log.platformErrors : [],
                requestMethod: log.requestMethod || 'GET',
                requestUrl: log.requestUrl || '',
                queryParams: log.queryParams || {}
              };
              return (
                <div key={log.id} className="rounded-lg border border-[#1e3a5f]/40 bg-[#0d1526]/70 px-3 py-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-xs text-gray-300">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '未知时间'} · {log.triggerSource}
                    </div>
                    <div className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      isSkipped
                        ? 'border-amber-500/50 text-amber-300 bg-amber-500/10'
                        : log.success
                          ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                          : 'border-rose-500/50 text-rose-300 bg-rose-500/10'
                    }`}>
                      {isSkipped ? 'SKIPPED（已跳过）' : log.success ? 'SUCCESS' : 'FAILED'}
                    </div>
                  </div>
                  {isSkipped ? (
                    <div className="mt-1 text-xs text-amber-200/90">
                      本次由定时任务触发，但因“自动更新”已关闭而跳过执行；未抓取内容、未发起实际 API 抓取调用。
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-gray-400">
                      {twitterMode}；小红书实际关键词 {xhsTasks} 个；共请求 API {apiCalls} 次，其中有结果 {withResults} 次；总耗时约 {runtimeSeconds} 秒
                    </div>
                  )}
                  {!log.success && failureMessage && (
                    <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div className="text-xs text-rose-300">
                        失败概括：{failureSummaryZh}
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-rose-300 hover:text-rose-200">查看明细（原始日志）</summary>
                        <pre className="mt-1 rounded-md border border-rose-500/30 bg-[#120a12]/80 p-2 text-[11px] text-rose-100 overflow-auto max-h-40">{JSON.stringify(failureRawDetail, null, 2)}</pre>
                      </details>
                    </div>
                  )}
                  {!isSkipped && (
                    <div className="mt-1 text-xs text-gray-300 leading-6">
                      <div>「1」用到的关键词：{usedKeywords.length > 0 ? usedKeywords.join('、') : '未记录关键词'}</div>
                      <div>「2」传到小红书 API：{xhsTransmitText}</div>
                      <div>传到推特 API：{twitterTransmitText}</div>
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="text-xs text-indigo-300 cursor-pointer">查看明细</summary>
                    <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-2 text-[11px] text-gray-300">
                      <div className="rounded-md border border-[#1e3a5f]/40 bg-[#0a1628]/70 p-2 space-y-1">
                        <p className="text-xs font-semibold text-gray-200">① 本次参数（effectiveParams）</p>
                        <p className="text-[11px] text-gray-400">
                          概括：回看 {days} 天，单次最多取 {limit} 条，互动门槛普通账号 {minInteraction} / 信任账号 {trustedMinInteraction}，关键词任务 {tasks}，执行方式为「{parallelMode} + {splitMode}」。
                        </p>
                        <p className="text-[11px] text-gray-500">
                          字段：days=回看天数；limit=每次返回上限；min/trustedMinInteraction=互动门槛；tasks=关键词任务数；parallel/split=执行方式。
                        </p>
                        <pre className="rounded-md border border-[#1e3a5f]/30 bg-[#091223]/80 p-2 overflow-auto max-h-40">{JSON.stringify(log.effectiveParams, null, 2)}</pre>
                      </div>

                      <div className="rounded-md border border-[#1e3a5f]/40 bg-[#0a1628]/70 p-2 space-y-1">
                        <p className="text-xs font-semibold text-gray-200">② 关键词执行（keywordExecution）</p>
                        <p className="text-[11px] text-gray-400">
                          概括：Twitter 使用「{twitterMode}」，关键词 {twitterKeywords.length} 个；小红书实际跑了 {xhsTasks} 个关键词。
                        </p>
                        <p className="text-[11px] text-gray-500">
                          字段：twitter.mode=推特传参方式；twitter.keywords=推特关键词；xiaohongshu.keywords=小红书关键词；effectiveTasks=小红书实际执行关键词数。
                        </p>
                        <pre className="rounded-md border border-[#1e3a5f]/30 bg-[#091223]/80 p-2 overflow-auto max-h-40">{JSON.stringify(log.keywordExecution, null, 2)}</pre>
                      </div>

                      <div className="rounded-md border border-[#1e3a5f]/40 bg-[#0a1628]/70 p-2 space-y-1">
                        <p className="text-xs font-semibold text-gray-200">③ API 调用汇总（apiCallsSummary）</p>
                        <p className="text-[11px] text-gray-400">
                          概括：本次共请求 {apiCalls} 次（Twitter {twitterCalls} 次 / 小红书 {xhsCalls} 次）；拿到结果 {withResults} 次；返回条数 Twitter {twitterResults} 条 / 小红书 {xhsResults} 条。
                        </p>
                        <p className="text-[11px] text-gray-500">
                          字段：totalCalls=总请求数；callsWithResults=有结果的请求数；byPlatform=按平台拆分的调用次数与结果条数。
                        </p>
                        <pre className="rounded-md border border-[#1e3a5f]/30 bg-[#091223]/80 p-2 overflow-auto max-h-40">{JSON.stringify(log.apiCallsSummary, null, 2)}</pre>
                      </div>

                      <div className="rounded-md border border-[#1e3a5f]/40 bg-[#0a1628]/70 p-2 space-y-1">
                        <p className="text-xs font-semibold text-gray-200">④ 入库结果（resultSummary）</p>
                        <p className="text-[11px] text-gray-400">
                          概括：执行了 {tasksRun} 个任务，筛出候选 {candidates} 条；最终新插入 {inserted} 条，更新已有 {updatedExisting} 条。
                        </p>
                        <p className="text-[11px] text-gray-500">
                          字段：tasksRun=实际执行任务数；candidates=通过筛选候选数；inserted=新增条数；updatedExisting=更新已有条数。
                        </p>
                        <pre className="rounded-md border border-[#1e3a5f]/30 bg-[#091223]/80 p-2 overflow-auto max-h-40">{JSON.stringify(log.resultSummary, null, 2)}</pre>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderAboutTab = () => (
    <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-5 space-y-2 text-sm text-gray-300">
      <p>Twitter 内容质量过滤配置中心</p>
      <p className="text-gray-500">Version 1.0</p>
      <p className="text-gray-500">管理信任账号、关键词质量信号和互动量阈值。</p>
    </div>
  );

  const renderXhsTokensTab = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">新增 XHS Token 配置</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={xhsTokenForm.noteId}
            onChange={(e) => setXhsTokenForm(prev => ({ ...prev, noteId: e.target.value }))}
            placeholder="noteId"
            className="bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
          />
          <input
            value={xhsTokenForm.xsecToken}
            onChange={(e) => setXhsTokenForm(prev => ({ ...prev, xsecToken: e.target.value }))}
            placeholder="xsec_token"
            className="bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
          />
          <input
            value={xhsTokenForm.xsecSource}
            onChange={(e) => setXhsTokenForm(prev => ({ ...prev, xsecSource: e.target.value }))}
            placeholder="xsec_source (default: pc_feed)"
            className="bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleAddXhsTokenConfig}
            className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors"
          >
            <Plus size={14} /> 保存 Token
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-amber-200">待补全 Token 列表</h3>
          <span className="text-xs text-amber-300/90">共 {xhsMissingTokenItems.length} 条</span>
        </div>
        {xhsMissingTokenItems.length === 0 ? (
          <p className="text-sm text-gray-400">当前没有缺少 xsec_token 的小红书链接。</p>
        ) : (
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {xhsMissingTokenItems.map(item => (
              <div key={item.id} className="rounded-lg border border-amber-500/30 bg-[#0d1526]/70 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-100 truncate">{item.title || '无标题'}</p>
                    <p className="text-xs text-gray-400 truncate">@{item.author || 'unknown'} · {item.date || '未知时间'} · {item.from}</p>
                    <p className="text-[11px] text-amber-300 mt-1 break-all">noteId: {item.noteId}</p>
                  </div>
                  <button
                    onClick={() => copyText(item.noteId, 'noteId 已复制')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#1e3a5f]/60 text-xs text-gray-300 hover:bg-white/5"
                  >
                    <Copy size={12} /> 复制
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Token 配置列表</h3>
        {xhsTokenConfigs.length === 0 ? (
          <p className="text-sm text-gray-500">尚未配置 token</p>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {xhsTokenConfigs.map(item => (
              <div key={item.noteId} className="rounded-lg border border-[#1e3a5f]/40 bg-[#0d1526]/70 px-3 py-2 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-indigo-300 break-all">noteId: {item.noteId}</p>
                  <p className="text-xs text-gray-300 mt-1 break-all">xsec_token: {item.xsecToken}</p>
                  <p className="text-[11px] text-gray-500 mt-1">xsec_source: {item.xsecSource || 'pc_feed'}</p>
                </div>
                <button
                  onClick={() => handleDeleteXhsToken(item.noteId)}
                  className="text-gray-500 hover:text-rose-300 transition-colors"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full h-[100dvh] sm:h-[84vh] sm:max-h-[880px] sm:max-w-6xl rounded-none sm:rounded-2xl border border-[#1e3a5f]/50 bg-[#0a1628] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-[#1e3a5f]/40">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">监控设置</h2>
            <p className="text-xs text-gray-500 mt-0.5">Twitter Quality Filter</p>
          </div>

          <div className="flex items-center gap-2">
            {!isSupabaseConnected() && (
              <span className="text-[11px] px-2 py-1 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
                离线模式
              </span>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/5 transition-colors flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="w-full lg:w-56 border-b lg:border-b-0 lg:border-r border-[#1e3a5f]/40 p-2 sm:p-3 flex lg:block gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('trusted')}
              className={`whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'trusted' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              信任账号
            </button>
            <button
              onClick={() => setActiveTab('keywords')}
              className={`whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'keywords' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              质量关键词
            </button>
            <button
              onClick={() => setActiveTab('threshold')}
              className={`whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'threshold' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              互动阈值设置
            </button>
            <button
              onClick={() => setActiveTab('trace')}
              className={`whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'trace' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              热点追踪明细
            </button>
            <button
              onClick={() => setActiveTab('xhs_tokens')}
              className={`whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'xhs_tokens' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              XHS Token 配置
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'about' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              关于
            </button>
          </div>

          <div className="flex-1 min-h-0 p-4 lg:p-5 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-gray-400">正在加载设置...</p>
            ) : (
              <>
                {activeTab === 'trusted' && renderTrustedTab()}
                {activeTab === 'keywords' && renderKeywordsTab()}
                {activeTab === 'threshold' && renderThresholdTab()}
                {activeTab === 'trace' && renderTraceTab()}
                {activeTab === 'xhs_tokens' && renderXhsTokensTab()}
                {activeTab === 'about' && renderAboutTab()}
              </>
            )}

            {message && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 text-xs px-3 py-2 rounded-lg bg-[#0d1526] border border-[#1e3a5f]/60 text-gray-200 shadow-xl">
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

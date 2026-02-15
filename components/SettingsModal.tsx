import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from './Icons';
import {
  deleteQualityKeyword,
  deleteTrustedAccount,
  getMonitorSettings,
  getQualityKeywords,
  getTrustedAccounts,
  saveQualityKeyword,
  saveTrustedAccount,
  updateMonitorSetting,
  updateTrustedAccount
} from '../services/supabaseService';
import { isSupabaseConnected } from '../services/supabaseClient';
import { MonitorSettings, QualityKeyword, TrustedAccount } from '../types';

type Tab = 'trusted' | 'keywords' | 'threshold' | 'about';
type PlatformType = 'twitter' | 'xiaohongshu';
type CategoryType = 'image_gen' | 'video_gen' | 'vibe_coding';

interface SettingsModalProps {
  onClose: () => void;
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

const DEFAULT_SETTINGS: MonitorSettings = { minEngagement: 500, trustedMinEngagement: 1000, splitKeywords: false };

const normalizeHandle = (handle: string) => handle.replace(/^@+/, '').trim();

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('trusted');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [trustedAccounts, setTrustedAccounts] = useState<TrustedAccount[]>([]);
  const [qualityKeywords, setQualityKeywords] = useState<QualityKeyword[]>([]);
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
    const [accounts, keywords, settings] = await Promise.all([
      getTrustedAccounts(),
      getQualityKeywords(),
      getMonitorSettings()
    ]);

    setTrustedAccounts(accounts);
    setQualityKeywords(keywords);
    setMonitorSettings(settings);
    setThresholdInput(String(settings.minEngagement));
    setTrustedThresholdInput(String(settings.trustedMinEngagement));

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
      splitKeywords: monitorSettings.splitKeywords
    });
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
    flashMessage(`全量关键词搜索已${value ? '开启' : '关闭'}`);
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors"
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
                    <div className="flex items-center gap-3">
                      <div className="min-w-[150px] text-sm text-gray-100">@{account.handle}</div>
                      <span className={`text-xs px-2 py-1 rounded-full border ${CATEGORY_STYLES[(account.category as CategoryType) || 'vibe_coding']}`}>
                        {CATEGORY_LABEL[(account.category as CategoryType) || 'vibe_coding']}
                      </span>
                      <div className="flex-1 text-xs text-gray-400 truncate">{account.notes || '无备注'}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTrustedAccount(account.id);
                        }}
                        className="text-gray-500 hover:text-rose-300 transition-colors"
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
      <div className="flex gap-2 mb-3">
        <input
          value={keywordForm[type]}
          onChange={(e) => setKeywordForm(prev => ({ ...prev, [type]: e.target.value }))}
          placeholder={type === 'positive' ? '新增正向关键词' : '新增屏蔽关键词'}
          className="flex-1 bg-[#0d1526] border border-[#1e3a5f]/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => addKeyword(type)}
          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs text-white"
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

  const renderAboutTab = () => (
    <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/60 p-5 space-y-2 text-sm text-gray-300">
      <p>Twitter 内容质量过滤配置中心</p>
      <p className="text-gray-500">Version 1.0</p>
      <p className="text-gray-500">管理信任账号、关键词质量信号和互动量阈值。</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-6xl h-[84vh] max-h-[880px] rounded-2xl border border-[#1e3a5f]/50 bg-[#0a1628] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e3a5f]/40">
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
          <div className="w-full lg:w-56 border-b lg:border-b-0 lg:border-r border-[#1e3a5f]/40 p-3 space-y-1">
            <button
              onClick={() => setActiveTab('trusted')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'trusted' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              信任账号
            </button>
            <button
              onClick={() => setActiveTab('keywords')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'keywords' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              质量关键词
            </button>
            <button
              onClick={() => setActiveTab('threshold')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'threshold' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              互动阈值设置
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'about' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
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
                {activeTab === 'about' && renderAboutTab()}
              </>
            )}

            {message && (
              <div className="fixed bottom-6 right-6 text-xs px-3 py-2 rounded-lg bg-[#0d1526] border border-[#1e3a5f]/60 text-gray-200 shadow-xl">
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

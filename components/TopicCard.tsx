import React, { memo, useId, useState } from 'react';
import { EditorialTopic, TopicFeedbackAction, TopicSource } from '../types';
import { Bookmark, Check, ChevronDown, ExternalLink, X } from './Icons';
import { buildTopicFeedbackKey } from '../shared/topicFeedbackState.js';

export type TopicLane = 'write' | 'study' | 'breaking';

interface TopicCardProps {
    topic: EditorialTopic;
    lane: TopicLane;
    canGiveFeedback: boolean;
    feedbackOwnerId: string | null;
    pendingFeedbackKeys: ReadonlySet<string>;
    onToggleFeedback: (
        topicId: string,
        action: TopicFeedbackAction,
        enabled: boolean
    ) => Promise<boolean>;
}

const EMPTY_SOURCES: TopicSource[] = [];
const EMPTY_FEEDBACK: TopicFeedbackAction[] = [];

const LANE_COPY: Record<TopicLane, { label: string; score: keyof EditorialTopic; accent: string }> = {
    write: { label: '为什么值得写', score: 'writeScore', accent: 'text-indigo-300' },
    study: { label: '为什么值得学', score: 'studyScore', accent: 'text-emerald-300' },
    breaking: { label: '为什么正在爆', score: 'breakingScore', accent: 'text-rose-300' },
};

const FEEDBACK_ACTIONS: Array<{
    action: TopicFeedbackAction;
    label: string;
    icon: typeof Bookmark;
}> = [
    { action: 'saved', label: '收藏', icon: Bookmark },
    { action: 'ignored', label: '忽略', icon: X },
    { action: 'published', label: '已发布', icon: Check },
];

const safeEvidenceUrl = (value?: string): string | null => {
    if (!value) return null;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.toString();
    } catch {
        return null;
    }
};

const isFactSource = (source: TopicSource) => {
    const kind = `${source.evidenceRole} ${source.sourceType}`.toLowerCase();
    return /fact|official|repository|github|一手|官方/.test(kind);
};

const formatPublicationTime = (value?: string) => {
    if (!value) return '发布时间未知';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const TopicCard = memo(function TopicCard({
    topic,
    lane,
    canGiveFeedback,
    feedbackOwnerId,
    pendingFeedbackKeys,
    onToggleFeedback,
}: TopicCardProps) {
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const [feedbackError, setFeedbackError] = useState('');
    const evidencePanelId = `topic-evidence-${useId().replace(/:/g, '')}`;
    const sources = topic.sources ?? EMPTY_SOURCES;
    const feedback = topic.feedback ?? EMPTY_FEEDBACK;
    const laneCopy = LANE_COPY[lane];
    const laneScore = Number(topic[laneCopy.score]) || 0;
    const laneExplanation = lane === 'write'
        ? topic.contentAngles.quick || topic.contentAngles.viewpoint || topic.whyNow
        : lane === 'study'
            ? topic.durableKnowledge[0] || topic.contentAngles.tutorial || topic.whyNow
            : topic.whyNow;

    const handleFeedback = async (action: TopicFeedbackAction) => {
        const pending = pendingFeedbackKeys.has(
            buildTopicFeedbackKey(feedbackOwnerId, topic.id, action)
        );
        if (!canGiveFeedback || pending) return;
        const active = feedback.includes(action);
        setFeedbackError('');
        try {
            const success = await onToggleFeedback(topic.id, action, !active);
            if (!success) setFeedbackError('操作未保存，已恢复原状态。');
        } catch {
            setFeedbackError('操作未保存，已恢复原状态。');
        }
    };

    return (
        <article className="flex h-full flex-col rounded-2xl border border-[#1e3a5f]/50 bg-[#0d1526]/70 p-5 shadow-sm transition-colors hover:border-indigo-500/40">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${laneCopy.accent}`}>
                    {laneCopy.label} · {Math.round(laneScore)} 分
                </span>
                {topic.generationStatus === 'fallback' ? (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                        自动摘要 · 待核验
                    </span>
                ) : (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                        智能简报
                    </span>
                )}
            </div>

            <h4 className="text-base font-bold leading-snug text-gray-100">{topic.title}</h4>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">{topic.summary}</p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">此刻信号：{topic.whyNow}</p>
            <div className="mt-3 rounded-xl border border-[#1e3a5f]/40 bg-[#111d33]/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{laneCopy.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-300">{laneExplanation}</p>
            </div>

            <div className="mt-4 border-t border-[#1e3a5f]/40 pt-4">
                <button
                    type="button"
                    aria-expanded={evidenceOpen}
                    aria-controls={evidencePanelId}
                    onClick={() => setEvidenceOpen((open) => !open)}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-xs font-medium text-gray-300 hover:text-white"
                >
                    <span>证据来源 · {sources.length || topic.sourceCount}</span>
                    <ChevronDown
                        size={15}
                        className={`transition-transform ${evidenceOpen ? 'rotate-180' : ''}`}
                    />
                </button>

                {evidenceOpen && (
                    <div id={evidencePanelId} className="mt-3 space-y-2">
                        {sources.length === 0 ? (
                            <p className="rounded-lg bg-[#1e3a5f]/20 px-3 py-2 text-xs text-gray-500">
                                没有可展示的证据来源
                            </p>
                        ) : sources.map((source) => {
                            const card = source.card;
                            const href = safeEvidenceUrl(card?.sourceUrl);
                            const roleLabel = isFactSource(source) ? '事实来源' : '热度来源';
                            return (
                                <div key={source.id} className="rounded-lg border border-[#1e3a5f]/40 bg-[#111d33]/60 p-3">
                                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                        <span className={isFactSource(source)
                                            ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300'
                                            : 'rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300'}
                                        >
                                            {roleLabel}
                                        </span>
                                        <span className="rounded-full bg-[#1e3a5f]/50 px-2 py-0.5 text-gray-300">
                                            {card?.platform || source.sourceType || '未知来源'}
                                        </span>
                                        <span className="text-gray-500">{card?.author ? `@${card.author}` : '作者未知'}</span>
                                        <span className="text-gray-600">{formatPublicationTime(card?.date)}</span>
                                    </div>
                                    <div className="mt-2 flex items-start justify-between gap-3">
                                        <p className="line-clamp-2 text-xs leading-relaxed text-gray-300">
                                            {card?.title || '来源内容暂未载入'}
                                        </p>
                                        {href ? (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex shrink-0 items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
                                            >
                                                原文 <ExternalLink size={12} />
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="mt-auto pt-4">
                <div className="flex flex-wrap gap-2" aria-label="话题反馈">
                    {FEEDBACK_ACTIONS.map(({ action, label, icon: Icon }) => {
                        const active = feedback.includes(action);
                        const pending = pendingFeedbackKeys.has(
                            buildTopicFeedbackKey(feedbackOwnerId, topic.id, action)
                        );
                        return (
                            <button
                                key={action}
                                type="button"
                                aria-pressed={active}
                                disabled={!canGiveFeedback || pending}
                                onClick={() => void handleFeedback(action)}
                                title={canGiveFeedback ? label : '登录后可标记话题'}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                                    active
                                        ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                                        : 'border-[#1e3a5f]/60 text-gray-400 hover:border-indigo-500/40 hover:text-gray-200'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                <Icon size={13} />
                                {pending ? '处理中…' : label}
                            </button>
                        );
                    })}
                </div>
                {!canGiveFeedback && <p className="mt-2 text-[11px] text-gray-600">登录后可标记收藏、忽略或已发布。</p>}
                {feedbackError && <p role="alert" className="mt-2 text-xs text-rose-300">{feedbackError}</p>}
            </div>
        </article>
    );
});

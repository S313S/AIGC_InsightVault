import React, { useMemo } from 'react';
import { EditorialTopic, TopicFeedbackAction } from '../types';
import { BookOpen, Newspaper, Zap } from './Icons';
import { TopicCard, TopicLane } from './TopicCard';
import { buildTopicFeedbackKey } from '../shared/topicFeedbackState.js';

interface TopicRadarViewProps {
    topics: EditorialTopic[];
    isTopicsLoading: boolean;
    freshnessNow: number;
    canGiveFeedback: boolean;
    feedbackOwnerId: string | null;
    pendingFeedbackKeys: ReadonlySet<string>;
    onToggleFeedback: (
        topicId: string,
        action: TopicFeedbackAction,
        enabled: boolean
    ) => Promise<boolean>;
}

type TopicLanes = Record<TopicLane, EditorialTopic[]> & { ignored: EditorialTopic[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const LANE_LIMITS = Object.freeze({ writeLimit: 5, studyLimit: 5, breakingLimit: 3 });

const LANE_DEFINITIONS: Array<{
    key: TopicLane;
    title: string;
    description: string;
    icon: typeof Newspaper;
    iconClass: string;
}> = [
    {
        key: 'write',
        title: '今日值得写',
        description: '适合快速形成观点、案例或实操内容',
        icon: Newspaper,
        iconClass: 'bg-indigo-500/20 text-indigo-300',
    },
    {
        key: 'study',
        title: '值得沉淀',
        description: '适合长期学习、验证并写进知识库',
        icon: BookOpen,
        iconClass: 'bg-emerald-500/20 text-emerald-300',
    },
    {
        key: 'breaking',
        title: '突发雷达',
        description: '24 小时内正在形成关注的新变化',
        icon: Zap,
        iconClass: 'bg-rose-500/20 text-rose-300',
    },
];

const safeAge = (value: string, now: number) => {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp) || timestamp > now) return null;
    return now - timestamp;
};

const compareByScore = (score: keyof EditorialTopic) => (
    left: EditorialTopic,
    right: EditorialTopic
) => {
    const scoreDelta = Number(right[score]) - Number(left[score]);
    if (scoreDelta !== 0) return scoreDelta;
    const recencyDelta = new Date(right.latestEvidenceAt).getTime() - new Date(left.latestEvidenceAt).getTime();
    if (Number.isFinite(recencyDelta) && recencyDelta !== 0) return recencyDelta;
    return left.id.localeCompare(right.id, 'zh-CN');
};

const uniqueTopics = (topics: EditorialTopic[], limit: number) => {
    const seen = new Set<string>();
    const result: EditorialTopic[] = [];
    for (const topic of topics) {
        const identity = topic.fingerprint || topic.id;
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        result.push(topic);
        if (result.length >= limit) break;
    }
    return result;
};

export const deriveTopicLanes = (topics: EditorialTopic[], now: number): TopicLanes => {
    const visible: EditorialTopic[] = [];
    const ignored: EditorialTopic[] = [];
    for (const topic of topics) {
        if (topic.feedback?.includes('ignored')) ignored.push(topic);
        else visible.push(topic);
    }

    const write = visible.filter((topic) => {
        const age = safeAge(topic.latestEvidenceAt, now);
        return age !== null && age <= 3 * DAY_MS && topic.writeScore >= 50;
    }).sort(compareByScore('writeScore'));
    const study = visible.filter((topic) => {
        const age = safeAge(topic.latestEvidenceAt, now);
        return age !== null && age <= 30 * DAY_MS && topic.studyScore >= 55;
    }).sort(compareByScore('studyScore'));
    const breaking = visible.filter((topic) => {
        const age = safeAge(topic.latestEvidenceAt, now);
        return age !== null && age <= DAY_MS && topic.breakingScore >= 60;
    }).sort(compareByScore('breakingScore'));

    return {
        write: uniqueTopics(write, LANE_LIMITS.writeLimit),
        study: uniqueTopics(study, LANE_LIMITS.studyLimit),
        breaking: uniqueTopics(breaking, LANE_LIMITS.breakingLimit),
        ignored: ignored.sort(compareByScore('writeScore')),
    };
};

export const TopicRadarView: React.FC<TopicRadarViewProps> = ({
    topics,
    isTopicsLoading,
    freshnessNow,
    canGiveFeedback,
    feedbackOwnerId,
    pendingFeedbackKeys,
    onToggleFeedback,
}) => {
    const lanes = useMemo(() => deriveTopicLanes(topics, freshnessNow), [topics, freshnessNow]);
    const visibleCount = lanes.write.length + lanes.study.length + lanes.breaking.length;

    if (isTopicsLoading && topics.length === 0) {
        return (
            <section aria-labelledby="topic-radar-title">
                <div className="mb-5">
                    <h2 id="topic-radar-title" className="text-xl font-bold text-gray-100">AI 话题雷达</h2>
                    <p className="mt-1 text-sm text-gray-500">正在整理话题，不影响下方原始帖子浏览。</p>
                </div>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" aria-label="正在整理话题">
                    {Array.from({ length: 3 }, (_, index) => (
                        <div key={index} className="h-64 animate-pulse rounded-2xl border border-[#1e3a5f]/40 bg-[#0d1526]/60 motion-reduce:animate-none" />
                    ))}
                </div>
            </section>
        );
    }

    return (
        <section aria-labelledby="topic-radar-title">
            <div className="mb-5">
                <h2 id="topic-radar-title" className="text-xl font-bold text-gray-100">AI 话题雷达</h2>
                <p className="mt-1 text-sm text-gray-500">按创作价值、长期价值和突发势能分别筛选，不把三个目标混成一个总榜。</p>
            </div>

            {topics.length === 0 || visibleCount === 0 ? (
                <div className="rounded-2xl border border-[#1e3a5f]/40 bg-[#0d1526]/50 p-8 text-center">
                    <p className="text-sm font-medium text-gray-300">暂无可用话题</p>
                    <p className="mt-2 text-xs text-gray-500">可以继续展开下方「原始帖子池」查看采集结果。</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {LANE_DEFINITIONS.map(({ key, title, description, icon: Icon, iconClass }) => (
                        <section key={key} aria-labelledby={`topic-lane-${key}`}>
                            <div className="mb-4 flex items-center gap-3">
                                <span className={`rounded-lg p-2 ${iconClass}`}><Icon size={17} /></span>
                                <div>
                                    <h3 id={`topic-lane-${key}`} className="font-bold text-gray-100">{title}</h3>
                                    <p className="text-xs text-gray-500">{description}</p>
                                </div>
                            </div>
                            {lanes[key].length === 0 ? (
                                <p className="rounded-xl border border-dashed border-[#1e3a5f]/50 px-4 py-5 text-sm text-gray-500">
                                    当前没有达到这一泳道门槛的话题。
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                                    {lanes[key].map((topic) => (
                                        <TopicCard
                                            key={`${key}:${topic.id}`}
                                            topic={topic}
                                            lane={key}
                                            canGiveFeedback={canGiveFeedback}
                                            feedbackOwnerId={feedbackOwnerId}
                                            pendingFeedbackKeys={pendingFeedbackKeys}
                                            onToggleFeedback={onToggleFeedback}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}

            {canGiveFeedback && lanes.ignored.length > 0 && (
                <details className="mt-6 rounded-xl border border-[#1e3a5f]/40 bg-[#0d1526]/40 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-400">
                        已忽略话题 · {lanes.ignored.length}
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {lanes.ignored.map((topic) => {
                            const pending = pendingFeedbackKeys.has(
                                buildTopicFeedbackKey(feedbackOwnerId, topic.id, 'ignored')
                            );
                            return (
                                <button
                                    key={topic.id}
                                    type="button"
                                    disabled={pending}
                                    onClick={() => void onToggleFeedback(topic.id, 'ignored', false)}
                                    className="rounded-lg border border-[#1e3a5f]/60 px-3 py-2 text-xs text-gray-400 hover:border-indigo-500/50 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <span aria-live="polite">{pending ? '处理中…' : `恢复：${topic.title}`}</span>
                                </button>
                            );
                        })}
                    </div>
                </details>
            )}
        </section>
    );
};

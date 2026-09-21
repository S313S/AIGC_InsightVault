import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { scoreTopicCluster, selectTopicLanes } from '../shared/topicScoring.js';

const NOW = '2026-09-21T12:00:00+08:00';

const evidence = (id, title, extra = {}) => ({
  id,
  title,
  platform: 'Twitter',
  author: `author-${id}`,
  date: '1小时前',
  rawContent: '',
  tags: [],
  metrics: { likes: 60, bookmarks: 12, comments: 8, shares: 4 },
  ...extra,
});

const cluster = (id, cards, extra = {}) => ({
  fingerprint: `topic:${id}`,
  title: cards[0]?.title || id,
  representativeCard: cards[0],
  cards,
  evidence: cards,
  ...extra,
});

const baselines = {
  Twitter: { engagement: [10, 40, 80, 160, 320] },
  Xiaohongshu: { engagement: [5, 20, 50, 100, 200] },
};

test('scores a fresh cross-platform product launch as a strong breaking topic', () => {
  const input = cluster('fresh-launch', [
    evidence('launch-x', 'Claude Code Agent Teams 正式发布', {
      platform: 'Twitter',
      rawContent: 'Official launch announcement with a live product demo and benchmark results.',
      tags: ['Claude Code', '发布'],
    }),
    evidence('launch-xhs', '实测 Claude Code Agent Teams 多代理协作', {
      platform: 'Xiaohongshu',
      date: '刚刚',
      rawContent: '刚刚上线，实测多个 agent 并行完成编码任务。',
      tags: ['Claude Code', '实测'],
    }),
  ]);

  const result = scoreTopicCluster(input, { now: NOW, sourceBaselines: baselines });

  assert.ok(result.breakingScore >= 75, result.breakingScore);
  assert.equal(result.laneEligibility.breaking, true);
});

test('scores practical tutorials highly for durable study despite modest engagement', () => {
  const input = cluster('tutorial', [
    evidence('tutorial-1', 'Cursor 数据库重构教程：从诊断到迁移', {
      date: '20天前',
      rawContent: '完整代码、五个步骤、benchmark 对比和真实项目实践案例，附 GitHub repo。',
      tags: ['教程', '代码', 'benchmark'],
      metrics: { likes: 8, bookmarks: 3, comments: 1, shares: 0 },
    }),
  ]);

  const result = scoreTopicCluster(input, { now: NOW, sourceBaselines: baselines });

  assert.ok(result.studyScore >= 75, result.studyScore);
  assert.equal(result.laneEligibility.study, true);
  assert.equal(result.laneEligibility.breaking, false);
});

test('does not let high-like entertainment outrank useful information', () => {
  const entertainment = cluster('entertainment', [
    evidence('meme', 'AI 圈今日爆笑名场面，哈哈哈哈', {
      rawContent: '纯娱乐段子和表情包合集，围观抽奖。',
      tags: ['搞笑', '娱乐', '抽奖'],
      metrics: { likes: 2_000_000, bookmarks: 50_000, comments: 90_000, shares: 40_000 },
    }),
  ]);

  const result = scoreTopicCluster(entertainment, { now: NOW, sourceBaselines: baselines });

  assert.ok(result.writeScore < 40, result.writeScore);
  assert.ok(result.studyScore < 40, result.studyScore);
  assert.equal(result.laneEligibility.write, false);
  assert.equal(result.laneEligibility.study, false);
});

test('does not treat entertainment derived from a launch as substantive breaking evidence', () => {
  const entertainment = scoreTopicCluster(cluster('launch-meme', [
    evidence('launch-meme-1', 'Sora 3 正式发布后的爆笑名场面实测', {
      rawContent: '纯娱乐段子和表情包合集，围观抽奖。',
      tags: ['发布', '实测', '搞笑', '娱乐'],
      metrics: { likes: 2_000_000, bookmarks: 50_000, comments: 90_000, shares: 40_000 },
    }),
  ]), { now: NOW, sourceBaselines: baselines });

  assert.ok(entertainment.writeScore < 40, entertainment.writeScore);
  assert.ok(entertainment.studyScore < 40, entertainment.studyScore);
  assert.ok(entertainment.breakingScore < 60, entertainment.breakingScore);
  assert.deepEqual(entertainment.laneEligibility, {
    write: false,
    study: false,
    breaking: false,
  });
});

test('keeps a fact-rich release eligible independent of its source type', () => {
  const release = scoreTopicCluster(cluster('fact-rich-release', [
    evidence('fact-rich-release-1', 'Sora 3 正式发布：演示包含一个爆笑名场面', {
      sourceType: 'social',
      rawContent: 'Changelog and API docs record Sora 3.1 availability, rollout regions, version limits, and access scope.',
      tags: ['发布', 'API', '版本'],
    }),
  ]), { now: NOW, sourceBaselines: baselines });

  assert.ok(release.breakingScore >= 60, release.breakingScore);
  assert.equal(release.laneEligibility.breaking, true);
});

test('source identity cannot turn identical low-value content into momentum', () => {
  const makeResult = (sourceType) => scoreTopicCluster(cluster(`low-value-${sourceType}`, [
    evidence(`low-value-${sourceType}-1`, 'Sora 3 正式发布后的爆笑名场面实测', {
      sourceType,
      rawContent: '纯娱乐段子和表情包合集，围观抽奖。',
      tags: ['发布', '实测', '搞笑', '娱乐'],
      metrics: { likes: 2_000_000, bookmarks: 50_000, comments: 90_000, shares: 40_000 },
    }),
  ]), { now: NOW, sourceBaselines: baselines });
  const social = makeResult('social');
  const official = makeResult('official');
  const repository = makeResult('repository');

  assert.equal(official.breakingScore, social.breakingScore);
  assert.equal(repository.breakingScore, social.breakingScore);
  assert.equal(official.writeScore, social.writeScore);
  assert.equal(repository.writeScore, social.writeScore);
  assert.equal(official.studyScore, social.studyScore);
  assert.equal(repository.studyScore, social.studyScore);
  assert.equal(official.laneEligibility.breaking, false);
  assert.equal(repository.laneEligibility.breaking, false);
  assert.ok(official.confidenceScore > social.confidenceScore);
  assert.ok(repository.confidenceScore > social.confidenceScore);
});

test('adding official or repository facts does not manufacture social momentum', () => {
  const socialCard = evidence('attention-1', 'Claude Code Agent Teams 正式发布实测', {
    sourceType: 'social',
    sourceUrl: 'https://x.com/example/status/1',
    rawContent: 'Launch demo shows multiple agents collaborating on a coding task.',
  });
  const officialCard = evidence('fact-official', 'Claude Code Agent Teams changelog', {
    platform: 'Platform.Official',
    sourceType: undefined,
    sourceUrl: 'https://example.com/changelog/agent-teams',
    date: '刚刚',
    rawContent: 'Official changelog documents availability, API parameters, rollout regions, and model limits.',
    metrics: { likes: 9_000_000, bookmarks: 1_000_000, comments: 500_000, shares: 300_000 },
  });
  const repositoryCard = evidence('fact-repo', 'Claude Code Agent Teams repository release', {
    platform: 'github',
    sourceType: undefined,
    sourceUrl: 'https://example.com/releases/tag/v3.1',
    date: '刚刚',
    rawContent: 'Release notes include implementation details and benchmark fixtures.',
    metrics: { likes: 8_000_000, bookmarks: 800_000, comments: 400_000, shares: 200_000 },
  });
  const social = scoreTopicCluster(cluster('attention-base', [socialCard]), {
    now: NOW,
    sourceBaselines: baselines,
  });
  const withFacts = scoreTopicCluster(cluster('attention-facts', [socialCard, officialCard, repositoryCard]), {
    now: NOW,
    sourceBaselines: baselines,
  });

  assert.equal(withFacts.breakingScore, social.breakingScore);
  assert.equal(withFacts.laneEligibility.breaking, social.laneEligibility.breaking);
  assert.ok(withFacts.confidenceScore > social.confidenceScore);
});

test('pure fact clusters never gain momentum from a second fact platform', () => {
  const official = evidence('pure-official', 'Gemini 4 正式发布', {
    platform: 'Official',
    sourceType: undefined,
    sourceUrl: 'https://deepmind.google/models/gemini-4',
    rawContent: 'Release notes document Gemini version 4 availability, API parameters, regions, and access scope.',
    metrics: { likes: 9_000_000, bookmarks: 1_000_000, comments: 500_000, shares: 300_000 },
  });
  const github = evidence('pure-github', 'Gemini 4 SDK release', {
    platform: 'Platform.GitHub',
    sourceType: undefined,
    sourceUrl: 'https://example.com/gemini-sdk-v4',
    rawContent: 'Release notes document Gemini version 4 availability, API parameters, regions, and access scope.',
    metrics: { likes: 8_000_000, bookmarks: 800_000, comments: 400_000, shares: 200_000 },
  });
  const oneFact = scoreTopicCluster(cluster('pure-fact-one', [official]), {
    now: NOW,
    sourceBaselines: baselines,
  });
  const twoFacts = scoreTopicCluster(cluster('pure-fact-two', [official, github]), {
    now: NOW,
    sourceBaselines: baselines,
  });

  assert.ok(oneFact.breakingScore >= 60, oneFact.breakingScore);
  assert.equal(twoFacts.breakingScore, oneFact.breakingScore);
  assert.equal(twoFacts.laneEligibility.breaking, oneFact.laneEligibility.breaking);
  assert.ok(twoFacts.confidenceScore > oneFact.confidenceScore);
});

test('uses per-source percentiles instead of absolute engagement dominance', () => {
  const sourceBaselines = {
    Twitter: { engagement: [200_000, 500_000, 1_000_000, 2_000_000] },
    Xiaohongshu: { engagement: [5, 15, 30, 60] },
  };
  const largeAccount = scoreTopicCluster(cluster('large', [
    evidence('large-1', 'Sora 3 发布实测', {
      platform: 'Twitter',
      rawContent: 'Sora 3 launch demo and hands-on test.',
      metrics: { likes: 100_000, bookmarks: 10_000, comments: 5_000, shares: 2_000 },
    }),
  ]), { now: NOW, sourceBaselines });
  const smallAccount = scoreTopicCluster(cluster('small', [
    evidence('small-1', 'Sora 3 发布实测', {
      platform: 'Xiaohongshu',
      rawContent: 'Sora 3 launch demo and hands-on test.',
      metrics: { likes: 35, bookmarks: 10, comments: 5, shares: 2 },
    }),
  ]), { now: NOW, sourceBaselines });

  assert.ok(smallAccount.breakingScore > largeAccount.breakingScore, {
    large: largeAccount.breakingScore,
    small: smallAccount.breakingScore,
  });
});

test('prefers account baselines within a platform and supports author and handle fields', () => {
  // Contract: a platform baseline may expose `accounts`, `authors`, `handles`,
  // or `byAccount`; account values use the same `{ engagement: number[] }`
  // shape as platform fallback. Flat `platform:account` keys are also valid.
  const sourceBaselines = {
    Twitter: {
      engagement: [10, 100, 1_000, 10_000, 100_000, 1_000_000],
      accounts: {
        mega: { engagement: [200_000, 500_000, 1_000_000, 2_000_000] },
        practitioner: { engagement: [5, 15, 30, 60] },
      },
    },
  };
  const largeAccount = scoreTopicCluster(cluster('same-platform-large', [
    evidence('same-platform-large-1', 'Sora 3 发布实测', {
      author: '@mega',
      rawContent: 'Sora 3 launch demo and hands-on test.',
      metrics: { likes: 100_000, bookmarks: 10_000, comments: 5_000, shares: 2_000 },
    }),
  ]), { now: NOW, sourceBaselines });
  const smallAccount = scoreTopicCluster(cluster('same-platform-small', [
    evidence('same-platform-small-1', 'Sora 3 发布实测', {
      author: 'Practitioner Display Name',
      handle: '@practitioner',
      rawContent: 'Sora 3 launch demo and hands-on test.',
      metrics: { likes: 35, bookmarks: 10, comments: 5, shares: 2 },
    }),
  ]), { now: NOW, sourceBaselines });

  assert.ok(smallAccount.breakingScore > largeAccount.breakingScore, {
    large: largeAccount.breakingScore,
    small: smallAccount.breakingScore,
  });
  assert.ok(smallAccount.breakingScore >= 90, smallAccount.breakingScore);
});

test('official or repository evidence raises confidence without directly raising momentum', () => {
  const socialCard = evidence('source-1', 'Gemini 3 API update', {
    rawContent: 'Gemini 3 API release announcement with benchmark details.',
    sourceType: 'social',
  });
  const officialCard = { ...structuredClone(socialCard), sourceType: 'official' };
  const repositoryCard = { ...structuredClone(socialCard), sourceType: 'repository' };

  const social = scoreTopicCluster(cluster('social', [socialCard]), { now: NOW, sourceBaselines: baselines });
  const official = scoreTopicCluster(cluster('official', [officialCard]), { now: NOW, sourceBaselines: baselines });
  const repository = scoreTopicCluster(cluster('repository', [repositoryCard]), { now: NOW, sourceBaselines: baselines });

  assert.ok(official.confidenceScore > social.confidenceScore);
  assert.ok(repository.confidenceScore > social.confidenceScore);
  assert.ok(official.breakingScore <= social.breakingScore);
  assert.ok(repository.breakingScore <= social.breakingScore);
});

test('rejects invalid or unparseable publication times from breaking eligibility', () => {
  for (const date of ['不是日期', '2026-02-30T10:00:00+08:00', '', null]) {
    const result = scoreTopicCluster(cluster(`invalid-${String(date)}`, [
      evidence('invalid-time', 'GPT-6 正式发布实测', {
        date,
        publishedAt: undefined,
        rawContent: 'Major product launch with live demo and benchmark.',
      }),
    ]), { now: NOW, sourceBaselines: baselines });

    assert.equal(result.laneEligibility.breaking, false, String(date));
    assert.equal(result.breakingScore, 0, String(date));
  }
});

test('enforces exact lane recency windows at 24 hours, 72 hours, and 30 days', () => {
  const topicAt = (id, age) => scoreTopicCluster(cluster(id, [
    evidence(id, 'Claude Code 发布：含完整代码步骤和 benchmark 实测', {
      publishedAt: new Date(new Date(NOW).getTime() - age).toISOString(),
      date: undefined,
      rawContent: 'Official launch tutorial with code, step by step benchmark and practice case.',
      tags: ['发布', '教程', '代码', '实测'],
    }),
  ]), { now: NOW, sourceBaselines: baselines });
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  assert.equal(topicAt('breaking-edge', 24 * HOUR).laneEligibility.breaking, true);
  assert.equal(topicAt('breaking-out', 24 * HOUR + 1).laneEligibility.breaking, false);
  assert.equal(topicAt('write-edge', 72 * HOUR).laneEligibility.write, true);
  assert.equal(topicAt('write-out', 72 * HOUR + 1).laneEligibility.write, false);
  assert.equal(topicAt('study-edge', 30 * DAY).laneEligibility.study, true);
  assert.equal(topicAt('study-out', 30 * DAY + 1).laneEligibility.study, false);
});

test('parses supported relative and short publication formats deterministically', () => {
  for (const date of ['刚刚', '15分钟前', '3小时前', '1天前', '09-21', '9月21日']) {
    const result = scoreTopicCluster(cluster(`date-${date}`, [
      evidence(`card-${date}`, 'Veo 4 正式发布实测', {
        date,
        rawContent: 'Product launch demo and hands-on benchmark.',
      }),
    ]), { now: NOW, sourceBaselines: baselines });

    assert.equal(result.laneEligibility.breaking, true, date);
  }
});

test('uses an explicit source timezone independent of the host timezone', () => {
  const program = `
    import { scoreTopicCluster } from './shared/topicScoring.js';
    const makeCluster = (dateField) => ({
      fingerprint: 'topic:timezone',
      title: 'Veo 4 正式发布实测',
      evidence: [{
        id: 'timezone-card', title: 'Veo 4 正式发布实测', platform: 'Twitter',
        author: 'tester', rawContent: 'Launch demo and benchmark.', tags: [],
        metrics: { likes: 10, bookmarks: 2, comments: 1, shares: 0 },
        ...dateField,
      }],
    });
    const options = {
      now: '2026-09-21T00:30:00+08:00', timezoneOffsetMinutes: 480,
      sourceBaselines: { Twitter: { engagement: [1, 5, 10, 20] } },
    };
    const short = scoreTopicCluster(makeCluster({ date: '09-21' }), options);
    const unzoned = scoreTopicCluster(makeCluster({ publishedAt: '2026-09-21T00:00:00' }), options);
    const future = scoreTopicCluster(makeCluster({ publishedAt: '2026-09-21T01:00:00' }), options);
    console.log(JSON.stringify({
      short: [short.latestPublishedAt, short.laneEligibility.breaking],
      unzoned: [unzoned.latestPublishedAt, unzoned.laneEligibility.breaking],
      future: [future.latestPublishedAt, future.laneEligibility.breaking],
    }));
  `;
  const run = (tz) => spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  const utc = run('UTC');
  const shanghai = run('Asia/Shanghai');

  assert.equal(utc.status, 0, utc.stderr);
  assert.equal(shanghai.status, 0, shanghai.stderr);
  assert.equal(utc.stdout, shanghai.stdout);
  const result = JSON.parse(utc.stdout);
  assert.deepEqual(result.short, ['2026-09-20T16:00:00.000Z', true]);
  assert.deepEqual(result.unzoned, ['2026-09-20T16:00:00.000Z', true]);
  assert.deepEqual(result.future, [null, false]);
});

test('does not let one broad comparison or code word wash low-value entertainment', () => {
  for (const [name, title, rawContent] of [
    ['comparison', 'Sora 3 发布前后搞笑对比', '纯娱乐段子和表情包合集，围观抽奖。'],
    ['opinion', '关于 Sora 3 发布的爆笑观点', '娱乐吃瓜和抽奖，没有事实或方法。'],
    ['code', 'Sora 3 发布后的搞笑代码', '一个 meme 代码梗和表情包抽奖。'],
    ['workflow', 'Sora 3 发布后的爆笑工作流', '纯娱乐流程段子，围观抽奖。'],
  ]) {
    const result = scoreTopicCluster(cluster(`broad-${name}`, [
      evidence(`broad-${name}-1`, title, {
        rawContent,
        metrics: { likes: 2_000_000, bookmarks: 50_000, comments: 90_000, shares: 40_000 },
      }),
    ]), { now: NOW, sourceBaselines: baselines });

    assert.ok(result.writeScore < 40, `${name}: ${result.writeScore}`);
    assert.ok(result.breakingScore < 60, `${name}: ${result.breakingScore}`);
    assert.equal(result.laneEligibility.write, false, name);
    assert.equal(result.laneEligibility.breaking, false, name);
  }
});

test('does not let isolated tutorial, benchmark, or case-study labels wash entertainment', () => {
  for (const [name, title] of [
    ['tutorial-benchmark', 'Sora 3 爆笑教程 benchmark 实测'],
    ['case-study', 'Sora 3 发布后的搞笑 case study'],
  ]) {
    const result = scoreTopicCluster(cluster(`label-${name}`, [
      evidence(`label-${name}-1`, title, {
        rawContent: '纯娱乐段子和表情包合集，围观抽奖，没有步骤、数据或可验证结果。',
        metrics: { likes: 2_000_000, bookmarks: 50_000, comments: 90_000, shares: 40_000 },
      }),
    ]), { now: NOW, sourceBaselines: baselines });

    assert.ok(result.writeScore < 40, `${name}: ${result.writeScore}`);
    assert.equal(result.breakingScore, 0, name);
    assert.equal(result.laneEligibility.breaking, false, name);
  }
});

test('keeps a quantitative benchmark with concrete method and results substantive', () => {
  const result = scoreTopicCluster(cluster('real-benchmark', [
    evidence('real-benchmark-1', 'Sora 3 latency benchmark', {
      rawContent: 'Method: test Sora 3 versus Sora 2 on 100 prompts. Result: median latency was 12.4s versus 18.9s.',
      tags: ['benchmark', 'comparison'],
    }),
  ]), { now: NOW, sourceBaselines: baselines });

  assert.ok(result.studyScore >= 55, result.studyScore);
  assert.equal(result.laneEligibility.study, true);
});

test('deduplicates raw cards by stable evidence identity before counting reach or engagement', () => {
  const canonical = evidence('canonical', 'Claude Code Agent Teams 正式发布实测', {
    sourceUrl: 'https://x.com/example/status/42',
    rawContent: 'Launch demo with an implementation benchmark.',
  });
  const one = scoreTopicCluster(cluster('one-evidence', [canonical], {
    evidenceKeys: ['evidence:canonical'],
  }), { now: NOW, sourceBaselines: baselines });
  const repeatedCards = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(canonical),
    id: `duplicate-${index}`,
    platform: index % 2 === 0 ? 'Twitter' : 'Xiaohongshu',
  }));
  const repeated = scoreTopicCluster(cluster('repeated-evidence', repeatedCards, {
    evidenceKeys: ['evidence:canonical'],
  }), { now: NOW, sourceBaselines: baselines });

  assert.equal(repeated.writeScore, one.writeScore);
  assert.equal(repeated.studyScore, one.studyScore);
  assert.equal(repeated.breakingScore, one.breakingScore);
  assert.equal(repeated.confidenceScore, one.confidenceScore);
  assert.deepEqual(repeated.laneEligibility, one.laneEligibility);
});

test('merges repeated observations using latest time and metrics plus the richest stable body', () => {
  const olderRich = evidence('z-old-id', 'Claude Code migration release tutorial', {
    sourceUrl: 'https://example.com/same-evidence',
    publishedAt: '2026-09-21T01:00:00Z',
    date: undefined,
    rawContent: '完整教程：步骤 1 诊断；步骤 2 修改。包含代码实现、benchmark、真实项目实践案例和 GitHub repo。',
    tags: ['教程', '代码', 'benchmark'],
    metrics: { likes: 5, bookmarks: 1, comments: 0, shares: 0 },
  });
  const latestBrief = evidence('a-new-id', 'Claude Code migration update', {
    sourceUrl: 'https://example.com/same-evidence',
    publishedAt: '2026-09-21T03:00:00Z',
    date: undefined,
    rawContent: 'Latest observation.',
    metrics: { likes: 160, bookmarks: 20, comments: 10, shares: 5 },
  });
  const score = (cards) => scoreTopicCluster(cluster('observation-merge', cards, {
    evidenceKeys: ['evidence:same'],
  }), { now: NOW, sourceBaselines: baselines });
  const forward = score([olderRich, latestBrief]);
  const reverseWithSwappedIds = score([
    { ...structuredClone(latestBrief), id: olderRich.id },
    { ...structuredClone(olderRich), id: latestBrief.id },
  ]);
  const summarizeScore = (result) => ({
    writeScore: result.writeScore,
    studyScore: result.studyScore,
    breakingScore: result.breakingScore,
    confidenceScore: result.confidenceScore,
    latestPublishedAt: result.latestPublishedAt,
    laneEligibility: result.laneEligibility,
  });

  assert.deepEqual(summarizeScore(forward), summarizeScore(reverseWithSwappedIds));
  assert.equal(forward.latestPublishedAt, '2026-09-21T03:00:00.000Z');
  assert.ok(forward.studyScore >= 75, forward.studyScore);
  assert.ok(forward.breakingScore >= 85, forward.breakingScore);
});

test('clamps every score and remains deterministic without mutating inputs', () => {
  const input = cluster('immutable', [
    evidence('immutable-1', 'Claude Code 正式发布完整教程 benchmark 实测', {
      rawContent: '代码 步骤 benchmark 实践案例 release launch official repository GitHub'.repeat(20),
      tags: ['教程', '代码', '实测'],
      metrics: { likes: Number.MAX_VALUE, bookmarks: Number.MAX_VALUE, comments: Number.MAX_VALUE, shares: Number.MAX_VALUE },
    }),
  ]);
  const options = {
    now: NOW,
    sourceBaselines: baselines,
    preferenceSignals: { keywords: { 'Claude Code': 10_000 }, tags: { 教程: 10_000 } },
  };
  const before = structuredClone(input);

  const first = scoreTopicCluster(input, options);
  const second = scoreTopicCluster(input, options);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  for (const key of ['writeScore', 'studyScore', 'breakingScore', 'confidenceScore', 'preferenceScore', 'opportunityScore']) {
    assert.ok(first[key] >= 0 && first[key] <= 100, `${key}=${first[key]}`);
  }
  const expectedOpportunity = Math.round((
    0.35 * first.writeScore +
    0.25 * first.studyScore +
    0.20 * first.breakingScore +
    0.10 * first.confidenceScore +
    0.10 * first.preferenceScore
  ) * 100) / 100;
  assert.equal(first.opportunityScore, expectedOpportunity);
});

test('keeps preference neutral by default and uses explainable keyword and tag affinity', () => {
  const input = cluster('preference', [
    evidence('preference-1', 'Claude Code 工作流', { tags: ['编程', 'Agent'] }),
  ]);
  const neutral = scoreTopicCluster(input, { now: NOW, sourceBaselines: baselines });
  const preferred = scoreTopicCluster(input, {
    now: NOW,
    sourceBaselines: baselines,
    preferenceSignals: {
      keywords: { 'Claude Code': 12 },
      tags: { Agent: 8 },
    },
  });

  assert.equal(neutral.preferenceScore, 50);
  assert.ok(preferred.preferenceScore > neutral.preferenceScore);
  assert.ok(preferred.preferenceScore <= 100);
});

test('selectTopicLanes applies independent eligibility, limits, stable ordering, and per-lane dedupe', () => {
  const topics = [
    { id: 'b', fingerprint: 'topic:b', writeScore: 80, studyScore: 85, breakingScore: 90, opportunityScore: 82, laneEligibility: { write: true, study: true, breaking: true } },
    { id: 'a', fingerprint: 'topic:a', writeScore: 80, studyScore: 85, breakingScore: 90, opportunityScore: 82, laneEligibility: { write: true, study: true, breaking: true } },
    { id: 'z-copy', fingerprint: 'topic:a', writeScore: 70, studyScore: 70, breakingScore: 70, opportunityScore: 70, laneEligibility: { write: true, study: true, breaking: true } },
    { id: 'write-only', fingerprint: 'topic:write', writeScore: 95, studyScore: 100, breakingScore: 100, opportunityScore: 100, laneEligibility: { write: true, study: false, breaking: false } },
  ];
  const before = structuredClone(topics);

  const lanes = selectTopicLanes(topics, { writeLimit: 3, studyLimit: 2, breakingLimit: 2 });

  assert.deepEqual(topics, before);
  assert.deepEqual(lanes.write.map((item) => item.id), ['write-only', 'a', 'b']);
  assert.deepEqual(lanes.study.map((item) => item.id), ['a', 'b']);
  assert.deepEqual(lanes.breaking.map((item) => item.id), ['a', 'b']);
  assert.ok(lanes.write.some((item) => item.fingerprint === 'topic:a'));
  assert.ok(lanes.study.some((item) => item.fingerprint === 'topic:a'));
  assert.ok(lanes.breaking.some((item) => item.fingerprint === 'topic:a'));
});

test('selectTopicLanes excludes ignored and explicitly negative-feedback topics', () => {
  // Minimal compatibility contract: ignored may be a boolean, a feedback action
  // string, or an object with `{ action: 'ignored' }` from persisted feedback.
  const eligible = (id, extra = {}) => ({
    id,
    fingerprint: `topic:${id}`,
    writeScore: 90,
    studyScore: 90,
    breakingScore: 90,
    opportunityScore: 90,
    laneEligibility: { write: true, study: true, breaking: true },
    ...extra,
  });
  const lanes = selectTopicLanes([
    eligible('visible'),
    eligible('ignored-flag', { ignored: true }),
    eligible('ignored-string', { feedback: ['ignored'] }),
    eligible('ignored-object', { feedback: [{ action: 'ignored' }] }),
    eligible('negative', { feedbackAction: 'negative' }),
  ]);

  for (const lane of Object.values(lanes)) {
    assert.deepEqual(lane.map((item) => item.id), ['visible']);
  }
});

test('selectTopicLanes treats zero limits as empty and deduplicates either id or fingerprint', () => {
  const eligible = (id, fingerprint) => ({
    id,
    fingerprint,
    writeScore: 90,
    studyScore: 90,
    breakingScore: 90,
    opportunityScore: 90,
    laneEligibility: { write: true, study: true, breaking: true },
  });
  const topics = [
    eligible('same-id', 'topic:first'),
    eligible('same-id', 'topic:second'),
    eligible('other-id', 'topic:first'),
  ];

  const zero = selectTopicLanes(topics, { writeLimit: 0, studyLimit: 0, breakingLimit: 0 });
  assert.deepEqual(zero, { write: [], study: [], breaking: [] });

  const deduped = selectTopicLanes(topics);
  for (const lane of Object.values(deduped)) {
    assert.equal(lane.length, 1);
  }
});

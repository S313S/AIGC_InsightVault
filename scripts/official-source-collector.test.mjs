import assert from 'node:assert/strict';
import test from 'node:test';

import { collectOfficialFeedSignals } from '../server/sourceCollectors/officialFeeds.js';

const NOW = '2026-09-22T08:00:00.000Z';

test('collects RSS and Atom entries into bounded fact evidence', async () => {
  const rss = `<?xml version="1.0"?><rss><channel><item>
    <guid>release-1</guid><title><![CDATA[ GPT-6 launched ]]></title>
    <link>/news/gpt-6?utm_source=rss&amp;lang=en</link>
    <pubDate>Mon, 21 Sep 2026 09:00:00 GMT</pubDate>
    <description><![CDATA[<p>Now available with <b>API</b> access.</p><script>bad()</script>]]></description>
  </item></channel></rss>`;
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <id>tag:example.com,2026:gemini</id><title>Gemini update</title>
    <link rel="self" href="https://example.com/feed/item"/><link rel="alternate" href="https://example.com/posts/gemini?ref=feed"/>
    <updated>2026-09-21T10:00:00Z</updated><summary>API limits: 100 requests.</summary>
  </entry></feed>`;
  const bodies = new Map([
    ['https://example.com/feed.xml', rss],
    ['https://example.com/atom.xml', atom],
  ]);
  const fetchImpl = async (url) => new Response(bodies.get(String(url)), { status: 200 });

  const result = await collectOfficialFeedSignals({
    fetchImpl,
    now: NOW,
    sources: [
      { id: 'rss', name: 'RSS Lab', url: 'https://example.com/feed.xml' },
      { id: 'atom', name: 'Atom Lab', url: 'https://example.com/atom.xml' },
    ],
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.signals.length, 2);
  const rssSignal = result.signals.find((item) => item.sourceId === 'rss');
  assert.equal(rssSignal.platform, 'Official');
  assert.equal(rssSignal.sourceType, 'official');
  assert.equal(rssSignal.evidenceRole, 'fact');
  assert.equal(rssSignal.breakingEligible, true);
  assert.equal(rssSignal.sourceUrl, 'https://example.com/news/gpt-6?lang=en');
  assert.doesNotMatch(rssSignal.rawContent, /<|bad\(\)/u);
  const atomSignal = result.signals.find((item) => item.sourceId === 'atom');
  assert.equal(atomSignal.sourceUrl, 'https://example.com/posts/gemini');
  assert.match(atomSignal.rawContent, /100 requests/u);
  assert.equal(atomSignal.desc, atomSignal.rawContent);
  assert.equal(atomSignal.publishTime, atomSignal.publishedAt);
  assert.deepEqual(atomSignal.metrics, { likes: 0, bookmarks: 0, comments: 0, shares: 0, views: 0 });
});

test('parses RSS 1.0 RDF and namespaced encoded content', async () => {
  const rdf = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="urn:rdf" xmlns:content="urn:content">
    <item><title>RDF update</title><link>https://example.com/rdf</link>
      <dc:date xmlns:dc="urn:dc">2026-09-21T12:00:00Z</dc:date>
      <content:encoded><![CDATA[<p>Detailed <b>release</b> notes.</p>]]></content:encoded>
    </item></rdf:RDF>`;
  const result = await collectOfficialFeedSignals({
    fetchImpl: async () => new Response(rdf),
    now: NOW,
    sources: [{ id: 'rdf', name: 'RDF Lab', url: 'https://example.com/rdf.xml' }],
  });
  assert.equal(result.errors.length, 0);
  assert.equal(result.signals[0].rawContent, 'Detailed release notes.');
  assert.equal(result.signals[0].breakingEligible, true);
});

test('keeps missing, invalid, and future dates review-only and stable', async () => {
  const xml = `<rss><channel>
    <item><guid>a</guid><title>No date</title><link>https://example.com/a</link></item>
    <item><guid>b</guid><title>Bad date</title><link>https://example.com/b</link><pubDate>2026-02-30T12:00:00Z</pubDate></item>
    <item><guid>c</guid><title>Future</title><link>https://example.com/c</link><pubDate>2027-01-01T00:00:00Z</pubDate></item>
  </channel></rss>`;
  const fetchImpl = async () => new Response(xml, { status: 200 });
  const first = await collectOfficialFeedSignals({ fetchImpl, now: NOW, sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss' }] });
  const second = await collectOfficialFeedSignals({ fetchImpl, now: '2026-09-22T09:00:00Z', sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss' }] });
  assert.equal(first.signals.length, 3);
  assert.ok(first.signals.every((item) => item.reviewOnly && !item.breakingEligible));
  assert.deepEqual(first.signals.map((item) => item.id), second.signals.map((item) => item.id));
});

test('treats even slightly future publication timestamps as review-only', async () => {
  const xml = `<rss><channel><item><guid>future</guid><title>Future</title><link>https://example.com/future</link><pubDate>2026-09-22T08:03:00Z</pubDate></item></channel></rss>`;
  const result = await collectOfficialFeedSignals({ fetchImpl: async () => new Response(xml), now: NOW, sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss' }] });
  assert.equal(result.signals[0].breakingEligible, false);
  assert.equal(result.signals[0].reviewOnly, true);
});

test('times out even when an injected fetch ignores AbortSignal', async () => {
  const never = new Promise(() => {});
  const result = await Promise.race([
    collectOfficialFeedSignals({
      fetchImpl: () => never,
      now: NOW,
      sources: [{ id: 'stuck', name: 'Stuck', url: 'https://example.com/stuck' }],
      limits: { timeoutMs: 10 },
    }),
    new Promise((resolve) => setTimeout(() => resolve('still_pending'), 80)),
  ]);
  assert.notEqual(result, 'still_pending');
  assert.equal(result.errors[0].errorKind, 'timeout');
});

test('times out and cancels a response body that never finishes', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<rss><channel>'));
    },
    cancel() {
      cancelled = true;
    },
  });
  const result = await collectOfficialFeedSignals({
    fetchImpl: async () => new Response(body),
    now: NOW,
    sources: [{ id: 'slow', name: 'Slow', url: 'https://example.com/slow' }],
    limits: { timeoutMs: 10 },
  });
  assert.equal(result.errors[0].errorKind, 'timeout');
  assert.equal(cancelled, true);
});

test('keeps fallback identities distinct and deduplicates repeated evidence', async () => {
  const xml = `<rss><channel>
    <item><title>Alpha</title><link>javascript:a</link><pubDate>2026-09-21T01:00:00Z</pubDate></item>
    <item><title>Beta</title><link>javascript:b</link><pubDate>2026-09-21T02:00:00Z</pubDate></item>
    <item><title>Alpha</title><link>javascript:a</link><pubDate>2026-09-21T01:00:00Z</pubDate></item>
  </channel></rss>`;
  const result = await collectOfficialFeedSignals({ fetchImpl: async () => new Response(xml), now: NOW, sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss' }] });
  assert.equal(result.signals.length, 2);
  assert.equal(new Set(result.signals.map((item) => item.id)).size, 2);
});

test('rejects insecure/private feed sources and untrusted article hosts', async () => {
  let calls = 0;
  const ignored = await collectOfficialFeedSignals({
    fetchImpl: async () => { calls += 1; return new Response(''); },
    now: NOW,
    sources: [
      { id: 'http', name: 'HTTP', url: 'http://example.com/rss' },
      { id: 'loopback', name: 'Loopback', url: 'https://127.0.0.1/rss' },
    ],
  });
  assert.equal(calls, 0);
  assert.deepEqual(ignored.signals, []);

  const xml = `<rss><channel><item><guid>x</guid><title>External</title><link>https://attacker.example/post</link><pubDate>2026-09-21T00:00:00Z</pubDate></item></channel></rss>`;
  const result = await collectOfficialFeedSignals({ fetchImpl: async () => new Response(xml), now: NOW, sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss' }] });
  assert.equal(result.signals[0].sourceUrl, 'https://example.com/rss');
});

test('filters old dated entries but retains unknown dates for review', async () => {
  const xml = `<rss><channel>
    <item><guid>old</guid><title>Old</title><link>https://example.com/old</link><pubDate>2026-01-01T00:00:00Z</pubDate></item>
    <item><guid>unknown</guid><title>Unknown</title><link>https://example.com/unknown</link></item>
  </channel></rss>`;
  const result = await collectOfficialFeedSignals({
    fetchImpl: async () => new Response(xml),
    now: NOW,
    sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss', recentDays: 30 }],
  });
  assert.deepEqual(result.signals.map((item) => item.title), ['Unknown']);
  assert.equal(result.signals[0].reviewOnly, true);
});

test('rejects unsafe item links and isolates per-source failures', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('bad-http')) return new Response('no', { status: 503 });
    if (String(url).includes('bad-xml')) return new Response('<rss><broken>');
    return new Response(`<rss><channel><item><guid>x</guid><title>Safe fallback</title><link>javascript:alert(1)</link><pubDate>2026-09-21T00:00:00Z</pubDate></item></channel></rss>`);
  };
  const result = await collectOfficialFeedSignals({
    fetchImpl,
    now: NOW,
    sources: [
      { id: 'ok', name: 'OK', url: 'https://example.com/good' },
      { id: 'http', name: 'HTTP', url: 'https://example.com/bad-http' },
      { id: 'xml', name: 'XML', url: 'https://example.com/bad-xml' },
    ],
  });
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].sourceUrl, 'https://example.com/good');
  assert.deepEqual(result.errors.map((error) => error.sourceId).sort(), ['http', 'xml']);
  assert.ok(result.errors.every((error) => !('detail' in error)));
});

test('caps entries, content, and response size', async () => {
  const items = Array.from({ length: 5 }, (_, index) => `<item><guid>${index}</guid><title>Item ${index}</title><link>https://example.com/${index}</link><pubDate>2026-09-21T00:00:00Z</pubDate><description>${'x'.repeat(200)}</description></item>`).join('');
  const ok = await collectOfficialFeedSignals({
    fetchImpl: async () => new Response(`<rss><channel>${items}</channel></rss>`),
    now: NOW,
    sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss', maxEntries: 2 }],
    limits: { maxContentChars: 40, maxResponseChars: 10_000 },
  });
  assert.equal(ok.signals.length, 2);
  assert.ok(ok.signals.every((item) => item.rawContent.length <= 40));

  const tooLarge = await collectOfficialFeedSignals({
    fetchImpl: async () => new Response('x'.repeat(101)),
    now: NOW,
    sources: [{ id: 'large', name: 'Large', url: 'https://example.com/large' }],
    limits: { maxResponseChars: 100 },
  });
  assert.equal(tooLarge.signals.length, 0);
  assert.equal(tooLarge.errors[0].errorKind, 'response_too_large');
});

test('does not reintroduce entity-encoded script markup into text evidence', async () => {
  const xml = `<rss><channel><item><guid>encoded</guid><title>Encoded</title><link>https://example.com/encoded</link><pubDate>2026-09-21T00:00:00Z</pubDate><description>&amp;lt;script&amp;gt;bad()&amp;lt;/script&amp;gt; Safe notes</description></item></channel></rss>`;
  const result = await collectOfficialFeedSignals({ fetchImpl: async () => new Response(xml), now: NOW, sources: [{ id: 'lab', name: 'Lab', url: 'https://example.com/rss' }] });
  assert.doesNotMatch(result.signals[0].rawContent, /script|bad\(\)|[<>]/iu);
  assert.match(result.signals[0].rawContent, /Safe notes/u);
});

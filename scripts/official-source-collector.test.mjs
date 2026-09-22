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

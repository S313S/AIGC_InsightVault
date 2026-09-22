import { XMLParser, XMLValidator } from 'fast-xml-parser';

import {
  DEFAULT_OFFICIAL_FEEDS,
  normalizeOfficialSources,
  resolveSourceLimits,
} from '../topicSources.js';
import {
  asArray,
  canonicalHttpUrl,
  classifyPublicationDate,
  cleanText,
  fetchBoundedTextWithTimeout,
  safeErrorKind,
  scalarText,
  stableHash,
} from './collectorUtils.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
});

const entryLink = (entry) => {
  const links = asArray(entry?.link);
  const alternate = links.find((link) => typeof link === 'object' && (!link['@_rel'] || link['@_rel'] === 'alternate'));
  const chosen = alternate || links[0];
  return typeof chosen === 'object' ? scalarText(chosen['@_href'] || chosen) : scalarText(chosen);
};

const extractEntries = (document) => {
  const channel = asArray(document?.rss?.channel)[0];
  if (channel) return asArray(channel.item).map((entry) => ({ entry, format: 'rss' }));
  if (document?.feed) return asArray(document.feed.entry).map((entry) => ({ entry, format: 'atom' }));
  if (document?.RDF) return asArray(document.RDF.item).map((entry) => ({ entry, format: 'rdf' }));
  throw Object.assign(new Error('unsupported_feed'), { kind: 'invalid_xml' });
};

const normalizeEntry = ({ entry, format }, source, nowMs, limits) => {
  const title = cleanText(entry?.title, 300) || 'Untitled official update';
  const linkValue = format === 'atom' ? entryLink(entry) : scalarText(entry?.link);
  const articleUrl = canonicalHttpUrl(linkValue, source.url, (url) => (
    url.protocol === 'https:' && url.port === '' && source.allowedHosts.includes(url.hostname.toLowerCase())
  ));
  const sourceUrl = articleUrl || source.url;
  const rawDate = scalarText(entry?.pubDate || entry?.published || entry?.updated || entry?.date);
  const publication = classifyPublicationDate(rawDate, nowMs);
  if (publication.timestamp !== null && nowMs - publication.timestamp > source.recentDays * 86_400_000) return null;
  const contentValue = entry?.description || entry?.encoded || entry?.content || entry?.summary;
  const content = cleanText(scalarText(contentValue), limits.maxContentChars);
  const externalIdentity = cleanText(entry?.guid || entry?.id, 500) || articleUrl || `${title}\n${rawDate}`;
  const hash = stableHash(`${source.id}\n${externalIdentity}`);

  return {
    id: `official-${hash.slice(0, 24)}`,
    sourceId: source.id,
    evidenceKey: `official:${hash}`,
    title,
    rawContent: content,
    desc: content,
    summary: content,
    sourceUrl,
    platform: 'Official',
    author: source.name,
    date: publication.publishedAt || rawDate || '',
    publishedAt: publication.publishedAt,
    publishTime: publication.publishedAt || '',
    breakingEligible: publication.breakingEligible,
    reviewOnly: publication.reviewOnly,
    sourceType: 'official',
    evidenceRole: 'fact',
    metrics: { likes: 0, bookmarks: 0, comments: 0, shares: 0, views: 0 },
    coverImage: '',
    images: [],
    tags: ['official-source'],
    isTrending: true,
  };
};

const collectSource = async (fetchImpl, source, nowMs, limits) => {
  const { response, text: xml } = await fetchBoundedTextWithTimeout(fetchImpl, source.url, {
    headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' },
  }, limits.timeoutMs, limits.maxResponseChars);
  if (!response?.ok) {
    const error = new Error('http_error');
    error.kind = 'http_error';
    error.status = Number(response?.status) || null;
    throw error;
  }
  if (response.url) {
    const finalUrl = canonicalHttpUrl(response.url, source.url, (url) => (
      url.protocol === 'https:' && url.port === '' && source.allowedHosts.includes(url.hostname.toLowerCase())
    ));
    if (!finalUrl) throw Object.assign(new Error('untrusted_redirect'), { kind: 'untrusted_redirect' });
  }
  if (XMLValidator.validate(xml) !== true) throw Object.assign(new Error('invalid_xml'), { kind: 'invalid_xml' });
  const entries = extractEntries(parser.parse(xml));
  return entries.slice(0, source.maxEntries).map((entry) => normalizeEntry(entry, source, nowMs, limits)).filter(Boolean);
};

export const collectOfficialFeedSignals = async ({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  sources = DEFAULT_OFFICIAL_FEEDS,
  limits: limitOverrides = {},
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const limits = resolveSourceLimits(limitOverrides);
  const normalizedSources = normalizeOfficialSources(sources, limits);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a valid date');

  const results = await Promise.all(normalizedSources.map(async (source) => {
    try {
      return { signals: await collectSource(fetchImpl, source, nowMs, limits), error: null };
    } catch (error) {
      return {
        signals: [],
        error: {
          sourceId: source.id,
          errorKind: safeErrorKind(error),
          ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
        },
      };
    }
  }));

  const uniqueSignals = new Map();
  for (const signal of results.flatMap((result) => result.signals)) {
    if (!uniqueSignals.has(signal.evidenceKey)) uniqueSignals.set(signal.evidenceKey, signal);
  }
  return {
    signals: [...uniqueSignals.values()].sort((a, b) => a.id.localeCompare(b.id)),
    errors: results.flatMap((result) => result.error ? [result.error] : []),
  };
};

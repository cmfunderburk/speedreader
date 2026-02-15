import type { Feed, Article } from '../types';
import { generateId } from './storage';
import { measureTextMetrics } from './textMetrics';

interface FeedItem {
  title: string;
  content: string;
  link: string;
  pubDate?: string;
}

interface ParsedFeed {
  title: string;
  items: FeedItem[];
}

/**
 * Parse RSS/Atom feed XML into structured data.
 */
function parseFeedXML(xml: string): ParsedFeed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid feed XML');
  }

  // Determine feed type and extract data
  const isAtom = doc.querySelector('feed') !== null;

  if (isAtom) {
    return parseAtomFeed(doc);
  } else {
    return parseRSSFeed(doc);
  }
}

function parseRSSFeed(doc: Document): ParsedFeed {
  const channel = doc.querySelector('channel');
  const title = channel?.querySelector('title')?.textContent || 'Unknown Feed';

  const items: FeedItem[] = [];
  const itemElements = doc.querySelectorAll('item');

  itemElements.forEach(item => {
    const itemTitle = item.querySelector('title')?.textContent || 'Untitled';
    const description = item.querySelector('description')?.textContent || '';
    const contentEncoded = item.querySelector('content\\:encoded, encoded')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || undefined;

    items.push({
      title: itemTitle,
      content: contentEncoded || description,
      link,
      pubDate,
    });
  });

  return { title, items };
}

function parseAtomFeed(doc: Document): ParsedFeed {
  const feed = doc.querySelector('feed');
  const title = feed?.querySelector('title')?.textContent || 'Unknown Feed';

  const items: FeedItem[] = [];
  const entryElements = doc.querySelectorAll('entry');

  entryElements.forEach(entry => {
    const entryTitle = entry.querySelector('title')?.textContent || 'Untitled';
    const content = entry.querySelector('content')?.textContent || '';
    const summary = entry.querySelector('summary')?.textContent || '';
    const linkEl = entry.querySelector('link[rel="alternate"], link');
    const link = linkEl?.getAttribute('href') || '';
    const published = entry.querySelector('published')?.textContent || undefined;

    items.push({
      title: entryTitle,
      content: content || summary,
      link,
      pubDate: published,
    });
  });

  return { title, items };
}

/**
 * Strip HTML tags from content.
 */
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

function parseFeedTimestamp(pubDate: string | undefined, fallback: number): number {
  if (!pubDate) return fallback;
  const parsed = Date.parse(pubDate);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Fetch and parse a feed URL.
 */
export async function fetchFeed(url: string): Promise<{ feed: Feed; articles: Article[] }> {
  // Use CORS proxy
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.statusText}`);
  }

  const xml = await response.text();
  const parsed = parseFeedXML(xml);

  const feed: Feed = {
    id: generateId(),
    url,
    title: parsed.title,
    lastFetched: Date.now(),
  };

  const source = new URL(url).hostname.replace('www.', '');
  const now = Date.now();

  const articles: Article[] = parsed.items.map(item => {
    const content = stripHtml(item.content);
    const metrics = measureTextMetrics(content);
    return {
      id: generateId(),
      title: item.title,
      content,
      source,
      url: item.link,
      addedAt: parseFeedTimestamp(item.pubDate, now),
      readPosition: 0,
      isRead: false,
      ...metrics,
    };
  });

  return { feed, articles };
}

import type { Article } from '../types';
import type { ComprehensionExamPreset } from '../types';

const PRESET_CONTEXT_BUDGET_BY_PRESET: Record<ComprehensionExamPreset, number> = {
  quiz: 5200,
  midterm: 7600,
  final: 9800,
} as const;

const MIN_SOURCE_CONTEXT_BUDGET = 700;
const MIN_EXCERPT_FOR_PACKING = 120;

export interface SourcePacket {
  articleId: string;
  title: string;
  group?: string;
  excerpt: string;
}

export interface ComprehensionExamContext {
  preset: ComprehensionExamPreset;
  totalBudget: number;
  packets: SourcePacket[];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trimToBudget(text: string, budget: number): string {
  const normalized = normalizeText(text);
  if (normalized.length <= budget) return normalized;
  if (budget <= 0) return '';
  const cut = normalized.slice(0, Math.max(MIN_EXCERPT_FOR_PACKING, budget));
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace <= 0) return cut;
  return cut.slice(0, lastSpace).trim();
}

function buildSourcePacket(article: Article, budget: number, sequence: number): SourcePacket {
  const headerPrefix = `${sequence}. ${article.title}`;
  const headerAllowance = headerPrefix.length + 24;
  const remainingBudget = Math.max(0, budget - headerAllowance);
  return {
    articleId: article.id,
    title: article.title,
    group: article.group,
    excerpt: trimToBudget(article.content, remainingBudget),
  };
}

export function buildComprehensionExamContext(
  selectedArticles: Article[],
  preset: ComprehensionExamPreset
): ComprehensionExamContext {
  const totalBudget = PRESET_CONTEXT_BUDGET_BY_PRESET[preset];
  const sourceCount = selectedArticles.length;
  const baseBudgetPerSource = Math.max(
    MIN_SOURCE_CONTEXT_BUDGET,
    Math.floor(totalBudget / Math.max(1, sourceCount))
  );

  const packets: SourcePacket[] = selectedArticles.map((article, index) => {
    return buildSourcePacket(article, baseBudgetPerSource, index + 1);
  });

  return {
    preset,
    totalBudget,
    packets,
  };
}

export function getComprehensionExamSourceIds(context: ComprehensionExamContext): string[] {
  return context.packets.map((packet) => packet.articleId);
}

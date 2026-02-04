// Display mode: how text is presented
export type DisplayMode = 'rsvp' | 'saccade' | 'prediction' | 'recall';

// Token/chunk mode: how text is chunked
export type TokenMode = 'word' | 'phrase' | 'clause' | 'custom';

// Character width targets for each mode (excludes word which shows one word at a time)
export const MODE_CHAR_WIDTHS: Record<Exclude<TokenMode, 'word'>, number> = {
  phrase: 10,
  clause: 40,
  custom: 30, // default for custom, overridden by user setting
};

export type PredictionLineWidth = 'narrow' | 'medium' | 'wide';

export const PREDICTION_LINE_WIDTHS: Record<PredictionLineWidth, number> = {
  narrow: 50,
  medium: 65,
  wide: 85,
};

export type SaccadeLineType = 'body' | 'heading' | 'blank';

export interface SaccadeLine {
  text: string;
  type: SaccadeLineType;
  level?: number;  // 1-6 for headings
}

export interface SaccadePage {
  lines: SaccadeLine[];
  lineChunks: Chunk[][];  // lineChunks[lineIndex] = chunks for that line
}

export interface SaccadePosition {
  pageIndex: number;
  lineIndex: number;
  startChar: number;
  endChar: number;
}

export interface Chunk {
  text: string;
  wordCount: number;
  orpIndex: number; // character index of the ORP within the chunk
  saccade?: SaccadePosition; // present only in saccade mode
}

export interface Article {
  id: string;
  title: string;
  content: string;
  source: string;
  url?: string;
  addedAt: number;
  readPosition: number; // chunk index for RSVP/saccade
  predictionPosition?: number; // word index for prediction mode
  isRead: boolean;
}

export interface PredictionResult {
  predicted: string;      // what user typed
  actual: string;         // correct word
  loss: number;           // 0-1 normalized Levenshtein
  timestamp: number;      // for pacing analysis
  wordIndex: number;      // position in text
}

export interface PredictionStats {
  totalWords: number;
  exactMatches: number;
  averageLoss: number;
  history: PredictionResult[];  // full history for review/analysis
}

export interface Feed {
  id: string;
  url: string;
  title: string;
  lastFetched: number;
}

export interface ReaderState {
  currentArticle: Article | null;
  chunks: Chunk[];
  currentChunkIndex: number;
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  customCharWidth: number;
}

export interface AppState {
  articles: Article[];
  feeds: Feed[];
  settings: {
    defaultWpm: number;
    defaultMode: TokenMode;
    customCharWidth: number;
  };
}

// Display mode: how text is presented
export type DisplayMode = 'rsvp' | 'saccade' | 'prediction' | 'recall' | 'training';

// Token/chunk mode: how text is chunked
export type TokenMode = 'word' | 'custom';

export type RampCurve = 'linear' | 'logarithmic';

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
  charCount?: number;
  wordCount?: number;
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
}

export interface TrainingParagraphResult {
  paragraphIndex: number;
  score: number;       // 0-1 (1 = perfect)
  wpm: number;         // WPM used for this paragraph
  repeated: boolean;
  wordCount: number;
  exactMatches: number;
}

export interface Feed {
  id: string;
  url: string;
  title: string;
  lastFetched: number;
}
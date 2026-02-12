// Activity: top-level grouping of display modes
export type Activity = 'paced-reading' | 'active-recall' | 'training';

// Display mode: how text is presented
export type DisplayMode = 'rsvp' | 'saccade' | 'prediction' | 'recall' | 'training';

// Token/chunk mode: how text is chunked
export type TokenMode = 'word' | 'custom';

export type RampCurve = 'linear' | 'logarithmic';

export type PredictionLineWidth = 'narrow' | 'medium' | 'wide';
export type PredictionPreviewMode = 'sentences' | 'unlimited';
export type ThemePreference = 'dark' | 'light' | 'system';
export type SaccadePacerStyle = 'sweep' | 'focus';
export type SaccadeFocusTarget = 'fixation' | 'word';

export const PREDICTION_LINE_WIDTHS: Record<PredictionLineWidth, number> = {
  narrow: 50,
  medium: 65,
  wide: 85,
};

export type SaccadeLineType = 'body' | 'heading' | 'blank' | 'figure';

export interface SaccadeLine {
  text: string;
  type: SaccadeLineType;
  level?: number;  // 1-6 for headings
  figureId?: string;
  figureSrc?: string;
  figureCaption?: string;
  isEquation?: boolean;
  equationIndex?: number;
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
  sourcePath?: string;
  assetBaseUrl?: string;
  url?: string;
  addedAt: number;
  readPosition: number; // chunk index for RSVP/saccade
  predictionPosition?: number; // word index for prediction mode
  isRead: boolean;
  charCount?: number;
  wordCount?: number;
  group?: string;
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
  knownWords: number;
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

export type PassageCaptureKind = 'line' | 'sentence' | 'paragraph' | 'last-lines';
export type PassageReviewState = 'new' | 'hard' | 'easy' | 'done';
export type PassageReviewMode = 'recall' | 'prediction';

export interface Passage {
  id: string;
  articleId: string;
  articleTitle: string;
  sourceMode: DisplayMode;
  captureKind: PassageCaptureKind;
  text: string;
  createdAt: number;
  updatedAt: number;
  sourceChunkIndex: number;
  sourcePageIndex?: number;
  sourceLineIndex?: number;
  reviewState: PassageReviewState;
  reviewCount: number;
  lastReviewedAt?: number;
  lastReviewMode?: PassageReviewMode;
}

export interface SessionSnapshot {
  reading?: {
    articleId: string;
    chunkIndex: number;
    displayMode: DisplayMode;
  };
  training?: {
    passageId: string;
    mode: PassageReviewMode;
    startedAt: number;
  };
  lastTransition?: 'read-to-recall' | 'read-to-prediction' | 'return-to-reading';
  updatedAt: number;
}

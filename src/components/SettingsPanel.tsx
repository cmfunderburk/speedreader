import { useEffect, useMemo, useState } from 'react';
import type { ComprehensionApiKeyStorageMode, Settings } from '../lib/storage';
import { COMPREHENSION_GEMINI_MODELS } from '../types';
import type {
  ComprehensionGeminiModel,
  PredictionLineWidth,
  PredictionPreviewMode,
  RampCurve,
  ThemePreference,
} from '../types';
import { getEffectiveWpm } from '../lib/rsvp';

interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  comprehensionApiKey: string;
  comprehensionApiKeyStorageMode: ComprehensionApiKeyStorageMode;
  onComprehensionApiKeyChange: (apiKey: string) => Promise<void>;
  onClose: () => void;
}

const RAMP_CURVE_OPTIONS: { value: RampCurve; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'logarithmic', label: 'Log' },
];

const LINE_WIDTH_OPTIONS: { value: PredictionLineWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
];

const PREVIEW_MODE_OPTIONS: { value: PredictionPreviewMode; label: string }[] = [
  { value: 'sentences', label: 'Next N Sentences' },
  { value: 'unlimited', label: 'Unlimited' },
];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const GEMINI_MODEL_LABELS: Record<ComprehensionGeminiModel, string> = {
  'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
  'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
};

const GEMINI_MODEL_OPTIONS = COMPREHENSION_GEMINI_MODELS.map((model) => ({
  value: model,
  label: GEMINI_MODEL_LABELS[model],
}));

function RampCurveGraph({ settings }: { settings: Settings }) {
  const { defaultWpm, rampCurve, rampStartPercent, rampRate, rampInterval } = settings;

  const { points, durationS } = useMemo(() => {
    const startWpm = defaultWpm * (rampStartPercent / 100);
    // Compute a sensible time range
    let dur: number;
    if (rampCurve === 'linear') {
      const gap = defaultWpm - startWpm;
      const ratePerSec = rampRate / rampInterval;
      dur = ratePerSec > 0 ? gap / ratePerSec : 120;
    } else {
      dur = rampInterval * 4; // ~94% of target at 4 half-lives
    }
    dur = Math.max(30, Math.min(dur * 1.1, 600));

    const steps = 80;
    const pts: { t: number; wpm: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * dur;
      const wpm = getEffectiveWpm(defaultWpm, t * 1000, rampRate, rampInterval, rampCurve, rampStartPercent);
      pts.push({ t, wpm });
    }
    return { points: pts, durationS: dur };
  }, [defaultWpm, rampCurve, rampStartPercent, rampRate, rampInterval]);

  const startWpm = defaultWpm * (rampStartPercent / 100);
  const yMin = Math.floor(startWpm / 50) * 50;
  const yMax = defaultWpm;
  const yRange = yMax - yMin || 1;

  // SVG layout
  const W = 260, H = 100;
  const pad = { top: 8, right: 8, bottom: 20, left: 36 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const toX = (t: number) => pad.left + (t / durationS) * plotW;
  const toY = (wpm: number) => pad.top + plotH - ((wpm - yMin) / yRange) * plotH;

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(p.t).toFixed(1)},${toY(p.wpm).toFixed(1)}`
  ).join(' ');

  const formatDuration = (s: number) => s >= 60 ? `${Math.round(s / 60)}m` : `${Math.round(s)}s`;

  return (
    <svg width={W} height={H} className="ramp-curve-graph">
      {/* Grid line at target */}
      <line
        x1={pad.left} y1={toY(yMax)} x2={W - pad.right} y2={toY(yMax)}
        stroke="var(--text-muted)" strokeDasharray="4 3" strokeWidth={1}
      />
      {/* Grid line at start */}
      <line
        x1={pad.left} y1={toY(startWpm)} x2={W - pad.right} y2={toY(startWpm)}
        stroke="var(--text-muted)" strokeDasharray="2 3" strokeWidth={1}
      />
      {/* Curve */}
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {/* Y-axis labels */}
      <text x={pad.left - 4} y={toY(yMax) + 4} textAnchor="end" fill="var(--text-secondary)" fontSize={9}>
        {yMax}
      </text>
      <text x={pad.left - 4} y={toY(startWpm) + 4} textAnchor="end" fill="var(--text-secondary)" fontSize={9}>
        {Math.round(startWpm)}
      </text>
      {/* X-axis labels */}
      <text x={pad.left} y={H - 2} textAnchor="start" fill="var(--text-secondary)" fontSize={9}>
        0s
      </text>
      <text x={W - pad.right} y={H - 2} textAnchor="end" fill="var(--text-secondary)" fontSize={9}>
        {formatDuration(durationS)}
      </text>
    </svg>
  );
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  comprehensionApiKey,
  comprehensionApiKeyStorageMode,
  onComprehensionApiKeyChange,
  onClose,
}: SettingsPanelProps) {
  const update = (partial: Partial<Settings>) => {
    onSettingsChange({ ...settings, ...partial });
  };
  const [apiKeyDraft, setApiKeyDraft] = useState(comprehensionApiKey);
  const [apiKeyNotice, setApiKeyNotice] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);

  const apiKeyStorageHint = comprehensionApiKeyStorageMode === 'secure'
    ? 'Stored in OS-backed secure storage (Electron).'
    : comprehensionApiKeyStorageMode === 'local'
      ? 'Stored in browser local storage.'
      : 'Secure storage is unavailable in this Electron session; using local app storage fallback.';

  useEffect(() => {
    setApiKeyDraft(comprehensionApiKey);
    setApiKeyNotice(null);
    setApiKeyError(null);
  }, [comprehensionApiKey]);

  const applyApiKey = async (value: string): Promise<void> => {
    setIsSavingApiKey(true);
    setApiKeyNotice(null);
    setApiKeyError(null);
    try {
      await onComprehensionApiKeyChange(value);
      setApiKeyNotice(value.trim() ? 'API key saved.' : 'API key cleared.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save API key.';
      setApiKeyError(message);
    } finally {
      setIsSavingApiKey(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Display Settings</h2>
        <button className="btn-close" onClick={onClose}>Close</button>
      </div>

      <div className="settings-sections">
        <div className="settings-section">
          <h3>Theme</h3>
          <div className="settings-presets">
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`settings-preset${settings.themePreference === opt.value ? ' settings-preset-active' : ''}`}
                onClick={() => update({ themePreference: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Font Sizes</h3>

          <div className="settings-row">
            <span className="settings-label">RSVP</span>
            <input
              className="settings-slider"
              type="range"
              min="1"
              max="5"
              step="0.25"
              value={settings.rsvpFontSize}
              onChange={e => update({ rsvpFontSize: parseFloat(e.target.value) })}
            />
            <span className="settings-value">{settings.rsvpFontSize.toFixed(2)} rem</span>
          </div>

          <div className="settings-row">
            <span className="settings-label">Saccade</span>
            <input
              className="settings-slider"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.saccadeFontSize}
              onChange={e => update({ saccadeFontSize: parseFloat(e.target.value) })}
            />
            <span className="settings-value">{settings.saccadeFontSize.toFixed(2)} rem</span>
          </div>

          <div className="settings-row">
            <span className="settings-label">Prediction</span>
            <input
              className="settings-slider"
              type="range"
              min="0.75"
              max="2.5"
              step="0.1"
              value={settings.predictionFontSize}
              onChange={e => update({ predictionFontSize: parseFloat(e.target.value) })}
            />
            <span className="settings-value">{settings.predictionFontSize.toFixed(2)} rem</span>
          </div>
        </div>

        <div className="settings-section">
          <h3>WPM Ramp</h3>

          <div className="settings-row">
            <span className="settings-label">Curve</span>
            <div className="settings-presets">
              {RAMP_CURVE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`settings-preset${settings.rampCurve === opt.value ? ' settings-preset-active' : ''}`}
                  onClick={() => update({ rampCurve: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">Start</span>
            <input
              className="settings-slider"
              type="range"
              min="10"
              max="90"
              step="5"
              value={settings.rampStartPercent}
              onChange={e => update({ rampStartPercent: parseInt(e.target.value) })}
            />
            <span className="settings-value">{settings.rampStartPercent}%</span>
          </div>

          {settings.rampCurve === 'linear' && (
            <div className="settings-row">
              <span className="settings-label">Rate</span>
              <input
                className="settings-slider"
                type="range"
                min="5"
                max="100"
                step="5"
                value={settings.rampRate}
                onChange={e => update({ rampRate: parseInt(e.target.value) })}
              />
              <span className="settings-value">+{settings.rampRate} WPM</span>
            </div>
          )}

          <div className="settings-row">
            <span className="settings-label">{settings.rampCurve === 'logarithmic' ? 'Half-life' : 'Interval'}</span>
            <input
              className="settings-slider"
              type="range"
              min="5"
              max="240"
              step="5"
              value={settings.rampInterval}
              onChange={e => update({ rampInterval: parseInt(e.target.value) })}
            />
            <span className="settings-value">{settings.rampInterval}s</span>
          </div>

          <RampCurveGraph settings={settings} />
        </div>

        <div className="settings-section">
          <h3>Prediction Preview</h3>

          <div className="settings-row">
            <span className="settings-label">Tab Preview</span>
            <div className="settings-presets">
              {PREVIEW_MODE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`settings-preset${settings.predictionPreviewMode === opt.value ? ' settings-preset-active' : ''}`}
                  onClick={() => update({ predictionPreviewMode: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {settings.predictionPreviewMode === 'sentences' && (
            <div className="settings-row">
              <span className="settings-label">Sentence Count</span>
              <input
                className="settings-slider"
                type="range"
                min="1"
                max="10"
                step="1"
                value={settings.predictionPreviewSentenceCount}
                onChange={e => update({ predictionPreviewSentenceCount: parseInt(e.target.value) })}
              />
              <span className="settings-value">{settings.predictionPreviewSentenceCount}</span>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Prediction Line Width</h3>
          <div className="settings-presets">
            {LINE_WIDTH_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`settings-preset${settings.predictionLineWidth === opt.value ? ' settings-preset-active' : ''}`}
                onClick={() => update({ predictionLineWidth: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Comprehension Check API Key</h3>
          <div className="settings-row">
            <span className="settings-label">Model</span>
            <div className="settings-presets settings-presets-wrap">
              {GEMINI_MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`settings-preset${settings.comprehensionGeminiModel === opt.value ? ' settings-preset-active' : ''}`}
                  onClick={() => update({ comprehensionGeminiModel: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="settings-note">
            Required for generating/scoring comprehension checks. Other reading features do not require this key.
          </p>
          <p className="settings-note">{apiKeyStorageHint}</p>
          {apiKeyNotice && <p className="settings-success">{apiKeyNotice}</p>}
          {apiKeyError && <p className="settings-error">{apiKeyError}</p>}
          <div className="settings-row settings-row-column">
            <input
              className="settings-input"
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder="Paste API key"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="settings-inline-actions">
              <button
                className="settings-preset"
                onClick={() => void applyApiKey(apiKeyDraft)}
                disabled={isSavingApiKey}
              >
                {isSavingApiKey ? 'Saving...' : 'Save Key'}
              </button>
              <button
                className="settings-preset"
                onClick={() => {
                  setApiKeyDraft('');
                  void applyApiKey('');
                }}
                disabled={isSavingApiKey}
              >
                Clear Key
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

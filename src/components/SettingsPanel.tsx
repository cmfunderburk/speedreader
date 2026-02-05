import type { Settings } from '../lib/storage';
import type { PredictionLineWidth, RampCurve } from '../types';

interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
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

export function SettingsPanel({ settings, onSettingsChange, onClose }: SettingsPanelProps) {
  const update = (partial: Partial<Settings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Display Settings</h2>
        <button className="btn-close" onClick={onClose}>Close</button>
      </div>

      <div className="settings-sections">
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
              max="120"
              step="5"
              value={settings.rampInterval}
              onChange={e => update({ rampInterval: parseInt(e.target.value) })}
            />
            <span className="settings-value">{settings.rampInterval}s</span>
          </div>
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
      </div>
    </div>
  );
}

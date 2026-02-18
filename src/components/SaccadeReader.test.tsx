import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { SaccadeLine } from '../types';
import { SaccadeLineComponent } from './SaccadeReader';
import type { SaccadeLineProps } from './SaccadeReader';

function renderLine(line: SaccadeLine, overrides: Partial<SaccadeLineProps> = {}) {
  return render(
    <SaccadeLineComponent
      line={line}
      lineIndex={0}
      isActiveLine
      isPlaying={false}
      isFutureLine={false}
      showPacer
      wpm={300}
      saccadePacerStyle="sweep"
      {...overrides}
    />
  );
}

describe('SaccadeLineComponent', () => {
  it('centers sweep start for heading lines', () => {
    const headingText = 'Centered heading';
    const { container } = renderLine({ text: headingText, type: 'heading' });
    const sweep = container.querySelector('.saccade-sweep') as HTMLSpanElement | null;
    expect(sweep).not.toBeNull();
    expect(sweep?.style.left).toBe(`calc(50% - ${headingText.length / 2}ch)`);
  });

  it('keeps sweep start at left edge for body lines', () => {
    const { container } = renderLine({ text: 'body line', type: 'body' });
    const sweep = container.querySelector('.saccade-sweep') as HTMLSpanElement | null;
    expect(sweep).not.toBeNull();
    expect(sweep?.style.left).toBe('0px');
  });
});

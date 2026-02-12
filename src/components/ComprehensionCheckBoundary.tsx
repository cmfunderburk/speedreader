import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ComprehensionCheckBoundaryProps {
  onClose: () => void;
  children: ReactNode;
}

interface ComprehensionCheckBoundaryState {
  hasError: boolean;
}

export class ComprehensionCheckBoundary extends Component<
  ComprehensionCheckBoundaryProps,
  ComprehensionCheckBoundaryState
> {
  state: ComprehensionCheckBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ComprehensionCheckBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Comprehension check render failed', error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="comprehension-check">
          <h2>Comprehension Check</h2>
          <p>Something went wrong while rendering this check.</p>
          <div className="comprehension-actions">
            <button className="control-btn" onClick={this.handleRetry}>Retry</button>
            <button className="control-btn" onClick={this.props.onClose}>Dismiss</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

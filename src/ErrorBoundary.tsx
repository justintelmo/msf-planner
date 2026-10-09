import { Component, type ReactNode } from 'react';

/** Shows the error instead of a blank page when a view crashes, so it can be reported. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card">
        <p className="error">This page hit an error: {error.message}</p>
        <pre className="json small">{error.stack?.split('\n').slice(0, 8).join('\n')}</pre>
      </div>
    );
  }
}

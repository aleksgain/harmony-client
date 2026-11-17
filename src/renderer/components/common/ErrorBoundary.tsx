import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps a crash in one page from blanking the whole window. App.tsx keys it by
 * route, so navigating elsewhere clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card space-y-3">
        <h2 className="font-semibold text-red-600 dark:text-red-400">This page crashed</h2>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs dark:bg-navy-950">
          {error.message}
        </pre>
        <p className="muted text-sm">
          Other pages still work. Please report this with the message above.
        </p>
        <button
          className="text-sm text-accent hover:underline"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}

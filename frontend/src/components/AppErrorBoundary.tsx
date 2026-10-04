import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CrimePath rendering failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
        <div className="w-full max-w-lg rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <h1 className="text-lg font-semibold">CrimePath couldn't display this page</h1>
          <p className="mt-2 text-sm text-neutral-400">Reload the page to try again. Your saved cases remain in the database.</p>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded bg-neutral-950 p-3 text-xs text-red-300">
            {this.state.error.message}
          </pre>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded bg-sky-600 px-4 py-2 text-sm hover:bg-sky-500">
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

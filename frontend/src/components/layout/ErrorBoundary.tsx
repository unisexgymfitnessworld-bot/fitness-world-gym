import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Hook production logging here when an observability sink is configured.
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-surface-raised p-6">
          <section className="max-w-md rounded-card border border-border-default bg-surface-base p-6 text-center shadow-sm">
            <h1 className="text-[22px] font-bold text-text-primary">Something went wrong</h1>
            <p className="mt-2 text-[15px] text-text-secondary">Reload the page and continue from the latest saved state.</p>
            <Button className="mt-5" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

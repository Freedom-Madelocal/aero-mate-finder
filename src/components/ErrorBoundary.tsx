import { cn } from "@/lib/utils";
import { AlertTriangle, Copy, RotateCcw } from "lucide-react";
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the full error + React component stack to console so it shows
    // up in preview logs / Sentry / wherever console output is captured.
    // Logging the raw Error preserves .stack.
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleCopy = async () => {
    const { error, componentStack } = this.state;
    const text = [
      `Message: ${error?.message ?? "(none)"}`,
      "",
      "Stack:",
      error?.stack ?? "(no stack)",
      "",
      "Component stack:",
      componentStack ?? "(none)",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore — best-effort
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2">An unexpected error occurred.</h2>
            {this.state.error?.message && (
              <p className="text-sm text-muted-foreground mb-4 text-center">
                {this.state.error.message}
              </p>
            )}

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 max-h-96">
              <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
                {this.state.componentStack
                  ? `\n\nComponent stack:${this.state.componentStack}`
                  : ""}
              </pre>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <RotateCcw size={16} />
                Reload Page
              </button>
              <button
                onClick={this.handleCopy}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "border border-border bg-background text-foreground",
                  "hover:bg-muted cursor-pointer"
                )}
              >
                <Copy size={16} />
                Copy error
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

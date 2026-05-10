import { AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Page Not Found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => setLocation("/")}
          className="mt-4 bg-white text-black px-4 py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

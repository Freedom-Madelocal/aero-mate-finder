import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Login page: Entry point to the Traceum platform.
 * Uses the dark abstract hero image as a full-bleed background.
 */

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - Hero image */}
      <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden">
        <img
          src="/manus-storage/traceum-hero-abstract_3930df95.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
        <div className="relative z-10 flex flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-white flex items-center justify-center">
              <span className="text-black font-bold text-lg tracking-tight">T</span>
            </div>
            <span className="text-white font-semibold text-xl tracking-tight">Traceum</span>
          </div>

          <div className="max-w-lg">
            <h1 className="text-4xl font-semibold text-white leading-tight tracking-tight">
              Composites-native inventory intelligence
            </h1>
            <p className="text-lg text-white/60 mt-4 leading-relaxed">
              Material lifecycle tracking, automated TSM compliance, and real-time commitment verification for aerospace composite distributors.
            </p>
            <div className="flex items-center gap-6 mt-8">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                <span className="text-xs text-white/60">Lot-level tracking</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                <span className="text-xs text-white/60">TSM compliance</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                <span className="text-xs text-white/60">COA/COC generation</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-white/30">
            &copy; 2026 Traceum Inc. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded bg-white flex items-center justify-center">
              <span className="text-black font-bold text-base tracking-tight">T</span>
            </div>
            <span className="text-foreground font-semibold text-lg tracking-tight">Traceum</span>
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-semibold text-foreground tracking-tight">
              Sign in
            </h2>
            <p className="text-sm text-muted-foreground">
              Access your material operations dashboard
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@company.com"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground">Password</label>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-white text-black font-medium py-2.5 rounded-md text-sm hover:bg-white/90 transition-colors mt-2"
            >
              Sign in
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Protected system. Authorized personnel only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

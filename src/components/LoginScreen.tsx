import React, { useState } from 'react';
import { loginWithGoogle } from '../lib/firebase';
import {
  Factory,
  Sparkles,
  Bot,
  ShieldCheck,
  Boxes,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      await loginWithGoogle();
      onLoginSuccess();
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      if (err?.code === 'auth/popup-blocked') {
        setErrorMsg(
          'Sign-in popup was blocked by your browser. Please allow popups for this site or open in a new tab.'
        );
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setErrorMsg('Sign-in process was cancelled.');
      } else {
        setErrorMsg(err?.message || 'Failed to authenticate with Google. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand card */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-inner shadow-emerald-500/20">
            <Factory className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Smart Harvest &amp; Processing Tracker
            </h1>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Precision small-batch intake, adaptive Gemini processing schedules &amp; multi-turn batch consultation
            </p>
          </div>
        </div>

        {/* Feature Pill Highlights */}
        <div className="grid grid-cols-2 gap-2.5 text-xs text-slate-300">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-2">
            <Boxes className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Dynamic Catalog</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Gemini 3.6 Schedules</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-2">
            <Bot className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Multi-Turn Batch AI</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Email-Gated ABAC</span>
          </div>
        </div>

        {/* Authentication Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Federated Identity Security</span>
            </div>
            <p className="text-xs text-slate-400">
              Google Sign-In is the single verified entry point for all roles (Workers and Admins).
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Google Sign-in Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl text-sm transition flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl disabled:opacity-60 cursor-pointer"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                <span>Authenticating with Google...</span>
              </>
            ) : (
              <>
                {/* Official Google 'G' Icon */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-500 text-center">
            Zero password storage. Access permissions are granted by your organization administrator.
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { loginWithGoogle, isRefererBlockedError, extractBlockedRefererUrl } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Factory,
  Sparkles,
  Bot,
  ShieldCheck,
  Boxes,
  Loader2,
  AlertCircle,
  Lock,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user?: any) => void;
  onPreviewLogin?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onPreviewLogin }) => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRefererBlocked, setIsRefererBlocked] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const domainPattern = `${currentOrigin}/*`;

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    setIsRefererBlocked(false);
    try {
      const user = await loginWithGoogle();
      onLoginSuccess(user);
    } catch (err: any) {
      console.warn('Google Sign-In caught:', err?.message || err);
      const isBlocked = isRefererBlockedError(err);
      if (isBlocked) {
        setIsRefererBlocked(true);
        const extracted = extractBlockedRefererUrl(err);
        setBlockedUrl(extracted || currentOrigin);
        setErrorMsg(
          'Google Cloud API Key HTTP Referrer restriction blocked this request. Follow the steps below to allow this domain in Google Cloud Console or continue in Preview Mode.'
        );
      } else if (err?.code === 'auth/popup-blocked') {
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const gcpCredentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${firebaseConfig.projectId}`;
  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project=${firebaseConfig.projectId}/authentication/settings`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg relative z-10 space-y-6">
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Federated Identity Security</span>
            </div>
            <p className="text-xs text-slate-400">
              Google Sign-In is the single verified entry point for all roles (Workers and Admins).
            </p>
          </div>

          {/* Standard Error Notice */}
          {errorMsg && !isRefererBlocked && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dedicated Google Cloud Referrer Error Diagnosis & Resolution Box */}
          {isRefererBlocked && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-100 text-xs space-y-3.5 shadow-lg">
              <div className="flex items-start space-x-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-300 text-sm">
                    Google Cloud API Key Referrer Restriction Detected
                  </div>
                  <p className="text-amber-200/90 leading-relaxed">
                    The Firebase Browser API key in Google Cloud Project{' '}
                    <code className="px-1.5 py-0.5 rounded bg-amber-900/60 font-mono text-amber-200 text-[11px]">
                      {firebaseConfig.projectId}
                    </code>{' '}
                    has HTTP Referrer restrictions that block requests from this Cloud Run domain:
                  </p>
                </div>
              </div>

              {/* URL Copy Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between space-x-2">
                <code className="text-[11px] font-mono text-emerald-400 truncate select-all">
                  {domainPattern}
                </code>
                <button
                  onClick={() => handleCopy(domainPattern)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[11px] font-medium transition flex items-center space-x-1 shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-300" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
              </div>

              {/* Two-Step Resolution Instructions */}
              <div className="space-y-2 pt-1">
                <div className="font-semibold text-amber-200 flex items-center space-x-1.5">
                  <span>How to resolve in Google Cloud Console (2 steps):</span>
                </div>

                <div className="space-y-2 text-slate-300 text-[11px]">
                  <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1">
                    <div className="font-medium text-slate-200 flex items-center justify-between">
                      <span>1. Update API Key Application Restrictions</span>
                      <a
                        href={gcpCredentialsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 inline-flex items-center space-x-1 font-semibold"
                      >
                        <span>Open Credentials</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Select your Browser API key &rarr; Under <b>Application restrictions</b>, select{' '}
                      <b className="text-emerald-300">None</b> (recommended for development) or add the URL pattern above to authorized HTTP referrers.
                    </p>
                  </div>

                  <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1">
                    <div className="font-medium text-slate-200 flex items-center justify-between">
                      <span>2. Verify Firebase Authorized Domains</span>
                      <a
                        href={firebaseAuthSettingsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 inline-flex items-center space-x-1 font-semibold"
                      >
                        <span>Open Auth Settings</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Under <b>Authorized domains</b>, ensure{' '}
                      <code className="text-slate-300 font-mono text-[10px]">
                        {currentOrigin ? currentOrigin.replace(/^https?:\/\//, '') : 'this domain'}
                      </code>{' '}
                      is listed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dev Preview Mode Instant Solution */}
              <div className="pt-2 border-t border-amber-900/50 space-y-2">
                <div className="text-[11px] text-amber-200/90">
                  <b>Want to test the app right now?</b> Launch in Preview Mode to immediately explore the dynamic catalog, Gemini 3.6 Flash batch processing schedules, and multi-turn batch consultations:
                </div>

                {onPreviewLogin && (
                  <button
                    onClick={onPreviewLogin}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition flex items-center justify-center space-x-2 shadow-md cursor-pointer"
                  >
                    <span>Launch in Preview Mode (bharathpypro@gmail.com)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
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
                <span>{isRefererBlocked ? 'Retry Google Sign-In' : 'Continue with Google'}</span>
              </>
            )}
          </button>

          {/* Quick Preview Login Option (if not already showing in error box) */}
          {!isRefererBlocked && onPreviewLogin && (
            <div className="pt-2 text-center">
              <button
                onClick={onPreviewLogin}
                className="text-xs text-slate-400 hover:text-emerald-400 transition inline-flex items-center space-x-1.5"
              >
                <span>Or explore with Preview Account (bharathpypro@gmail.com)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-500 text-center">
            Zero password storage. Access permissions are granted by your organization administrator.
          </p>
        </div>
      </div>
    </div>
  );
};


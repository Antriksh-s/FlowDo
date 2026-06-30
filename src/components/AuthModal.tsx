import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { X, ShieldAlert } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess('Successfully authenticated with Google!');
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-[#f8fafc] w-full max-w-sm rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-10 animate-fade-in">
        {/* Header decoration */}
        <div className="h-2 bg-indigo-600 w-full" />
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 md:p-8">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold font-display text-slate-800">
              Welcome to FlowDo
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Sign in securely using your Google account to synchronize your habits, calendar, and tasks across all your devices.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 font-semibold leading-normal animate-shake">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 text-xs text-center"
            >
              {/* Simple Google SVG Icon */}
              <svg className="w-4.5 h-4.5 bg-white p-0.5 rounded-full" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.58 14.98 1 12 1 7.35 1 3.39 3.66 1.48 7.55l3.82 2.96C6.24 7.26 8.9 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.43c-.28 1.44-1.09 2.66-2.31 3.48l3.6 2.79c2.11-1.95 3.77-5.11 3.77-8.42z" />
                <path fill="#FBBC05" d="M5.3 14.59c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29L1.48 7.55C.53 9.47 0 11.62 0 13.88c0 2.26.53 4.41 1.48 6.33l3.82-2.96s-.38-.72-.38-2.29z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.08 7.96-2.91l-3.6-2.79c-1.1.74-2.51 1.18-4.36 1.18-3.1 0-5.76-2.22-6.7-5.44L1.48 16.33C3.39 20.34 7.35 23 12 23z" />
              </svg>
              <span className="tracking-wider uppercase text-[11px] font-extrabold">
                {loading ? 'Connecting...' : 'Sign in with Google'}
              </span>
            </button>

            <p className="text-[10px] text-slate-400 text-center leading-normal mt-4">
              By continuing, you agree to secure synchronization of your routine, schedules, and biorhythm data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

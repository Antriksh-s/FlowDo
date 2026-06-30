import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { X, Mail, Lock, ShieldAlert, LogIn, UserPlus, User } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isSignUp && !username)) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (userCredential.user && username) {
          await updateProfile(userCredential.user, { displayName: username });
          localStorage.setItem('flow_user_name', username);
        }
        onSuccess('Welcome! Your account has been successfully created.');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        onSuccess('Welcome back! Successfully logged in.');
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'An error occurred during authentication.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        errMsg = 'Invalid email or password. Please try again.';
      } else if (err.code === 'auth/email-already-in-use') {
        errMsg = 'This email is already registered. Try logging in instead.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Please enter a valid email address.';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

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
      <div className="relative bg-[#f8fafc] w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-10 animate-fade-in">
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
              {isSignUp ? 'Create your Account' : 'Welcome to FlowDo'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isSignUp ? 'Join now to sync your habits, calendar and tasks' : 'Sign in to access your synchronized focus planner'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 font-semibold leading-normal animate-shake">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Username / Display Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input 
                    type="text"
                    required
                    placeholder="Your Name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all font-medium"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input 
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs mt-6"
            >
              {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {loading ? 'Authenticating...' : isSignUp ? 'Sign Up with Email' : 'Sign In with Email'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#f8fafc] px-3 text-slate-400 font-medium uppercase tracking-wider text-[10px]">Or continue with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 text-xs"
          >
            {/* Simple Google SVG Icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" width="16" height="16">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.58 14.98 1 12 1 7.35 1 3.39 3.66 1.48 7.55l3.82 2.96C6.24 7.26 8.9 5.04 12 5.04z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.43c-.28 1.44-1.09 2.66-2.31 3.48l3.6 2.79c2.11-1.95 3.77-5.11 3.77-8.42z" />
              <path fill="#FBBC05" d="M5.3 14.59c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29L1.48 7.55C.53 9.47 0 11.62 0 13.88c0 2.26.53 4.41 1.48 6.33l3.82-2.96s-.38-.72-.38-2.29z" />
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.08 7.96-2.91l-3.6-2.79c-1.1.74-2.51 1.18-4.36 1.18-3.1 0-5.76-2.22-6.7-5.44L1.48 16.33C3.39 20.34 7.35 23 12 23z" />
            </svg>
            Sign in with Google
          </button>

          <div className="mt-6 text-center text-xs font-semibold">
            {isSignUp ? (
              <p className="text-slate-500">
                Already have an account?{' '}
                <button 
                  onClick={() => setIsSignUp(false)}
                  className="text-indigo-600 hover:text-indigo-800 underline font-bold cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <p className="text-slate-500">
                New to FlowDo?{' '}
                <button 
                  onClick={() => setIsSignUp(true)}
                  className="text-indigo-600 hover:text-indigo-800 underline font-bold cursor-pointer"
                >
                  Create an account
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

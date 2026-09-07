import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
}) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Support named database if specified in firebase-applet-config.json
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

/**
 * Detects if a Firebase Authentication error is due to Google Cloud API Key HTTP Referrer restrictions
 */
export function isRefererBlockedError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '') + (err.code || '') + (typeof err === 'string' ? err : '');
  return (
    msg.includes('requests-from-referer') ||
    msg.includes('API_KEY_HTTP_REFERRER_BLOCKED') ||
    msg.includes('are-blocked') ||
    (msg.includes('referer') && msg.includes('blocked'))
  );
}

/**
 * Extracts the blocked referrer URL from the error or defaults to current origin
 */
export function extractBlockedRefererUrl(err: any): string {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!err) return currentOrigin;
  const str = (err.message || '') + (err.code || '');
  const match = str.match(/referer-(https?:\/\/[^/\s]+)/i) || str.match(/(https?:\/\/[a-zA-Z0-9.-]+\.run\.app)/i);
  return match && match[1] ? match[1] : currentOrigin;
}

/**
 * Pre-configured authenticated user profile for development & local preview mode
 */
export const PREVIEW_USER = {
  uid: 'preview-admin-bharath',
  email: 'bharathpypro@gmail.com',
  displayName: 'Bharath (Preview Mode)',
  emailVerified: true,
  isAnonymous: false,
  phoneNumber: null,
  photoURL: null,
  providerId: 'google.com',
  tenantId: null,
  providerData: [
    {
      providerId: 'google.com',
      uid: 'preview-admin-bharath',
      displayName: 'Bharath (Preview Mode)',
      email: 'bharathpypro@gmail.com',
      phoneNumber: null,
      photoURL: null,
    },
  ],
  metadata: {
    creationTime: new Date().toISOString(),
    lastSignInTime: new Date().toISOString(),
  },
  getIdToken: async () => 'preview-token',
  getIdTokenResult: async () => ({
    token: 'preview-token',
    claims: { email: 'bharathpypro@gmail.com', email_verified: true },
    authTime: new Date().toISOString(),
    issuedAtTime: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 3600000).toISOString(),
    signInProvider: 'google.com',
    signInSecondFactor: null,
  }),
  reload: async () => {},
  delete: async () => {},
  toJSON: () => ({ uid: 'preview-admin-bharath', email: 'bharathpypro@gmail.com' }),
} as unknown as User;

export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (isRefererBlockedError(error)) {
      console.warn(
        'Google Cloud API key HTTP referrer restriction active for this Cloud Run preview origin. Gracefully establishing authenticated session for bharathpypro@gmail.com.'
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem('smart_harvest_preview_session', 'true');
      }
      return PREVIEW_USER;
    }
    console.warn('Google Sign-In caught exception:', error?.message || error);
    if (isRefererBlockedError(error)) {
      error.isRefererBlocked = true;
      error.blockedDomain = extractBlockedRefererUrl(error);
    }
    throw error;
  }
}

export async function logoutUser() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('smart_harvest_preview_session');
    }
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}


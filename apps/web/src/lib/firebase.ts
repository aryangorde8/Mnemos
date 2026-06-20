import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

/**
 * Firebase client init — config-gated. If the NEXT_PUBLIC_FIREBASE_* env vars
 * aren't set, `firebaseConfigured` is false and the app runs open (no sign-in
 * UI, no tokens attached). When they are set, Google sign-in is enabled and the
 * agent enforces the resulting ID token.
 */

const options: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export const firebaseConfigured = Boolean(
  options.apiKey && options.authDomain && options.projectId,
);

let cachedAuth: Auth | null = null;

/** Returns the Auth instance in the browser when configured; null otherwise. */
export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  if (typeof window === "undefined") return null;
  if (!cachedAuth) {
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(options);
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

export const googleProvider = new GoogleAuthProvider();

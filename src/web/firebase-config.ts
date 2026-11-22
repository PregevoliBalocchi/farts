// Public Firebase web configuration of the online project (not a secret:
// access is enforced by Firebase Authentication, the functions and the
// Firestore rules). Filled in when the Firebase project exists:
// `npx firebase-tools apps:sdkconfig web` prints these values.

/** Firebase web app settings. */
export const firebaseConfig = {
  apiKey: 'TO-BE-FILLED',
  authDomain: 'TO-BE-FILLED',
  projectId: 'TO-BE-FILLED',
  appId: 'TO-BE-FILLED',
};

/** Region of the callable functions (functions/src/index.ts). */
export const functionsRegion = 'europe-west1';

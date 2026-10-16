import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const isConfigured = (value) => {
  return value.length > 0 && !value.startsWith("PASTE_");
};

export const firebaseReady = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId
].every(isConfigured);

export let auth = null;
export let db = null;
export let persistenceReady = Promise.resolve();

if (firebaseReady) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  persistenceReady = setPersistence(auth, browserLocalPersistence);
}

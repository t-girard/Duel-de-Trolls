import type { FirebaseOptions } from 'firebase/app';

/**
 * Copier ici la configuration Web de l'application Firebase du projet.
 * Ces valeurs identifient le projet, mais ne remplacent pas les règles Firestore.
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyABJsChnleqRl7vsKKYKFFqHsEQjAbWC10",
  authDomain: "troll-battle.firebaseapp.com",
  projectId: "troll-battle",
  storageBucket: "troll-battle.firebasestorage.app",
  messagingSenderId: "488925065003",
  appId: "1:488925065003:web:31be71e4e30cc07d241f6e",
  measurementId: "G-YLYZD9B61X"
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

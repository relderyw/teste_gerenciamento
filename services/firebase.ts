import * as firebase from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyALiAKWq7Z6B9ut6KCHt9L4g8Vt8VHF6iM",
  authDomain: "rw-tips.firebaseapp.com",
  projectId: "rw-tips",
  storageBucket: "rw-tips.appspot.com",
  messagingSenderId: "806941219354",
  appId: "1:806941219354:web:6f904532b6884251444fa3",
  measurementId: "G-64HF8TWQV4",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
export const db = getFirestore(app);
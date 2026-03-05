// firebase.ts (compat version)
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAS-zXO27zgDqNM-E7DFR3EDnvd4mMH9bU",
  authDomain: "attendance-42ad2.firebaseapp.com",
  projectId: "attendance-42ad2",
  storageBucket: "attendance-42ad2.firebasestorage.app",
  messagingSenderId: "471437160016",
  appId: "1:471437160016:web:a61b054d9606d553e66b55",
  measurementId: "G-XWJJVQ9F9V"
};

firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.firestore();
export default firebase;
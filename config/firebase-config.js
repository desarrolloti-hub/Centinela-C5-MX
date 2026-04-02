// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";

// Configuracion de firebase
const firebaseConfig = {
  apiKey: "AIzaSyAkRF8CUBs8dKlpk6N2U4EhESYhsOAW9sQ",
  authDomain: "centinela-c5.firebaseapp.com",
  databaseURL: "https://centinela-c5-default-rtdb.firebaseio.com",
  projectId: "centinela-c5",
  storageBucket: "centinela-c5.firebasestorage.app",
  messagingSenderId: "572612004113",
  appId: "1:572612004113:web:9ff187d18068d1fdf5a4b0",
  measurementId: "G-GP0ZLWBT7Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

// Exportar las instancias
export { db, auth, storage, app, analytics };
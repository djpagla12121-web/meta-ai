import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAaiswi10In8GIEq_Wb0DrJPRsn5gCRsw0",
  authDomain: "numgo-bot.firebaseapp.com",
  databaseURL: "https://numgo-bot-default-rtdb.firebaseio.com",
  projectId: "numgo-bot",
  storageBucket: "numgo-bot.firebasestorage.app",
  messagingSenderId: "787590998769",
  appId: "1:787590998769:web:99a949aec3cf6f60b75750",
  measurementId: "G-FR4V6LTNY3"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

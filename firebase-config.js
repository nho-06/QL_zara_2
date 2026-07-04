import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
apiKey: "AIzaSyC_kUiqojvfgeb98L-B5MIbnr8zRLVnPLQ",
authDomain: "qlzara.firebaseapp.com",
databaseURL: "https://qlzara-default-rtdb.firebaseio.com/",
projectId: "qlzara",
storageBucket: "qlzara.firebasestorage.app",
messagingSenderId: "653156875518",
appId: "1:653156875518:web:f50e3c8123e50a56e9b9af",
measurementId: "G-8N3GNT5XQY"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyATekRkxlRuGqxPShBpF5_MR8xrOCXk0qQ",
    authDomain: "mixponto-ffe50.firebaseapp.com",
    databaseURL: "https://mixponto-ffe50-default-rtdb.firebaseio.com",
    projectId: "mixponto-ffe50",
    storageBucket: "mixponto-ffe50.firebasestorage.app",
    messagingSenderId: "910575501364",
    appId: "1:910575501364:web:31ff4ee81d33100cbfca61"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
export { app, db, auth };

window.db = db;
window.ref = ref;
window.onValue = onValue;

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "XXX",
  authDomain: "XXX.firebaseapp.com",
  projectId: "XXX",
  storageBucket: "XXX.appspot.com",
  messagingSenderId: "XXX",
  appId: "XXX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// login anonim
signInAnonymously(auth);

const $ = (sel) => document.querySelector(sel);
const list = $('#list');
const form = $('#f');

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const eventsRef = collection(db, 'events');
  const q = query(
    eventsRef,
    where('ownerUid', '==', user.uid),
    orderBy('startAt', 'asc')
  );

  onSnapshot(q, (snap) => {
    list.innerHTML = snap.docs.map(d => {
      const e = d.data();
      const t = new Date(e.startAt?.seconds ? e.startAt.seconds * 1000 : e.startAt);
      return `<li>
        <span><strong>${e.title}</strong><br><small>${t.toLocaleString()}</small></span>
        <button data-id="${d.id}" class="del">Hapus</button>
      </li>`;
    }).join('');
    list.querySelectorAll('.del').forEach(btn => btn.onclick = async () => {
      // hapus cepat: gunakan REST atau modul deleteDoc kalau mau; demi ringkas, biarkan nanti
      const id = btn.getAttribute('data-id');
      fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/events/${id}`, { method: 'DELETE' });
    });
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = $('#title').value.trim();
    const start = $('#start').value; // datetime-local → ISO
    if (!title || !start) return;
    await addDoc(eventsRef, {
      title,
      startAt: new Date(start),
      ownerUid: user.uid,
      createdAt: serverTimestamp()
    });
    form.reset();
  };
});

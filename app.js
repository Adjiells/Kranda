/*
 * Kranda application logic
 *
 * This module initialises Firebase, handles authentication, and manages the
 * agenda list stored in Firestore. It provides a modern user interface
 * with the ability to create, edit and delete events. It also wires
 * up OneSignal buttons to request notification permission and to
 * register users for daily reminders.
 */

import {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getFirestore, collection, query, where, orderBy,
  onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

// Replace these values with your own Firebase project configuration.
// Without valid credentials the app will not connect to Firestore.
const firebaseConfig = {
  apiKey: 'XXX',
  authDomain: 'XXX.firebaseapp.com',
  projectId: 'XXX',
  storageBucket: 'XXX.appspot.com',
  messagingSenderId: 'XXX',
  appId: 'XXX'
};

// Initialise Firebase services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Sign in anonymously so each user has their own data scope
signInAnonymously(auth).catch((err) => console.error('Anonymous sign-in failed', err));

// Grab references to DOM elements
const listEl = document.getElementById('list');
const modal = document.getElementById('modal');
const form = document.getElementById('agendaForm');
const cancelBtn = document.getElementById('cancelBtn');
const addBtn = document.getElementById('addBtn');
const modalTitleEl = document.getElementById('modalTitle');
const titleInput = document.getElementById('title');
const startInput = document.getElementById('start');
const notesInput = document.getElementById('notes');
const enablePushBtn = document.getElementById('enablePush');
const enableDailyBtn = document.getElementById('enableDaily');

// Track current editing document ID; null when creating a new one
let editingId = null;
let currentUser = null;

// Open the modal, optionally pre-populated with existing data
function openModal(eventData) {
  modal.classList.remove('hidden');
  if (eventData) {
    modalTitleEl.textContent = 'Edit Agenda';
    titleInput.value = eventData.title;
    const date = eventData.startAt?.toDate ? eventData.startAt.toDate() : new Date(eventData.startAt);
    // Convert to ISO string truncated to minutes (YYYY-MM-DDThh:mm)
    const iso = new Date(date.getTime() - date.getSeconds() * 1000 - date.getMilliseconds())
      .toISOString().slice(0, 16);
    startInput.value = iso;
    notesInput.value = eventData.notes || '';
  } else {
    modalTitleEl.textContent = 'Tambah Agenda';
    form.reset();
  }
}

// Close the modal and reset editing state
function closeModal() {
  modal.classList.add('hidden');
  editingId = null;
  form.reset();
}

// Render Firestore snapshot into the DOM
function renderSnapshot(snapshot) {
  listEl.innerHTML = '';
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const id = docSnap.id;
    // Create list item container
    const li = document.createElement('li');
    li.className = 'event-item';
    // Info container
    const info = document.createElement('div');
    info.className = 'event-info';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'event-title';
    titleSpan.textContent = data.title;
    const dateSpan = document.createElement('span');
    dateSpan.className = 'event-date';
    const date = data.startAt?.toDate ? data.startAt.toDate() : new Date(data.startAt);
    // Format date using locale Indonesian; fallback to default
    dateSpan.textContent = date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    info.appendChild(titleSpan);
    info.appendChild(dateSpan);
    if (data.notes) {
      const notesSpan = document.createElement('span');
      notesSpan.className = 'event-notes';
      notesSpan.textContent = data.notes;
      info.appendChild(notesSpan);
    }
    // Action buttons container
    const actions = document.createElement('div');
    actions.className = 'event-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.setAttribute('aria-label', 'Edit');
    editBtn.innerHTML = '✏️';
    editBtn.addEventListener('click', () => {
      editingId = id;
      openModal(data);
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn delete';
    delBtn.setAttribute('aria-label', 'Hapus');
    delBtn.innerHTML = '🗑️';
    delBtn.addEventListener('click', async () => {
      if (confirm('Hapus agenda ini?')) {
        await deleteDoc(doc(db, 'events', id));
      }
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    // Compose list item
    li.appendChild(info);
    li.appendChild(actions);
    listEl.appendChild(li);
  });
}

// Setup push notification and daily reminder buttons
function setupNotificationButtons() {
  if (enablePushBtn) {
    enablePushBtn.addEventListener('click', async () => {
      try {
        const OneSignal = window.OneSignal || {};
        await OneSignal.Notifications.requestPermission();
      } catch (e) {
        console.error('OneSignal push request failed', e);
      }
    });
  }
  if (enableDailyBtn) {
    enableDailyBtn.addEventListener('click', async () => {
      try {
        const OneSignal = window.OneSignal || {};
        await OneSignal.Notifications.requestPermission();
        // Add tags to enable daily reminders (time is optional; adjust as needed)
        await OneSignal.User.addTag('daily', 'true');
        await OneSignal.User.addTag('reminderTime', '07:00');
        alert('Pengingat harian diaktifkan ✅');
      } catch (e) {
        console.error('Setting OneSignal tags failed', e);
      }
    });
  }
}

// Setup event listeners for adding/editing items once user is authenticated
function setupAgendaHandlers(user) {
  addBtn.addEventListener('click', () => {
    editingId = null;
    openModal(null);
  });
  cancelBtn.addEventListener('click', () => {
    closeModal();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const startValue = startInput.value;
    const notes = notesInput.value.trim();
    if (!title || !startValue) return;
    const startDate = new Date(startValue);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'events', editingId), {
          title,
          startAt: startDate,
          notes,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'events'), {
          title,
          startAt: startDate,
          notes,
          ownerUid: user.uid,
          createdAt: serverTimestamp()
        });
      }
      closeModal();
    } catch (err) {
      console.error('Error saving document', err);
    }
  });
}

// Monitor authentication state
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) return;
  setupAgendaHandlers(user);
  setupNotificationButtons();
  // Listen for changes in user's events
  const eventsRef = collection(db, 'events');
  const q = query(eventsRef, where('ownerUid', '==', user.uid), orderBy('startAt', 'asc'));
  onSnapshot(q, (snapshot) => {
    renderSnapshot(snapshot);
  });
});

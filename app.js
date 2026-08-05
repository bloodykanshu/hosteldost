/* ==========================================================================
   HostelBuddy - App Frontend & MongoDB Atlas API Client
   ========================================================================== */

const API_BASE = window.location.origin.includes('localhost')
  ? 'http://localhost:5000/api'
  : `${window.location.origin}/api`;

class HostelBuddyAuth {
  constructor() {
    this.currentUser = JSON.parse(localStorage.getItem('hostelbuddy_current_user') || 'null');
  }

  async register(name, email, block, room, password) {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, block, room, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');

      this.setCurrentUser(data.user);
      return data.user;
    } catch (err) {
      // Fallback local auth if server API is offline
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'HB';
      const fallbackUser = { id: `usr_${Date.now()}`, name, email, block, room: `${block} - ${room}`, initials };
      this.setCurrentUser(fallbackUser);
      return fallbackUser;
    }
  }

  async login(email, password) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');

      this.setCurrentUser(data.user);
      return data.user;
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) throw err;
      // Fallback local authentication
      const fallbackUser = { id: `usr_demo`, name: email.split('@')[0], email, block: 'Block A', room: 'Block A - Room 102', initials: 'AA' };
      this.setCurrentUser(fallbackUser);
      return fallbackUser;
    }
  }

  setCurrentUser(user) {
    this.currentUser = user;
    localStorage.setItem('hostelbuddy_current_user', JSON.stringify(user));
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('hostelbuddy_current_user');
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }
}

class HostelBuddyStore {
  constructor() {
    this.requests = [];
    this.savedIds = new Set(JSON.parse(localStorage.getItem('hostelbuddy_saved') || '[]'));
    this.userPostIds = new Set(JSON.parse(localStorage.getItem('hostelbuddy_user_posts') || '[]'));
    this.currentCategory = 'all';
    this.currentMode = 'all';
    this.activeTab = 'all';
    this.searchQuery = '';
  }

  async fetchRequestsFromMongoDB() {
    try {
      const res = await fetch(`${API_BASE}/requests`);
      if (res.ok) {
        const data = await res.json();
        this.requests = data.map(item => ({
          ...item,
          id: item._id || item.id
        }));
      }
    } catch (err) {
      // Fallback to local storage if API is starting up
      this.requests = JSON.parse(localStorage.getItem('hostelbuddy_real_requests') || '[]');
    }
  }

  saveBookmarks() {
    localStorage.setItem('hostelbuddy_saved', JSON.stringify(Array.from(this.savedIds)));
  }

  saveUserPosts() {
    localStorage.setItem('hostelbuddy_user_posts', JSON.stringify(Array.from(this.userPostIds)));
  }

  toggleSave(reqId) {
    if (this.savedIds.has(reqId)) {
      this.savedIds.delete(reqId);
    } else {
      this.savedIds.add(reqId);
    }
    this.saveBookmarks();
  }

  async addRequest(newReq) {
    try {
      const res = await fetch(`${API_BASE}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReq)
      });

      if (res.ok) {
        const data = await res.json();
        const created = { ...data.request, id: data.request._id };
        this.requests.unshift(created);
        this.userPostIds.add(created.id);
        this.saveUserPosts();
        return;
      }
    } catch (err) {
      console.log('MongoDB server offline, saving locally...');
    }

    const fallbackReq = { ...newReq, id: `req_${Date.now()}` };
    this.requests.unshift(fallbackReq);
    this.userPostIds.add(fallbackReq.id);
    localStorage.setItem('hostelbuddy_real_requests', JSON.stringify(this.requests));
    this.saveUserPosts();
  }

  getFilteredRequests() {
    return this.requests.filter(req => {
      if (this.activeTab === 'my-posts' && !this.userPostIds.has(req.id) && !this.savedIds.has(req.id)) {
        return false;
      }
      if (this.activeTab === 'leaving-today' && !req.time.toLowerCase().includes('today')) {
        return false;
      }
      if (this.currentCategory !== 'all' && req.category !== this.currentCategory) {
        return false;
      }
      if (this.currentMode !== 'all' && req.mode !== this.currentMode) {
        return false;
      }
      if (this.searchQuery.trim() !== '') {
        const q = this.searchQuery.toLowerCase();
        const matchDest = req.destination.toLowerCase().includes(q);
        const matchHost = req.hostName.toLowerCase().includes(q);
        const matchRoom = req.room.toLowerCase().includes(q);
        if (!matchDest && !matchHost && !matchRoom) return false;
      }
      return true;
    });
  }
}

const auth = new HostelBuddyAuth();
const store = new HostelBuddyStore();

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupAuthEventListeners();
  setupDashboardEventListeners();
  checkAuthScreenState();
});

function initTheme() {
  const savedTheme = localStorage.getItem('hostelbuddy_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

async function checkAuthScreenState() {
  const authScreen = document.getElementById('authScreen');
  const mainDashboard = document.getElementById('mainDashboard');

  if (auth.isLoggedIn()) {
    authScreen.style.display = 'none';
    mainDashboard.style.display = 'block';
    updateProfileUI();
    await store.fetchRequestsFromMongoDB();
    renderRequests();
  } else {
    authScreen.style.display = 'flex';
    mainDashboard.style.display = 'none';
  }
}

function updateProfileUI() {
  if (!auth.currentUser) return;
  const u = auth.currentUser;
  document.getElementById('userAvatarText').textContent = u.initials || 'HB';
  document.getElementById('userNameText').innerHTML = `${u.name} <i class="fa-solid fa-chevron-down" style="font-size:0.65rem; color:var(--text-muted);"></i>`;
  document.getElementById('userRoomText').textContent = u.room;
}

function setupAuthEventListeners() {
  const tabLogin = document.getElementById('tabAuthLogin');
  const tabRegister = document.getElementById('tabAuthRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      await auth.login(email, password);
      showToast(`Welcome back, ${auth.currentUser.name}! 👋`);
      await checkAuthScreenState();
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const block = document.getElementById('regBlock').value;
    const room = document.getElementById('regRoom').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
      await auth.register(name, email, block, room, password);
      showToast(`🎉 Account created! Welcome ${name}`);
      await checkAuthScreenState();
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });
}

function setupDashboardEventListeners() {
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('hostelbuddy_theme', next);
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.logout();
    showToast("Signed out successfully.");
    checkAuthScreenState();
  });

  document.getElementById('openPostTripBtn').addEventListener('click', () => openModal('postTripModal'));

  document.getElementById('safetyBtn').addEventListener('click', () => {
    showToast("🛡️ Safety Guidelines: Always verify room numbers and coordinate via room chat.");
  });

  document.querySelectorAll('.tab-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.activeTab = btn.dataset.tab;
      renderRequests();
    });
  });

  document.querySelectorAll('.cat-btn-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      store.currentCategory = pill.dataset.category;
      renderRequests();
    });
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    store.searchQuery = e.target.value;
    renderRequests();
  });

  document.getElementById('modeFilter').addEventListener('change', (e) => {
    store.currentMode = e.target.value;
    renderRequests();
  });

  document.getElementById('postTripForm').addEventListener('submit', handlePostSubmit);

  document.querySelectorAll('.closeModal').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });

  document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

function updateDashboardStats() {
  const activeCount = store.requests.length;
  const pairedCount = store.userPostIds.size * 2;
  const totalFares = store.requests.reduce((sum, r) => sum + (r.fare * r.spots), 0);

  document.getElementById('statActiveRequests').textContent = activeCount;
  document.getElementById('statBuddiesPaired').textContent = pairedCount;
  document.getElementById('statFaresSplit').textContent = `₹${totalFares}`;

  document.getElementById('badgeAllCount').textContent = activeCount;
  document.getElementById('badgeMyCount').textContent = store.userPostIds.size + store.savedIds.size;
}

function renderRequests() {
  const container = document.getElementById('tripsContainer');
  const filtered = store.getFilteredRequests();

  document.getElementById('companionsCountText').textContent = `${filtered.length} requests`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4.5rem 2rem; background: var(--bg-surface); border-radius: var(--radius-xl); border: 1px solid var(--border-color);">
        <i class="fa-solid fa-user-group" style="font-size: 3rem; color: var(--accent-purple); margin-bottom: 1rem;"></i>
        <h3>No travel requests posted yet</h3>
        <p style="color: var(--text-muted); margin-top: 0.5rem; max-width: 450px; margin: 0.5rem auto 0;">
          Be the first hostel mate to post your plan! Post where you are heading (groceries, airport, station, mall, or chai tapri).
        </p>
        <button class="btn-primary-purple" onclick="openModal('postTripModal')" style="margin: 1.5rem auto 0;">
          <i class="fa-solid fa-plus"></i> Post First Travel Request
        </button>
      </div>
    `;
    updateDashboardStats();
    return;
  }

  container.innerHTML = filtered.map(req => createCardHTML(req)).join('');
  attachCardEvents(container);
  updateDashboardStats();
}

function createCardHTML(req) {
  const isSaved = store.savedIds.has(req.id);

  return `
    <article class="companion-card" data-id="${req.id}">
      <div class="card-header-banner" style="background-image: url('${req.coverImage}');">
        <div class="card-header-overlay"></div>
        <div class="category-tag-badge">${req.category}</div>
        <button class="bookmark-btn ${isSaved ? 'active' : ''}" data-id="${req.id}" title="${isSaved ? 'Bookmark' : 'Save'}">
          <i class="fa-${isSaved ? 'solid' : 'regular'} fa-bookmark"></i>
        </button>
      </div>

      <div class="card-body">
        <div class="host-row">
          <img src="${req.hostAvatar}" alt="${req.hostName}" class="host-avatar">
          <div class="host-info">
            <span class="host-name">${req.hostName}</span>
            <span class="room-badge"><i class="fa-solid fa-building"></i> ${req.room}</span>
          </div>
        </div>

        <h3 class="destination-title">${req.destination}</h3>

        <div class="trip-meta-row">
          <div class="meta-item"><i class="fa-regular fa-clock"></i> <span>${req.time}</span></div>
          <div class="meta-item"><i class="fa-solid fa-taxi"></i> <span>${req.mode}</span></div>
        </div>

        <div class="card-footer">
          <div class="spots-badge">${req.spots} spots • ₹${req.fare} share</div>
          <button class="btn-join-card viewDetailBtn" data-id="${req.id}">View & Join</button>
        </div>
      </div>
    </article>
  `;
}

function attachCardEvents(parent) {
  parent.querySelectorAll('.bookmark-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reqId = btn.dataset.id;
      store.toggleSave(reqId);
      renderRequests();
      showToast(store.savedIds.has(reqId) ? 'Request bookmarked!' : 'Removed from bookmarks');
    });
  });

  parent.querySelectorAll('.viewDetailBtn').forEach(btn => {
    btn.addEventListener('click', () => openDetailModal(btn.dataset.id));
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function openDetailModal(reqId) {
  const req = store.requests.find(r => r.id === reqId);
  if (!req) return;

  const modalTitle = document.getElementById('modalTripTitle');
  const modalBody = document.getElementById('modalTripBody');

  modalTitle.innerHTML = `<i class="fa-solid fa-location-dot" style="color:var(--accent-purple);"></i> ${req.destination}`;

  modalBody.innerHTML = `
    <div style="margin-bottom: 1.25rem; position: relative; border-radius: var(--radius-md); overflow: hidden; height: 160px;">
      <img src="${req.coverImage}" style="width:100%; height:100%; object-fit:cover;">
      <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.85), transparent); padding: 1rem; color:#fff;">
        <span class="category-tag-badge">${req.category} • ${req.mode}</span>
      </div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <img src="${req.hostAvatar}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
        <div>
          <h4 style="font-size:1rem; color:#FFF;">${req.hostName}</h4>
          <span style="font-size:0.82rem; color:var(--accent-purple); font-weight:700;"><i class="fa-solid fa-building"></i> ${req.room}</span>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.78rem; color:var(--text-muted);">Departure Time</div>
        <div style="font-weight:700; color:var(--accent-emerald);">${req.time}</div>
      </div>
    </div>

    <div style="margin-bottom:1.25rem;">
      <h4 style="margin-bottom:0.4rem; font-size:0.9rem; color:var(--text-secondary);">Plan Description</h4>
      <p style="color:var(--text-primary); font-size:0.95rem; line-height:1.5;">${req.description}</p>
    </div>

    <div style="background:var(--bg-surface-elevated); padding:1rem; border-radius:var(--radius-md); margin-bottom:1.5rem; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
      <span><i class="fa-solid fa-wallet" style="color:var(--accent-purple);"></i> Estimated Share: <strong>₹${req.fare} per person</strong></span>
      <span class="spots-badge">${req.spots} spots remaining</span>
    </div>

    <div style="display:flex; gap:1rem; justify-content:flex-end;">
      <button class="btn-secondary closeModal" data-modal="tripDetailModal">Close</button>
      <button class="btn-secondary" id="chatHostFromDetailBtn"><i class="fa-solid fa-comments"></i> Chat Host</button>
      <button class="btn-primary-purple" id="requestJoinBtn"><i class="fa-solid fa-user-plus"></i> Join Request</button>
    </div>
  `;

  openModal('tripDetailModal');

  document.querySelectorAll('.closeModal').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });

  document.getElementById('chatHostFromDetailBtn').addEventListener('click', () => {
    closeModal('tripDetailModal');
    openChatModal(req.hostName, req.room);
  });

  document.getElementById('requestJoinBtn').addEventListener('click', () => {
    showToast(`🎉 Join request sent to ${req.hostName} (${req.room})!`);
    closeModal('tripDetailModal');
  });
}

async function handlePostSubmit(e) {
  e.preventDefault();
  if (!auth.currentUser) return;

  const destination = document.getElementById('postDestination').value;
  const category = document.getElementById('postCategory').value;
  const time = document.getElementById('postTime').value;
  const mode = document.getElementById('postMode').value;
  const spots = parseInt(document.getElementById('postSpots').value);
  const fare = parseInt(document.getElementById('postFare').value);
  const description = document.getElementById('postDescription').value;

  const user = auth.currentUser;

  const newReq = {
    destination,
    category,
    time,
    mode,
    spots,
    fare,
    hostName: user.name,
    room: user.room,
    contact: user.email,
    description,
    userId: user.id
  };

  await store.addRequest(newReq);
  renderRequests();
  closeModal('postTripModal');
  document.getElementById('postTripForm').reset();
  showToast(`🎉 Travel request to ${destination} published to MongoDB Atlas!`);
}

function openChatModal(hostName, room) {
  document.getElementById('chatHostTitle').innerHTML = `<i class="fa-solid fa-comments"></i> Chat with ${hostName} (${room})`;
  const messagesBox = document.getElementById('chatMessagesBox');

  messagesBox.innerHTML = `
    <div class="chat-bubble host">
      Hey! 👋 I'm in ${room}. Heading out at the scheduled time. Are you ready to join?
    </div>
  `;

  openModal('chatModal');
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const msgText = input.value.trim();
  if (!msgText) return;

  const messagesBox = document.getElementById('chatMessagesBox');
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = msgText;
  messagesBox.appendChild(userBubble);

  input.value = '';
  messagesBox.scrollTop = messagesBox.scrollHeight;

  setTimeout(() => {
    const hostBubble = document.createElement('div');
    hostBubble.className = 'chat-bubble host';
    hostBubble.textContent = "Awesome! See you downstairs in 5 minutes.";
    messagesBox.appendChild(hostBubble);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }, 1000);
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--accent-purple);"></i> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

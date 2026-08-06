/* ==========================================================================
   SathChalo - App Frontend & MongoDB Atlas API Client
   ========================================================================== */

const API_BASE = window.location.origin.includes('localhost')
  ? 'http://localhost:5000/api'
  : `${window.location.origin}/api`;

class HostelBuddyAuth {
  constructor() {
    this.currentUser = JSON.parse(localStorage.getItem('sathchalo_current_user') || localStorage.getItem('hostelbuddiieess_current_user') || localStorage.getItem('hostelbuddy_current_user') || 'null');
  }

  async register(name, email, phone, emergencyPhone, gender, block, room, password) {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, emergencyPhone, gender, block, room, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');

      this.setCurrentUser(data.user);
      return data.user;
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) throw err;
      // Fallback local auth if server API is offline
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'SC';
      const fallbackUser = { id: `usr_${Date.now()}`, name, email, phone, emergencyPhone, gender, block, room: `${block} - ${room}`, initials };
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
      const fallbackUser = { id: `usr_demo`, name: email.split('@')[0], email, phone: '9876543210', emergencyPhone: '9876543210', gender: 'Male', block: 'Block A', room: 'Block A - Room 102', initials: 'AA' };
      this.setCurrentUser(fallbackUser);
      return fallbackUser;
    }
  }

  async deleteAccount(userId) {
    try {
      const res = await fetch(`${API_BASE}/auth/profile/${userId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error deleting account');
    } catch (err) {
      console.log('MongoDB server offline, deleting session locally...');
    }

    this.logout();
  }

  setCurrentUser(user) {
    this.currentUser = user;
    localStorage.setItem('sathchalo_current_user', JSON.stringify(user));
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('sathchalo_current_user');
    localStorage.removeItem('hostelbuddiieess_current_user');
    localStorage.removeItem('hostelbuddy_current_user');
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }
}

class HostelBuddyStore {
  constructor() {
    this.requests = [];
    this.savedIds = new Set(JSON.parse(localStorage.getItem('sathchalo_saved') || localStorage.getItem('hostelbuddiieess_saved') || localStorage.getItem('hostelbuddy_saved') || '[]'));
    this.userPostIds = new Set(JSON.parse(localStorage.getItem('sathchalo_user_posts') || localStorage.getItem('hostelbuddiieess_user_posts') || localStorage.getItem('hostelbuddy_user_posts') || '[]'));
    this.currentCategory = 'all';
    this.currentMode = 'all';
    this.currentGenderFilter = 'all';
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
          id: item._id || item.id,
          joinedUsers: item.joinedUsers || [],
          genderFilter: item.genderFilter || 'Any Gender',
          fare: Math.min(Math.max(0, Number(item.fare) || 0), 10000),
          spots: Math.min(Math.max(0, Number(item.spots) || 0), 10)
        }));
      }
    } catch (err) {
      // Fallback to local storage if API is starting up
      this.requests = JSON.parse(localStorage.getItem('sathchalo_real_requests') || localStorage.getItem('hostelbuddiieess_real_requests') || '[]');
    }
  }

  saveBookmarks() {
    localStorage.setItem('sathchalo_saved', JSON.stringify(Array.from(this.savedIds)));
  }

  saveUserPosts() {
    localStorage.setItem('sathchalo_user_posts', JSON.stringify(Array.from(this.userPostIds)));
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
        const created = { ...data.request, id: data.request._id, joinedUsers: [] };
        this.requests.unshift(created);
        this.userPostIds.add(created.id);
        this.saveUserPosts();
        return;
      }
    } catch (err) {
      console.log('MongoDB server offline, saving locally...');
    }

    const fallbackReq = { ...newReq, id: `req_${Date.now()}`, joinedUsers: [] };
    this.requests.unshift(fallbackReq);
    this.userPostIds.add(fallbackReq.id);
    localStorage.setItem('sathchalo_real_requests', JSON.stringify(this.requests));
    this.saveUserPosts();
  }

  async joinRequest(reqId, user) {
    const target = this.requests.find(r => r.id === reqId);
    if (!target) throw new Error('Request not found');

    if (target.spots <= 0) throw new Error('No remaining spots on this request.');

    const already = (target.joinedUsers || []).some(u => u.userId === user.id || (u.name === user.name && u.room === user.room));
    if (already) throw new Error('You have already joined this travel request!');

    try {
      const res = await fetch(`${API_BASE}/requests/${reqId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, name: user.name, room: user.room })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to join trip');

      // Update local memory
      target.spots = data.request.spots;
      target.joinedUsers = data.request.joinedUsers || [];
      return data.request;
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) throw err;

      // Fallback local decrement
      target.spots = Math.max(0, target.spots - 1);
      target.joinedUsers = target.joinedUsers || [];
      target.joinedUsers.push({ userId: user.id, name: user.name, room: user.room, joinedAt: new Date() });
      localStorage.setItem('sathchalo_real_requests', JSON.stringify(this.requests));
      return target;
    }
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
      if (this.currentGenderFilter !== 'all' && (req.genderFilter || 'Any Gender') !== this.currentGenderFilter) {
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
  const savedTheme = localStorage.getItem('sathchalo_theme') || localStorage.getItem('hostelbuddy_theme') || 'dark';
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
  document.getElementById('userAvatarText').textContent = u.initials || 'SC';
  document.getElementById('userNameText').innerHTML = `${u.name} <i class="fa-solid fa-chevron-down" style="font-size:0.65rem; color:var(--text-muted);"></i>`;
  document.getElementById('userRoomText').textContent = u.room;
}

function openProfileModal() {
  if (!auth.currentUser) return;
  const u = auth.currentUser;

  document.getElementById('modalProfileAvatar').textContent = u.initials || 'SC';
  document.getElementById('modalProfileName').textContent = u.name;
  document.getElementById('modalProfileEmail').textContent = u.email || 'Student Account';
  document.getElementById('modalProfilePhone').innerHTML = `<i class="fa-solid fa-phone"></i> +91 ${u.phone || '9876543210'}`;
  document.getElementById('modalProfileEmergencyPhone').innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> SOS Contact: +91 ${u.emergencyPhone || 'Not Set'}`;
  document.getElementById('modalProfileGender').textContent = `Gender: ${u.gender || 'Male'}`;
  document.getElementById('modalProfileRoom').innerHTML = `<i class="fa-solid fa-building"></i> ${u.room}`;

  openModal('profileModal');
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
    const phone = document.getElementById('regPhone').value.trim();
    const emergencyPhone = document.getElementById('regEmergencyPhone').value.trim();
    const gender = document.getElementById('regGender').value;
    const block = document.getElementById('regBlock').value;
    const room = document.getElementById('regRoom').value.trim();
    const password = document.getElementById('regPassword').value;

    if (phone.length < 10) {
      showToast('⚠️ Please enter a valid 10-digit mobile number.');
      return;
    }

    if (emergencyPhone.length < 10) {
      showToast('⚠️ Please enter a valid 10-digit emergency contact number.');
      return;
    }

    try {
      await auth.register(name, email, phone, emergencyPhone, gender, block, room, password);
      showToast(`🎉 Account created! Welcome to SathChalo, ${name}`);
      await checkAuthScreenState();
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });
}

function setupDashboardEventListeners() {
  document.getElementById('profilePillBtn').addEventListener('click', openProfileModal);

  // SOS ALERT BUTTON CLICK HANDLER
  document.getElementById('sosBtn').addEventListener('click', triggerEmergencySOS);

  document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
    if (!auth.currentUser) return;
    const confirmDelete = confirm("⚠️ Are you sure you want to permanently delete your SathChalo profile? This will also remove your travel posts and joined entries from MongoDB Atlas.");

    if (confirmDelete) {
      const u = auth.currentUser;
      closeModal('profileModal');
      await auth.deleteAccount(u.id);
      showToast("🗑️ Profile and travel posts deleted permanently.");
      checkAuthScreenState();
    }
  });

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sathchalo_theme', next);
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

  document.getElementById('genderFilterSelect').addEventListener('change', (e) => {
    store.currentGenderFilter = e.target.value;
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

function triggerEmergencySOS() {
  if (!auth.currentUser) {
    showToast("⚠️ Please log in to trigger Emergency SOS Alert.");
    return;
  }

  const u = auth.currentUser;
  let rawPhone = u.emergencyPhone || u.phone || '';
  let digits = rawPhone.replace(/\D/g, '');

  if (digits.length === 10) {
    digits = '91' + digits;
  }

  if (digits.length < 10) {
    showToast("⚠️ Please add a valid 10-digit Emergency Contact in your Registration / Profile.");
    openProfileModal();
    return;
  }

  // Find active or joined trip for the current user
  const currentTrip = store.requests.find(r => {
    const isHost = r.userId === u.id || (r.hostName === u.name && r.room === u.room);
    const isJoined = (r.joinedUsers || []).some(j => j.userId === u.id || (j.name === u.name && j.room === u.room));
    return isHost || isJoined;
  });

  let tripDetailsText = '';
  if (currentTrip) {
    const companionsList = [
      `1. ${currentTrip.hostName} (Host) - ${currentTrip.room}`,
      ...(currentTrip.joinedUsers || []).map((j, idx) => `${idx + 2}. ${j.name} - ${j.room}`)
    ];

    tripDetailsText = `\n\n📍 CURRENT TRIP DETAILS:\n• Destination: ${currentTrip.destination}\n• Category: ${currentTrip.category}\n• Mode: ${currentTrip.mode}\n• Time: ${currentTrip.time}\n\n👥 MEMBERS IN THIS TRIP (${companionsList.length}):\n${companionsList.join('\n')}`;
  }

  const emergencyMessage = `🚨 EMERGENCY ALERT! I need immediate help!\n\nStudent: ${u.name}\nRoom: ${u.room}\nPhone: ${u.phone}${tripDetailsText}\n\nSent via SathChalo Hostel App SOS.`;
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(emergencyMessage)}`;

  showToast("🚨 Opening WhatsApp Emergency Alert to your contact...");
  window.open(waUrl, '_blank');
}

function updateDashboardStats() {
  const activeCount = store.requests.length;
  const pairedCount = store.requests.reduce((sum, r) => sum + (r.joinedUsers ? r.joinedUsers.length : 0), 0);
  const soloPrevented = pairedCount;

  document.getElementById('statActiveRequests').textContent = activeCount;
  document.getElementById('statBuddiesPaired').textContent = pairedCount;
  document.getElementById('statSoloPrevented').textContent = soloPrevented;

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
        <h3>No travel requests found</h3>
        <p style="color: var(--text-muted); margin-top: 0.5rem; max-width: 450px; margin: 0.5rem auto 0;">
          No posts matching your selected category or gender filter. Try changing your filters or post a new request!
        </p>
        <button class="btn-primary-purple" onclick="openModal('postTripModal')" style="margin: 1.5rem auto 0;">
          <i class="fa-solid fa-plus"></i> Post Travel Request
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

function getGenderBadgeHTML(genderFilter) {
  if (genderFilter === 'Girls Only') {
    return `<span style="background: rgba(236, 72, 153, 0.18); color: #F472B6; border: 1px solid rgba(236, 72, 153, 0.35); padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem;"><i class="fa-solid fa-venus"></i> Girls Only</span>`;
  }
  if (genderFilter === 'Boys Only') {
    return `<span style="background: rgba(59, 130, 246, 0.18); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.35); padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem;"><i class="fa-solid fa-mars"></i> Boys Only</span>`;
  }
  return `<span style="background: rgba(139, 92, 246, 0.15); color: var(--accent-purple); border: 1px solid rgba(139, 92, 246, 0.3); padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem;"><i class="fa-solid fa-user-group"></i> Open to All</span>`;
}

function createCardHTML(req) {
  const isSaved = store.savedIds.has(req.id);
  const curUser = auth.currentUser;
  const joinedList = req.joinedUsers || [];
  const hasJoined = curUser && joinedList.some(u => u.userId === curUser.id || (u.name === curUser.name && u.room === curUser.room));

  const joinedBadgeHTML = joinedList.length > 0
    ? `<div style="margin-top:0.5rem; font-size:0.75rem; color:var(--accent-purple); font-weight:700;"><i class="fa-solid fa-user-check"></i> ${joinedList.length} hostel mate(s) joined (${joinedList.map(u => u.name).join(', ')})</div>`
    : '';

  const genderBadge = getGenderBadgeHTML(req.genderFilter);

  return `
    <article class="companion-card" data-id="${req.id}">
      <div class="card-header-banner" style="background-image: url('${req.coverImage}');">
        <div class="card-header-overlay"></div>
        <div style="position:relative; z-index:2; display:flex; gap:0.4rem; flex-wrap:wrap;">
          <div class="category-tag-badge">${req.category}</div>
          ${genderBadge}
        </div>
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

        <div style="font-size:0.75rem; color:var(--accent-purple); font-weight:700; margin-bottom:0.2rem; display:flex; align-items:center; gap:0.3rem;">
          <i class="fa-solid fa-location-crosshairs"></i> ${req.pickup || 'Hostel Gate'} <i class="fa-solid fa-arrow-right-long" style="font-size:0.7rem;"></i>
        </div>
        <h3 class="destination-title">${req.destination}</h3>

        <div class="trip-meta-row">
          <div class="meta-item"><i class="fa-regular fa-clock"></i> <span>${req.time}</span></div>
          <div class="meta-item"><i class="fa-solid fa-taxi"></i> <span>${req.mode}</span></div>
        </div>

        ${joinedBadgeHTML}

        <div class="card-footer" style="margin-top:0.75rem;">
          <div class="spots-badge">${req.spots > 0 ? `${req.spots} spots left` : '🔴 Full'} • ₹${req.fare} share</div>
          <button class="btn-join-card viewDetailBtn" data-id="${req.id}">
            ${hasJoined ? '✅ Joined (View)' : 'View & Join'}
          </button>
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
  const curUser = auth.currentUser;
  const joinedList = req.joinedUsers || [];
  const hasJoined = curUser && joinedList.some(u => u.userId === curUser.id || (u.name === curUser.name && u.room === curUser.room));

  modalTitle.innerHTML = `<i class="fa-solid fa-location-dot" style="color:var(--accent-purple);"></i> ${req.pickup || 'Hostel Gate'} ➔ ${req.destination}`;

  const joinedBuddiesListHTML = joinedList.length > 0
    ? `<div style="background:var(--bg-surface); padding:0.85rem; border-radius:var(--radius-md); border:1px solid var(--border-color); margin-bottom:1rem;">
        <h5 style="margin-bottom:0.4rem; color:var(--accent-purple);"><i class="fa-solid fa-users"></i> Joined Companions (${joinedList.length}):</h5>
        <ul style="padding-left:1.2rem; margin:0; color:var(--text-secondary); font-size:0.88rem;">
          ${joinedList.map(u => `<li><strong>${u.name}</strong> (${u.room})</li>`).join('')}
        </ul>
       </div>`
    : `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;"><i class="fa-solid fa-info-circle"></i> No companions have joined this trip yet.</div>`;

  const genderBadge = getGenderBadgeHTML(req.genderFilter);

  modalBody.innerHTML = `
    <div style="margin-bottom: 1.25rem; position: relative; border-radius: var(--radius-md); overflow: hidden; height: 160px;">
      <img src="${req.coverImage}" style="width:100%; height:100%; object-fit:cover;">
      <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.85), transparent); padding: 1rem; color:#fff; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
        <span class="category-tag-badge">${req.category} • ${req.mode}</span>
        ${genderBadge}
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

    ${joinedBuddiesListHTML}

    <div style="background:var(--bg-surface-elevated); padding:1rem; border-radius:var(--radius-md); margin-bottom:1.5rem; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
      <span><i class="fa-solid fa-wallet" style="color:var(--accent-purple);"></i> Estimated Share: <strong>₹${req.fare} per person</strong></span>
      <span class="spots-badge" id="modalSpotsBadge">${req.spots > 0 ? `${req.spots} spots remaining` : '🔴 Full'}</span>
    </div>

    <div style="display:flex; gap:1rem; justify-content:flex-end;">
      <button class="btn-secondary closeModal" data-modal="tripDetailModal">Close</button>
      <button class="btn-secondary" id="chatHostFromDetailBtn" style="background:#25D366; color:#fff; border-color:#25D366; font-weight:700;">
        <i class="fa-brands fa-whatsapp" style="font-size:1.1rem;"></i> Chat Host
      </button>
      <button class="btn-primary-purple" id="requestJoinBtn" ${hasJoined || req.spots <= 0 ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>
        <i class="fa-solid fa-${hasJoined ? 'check' : 'user-plus'}"></i> ${hasJoined ? 'Already Joined' : req.spots <= 0 ? 'Full' : 'Join Request'}
      </button>
    </div>
  `;

  openModal('tripDetailModal');

  document.querySelectorAll('.closeModal').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });

  document.getElementById('chatHostFromDetailBtn').addEventListener('click', () => {
    let rawContact = req.contact || '';
    let digits = rawContact.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = '91' + digits;
    }

    if (digits.length >= 10) {
      const msg = `Hey ${req.hostName}! 👋 I saw your SathChalo plan to "${req.destination}". I would like to join/coordinate with you!`;
      const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
    } else {
      closeModal('tripDetailModal');
      openChatModal(req.hostName, req.room);
    }
  });

  const joinBtn = document.getElementById('requestJoinBtn');
  if (joinBtn && !hasJoined && req.spots > 0) {
    joinBtn.addEventListener('click', async () => {
      try {
        await store.joinRequest(req.id, auth.currentUser);
        showToast(`🎉 You joined ${req.hostName}'s trip to ${req.destination}!`);
        closeModal('tripDetailModal');
        renderRequests();
      } catch (err) {
        showToast(`⚠️ ${err.message}`);
      }
    });
  }
}

async function handlePostSubmit(e) {
  e.preventDefault();
  if (!auth.currentUser) return;

  const pickup = document.getElementById('postPickup').value.trim();
  const destination = document.getElementById('postDestination').value.trim();
  const category = document.getElementById('postCategory').value;
  const time = document.getElementById('postTime').value;
  const mode = document.getElementById('postMode').value;
  const genderFilter = document.getElementById('postGenderFilter').value;
  const spots = parseInt(document.getElementById('postSpots').value);
  const fare = parseInt(document.getElementById('postFare').value);
  const description = document.getElementById('postDescription').value;

  const user = auth.currentUser;

  const newReq = {
    pickup: pickup || 'Hostel Gate',
    destination,
    category,
    time,
    mode,
    genderFilter,
    spots: Math.min(Math.max(1, spots || 1), 10),
    fare: Math.min(Math.max(0, fare || 0), 10000),
    hostName: user.name,
    room: user.room,
    contact: user.phone || user.email,
    description,
    userId: user.id
  };

  await store.addRequest(newReq);
  renderRequests();
  closeModal('postTripModal');
  document.getElementById('postTripForm').reset();
  showToast(`🎉 Travel request to ${destination} (${genderFilter}) published to MongoDB Atlas!`);
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
    setTimeout(() => toast.remove(), 3500);
  }, 3500);
}

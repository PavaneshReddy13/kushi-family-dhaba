/**
 * Kushi Family Dhaba - Customer App JS
 * Handles all customer-side logic: navigation, ordering, polling, billing
 */

// ── State ────────────────────────────────────────────────────────
const state = {
  customerName: '',
  customerId: null,
  tableId: null,
  cart: [],               // { id, name, price, emoji, quantity }
  myOrders: [],           // placed order objects
  cartOpen: false,
  pollTimer: null,
  paid: false
};

// ── Section Navigation ───────────────────────────────────────────
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id + '-section').classList.add('active');
  window.scrollTo(0, 0);
}

// ── Landing ──────────────────────────────────────────────────────
async function startOrdering() {
  const name = document.getElementById('customer-name').value.trim();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  state.customerName = name;
  document.getElementById('nav-menu-btn').style.display = '';
  document.getElementById('nav-cart-btn').style.display = '';
  showSection('table');
  loadTables();
}

// ── Tables ───────────────────────────────────────────────────────
async function loadTables() {
  try {
    const res = await fetch('/api/tables');
    const data = await res.json();
    renderTables(data.tables);
  } catch (e) { showToast('Could not load tables', 'error'); }
}

function renderTables(tables) {
  const grid = document.getElementById('tables-grid');
  const fullMsg = document.getElementById('tables-full-msg');
  const allOccupied = tables.every(t => t.status === 'occupied');

  if (allOccupied) {
    grid.style.display = 'none';
    fullMsg.style.display = 'block';
    return;
  }

  fullMsg.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = tables.map(t => `
    <div class="table-card ${t.status}" onclick="${t.status === 'available' ? `selectTable(${t.id})` : ''}">
      <div class="table-number">${t.id}</div>
      <div class="table-status">${t.status === 'available' ? '● Available' : '● Occupied'}</div>
      ${t.status === 'occupied' && t.customerName ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.3rem">${t.customerName}</div>` : ''}
    </div>
  `).join('');
}

async function selectTable(tableId) {
  try {
    const res = await fetch('/api/tables/occupy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, customerName: state.customerName })
    });
    const data = await res.json();
    if (!data.success) { showToast(data.message, 'error'); loadTables(); return; }

    state.tableId = tableId;
    state.customerId = data.customerId;

    // Update nav info
    document.getElementById('display-name').textContent = state.customerName;
    document.getElementById('display-table').textContent = tableId;
    document.getElementById('orders-display-name').textContent = state.customerName;
    document.getElementById('orders-display-table').textContent = tableId;

    showSection('menu');
    loadMenu();
    showToast(`Welcome ${state.customerName}! Table ${tableId} is yours 🎉`, 'success');
  } catch (e) { showToast('Error selecting table', 'error'); }
}

// ── Menu ─────────────────────────────────────────────────────────
let allMenuItems = [];
let activeCategory = 'All';

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    allMenuItems = data.menu;
    renderCategories();
    renderMenu(allMenuItems);
  } catch (e) { showToast('Could not load menu', 'error'); }
}

function renderCategories() {
  const cats = ['All', ...new Set(allMenuItems.map(i => i.category))];
  const container = document.getElementById('menu-categories');
  container.innerHTML = cats.map(cat => `
    <button class="cat-btn ${cat === 'All' ? 'active' : ''}" onclick="filterCategory('${cat}')">${cat}</button>
  `).join('');
}

function filterCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.textContent === cat));
  const filtered = cat === 'All' ? allMenuItems : allMenuItems.filter(i => i.category === cat);
  renderMenu(filtered);
}

function renderMenu(items) {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = items.map(item => `
    <div class="menu-card" id="card-${item.id}">
      <span class="menu-card-emoji">${item.emoji}</span>
      <div class="menu-card-body">
        <div class="menu-card-name">${item.name}</div>
        <div class="menu-card-desc">${item.desc}</div>
        <div class="menu-card-footer">
          <span class="menu-price">₹${item.price}</span>
          <button class="add-to-cart-btn" onclick="addToCart(${item.id})" id="add-btn-${item.id}">+ Add</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Cart ─────────────────────────────────────────────────────────
function addToCart(itemId) {
  if (state.paid) { showToast('Payment already completed', 'error'); return; }
  const item = allMenuItems.find(i => i.id === itemId);
  if (!item) return;

  const existing = state.cart.find(i => i.id === itemId);
  if (existing) existing.quantity++;
  else state.cart.push({ ...item, quantity: 1 });

  // Animation
  const btn = document.getElementById(`add-btn-${itemId}`);
  if (btn) { btn.classList.add('added'); setTimeout(() => btn.classList.remove('added'), 400); }

  updateCartUI();
  showToast(`${item.name} added to cart`, 'success');
}

function updateCartCount(qty) {
  const existing = state.cart.find(i => i.id === qty.id);
  if (!existing) return;
  existing.quantity = qty.q;
  if (existing.quantity <= 0) state.cart = state.cart.filter(i => i.id !== qty.id);
  updateCartUI();
}

function changeQty(itemId, delta) {
  const item = state.cart.find(i => i.id === itemId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) state.cart = state.cart.filter(i => i.id !== itemId);
  updateCartUI();
}

function updateCartUI() {
  const total = state.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = state.cart.reduce((s, i) => s + i.quantity, 0);

  document.getElementById('cart-count').textContent = count;

  const list = document.getElementById('cart-items-list');
  const footer = document.getElementById('cart-footer');

  if (!state.cart.length) {
    list.innerHTML = '<div class="cart-empty">Your cart is empty</div>';
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'block';
  document.getElementById('cart-total-amount').textContent = `₹${total}`;

  list.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <span class="cart-item-emoji">${item.emoji}</span>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${item.price} each</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
        <span class="qty-value">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
      </div>
    </div>
  `).join('');
}

function toggleCart() {
  state.cartOpen = !state.cartOpen;
  document.getElementById('cart-sidebar').classList.toggle('open', state.cartOpen);
}

// ── Order Placement ───────────────────────────────────────────────
async function placeOrder() {
  if (!state.cart.length) { showToast('Cart is empty!', 'error'); return; }

  // Show loading
  showModal('<div class="spinner"></div><p style="margin-top:1rem;color:var(--text-secondary)">Placing your order...</p>');

  const items = state.cart.map(i => ({ id: i.id, name: i.name, price: i.price, emoji: i.emoji, quantity: i.quantity }));

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId: state.tableId, customerId: state.customerId, customerName: state.customerName, items })
    });
    const data = await res.json();

    if (!data.success) { hideModal(); showToast(data.message, 'error'); return; }

    state.myOrders.push(data.order);
    state.cart = [];
    updateCartUI();
    toggleCart();

    setTimeout(() => {
      hideModal();
      showSection('orders');
      renderOrders();
      startPolling();
      showToast('Order placed! Waiting for confirmation 🍽️', 'success');
    }, 800);

  } catch (e) { hideModal(); showToast('Error placing order', 'error'); }
}

// ── Orders View ───────────────────────────────────────────────────
function viewOrders() {
  showSection('orders');
  renderOrders();
}

async function renderOrders() {
  try {
    const res = await fetch(`/api/orders/customer/${state.customerId}`);
    const data = await res.json();
    state.myOrders = data.orders;
  } catch (e) {}

  const list = document.getElementById('orders-list');
  if (!state.myOrders.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:2rem">No orders yet</div>';
    return;
  }

  list.innerHTML = state.myOrders.map(order => `
    <div class="order-status-card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem">
        <div>
          <strong style="font-family:'Playfair Display',serif;font-size:1.1rem">Order #${order.id}</strong>
          <span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.8rem">${formatTime(order.placedAt)}</span>
        </div>
        <span class="status-badge ${order.status}">
          ${order.status === 'pending' ? '<span class="pulse"></span>' : ''}
          ${order.status}
        </span>
      </div>
      <div style="margin-bottom:0.8rem">
        ${order.items.map(i => `
          <div style="font-size:0.95rem;color:var(--text-secondary);padding:0.2rem 0">
            ${i.emoji} ${i.name} × ${i.quantity}
            <span style="float:right;font-family:'JetBrains Mono',monospace;color:var(--turmeric)">₹${i.price * i.quantity}</span>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:0.8rem">
        <span style="color:var(--text-muted)">Order Total</span>
        <span style="font-family:'JetBrains Mono',monospace;color:var(--turmeric)">₹${order.total}</span>
      </div>
    </div>
  `).join('');
}

// ── Polling ───────────────────────────────────────────────────────
function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/orders/customer/${state.customerId}`);
      const data = await res.json();
      const prev = JSON.stringify(state.myOrders.map(o => o.status));
      state.myOrders = data.orders;
      const curr = JSON.stringify(data.orders.map(o => o.status));
      if (prev !== curr) {
        renderOrders();
        data.orders.forEach(o => {
          if (o.status === 'accepted') showToast(`Order #${o.id} has been accepted! 🎉`, 'success');
          if (o.status === 'rejected') showToast(`Order #${o.id} was rejected`, 'error');
        });
      }
    } catch (e) {}
  }, 4000);
}

// ── Billing ───────────────────────────────────────────────────────
async function viewBilling() {
  showSection('billing');
  try {
    const res = await fetch(`/api/tables/${state.tableId}`);
    const data = await res.json();
    renderBill(data.table);
  } catch (e) { showToast('Could not load bill', 'error'); }
}

function renderBill(table) {
  const card = document.getElementById('bill-card');
  if (!table.acceptedOrders.length) {
    card.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:2rem">No accepted orders yet. Please wait for your orders to be accepted.</p>`;
    return;
  }

  // Group items
  const grouped = {};
  table.acceptedOrders.forEach(item => {
    const key = item.name;
    if (!grouped[key]) grouped[key] = { ...item, quantity: 0 };
    grouped[key].quantity += item.quantity;
  });

  const rows = Object.values(grouped).map(item => `
    <div class="bill-row">
      <span>${item.emoji} ${item.name} × ${item.quantity}</span>
      <span style="font-family:'JetBrains Mono',monospace;color:var(--turmeric)">₹${item.price * item.quantity}</span>
    </div>
  `).join('');

  card.innerHTML = `
    <div style="margin-bottom:1.5rem">
      <h3 style="font-family:'Playfair Display',serif;color:var(--turmeric);margin-bottom:0.3rem">Kushi Family Dhaba</h3>
      <p style="font-size:0.85rem;color:var(--text-muted)">Table ${state.tableId} · ${state.customerName}</p>
    </div>
    ${rows}
    <div class="bill-total">
      <span>Grand Total</span>
      <span>₹${table.totalBill}</span>
    </div>
  `;
}

async function proceedToPay() {
  if (state.paid) return;
  showModal('<div class="spinner"></div><p style="margin-top:1rem;color:var(--text-secondary)">Processing payment...</p>');

  try {
    const res = await fetch(`/api/tables/${state.tableId}`);
    const data = await res.json();
    if (!data.table.acceptedOrders.length) {
      hideModal();
      showToast('No accepted orders to bill', 'error');
      return;
    }
  } catch (e) {}

  setTimeout(() => {
    hideModal();
    state.paid = true;
    if (state.pollTimer) clearInterval(state.pollTimer);
    showSection('payment');
    showToast('Payment successful! Thank you 🙏', 'success');
  }, 1500);
}

function startFresh() {
  // Reset state
  Object.assign(state, { customerName: '', customerId: null, tableId: null, cart: [], myOrders: [], cartOpen: false, paid: false });
  document.getElementById('customer-name').value = '';
  document.getElementById('cart-count').textContent = '0';
  document.getElementById('nav-menu-btn').style.display = 'none';
  document.getElementById('nav-cart-btn').style.display = 'none';
  if (document.getElementById('cart-sidebar').classList.contains('open')) toggleCart();
  showSection('landing');
}

// ── Helpers ───────────────────────────────────────────────────────
function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function toggleMusic() {
  const audio = document.getElementById('bg-music');
  const btn = document.getElementById('music-btn');
  if (audio.paused) {
    // Use Web Audio API to generate simple tone since external URLs may not work
    playDhabaMusic();
    btn.textContent = 'Pause Music';
  } else {
    audio.pause();
    btn.textContent = 'Play Dhaba Music';
  }
}

// Simple ambient music using Web Audio API
let audioCtx = null;
let musicNodes = [];
let musicPlaying = false;

function playDhabaMusic() {
  if (musicPlaying) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  musicPlaying = true;

  const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88];
  let step = 0;

  function playNote() {
    if (!musicPlaying) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = notes[step % notes.length];
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 1.5);
    step++;
    setTimeout(playNote, 1800);
  }
  playNote();

  document.getElementById('music-btn').textContent = 'Stop Music';
  document.getElementById('music-btn').onclick = () => {
    musicPlaying = false;
    if (audioCtx) audioCtx.close();
    document.getElementById('music-btn').textContent = 'Play Dhaba Music';
    document.getElementById('music-btn').onclick = toggleMusic;
  };
}

// Enter key on name input
document.getElementById('customer-name').addEventListener('keydown', e => { if (e.key === 'Enter') startOrdering(); });

// Click outside cart to close
document.addEventListener('click', e => {
  if (state.cartOpen && !document.getElementById('cart-sidebar').contains(e.target) && !document.getElementById('nav-cart-btn').contains(e.target)) {
    toggleCart();
  }
});

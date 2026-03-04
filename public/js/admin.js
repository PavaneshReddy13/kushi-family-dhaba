/**
 * Kushi Family Dhaba - Admin Panel JS
 * All functions namespaced under Admin{} to match HTML onclick="Admin.xxx()"
 */

const Admin = (() => {

  // ── State ──────────────────────────────────────────────────────
  let pollTimer = null;
  let lastPendingCount = 0;
  let currentTableId = null;
  let currentBillId = null;

  // ── Helpers ────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function toast(msg, type = 'info') {
    const container = $('toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
  }

  function fmt(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch(e) {}
  }

  // ── Login ──────────────────────────────────────────────────────
  async function login() {
    const pwd = $('loginPwd').value.trim();
    if (!pwd) { toast('Please enter password', 'error'); return; }

    const btn = document.querySelector('.btn-gold');
    btn.textContent = 'Logging in...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();

      if (data.success) {
        $('loginPage').style.display = 'none';
        $('dashboard').style.display = 'flex';
        initDashboard();
      } else {
        const errEl = document.querySelector('.hint');
        if (errEl) { errEl.textContent = '❌ Wrong password. Try admin@123'; errEl.style.color = '#e74c3c'; }
        toast('Invalid password', 'error');
      }
    } catch (e) {
      toast('Cannot connect to server. Is it running?', 'error');
    } finally {
      btn.textContent = 'Login →';
      btn.disabled = false;
    }
  }

  function logout() {
    if (pollTimer) clearInterval(pollTimer);
    $('dashboard').style.display = 'none';
    $('loginPage').style.display = '';
    $('loginPwd').value = '';
    const errEl = document.querySelector('.hint');
    if (errEl) { errEl.textContent = 'To change password, contact the developer.'; errEl.style.color = ''; }
  }

  // ── Dashboard Init ─────────────────────────────────────────────
  function initDashboard() {
    refresh();
    pollTimer = setInterval(() => { refresh(); }, 5000);
    setInterval(() => {
      const el = $('lastUpdate');
      if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN');
    }, 1000);
  }

  async function refresh() {
    await loadOrders();
    await loadTables();
  }

  // ── Tab Navigation ─────────────────────────────────────────────
  function showTab(name, el) {
    // Hide all tabs
    ['tabOrders', 'tabTables', 'tabReport'].forEach(id => {
      const t = $(id);
      if (t) t.style.display = 'none';
    });
    // Remove active from all nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show selected
    const tab = $('tab' + name.charAt(0).toUpperCase() + name.slice(1));
    if (tab) tab.style.display = '';
    if (el) el.classList.add('active');

    // Update header
    const titles = {
      orders: ['Orders Queue', 'Manage incoming orders (FIFO)'],
      tables: ['Table Management', 'View and manage all tables'],
      report: ['Daily Report', 'Revenue and customer statistics']
    };
    if (titles[name]) {
      $('tabTitle').textContent = titles[name][0];
      $('tabSub').textContent = titles[name][1];
    }

    if (name === 'report') loadReport();
    if (name === 'tables') loadTables();
  }

  // ── Orders ─────────────────────────────────────────────────────
  async function loadOrders() {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();

      const pending = data.orders.filter(o => o.status === 'pending');

      // Badge
      const badge = $('pendingBadge');
      if (badge) {
        badge.style.display = pending.length ? '' : 'none';
        badge.textContent = pending.length;
      }

      // Notification sound on new orders
      if (pending.length > lastPendingCount && lastPendingCount >= 0) {
        beep();
        if (lastPendingCount > 0) toast('🔔 New order received!', 'success');
      }
      lastPendingCount = pending.length;

      renderOrders(data.orders);
    } catch (e) {}
  }

  function renderOrders(orders) {
    const list = $('ordersList');
    if (!list) return;

    if (!orders.length) {
      list.innerHTML = '<div class="empty">No orders yet. Orders will appear here automatically.</div>';
      return;
    }

    // FIFO: pending first (oldest first), then others (newest first)
    const pending = orders.filter(o => o.status === 'pending');
    const done    = orders.filter(o => o.status !== 'pending').reverse();
    const sorted  = [...pending, ...done];

    list.innerHTML = sorted.map(order => `
      <div class="order-card ${order.status === 'pending' ? 'order-pending' : ''}">
        <div class="order-top">
          <div class="order-meta">
            <span class="tag tag-name">👤 ${order.customerName}</span>
            <span class="tag tag-table">🪑 Table ${order.tableId}</span>
            <span class="tag tag-time">#${order.id} · ${fmt(order.placedAt)}</span>
          </div>
          <span class="status-chip status-${order.status}">
            ${order.status === 'pending' ? '<span class="dot"></span>' : ''}
            ${order.status.toUpperCase()}
          </span>
        </div>
        <div class="order-items">
          ${order.items.map(i => `
            <div class="order-item">
              <span>${i.emoji} ${i.name} × ${i.quantity}</span>
              <span class="item-price">₹${i.price * i.quantity}</span>
            </div>
          `).join('')}
        </div>
        <div class="order-foot">
          <span class="order-total">Total: ₹${order.total}</span>
          ${order.status === 'pending' ? `
            <div class="order-actions">
              <button class="btn btn-green btn-sm" onclick="Admin.acceptOrder(${order.id})">✓ Accept</button>
              <button class="btn btn-red btn-sm"   onclick="Admin.rejectOrder(${order.id})">✗ Reject</button>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  async function acceptOrder(orderId) {
    try {
      const res = await fetch('/api/orders/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (data.success) { toast(`Order #${orderId} accepted ✓`, 'success'); refresh(); }
      else toast(data.message, 'error');
    } catch(e) { toast('Error accepting order', 'error'); }
  }

  async function rejectOrder(orderId) {
    try {
      const res = await fetch('/api/orders/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (data.success) { toast(`Order #${orderId} rejected`, 'error'); refresh(); }
      else toast(data.message, 'error');
    } catch(e) { toast('Error', 'error'); }
  }

  // ── Tables ─────────────────────────────────────────────────────
  async function loadTables() {
    try {
      const res = await fetch('/api/tables');
      const data = await res.json();
      renderTables(data.tables);
    } catch(e) {}
  }

  function renderTables(tables) {
    const grid = $('tablesGrid');
    if (!grid) return;

    grid.innerHTML = tables.map(t => `
      <div class="tbl-card tbl-${t.status}" onclick="Admin.openTable(${t.id})">
        <div class="tbl-num">${t.id}</div>
        <div class="tbl-status">${t.status === 'available' ? '● Available' : '● Occupied'}</div>
        ${t.customerName ? `<div class="tbl-customer">${t.customerName}</div>` : ''}
        ${t.totalBill > 0 ? `<div class="tbl-bill">₹${t.totalBill}</div>` : ''}
      </div>
    `).join('');
  }

  async function openTable(tableId) {
    currentTableId = tableId;
    currentBillId = null;
    try {
      const res = await fetch('/api/tables/' + tableId);
      const data = await res.json();
      renderModal(data.table);
      $('tableModal').classList.add('open');
    } catch(e) { toast('Error loading table', 'error'); }
  }

  function renderModal(table) {
    $('modalTitle').textContent = `Table ${table.id}`;

    if (table.status === 'available') {
      $('modalBody').innerHTML = `<p class="empty">This table is currently available.</p>`;
      $('modalFtr').innerHTML = '';
      return;
    }

    // Group accepted items
    const grouped = {};
    table.acceptedOrders.forEach(item => {
      if (!grouped[item.name]) grouped[item.name] = { ...item, quantity: 0 };
      grouped[item.name].quantity += item.quantity;
    });
    const items = Object.values(grouped);

    $('modalBody').innerHTML = `
      <div class="modal-info">
        <span class="info-label">CUSTOMER</span>
        <span class="info-val">${table.customerName}</span>
      </div>
      ${items.length === 0
        ? `<p class="empty" style="margin:1rem 0">No accepted orders yet.</p>`
        : `
          <div class="modal-info" style="margin-top:1rem">
            <span class="info-label">ACCEPTED ITEMS</span>
          </div>
          ${items.map(i => `
            <div class="bill-row">
              <span>${i.emoji} ${i.name} × ${i.quantity}</span>
              <span>₹${i.price * i.quantity}</span>
            </div>
          `).join('')}
          <div class="bill-total">
            <span>Total</span>
            <span>₹${table.totalBill}</span>
          </div>
        `
      }
    `;

    $('modalFtr').innerHTML = `
      <button class="btn btn-gold btn-sm"    onclick="Admin.generateBill(${table.id})">🧾 Generate Bill</button>
      <button class="btn btn-outline btn-sm" onclick="Admin.printBill(${table.id})">🖨️ Print</button>
      <button class="btn btn-red btn-sm"     onclick="Admin.clearTable(${table.id})">🗑️ Clear Table</button>
    `;
  }

  async function generateBill(tableId) {
    try {
      const res = await fetch('/api/billing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId })
      });
      const data = await res.json();
      if (!data.success) { toast(data.message, 'error'); return; }
      currentBillId = data.bill.id;
      toast('Bill generated: ' + data.bill.id, 'success');

      // Add "Mark Paid" button
      const ftr = $('modalFtr');
      const paidBtn = document.createElement('button');
      paidBtn.className = 'btn btn-green btn-sm';
      paidBtn.textContent = '✅ Mark Paid & Clear';
      paidBtn.onclick = () => completeBilling(tableId, data.bill.id);
      ftr.appendChild(paidBtn);
    } catch(e) { toast('Error generating bill', 'error'); }
  }

  async function completeBilling(tableId, billId) {
    try {
      const res = await fetch('/api/billing/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, billId })
      });
      const data = await res.json();
      if (data.success) {
        toast(`✅ Payment ₹${data.paidTotal} recorded. Table cleared!`, 'success');
        closeModal();
        refresh();
      } else { toast(data.message, 'error'); }
    } catch(e) { toast('Error completing billing', 'error'); }
  }

  async function clearTable(tableId) {
    if (!confirm(`Clear Table ${tableId}? This will complete billing and free the table.`)) return;
    try {
      const genRes = await fetch('/api/billing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId })
      });
      const genData = await genRes.json();
      if (!genData.success) { toast(genData.message, 'error'); return; }
      await completeBilling(tableId, genData.bill.id);
    } catch(e) { toast('Error clearing table', 'error'); }
  }

  function printBill(tableId) {
    fetch('/api/tables/' + tableId).then(r => r.json()).then(({ table: t }) => {
      const grouped = {};
      t.acceptedOrders.forEach(i => {
        if (!grouped[i.name]) grouped[i.name] = { ...i, quantity: 0 };
        grouped[i.name].quantity += i.quantity;
      });
      const lines = Object.values(grouped).map(i => `${i.name.padEnd(20)} x${i.quantity}  Rs.${i.price * i.quantity}`).join('\n');
      const receipt = `============================\n   KUSHI FAMILY DHABA\n============================\nTable  : ${t.id}\nName   : ${t.customerName}\nDate   : ${new Date().toLocaleDateString('en-IN')}\n----------------------------\n${lines}\n----------------------------\nTOTAL  : Rs.${t.totalBill}\n============================\n  Thank you! Visit again 🙏\n============================`;
      const w = window.open('', '_blank', 'width=380,height=520');
      w.document.write(`<pre style="font-family:monospace;font-size:13px;padding:20px">${receipt}</pre>`);
      w.document.title = 'Bill - Table ' + tableId;
      setTimeout(() => w.print(), 300);
    });
  }

  function closeModal() {
    $('tableModal').classList.remove('open');
    currentTableId = null;
    currentBillId = null;
  }

  // ── Daily Report ───────────────────────────────────────────────
  async function loadReport() {
    try {
      const res = await fetch('/api/daily-report');
      const data = await res.json();
      renderReport(data);
    } catch(e) { toast('Error loading report', 'error'); }
  }

  function renderReport(data) {
    const today = data.today;
    const sg = $('statsGrid');
    if (sg) sg.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-val">₹${today.revenue}</div>
        <div class="stat-lbl">Today's Revenue</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-val">${today.totalCustomers}</div>
        <div class="stat-lbl">Customers Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🧾</div>
        <div class="stat-val">${today.completedBills}</div>
        <div class="stat-lbl">Completed Bills</div>
      </div>
    `;

    const rb = $('reportBody');
    if (!rb) return;
    if (!data.history.length) {
      rb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;opacity:.5">No data yet</td></tr>';
      return;
    }
    rb.innerHTML = data.history.map(row => `
      <tr>
        <td>${row.date}</td>
        <td>₹${row.revenue}</td>
        <td>${row.totalCustomers}</td>
        <td>${row.completedBills}</td>
      </tr>
    `).join('');
  }

  // ── Public API ─────────────────────────────────────────────────
  return { login, logout, refresh, showTab, acceptOrder, rejectOrder, openTable, generateBill, clearTable, printBill, closeModal, loadReport };

})();

// Enter key on password field
document.addEventListener('DOMContentLoaded', () => {
  const pwd = document.getElementById('loginPwd');
  if (pwd) pwd.addEventListener('keydown', e => { if (e.key === 'Enter') Admin.login(); });
});

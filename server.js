/**
 * Kushi Family Dhaba - Backend Server (No external dependencies)
 * Uses Node.js built-in http module
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

// ── In-Memory Data ──────────────────────────────────────────────
let tables = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, status: 'available', customerName: null, customerId: null,
  acceptedOrders: [], totalBill: 0, occupiedAt: null
}));

let ordersQueue = [];
let orderIdCounter = 1;
let billingRecords = [];
let dailyRevenue = {};
const ADMIN_PASSWORD = 'admin@123';

const menuItems = [
  { id: 1, name: 'Butter Chicken', price: 280, emoji: '🍛', category: 'Main Course', desc: 'Creamy tomato-based curry' },
  { id: 2, name: 'Paneer Tikka', price: 220, emoji: '🧆', category: 'Starters', desc: 'Smoky grilled cottage cheese' },
  { id: 3, name: 'Veg Biryani', price: 180, emoji: '🍚', category: 'Rice', desc: 'Aromatic basmati with spices' },
  { id: 4, name: 'Tandoori Roti', price: 30, emoji: '🫓', category: 'Breads', desc: 'Freshly baked clay oven bread' },
  { id: 5, name: 'Lassi', price: 60, emoji: '🥛', category: 'Drinks', desc: 'Chilled sweet yogurt drink' },
  { id: 6, name: 'Dal Makhani', price: 160, emoji: '🫘', category: 'Main Course', desc: 'Slow-cooked black lentils' },
  { id: 7, name: 'Chicken Biryani', price: 320, emoji: '🍗', category: 'Rice', desc: 'Fragrant spiced rice with chicken' },
  { id: 8, name: 'Naan', price: 40, emoji: '🫓', category: 'Breads', desc: 'Soft leavened flatbread' },
  { id: 9, name: 'Mango Lassi', price: 80, emoji: '🥭', category: 'Drinks', desc: 'Sweet mango yogurt blend' },
  { id: 10, name: 'Gulab Jamun', price: 90, emoji: '🍮', category: 'Desserts', desc: 'Soft dumplings in rose syrup' },
  { id: 11, name: 'Chana Masala', price: 150, emoji: '🥘', category: 'Main Course', desc: 'Spiced chickpea curry' },
  { id: 12, name: 'Raita', price: 50, emoji: '🥗', category: 'Sides', desc: 'Cooling yogurt with vegetables' }
];

// ── Helpers ─────────────────────────────────────────────────────
function getToday() { return new Date().toISOString().split('T')[0]; }
function ensureDay(d) { if (!dailyRevenue[d]) dailyRevenue[d] = { customers: [], revenue: 0, completedBills: 0 }; }
function calcTotal(items) { return items.reduce((s, i) => s + i.price * i.quantity, 0); }

const mime = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon' };

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch(e) { resolve({}); } });
  });
}

// ── Router ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // ─ Static files ─
  if (!pathname.startsWith('/api/')) {
    let filePath;
    if (pathname === '/' || pathname === '/index.html') filePath = path.join(__dirname, 'public', 'index.html');
    else if (pathname === '/admin' || pathname === '/admin.html') filePath = path.join(__dirname, 'public', 'admin.html');
    else filePath = path.join(__dirname, 'public', pathname);
    sendFile(res, filePath); return;
  }

  // ─ API Routes ─
  let body = {};
  if (method === 'POST') body = await readBody(req);

  try {
    // GET /api/menu
    if (pathname === '/api/menu' && method === 'GET') {
      sendJSON(res, 200, { success: true, menu: menuItems }); return;
    }

    // GET /api/tables
    if (pathname === '/api/tables' && method === 'GET') {
      sendJSON(res, 200, { success: true, tables }); return;
    }

    // GET /api/tables/:id
    const tableMatch = pathname.match(/^\/api\/tables\/(\d+)$/);
    if (tableMatch && method === 'GET') {
      const t = tables.find(t => t.id === parseInt(tableMatch[1]));
      if (!t) { sendJSON(res, 404, { success: false, message: 'Not found' }); return; }
      sendJSON(res, 200, { success: true, table: t }); return;
    }

    // POST /api/tables/occupy
    if (pathname === '/api/tables/occupy' && method === 'POST') {
      const { tableId, customerName } = body;
      const t = tables.find(t => t.id === tableId);
      if (!t) { sendJSON(res, 404, { success: false, message: 'Table not found' }); return; }
      if (t.status === 'occupied') { sendJSON(res, 400, { success: false, message: 'Table already occupied' }); return; }
      const customerId = `cust-${Date.now()}-${Math.random().toString(36).substr(2,5)}`;
      Object.assign(t, { status: 'occupied', customerName, customerId, acceptedOrders: [], totalBill: 0, occupiedAt: new Date().toISOString() });
      sendJSON(res, 200, { success: true, customerId, table: t }); return;
    }

    // POST /api/orders
    if (pathname === '/api/orders' && method === 'POST') {
      const { tableId, customerId, customerName, items } = body;
      const t = tables.find(t => t.id === tableId);
      if (!t || t.customerId !== customerId) { sendJSON(res, 400, { success: false, message: 'Invalid session' }); return; }
      const order = { id: orderIdCounter++, tableId, customerId, customerName, items, status: 'pending', placedAt: new Date().toISOString(), total: calcTotal(items) };
      ordersQueue.push(order);
      sendJSON(res, 200, { success: true, order }); return;
    }

    // GET /api/orders
    if (pathname === '/api/orders' && method === 'GET') {
      sendJSON(res, 200, { success: true, orders: ordersQueue, pending: ordersQueue.filter(o => o.status === 'pending') }); return;
    }

    // GET /api/orders/status/:id
    const statusMatch = pathname.match(/^\/api\/orders\/status\/(\d+)$/);
    if (statusMatch && method === 'GET') {
      const order = ordersQueue.find(o => o.id === parseInt(statusMatch[1]));
      if (!order) { sendJSON(res, 404, { success: false, message: 'Not found' }); return; }
      sendJSON(res, 200, { success: true, status: order.status, order }); return;
    }

    // GET /api/orders/customer/:id
    const custMatch = pathname.match(/^\/api\/orders\/customer\/(.+)$/);
    if (custMatch && method === 'GET') {
      sendJSON(res, 200, { success: true, orders: ordersQueue.filter(o => o.customerId === custMatch[1]) }); return;
    }

    // POST /api/orders/accept
    if (pathname === '/api/orders/accept' && method === 'POST') {
      const order = ordersQueue.find(o => o.id === body.orderId);
      if (!order) { sendJSON(res, 404, { success: false, message: 'Not found' }); return; }
      order.status = 'accepted'; order.acceptedAt = new Date().toISOString();
      const t = tables.find(t => t.id === order.tableId);
      if (t) {
        t.acceptedOrders.push(...order.items.map(i => ({ ...i, orderId: order.id, addedAt: new Date().toISOString() })));
        t.totalBill = t.acceptedOrders.reduce((s, i) => s + i.price * i.quantity, 0);
      }
      sendJSON(res, 200, { success: true, order, table: t }); return;
    }

    // POST /api/orders/reject
    if (pathname === '/api/orders/reject' && method === 'POST') {
      const order = ordersQueue.find(o => o.id === body.orderId);
      if (!order) { sendJSON(res, 404, { success: false, message: 'Not found' }); return; }
      order.status = 'rejected'; order.rejectedAt = new Date().toISOString();
      sendJSON(res, 200, { success: true, order }); return;
    }

    // POST /api/billing/generate
    if (pathname === '/api/billing/generate' && method === 'POST') {
      const t = tables.find(t => t.id === body.tableId);
      if (!t || t.status !== 'occupied') { sendJSON(res, 400, { success: false, message: 'Table not occupied' }); return; }
      const bill = { id: `BILL-${Date.now()}`, tableId: t.id, customerName: t.customerName, items: t.acceptedOrders, total: t.totalBill, generatedAt: new Date().toISOString(), paid: false };
      billingRecords.push(bill);
      sendJSON(res, 200, { success: true, bill }); return;
    }

    // POST /api/billing/complete
    if (pathname === '/api/billing/complete' && method === 'POST') {
      const t = tables.find(t => t.id === body.tableId);
      if (!t) { sendJSON(res, 404, { success: false, message: 'Not found' }); return; }
      const bill = billingRecords.find(b => b.id === body.billId);
      if (bill) { bill.paid = true; bill.paidAt = new Date().toISOString(); }
      const today = getToday(); ensureDay(today);
      dailyRevenue[today].revenue += t.totalBill;
      dailyRevenue[today].completedBills += 1;
      if (!dailyRevenue[today].customers.includes(t.customerName)) dailyRevenue[today].customers.push(t.customerName);
      const paidTotal = t.totalBill;
      Object.assign(t, { status: 'available', customerName: null, customerId: null, acceptedOrders: [], totalBill: 0, occupiedAt: null });
      sendJSON(res, 200, { success: true, message: 'Table cleared', paidTotal }); return;
    }

    // GET /api/daily-report
    if (pathname === '/api/daily-report' && method === 'GET') {
      const today = getToday(); ensureDay(today);
      const d = dailyRevenue[today];
      const history = Object.entries(dailyRevenue).map(([date, v]) => ({ date, totalCustomers: v.customers.length, revenue: v.revenue, completedBills: v.completedBills })).sort((a, b) => b.date.localeCompare(a.date));
      sendJSON(res, 200, { success: true, today: { date: today, totalCustomers: d.customers.length, revenue: d.revenue, completedBills: d.completedBills }, history }); return;
    }

    // POST /api/admin/login
    if (pathname === '/api/admin/login' && method === 'POST') {
      if (body.password === ADMIN_PASSWORD) sendJSON(res, 200, { success: true });
      else sendJSON(res, 401, { success: false, message: 'Invalid password' });
      return;
    }

    sendJSON(res, 404, { success: false, message: 'Route not found' });

  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { success: false, message: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🍛 Kushi Family Dhaba Server Ready      ║
║   Customer: http://localhost:${PORT}           ║
║   Admin:    http://localhost:${PORT}/admin      ║
║   Password: admin@123                     ║
╚═══════════════════════════════════════════╝
  `);
});

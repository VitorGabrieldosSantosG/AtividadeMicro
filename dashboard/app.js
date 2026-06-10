//gateways
const GATEWAY_URL = 'http://localhost:3000';
const REGISTRY_URL = 'http://localhost:3005';
const SERVICE_URLS = {
  gateway:  'http://localhost:3000',
  registry: 'http://localhost:3005',
  users:    'http://localhost:3001',
  products: 'http://localhost:3002',
  orders:   'http://localhost:3003',
  payments: 'http://localhost:3004',
};

// úteis
function formatJSON(data) {
  return JSON.stringify(data, null, 2);
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast--visible toast--${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function setResult(panelId, urlText, data, isError = false) {
  const el = document.getElementById(`result-${panelId}`);
  const urlEl = document.getElementById(`result-url-${panelId}`);
  if (urlEl) urlEl.textContent = urlText;
  if (el) {
    el.textContent = formatJSON(data);
    el.style.color = isError ? '#ff6479' : '#a8d8a8';
  }
}

async function apiCall(method, path, body = null) {
  const url = `${GATEWAY_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'demo-key' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data, url };
}

//Verifica serviços disponíveis 
async function checkServiceHealth(service, port, path) {
  const dot = document.getElementById(`dot-${service}`);
  const meta = document.getElementById(`meta-${service}`);
  const badge = document.getElementById(`badge-${service}`);

  dot.className = 'status-dot status-dot--checking';

  try {
    // Tenta via gateway para os serviços, diretamente para o gateway
    const url = service === 'gateway'
      ? `${SERVICE_URLS.gateway}${path}`
      : `${SERVICE_URLS[service]}${path}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();

    dot.className = 'status-dot status-dot--online';
    if (badge) badge.style.opacity = '1';

    // Mostra info relevante
    const info = [];
    if (data.totalUsers !== undefined) info.push(`${data.totalUsers} usuários`);
    if (data.totalProducts !== undefined) info.push(`${data.totalProducts} produtos`);
    if (data.totalOrders !== undefined) info.push(`${data.totalOrders} pedidos`);
    if (data.totalPayments !== undefined) info.push(`${data.totalPayments} pagamentos`);
    if (data.version) info.push(`v${data.version}`);

    if (meta) meta.textContent = info.length ? `Online — ${info.join(' | ')}` : 'Online';
    return true;
  } catch (err) {
    dot.className = 'status-dot status-dot--offline';
    if (badge) badge.style.opacity = '0.4';
    if (meta) meta.textContent = `Offline — ${err.message}`;
    return false;
  }
}

async function checkAllHealth() {
  showToast('Verificando todos os serviços...', 'info');

  const checks = [
    checkServiceHealth('registry', 3005, '/health'),
    checkServiceHealth('gateway', 3000, '/health'),
    checkServiceHealth('users', 3001, '/health'),
    checkServiceHealth('products', 3002, '/health'),
    checkServiceHealth('orders', 3003, '/health'),
    checkServiceHealth('payments', 3004, '/health'),
  ];

  const results = await Promise.all(checks);
  const online = results.filter(Boolean).length;
  showToast(`${online}/6 serviços online`, online === 6 ? 'success' : 'error');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('tab-panel--active'));

  document.getElementById(`tab-${tabName}`).classList.add('tab--active');
  document.getElementById(`panel-${tabName}`).classList.add('tab-panel--active');

  // Auto-carrega o registry ao entrar na aba
  if (tabName === 'discovery') {
    loadRegistry();
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

// Ações do usuário
async function listUsers() {
  try {
    const { data, url } = await apiCall('GET', '/api/users');
    setResult('users', url, data);
    showToast(`${data.total} usuário(s) encontrado(s)`, 'success');
  } catch (err) {
    setResult('users', '/api/users', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

async function getUser() {
  const id = document.getElementById('user-id-input').value;
  if (!id) return showToast('Informe um ID', 'error');
  try {
    const { data, url, ok } = await apiCall('GET', `/api/users/${id}`);
    setResult('users', url, data, !ok);
    showToast(ok ? `Usuário #${id} encontrado` : 'Usuário não encontrado', ok ? 'success' : 'error');
  } catch (err) {
    setResult('users', `/api/users/${id}`, { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

async function createUser() {
  const nome  = document.getElementById('new-user-name').value;
  const email = document.getElementById('new-user-email').value;
  const telefone = document.getElementById('new-user-phone').value;

  if (!nome || !email) return showToast('Nome e email são obrigatórios', 'error');

  try {
    const { data, url, ok } = await apiCall('POST', '/api/users', { nome, email, telefone });
    setResult('users', `POST ${url}`, data, !ok);
    showToast(ok ? `Usuário "${nome}" criado!` : `${data.error}`, ok ? 'success' : 'error');
    if (ok) {
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-email').value = '';
      document.getElementById('new-user-phone').value = '';
    }
  } catch (err) {
    setResult('users', 'POST /api/users', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

// Ações referentes a produto
async function listProducts(query = '') {
  try {
    const { data, url } = await apiCall('GET', `/api/products${query}`);
    setResult('products', url, data);
    showToast(` ${data.total} produto(s) encontrado(s)`, 'success');
  } catch (err) {
    setResult('products', '/api/products', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

async function getProduct() {
  const id = document.getElementById('product-id-input').value;
  if (!id) return showToast('Informe um ID', 'error');
  try {
    const { data, url, ok } = await apiCall('GET', `/api/products/${id}`);
    setResult('products', url, data, !ok);
    showToast(ok ? `Produto #${id} encontrado` : 'Produto não encontrado', ok ? 'success' : 'error');
  } catch (err) {
    setResult('products', `/api/products/${id}`, { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

async function createProduct() {
  const nome     = document.getElementById('new-product-name').value;
  const preco    = document.getElementById('new-product-price').value;
  const estoque  = document.getElementById('new-product-stock').value;

  if (!nome || !preco) return showToast(' Nome e preço são obrigatórios', 'error');

  try {
    const { data, url, ok } = await apiCall('POST', '/api/products', { nome, preco: parseFloat(preco), estoque: parseInt(estoque) || 0 });
    setResult('products', `POST ${url}`, data, !ok);
    showToast(ok ? ` Produto "${nome}" criado!` : `${data.error}`, ok ? 'success' : 'error');
    if (ok) {
      document.getElementById('new-product-name').value = '';
      document.getElementById('new-product-price').value = '';
      document.getElementById('new-product-stock').value = '';
    }
  } catch (err) {
    setResult('products', 'POST /api/products', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

//Ações referentes a pedido
async function listOrders() {
  try {
    const { data, url } = await apiCall('GET', '/api/orders');
    setResult('orders', url, data);
    showToast(`${data.total} pedido(s) encontrado(s)`, 'success');
  } catch (err) {
    setResult('orders', '/api/orders', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

async function getOrder() {
  const id = document.getElementById('order-id-input').value;
  if (!id) return showToast(' Informe um ID', 'error');
  try {
    showToast(' Consultando Order, User e Product Services...', 'info');
    const { data, url, ok } = await apiCall('GET', `/api/orders/${id}`);
    setResult('orders', url, data, !ok);
    showToast(ok ? `Pedido #${id} encontrado (com dados de User + Product!)` : 'Pedido não encontrado', ok ? 'success' : 'error');
  } catch (err) {
    setResult('orders', `/api/orders/${id}`, { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

async function createOrder() {
  const usuarioId = parseInt(document.getElementById('order-user-id').value);
  const produtoId = parseInt(document.getElementById('order-product-id').value);
  const quantidade = parseInt(document.getElementById('order-qty').value);

  if (!usuarioId || !produtoId || !quantidade) {
    return showToast(' Preencha todos os campos', 'error');
  }

  try {
    showToast(' Criando pedido... (consultando User + Product Services)', 'info');
    const { data, url, ok } = await apiCall('POST', '/api/orders', {
      usuarioId,
      itens: [{ produtoId, quantidade }],
    });
    setResult('orders', `POST ${url}`, data, !ok);
    showToast(ok ? ` Pedido criado! Total: R$ ${data.data?.total}` : `${data.error}`, ok ? 'success' : 'error');
  } catch (err) {
    setResult('orders', 'POST /api/orders', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

//Ações de pagamento
async function listPayments() {
  try {
    const { data, url } = await apiCall('GET', '/api/payments');
    setResult('payments', url, data);
    showToast(`${data.total} pagamento(s) encontrado(s)`, 'success');
  } catch (err) {
    setResult('payments', '/api/payments', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

async function processPayment() {
  const pedidoId = parseInt(document.getElementById('pay-order-id').value);
  const valor    = parseFloat(document.getElementById('pay-valor').value);
  const metodo   = document.getElementById('pay-metodo').value;

  if (!pedidoId || !valor) return showToast(' Informe pedido ID e valor', 'error');

  try {
    showToast(' Processando pagamento no gateway...', 'info');
    const { data, url, ok } = await apiCall('POST', '/api/payments', { pedidoId, valor, metodo });
    setResult('payments', `POST ${url}`, data, !ok);

    if (ok) {
      showToast(` Pagamento aprovado! Tx: ${data.data?.codigoTransacao}`, 'success');
    } else {
      showToast(`${data.message || data.error}`, 'error');
    }
  } catch (err) {
    setResult('payments', 'POST /api/payments', { error: err.message }, true);
    showToast('Falha ao conectar ao serviço', 'error');
  }
}

// não utilizado, mas mostra o status do registry e gateway 
let autoRefreshInterval = null;
let autoRefreshEnabled  = true;

function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(() => {
    if (autoRefreshEnabled) loadRegistry();
  }, 5000);
}

function stopAutoRefresh() {  
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

function toggleAutoRefresh() {
  autoRefreshEnabled = !autoRefreshEnabled;
  const label  = document.getElementById('discovery-auto-label');
  const btn    = document.getElementById('btn-toggle-auto');
  if (autoRefreshEnabled) {
    label.textContent = 'Auto-refresh: ON';
    btn.textContent   = 'Pausar';
    loadRegistry();
  } else {
    label.textContent = 'Auto-refresh: OFF';
    btn.textContent   = 'Retomar';
  }
}

function formatUptime(registeredAtIso) {
  const seconds = Math.floor((Date.now() - new Date(registeredAtIso).getTime()) / 1000);
  if (seconds < 60)  return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function renderRegistryEntry(svc) {
  const isHealthy = svc.status === 'healthy';
  const icon = { users: '', products: '', orders: '', payments: '' }[svc.name] || '🔧';
  const sinceMs = svc.secondsSinceHeartbeat;
  const ttl = 15;
  const pct = Math.min(100, Math.round((sinceMs / ttl) * 100));

  return `
    <div class="registry-entry registry-entry--${svc.status}">
      <div class="registry-entry__header">
        <span class="registry-entry__icon">${icon}</span>
        <div class="registry-entry__info">
          <span class="registry-entry__name">${svc.name}</span>
          <span class="registry-entry__url">${svc.url}</span>
        </div>
        <span class="registry-badge registry-badge--${svc.status}">
          ${isHealthy ? ' healthy' : ' expired'}
        </span>
      </div>
      <div class="registry-entry__meta">
        <span> Registrado: ${new Date(svc.registeredAt).toLocaleTimeString('pt-BR')}</span>
        <span> Úoltimo heartbeat: ${sinceMs}s atrás</span>
        <span> Uptime: ${formatUptime(svc.registeredAt)}</span>
        <span>v${svc.version}</span>
      </div>
      <div class="registry-entry__ttl">
        <div class="ttl-bar">
          <div class="ttl-bar__fill ttl-bar__fill--${svc.status}" style="width: ${isHealthy ? pct : 100}%"></div>
        </div>
        <span class="ttl-bar__label">TTL: ${sinceMs}s / ${ttl}s</span>
      </div>
    </div>
  `;
}

// Carrega serviços registrados no Service Registry
async function loadRegistry() {
  const list = document.getElementById('registry-list');
  try {
    const res  = await fetch(`${REGISTRY_URL}/services`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const services = data.data || [];

    // Atualiza stats
    document.getElementById('stat-total').textContent   = data.total ?? 0;
    document.getElementById('stat-healthy').textContent = data.totalHealthy ?? 0;
    document.getElementById('stat-expired').textContent = data.totalExpired ?? 0;

    if (services.length === 0) {
      list.innerHTML = '<div class="registry-empty"> Nenhum serviço registrado. Inicie os microserviços.</div>';
    } else {
      list.innerHTML = services.map(renderRegistryEntry).join('');
    }

    const now = new Date().toLocaleTimeString('pt-BR');
    document.getElementById('discovery-last-update').textContent = `Última atualização: ${now}`;
  } catch (err) {
    list.innerHTML = `<div class="registry-empty registry-empty--error"> Service Registry indisponível (porta 3005)<br><small>${err.message}</small></div>`;
    document.getElementById('stat-total').textContent   = '–';
    document.getElementById('stat-healthy').textContent = '–';
    document.getElementById('stat-expired').textContent = '–';
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Verifica saúde dos serviços ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkAllHealth, 800);
});

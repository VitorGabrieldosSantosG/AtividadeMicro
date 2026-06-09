//gateways
const GATEWAY_URL = 'http://localhost:3000';
const SERVICE_URLS = {
  gateway:  'http://localhost:3000',
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
    checkServiceHealth('gateway', 3000, '/health'),
    checkServiceHealth('users', 3001, '/health'),
    checkServiceHealth('products', 3002, '/health'),
    checkServiceHealth('orders', 3003, '/health'),
    checkServiceHealth('payments', 3004, '/health'),
  ];

  const results = await Promise.all(checks);
  const online = results.filter(Boolean).length;
  showToast(`${online}/5 serviços online`, online === 5 ? 'success' : 'error');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('tab-panel--active'));

  document.getElementById(`tab-${tabName}`).classList.add('tab--active');
  document.getElementById(`panel-${tabName}`).classList.add('tab-panel--active');
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

async function getPaymentReport() {
  try {
    const { data, url } = await apiCall('GET', '/api/payments/relatorio/resumo');
    setResult('payments', url, data);
    showToast('Relatório gerado!', 'success');
  } catch (err) {
    setResult('payments', '/api/payments/relatorio/resumo', { error: err.message }, true);
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

// ============================================================
// FLUXO COMPLETO — Demonstração da comunicação entre serviços
// ============================================================
function addLog(message, type = '') {
  const body = document.getElementById('flow-log-body');
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const line = document.createElement('span');
  line.className = `log-line log-line--${type}`;
  line.textContent = `[${time}] ${message}`;
  body.appendChild(line);
  body.appendChild(document.createTextNode('\n'));
  body.scrollTop = body.scrollHeight;
}

function setFlowStep(step, status) {
  const stepEl = document.getElementById(`flow-step-${step}`);
  const statusEl = document.getElementById(`flow-status-${step}`);

  stepEl.className = `flow-step flow-step--${status}`;
  if (status === 'running') statusEl.textContent = '⏳';
  else if (status === 'success') statusEl.textContent = '';
  else if (status === 'error') statusEl.textContent = '❌';
}

async function runCompleteFlow() {
  const usuarioId  = parseInt(document.getElementById('flow-user-id').value);
  const produtoId  = parseInt(document.getElementById('flow-product-id').value);
  const quantidade = parseInt(document.getElementById('flow-qty').value);
  const metodo     = document.getElementById('flow-metodo').value;

  const btn = document.getElementById('btn-run-flow');
  btn.disabled = true;
  btn.textContent = 'Executando...';

  // Reset
  const logBody = document.getElementById('flow-log-body');
  logBody.innerHTML = '';
  [1,2,3].forEach(i => setFlowStep(i, ''));
  document.querySelectorAll('.flow-step').forEach(el => el.className = 'flow-step');

  addLog('Iniciando fluxo completo de microserviços...', 'gateway');
  addLog(`   Usuário: #${usuarioId} | Produto: #${produtoId} | Qty: ${quantidade} | Pagamento: ${metodo}`, '');

  //Cria pedido
  setFlowStep(1, 'running');
  addLog('\n[PASSO 1] Cliente → API Gateway → Order Service', 'gateway');
  await sleep(500);

  addLog('   → Gateway recebe requisição e roteia para Order Service (:3003)', 'gateway');
  await sleep(400);

  addLog('   → Order Service valida dados e consulta User Service (:3001)', 'orders');
  await sleep(400);

  addLog('   → User Service retorna dados do usuário', 'users');
  await sleep(300);

  addLog('   → Order Service consulta Product Service (:3002)', 'orders');
  await sleep(400);

  addLog('   → Product Service verifica estoque e retorna dados do produto', 'products');
  await sleep(300);

  addLog('   → Order Service reserva estoque no Product Service', 'products');
  await sleep(400);

  let orderId = null;
  let orderTotal = null;

  try {
    const { data, ok } = await apiCall('POST', '/api/orders', {
      usuarioId,
      itens: [{ produtoId, quantidade }],
    });

    if (ok) {
      orderId = data.data.id;
      orderTotal = data.data.total;
      setFlowStep(1, 'success');
      addLog(` Pedido #${orderId} criado com sucesso! Total: R$ ${orderTotal}`, 'success');
    } else {
      setFlowStep(1, 'error');
      addLog(`Falha ao criar pedido: ${data.error || data.message}`, 'error');
      return finishFlow(btn, false);
    }
  } catch (err) {
    setFlowStep(1, 'error');
    addLog(`Erro de conexão: ${err.message}`, 'error');
    return finishFlow(btn, false);
  }

  await sleep(600);

  //Processa pagamento
  setFlowStep(2, 'running');
  addLog('\n[PASSO 2] Cliente → API Gateway → Payment Service', 'gateway');
  await sleep(400);

  addLog(`   → Gateway roteia para Payment Service (:3004)`, 'gateway');
  await sleep(300);

  addLog(`   → Payment Service processa R$ ${orderTotal} via ${metodo}`, 'payments');
  await sleep(500);

  addLog('   → Enviando para gateway de pagamento externo (simulado)...', 'payments');
  await sleep(600);

  let paymentApproved = false;

  try {
    const { data, ok } = await apiCall('POST', '/api/payments', {
      pedidoId: orderId,
      valor: orderTotal,
      metodo,
    });

    paymentApproved = ok;

    if (ok) {
      setFlowStep(2, 'success');
      addLog(` Pagamento APROVADO! Transação: ${data.data.codigoTransacao}`, 'success');
    } else {
      setFlowStep(2, 'error');
      addLog(`Pagamento RECUSADO: ${data.data?.motivoRecusa || data.message}`, 'error');
    }
  } catch (err) {
    setFlowStep(2, 'error');
    addLog(`Erro de conexão: ${err.message}`, 'error');
  }

  await sleep(600);

  //Atualiza o status do pedido
  setFlowStep(3, 'running');
  addLog('\n🔄 [PASSO 3] Payment Service → Order Service (callback automático)', 'payments');
  await sleep(400);

  addLog('   → Payment Service notifica Order Service sobre resultado', 'payments');
  await sleep(300);

  if (paymentApproved) {
    addLog(`   → Order Service atualiza pedido #${orderId} → status: "pago"`, 'orders');
    await sleep(400);
    setFlowStep(3, 'success');
    addLog(' Pedido atualizado automaticamente pelo callback!', 'success');
  } else {
    addLog(`   → Order Service mantém pedido #${orderId} como "pendente"`, 'orders');
    await sleep(400);
    setFlowStep(3, 'error');
    addLog('Pedido aguardando nova tentativa de pagamento', 'error');
  }

  await sleep(400);
  addLog('\n════════════════════════════════════════════', '');
  addLog(paymentApproved
    ? 'FLUXO COMPLETO CONCLUÍDO COM SUCESSO!'
    : ' Fluxo concluído com falha no pagamento. Pedido aguardando.',
    paymentApproved ? 'success' : 'error');
  addLog('════════════════════════════════════════════', '');

  finishFlow(btn, paymentApproved);
  showToast(
    paymentApproved ? 'Fluxo completo executado com sucesso!' : ' Fluxo executado (pagamento recusado)',
    paymentApproved ? 'success' : 'error'
  );
}

function finishFlow(btn, success) {
  btn.disabled = false;
  btn.textContent = success ? '🔄 Executar Novamente' : '🔄 Tentar Novamente';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Verifica saúde dos serviços ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkAllHealth, 800);
});

// Porta: 3004

// Responsabilidades:
//  - processamento de pagamentos
//  - Validação de dados de pagamento
//  - Simulação de gateway de pagamento externo
//  - Notifica Order Service sobre resultado do pagamento
//
// Service Discovery:
//  - Se registra no Service Registry (porta 3005) ao iniciar
//  - Envia heartbeat a cada 10s
//  - Descobre endereço do Order Service dinamicamente

// Padrão: Callback 


const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fetch = require('node-fetch');
const http = require('http');

const app = express();
const PORT = 3004;
const SERVICE_NAME    = 'payments';
const REGISTRY_HOST   = 'localhost';
const REGISTRY_PORT   = 3005;
const HEARTBEAT_MS    = 10_000;

// Auto Registro
function registryRequest(method, path, body = null) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: REGISTRY_HOST,
      port:     REGISTRY_PORT,
      path,
      method,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
      },
    };
    const req = http.request(options, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(null));
    if (data) req.write(data);
    req.end();
  });
}

async function registerWithDiscovery() {
  const status = await registryRequest('POST', '/register', {
    name:    SERVICE_NAME,
    host:    'localhost',
    port:    PORT,
    version: '1.0.0',
    metadata: { type: 'financial', description: 'Processamento de pagamentos' },
  });
  if (status === 201) {
    console.log(`[PAYMENT SERVICE]  Registrado no Service Registry (porta ${REGISTRY_PORT})`);
  } else if (status === 200) {
    console.log(`[PAYMENT SERVICE]  Re-registrado no Service Registry`);
  } else {
    console.warn(`[PAYMENT SERVICE]   Não foi possível registrar (status: ${status})`);
  }
}

async function sendHeartbeat() {
  const status = await registryRequest('PUT', `/heartbeat/${SERVICE_NAME}`);
  if (!status) {
    console.warn(`[PAYMENT SERVICE]   Heartbeat falhou — Registry indisponível`);
  }
}

async function deregister() {
  await registryRequest('DELETE', `/register/${SERVICE_NAME}`);
  console.log(`[PAYMENT SERVICE]   Removido do Service Registry`);
}

process.on('SIGTERM', async () => { await deregister(); process.exit(0); });
process.on('SIGINT',  async () => { await deregister(); process.exit(0); });

// descobre endereço do Order Service

const discoveryCache = {};
const DISCOVERY_CACHE_TTL = 5_000;

async function discoverService(name) {
  const cached = discoveryCache[name];
  if (cached && (Date.now() - cached.ts) < DISCOVERY_CACHE_TTL) {
    return cached.url;
  }
  try {
    const res  = await fetch(`http://${REGISTRY_HOST}:${REGISTRY_PORT}/services/${name}`);
    if (!res.ok) return null;
    const body = await res.json();
    const url  = body.data?.url;
    if (url) discoveryCache[name] = { url, ts: Date.now() };
    return url;
  } catch {
    return null;
  }
}

async function resolveOrderService() {
  const url = await discoverService('orders');
  if (url) return url;
  console.warn(`[PAYMENT SERVICE]   Usando fallback para Order Service`);
  return 'http://localhost:3003';
}

//banco
let payments = [
  {
    id: 1,
    pedidoId: 1,
    valor: 459.90,
    metodo: 'cartao_credito',
    status: 'aprovado',
    codigoTransacao: 'TXN-2024030100001',
    parcelas: 1,
    dataCriacao: '2024-03-01T10:05:00Z',
    dataProcessamento: '2024-03-01T10:05:03Z',
  },
];

let nextId = 2;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Service', 'payment-service');
  res.setHeader('X-Service-Port', PORT);
  next();
});

// Simulação de gateway de pagamento externo
function simularGatewayPagamento(metodo, valor, dadosCartao) {
  //simulação latências
  const aprovado = Math.random() > 0.15; // 85% de aprovação
  
  // Cartão terminado em 0000 é sempre recusado (para demo)
  if (dadosCartao && dadosCartao.numero && dadosCartao.numero.endsWith('0000')) {
    return { aprovado: false, motivo: 'Cartão recusado pela operadora' };
  }
  
  return {
    aprovado,
    codigoTransacao: aprovado ? `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}` : null,
    motivo: aprovado ? null : 'Saldo insuficiente',
  };
}

// Notifica pedido sobre resultado do pagamento
async function notificarPedido(pedidoId, status) {
  try {
    const orderUrl = await resolveOrderService();
    console.log(`[PAYMENT SERVICE] → Notificando Order Service (${orderUrl}): pedido #${pedidoId} → ${status}`);
    await fetch(`${orderUrl}/orders/${pedidoId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch (err) {
    console.error(`[PAYMENT SERVICE] ✗ Falha ao notificar Order Service: ${err.message}`);
  }
}

// rotas

// GET /health
app.get('/health', (req, res) => {
  res.json({
    service: 'Payment Service',
    status: 'healthy',
    port: PORT,
    totalPayments: payments.length,
    metodosSuportados: ['cartao_credito', 'cartao_debito', 'pix', 'boleto'],
    timestamp: new Date().toISOString(),
  });
});

// GET /payments — Listar pagamentos
app.get('/payments', (req, res) => {
  const { pedidoId, status } = req.query;
  let resultado = payments;
  
  if (pedidoId) resultado = resultado.filter(p => p.pedidoId === parseInt(pedidoId));
  if (status) resultado = resultado.filter(p => p.status === status);
  
  res.json({
    service: 'Payment Service',
    total: resultado.length,
    data: resultado,
  });
});

// GET /payments/:id — Buscar pagamento por ID
app.get('/payments/:id', (req, res) => {
  const payment = payments.find(p => p.id === parseInt(req.params.id));
  
  if (!payment) {
    return res.status(404).json({ error: 'Pagamento não encontrado' });
  }
  
  res.json({ service: 'Payment Service', data: payment });
});

// POST /payments — Processar novo pagamento
app.post('/payments', async (req, res) => {
  const { pedidoId, valor, metodo, parcelas, dadosCartao, chavePix } = req.body;
  
  if (!pedidoId || !valor || !metodo) {
    return res.status(400).json({ error: 'pedidoId, valor e metodo são obrigatórios' });
  }
  
  const metodosValidos = ['cartao_credito', 'cartao_debito', 'pix', 'boleto'];
  if (!metodosValidos.includes(metodo)) {
    return res.status(400).json({ error: 'Método de pagamento inválido', metodosValidos });
  }
  
  console.log(`\n[PAYMENT SERVICE] Processando pagamento: R$ ${valor} via ${metodo} (Pedido #${pedidoId})`);
  
  // Verifica se já existe pagamento aprovado para este pedido
  const pagamentoExistente = payments.find(p => p.pedidoId === pedidoId && p.status === 'aprovado');
  if (pagamentoExistente) {
    return res.status(409).json({
      error: 'Pedido já possui pagamento aprovado',
      pagamento: pagamentoExistente,
    });
  }
  
  // Processa com gateway externo simulado
  const resultadoGateway = simularGatewayPagamento(metodo, valor, dadosCartao);
  
  const novoPagamento = {
    id: nextId++,
    pedidoId,
    valor: parseFloat(valor),
    metodo,
    parcelas: metodo === 'cartao_credito' ? (parcelas || 1) : 1,
    status: resultadoGateway.aprovado ? 'aprovado' : 'recusado',
    codigoTransacao: resultadoGateway.codigoTransacao,
    motivoRecusa: resultadoGateway.motivo,
    dataCriacao: new Date().toISOString(),
    dataProcessamento: new Date().toISOString(),
  };
  
  payments.push(novoPagamento);
  
  if (resultadoGateway.aprovado) {
    console.log(`[PAYMENT SERVICE]Pagamento APROVADO! Transação: ${novoPagamento.codigoTransacao}`);
    // Notifica Order Service que o pagamento foi aprovado
    await notificarPedido(pedidoId, 'pago');
    
    res.status(201).json({
      service: 'Payment Service',
      message: 'Pagamento aprovado com sucesso!',
      data: novoPagamento,
    });
  } else {
    console.log(`[PAYMENT SERVICE] Pagamento RECUSADO: ${resultadoGateway.motivo}`);
    
    res.status(402).json({
      service: 'Payment Service',
      message: ` Pagamento recusado: ${resultadoGateway.motivo}`,
      data: novoPagamento,
    });
  }
});

// GET /payments/relatorio/resumo — Relatório de pagamentos
app.get('/relatorio/resumo', (req, res) => {
  const aprovados = payments.filter(p => p.status === 'aprovado');
  const recusados = payments.filter(p => p.status === 'recusado');
  const totalArrecadado = aprovados.reduce((sum, p) => sum + p.valor, 0);
  
  const porMetodo = {};
  aprovados.forEach(p => {
    porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.valor;
  });
  
  res.json({
    service: 'Payment Service',
    data: {
      totalTransacoes: payments.length,
      aprovados: aprovados.length,
      recusados: recusados.length,
      taxaAprovacao: `${((aprovados.length / payments.length) * 100).toFixed(1)}%`,
      totalArrecadado: parseFloat(totalArrecadado.toFixed(2)),
      receitaPorMetodo: porMetodo,
    },
  });
});

app.listen(PORT, async () => {
  console.log(`[PAYMENT SERVICE] 💳 Payment Service rodando na porta ${PORT}`);
  setTimeout(async () => {
    await registerWithDiscovery();
    setInterval(sendHeartbeat, HEARTBEAT_MS);
  }, 1000);
});

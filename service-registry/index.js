
// Service Registry — Porta 3005
//
// Responsabilidades:
//  - Receber registros de serviços (self-registration)
//  - Manter TTL com heartbeat: serviços que param de enviar
//    heartbeat são marcados como "expired" após 15 segundos
//  - Expor API de consulta para o API Gateway (client-side discovery)
//  - Expor API de listagem para o Dashboard
//
// Padrão: Service Registry / Service Discovery


const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const app  = express();
const PORT = 3005;


const TTL_MS          = 15_000; // tempo máximo sem heartbeat (ms)
const CLEANUP_INTERVAL = 5_000; // intervalo para marcar expirados (ms)

const registry = {};

//Uteis
function now() {
  return Date.now();
}

function toIso(ts) {
  return new Date(ts).toISOString();
}

function markExpired() {
  const threshold = now() - TTL_MS;
  for (const name of Object.keys(registry)) {
    const svc = registry[name];
    if (svc.lastHeartbeat < threshold && svc.status !== 'expired') {
      svc.status = 'expired';
      console.log(`[REGISTRY]  Serviço expirado (sem heartbeat): ${name}`);
    }
  }
}

// Marca serviços expirados periodicamente
setInterval(markExpired, CLEANUP_INTERVAL);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Service', 'service-registry');
  res.setHeader('X-Service-Port', PORT);
  next();
});

// Rotas

// GET /health — Saúde do próprio registry
app.get('/health', (req, res) => {
  const total   = Object.keys(registry).length;
  const healthy = Object.values(registry).filter(s => s.status === 'healthy').length;
  res.json({
    service:        'Service Registry',
    status:         'healthy',
    port:           PORT,
    totalRegistered: total,
    totalHealthy:   healthy,
    totalExpired:   total - healthy,
    ttlMs:          TTL_MS,
    timestamp:      new Date().toISOString(),
  });
});

// POST /register — Registrar (ou re-registrar) um serviço
// Body: { name, host, port, version?, metadata? }
app.post('/register', (req, res) => {
  const { name, host, port, version = '1.0.0', metadata = {} } = req.body;

  if (!name || !host || !port) {
    return res.status(400).json({
      error: 'Campos obrigatórios: name, host, port',
    });
  }

  const isNew = !registry[name];
  const ts    = now();

  registry[name] = {
    name,
    host,
    port,
    version,
    metadata,
    url:           `http://${host}:${port}`,
    registeredAt:  registry[name]?.registeredAt || ts,
    lastHeartbeat: ts,
    status:        'healthy',
  };

  const action = isNew ? 'Registrado' : 'Re-registrado';
  console.log(`[REGISTRY]  ${action}: ${name} → http://${host}:${port}`);

  res.status(isNew ? 201 : 200).json({
    service: 'Service Registry',
    message: `Serviço '${name}' ${action.toLowerCase()} com sucesso`,
    data:    registry[name],
  });
});

// PUT /heartbeat/:name — Renovar TTL de um serviço
app.put('/heartbeat/:name', (req, res) => {
  const { name } = req.params;
  const svc = registry[name];

  if (!svc) {
    return res.status(404).json({
      error: `Serviço '${name}' não encontrado no registry. Faça o registro primeiro.`,
    });
  }

  svc.lastHeartbeat = now();
  svc.status        = 'healthy';

  res.json({
    service:       'Service Registry',
    message:       `Heartbeat recebido de '${name}'`,
    lastHeartbeat: toIso(svc.lastHeartbeat),
    status:        svc.status,
  });
});

// DELETE /register/:name — Remover um serviço do registry
app.delete('/register/:name', (req, res) => {
  const { name } = req.params;

  if (!registry[name]) {
    return res.status(404).json({ error: `Serviço '${name}' não encontrado` });
  }

  delete registry[name];
  console.log(`[REGISTRY]   Serviço removido: ${name}`);

  res.json({
    service: 'Service Registry',
    message: `Serviço '${name}' removido do registry`,
  });
});

// GET /services — Listar todos os serviços 
app.get('/services', (req, res) => {
  const { status } = req.query; // ?status=healthy | expired
  let list = Object.values(registry);

  if (status) {
    list = list.filter(s => s.status === status);
  }

  const result = list.map(s => ({
    ...s,
    registeredAt:  toIso(s.registeredAt),
    lastHeartbeat: toIso(s.lastHeartbeat),
    secondsSinceHeartbeat: Math.floor((now() - s.lastHeartbeat) / 1000),
  }));

  res.json({
    service:      'Service Registry',
    total:        result.length,
    totalHealthy: result.filter(s => s.status === 'healthy').length,
    totalExpired: result.filter(s => s.status === 'expired').length,
    data:         result,
  });
});

// GET /services/:name — Descobrir um serviço específico (usado pelo API Gateway)
app.get('/services/:name', (req, res) => {
  const { name } = req.params;
  const svc = registry[name];

  if (!svc) {
    return res.status(404).json({
      error:   `Serviço '${name}' não encontrado no registry`,
      message: 'O serviço pode estar offline ou nunca ter se registrado',
    });
  }

  if (svc.status === 'expired') {
    return res.status(503).json({
      error:         `Serviço '${name}' está expirado (sem heartbeat)`,
      lastHeartbeat: toIso(svc.lastHeartbeat),
      status:        'expired',
    });
  }

  res.json({
    service: 'Service Registry',
    data: {
      ...svc,
      registeredAt:  toIso(svc.registeredAt),
      lastHeartbeat: toIso(svc.lastHeartbeat),
      secondsSinceHeartbeat: Math.floor((now() - svc.lastHeartbeat) / 1000),
    },
  });
});

// ----------------------------------------------------------------
// Start
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  Service Registry rodando na porta ${PORT}          ║`);
  console.log('║                                                      ║');
  console.log('║  Endpoints:                                          ║');
  console.log('║    POST   /register         → registrar serviço      ║');
  console.log('║    PUT    /heartbeat/:name  → renovar TTL            ║');
  console.log('║    DELETE /register/:name   → remover serviço        ║');
  console.log('║    GET    /services         → listar todos           ║');
  console.log('║    GET    /services/:name   → descobrir serviço      ║');
  console.log(`║    TTL: ${TTL_MS / 1000}s sem heartbeat → status expired   ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

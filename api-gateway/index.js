
//  * Responsabilidades:
//  *  - Ponto único de entrada do sistema
//  *  - Roteamento de requisições para os serviços corretos
//  *  - Logging centralizado de todas as requisições
//  * 
//  * Conector: HTTP/REST
//  * Padrão: API Gateway Pattern (microservices)

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');

const app = express();
const PORT = 3000;

const SERVICES = {
  users:    { host: 'localhost', port: 3001 },
  products: { host: 'localhost', port: 3002 },
  orders:   { host: 'localhost', port: 3003 },
  payments: { host: 'localhost', port: 3004 },
};


app.use(cors());
app.use(morgan('dev'));

app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (req.path !== '/health' && req.path !== '/services') {
    console.log(`[GATEWAY] ${req.method} ${req.originalUrl} | API-Key: ${apiKey || 'none (demo mode)'}`);
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({
    service: 'API Gateway',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

//Pega services disponíveis
app.get('/services', (req, res) => {
  res.json({
    gateway: { port: PORT, status: 'running' },
    services: Object.entries(SERVICES).map(([name, cfg]) => ({
      name,
      url: `http://${cfg.host}:${cfg.port}`,
      gatewayPath: `/api/${name}`,
    })),
  });
});

//Encaminha requisições para os serviços corretos
function proxyRequest(serviceName, req, res) {
  const svc = SERVICES[serviceName];
  if (!svc) {
    return res.status(404).json({ error: `Serviço '${serviceName}' não encontrado` });
  }

  // elimina /api/{serviceName}
  const targetPath = req.originalUrl.replace(/^\/api/, '') || '/';

  const options = {
    hostname: svc.host,
    port: svc.port,
    path: targetPath,
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'] || 'application/json',
      'x-gateway-request-id': `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      'x-forwarded-service': serviceName,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    res.setHeader('X-Served-By', `${serviceName}-service`);
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[GATEWAY] ✗ Erro ao conectar ao serviço '${serviceName}': ${err.message}`);
    if (!res.headersSent) {
      res.status(503).json({
        error: 'Service Unavailable',
        message: `O serviço '${serviceName}' está temporariamente indisponível`,
        service: serviceName,
      });
    }
  });

  // Encaminha o corpo da requisição para o serviço
  req.pipe(proxyReq, { end: true });
}

Object.keys(SERVICES).forEach(name => {
  app.all(`/api/${name}`, (req, res) => proxyRequest(name, req, res));
  app.all(`/api/${name}/*`, (req, res) => proxyRequest(name, req, res));
});

// rota default para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({
    error: 'Route Not Found',
    message: `Rota '${req.originalUrl}' não encontrada no gateway`,
    availableRoutes: Object.keys(SERVICES).map(s => `/api/${s}`),
  });
});

//iniciação do gateway
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  Porta: ${PORT}                                   ║`);
  console.log('║  Rotas disponíveis:                          ║');
  Object.keys(SERVICES).forEach(name => {
    console.log(`║    → /api/${name.padEnd(10)} → porta ${SERVICES[name].port}         ║`);
  });
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

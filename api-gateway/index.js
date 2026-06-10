
//  * Responsabilidades:
//  *  - Ponto único de entrada do sistema
//  *  - Roteamento de requisições para os serviços corretos
//  *  - Logging centralizado de todas as requisições
//  *  - Client-side Service Discovery: descobre serviços via Registry
//  * 
//  * Conector: HTTP/REST
//  * Padrão: API Gateway Pattern + Client-side Discovery

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');

const app = express();
const PORT = 3000;

//endereço registry service
const REGISTRY_HOST     = 'localhost';
const REGISTRY_PORT     = 3005;
const DISCOVERY_CACHE_TTL = 5_000; // cache de 5s por serviço

// Nomes dos serviços disponíveis (devem bater com os registrados)
const SERVICE_NAMES = ['users', 'products', 'orders', 'payments'];

// Cache local de descoberta
const discoveryCache = {};

// Função para descobrir serviço via registry com cache simples
async function discoverService(name) {
  const cached = discoveryCache[name];
  if (cached && (Date.now() - cached.ts) < DISCOVERY_CACHE_TTL) {
    return { host: cached.host, port: cached.port };
  }

  return new Promise((resolve) => {
    const options = {
      hostname: REGISTRY_HOST,
      port: REGISTRY_PORT,
      path: `/services/${name}`,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            const svc = parsed.data;
            discoveryCache[name] = { host: svc.host, port: svc.port, ts: Date.now() };
            resolve({ host: svc.host, port: svc.port });
          } catch {
            resolve(null);
          }
        } else {
          console.warn(`[GATEWAY]   Registry retornou ${res.statusCode} para '${name}'`);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.warn(`[GATEWAY]   Registry indisponível ao descobrir '${name}': ${err.message}`);
      resolve(null);
    });

    req.end();
  });
}

app.use(cors());
app.use(morgan('dev'));

app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (req.path !== '/health' && req.path !== '/services' && req.path !== '/registry') {
    console.log(`[GATEWAY] ${req.method} ${req.originalUrl} | API-Key: ${apiKey || 'none (demo mode)'}`);
  }
  next();
});

//Rotas
app.get('/health', (req, res) => {
  res.json({
    service: 'API Gateway',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    discovery: `http://${REGISTRY_HOST}:${REGISTRY_PORT}`,
  });
});

// Lista serviços descobertos via registry
app.get('/services', async (req, res) => {
  const results = await Promise.all(
    SERVICE_NAMES.map(async (name) => {
      const svc = await discoverService(name);
      return {
        name,
        url: svc ? `http://${svc.host}:${svc.port}` : null,
        gatewayPath: `/api/${name}`,
        status: svc ? 'discovered' : 'not-found',
      };
    })
  );

  res.json({
    gateway:  { port: PORT, status: 'running', discovery: true },
    services: results,
  });
});

// Proxy para o registry (usado pelo dashboard)
app.get('/registry', (req, res) => {
  const options = {
    hostname: REGISTRY_HOST,
    port: REGISTRY_PORT,
    path: '/services',
    method: 'GET',
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    res.setHeader('Content-Type', 'application/json');
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', () => {
    res.status(503).json({ error: 'Service Registry indisponível' });
  });

  proxyReq.end();
});

// Função de proxy para encaminhar requisições aos serviços descobertos
async function proxyRequest(serviceName, req, res) {
  // Tenta descobrir via registry
  const svc = await discoverService(serviceName);

  if (!svc) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: `Serviço '${serviceName}' não encontrado no Service Registry`,
      service: serviceName,
      registryUrl: `http://${REGISTRY_HOST}:${REGISTRY_PORT}`,
    });
  }

  // Remove o prefixo /api/{serviceName}
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
      'x-discovered-via': `registry:${REGISTRY_PORT}`,
    },
  };

  // Encaminha a requisição para o serviço descoberto
  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    res.setHeader('X-Served-By', `${serviceName}-service`);
    res.setHeader('X-Discovered-Via', `service-registry:${REGISTRY_PORT}`);
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[GATEWAY] ✗ Erro ao conectar ao serviço '${serviceName}': ${err.message}`);
    // Invalida cache ao falhar
    delete discoveryCache[serviceName];
    if (!res.headersSent) {
      res.status(503).json({
        error: 'Service Unavailable',
        message: `O serviço '${serviceName}' está temporariamente indisponível`,
        service: serviceName,
      });
    }
  });

  req.pipe(proxyReq, { end: true });
}

// Registra rotas dinamicamente
SERVICE_NAMES.forEach(name => {
  app.all(`/api/${name}`,   (req, res) => proxyRequest(name, req, res));
  app.all(`/api/${name}/*`, (req, res) => proxyRequest(name, req, res));
});

// Rota default
app.use((req, res) => {
  res.status(404).json({
    error: 'Route Not Found',
    message: `Rota '${req.originalUrl}' não encontrada no gateway`,
    availableRoutes: SERVICE_NAMES.map(s => `/api/${s}`),
  });
});


app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  API Gateway rodando na porta ${PORT}                ║`);
  console.log('║                                                      ║');
  console.log('║  Modo: Client-side Service Discovery                 ║');
  console.log(`║  Registry: http://${REGISTRY_HOST}:${REGISTRY_PORT}              ║`);
  console.log('║                                                      ║');
  console.log('║  Rotas disponíveis:                                  ║');
  SERVICE_NAMES.forEach(name => {
    console.log(`║    → /api/${name.padEnd(10)} (descoberto via registry)   ║`);
  });
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

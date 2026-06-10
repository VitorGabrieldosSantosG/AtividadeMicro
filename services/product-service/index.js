// Porta: 3002

// Responsabilidades:
//  - APENAS gerenciamento de produtos e estoque
//  - CRUD de produtos
//  - Controle de estoque (reserva e liberação)
//
// Service Discovery:
//  - Se registra no Service Registry (porta 3005) ao iniciar
//  - Envia heartbeat a cada 10s para manter status 'healthy'
//  - Remove o registro ao encerrar (graceful deregistration)

// Conector: HTTP/REST API

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');

const app = express();
const PORT = 3002;
const SERVICE_NAME    = 'products';
const REGISTRY_HOST   = 'localhost';
const REGISTRY_PORT   = 3005;
const HEARTBEAT_MS    = 10_000;

// Auto registro no Service Registry
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
    metadata: { type: 'core', description: 'Gerenciamento de produtos e estoque' },
  });
  if (status === 201) {
    console.log(`[PRODUCT SERVICE]  Registrado no Service Registry (porta ${REGISTRY_PORT})`);
  } else if (status === 200) {
    console.log(`[PRODUCT SERVICE]  Re-registrado no Service Registry`);
  } else {
    console.warn(`[PRODUCT SERVICE]   Não foi possível registrar no Service Registry (status: ${status})`);
  }
}

async function sendHeartbeat() {
  const status = await registryRequest('PUT', `/heartbeat/${SERVICE_NAME}`);
  if (!status) {
    console.warn(`[PRODUCT SERVICE]   Heartbeat falhou — Registry indisponível`);
  }
}

async function deregister() {
  await registryRequest('DELETE', `/register/${SERVICE_NAME}`);
  console.log(`[PRODUCT SERVICE]   Removido do Service Registry`);
}

// Encerramento gracioso
process.on('SIGTERM', async () => { await deregister(); process.exit(0); });
process.on('SIGINT',  async () => { await deregister(); process.exit(0); });

//banco
let products = [
  {
    id: 1,
    nome: 'Notebook Dell Inspiron 15',
    descricao: 'Processador Intel i5, 8GB RAM, SSD 256GB',
    preco: 2899.99,
    categoria: 'Eletrônicos',
    estoque: 15,
    sku: 'NTB-DELL-001',
    ativo: true,
  },
  {
    id: 2,
    nome: 'Mouse Logitech MX Master 3',
    descricao: 'Mouse ergonômico sem fio, 4000 DPI',
    preco: 459.90,
    categoria: 'Periféricos',
    estoque: 42,
    sku: 'MSE-LOGI-003',
    ativo: true,
  },
  {
    id: 3,
    nome: 'Teclado Mecânico Keychron K2',
    descricao: 'Switch Brown, layout compacto 75%, RGB',
    preco: 699.00,
    categoria: 'Periféricos',
    estoque: 28,
    sku: 'TCD-KEYC-002',
    ativo: true,
  },
  {
    id: 4,
    nome: 'Monitor LG UltraWide 29"',
    descricao: 'Resolução 2560x1080, 75Hz, IPS',
    preco: 1599.00,
    categoria: 'Monitores',
    estoque: 8,
    sku: 'MON-LG-029',
    ativo: true,
  },
  {
    id: 5,
    nome: 'Headset Sony WH-1000XM5',
    descricao: 'Cancelamento de ruído ativo, 30h bateria',
    preco: 1299.00,
    categoria: 'Áudio',
    estoque: 20,
    sku: 'AUD-SONY-005',
    ativo: true,
  },
];

let nextId = 6;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Service', 'product-service');
  res.setHeader('X-Service-Port', PORT);
  next();
});

// CRUD

// GET /health
app.get('/health', (req, res) => {
  res.json({
    service: 'Product Service',
    status: 'healthy',
    port: PORT,
    totalProducts: products.length,
    timestamp: new Date().toISOString(),
  });
});

// GET /products — Listar todos os produtos
app.get('/products', (req, res) => {
  const { categoria, disponivel } = req.query;
  let resultado = products.filter(p => p.ativo);
  
  if (categoria) {
    resultado = resultado.filter(p => 
      p.categoria.toLowerCase().includes(categoria.toLowerCase())
    );
  }
  
  if (disponivel === 'true') {
    resultado = resultado.filter(p => p.estoque > 0);
  }
  
  res.json({
    service: 'Product Service',
    total: resultado.length,
    data: resultado,
  });
});

// GET /products/:id — Buscar produto por ID
app.get('/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado', id: req.params.id });
  }
  
  res.json({ service: 'Product Service', data: product });
});

// POST /products — Criar produto
app.post('/products', (req, res) => {
  const { nome, descricao, preco, categoria, estoque, sku } = req.body;
  
  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
  }
  
  const novoProduto = {
    id: nextId++,
    nome,
    descricao: descricao || '',
    preco: parseFloat(preco),
    categoria: categoria || 'Geral',
    estoque: parseInt(estoque) || 0,
    sku: sku || `SKU-${Date.now()}`,
    ativo: true,
  };
  
  products.push(novoProduto);
  console.log(`[PRODUCT SERVICE] Novo produto criado: ${nome} (ID: ${novoProduto.id})`);
  
  res.status(201).json({
    service: 'Product Service',
    message: 'Produto criado com sucesso',
    data: novoProduto,
  });
});

// PUT /products/:id — Atualizar produto
app.put('/products/:id', (req, res) => {
  const index = products.findIndex(p => p.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  
  products[index] = { ...products[index], ...req.body, id: products[index].id };
  
  res.json({
    service: 'Product Service',
    message: 'Produto atualizado com sucesso',
    data: products[index],
  });
});

// PATCH /products/:id/estoque — Atualizar estoque (reserva/liberação)
// Este endpoint é chamado pelo Order Service para reservar estoque
app.patch('/products/:id/estoque', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  
  const { quantidade, operacao } = req.body; // operacao: 'reservar' | 'liberar'
  
  if (operacao === 'reservar') {
    if (product.estoque < quantidade) {
      return res.status(400).json({
        error: 'Estoque insuficiente',
        estoqueAtual: product.estoque,
        quantidadeSolicitada: quantidade,
      });
    }
    product.estoque -= quantidade;
    console.log(`[PRODUCT SERVICE] Estoque reservado: ${quantidade}x ${product.nome}`);
  } else if (operacao === 'liberar') {
    product.estoque += quantidade;
    console.log(`[PRODUCT SERVICE] Estoque liberado: ${quantidade}x ${product.nome}`);
  }
  
  res.json({
    service: 'Product Service',
    message: `Estoque ${operacao === 'reservar' ? 'reservado' : 'liberado'} com sucesso`,
    data: { produtoId: product.id, estoqueAtual: product.estoque },
  });
});

// DELETE /products/:id — Desativar produto
app.delete('/products/:id', (req, res) => {
  const index = products.findIndex(p => p.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  
  products[index].ativo = false;
  
  res.json({
    service: 'Product Service',
    message: 'Produto desativado com sucesso',
    data: products[index],
  });
});

app.listen(PORT, async () => {
  console.log(`[PRODUCT SERVICE]  Product Service rodando na porta ${PORT}`);
  setTimeout(async () => {
    await registerWithDiscovery();
    setInterval(sendHeartbeat, HEARTBEAT_MS);
  }, 1000);
});

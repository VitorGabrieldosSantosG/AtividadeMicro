// Porta: 3002

// Responsabilidades:
//  - APENAS gerenciamento de produtos e estoque
//  - CRUD de produtos
//  - Controle de estoque (reserva e liberação)

// Conector: HTTP/REST API

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = 3002;

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

app.listen(PORT, () => {
  console.log(`Product Service rodando na porta ${PORT}`);
});

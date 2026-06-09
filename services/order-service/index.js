
// Porta: 3003

// Responsabilidades:
//  - Gerenciamento do ciclo de vida dos pedidos
//  - Orquestração: consulta User Service e Product Service
//  - Validação de disponibilidade de estoque
//  - Cálculo de totais do pedido
//  - Não processa pagamentos (delega ao Payment Service)


const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fetch = require('node-fetch');

const app = express();
const PORT = 3003;

//rotas (não utilizando service dicovery)
const USER_SERVICE    = 'http://localhost:3001';
const PRODUCT_SERVICE = 'http://localhost:3002';

//simulação de banco de dados
let orders = [
  {
    id: 1,
    usuarioId: 1,
    itens: [
      { produtoId: 2, quantidade: 1, precoUnitario: 459.90 },
    ],
    total: 459.90,
    status: 'entregue',
    dataCriacao: '2024-03-01T10:00:00Z',
    dataAtualizacao: '2024-03-05T15:30:00Z',
  },
  {
    id: 2,
    usuarioId: 2,
    itens: [
      { produtoId: 1, quantidade: 1, precoUnitario: 2899.99 },
      { produtoId: 3, quantidade: 1, precoUnitario: 699.00 },
    ],
    total: 3598.99,
    status: 'processando',
    dataCriacao: '2024-03-15T14:00:00Z',
    dataAtualizacao: '2024-03-15T14:00:00Z',
  },
];

let nextId = 3;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Service', 'order-service');
  res.setHeader('X-Service-Port', PORT);
  next();
});

//Comunicação entre serviços
async function buscarUsuario(userId) {
  try {
    console.log(`[ORDER SERVICE] → Consultando User Service: usuário #${userId}`);
    const response = await fetch(`${USER_SERVICE}/users/${userId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch (err) {
    console.error(`[ORDER SERVICE] ✗ User Service indisponível: ${err.message}`);
    return null;
  }
}

async function buscarProduto(productId) {
  try {
    console.log(`[ORDER SERVICE] → Consultando Product Service: produto #${productId}`);
    const response = await fetch(`${PRODUCT_SERVICE}/products/${productId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch (err) {
    console.error(`[ORDER SERVICE] ✗ Product Service indisponível: ${err.message}`);
    return null;
  }
}

async function reservarEstoque(productId, quantidade) {
  try {
    console.log(`[ORDER SERVICE] → Reservando estoque: ${quantidade}x produto #${productId}`);
    const response = await fetch(`${PRODUCT_SERVICE}/products/${productId}/estoque`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantidade, operacao: 'reservar' }),
    });
    return response.ok;
  } catch (err) {
    console.error(`[ORDER SERVICE] ✗ Erro ao reservar estoque: ${err.message}`);
    return false;
  }
}

// GET /health
app.get('/health', (req, res) => {
  res.json({
    service: 'Order Service',
    status: 'healthy',
    port: PORT,
    totalOrders: orders.length,
    dependencias: { userService: USER_SERVICE, productService: PRODUCT_SERVICE },
    timestamp: new Date().toISOString(),
  });
});

// GET /orders — Listar todos os pedidos
app.get('/orders', (req, res) => {
  const { usuarioId, status } = req.query;
  let resultado = orders;
  
  if (usuarioId) resultado = resultado.filter(o => o.usuarioId === parseInt(usuarioId));
  if (status) resultado = resultado.filter(o => o.status === status);
  
  res.json({
    service: 'Order Service',
    total: resultado.length,
    data: resultado,
  });
});

// GET /orders/:id — Buscar pedido com detalhes user+product
app.get('/orders/:id', async (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id));
  
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
    
  const usuario = await buscarUsuario(order.usuarioId);
  const itensDetalhados = await Promise.all(
    order.itens.map(async (item) => {
      const produto = await buscarProduto(item.produtoId);
      return {
        ...item,
        produto: produto ? {
          nome: produto.nome,
          sku: produto.sku,
          categoria: produto.categoria,
        } : { nome: 'Produto não encontrado' },
      };
    })
  );
  
  res.json({
    service: 'Order Service',
    data: {
      ...order,
      usuario: usuario ? {
        nome: usuario.nome,
        email: usuario.email,
        endereco: usuario.endereco,
      } : { nome: 'Usuário não encontrado' },
      itens: itensDetalhados,
    },
  });
});

// POST /orders — Criar novo pedido
app.post('/orders', async (req, res) => {
  const { usuarioId, itens } = req.body;
  
  if (!usuarioId || !itens || !itens.length) {
    return res.status(400).json({ error: 'usuarioId e itens são obrigatórios' });
  }
  
  console.log(`\n[ORDER SERVICE]Processando novo pedido para usuário #${usuarioId}`);
  
  // 1. Valida usuário
  const usuario = await buscarUsuario(usuarioId);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuário não encontrado ou User Service indisponível' });
  }
  if (!usuario.ativo) {
    return res.status(400).json({ error: 'Usuário inativo não pode fazer pedidos' });
  }
  
  // 2. Valida produtos e calcula total
  let total = 0;
  const itensProcessados = [];
  
  for (const item of itens) {
    const produto = await buscarProduto(item.produtoId);
    if (!produto) {
      return res.status(404).json({ error: `Produto #${item.produtoId} não encontrado` });
    }
    if (produto.estoque < item.quantidade) {
      return res.status(400).json({
        error: `Estoque insuficiente para "${produto.nome}"`,
        disponivel: produto.estoque,
        solicitado: item.quantidade,
      });
    }
    
    total += produto.preco * item.quantidade;
    itensProcessados.push({
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      precoUnitario: produto.preco,
    });
  }
  
  // 3. Reserva estoque
  for (const item of itensProcessados) {
    const reservado = await reservarEstoque(item.produtoId, item.quantidade);
    if (!reservado) {
      return res.status(500).json({ error: 'Falha ao reservar estoque' });
    }
  }
  
  // 4. Cria o pedido
  const novoPedido = {
    id: nextId++,
    usuarioId,
    itens: itensProcessados,
    total: parseFloat(total.toFixed(2)),
    status: 'pendente',
    dataCriacao: new Date().toISOString(),
    dataAtualizacao: new Date().toISOString(),
  };
  
  orders.push(novoPedido);
  
  console.log(`[ORDER SERVICE]Pedido #${novoPedido.id} criado! Total: R$ ${novoPedido.total}`);
  
  res.status(201).json({
    service: 'Order Service',
    message: 'Pedido criado com sucesso! Aguardando pagamento.',
    data: novoPedido,
  });
});

// PATCH /orders/:id/status — Atualizar status do pedido
// Chamado pelo Payment Service ao confirmar pagamento
app.patch('/orders/:id/status', (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id));
  
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  
  const statusValidos = ['pendente', 'pago', 'processando', 'enviado', 'entregue', 'cancelado'];
  const { status } = req.body;
  
  if (!statusValidos.includes(status)) {
    return res.status(400).json({ error: 'Status inválido', statusValidos });
  }
  
  order.status = status;
  order.dataAtualizacao = new Date().toISOString();
  
  console.log(`[ORDER SERVICE] 📋 Pedido #${order.id} → status: ${status}`);
  
  res.json({
    service: 'Order Service',
    message: `Status do pedido atualizado para '${status}'`,
    data: order,
  });
});

app.listen(PORT, () => {
  console.log(`Order Service rodando na porta ${PORT}`);
});

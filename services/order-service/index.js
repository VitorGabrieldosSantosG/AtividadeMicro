
  // Porta: 3003

  // Responsabilidades:
  //  - Gerenciamento do ciclo de vida dos pedidos
  //  - Orquestração: consulta User Service e Product Service
  //  - Validação de disponibilidade de estoque
  //  - Cálculo de totais do pedido
  //  - Não processa pagamentos (delega ao Payment Service)
  //
  // Service Discovery:
  //  - Se registra no Service Registry (porta 3005) ao iniciar
  //  - Envia heartbeat a cada 10s
  //  - Descobre endereços de User e Product Services dinamicamente


  const express = require('express');
  const cors = require('cors');
  const morgan = require('morgan');
  const fetch = require('node-fetch');
  const http = require('http');

  const app = express();
  const PORT = 3003;
  const SERVICE_NAME    = 'orders';
  const REGISTRY_HOST   = 'localhost';
  const REGISTRY_PORT   = 3005;
  const HEARTBEAT_MS    = 10_000;

  // Auto registro no service registry
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
      metadata: { type: 'orchestrator', description: 'Gerenciamento de pedidos' },
    });
    if (status === 201) {
      console.log(`[ORDER SERVICE]  Registrado no Service Registry (porta ${REGISTRY_PORT})`);
    } else if (status === 200) {
      console.log(`[ORDER SERVICE]  Re-registrado no Service Registry`);
    } else {
      console.warn(`[ORDER SERVICE]   Não foi possível registrar (status: ${status})`);
    }
  }

  async function sendHeartbeat() {
    const status = await registryRequest('PUT', `/heartbeat/${SERVICE_NAME}`);
    if (!status) {
      console.warn(`[ORDER SERVICE]   Heartbeat falhou — Registry indisponível`);
    }
  }

  async function deregister() {
    await registryRequest('DELETE', `/register/${SERVICE_NAME}`);
    console.log(`[ORDER SERVICE]   Removido do Service Registry`);
  }

  process.on('SIGTERM', async () => { await deregister(); process.exit(0); });
  process.on('SIGINT',  async () => { await deregister(); process.exit(0); });

  // Descobre endereço de um serviço consultando o registry 
  const discoveryCache = {};
  const DISCOVERY_CACHE_TTL = 5_000; // 5s de cache local

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

  // Fallbacks estáticos (caso o registry esteja indisponível)
  const FALLBACK_URLS = {
    users:    'http://localhost:3001',
    products: 'http://localhost:3002',
  };

  async function resolveService(name) {
    const url = await discoverService(name);
    if (url) return url;
    console.warn(`[ORDER SERVICE]   Usando fallback para '${name}'`);
    return FALLBACK_URLS[name];
  }

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

  //Comunicação entre serviços (via Service Discovery)
  async function buscarUsuario(userId) {
    try {
      const baseUrl = await resolveService('users');
      console.log(`[ORDER SERVICE] → Consultando User Service (${baseUrl}): usuário #${userId}`);
      const response = await fetch(`${baseUrl}/users/${userId}`);
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
      const baseUrl = await resolveService('products');
      console.log(`[ORDER SERVICE] → Consultando Product Service (${baseUrl}): produto #${productId}`);
      const response = await fetch(`${baseUrl}/products/${productId}`);
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
      const baseUrl = await resolveService('products');
      console.log(`[ORDER SERVICE] → Reservando estoque: ${quantidade}x produto #${productId}`);
      const response = await fetch(`${baseUrl}/products/${productId}/estoque`, {
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
      dependencias: { discovery: `http://${REGISTRY_HOST}:${REGISTRY_PORT}`, fallbacks: FALLBACK_URLS },
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
    
    console.log(`[ORDER SERVICE]  Pedido #${order.id} → status: ${status}`);
    
    res.json({
      service: 'Order Service',
      message: `Status do pedido atualizado para '${status}'`,
      data: order,
    });
  });

  app.listen(PORT, async () => {
    console.log(`[ORDER SERVICE]  Order Service rodando na porta ${PORT}`);
    setTimeout(async () => {
      await registerWithDiscovery();
      setInterval(sendHeartbeat, HEARTBEAT_MS);
    }, 1000);
  });

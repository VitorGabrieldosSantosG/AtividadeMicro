// Porta: 3001

// Responsabilidades (Separação de Responsabilidades):
//  - APENAS gerenciamento de usuários
//  - Criação, leitura, atualização e remoção de usuários
//  - Validação de dados de usuário
//
// Service Discovery:
//  - Se registra no Service Registry (porta 3005) ao iniciar
//  - Envia heartbeat a cada 10s para manter status 'healthy'
//  - Remove o registro ao encerrar (graceful deregistration)

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');

const app = express();
const PORT = 3001;
const SERVICE_NAME    = 'users';
const REGISTRY_HOST   = 'localhost';
const REGISTRY_PORT   = 3005;
const HEARTBEAT_MS    = 10_000;

// Auto registro
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
    metadata: { type: 'core', description: 'Gerenciamento de usuários' },
  });
  if (status === 201) {
    console.log(`[USER SERVICE]  Registrado no Service Registry (porta ${REGISTRY_PORT})`);
  } else if (status === 200) {
    console.log(`[USER SERVICE]  Re-registrado no Service Registry`);
  } else {
    console.warn(`[USER SERVICE]   Não foi possível registrar no Service Registry (status: ${status})`);
  }
}

async function sendHeartbeat() {
  const status = await registryRequest('PUT', `/heartbeat/${SERVICE_NAME}`);
  if (!status) {
    console.warn(`[USER SERVICE]   Heartbeat falhou — Registry indisponível`);
  }
}

async function deregister() {
  await registryRequest('DELETE', `/register/${SERVICE_NAME}`);
  console.log(`[USER SERVICE]   Removido do Service Registry`);
}

// Encerramento gracioso
process.on('SIGTERM', async () => { await deregister(); process.exit(0); });
process.on('SIGINT',  async () => { await deregister(); process.exit(0); });

//banco
let users = [
  {
    id: 1,
    nome: 'Ana Silva',
    email: 'ana.silva@email.com',
    telefone: '(11) 98765-4321',
    endereco: 'Rua das Flores, 123 - São Paulo, SP',
    dataCadastro: '2024-01-15T10:00:00Z',
    ativo: true,
  },
  {
    id: 2,
    nome: 'Bruno Santos',
    email: 'bruno.santos@email.com',
    telefone: '(21) 91234-5678',
    endereco: 'Av. Copacabana, 456 - Rio de Janeiro, RJ',
    dataCadastro: '2024-02-20T14:30:00Z',
    ativo: true,
  },
  {
    id: 3,
    nome: 'Carla Ferreira',
    email: 'carla.ferreira@email.com',
    telefone: '(31) 99876-5432',
    endereco: 'Rua Ouro Preto, 789 - Belo Horizonte, MG',
    dataCadastro: '2024-03-10T09:15:00Z',
    ativo: true,
  },
];

let nextId = 4;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Service', 'user-service');
  res.setHeader('X-Service-Port', PORT);
  next();
});

// CRUD

// GET /health — Saúde do serviço
app.get('/health', (req, res) => {
  res.json({
    service: 'User Service',
    status: 'healthy',
    port: PORT,
    totalUsers: users.length,
    timestamp: new Date().toISOString(),
  });
});

// GET /users — Listar todos os usuários
app.get('/users', (req, res) => {
  const { ativo } = req.query;
  let resultado = users;
  
  if (ativo !== undefined) {
    resultado = users.filter(u => u.ativo === (ativo === 'true'));
  }
  
  res.json({
    service: 'User Service',
    total: resultado.length,
    data: resultado,
  });
});

// GET /users/:id — Buscar usuário por ID
app.get('/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  
  if (!user) {
    return res.status(404).json({
      error: 'Usuário não encontrado',
      id: req.params.id,
    });
  }
  
  res.json({ service: 'User Service', data: user });
});

// POST /users — Criar novo usuário
app.post('/users', (req, res) => {
  const { nome, email, telefone, endereco } = req.body;
  
  if (!nome || !email) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios' });
  }
  
  // Verifica email duplicado
  if (users.some(u => u.email === email)) {
    return res.status(409).json({ error: 'Email já cadastrado' });
  }
  
  const novoUsuario = {
    id: nextId++,
    nome,
    email,
    telefone: telefone || '',
    endereco: endereco || '',
    dataCadastro: new Date().toISOString(),
    ativo: true,
  };
  
  users.push(novoUsuario);
  
  console.log(`[USER SERVICE] Novo usuário criado: ${nome} (ID: ${novoUsuario.id})`);
  
  res.status(201).json({
    service: 'User Service',
    message: 'Usuário criado com sucesso',
    data: novoUsuario,
  });
});

// PUT /users/:id — Atualizar usuário
app.put('/users/:id', (req, res) => {
  const index = users.findIndex(u => u.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  
  users[index] = { ...users[index], ...req.body, id: users[index].id };
  
  res.json({
    service: 'User Service',
    message: 'Usuário atualizado com sucesso',
    data: users[index],
  });
});

// DELETE /users/:id — Remover usuário (soft delete)
app.delete('/users/:id', (req, res) => {
  const index = users.findIndex(u => u.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  
  users[index].ativo = false;
  
  res.json({
    service: 'User Service',
    message: 'Usuário desativado com sucesso',
    data: users[index],
  });
});


app.listen(PORT, async () => {
  console.log(`[USER SERVICE]  User Service rodando na porta ${PORT}`);
  // Aguarda um momento e registra no Service Registry
  setTimeout(async () => {
    await registerWithDiscovery();
    // Inicia heartbeat periódico
    setInterval(sendHeartbeat, HEARTBEAT_MS);
  }, 1000);
});

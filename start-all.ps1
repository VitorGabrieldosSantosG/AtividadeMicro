# ============================================================
# MicroShop — Script de Inicialização
# Inicia todos os microserviços simultaneamente
# ============================================================

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🚀 MicroShop — Arquitetura de Microserviços          ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Iniciando todos os serviços...                          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

# Verifica Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js não encontrado! Instale em https://nodejs.org" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Node.js encontrado: $(node --version)" -ForegroundColor Green

# ============================================================
# INSTALA DEPENDÊNCIAS
# ============================================================
Write-Host ""
Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow

$services = @(
    "$root\service-registry",
    "$root\api-gateway",
    "$root\services\user-service",
    "$root\services\product-service",
    "$root\services\order-service",
    "$root\services\payment-service"
)

foreach ($svc in $services) {
    if (-not (Test-Path "$svc\node_modules")) {
        Write-Host "  → Instalando: $svc" -ForegroundColor Gray
        Push-Location $svc
        npm install --silent
        Pop-Location
    } else {
        Write-Host "  ✓ Já instalado: $(Split-Path $svc -Leaf)" -ForegroundColor DarkGreen
    }
}

# ============================================================
# INICIA OS SERVIÇOS EM JANELAS SEPARADAS
# ============================================================
Write-Host ""
Write-Host "🚀 Iniciando microserviços..." -ForegroundColor Yellow

$processes = @()

# Service Registry (deve iniciar ANTES dos demais serviços)
$p0 = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\service-registry'; Write-Host '🗺️ SERVICE REGISTRY' -ForegroundColor Magenta; node index.js" -PassThru
$processes += $p0
Write-Host "  🗺️ Service Registry → http://localhost:3005" -ForegroundColor Magenta

Start-Sleep -Milliseconds 800

# API Gateway
$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\api-gateway'; Write-Host '🚀 API GATEWAY' -ForegroundColor Blue; node index.js" -PassThru
$processes += $p1
Write-Host "  🚀 API Gateway     → http://localhost:3000" -ForegroundColor Blue

Start-Sleep -Milliseconds 300

# User Service
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\services\user-service'; Write-Host '👤 USER SERVICE' -ForegroundColor Green; node index.js" -PassThru
$processes += $p2
Write-Host "  👤 User Service    → http://localhost:3001" -ForegroundColor Green

Start-Sleep -Milliseconds 300

# Product Service
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\services\product-service'; Write-Host '📦 PRODUCT SERVICE' -ForegroundColor Yellow; node index.js" -PassThru
$processes += $p3
Write-Host "  📦 Product Service → http://localhost:3002" -ForegroundColor Yellow

Start-Sleep -Milliseconds 300

# Order Service
$p4 = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\services\order-service'; Write-Host '🛒 ORDER SERVICE' -ForegroundColor Red; node index.js" -PassThru
$processes += $p4
Write-Host "  🛒 Order Service   → http://localhost:3003" -ForegroundColor Red

Start-Sleep -Milliseconds 300

# Payment Service
$p5 = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\services\payment-service'; Write-Host '💳 PAYMENT SERVICE' -ForegroundColor Magenta; node index.js" -PassThru
$processes += $p5
Write-Host "  💳 Payment Service → http://localhost:3004" -ForegroundColor Magenta

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ TODOS OS SERVIÇOS INICIADOS!                         ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "║  🗺️ Service Registry: http://localhost:3005              ║" -ForegroundColor Green
Write-Host "║  📊 Dashboard: abra dashboard/index.html no navegador      ║" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "║  Endpoints via Gateway (porta 3000):                     ║" -ForegroundColor Green
Write-Host "║    GET  http://localhost:3000/api/users                  ║" -ForegroundColor Green
Write-Host "║    GET  http://localhost:3000/api/products               ║" -ForegroundColor Green
Write-Host "║    GET  http://localhost:3000/api/orders                 ║" -ForegroundColor Green
Write-Host "║    GET  http://localhost:3000/api/payments               ║" -ForegroundColor Green
Write-Host "║    GET  http://localhost:3000/registry (todos registros) ║" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Pressione qualquer tecla para ENCERRAR todos os serviços..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Para todos os processos
$processes | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Write-Host "🛑 Todos os serviços encerrados." -ForegroundColor Red

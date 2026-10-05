Clear-Host

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "         PROTOCOLO DE RESET SEGURO DA HERA        " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

Write-Host "`n[1/5] Configurando o ambiente (Node.js)..." -ForegroundColor Yellow
$env:PATH = "C:\Users\5286\Documents\node;" + $env:PATH

Write-Host "[2/5] Limpando o histórico de logs antigos (PM2 Flush)..." -ForegroundColor Yellow
pm2 flush *>$null

Write-Host "[3/5] Encerrando o gerenciador de processos (PM2)..." -ForegroundColor Yellow
pm2 kill *>$null

Write-Host "[4/5] Liberando portas e limpando processos retidos..." -ForegroundColor Yellow
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue

Write-Host "[5/5] Finalizando limpeza. Aguardando liberação do Windows..." -ForegroundColor Green
Start-Sleep -Seconds 4

Write-Host "`n Iniciando a Hera em um ambiente 100% limpo!" -ForegroundColor Green
Start-Sleep -Seconds 1

.\ligar-hera.ps1
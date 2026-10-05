Write-Host "Preparando o ambiente do Node..." -ForegroundColor Cyan
$env:Path = "C:\Users\5286\Documents\node;" + $env:Path

Write-Host "Iniciando a Hera via PM2 com 8GB de RAM..." -ForegroundColor Yellow
pm2 start src/app.js --name "hera" --node-args="--max-old-space-size=8192"

Write-Host "Abrindo os logs em tempo real..." -ForegroundColor Green
pm2 logs hera
// src/views/matrizRisco.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderMatrizRisco(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Matriz de Risco e Projeção - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            .filtros-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 20px; background: #fdfdfd; padding: 15px 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #ecf0f1; }
            .btn-group { display: flex; gap: 10px; }
            .btn-filter { padding: 10px 20px; border: 1px solid #bdc3c7; background: #ecf0f1; color: #2c3e50; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.3s; }
            .btn-filter.active { background: #8e44ad; color: white; border-color: #8e44ad; box-shadow: 0 4px 10px rgba(142, 68, 173, 0.3); }
            
            .kpi-container { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
            .kpi-card { flex: 1; min-width: 200px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-left: 5px solid #bdc3c7; }
            .kpi-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #7f8c8d; text-transform: uppercase; }
            .kpi-card p { margin: 0; font-size: 28px; font-weight: 900; color: #2c3e50; }
            .kpi-card.red { border-left-color: #e74c3c; }
            .kpi-card.yellow { border-left-color: #f1c40f; }
            .kpi-card.green { border-left-color: #2ecc71; }

            .content-grid { display: grid; grid-template-columns: 1fr; gap: 25px; margin-bottom: 30px; }
            
            .chart-panel { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #ecf0f1; }
            .chart-wrapper { position: relative; height: 450px; width: 100%; }

            .table-panel { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #ecf0f1; overflow-x: auto; }
            table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
            th { position: sticky; top: 0; background: #2c3e50; color: white; padding: 12px; text-align: left; }
            td { padding: 10px 12px; border-bottom: 1px solid #ecf0f1; }
            tr:hover td { background-color: #f8f9fa; }
            
            .badge { padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 12px; }
            .badge-z { background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; }
            .badge-y { background: #fef3c7; color: #b45309; border: 1px solid #fbbf24; }
            .badge-x { background: #d1fae5; color: #047857; border: 1px solid #34d399; }

            .toggle-container { display: flex; align-items: center; gap: 10px; font-weight: bold; color: #2c3e50; }
            .toggle-container input[type="checkbox"] { transform: scale(1.3); cursor: pointer; }

            #loadingOverlay { display: none; position: fixed; z-index: 9999; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(5px); justify-content: center; align-items: center; flex-direction: column; }
            .spinner { border: 5px solid #f3f3f3; border-top: 5px solid #e74c3c; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 15px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div id="loadingOverlay">
            <div class="spinner"></div>
            <h2 style="color: #2c3e50; margin: 0;">Analisando Criticidade e Tendências (MQO)...</h2>
            <p style="color: #7f8c8d;">Isso pode levar alguns segundos, por favor aguarde.</p>
        </div>

        <div class="container" style="max-width: 1400px; width: 95%;">
            <h1 style="color: #2c3e50; margin-bottom: 5px;">🎯 Matriz de Risco: Criticidade vs Tendência</h1>
            <p style="color: #7f8c8d; margin-bottom: 25px;">Cruzamento da classificação da grade (Curva XYZ) com a projeção de consumo (MQO) para antecipar rupturas.</p>

            <div class="filtros-top">
                <div class="btn-group">
                    <button class="btn-filter active" id="btn-GERAL" onclick="mudarFiltroLocal('GERAL')">Visão Geral</button>
                    <button class="btn-filter" id="btn-ALM" onclick="mudarFiltroLocal('ALM')">ALM</button>
                    <button class="btn-filter" id="btn-FAR" onclick="mudarFiltroLocal('FAR')">FAR</button>
                    <button class="btn-filter" id="btn-MAI" onclick="mudarFiltroLocal('MAI')">MAI</button>
                </div>
                
                <div class="toggle-container">
                    <input type="checkbox" id="chkIgnorar116" checked onchange="carregarDados()">
                    <label for="chkIgnorar116">Ignorar Grupo 116</label>
                </div>
            </div>

            <div class="kpi-container">
                <div class="kpi-card red">
                    <h3>Queda Acelerada (Alerta)</h3>
                    <p id="kpiQueda">0</p>
                </div>
                <div class="kpi-card yellow">
                    <h3>Tendência Estável</h3>
                    <p id="kpiEstavel">0</p>
                </div>
                <div class="kpi-card green">
                    <h3>Tendência de Alta (Acúmulo)</h3>
                    <p id="kpiAlta">0</p>
                </div>
                <div class="kpi-card" style="border-left-color: #8e44ad;">
                    <h3>Total Analisado (MQO Válido)</h3>
                    <p id="kpiTotal">0</p>
                </div>
            </div>

            <div class="content-grid">
                <div class="chart-panel">
                    <h2 style="margin-top: 0; color: #2c3e50; font-size: 18px;">📈 Matriz de Dispersão (Criticidade x MQO)</h2>
                    <p style="font-size: 13px; color: #7f8c8d; margin-top: -5px;">Itens no quadrante superior esquerdo (Alta Criticidade Z + MQO Negativo) exigem intervenção prioritária.</p>
                    <div class="chart-wrapper">
                        <canvas id="scatterChart"></canvas>
                    </div>
                </div>

                <div class="table-panel">
                    <h2 style="margin-top: 0; color: #2c3e50; font-size: 18px;">⚠️ Lista de Prioridade Logística (Foco em Queda)</h2>
                    <table id="tabelaPrioridades">
                        <thead>
                            <tr>
                                <th>Criticidade</th>
                                <th>Item</th>
                                <th>Descrição</th>
                                <th>Saldo Atual</th>
                                <th>Tendência (MQO)</th>
                                <th>Proj. Mês +1</th>
                                <th>Empenho Ativo</th>
                                <th>AE Emitida</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Preenchido via JS -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <script>
            let scatterChartInstancia = null;
            let filtroLocalAtual = 'GERAL';

            function mostrarLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
            function esconderLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

            window.mudarFiltroLocal = function(local) {
                filtroLocalAtual = local;
                document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
                document.getElementById('btn-' + local).classList.add('active');
                carregarDados();
            };

            function formatarMoeda(valor) {
                return Number(valor).toLocaleString('pt-BR');
            }

            function badgeCriticidade(valor) {
                const cr = String(valor || '').toUpperCase().trim();
                if (cr === 'Z') return '<span class="badge badge-z">Z (Máxima)</span>';
                if (cr === 'Y') return '<span class="badge badge-y">Y (Média)</span>';
                if (cr === 'X') return '<span class="badge badge-x">X (Baixa)</span>';
                return '<span class="badge" style="background:#eee; border:1px solid #ccc;">N/A</span>';
            }

            async function carregarDados() {
                mostrarLoading();
                try {
                    const ignorar116 = document.getElementById('chkIgnorar116').checked;
                    const url = \`/api/matriz-risco/dados?local=\${filtroLocalAtual}&ignorar116=\${ignorar116}\`;
                    
                    const resposta = await fetch(url);
                    if (!resposta.ok) throw new Error('Falha ao buscar dados');
                    
                    const dados = await resposta.json();
                    
                    atualizarKPIs(dados.kpis);
                    desenharGrafico(dados.grafico);
                    atualizarTabela(dados.tabela);

                } catch (erro) {
                    console.error(erro);
                    alert('Erro ao processar a Matriz de Risco. Verifique o terminal.');
                } finally {
                    esconderLoading();
                }
            }

            function atualizarKPIs(kpis) {
                if (!kpis) return;
                document.getElementById('kpiQueda').innerText = kpis.quedaAcelerada || 0;
                document.getElementById('kpiEstavel').innerText = kpis.estavel || 0;
                document.getElementById('kpiAlta').innerText = kpis.alta || 0;
                document.getElementById('kpiTotal').innerText = (kpis.quedaAcelerada + kpis.estavel + kpis.alta) || 0;
            }

            function desenharGrafico(dadosGrafico) {
                if (scatterChartInstancia) scatterChartInstancia.destroy();
                
                if (!dadosGrafico || dadosGrafico.length === 0) return;

                const ctx = document.getElementById('scatterChart').getContext('2d');

                // Mapeamento de cores baseado na Criticidade
                const cores = {
                    3: 'rgba(231, 76, 60, 0.7)',  // Z
                    2: 'rgba(241, 196, 15, 0.7)', // Y
                    1: 'rgba(46, 204, 113, 0.7)'  // X
                };

                const datasets = [
                    {
                        label: 'Itens (Matriz)',
                        data: dadosGrafico,
                        backgroundColor: function(context) {
                            const valorY = context.raw?.y;
                            return cores[valorY] || 'rgba(149, 165, 166, 0.7)';
                        },
                        borderColor: '#fff',
                        borderWidth: 1,
                        pointRadius: 6,
                        pointHoverRadius: 9
                    }
                ];

                scatterChartInstancia = new Chart(ctx, {
                    type: 'scatter',
                    data: { datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(ctx) {
                                        const ponto = ctx.raw;
                                        return [
                                            \`Item: \${ponto.item}\`,
                                            \`Desc: \${ponto.descricao}\`,
                                            \`Criticidade: \${ponto.criticidadeLabel}\`,
                                            \`MQO (β): \${ponto.x.toFixed(4)}\`
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                title: { display: true, text: 'Coeficiente Angular MQO (Queda < 0 < Alta)', font: { weight: 'bold' } },
                                grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.05)', lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1 }
                            },
                            y: {
                                title: { display: true, text: 'Nível de Criticidade', font: { weight: 'bold' } },
                                min: 0,
                                max: 4,
                                ticks: {
                                    stepSize: 1,
                                    callback: function(value) {
                                        if (value === 1) return 'X (Baixa)';
                                        if (value === 2) return 'Y (Média)';
                                        if (value === 3) return 'Z (Máxima)';
                                        return '';
                                    }
                                }
                            }
                        }
                    }
                });
            }

            function atualizarTabela(dadosTabela) {
                const tbody = document.querySelector('#tabelaPrioridades tbody');
                tbody.innerHTML = '';

                if (!dadosTabela || dadosTabela.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#7f8c8d; padding:20px;">Nenhum item requer intervenção prioritária no momento ou falta histórico.</td></tr>';
                    return;
                }

                let html = '';
                dadosTabela.forEach(linha => {
                    const corMQO = linha.mqoBeta < 0 ? 'color: #e74c3c; font-weight: bold;' : 'color: #27ae60; font-weight: bold;';
                    const iconEmpenho = linha.temEmpenho ? '✅ Sim' : '❌ Não';
                    const iconAE = linha.temAE ? '✅ Sim' : '❌ Não';
                    
                    html += \`
                        <tr>
                            <td>\${badgeCriticidade(linha.criticidade)}</td>
                            <td><strong>\${linha.item}</strong></td>
                            <td title="\${linha.descricao}">\${linha.descricao.substring(0, 35)}...</td>
                            <td>\${formatarMoeda(linha.saldoAtual)}</td>
                            <td style="\${corMQO}">\${linha.mqoBeta.toFixed(4)}</td>
                            <td>\${formatarMoeda(linha.projecaoM1)}</td>
                            <td>\${iconEmpenho}</td>
                            <td>\${iconAE}</td>
                        </tr>
                    \`;
                });
                
                tbody.innerHTML = html;
            }

            window.onload = carregarDados;
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderMatrizRisco };
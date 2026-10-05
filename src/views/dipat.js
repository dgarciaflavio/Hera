// src/views/dipat.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderDipat(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Análise DIPAT - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body { background-color: #f4f7f6; }
            .dipat-container { 
                max-width: 1300px; 
                margin: 30px auto; 
                padding: 30px; 
                background: #ffffff; 
                border-radius: 16px; 
                box-shadow: 0 10px 40px rgba(0,0,0,0.05); 
            }
            .header-actions { 
                display: flex; 
                flex-direction: column;
                gap: 10px;
                margin-bottom: 20px; 
                border-bottom: 1px solid #eaeef2; 
                padding-bottom: 20px;
            }
            .selecao-container {
                display: flex;
                gap: 15px;
                align-items: center;
                width: 100%;
                margin-top: 10px;
            }
            .select-box { 
                padding: 14px 20px; 
                flex: 1;
                border-radius: 10px; 
                border: 1px solid #cbd5e1; 
                font-size: 15px;
                outline: none;
                transition: all 0.3s ease;
                background-color: #f8fafc;
                color: #334155;
                font-weight: 500;
            }
            .select-box:focus {
                border-color: #8e44ad;
                box-shadow: 0 0 0 3px rgba(142, 68, 173, 0.15);
                background-color: #fff;
            }
            
            .analise-panel {
                display: none;
                margin-top: 25px;
                animation: fadeIn 0.5s ease-out forwards;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            /* Segmented Control para o Tempo */
            .time-filter-wrapper { 
                background: #edf2f7; 
                padding: 6px; 
                border-radius: 12px; 
                display: inline-flex; 
                margin-bottom: 25px;
            }
            .time-filter-wrapper input[type="radio"] { display: none; }
            .time-filter-wrapper label { 
                padding: 8px 20px; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 13px; 
                font-weight: 700; 
                color: #718096; 
                transition: all 0.3s ease; 
            }
            .time-filter-wrapper input[type="radio"]:checked + label { 
                background: #ffffff; 
                color: #8e44ad; 
                box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
            }

            /* Seções de Cards */
            .section-title {
                font-size: 16px;
                color: #2d3748;
                font-weight: 800;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .kpi-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 30px;
            }

            .kpi-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.02);
                transition: transform 0.2s, box-shadow 0.2s;
                position: relative;
                overflow: hidden;
            }
            .kpi-card:hover {
                transform: translateY(-3px);
                box-shadow: 0 10px 20px rgba(0,0,0,0.06);
            }
            .kpi-card::before {
                content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
                background: #cbd5e1;
            }
            .kpi-card.blue::before { background: #3b82f6; }
            .kpi-card.green::before { background: #10b981; }
            .kpi-card.purple::before { background: #8b5cf6; }
            .kpi-card.orange::before { background: #f59e0b; }

            .kpi-title { margin: 0 0 5px 0; color: #64748b; font-size: 13px; font-weight: 600; }
            .kpi-value { margin: 0; font-size: 24px; font-weight: 800; color: #1e293b; }
            .kpi-sub { margin: 5px 0 0 0; font-size: 11px; color: #94a3b8; font-weight: 600; }

            /* Grid dos Gráficos */
            .charts-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 25px;
            }
            @media (max-width: 900px) {
                .charts-grid { grid-template-columns: 1fr; }
            }
            
            .chart-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.03);
            }
            .chart-wrapper {
                position: relative;
                height: 350px;
                width: 100%;
            }
            
            .header-flex { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div class="container dipat-container">
            <div class="header-actions">
                <div class="header-flex">
                    <div>
                        <h1 style="color: #1e293b; margin: 0; font-size: 28px;">📊 Análise DIPAT</h1>
                        <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">Projeção de comportamento (MQO) e simulação de intervenções logísticas.</p>
                    </div>
                </div>
                
                <div class="selecao-container">
                    <select id="selectItemDipat" class="select-box">
                        <option value="">Carregando itens do banco de dados... ⏳</option>
                    </select>
                    <button class="btn" style="background: linear-gradient(135deg, #8e44ad, #6366f1); font-size: 15px; padding: 14px 28px; white-space: nowrap; border-radius: 10px;" onclick="analisarItemSelecionado()">
                        🚀 Executar Análise
                    </button>
                </div>
            </div>

            <!-- PAINEL DE ANÁLISE -->
            <div id="painelAnalise" class="analise-panel">
                
                <div class="header-flex" style="margin-bottom: 25px;">
                    <h2 id="tituloAnalise" style="margin: 0; color: #1e293b; font-size: 20px;">Análise de Tendência</h2>
                    
                    <div class="time-filter-wrapper">
                        <input type="radio" id="fSemana" name="filtroTempo" value="7" checked onchange="atualizarGrafico()">
                        <label for="fSemana">7 Dias</label>

                        <input type="radio" id="fMes" name="filtroTempo" value="30" onchange="atualizarGrafico()">
                        <label for="fMes">30 Dias</label>

                        <input type="radio" id="fAno" name="filtroTempo" value="365" onchange="atualizarGrafico()">
                        <label for="fAno">1 Ano</label>
                        
                        <input type="radio" id="fTudo" name="filtroTempo" value="9999" onchange="atualizarGrafico()">
                        <label for="fTudo">Histórico Completo</label>
                    </div>
                    
                    <button class="btn" onclick="fecharAnalise()" style="background: #f1f5f9; color: #64748b; box-shadow: none; border: 1px solid #cbd5e1;">✕ Fechar</button>
                </div>

                <!-- CARDS MQO -->
                <div class="section-title">📐 Parâmetros do Modelo (MQO)</div>
                <div class="kpi-grid">
                    <div class="kpi-card blue">
                        <p class="kpi-title">Direção da Tendência</p>
                        <p class="kpi-value" id="txtTendencia">--</p>
                    </div>
                    <div class="kpi-card purple">
                        <p class="kpi-title">Coeficiente Angular (β)</p>
                        <p class="kpi-value" id="txtCoefB">--</p>
                    </div>
                    <div class="kpi-card blue">
                        <p class="kpi-title">Último Saldo Registrado</p>
                        <p class="kpi-value" id="txtUltimoValor">--</p>
                    </div>
                </div>

                <!-- CARDS LOGÍSTICA -->
                <div class="section-title">📦 Cenário Logístico Atual</div>
                <div class="kpi-grid">
                    <div class="kpi-card green">
                        <p class="kpi-title">A Receber (Empenhos)</p>
                        <p class="kpi-value" id="txtQtdeReceber">--</p>
                    </div>
                    <div class="kpi-card orange">
                        <p class="kpi-title">Saldo Remanescente (Ata)</p>
                        <p class="kpi-value" id="txtSaldoAta">--</p>
                        <p class="kpi-sub" id="txtVencAta">--</p>
                    </div>
                    <div class="kpi-card purple">
                        <p class="kpi-title">Andamento Longo Prazo</p>
                        <p class="kpi-value" id="txtProcesso2">--</p>
                    </div>
                    <div class="kpi-card orange" style="background: #fffbeb;">
                        <p class="kpi-title">Confiabilidade de Entrega</p>
                        <p class="kpi-value" id="txtRatingFornecedor" style="color: #f59e0b; letter-spacing: 2px;">--</p>
                    </div>
                </div>

                <!-- GRÁFICOS (Lado a Lado via CSS Grid) -->
                <div class="charts-grid">
                    <div class="chart-card">
                        <div class="section-title">📉 Projeção Base (Pura)</div>
                        <div class="chart-wrapper">
                            <canvas id="graficoMQO"></canvas>
                        </div>
                    </div>

                    <div class="chart-card">
                        <div class="section-title">🚚 Projeção c/ Intervenções</div>
                        <div class="chart-wrapper">
                            <canvas id="graficoIntervencao"></canvas>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <script>
            let chartInstancia = null;
            let chartIntervencaoInstancia = null;
            let dadosAnaliseGlobais = null;

            function converterDataExcel(valor) {
                if (!valor || valor === 'Sem Ata' || valor === 'N/A') return 'N/A';
                const num = Number(valor);
                if (!isNaN(num) && num > 30000 && num < 60000) {
                    const data = new Date((num - 25569) * 86400 * 1000);
                    data.setUTCHours(12);
                    return data.toLocaleDateString('pt-BR');
                }
                return valor;
            }

            async function carregarItens() {
                try {
                    const resposta = await fetch('/api/dipat/itens');
                    if (!resposta.ok) throw new Error('Falha ao buscar dados');
                    
                    const itens = await resposta.json();
                    const select = document.getElementById('selectItemDipat');
                    select.innerHTML = '<option value="">-- Selecione um item monitorado --</option>';
                    
                    if (itens.length === 0) {
                        select.innerHTML = '<option value="">Nenhum item cadastrado</option>';
                        return;
                    }

                    itens.forEach(row => {
                        const option = document.createElement('option');
                        option.value = row.itens;
                        option.textContent = \`\${row.itens} - \${row.descricao}\`;
                        select.appendChild(option);
                    });
                } catch (erro) {
                    console.error('Erro:', erro);
                    document.getElementById('selectItemDipat').innerHTML = '<option value="">❌ Erro ao carregar os itens.</option>';
                }
            }

            async function analisarItemSelecionado() {
                const select = document.getElementById('selectItemDipat');
                const codigoItem = select.value;

                if (!codigoItem) {
                    alert('Selecione um item na lista para prosseguir.');
                    return;
                }

                const painel = document.getElementById('painelAnalise');
                document.getElementById('tituloAnalise').innerText = '⏳ Processando modelo MQO...';
                painel.style.display = 'block';
                
                try {
                    const resposta = await fetch('/api/dipat/analise/' + encodeURIComponent(codigoItem));
                    const dados = await resposta.json();

                    if (dados.erro) {
                        alert(dados.erro);
                        fecharAnalise();
                        return;
                    }

                    dadosAnaliseGlobais = dados;
                    document.getElementById('tituloAnalise').innerText = '🎯 Item: ' + codigoItem;

                    const analise = dados.analise;
                    const histOriginal = dados.historicoOriginal;
                    const logistica = dados.logistica;

                    // Atualiza Cards MQO
                    document.getElementById('txtCoefB').innerText = analise.coeficienteAngular_b.toFixed(4);
                    
                    const elTendencia = document.getElementById('txtTendencia');
                    elTendencia.innerText = analise.tendencia;
                    if(analise.tendencia === 'Alta') elTendencia.style.color = '#ef4444'; 
                    else if(analise.tendencia === 'Baixa') elTendencia.style.color = '#10b981';
                    else elTendencia.style.color = '#f59e0b';

                    const ultVal = histOriginal[histOriginal.length - 1].valor;
                    document.getElementById('txtUltimoValor').innerText = Number(ultVal).toLocaleString('pt-BR');

                    // Atualiza Cards Logística
                    document.getElementById('txtQtdeReceber').innerText = Number(logistica.qtdeAReceber).toLocaleString('pt-BR');
                    document.getElementById('txtSaldoAta').innerText = Number(logistica.saldoAta).toLocaleString('pt-BR');
                    document.getElementById('txtVencAta').innerText = "Venc: " + converterDataExcel(logistica.vencAta);
                    document.getElementById('txtProcesso2').innerText = Number(logistica.qtdeProcesso2).toLocaleString('pt-BR');
                    
                    // Atualiza Estrelas
                    let estrelasHTML = '';
                    for (let i = 1; i <= 5; i++) {
                        estrelasHTML += (i <= logistica.ratingFornecedor) ? '⭐' : '☆';
                    }
                    document.getElementById('txtRatingFornecedor').innerText = estrelasHTML;

                    atualizarGrafico();
                    painel.scrollIntoView({ behavior: 'smooth', block: 'start' });

                } catch (erro) {
                    console.error('Erro ao analisar item:', erro);
                    alert('Erro interno ao buscar a análise do item.');
                    fecharAnalise();
                }
            }

            function atualizarGrafico() {
                if (!dadosAnaliseGlobais) return;

                const radios = document.getElementsByName('filtroTempo');
                let diasParaMostrar = 7; 
                for (let r of radios) {
                    if (r.checked) {
                        diasParaMostrar = parseInt(r.value);
                        break;
                    }
                }

                const analise = dadosAnaliseGlobais.analise;
                const histCompleto = dadosAnaliseGlobais.historicoOriginal;
                const intervencao = dadosAnaliseGlobais.intervencao || [];

                const inicioCorte = Math.max(0, histCompleto.length - diasParaMostrar);
                const histVisual = histCompleto.slice(inicioCorte);
                const ajustadoVisual = analise.historicoAjustado.slice(inicioCorte);

                // GRÁFICO 1: MQO PURO
                if (chartInstancia) chartInstancia.destroy();

                const labels1 = histVisual.map(h => h.data || 'Histórico');
                for (let i = 1; i <= analise.projecaoFutura.length; i++) {
                    labels1.push('Mês +' + i);
                }

                const dataRealFull1 = [...histVisual.map(h => h.valor), ...Array(analise.projecaoFutura.length).fill(null)];
                const dataTendencia1 = [...ajustadoVisual, ...Array(analise.projecaoFutura.length).fill(null)];
                
                const ultimoAjustado = ajustadoVisual[ajustadoVisual.length - 1];
                const dataProjecao1 = Array(histVisual.length - 1).fill(null);
                dataProjecao1.push(ultimoAjustado);
                dataProjecao1.push(...analise.projecaoFutura);

                const ctx1 = document.getElementById('graficoMQO').getContext('2d');
                chartInstancia = new Chart(ctx1, {
                    type: 'line',
                    data: {
                        labels: labels1,
                        datasets: [
                            {
                                label: 'Valor Real',
                                data: dataRealFull1,
                                borderColor: '#1e293b',
                                backgroundColor: '#1e293b',
                                borderWidth: 2,
                                fill: false,
                                tension: 0.1,
                                pointRadius: 4
                            },
                            {
                                label: 'Reta MQO',
                                data: dataTendencia1,
                                borderColor: '#3b82f6',
                                borderDash: [5, 5],
                                borderWidth: 2,
                                fill: false,
                                pointRadius: 0
                            },
                            {
                                label: 'Projeção (Base)',
                                data: dataProjecao1,
                                borderColor: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.1,
                                pointRadius: 5
                            }
                        ]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { tooltip: { mode: 'index', intersect: false } },
                        scales: { x: { grid: { display: false } } }
                    }
                });

                // GRÁFICO 2: INTERVENÇÕES LOGÍSTICAS
                if (chartIntervencaoInstancia) chartIntervencaoInstancia.destroy();
                
                if (intervencao.length > 0) {
                    const ctx2 = document.getElementById('graficoIntervencao').getContext('2d');
                    
                    const labels2 = ['Hoje'];
                    for (let i = 1; i <= intervencao.length; i++) {
                        labels2.push('Mês +' + i);
                    }

                    const ultimoReal = histCompleto[histCompleto.length - 1].valor;
                    const dadosIntervencaoPlot = [ultimoReal, ...intervencao];

                    chartIntervencaoInstancia = new Chart(ctx2, {
                        type: 'line',
                        data: {
                            labels: labels2,
                            datasets: [{
                                label: 'Estoque c/ Recebimentos',
                                data: dadosIntervencaoPlot,
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.2,
                                pointRadius: 6,
                                pointBackgroundColor: '#059669'
                            }]
                        },
                        options: { 
                            responsive: true, 
                            maintainAspectRatio: false, 
                            plugins: { tooltip: { mode: 'index', intersect: false } },
                            scales: {
                                y: { beginAtZero: true },
                                x: { grid: { display: false } }
                            }
                        }
                    });
                }
            }

            function fecharAnalise() {
                document.getElementById('painelAnalise').style.display = 'none';
            }

            window.onload = carregarItens;
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderDipat };
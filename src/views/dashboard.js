// src/views/dashboard.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderDashboard(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Dashboard Analítico - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>
        <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
        <style>
            .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-top: 20px; }
            .chart-container { background: white; padding: 20px; border-radius: 10px; box-shadow: 5px 5px 15px #c8d0e7, -5px -5px 15px #ffffff; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            .chart-container-full { grid-column: 1 / -1; }
            canvas { max-width: 100%; height: auto !important; max-height: 280px; margin-top: 10px; }
            canvas.chart-large { max-height: 350px; }
            .tabs-container { display: flex; gap: 10px; margin-bottom: 20px; }
            .tab-btn { flex: 1; padding: 12px 20px; border: none; background: #bdc3c7; color: #2c3e50; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold; transition: 0.3s; }
            .tab-btn.active { background: #8e44ad; color: white; box-shadow: 0 4px 10px rgba(142, 68, 173, 0.3); }
            .kpi-container { display: flex; justify-content: space-around; margin-bottom: 25px; flex-wrap: wrap; gap: 15px; }
            .kpi-card { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; text-align: center; flex: 1; min-width: 200px; box-shadow: 3px 3px 10px rgba(0,0,0,0.1); }
            .kpi-card h3 { margin: 0; font-size: 16px; opacity: 0.9; font-weight: normal; }
            .kpi-card p { margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #ffffff; }
            .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background-color: rgba(0,0,0,0.6); backdrop-filter: blur(3px); }
            .modal-content { background-color: #fefefe; margin: 5vh auto; padding: 25px; border-radius: 10px; width: 95%; max-width: 1300px; box-shadow: 0 5px 25px rgba(0,0,0,0.3); display: flex; flex-direction: column; max-height: 85vh; }
            .close { color: #aaa; align-self: flex-end; font-size: 28px; font-weight: bold; cursor: pointer; margin-left: 10px; }
            .close:hover, .close:focus { color: #333; text-decoration: none; }
            .table-container { overflow-y: auto; overflow-x: auto; white-space: nowrap; margin-top: 15px; border: 1px solid #eee; border-radius: 5px; }
            #modalTable { width: 100%; border-collapse: collapse; }
            #modalTable th { position: sticky; top: 0; background-color: #2c3e50; color: white; padding: 10px; text-align: left; }
            #modalTable td { font-size: 14px; padding: 10px; border-bottom: 1px solid #ddd; }
            .top-controls { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; flex-wrap: wrap; }
            .filtro-rapido { background: #fdfdfd; padding: 10px 15px; border-radius: 8px; border: 1px solid #bdc3c7; display: inline-flex; align-items: center; gap: 10px; box-shadow: 2px 2px 5px rgba(0,0,0,0.05); }
            .filtro-rapido label { font-size: 15px; font-weight: bold; color: #2c3e50; cursor: pointer; }
            .filtro-rapido input[type="checkbox"] { transform: scale(1.2); cursor: pointer; }
            .btn-ppt { background-color: #d35400; color: white; padding: 10px 20px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; box-shadow: 2px 2px 5px rgba(0,0,0,0.1); transition: background-color 0.3s; margin-left: auto; }
            .btn-ppt:hover { background-color: #e67e22; }
            .btn-ppt:disabled { background-color: #95a5a6; cursor: not-allowed; }
            .modal-actions { display: flex; align-items: center; }
            @media print {
                body, html { height: auto !important; overflow: visible !important; background: white !important; }
                body * { visibility: hidden; }
                #detalhesModal, #detalhesModal * { visibility: visible; }
                #detalhesModal { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; height: auto !important; background: white !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; }
                .modal-content { position: static !important; box-shadow: none !important; border: none !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; max-height: none !important; overflow: visible !important; }
                .table-container { overflow: visible !important; border: none !important; height: auto !important; max-height: none !important; }
                #modalTable { width: 100% !important; page-break-inside: auto !important; }
                #modalTable tr { page-break-inside: avoid !important; page-break-after: auto !important; }
                #modalTable thead { display: table-header-group !important; }
                #modalTable tfoot { display: table-footer-group !important; }
                .close, .btn-print, .btn-excel { display: none !important; }
            }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div class="container" style="max-width: 1200px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <h1 style="color: #2c3e50; margin-bottom: 15px;">📊 Centro de Comando - Estoque e Contratações</h1>
                
                <div class="top-controls">
                    <div class="filtro-rapido">
                        <input type="checkbox" id="chkIgnorar116" onchange="inicializarDashboard()">
                        <label for="chkIgnorar116">Ignorar Grupos 116 e 143 (Somente Família C)</label>
                    </div>
                    <div class="filtro-rapido">
                        <input type="checkbox" id="chkIgnorarSemDemanda" checked onchange="inicializarDashboard()">
                        <label for="chkIgnorarSemDemanda" title="Retira dos gráficos todos os materiais que possuem CMM = 0">Ignorar Material Sem Demanda</label>
                    </div>
                    <div class="filtro-rapido">
                        <input type="checkbox" id="chkIgnorarAvn" onchange="inicializarDashboard()">
                        <label for="chkIgnorarAvn" title="Retira da visualização os itens classificados como AVN">Ignorar itens AVN</label>
                    </div>
                    <button id="btnGerarPPT" class="btn-ppt" onclick="baixarPowerPoint()">📥 Exportar PPTX Executivo</button>
                </div>
            </div>
            
            <div class="tabs-container">
                <button class="tab-btn active" id="btn-GERAL" onclick="mudarVisao('GERAL')">Visão Geral (Todos)</button>
                <button class="tab-btn" id="btn-FAR" onclick="mudarVisao('FAR')">Almoxarifado Farmácia (FAR)</button>
                <button class="tab-btn" id="btn-ALM" onclick="mudarVisao('ALM')">Almoxarifado Material (ALM)</button>
            </div>
            
            <div class="kpi-container" id="kpis">
                <div class="kpi-card" style="background: #34495e;">
                    <h3>Total de Itens na Base</h3>
                    <p id="kpiTotal" style="color: #3498db;">...</p>
                </div>
                <div class="kpi-card" id="kpiRupturaCard" style="background: #c0392b; cursor: pointer;" title="Clique para ver os itens">
                    <h3>Ruptura (Ação Imediata) 🚨</h3>
                    <p id="kpiRuptura" style="color: #f1c40f;">...</p>
                </div>
                <div class="kpi-card" id="kpiSegurancaCard" style="background: #27ae60; cursor: pointer;" title="Clique para ver os itens seguros">
                    <h3>Segurança de Estoque ✅</h3>
                    <p id="kpiSeguranca" style="color: #d4efdf;">...</p>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-container">
                    <h3 style="color: #2c3e50; margin: 0; cursor: pointer;">Vitalidade da Base 🧬</h3>
                    <canvas id="chartVida"></canvas>
                </div>
                <div class="chart-container">
                    <h3 style="color: #2c3e50; margin: 0; cursor: pointer;">Raio-X dos Zerados 📉</h3>
                    <canvas id="chartZerados"></canvas>
                </div>
                <div class="chart-container">
                    <h3 style="color: #2c3e50; margin: 0; cursor: pointer;">Saúde do Estoque (Dias) 🏥</h3>
                    <canvas id="chartEstoque"></canvas>
                </div>
                <div class="chart-container">
                    <h3 style="color: #2c3e50; margin: 0; cursor: pointer;">Status das Atas 📋</h3>
                    <canvas id="chartAtas"></canvas>
                </div>
                <div class="chart-container">
                    <h3 style="color: #2c3e50; margin: 0; cursor: pointer;">Status dos Processos 🔄</h3>
                    <canvas id="chartProcessos"></canvas>
                </div>
                <div class="chart-container chart-container-full">
                    <h3 style="color: #2c3e50; margin: 0;">Saúde do Estoque por Planejador</h3>
                    <canvas id="chartPlanEstoque" class="chart-large"></canvas>
                </div>
                <div class="chart-container chart-container-full">
                    <h3 style="color: #2c3e50; margin: 0;">Status das Atas por Planejador</h3>
                    <canvas id="chartPlanAtas" class="chart-large"></canvas>
                </div>
            </div>
        </div>

        <div id="detalhesModal" class="modal">
            <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px;">
                    <h2 id="modalTitle" style="color: #2c3e50; margin: 0;">Detalhes do Relatório</h2>
                    <div class="modal-actions">
                        <button class="btn btn-excel" onclick="exportarExcelModal()" style="background-color: #27ae60; font-size: 14px; margin-right: 10px; color: white;">📊 Exportar Excel</button>
                        <button class="btn btn-print" onclick="window.print()" style="background-color: #8e44ad; font-size: 14px; margin-right: 15px; color: white;">🖨️ Gerar Relatório PDF</button>
                        <span class="close" id="closeModal">&times;</span>
                    </div>
                </div>
                <div class="table-container">
                    <table id="modalTable">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Descrição</th>
                                <th>Planejador</th>
                                <th>Saldo</th>
                                <th>Saldo (Dias)</th>
                                <th>Qtd Empenho</th>
                                <th>Qtd Ata</th>
                                <th>Saldo Ata</th>
                                <th>AE</th>
                                <th>Validade Ata</th>
                                <th>Proc. Ata</th>
                                <th>Proc. Andamento</th>
                            </tr>
                        </thead>
                        <tbody id="modalTableBody">
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <script>
            Chart.register(ChartDataLabels);
            Chart.defaults.set('plugins.datalabels', { color: '#fff', font: { weight: 'bold', size: 12 }, textShadowBlur: 4, textShadowColor: 'rgba(0, 0, 0, 0.8)' });

            let dadosMaster = null;
            let visaoAtual = 'GERAL';
            let chartsInstancias = {};

            const coresVida = ['#2ecc71', '#7f8c8d'];
            const coresEstoque = ['#e74c3c', '#f1c40f', '#2ecc71', '#95a5a6', '#8e44ad', '#7f8c8d'];
            const coresAtas = ['#27ae60', '#f1c40f', '#e67e22', '#c0392b', '#7f8c8d'];
            const coresProcessos = ['#3498db', '#9b59b6', '#95a5a6'];
            const coresZerados = ['#c0392b', '#e67e22', '#3498db', '#27ae60', '#7f8c8d'];

            function abrirModal(titulo, itens, regra = '') {
                window.currentModalItems = itens;
                window.currentModalTitle = titulo;

                let tituloHtml = titulo + \` (\${itens.length} itens)\`;
                if (regra) {
                    tituloHtml += \`<br><span style="font-size: 14px; font-weight: normal; color: #7f8c8d; display: block; margin-top: 5px;"><strong>Regra aplicada:</strong> \${regra}</span>\`;
                }

                document.getElementById('modalTitle').innerHTML = tituloHtml;
                const tbody = document.getElementById('modalTableBody');
                
                tbody.innerHTML = itens.map(i => \`
                    <tr>
                        <td><strong>\${i.item}</strong></td>
                        <td>\${i.descricao}</td>
                        <td><span class="tag tag-ok">\${i.planejador}</span></td>
                        <td>\${i.saldoAtual !== undefined ? i.saldoAtual : '-'}</td>
                        <td>\${i.saldoEmDias}</td>
                        <td>\${i.qtdEmpenho !== undefined ? i.qtdEmpenho : '-'}</td>
                        <td>\${i.qtdAta !== undefined ? i.qtdAta : '-'}</td>
                        <td>\${i.saldoAta !== undefined ? i.saldoAta : '-'}</td>
                        <td>\${i.ae !== undefined ? i.ae : '-'}</td>
                        <td>\${i.validadeAta || '-'}</td>
                        <td>\${(i.processoAta && i.processoAta !== 'N/A') ? String(i.processoAta).split(', ').join('<br>') : '-'}</td>
                        <td>\${(i.processoAndamento && i.processoAndamento !== 'N/A') ? String(i.processoAndamento).split(', ').join('<br>') : '-'}</td>
                    </tr>
                \`).join('');
                document.getElementById('detalhesModal').style.display = 'block';
            }

            window.exportarExcelModal = function() {
                if (!window.currentModalItems || window.currentModalItems.length === 0) {
                    alert('Não há dados para exportar neste relatório.');
                    return;
                }
                
                const dadosPlanilha = window.currentModalItems.map(i => ({
                    'Item': i.item,
                    'Descrição': i.descricao,
                    'Planejador': i.planejador,
                    'Saldo': i.saldoAtual !== undefined ? i.saldoAtual : 0,
                    'Saldo em Dias': i.saldoEmDias,
                    'Qtde Empenho': i.qtdEmpenho !== undefined ? i.qtdEmpenho : 0,
                    'Qtde Ata': i.qtdAta !== undefined ? i.qtdAta : 0,
                    'Saldo da Ata': i.saldoAta !== undefined ? i.saldoAta : 0,
                    'AE': i.ae !== undefined ? i.ae : '-',
                    'Validade da Ata': i.validadeAta || '-',
                    'Processo da Ata': (i.processoAta && i.processoAta !== 'N/A') ? String(i.processoAta).split(', ').join('\\n') : '-',
                    'Processos em Andamento': (i.processoAndamento && i.processoAndamento !== 'N/A') ? String(i.processoAndamento).split(', ').join('\\n') : '-'
                }));

                const worksheet = XLSX.utils.json_to_sheet(dadosPlanilha);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório Filtrado");

                let nomeArquivo = "Relatorio";
                if (window.currentModalTitle) {
                    nomeArquivo = window.currentModalTitle.replace(/[^a-zA-Z0-9]/g, '_');
                }

                XLSX.writeFile(workbook, nomeArquivo + ".xlsx");
            };

            document.getElementById('closeModal').onclick = function() { document.getElementById('detalhesModal').style.display = 'none'; }
            window.onclick = function(event) { if (event.target == document.getElementById('detalhesModal')) { document.getElementById('detalhesModal').style.display = 'none'; } }

            function destruirGraficos() {
                Object.values(chartsInstancias).forEach(chart => chart && chart.destroy());
                chartsInstancias = {};
            }

            const formatadorPizza = {
                formatter: (value, ctx) => {
                    if (value === 0 || isNaN(value)) return null;
                    let sum = ctx.dataset.data.reduce((a, b) => Number(a) + Number(b), 0);
                    if (sum === 0) return null;
                    let percentage = (value * 100 / sum).toFixed(1) + "%";
                    return value + '\\n(' + percentage + ')';
                },
                textAlign: 'center'
            };

            const formatadorBarra = { formatter: (value) => value > 0 ? value : null };

            function renderizarVisao(dados) {
                destruirGraficos();

                document.getElementById('kpiTotal').innerText = dados.totalItens;
                document.getElementById('kpiRuptura').innerText = dados.acaoImediata;
                document.getElementById('kpiSeguranca').innerText = dados.segurancaEstoque;

                const regraRuptura = 'Itens com Saldo Atual zerado ou negativo, com CMM > 0, sem Empenho a receber e sem AE associada.';
                document.getElementById('kpiRupturaCard').onclick = () => { abrirModal('🚨 Ruptura Total: Zerados S/ Empenho e S/ AE', dados.detalhes.filter(i => i.isAcaoImediata), regraRuptura); };
                
                const regraSeguranca = 'CMM12 > 0, Saldo Atual do item >= 2x o CMM12 E Saldo residual da Ata >= 1.5x o CMM12.';
                document.getElementById('kpiSegurancaCard').onclick = () => { abrirModal('✅ Segurança de Estoque', dados.detalhes.filter(i => i.isSegurancaEstoque), regraSeguranca); };

                const regrasVida = [
                    'O item possui CMM12 maior que zero OU possui saldo físico disponível no estoque.',
                    'O item possui CMM12 igual a zero E o Saldo Atual está zerado ou negativo.'
                ];
                chartsInstancias.vida = new Chart(document.getElementById('chartVida'), {
                    type: 'pie',
                    data: { labels: ['Com Vida (Saldo ou Demanda)', 'Sem Demanda'], datasets: [{ data: [dados.vidaVsMorto.vivos, dados.vidaVsMorto.mortos], backgroundColor: coresVida, borderWidth: 0 }] },
                    options: { responsive: true, plugins: { legend: { position: 'bottom' }, datalabels: formatadorPizza }, onClick: (evt, elements) => { if(elements.length > 0){ const i = elements[0].index; const label = ['Itens Com Vida', 'Itens Sem Demanda'][i]; const isSemDem = i === 1; abrirModal('Vitalidade: ' + label, dados.detalhes.filter(item => isSemDem ? item.catEstoque === 'semDemanda' : item.catEstoque !== 'semDemanda'), regrasVida[i]); } } }
                });

                const regrasZerados = [
                    'Saldo Atual <= 0. Não possui Ata vigente com saldo, nem AE emitida, nem Empenho.',
                    'Saldo Atual <= 0. Possui Ata vigente com saldo, mas nenhuma AE foi localizada.',
                    'Saldo Atual <= 0. Possui AE solicitada e Ata vigente com saldo residual.',
                    'Saldo Atual <= 0. Possui número de empenho válido (material a caminho).',
                    'Saldo Atual <= 0 e o CMM12 é igual a zero.'
                ];
                chartsInstancias.zerados = new Chart(document.getElementById('chartZerados'), {
                    type: 'pie',
                    data: { labels: ['Crítico (Sem Ata/AE)', 'C/ Ata (Falta AE)', 'C/ AE e Ata', 'C/ Empenho (A Caminho)', 'Sem Demanda'], datasets: [{ data: [dados.zerados.critico, dados.zerados.comAta, dados.zerados.comAeEAta, dados.zerados.comEmpenho, dados.zerados.semDemanda], backgroundColor: coresZerados, borderWidth: 0 }] },
                    options: { responsive: true, plugins: { legend: { position: 'bottom' }, datalabels: formatadorPizza }, onClick: (evt, elements) => { if(elements.length > 0){ const i = elements[0].index; const cats = ['critico', 'comAta', 'comAeEAta', 'comEmpenho', 'semDemanda']; const label = ['Crítico (Sem Ata/AE/Empenho)', 'Zerados C/ Ata (Falta AE)', 'Zerados C/ AE e Ata', 'Zerados C/ Empenho', 'Sem Demanda'][i]; abrirModal('Raio-X Zerados: ' + label, dados.detalhes.filter(item => item.catZerado === cats[i]), regrasZerados[i]); } } }
                });

                const regrasEstoque = [
                    'Cobertura de estoque menor ou igual a 30 dias.',
                    'Cobertura de estoque entre 31 e 60 dias.',
                    'Cobertura de estoque maior que 60 dias.',
                    'O CMM12 é igual a zero, mas o item ainda possui saldo físico.',
                    'O item pertence aos grupos de estoque 116 ou 143 (Família C).',
                    'O CMM12 é igual a zero e o Saldo Atual está zerado.'
                ];
                chartsInstancias.estoque = new Chart(document.getElementById('chartEstoque'), {
                    type: 'doughnut',
                    data: { labels: ['Crítico (<= 30)', 'Atenção (31-60)', 'Monitorar (> 60)', 'CMM Zero', 'Grupos 116 e 143', 'Sem Demanda'], datasets: [{ data: [dados.estoque.critico, dados.estoque.atencao, dados.estoque.monitorar, dados.estoque.cmmZero, dados.estoque.grupo116, dados.estoque.semDemanda], backgroundColor: coresEstoque, borderWidth: 0 }] },
                    options: { responsive: true, plugins: { legend: { position: 'bottom' }, datalabels: formatadorPizza }, onClick: (evt, elements) => { if(elements.length > 0){ const i = elements[0].index; const cats = ['critico', 'atencao', 'monitorar', 'cmmZero', 'grupo116', 'semDemanda']; const label = ['Crítico (<= 30)', 'Atenção (31-60)', 'Monitorar (> 60)', 'CMM Zero', 'Grupos 116 e 143', 'Sem Demanda'][i]; abrirModal('Estoque: ' + label, dados.detalhes.filter(item => item.catEstoque === cats[i]), regrasEstoque[i]); } } }
                });

                const regrasAtas = [
                    'Ata vigente dentro do prazo e Saldo Atual maior que 3x o CMM12.',
                    'Ata vigente dentro do prazo, mas Saldo Atual é menor ou igual a 3x o CMM12.',
                    'Ata vigente dentro do prazo, mas o Saldo Atual está zerado ou negativo.',
                    'O item já possuiu ata registrada, mas a data de vencimento é anterior a hoje.',
                    'O item não possui nenhum número de processo de compra ou data de vencimento na planilha.'
                ];
                chartsInstancias.atas = new Chart(document.getElementById('chartAtas'), {
                    type: 'bar',
                    data: { 
                        labels: ['Vigente (Segura)', 'Vigente (Alerta)', 'Vigente (S/ Saldo)', 'Vencida', 'Sem Ata'], 
                        datasets: [{ 
                            label: 'Itens', 
                            data: [
                                dados.atas.vigenteSegura, 
                                dados.atas.vigenteAlerta, 
                                dados.atas.vigenteSemSaldo, 
                                dados.atas.vencidas, 
                                dados.atas.semAta
                            ], 
                            backgroundColor: coresAtas, 
                            borderRadius: 5 
                        }] 
                    },
                    options: { 
                        responsive: true, 
                        plugins: { legend: { display: false }, datalabels: formatadorBarra }, 
                        scales: { y: { beginAtZero: true } }, 
                        onClick: (evt, elements) => { 
                            if(elements.length > 0){ 
                                const i = elements[0].index; 
                                const cats = ['vigenteSegura', 'vigenteAlerta', 'vigenteSemSaldo', 'vencidas', 'semAta']; 
                                const label = ['Vigente (Segura)', 'Vigente (Alerta)', 'Vigente (S/ Saldo)', 'Vencida', 'Sem Ata'][i]; 
                                abrirModal('Atas: ' + label, dados.detalhes.filter(item => item.catAtas === cats[i]), regrasAtas[i]); 
                            } 
                        } 
                    }
                });

                const regrasProcessos = [
                    'Possui número de processo associado à coluna de Ata na planilha principal.',
                    'Possui número de processo preenchido na coluna "Em Andamento".',
                    'Não possui número de processo informado na planilha.'
                ];
                chartsInstancias.processos = new Chart(document.getElementById('chartProcessos'), {
                    type: 'pie',
                    data: { labels: ['Com Ata', 'Em Andamento', 'Nenhum Processo'], datasets: [{ data: [dados.processos.comAta, dados.processos.emAndamento, dados.processos.nenhum], backgroundColor: coresProcessos, borderWidth: 0 }] },
                    options: { responsive: true, plugins: { legend: { position: 'bottom' }, datalabels: formatadorPizza }, onClick: (evt, elements) => { if(elements.length > 0){ const i = elements[0].index; const cats = ['comAta', 'emAndamento', 'nenhum']; const label = ['Com Ata', 'Em Andamento', 'Nenhum Processo'][i]; abrirModal('Processos: ' + label, dados.detalhes.filter(item => item.catProcessos === cats[i]), regrasProcessos[i]); } } }
                });

                const planejadores = Object.keys(dados.porPlanejador).sort();
                chartsInstancias.planEstoque = new Chart(document.getElementById('chartPlanEstoque'), {
                    type: 'bar',
                    data: { labels: planejadores, datasets: [ { label: 'Crítico', data: planejadores.map(p => dados.porPlanejador[p].estoque.critico), backgroundColor: coresEstoque[0] }, { label: 'Atenção', data: planejadores.map(p => dados.porPlanejador[p].estoque.atencao), backgroundColor: coresEstoque[1] }, { label: 'Monitorar', data: planejadores.map(p => dados.porPlanejador[p].estoque.monitorar), backgroundColor: coresEstoque[2] }, { label: 'CMM Zero', data: planejadores.map(p => dados.porPlanejador[p].estoque.cmmZero), backgroundColor: coresEstoque[3] }, { label: 'Grupos 116 e 143', data: planejadores.map(p => dados.porPlanejador[p].estoque.grupo116), backgroundColor: coresEstoque[4] }, { label: 'Sem Demanda', data: planejadores.map(p => dados.porPlanejador[p].estoque.semDemanda), backgroundColor: coresEstoque[5] } ] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: formatadorBarra }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, onClick: (evt, elements) => { if(elements.length > 0){ const d = elements[0].datasetIndex; const i = elements[0].index; const cats = ['critico', 'atencao', 'monitorar', 'cmmZero', 'grupo116', 'semDemanda']; const label = ['Crítico', 'Atenção', 'Monitorar', 'CMM Zero', 'Grupos 116 e 143', 'Sem Demanda'][d]; abrirModal(\`Estoque \${label} - \${planejadores[i]}\`, dados.detalhes.filter(item => item.planejador === planejadores[i] && item.catEstoque === cats[d]), regrasEstoque[d]); } } }
                });

                chartsInstancias.planAtas = new Chart(document.getElementById('chartPlanAtas'), {
                    type: 'bar',
                    data: { 
                        labels: planejadores, 
                        datasets: [ 
                            { label: 'Vigente Segura', data: planejadores.map(p => dados.porPlanejador[p].atas.vigenteSegura), backgroundColor: coresAtas[0] }, 
                            { label: 'Vigente Alerta', data: planejadores.map(p => dados.porPlanejador[p].atas.vigenteAlerta), backgroundColor: coresAtas[1] }, 
                            { label: 'Vigente S/ Saldo', data: planejadores.map(p => dados.porPlanejador[p].atas.vigenteSemSaldo), backgroundColor: coresAtas[2] }, 
                            { label: 'Vencidas', data: planejadores.map(p => dados.porPlanejador[p].atas.vencidas), backgroundColor: coresAtas[3] },
                            { label: 'Sem Ata', data: planejadores.map(p => dados.porPlanejador[p].atas.semAta), backgroundColor: coresAtas[4] }
                        ] 
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { datalabels: formatadorBarra }, 
                        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, 
                        onClick: (evt, elements) => { 
                            if(elements.length > 0){ 
                                const d = elements[0].datasetIndex; 
                                const i = elements[0].index; 
                                const cats = ['vigenteSegura', 'vigenteAlerta', 'vigenteSemSaldo', 'vencidas', 'semAta']; 
                                const labelsAtas = ['Vigente Segura', 'Vigente Alerta', 'Vigente S/ Saldo', 'Vencida', 'Sem Ata']; 
                                abrirModal(\`Atas: \${labelsAtas[d]} - \${planejadores[i]}\`, dados.detalhes.filter(item => item.planejador === planejadores[i] && item.catAtas === cats[d]), regrasAtas[d]); 
                            } 
                        } 
                    }
                });
            }

            window.mudarVisao = function(novaVisao) {
                visaoAtual = novaVisao;
                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                document.getElementById('btn-' + novaVisao).classList.add('active');
                renderizarVisao(dadosMaster[visaoAtual]);
            };

            async function inicializarDashboard() {
                try {
                    const ignorar116 = document.getElementById('chkIgnorar116').checked;
                    const ignorarSemDemanda = document.getElementById('chkIgnorarSemDemanda').checked;
                    const ignorarAvn = document.getElementById('chkIgnorarAvn').checked;
                    
                    const resposta = await fetch('/api/dashboard-stats?ignorar116=' + ignorar116 + '&ignorarSemDemanda=' + ignorarSemDemanda + '&ignorarAvn=' + ignorarAvn);
                    
                    dadosMaster = await resposta.json();
                    
                    visaoAtual = visaoAtual || 'GERAL';
                    
                    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                    document.getElementById('btn-' + visaoAtual).classList.add('active');
                    renderizarVisao(dadosMaster[visaoAtual]);
                } catch (erro) {
                    console.error('Erro ao carregar os dados do dashboard', erro);
                    document.getElementById('kpiTotal').innerText = 'Erro na Leitura';
                }
            }

            window.baixarPowerPoint = async function() {
                const btn = document.getElementById('btnGerarPPT');
                const textoOriginal = btn.innerHTML;
                btn.innerHTML = '⏳ Gerando e baixando PPTX...';
                btn.disabled = true;

                try {
                    const graficosBase64 = {};
                    if (chartsInstancias.vida) graficosBase64.chartVida = chartsInstancias.vida.toBase64Image();
                    if (chartsInstancias.zerados) graficosBase64.chartZerados = chartsInstancias.zerados.toBase64Image();
                    if (chartsInstancias.estoque) graficosBase64.chartEstoque = chartsInstancias.estoque.toBase64Image();
                    if (chartsInstancias.processos) graficosBase64.chartProcessos = chartsInstancias.processos.toBase64Image();

                    const estatisticas = dadosMaster[visaoAtual];

                    const resposta = await fetch('/api/gerar-ppt', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ graficosBase64, estatisticas })
                    });

                    if (!resposta.ok) throw new Error('Falha ao gerar a apresentação executiva no servidor.');

                    const blob = await resposta.blob();
                    const url = window.URL.createObjectURL(blob);
                    const linkDownload = document.createElement('a');
                    linkDownload.style.display = 'none';
                    linkDownload.href = url;
                    
                    const dataHoje = new Date().toISOString().split('T')[0];
                    linkDownload.download = \`Relatorio_Executivo_\${visaoAtual}_\${dataHoje}.pptx\`;
                    
                    document.body.appendChild(linkDownload);
                    linkDownload.click();
                    
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(linkDownload);
                } catch (erro) {
                    console.error('Erro na exportação do PowerPoint:', erro);
                    alert('Erro ao tentar gerar o PowerPoint. Verifique os logs do terminal da Hera.');
                } finally {
                    btn.innerHTML = textoOriginal;
                    btn.disabled = false;
                }
            };

            window.onload = inicializarDashboard;
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderDashboard };
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderPainelExecutivo(usuario) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Painel Executivo - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0"></script>
        <link rel="stylesheet" href="https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css">
        <script src="https://code.jquery.com/jquery-3.7.0.min.js"></script>
        <script src="https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js"></script>
        <style>
            .executivo-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 20px; background: linear-gradient(135deg, #2c3e50, #34495e);
                color: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            .executivo-header h1 { margin: 0; font-size: 24px; }
            .executivo-header p { margin: 5px 0 0 0; opacity: 0.8; font-size: 14px; }
            
            .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .stat-card {
                background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);
                text-align: center; border-bottom: 5px solid #bdc3c7; transition: transform 0.3s ease; cursor: pointer;
            }
            .stat-card:hover { transform: translateY(-5px); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
            .stat-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #7f8c8d; text-transform: uppercase; }
            .stat-card .value { font-size: 32px; font-weight: bold; color: #2c3e50; margin: 0; }
            
            .stat-critico { border-color: #e74c3c; } .stat-critico .value { color: #e74c3c; }
            .stat-ata { border-color: #f39c12; } .stat-ata .value { color: #f39c12; }
            .stat-ae { border-color: #3498db; } .stat-ae .value { color: #3498db; }
            .stat-empenho { border-color: #2ecc71; } .stat-empenho .value { color: #2ecc71; }

            .dashboard-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 20px; margin-bottom: 30px; }
            .chart-container { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
            .table-container { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow-x: auto; }
            
            .badge { padding: 5px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; color: white; display: inline-block; }
            .bg-red { background-color: #e74c3c; } .bg-orange { background-color: #f39c12; }
            .bg-blue { background-color: #3498db; } .bg-green { background-color: #2ecc71; }
            .bg-gray { background-color: #95a5a6; }

            .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; }
            .modal-content { background: white; width: 95%; max-width: 1000px; height: 90%; border-radius: 10px; padding: 25px; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; }
            .modal-small { width: 500px; height: auto; max-height: 90%; }
            .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ecf0f1; padding-bottom: 15px; margin-bottom: 20px; }
            .modal-close { cursor: pointer; font-size: 14px; color: white; background: #e74c3c; border: none; padding: 8px 15px; border-radius: 5px; font-weight: bold; transition: 0.3s; }
            .modal-close:hover { background: #c0392b; }
            .modal-body { flex: 1; overflow-y: auto; }

            /* Torna as linhas da tabela clicáveis */
            table.dataTable tbody tr { cursor: pointer; transition: background-color 0.2s; }
            table.dataTable tbody tr:hover { background-color: #eaf2f8 !important; }

            .custom-select { padding: 8px 15px; font-size: 16px; font-weight: bold; border-radius: 5px; border: 1px solid #fff; background: rgba(255,255,255,0.2); color: white; outline: none; cursor: pointer; }
            .custom-select option { color: #2c3e50; }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuario)}
        <div class="main-content">
            <div class="executivo-header">
                <div>
                    <h1>Raio-X de Desabastecimento</h1>
                    <p>Visão Executiva: Itens Zerados (Ignorando 116/143, Sem Demanda e AVN)</p>
                </div>
                <div style="display: flex; align-items: center; gap: 20px; text-align: right;">
                    <div>
                        <p style="margin: 0 0 5px 0; font-size: 12px; font-weight: bold;">LOCAL</p>
                        <select id="filtroLocal" class="custom-select" onchange="mudarFiltroLocal()">
                            <option value="GERAL">Visão Geral (Todos)</option>
                            <option value="FAR">Apenas Farmácia (FAR)</option>
                            <option value="ALM">Apenas Almoxarifado (ALM)</option>
                        </select>
                    </div>
                    <div>
                        <h2 style="margin: 0; font-size: 28px;" id="totalZeradosHeader">0</h2>
                        <p style="margin: 0;">Itens Zerados</p>
                    </div>
                </div>
            </div>

            <div class="summary-cards">
                <div class="stat-card stat-critico" onclick="abrirModalLista('critico', 'Crítico')">
                    <h3>Crítico</h3>
                    <p class="value" id="cardCritico">0</p>
                </div>
                <div class="stat-card stat-ata" onclick="abrirModalLista('comAta', 'Aguardando AE')">
                    <h3>Aguardando AE</h3>
                    <p class="value" id="cardAta">0</p>
                </div>
                <div class="stat-card stat-ae" onclick="abrirModalLista('comAeEAta', 'Aguardando Empenho')">
                    <h3>Aguardando Empenho</h3>
                    <p class="value" id="cardAe">0</p>
                </div>
                <div class="stat-card stat-empenho" onclick="abrirModalLista('comEmpenho', 'Aguardando Entrega')">
                    <h3>Aguardando Entrega</h3>
                    <p class="value" id="cardEmpenho">0</p>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="chart-container">
                    <h3 style="margin-top: 0; color: #2c3e50; text-align: center; width: 100%;">Panorama de Risco</h3>
                    <div style="position: relative; width: 100%; height: 300px;">
                        <canvas id="graficoZerados"></canvas>
                    </div>
                </div>
                <div class="table-container">
                    <h3 style="margin-top: 0; color: #2c3e50;">Lista Detalhada de Itens Zerados</h3>
                    <p style="font-size: 12px; color: #7f8c8d; margin-top: -10px;">Clique em uma linha para ver os detalhes operacionais e as cotas.</p>
                    <table id="tabelaDetalhes" class="display" style="width:100%; font-size: 13px;">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Descrição</th>
                                <th>Planejador</th>
                                <th>CMM</th>
                                <th>Status Logístico</th>
                            </tr>
                        </thead>
                        <tbody id="tbodyDetalhes"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- MODAL 1: LISTA EXPANDIDA DE UMA CATEGORIA ESPECÍFICA -->
        <div id="modalLista" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="modalTituloLista" style="margin: 0; color: #2c3e50;">Lista</h2>
                    <button class="modal-close" onclick="fecharModal('modalLista')">✖ Fechar</button>
                </div>
                <div class="modal-body">
                    <p style="font-size: 12px; color: #7f8c8d;">Clique em um item para abrir os detalhes operacionais.</p>
                    <table id="tabelaModalLista" class="display" style="width:100%; font-size: 13px;">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Descrição</th>
                                <th>Planejador</th>
                                <th>CMM</th>
                            </tr>
                        </thead>
                        <tbody id="tbodyModalLista"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- MODAL 2: DETALHES ESPECÍFICOS DO ITEM (Abre ao clicar na linha) -->
        <div id="modalItemDetalhe" class="modal-overlay">
            <div class="modal-content modal-small">
                <div class="modal-header">
                    <h2 style="margin: 0; color: #2c3e50;">Detalhes do Item</h2>
                    <button class="modal-close" onclick="fecharModal('modalItemDetalhe')">✖</button>
                </div>
                <div class="modal-body" style="font-size: 15px; color: #34495e; line-height: 1.6;">
                    <p><strong>Item:</strong> <span id="detItemCod"></span></p>
                    <p><strong>Descrição:</strong> <span id="detItemDesc"></span></p>
                    <p><strong>CMM (Mensal):</strong> <span id="detItemCmm" style="font-weight:bold; color:#d35400;"></span></p>
                    <hr style="border: 0; border-top: 1px solid #ecf0f1; margin: 15px 0;">
                    
                    <div style="background: #fdfefe; border: 1px solid #ecf0f1; padding: 15px; border-radius: 8px;">
                        <p style="margin-top: 0;"><strong>Processo com Ata (Saldo > 0):</strong><br>
                           <span id="detItemProcAta" style="color: #27ae60; font-weight:bold;"></span></p>
                        <p style="margin-bottom: 0;"><strong>Processos em Andamento:</strong><br>
                           <span id="detItemProcAnd" style="color: #2980b9; font-weight:bold;"></span></p>
                    </div>

                    <div style="margin-top: 25px; text-align: center;">
                        <button id="btnVerCotas" class="btn" style="background-color: #8e44ad; color: white; padding: 12px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; font-size: 15px; transition: 0.2s;">
                            📊 Abrir Distribuição de Cotas (Top 10)
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- MODAL 3: TOP 10 COTAS -->
        <div id="modalCotas" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 style="margin: 0; color: #2c3e50;">Top 10 - Distribuição de Cotas</h2>
                    <button class="modal-close" onclick="fecharModal('modalCotas')">✖ Voltar</button>
                </div>
                <div class="modal-body">
                    <h3 id="cotasTituloItem" style="margin-top: 0; color: #7f8c8d;"></h3>
                    <table class="display" style="width:100%; font-size: 14px; text-align: left; border-collapse: collapse; margin-top: 15px;">
                        <thead>
                            <tr style="background: #34495e; color: white;">
                                <th style="padding: 12px; border-radius: 5px 0 0 5px;">Setor Solicitante</th>
                                <th style="padding: 12px;">Unidade</th>
                                <th style="padding: 12px; text-align: center;">Cota Fixa</th>
                                <th style="padding: 12px; text-align: center; border-radius: 0 5px 5px 0;">Projeção Mensal</th>
                            </tr>
                        </thead>
                        <tbody id="tbodyCotas"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <script>
            Chart.register(ChartDataLabels);

            let graficoInstancia = null;
            let dadosMaster = null; 
            let dadosAtuais = []; 

            const formatarNumeroBR = (valor) => {
                if (!valor) return '0';
                return Number(valor).toLocaleString('pt-BR');
            };

            async function carregarDados() {
                try {
                    $('#tbodyDetalhes').html('<tr><td colspan="5" style="text-align: center;">⏳ Carregando dados executivos...</td></tr>');
                    const response = await fetch('/api/painel-executivo-stats');
                    if (!response.ok) throw new Error('Falha ao buscar dados');
                    
                    dadosMaster = await response.json();
                    renderizarVisao();
                } catch (error) {
                    console.error('Erro:', error);
                    $('#tbodyDetalhes').html('<tr><td colspan="5" style="text-align: center; color: red;">❌ Erro ao carregar os dados.</td></tr>');
                }
            }

            function mudarFiltroLocal() {
                if(dadosMaster) renderizarVisao();
            }

            function renderizarVisao() {
                const local = document.getElementById('filtroLocal').value;
                const visao = dadosMaster[local];
                dadosAtuais = visao.detalhes || [];

                atualizarCards(visao.resumoZerados);
                atualizarGrafico(visao.resumoZerados);
                atualizarTabelaPrincipal(dadosAtuais);
            }

            function atualizarCards(resumo) {
                const total = (resumo.critico || 0) + (resumo.comAta || 0) + (resumo.comAeEAta || 0) + (resumo.comEmpenho || 0);
                document.getElementById('totalZeradosHeader').innerText = total;
                document.getElementById('cardCritico').innerText = resumo.critico || 0;
                document.getElementById('cardAta').innerText = resumo.comAta || 0;
                document.getElementById('cardAe').innerText = resumo.comAeEAta || 0;
                document.getElementById('cardEmpenho').innerText = resumo.comEmpenho || 0;
            }

            function atualizarGrafico(resumo) {
                const total = (resumo.critico || 0) + (resumo.comAta || 0) + (resumo.comAeEAta || 0) + (resumo.comEmpenho || 0);
                const pct = (val) => total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                const ctx = document.getElementById('graficoZerados').getContext('2d');
                
                if (graficoInstancia) graficoInstancia.destroy();

                const centerTextPlugin = {
                    id: 'centerText',
                    beforeDraw: function(chart) {
                        if (chart.config.options.elements.center) {
                            const ctx = chart.ctx;
                            const centerConfig = chart.config.options.elements.center;
                            const txt = centerConfig.text;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            const centerX = ((chart.chartArea.left + chart.chartArea.right) / 2);
                            const centerY = ((chart.chartArea.top + chart.chartArea.bottom) / 2);
                            
                            ctx.font = "bold 36px Helvetica";
                            ctx.fillStyle = "#2c3e50";
                            ctx.fillText(txt, centerX, centerY - 5);
                            
                            ctx.font = "14px Arial";
                            ctx.fillStyle = "#7f8c8d";
                            ctx.fillText("ITENS", centerX, centerY + 25);
                        }
                    }
                };

                graficoInstancia = new Chart(ctx, {
                    type: 'doughnut',
                    plugins: [centerTextPlugin],
                    data: {
                        labels: [
                            \`Crítico: \${resumo.critico || 0} (\${pct(resumo.critico || 0)}%)\`,
                            \`Aguard. AE: \${resumo.comAta || 0} (\${pct(resumo.comAta || 0)}%)\`,
                            \`Aguard. Empenho: \${resumo.comAeEAta || 0} (\${pct(resumo.comAeEAta || 0)}%)\`,
                            \`Aguard. Entrega: \${resumo.comEmpenho || 0} (\${pct(resumo.comEmpenho || 0)}%)\`
                        ],
                        datasets: [{
                            data: [ resumo.critico || 0, resumo.comAta || 0, resumo.comAeEAta || 0, resumo.comEmpenho || 0 ],
                            backgroundColor: ['#e74c3c', '#f39c12', '#3498db', '#2ecc71'],
                            borderWidth: 2, borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '65%',
                        elements: { center: { text: total.toString() } },
                        plugins: {
                            legend: { position: 'right', labels: { padding: 20, font: { size: 12 } } },
                            datalabels: {
                                color: '#fff', font: { weight: 'bold', size: 14 }, textAlign: 'center',
                                formatter: (value) => value === 0 ? '' : value + '\\n(' + pct(value) + '%)'
                            },
                            tooltip: { callbacks: { label: (c) => \` \${c.raw} Itens (\${pct(c.raw)}%)\` } }
                        }
                    }
                });
            }

            function getStatusBadge(catZerado) {
                switch(catZerado) {
                    case 'critico': return '<span class="badge bg-red">Crítico</span>';
                    case 'comAta': return '<span class="badge bg-orange">Aguard. AE</span>';
                    case 'comAeEAta': return '<span class="badge bg-blue">Aguard. Empenho</span>';
                    case 'comEmpenho': return '<span class="badge bg-green">Aguard. Entrega</span>';
                    default: return '<span class="badge bg-gray">Desconhecido</span>';
                }
            }

            function atualizarTabelaPrincipal(detalhes) {
                if ($.fn.DataTable.isDataTable('#tabelaDetalhes')) $('#tabelaDetalhes').DataTable().destroy();
                const tbody = document.getElementById('tbodyDetalhes');
                tbody.innerHTML = '';

                detalhes.forEach(item => {
                    const tr = document.createElement('tr');
                    // O clique na linha abre os detalhes do item
                    tr.onclick = () => abrirItemDetalhe(item.item);
                    tr.innerHTML = \`
                        <td><strong>\${item.item}</strong></td>
                        <td title="\${item.descricao}">\${item.descricao.length > 50 ? item.descricao.substring(0, 50) + '...' : item.descricao}</td>
                        <td>\${item.planejador}</td>
                        <td>\${formatarNumeroBR(item.cmm12)}</td>
                        <td>\${getStatusBadge(item.catZerado)}</td>
                    \`;
                    tbody.appendChild(tr);
                });

                $('#tabelaDetalhes').DataTable({
                    language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/pt-BR.json' },
                    pageLength: 10,
                    order: [[1, 'asc']], // Ordem alfabética
                    responsive: true
                });
            }

            // FUNÇÕES DE ABERTURA DE MODAIS
            function abrirModalLista(categoriaId, titulo) {
                document.getElementById('modalTituloLista').innerText = \`\${titulo}\`;
                const itensFiltrados = dadosAtuais.filter(d => d.catZerado === categoriaId);
                
                if ($.fn.DataTable.isDataTable('#tabelaModalLista')) $('#tabelaModalLista').DataTable().destroy();
                const tbody = document.getElementById('tbodyModalLista');
                tbody.innerHTML = '';

                itensFiltrados.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.onclick = () => abrirItemDetalhe(item.item);
                    tr.innerHTML = \`
                        <td><strong>\${item.item}</strong></td>
                        <td>\${item.descricao}</td>
                        <td>\${item.planejador}</td>
                        <td>\${formatarNumeroBR(item.cmm12)}</td>
                    \`;
                    tbody.appendChild(tr);
                });

                $('#tabelaModalLista').DataTable({
                    language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/pt-BR.json' },
                    pageLength: 15,
                    order: [[1, 'asc']],
                    responsive: true
                });

                document.getElementById('modalLista').style.display = 'flex';
            }

            // O POPUP MÁGICO DE DETALHES DO ITEM
            function abrirItemDetalhe(codigoItem) {
                const item = dadosAtuais.find(d => d.item === codigoItem);
                if (!item) return;

                document.getElementById('detItemCod').innerText = item.item;
                document.getElementById('detItemDesc').innerText = item.descricao;
                document.getElementById('detItemCmm').innerText = formatarNumeroBR(item.cmm12);

                // Regra: Somente mostrar Processo com Ata se o saldo for > 0 (neste painel de zerados, a Hera já definiu isso no catZerado)
                const valorSaldoAta = parseFloat(item.saldoAta) || 0;
                let textoProcAta = "Sem ata com saldo residual disponível";
                if (valorSaldoAta > 0 && item.processoAta && item.processoAta !== '-') {
                    textoProcAta = \`\${item.processoAta} (Saldo: \${formatarNumeroBR(item.saldoAta)})\`;
                }
                
                let textoAndamento = "Nenhum processo em andamento identificado";
                if (item.processoAndamento && item.processoAndamento !== '-') {
                    textoAndamento = item.processoAndamento;
                }

                document.getElementById('detItemProcAta').innerText = textoProcAta;
                document.getElementById('detItemProcAnd').innerText = textoAndamento;

                // Atrila o botão de cotas a este item
                document.getElementById('btnVerCotas').onclick = () => abrirModalCotas(item.item, item.descricao);

                document.getElementById('modalItemDetalhe').style.display = 'flex';
            }

            async function abrirModalCotas(codigoItem, descricao) {
                document.getElementById('cotasTituloItem').innerText = \`Item: \${codigoItem} - \${descricao}\`;
                const tbody = document.getElementById('tbodyCotas');
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">⏳ Buscando Top 10 Consumidores...</td></tr>';
                document.getElementById('modalCotas').style.display = 'flex';

                try {
                    const res = await fetch('/api/cotas/' + codigoItem);
                    const cotas = await res.json();
                    
                    tbody.innerHTML = '';
                    if (!cotas || cotas.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #7f8c8d;">Nenhuma cota registrada para este material.</td></tr>';
                        return;
                    }

                    cotas.forEach(c => {
                        const tr = document.createElement('tr');
                        tr.style.borderBottom = '1px solid #ecf0f1';
                        tr.innerHTML = \`
                            <td style="padding: 12px; font-weight: bold; color: #2c3e50;">\${c.setor_solicitante || '-'}</td>
                            <td style="padding: 12px; color: #7f8c8d;">\${c.unidade_solicitante || '-'}</td>
                            <td style="padding: 12px; text-align: center;">\${c.qtdBase} \${c.tipoCotaOriginal}</td>
                            <td style="padding: 12px; text-align: center; font-weight: bold; color: #d35400;">\${c.totalCotaMes.toFixed(2)}/mês</td>
                        \`;
                        tbody.appendChild(tr);
                    });
                } catch(e) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro ao carregar cotas.</td></tr>';
                }
            }

            function fecharModal(modalId) {
                document.getElementById(modalId).style.display = 'none';
            }

            document.addEventListener('DOMContentLoaded', carregarDados);

        </script>
    </body>
    </html>
    `;
}

module.exports = { renderPainelExecutivo };
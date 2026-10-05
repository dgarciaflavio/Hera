// src/views/tendencias.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderTendencias(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Tendências e Previsibilidade - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>
        <!-- Biblioteca para gerar arquivos Excel (.xlsx) diretamente no navegador -->
        <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
        <style>
            .secao-macro { background: white; padding: 20px; border-radius: 10px; box-shadow: 5px 5px 15px #c8d0e7, -5px -5px 15px #ffffff; margin-bottom: 20px; }
            .secao-micro { background: #fdfdfd; padding: 20px; border-radius: 10px; border-left: 5px solid #3498db; box-shadow: 3px 3px 10px rgba(0,0,0,0.05); }
            .filtro-container { display: flex; gap: 15px; align-items: flex-end; margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0; }
            .input-group { display: flex; flex-direction: column; flex: 1; }
            .input-group label { font-weight: bold; margin-bottom: 5px; color: #2c3e50; font-size: 14px; }
            .input-group select, .input-group input { padding: 10px; border: 1px solid #ccc; border-radius: 5px; font-size: 14px; }
            .tags-container { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
            .tag-item { background: #3498db; color: white; padding: 5px 12px; border-radius: 15px; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 8px; }
            .tag-item span { cursor: pointer; background: rgba(255,255,255,0.3); border-radius: 50%; width: 20px; height: 20px; display: inline-flex; justify-content: center; align-items: center; }
            .tag-item span:hover { background: #e74c3c; }
            .chart-wrapper { position: relative; height: 40vh; min-height: 300px; width: 100%; margin-top: 15px; cursor: pointer; }
            
            #loadingOverlay { display: none; position: fixed; z-index: 9999; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(4px); justify-content: center; align-items: center; flex-direction: column; }
            .spinner { border: 6px solid #f3f3f3; border-top: 6px solid #8e44ad; border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite; margin-bottom: 15px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            #loadingText { font-size: 18px; font-weight: bold; color: #2c3e50; }

            /* Estilos do Modal Interativo */
            .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background-color: rgba(0,0,0,0.6); backdrop-filter: blur(3px); }
            .modal-content { background-color: #fefefe; margin: 5vh auto; padding: 25px; border-radius: 10px; width: 95%; max-width: 1300px; box-shadow: 0 5px 25px rgba(0,0,0,0.3); display: flex; flex-direction: column; max-height: 85vh; }
            .close { color: #aaa; align-self: flex-end; font-size: 28px; font-weight: bold; cursor: pointer; margin-left: 10px; }
            .close:hover, .close:focus { color: #333; text-decoration: none; }
            .table-container { overflow-y: auto; margin-top: 15px; border: 1px solid #eee; border-radius: 5px; }
            #modalTable { width: 100%; border-collapse: collapse; }
            #modalTable th { position: sticky; top: 0; background-color: #2c3e50; color: white; padding: 10px; text-align: left; }
            #modalTable td { font-size: 14px; padding: 10px; border-bottom: 1px solid #ddd; }
            .modal-actions { display: flex; align-items: center; }
            .btn-excel { background-color: #27ae60; font-size: 14px; margin-right: 10px; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 10px rgba(39, 174, 96, 0.3); transition: 0.3s; }
            .btn-excel:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(39, 174, 96, 0.4); }

            /* Estilo Caixa Seleção Flutuante */
            .box-filtro-local { background: white; padding: 12px 20px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #ecf0f1; display: flex; align-items: center; gap: 10px; }
            .box-filtro-local select { padding: 8px 12px; border-radius: 5px; border: 1px solid #bdc3c7; font-size: 15px; font-weight: bold; color: #2c3e50; cursor: pointer; outline: none; }
        </style>
    </head>
    <body>
        <div id="loadingOverlay">
            <div class="spinner"></div>
            <div id="loadingText">A Hera está lendo o cache de tendências...</div>
        </div>
        
        ${gerarNavbar(usuarioLogado)}

        <div class="container" style="max-width: 1400px; width: 95%;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 15px;">
                <div>
                    <h1 style="color: #2c3e50; margin-bottom: 5px;">📉 Módulo de Tendências e Previsibilidade</h1>
                    <p style="color: #7f8c8d; margin-bottom: 10px;">Analise a evolução histórica do seu estoque baseada nas importações retroativas. (Clique nos pontos dos gráficos para detalhar)</p>
                </div>
                
                <!-- Nova Caixa Flutuante de Seleção de Local -->
                <div class="box-filtro-local">
                    <label style="font-weight: bold; color: #2c3e50; margin: 0;">📍 Filtrar Local:</label>
                    <select id="selectFiltroLocal" onchange="inicializarTendencias()">
                        <option value="Todos">Todos</option>
                        <option value="MAI">MAI</option>
                        <option value="ALM">ALM</option>
                        <option value="FAR">FAR</option>
                    </select>
                </div>
            </div>
            
            <div class="secao-macro">
                <h2 style="margin-top: 0; color: #2c3e50; font-size: 20px; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px;">Saúde Geral do Estoque no Tempo</h2>
                <div class="chart-wrapper">
                    <canvas id="chartMacro" title="Clique nas bolinhas para ver a lista de itens!"></canvas>
                </div>
            </div>

            <div class="secao-macro">
                <h2 style="margin-top: 0; color: #2c3e50; font-size: 20px; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px;">Evolução por Faixa de Cobertura</h2>
                <div class="chart-wrapper">
                    <canvas id="chartFaixas" title="Clique nas bolinhas para ver a lista de itens!"></canvas>
                </div>
            </div>
            
            <div class="secao-micro">
                <h2 style="margin-top: 0; color: #2c3e50; font-size: 20px;">🔍 Evolução de Saldo por Item ou Grupo de Estoque</h2>
                <div class="filtro-container">
                    <div class="input-group">
                        <label>1. Filtrar por Grupo de Estoque Inteiro:</label>
                        <select id="selectGrupo" onchange="selecionarGrupoEstoque()"><option value="">-- Escolha um Grupo de Estoque --</option></select>
                    </div>
                    <div class="input-group">
                        <label>2. Ou adicione itens específicos (Código ou Descrição):</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="inputItem" list="listaItens" placeholder="Digite o código..." style="flex: 1;">
                            <datalist id="listaItens"></datalist>
                            <button class="btn" onclick="adicionarItemAvulso()" style="background-color: #27ae60;">➕ Adicionar</button>
                        </div>
                    </div>
                    <div class="input-group" style="flex: 0.3;">
                        <button class="btn" onclick="limparSelecao()" style="background-color: #e74c3c; height: 100%;">🗑️ Limpar Tudo</button>
                    </div>
                </div>
                <div class="tags-container" id="containerTags"></div>
                <div class="chart-wrapper">
                    <canvas id="chartMicro"></canvas>
                </div>
            </div>
        </div>

        <!-- Modal de Detalhes -->
        <div id="detalhesModal" class="modal">
            <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px;">
                    <h2 id="modalTitle" style="color: #2c3e50; margin: 0;">Detalhes do Relatório</h2>
                    <div class="modal-actions">
                        <button class="btn-excel" onclick="exportarExcelModal()">📊 Exportar Excel</button>
                        <span class="close" id="closeModal">&times;</span>
                    </div>
                </div>
                <div class="table-container">
                    <table id="modalTable">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Descrição</th>
                                <th>Saldo Atual</th>
                                <th>CMM 12</th>
                                <th>Saldo em Dias</th>
                                <th>Observação</th>
                            </tr>
                        </thead>
                        <tbody id="modalTableBody">
                            <!-- Injetado via JS -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <script>
            Chart.register(ChartDataLabels);

            let dadosTendencias = null;
            let itensSelecionados = new Set();
            let chartMacroInstancia = null;
            let chartFaixasInstancia = null; 
            let chartMicroInstancia = null;
            const paletaCoresDinamica = ['#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#f1c40f', '#d35400', '#2980b9', '#8e44ad', '#16a085', '#27ae60', '#c0392b'];

            function mostrarLoading(texto) { document.getElementById('loadingText').innerText = texto || 'Processando dados...'; document.getElementById('loadingOverlay').style.display = 'flex'; }
            function esconderLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

            // Lógica do Modal
            function abrirModal(titulo, itens) {
                window.currentModalItems = itens;
                window.currentModalTitle = titulo;

                document.getElementById('modalTitle').innerText = titulo + \` (\${itens.length} itens)\`;
                const tbody = document.getElementById('modalTableBody');
                
                tbody.innerHTML = itens.map(i => \`
                    <tr>
                        <td><strong>\${i.item}</strong></td>
                        <td>\${i.descricao}</td>
                        <td>\${i.saldoAtual}</td>
                        <td>\${i.cmm12}</td>
                        <td>\${i.saldoEmDias}</td>
                        <td>\${i.obs || '-'}</td>
                    </tr>
                \`).join('');
                document.getElementById('detalhesModal').style.display = 'block';
            }

            document.getElementById('closeModal').onclick = function() { document.getElementById('detalhesModal').style.display = 'none'; }
            window.onclick = function(event) { if (event.target == document.getElementById('detalhesModal')) { document.getElementById('detalhesModal').style.display = 'none'; } }

            window.exportarExcelModal = function() {
                if (!window.currentModalItems || window.currentModalItems.length === 0) {
                    alert('Não há dados para exportar neste relatório.');
                    return;
                }
                
                const dadosPlanilha = window.currentModalItems.map(i => ({
                    'Item': i.item,
                    'Descrição': i.descricao,
                    'Saldo Atual': i.saldoAtual,
                    'CMM 12': i.cmm12,
                    'Saldo em Dias': i.saldoEmDias,
                    'Observação': i.obs || '-'
                }));

                const worksheet = XLSX.utils.json_to_sheet(dadosPlanilha);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Itens Historicos");

                let nomeArquivo = "Relatorio_Tendencias";
                if (window.currentModalTitle) {
                    nomeArquivo = window.currentModalTitle.replace(/[^a-zA-Z0-9_ -]/g, '').trim().replace(/\\s+/g, '_');
                }
                XLSX.writeFile(workbook, nomeArquivo + ".xlsx");
            };

            async function inicializarTendencias() {
                mostrarLoading('Carregando base de histórico da Hera...');
                try {
                    const localFiltro = document.getElementById('selectFiltroLocal').value;
                    const url = \`/api/tendencias-stats?local=\${localFiltro}\`;
                    
                    const resposta = await fetch(url);
                    dadosTendencias = await resposta.json();
                    
                    if (!dadosTendencias || !dadosTendencias.datas || dadosTendencias.datas.length === 0) {
                        esconderLoading(); 
                        alert("Nenhum dado histórico encontrado para o local selecionado. Verifique as planilhas importadas."); 
                        return;
                    }
                    popularFiltros(); 
                    gerarGraficoMacro(); 
                    gerarGraficoFaixas();
                    
                    // Atualiza o gráfico micro mantendo as tags selecionadas se possível
                    atualizarInterfaceMicro(); 
                    
                    esconderLoading();
                } catch (e) { 
                    esconderLoading(); 
                    alert("Erro ao conectar com a base de dados histórica."); 
                }
            }

            function popularFiltros() {
                const selectGrupo = document.getElementById('selectGrupo');
                const datalistItens = document.getElementById('listaItens');
                
                // Limpa opções antigas para não duplicar quando mudar de Local
                selectGrupo.innerHTML = '<option value="">-- Escolha um Grupo de Estoque --</option>';
                datalistItens.innerHTML = '';
                
                const grupos = new Set();
                for (const codItem in dadosTendencias.itens) {
                    const info = dadosTendencias.itens[codItem];
                    if (info.grupoEstoque && info.grupoEstoque !== 'N/A') grupos.add(info.grupoEstoque);
                    const option = document.createElement('option');
                    option.value = codItem; option.innerText = info.descricao;
                    datalistItens.appendChild(option);
                }
                Array.from(grupos).sort().forEach(grupo => { 
                    const option = document.createElement('option'); 
                    option.value = grupo; 
                    option.innerText = grupo; 
                    selectGrupo.appendChild(option); 
                });
            }

            function gerarGraficoMacro() {
                const datas = dadosTendencias.datas;
                const critico = datas.map(d => dadosTendencias.saudeGeral[d].critico || 0);
                const atencao = datas.map(d => dadosTendencias.saudeGeral[d].atencao || 0);
                const monitorar = datas.map(d => dadosTendencias.saudeGeral[d].monitorar || 0);
                
                if (chartMacroInstancia) chartMacroInstancia.destroy();
                
                chartMacroInstancia = new Chart(document.getElementById('chartMacro').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: datas,
                        datasets: [
                            { label: 'Crítico (<= 30 dias)', data: critico, borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.5)', fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 8 },
                            { label: 'Atenção (31-60 dias)', data: atencao, borderColor: '#f1c40f', backgroundColor: 'rgba(241, 196, 15, 0.5)', fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 8 },
                            { label: 'Monitorar (> 60 dias)', data: monitorar, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.5)', fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 8 }
                        ]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { 
                            legend: { position: 'top' }, 
                            datalabels: { display: false } 
                        }, 
                        scales: { 
                            y: { stacked: true, beginAtZero: true }, 
                            x: { grid: { display: false } } 
                        }, 
                        interaction: { mode: 'index', intersect: false },
                        onClick: (evt, elements) => {
                            if (elements.length > 0) {
                                const datasetIndex = elements[0].datasetIndex;
                                const index = elements[0].index;
                                const dataSelecionada = datas[index];
                                const categorias = ['critico', 'atencao', 'monitorar'];
                                const labels = ['Crítico (<= 30 dias)', 'Atenção (31-60 dias)', 'Monitorar (> 60 dias)'];
                                
                                const cat = categorias[datasetIndex];
                                const itens = dadosTendencias.detalhesSaude[dataSelecionada][cat] || [];
                                abrirModal(\`Saúde Geral: \${labels[datasetIndex]} em \${dataSelecionada}\`, itens);
                            }
                        }
                    }
                });
            }

            function gerarGraficoFaixas() {
                const datas = dadosTendencias.datas;
                const semDemanda = datas.map(d => dadosTendencias.faixasCobertura[d].semDemanda || 0);
                const zerados = datas.map(d => dadosTendencias.faixasCobertura[d].zerados || 0);
                const dias30a59 = datas.map(d => dadosTendencias.faixasCobertura[d].dias30a59 || 0);
                const dias60a89 = datas.map(d => dadosTendencias.faixasCobertura[d].dias60a89 || 0);
                const dias90Mais = datas.map(d => dadosTendencias.faixasCobertura[d].dias90Mais || 0);
                const primeiraCompra = datas.map(d => dadosTendencias.faixasCobertura[d].primeiraCompra || 0);

                if (chartFaixasInstancia) chartFaixasInstancia.destroy();

                chartFaixasInstancia = new Chart(document.getElementById('chartFaixas').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: datas,
                        datasets: [
                            { label: 'Sem Demanda', data: semDemanda, borderColor: '#7f8c8d', backgroundColor: '#7f8c8d', fill: false, tension: 0.1, borderWidth: 3, pointRadius: 4, pointHoverRadius: 8 },
                            { label: 'Itens Zerados', data: zerados, borderColor: '#e74c3c', backgroundColor: '#e74c3c', fill: false, tension: 0.1, borderWidth: 3, pointRadius: 4, pointHoverRadius: 8 },
                            { label: 'Entre 30 e 59 Dias', data: dias30a59, borderColor: '#f39c12', backgroundColor: '#f39c12', fill: false, tension: 0.1, borderWidth: 3, pointRadius: 4, pointHoverRadius: 8 },
                            { label: 'Entre 60 e 89 Dias', data: dias60a89, borderColor: '#f1c40f', backgroundColor: '#f1c40f', fill: false, tension: 0.1, borderWidth: 3, pointRadius: 4, pointHoverRadius: 8 },
                            { label: 'Igual ou Maior a 90 Dias', data: dias90Mais, borderColor: '#27ae60', backgroundColor: '#27ae60', fill: false, tension: 0.1, borderWidth: 3, pointRadius: 4, pointHoverRadius: 8 },
                            { label: 'Primeira Compra', data: primeiraCompra, borderColor: '#3498db', backgroundColor: '#3498db', fill: false, tension: 0.1, borderWidth: 3, pointRadius: 4, pointHoverRadius: 8 }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 30 } },
                        plugins: {
                            legend: { position: 'top' },
                            datalabels: {
                                display: true,
                                align: 'top',
                                offset: 4,
                                color: (context) => context.dataset.borderColor,
                                font: { weight: 'bold', size: 11 },
                                formatter: Math.round
                            }
                        },
                        scales: {
                            y: { beginAtZero: true, grace: '10%' },
                            x: { grid: { display: false } }
                        },
                        interaction: { mode: 'index', intersect: false },
                        onClick: (evt, elements) => {
                            if (elements.length > 0) {
                                const datasetIndex = elements[0].datasetIndex;
                                const index = elements[0].index;
                                const dataSelecionada = datas[index];
                                const categorias = ['semDemanda', 'zerados', 'dias30a59', 'dias60a89', 'dias90Mais', 'primeiraCompra'];
                                const labels = ['Sem Demanda', 'Itens Zerados', 'Entre 30 e 59 Dias', 'Entre 60 e 89 Dias', 'Igual ou Maior a 90 Dias', 'Primeira Compra'];
                                
                                const cat = categorias[datasetIndex];
                                const itens = dadosTendencias.detalhesFaixa[dataSelecionada][cat] || [];
                                abrirModal(\`Faixa de Cobertura: \${labels[datasetIndex]} em \${dataSelecionada}\`, itens);
                            }
                        }
                    }
                });
            }

            window.selecionarGrupoEstoque = function() {
                const grupo = document.getElementById('selectGrupo').value;
                if (!grupo) return;
                mostrarLoading(\`Selecionando itens do Grupo: \${grupo}...\`);
                setTimeout(() => { 
                    for (const codItem in dadosTendencias.itens) { 
                        if (dadosTendencias.itens[codItem].grupoEstoque === grupo) itensSelecionados.add(codItem); 
                    } 
                    atualizarInterfaceMicro(); 
                    esconderLoading(); 
                }, 50);
            };

            window.adicionarItemAvulso = function() {
                const input = document.getElementById('inputItem'); 
                const codItem = input.value.trim().toUpperCase();
                if (codItem && dadosTendencias.itens[codItem]) { 
                    mostrarLoading('Adicionando item...'); 
                    setTimeout(() => { 
                        itensSelecionados.add(codItem); 
                        input.value = ''; 
                        atualizarInterfaceMicro(); 
                        esconderLoading(); 
                    }, 50); 
                }
                else { alert('Item não encontrado no histórico para o local selecionado. Verifique o código.'); }
            };

            window.removerItem = function(codItem) { 
                mostrarLoading('Atualizando...'); 
                setTimeout(() => { 
                    itensSelecionados.delete(codItem); 
                    atualizarInterfaceMicro(); 
                    esconderLoading(); 
                }, 50); 
            };
            
            window.limparSelecao = function() { 
                mostrarLoading('Limpando...'); 
                setTimeout(() => { 
                    itensSelecionados.clear(); 
                    document.getElementById('selectGrupo').value = ''; 
                    atualizarInterfaceMicro(); 
                    esconderLoading(); 
                }, 50); 
            };

            function atualizarInterfaceMicro() {
                const container = document.getElementById('containerTags'); 
                container.innerHTML = '';
                
                // Filtra a seleção removendo itens que não existem no 'local' selecionado (evita quebrar quando muda de local)
                if (dadosTendencias && dadosTendencias.itens) {
                    for (let codItem of itensSelecionados) {
                        if (!dadosTendencias.itens[codItem]) {
                            itensSelecionados.delete(codItem);
                        }
                    }
                }

                if (itensSelecionados.size === 0) { 
                    container.innerHTML = '<span style="color: #7f8c8d; font-style: italic;">Nenhum item selecionado.</span>'; 
                } else { 
                    itensSelecionados.forEach(codItem => { 
                        const info = dadosTendencias.itens[codItem]; 
                        const div = document.createElement('div'); 
                        div.className = 'tag-item'; 
                        div.innerHTML = \`\${codItem} \${info.descricao ? '- ' + info.descricao.substring(0, 15) + '...' : ''} <span onclick="removerItem('\${codItem}')">X</span>\`; 
                        container.appendChild(div); 
                    }); 
                }
                gerarGraficoMicro();
            }

            function gerarGraficoMicro() {
                if (chartMicroInstancia) chartMicroInstancia.destroy();
                if (itensSelecionados.size === 0) return;
                const datas = dadosTendencias.datas; 
                const datasets = []; 
                let corIndex = 0;
                
                itensSelecionados.forEach(codItem => {
                    const info = dadosTendencias.itens[codItem]; 
                    const dadosSaldo = datas.map(d => info.historico[d] ? info.historico[d].saldo : null);
                    const cor = paletaCoresDinamica[corIndex % paletaCoresDinamica.length]; 
                    corIndex++;
                    datasets.push({ label: \`\${codItem} (\${info.descricao ? info.descricao.substring(0,20) : ''})\`, data: dadosSaldo, borderColor: cor, backgroundColor: cor, borderWidth: 2, tension: 0.1, spanGaps: true, pointRadius: 4, pointHoverRadius: 8 });
                });
                
                chartMicroInstancia = new Chart(document.getElementById('chartMicro').getContext('2d'), {
                    type: 'line',
                    data: { labels: datas, datasets: datasets },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        layout: { padding: { top: 20 } },
                        plugins: { 
                            legend: { position: 'right' }, 
                            datalabels: { 
                                display: 'auto', 
                                align: 'top', 
                                color: (c) => c.dataset.borderColor, 
                                font: { weight: 'bold' }, 
                                formatter: Math.round 
                            } 
                        }, 
                        scales: { 
                            y: { beginAtZero: true, grace: '5%', title: { display: true, text: 'Saldo Físico (Und)' } }, 
                            x: { grid: { display: false } } 
                        }, 
                        interaction: { mode: 'nearest', axis: 'x', intersect: false } 
                    }
                });
            }
            window.onload = inicializarTendencias;
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderTendencias };
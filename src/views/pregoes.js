// src/views/pregoes.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderPregoes(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Acompanhamento de Pregões - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>
        <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
        <style>
            body { background-color: #f4f7f6; overflow-x: hidden; }
            .container-pregoes { max-width: 1400px; margin: 30px auto; padding: 20px; }
            
            .header-panel { background: white; padding: 20px 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 25px; display: flex; flex-direction: column; gap: 15px; border-left: 5px solid #8e44ad; }
            .header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; width: 100%; }
            .header-title h1 { margin: 0; color: #2c3e50; font-size: 24px; display: flex; align-items: center; gap: 10px;}
            .header-title p { margin: 5px 0 0 0; color: #7f8c8d; font-size: 14px; }
            
            .controls-group { display: flex; gap: 15px; align-items: center; flex-wrap: wrap; background: #f8fafc; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .input-ano { padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 15px; font-weight: bold; width: 110px; text-align: center; color: #2c3e50; outline: none; transition: 0.3s; }
            .input-ano:focus { border-color: #8e44ad; box-shadow: 0 0 0 3px rgba(142, 68, 173, 0.15); }
            
            .btn-buscar { background: linear-gradient(135deg, #8e44ad, #3498db); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 10px rgba(142, 68, 173, 0.3); }
            .btn-buscar:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(142, 68, 173, 0.4); }
            .btn-buscar:disabled { background: #95a5a6; cursor: not-allowed; transform: none; box-shadow: none; }
            
            .btn-excel { background: #27ae60; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; font-size: 14px; }
            .btn-excel:hover:not(:disabled) { background: #219653; transform: scale(1.05); }
            .btn-excel:disabled { background: #95a5a6; cursor: not-allowed; transform: none; }

            .divisor-vertical { width: 2px; height: 35px; background: #cbd5e1; margin: 0 5px; }

            /* KPIs */
            .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 25px; }
            .kpi-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); position: relative; overflow: hidden; }
            .kpi-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #cbd5e1; }
            .kpi-card.blue::before { background: #3b82f6; }
            .kpi-card.purple::before { background: #8b5cf6; }
            .kpi-card.green::before { background: #10b981; }
            .kpi-card.orange::before { background: #f59e0b; }
            .kpi-title { margin: 0 0 5px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;}
            .kpi-value { margin: 0; font-size: 26px; font-weight: 800; color: #1e293b; }
            
            /* Gráficos em coluna única para evitar scroll horizontal */
            .grid-dashboard { display: grid; grid-template-columns: 1fr; gap: 25px; align-items: start; }
            
            .card-panel { background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); padding: 25px; border: 1px solid #e2e8f0; overflow: hidden; }
            .card-title { font-size: 18px; font-weight: 800; color: #2c3e50; margin-top: 0; margin-bottom: 5px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; display: flex; align-items: center; gap: 10px; }
            .explicacao-grafico { font-size: 13px; color: #7f8c8d; margin-bottom: 20px; background: #f8fafc; padding: 10px 15px; border-left: 3px solid #3498db; border-radius: 4px; }
            
            .table-responsive { overflow-x: auto; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 100%; }
            table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: center; }
            th { background-color: #34495e; color: white; padding: 12px 15px; text-align: center; font-weight: bold; white-space: nowrap; }
            th:first-child { text-align: left; background-color: #d5dbdb; color: #2c3e50; position: sticky; left: 0; z-index: 2; }
            td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #334155; white-space: nowrap; text-align: center; }
            td:first-child { text-align: left; font-weight: bold; background-color: #f8fafc; position: sticky; left: 0; z-index: 1; border-right: 1px solid #e2e8f0; }
            tr:hover td { background-color: #f1f5f9; }
            
            .row-total { background-color: #d5dbdb !important; font-weight: bold; color: #1e293b; }
            .row-total td { background-color: #d5dbdb !important; border-top: 2px solid #94a3b8; }
            
            .clickable-cell { cursor: pointer; color: #2980b9; font-weight: bold; transition: 0.2s; position: relative; }
            .clickable-cell:hover { color: #8e44ad; background-color: #f3e5f5 !important; text-decoration: underline; }

            /* Modal Styles */
            .modal-overlay { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
            .modal-content { background-color: #fff; margin: 5% auto; padding: 25px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); width: 90%; max-width: 1000px; animation: modalFadeIn 0.3s; position: relative; }
            @keyframes modalFadeIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
            .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px; }
            .modal-header h2 { margin: 0; color: #2c3e50; font-size: 20px; }
            .close-modal { color: #94a3b8; font-size: 28px; font-weight: bold; cursor: pointer; transition: 0.2s; }
            .close-modal:hover { color: #e74c3c; }

            .chart-wrapper { position: relative; height: 350px; width: 100%; }
            .chart-wrapper-linha { position: relative; height: 400px; width: 100%; }

            #loadingOverlay { display: none; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: #8e44ad; }
            .spinner { border: 4px solid rgba(142, 68, 173, 0.1); width: 40px; height: 40px; border-radius: 50%; border-left-color: #8e44ad; animation: spin 1s linear infinite; margin-bottom: 15px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            
            .cronometro-alerta { display: inline-block; background-color: rgba(142, 68, 173, 0.1); color: #8e44ad; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 13px; border: 1px solid rgba(142, 68, 173, 0.3); }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div class="container-pregoes">
            
            <!-- Cabeçalho Unificado -->
            <div class="header-panel">
                <div class="header-top">
                    <div class="header-title">
                        <h1>🏛️ Acompanhamento de Pregões (PNCP)</h1>
                        <p>Visão gerencial e analítica das contratações no ano com detalhamento por item.</p>
                    </div>
                    
                    <div class="controls-group">
                        <!-- Exportação Rápida -->
                        <strong style="color: #27ae60; font-size: 15px;">📥 Relatório do Mês:</strong>
                        <select id="selectMesAcao" class="input-ano" style="width: 140px; text-align: left;">
                            <option value="0">Janeiro</option>
                            <option value="1">Fevereiro</option>
                            <option value="2">Março</option>
                            <option value="3">Abril</option>
                            <option value="4">Maio</option>
                            <option value="5">Junho</option>
                            <option value="6">Julho</option>
                            <option value="7">Agosto</option>
                            <option value="8">Setembro</option>
                            <option value="9">Outubro</option>
                            <option value="10">Novembro</option>
                            <option value="11">Dezembro</option>
                        </select>
                        <button id="btnExportarMesAcao" class="btn-excel" onclick="exportarMesAcao()">Baixar Excel</button>
                        
                        <div class="divisor-vertical"></div>
                        
                        <!-- Controles de Ano -->
                        <label style="font-weight: bold; color: #64748b;">Ano Vigente:</label>
                        <input type="number" id="inputAno" class="input-ano" min="2024" max="2050" value="${new Date().getFullYear()}">
                        <button class="btn-buscar" onclick="carregarDados()">🔄 Atualizar Painel</button>
                    </div>
                </div>
                <div class="cronometro-alerta" style="align-self: flex-start;">
                    ⏳ Próxima atualização da base em: <span id="timerSync">00:00:00</span>
                </div>
            </div>

            <div id="loadingOverlay">
                <div class="spinner"></div>
                <h3 id="loadingText" style="margin: 0; color: #2c3e50;">Consultando banco de dados local da Hera...</h3>
                <p style="color: #7f8c8d; margin-top: 5px;">Carregando estatísticas dos pregões e comparativos de produtividade.</p>
            </div>

            <div id="conteudoPainel" style="display: none;">
                <!-- Cards de KPI -->
                <div class="kpi-grid">
                    <div class="kpi-card blue">
                        <p class="kpi-title">Total de Pregões (Retrato Vigente)</p>
                        <p class="kpi-value" id="kpiTotalPregoes">0</p>
                    </div>
                    <div class="kpi-card purple">
                        <p class="kpi-title">Total de Ações/Itens</p>
                        <p class="kpi-value" id="kpiTotalItens">0</p>
                    </div>
                    <div class="kpi-card green">
                        <p class="kpi-title">Aproveitamento (Homol./Adjud.)</p>
                        <p class="kpi-value" id="kpiSucesso">0%</p>
                    </div>
                    <div class="kpi-card orange">
                        <p class="kpi-title">Perdas (Desertos/Fracassados)</p>
                        <p class="kpi-value" id="kpiFalha">0%</p>
                    </div>
                </div>

                <div class="grid-dashboard">
                    <!-- Tabela Dinâmica Padrão (Por Mês do Edital) -->
                    <div class="card-panel">
                        <h2 class="card-title">📅 Matriz de Desempenho Mensal (Data do Edital)</h2>
                        <p class="explicacao-grafico"><strong>De onde vem:</strong> Baseada na data de publicação do edital de cada pregão.<br><strong>Como ler:</strong> Exibe a situação atual (retrato) de todos os itens agrupados pelo mês em que a licitação foi lançada na praça. Ao clicar nos números azuis, é possível extrair o relatório detalhado.</p>
                        
                        <div class="table-responsive">
                            <table id="tabelaMensal">
                                <thead id="tabelaHead"></thead>
                                <tbody id="tabelaBody"></tbody>
                                <tfoot id="tabelaFoot"></tfoot>
                            </table>
                        </div>
                    </div>

                    <!-- Gráfico Barras (Horizontais) -->
                    <div class="card-panel">
                        <h2 class="card-title">📈 Aproveitamento do Mês (Itens do Edital vs Homologados)</h2>
                        <p class="explicacao-grafico"><strong>De onde vem:</strong> Reflexo da "Matriz de Desempenho Mensal" acima.<br><strong>Como ler:</strong> Compara diretamente o total de itens licitados (barra escura) contra quantos desses mesmos itens já foram homologados com sucesso (barra verde), agrupados pelo mês de publicação do edital.</p>
                        
                        <div class="chart-wrapper">
                            <canvas id="chartEvolucao"></canvas>
                        </div>
                    </div>
                    
                    <!-- Matriz de Produtividade Real -->
                    <div class="card-panel" style="border-left: 5px solid #8e44ad;">
                        <h2 class="card-title">📅 Matriz de Produtividade Real (Data da Ação no PNCP)</h2>
                        <p class="explicacao-grafico"><strong>De onde vem:</strong> Varredura profunda do PNCP capturando a data exata da última movimentação do item.<br><strong>Como ler:</strong> Não importa quando o edital saiu; esta tabela consolida a produtividade da equipe no mês exato em que a ação de fato ocorreu (Ex: Um item homologado em Março será contabilizado em Março, mesmo que o pregão seja de Janeiro).</p>
                        
                        <div id="avisoMatrizReal" style="display: none; padding: 15px; background-color: #fdf2f8; color: #86198f; border-radius: 8px; border: 1px solid #fbcfe8; font-weight: 500; margin-bottom: 15px;"></div>

                        <div class="table-responsive" id="containerMatrizReal" style="display: none;">
                            <table id="tabelaMatrizReal">
                                <thead id="tabelaRealHead"></thead>
                                <tbody id="tabelaRealBody"></tbody>
                                <tfoot id="tabelaRealFoot"></tfoot>
                            </table>
                        </div>
                    </div>

                    <!-- Gráfico Linhas (Múltiplas Séries - Ano Vigente) -->
                    <div class="card-panel">
                        <h2 class="card-title" id="tituloGraficoLinha"> | Ações Mensais</h2>
                        <p class="explicacao-grafico"><strong>De onde vem:</strong> Histórico temporal baseado nas atualizações contínuas de status das compras.<br><strong>Como ler:</strong> Acompanha a curva evolutiva ao longo do ano vigente de quantos itens se encontravam em cada uma das etapas do processo de compras.</p>
                        
                        <div class="chart-wrapper-linha">
                            <canvas id="chartLinhaTempo"></canvas>
                        </div>
                    </div>

                    <!-- Gráfico Comparativo (Produtividade Ano Atual vs Anterior) -->
                    <div class="card-panel">
                        <h2 class="card-title" id="tituloGraficoComparativo">📊 Comparativo de Produtividade Real (Mês da Ação)</h2>
                        <p class="explicacao-grafico"><strong>De onde vem:</strong> Cruzamento dos itens "Homologados/Adjudicados" extraídos da Matriz de Produtividade Real (ano atual vs ano anterior).<br><strong>Como ler:</strong> Permite visualizar se a taxa de itens finalizados com sucesso no mês corrente está superior ou inferior ao mesmo período do ano passado.</p>
                        
                        <div class="chart-wrapper-linha">
                            <canvas id="chartComparativo"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Tabela de Detalhes -->
                <div class="card-panel" style="margin-top: 25px;">
                    <h2 class="card-title">📋 Detalhes por Pregão (Vigente)</h2>
                    <p class="explicacao-grafico"><strong>De onde vem:</strong> Listagem bruta de todos os processos do ano pesquisado.<br><strong>Como ler:</strong> Detalha pregão a pregão como o volume de itens foi pulverizado em cada fase, além de trazer a correlação com o número do processo SEI.</p>
                    
                    <div class="table-responsive">
                        <table id="tabelaDetalhes">
                            <thead id="tabelaDetalhesHead"></thead>
                            <tbody id="tabelaDetalhesBody"></tbody>
                        </table>
                    </div>
                    <!-- Paginação Tabela de Detalhes -->
                    <div class="pagination-controls" style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 15px;">
                        <button id="btnPrevDetalhes" onclick="prevPageDetalhes()" class="btn-buscar" style="padding: 8px 15px; font-size: 13px;">⬅️ Anterior</button>
                        <span id="pageInfoDetalhes" style="font-weight: bold; color: #2c3e50; font-size: 14px;">Página 1 de 1</span>
                        <button id="btnNextDetalhes" onclick="nextPageDetalhes()" class="btn-buscar" style="padding: 8px 15px; font-size: 13px;">Próxima ➡️</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Estrutura do Modal de Detalhes -->
        <div id="modalDetalhes" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <div>
                        <h2 id="modalTitle">Detalhes</h2>
                        <p style="margin: 5px 0 0 0; color: #7f8c8d; font-size: 13px;" id="modalSubtitle"></p>
                    </div>
                    <div style="display: flex; gap: 15px; align-items: center;">
                        <button id="btnExportarExcel" class="btn-excel" onclick="exportarExcelModal()">📊 Exportar Excel Completo</button>
                        <span class="close-modal" onclick="fecharModal()">&times;</span>
                    </div>
                </div>
                <div class="table-responsive" style="max-height: 450px;">
                    <table id="tabelaModal">
                        <thead>
                            <tr>
                                <th>Pregão</th>
                                <th>Processo SEI</th>
                                <th>Situação Geral</th>
                                <th>Qtd. Itens neste Status</th>
                            </tr>
                        </thead>
                        <tbody id="tabelaModalBody"></tbody>
                    </table>
                </div>
                <p style="font-size: 11px; color: #94a3b8; margin-top: 15px; text-align: left;">
                    * O botão 'Exportar Excel' consultará a API do PNCP em tempo real para baixar os nomes dos materiais e datas de homologação.
                </p>
            </div>
        </div>

        <script>
            let chartInstancia = null;
            let chartInstanciaLinha = null;
            let chartComparativo = null;
            let dadosGlobaisPregoes = [];
            
            // Variáveis de Paginação Tabela Detalhes
            let currentPageDetalhes = 1;
            const rowsPerPage = 12;
            let detalhesDadosGlobais = [];
            let colunasUnicasGlobais = [];

            let modalCurrentMes = '';
            let modalCurrentStatus = '';
            let modalPregoesList = []; 

            const nomeMeses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
            const paletaCores = [
                '#27ae60', '#3498db', '#f39c12', '#e74c3c', '#9b59b6', '#1abc9c', '#34495e', '#d35400', '#7f8c8d'
            ];

            function iniciarCronometroAtualizacao() {
                function atualizar() {
                    const agora = new Date();
                    const horas = agora.getHours();
                    let proxHora = Math.ceil((horas + 0.0001) / 4) * 4;
                    const alvo = new Date(agora);
                    if (proxHora >= 24) { alvo.setDate(alvo.getDate() + 1); proxHora = 0; }
                    alvo.setHours(proxHora, 0, 0, 0);
                    const diff = alvo - agora;
                    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((diff % (1000 * 60)) / 1000);
                    const display = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
                    const el = document.getElementById('timerSync');
                    if(el) el.innerText = display;
                }
                atualizar();
                setInterval(atualizar, 1000);
            }

            const getHomologadosReal = (matriz) => {
                let arr = Array(12).fill(0);
                if (!matriz) return arr;
                nomeMeses.forEach((m, idx) => {
                    const dadosMes = matriz[m] || {};
                    let sum = 0;
                    Object.keys(dadosMes).forEach(sit => {
                        if (sit.toLowerCase().includes('homologado') || sit.toLowerCase().includes('adjudicado')) {
                            sum += dadosMes[sit];
                        }
                    });
                    arr[idx] = sum;
                });
                return arr;
            };

            async function carregarDados() {
                const ano = document.getElementById('inputAno').value;
                if (!ano || ano < 2024) return alert('Por favor, insira um ano válido (>= 2024).');

                document.getElementById('conteudoPainel').style.display = 'none';
                document.getElementById('loadingOverlay').style.display = 'flex';
                
                document.getElementById('tituloGraficoLinha').innerText = \`📈 Ações Mensais (\${ano})\`;
                document.getElementById('tituloGraficoComparativo').innerText = \`📊 Comparativo de Produtividade Real (\${ano} vs \${ano - 1})\`;

                try {
                    const [respostaComparacao, respostaReal, respostaRealAnterior] = await Promise.all([
                        fetch('/api/pregoes/comparacao/' + ano),
                        fetch('/api/pregoes/produtividade-real/' + ano),
                        fetch('/api/pregoes/produtividade-real/' + (ano - 1))
                    ]);

                    const dados = await respostaComparacao.json();
                    const dadosReal = await respostaReal.json();
                    const dadosRealAnterior = await respostaRealAnterior.json();

                    if (!respostaComparacao.ok) throw new Error(dados.erro || 'Erro ao buscar dados de comparação.');
                    if (!respostaReal.ok) throw new Error(dadosReal.erro || 'Falha ao carregar a matriz real.');

                    const dadosVigente = dados.anoVigente;

                    if (!dadosVigente.pregoes || dadosVigente.pregoes.length === 0) {
                        alert(dados.mensagem || 'Nenhum dado encontrado no banco para o ano vigente.');
                        document.getElementById('loadingOverlay').style.display = 'none';
                        return;
                    }

                    // Processa os dados normais baseados na data do edital
                    processarEExibirDados(dadosVigente.pregoes, ano, dadosVigente.linhaDoTempo);
                    
                    let linhaRealVigente = Array(12).fill(0);
                    let linhaRealAnterior = Array(12).fill(0);

                    let matrizVigentePronta = false;

                    // Processa a Matriz Real (Vigente)
                    if (dadosReal.status === 'pronto') {
                        linhaRealVigente = getHomologadosReal(dadosReal.matrizReal);
                        matrizVigentePronta = true;
                        document.getElementById('avisoMatrizReal').style.display = 'none';
                        renderizarTabelaMatrizReal(dadosReal.matrizReal, ano);
                        document.getElementById('containerMatrizReal').style.display = 'block';
                    }

                    // Processa a Matriz Real (Anterior)
                    if (dadosRealAnterior.status === 'pronto') {
                        linhaRealAnterior = getHomologadosReal(dadosRealAnterior.matrizReal);
                    }

                    if (!matrizVigentePronta) {
                        document.getElementById('containerMatrizReal').style.display = 'none';
                        const aviso = document.getElementById('avisoMatrizReal');
                        aviso.innerHTML = \`⏳ <strong>Atenção:</strong> \${dadosReal.mensagem} <br><br> <button class="btn-excel" style="background:#8e44ad; font-size:12px; padding: 8px 15px;" onclick="recarregarMatrizReal()">🔄 Verificar se a Matriz já foi gerada</button>\`;
                        aviso.style.display = 'block';
                    }
                    
                    renderizarGraficoComparativo(linhaRealVigente, linhaRealAnterior, ano, ano - 1);
                    
                } catch (erro) {
                    console.error(erro);
                    alert('❌ ' + erro.message);
                } finally {
                    document.getElementById('loadingOverlay').style.display = 'none';
                }
            }

            async function recarregarMatrizReal() {
                const ano = document.getElementById('inputAno').value;
                const btn = document.querySelector('#avisoMatrizReal button');
                if(btn) { btn.innerHTML = 'Consultando...'; btn.disabled = true; }
                
                try {
                    const [respostaReal, respostaRealAnterior] = await Promise.all([
                        fetch('/api/pregoes/produtividade-real/' + ano),
                        fetch('/api/pregoes/produtividade-real/' + (ano - 1))
                    ]);
                    
                    const dadosReal = await respostaReal.json();
                    const dadosRealAnterior = await respostaRealAnterior.json();
                    
                    if (!respostaReal.ok) throw new Error(dadosReal.erro || 'Falha ao carregar a matriz real.');
                    
                    if (dadosReal.status === 'pronto') {
                        document.getElementById('avisoMatrizReal').style.display = 'none';
                        renderizarTabelaMatrizReal(dadosReal.matrizReal, ano);
                        document.getElementById('containerMatrizReal').style.display = 'block';
                        
                        const linhaRealVigente = getHomologadosReal(dadosReal.matrizReal);
                        const linhaRealAnterior = dadosRealAnterior.status === 'pronto' ? getHomologadosReal(dadosRealAnterior.matrizReal) : Array(12).fill(0);
                        
                        renderizarGraficoComparativo(linhaRealVigente, linhaRealAnterior, ano, ano - 1);

                    } else {
                        if(btn) { btn.innerHTML = '🔄 Verificar se a Matriz já foi gerada'; btn.disabled = false; }
                    }
                } catch(e) {
                    alert('❌ ' + e.message);
                    if(btn) { btn.innerHTML = '🔄 Verificar se a Matriz já foi gerada'; btn.disabled = false; }
                }
            }

            function processarEExibirDados(pregoes, ano, linhaDoTempo) {
                let estatisticasGerais = {};
                let estatisticasMensais = {};
                let pregoesMensais = {}; 
                let totalItensGeral = 0;

                dadosGlobaisPregoes = pregoes;

                for (const p of pregoes) {
                    const mesIndex = p.mesIndex !== undefined ? p.mesIndex : 0;
                    const rotuloMes = p.mes || nomeMeses[mesIndex] || 'N/A';
                    const situacao = p.situacao || p.situacaoGeral || 'N/A';
                    const pregaoId = p.pregao || (p.numero ? \`PE \${p.numero}/\${ano}\` : 'N/A');

                    p.mesFormatado = rotuloMes;
                    p.situacaoFormatada = situacao;
                    p.pregaoFormatado = pregaoId;
                    
                    if (!estatisticasMensais[rotuloMes]) {
                        estatisticasMensais[rotuloMes] = {};
                        pregoesMensais[rotuloMes] = 0;
                    }

                    pregoesMensais[rotuloMes] += 1;

                    const statusPregao = p.status || {};

                    Object.keys(statusPregao).forEach(sit => {
                        const qtd = statusPregao[sit];
                        estatisticasGerais[sit] = (estatisticasGerais[sit] || 0) + qtd;
                        estatisticasMensais[rotuloMes][sit] = (estatisticasMensais[rotuloMes][sit] || 0) + qtd;
                        totalItensGeral += qtd;
                    });
                }

                if (!linhaDoTempo) {
                    linhaDoTempo = {
                        abertos: Array(12).fill(0), homologados: Array(12).fill(0),
                        emAndamento: Array(12).fill(0), fracassados: Array(12).fill(0),
                        desertos: Array(12).fill(0), anulados: Array(12).fill(0)
                    };
                }

                const todasSituacoesUnicas = Object.keys(estatisticasGerais).sort((a, b) => estatisticasGerais[b] - estatisticasGerais[a]);

                renderizarKPIs(pregoes.length, totalItensGeral, estatisticasGerais);
                renderizarTabelaMensal(todasSituacoesUnicas, estatisticasMensais, pregoesMensais, ano);
                renderizarGraficoBarras(estatisticasMensais, ano);
                renderizarGraficoLinha(linhaDoTempo, ano);
                
                // Dispara inicialização da tabela com paginação
                renderizarTabelaDetalhes(todasSituacoesUnicas, pregoes);
                
                document.getElementById('conteudoPainel').style.display = 'block';
            }

            function renderizarKPIs(totalPregoes, totalItens, estatisticasGerais) {
                document.getElementById('kpiTotalPregoes').innerText = totalPregoes;
                document.getElementById('kpiTotalItens').innerText = totalItens;
                
                let sucesso = 0;
                let falha = 0;

                for (const [sit, qtd] of Object.entries(estatisticasGerais)) {
                    const sLow = sit.toLowerCase();
                    if (sLow.includes('homologado') || sLow.includes('adjudicado')) sucesso += qtd;
                    else if (sLow.includes('deserto') || sLow.includes('fracassado') || sLow.includes('cancelado') || sLow.includes('anulado')) falha += qtd;
                }

                const percSucesso = totalItens > 0 ? ((sucesso / totalItens) * 100).toFixed(1) : 0;
                const percFalha = totalItens > 0 ? ((falha / totalItens) * 100).toFixed(1) : 0;

                document.getElementById('kpiSucesso').innerText = \`\${percSucesso}% (\${sucesso})\`;
                document.getElementById('kpiFalha').innerText = \`\${percFalha}% (\${falha})\`;
            }

            function renderizarTabelaMensal(statusArray, contagemMensal, pregoesMensais, ano) {
                const thead = document.getElementById('tabelaHead');
                const tbody = document.getElementById('tabelaBody');
                const tfoot = document.getElementById('tabelaFoot');

                let htmlHead = '<tr><th>- Mês</th><th>Qtd Pregões</th>';
                statusArray.forEach(s => { htmlHead += \`<th>\${s} (Itens)</th>\`; });
                htmlHead += '<th>Total Itens</th></tr>';
                thead.innerHTML = htmlHead;

                let htmlBody = '';
                const totaisColunas = Array(statusArray.length).fill(0);
                let grandeTotalItens = 0;
                let grandeTotalPregoes = 0;

                for (let i = 0; i < 12; i++) {
                    const rotulo = nomeMeses[i];
                    const dadosMes = contagemMensal[rotulo] || {};
                    const qtdPregoesMes = pregoesMensais[rotulo] || 0;
                    let totalItensMes = 0;
                    
                    statusArray.forEach(s => { totalItensMes += (dadosMes[s] || 0); });
                    
                    const mesAtual = new Date().getMonth();
                    const anoAtual = new Date().getFullYear();
                    const anoBuscado = parseInt(ano);
                    
                    if (totalItensMes === 0 && qtdPregoesMes === 0 && anoBuscado >= anoAtual && i > mesAtual) continue;

                    htmlBody += \`<tr><td>\${rotulo}</td><td style="font-weight:bold; color:#2c3e50; text-align: center;">\${qtdPregoesMes > 0 ? qtdPregoesMes : '-'}</td>\`;
                    
                    statusArray.forEach((s, index) => {
                        const qtd = dadosMes[s] || 0;
                        totaisColunas[index] += qtd;
                        if (qtd > 0) {
                            htmlBody += \`<td class="clickable-cell" onclick="abrirModalDetalhes('\${rotulo}', '\${s}', '\${ano}')" title="Clique para gerar relatório deste mês e status">\${qtd}</td>\`;
                        } else {
                            htmlBody += \`<td>-</td>\`;
                        }
                    });
                    
                    htmlBody += \`<td style="font-weight: bold; background-color: #f8fafc;">\${totalItensMes > 0 ? totalItensMes : '-'}</td></tr>\`;
                    grandeTotalItens += totalItensMes;
                    grandeTotalPregoes += qtdPregoesMes;
                }
                tbody.innerHTML = htmlBody;

                let htmlFoot = \`<tr class="row-total"><td>Total geral</td><td style="text-align: center;">\${grandeTotalPregoes}</td>\`;
                totaisColunas.forEach(t => { htmlFoot += \`<td>\${t}</td>\`; });
                htmlFoot += \`<td>\${grandeTotalItens}</td></tr>\`;
                tfoot.innerHTML = htmlFoot;
            }

            function renderizarTabelaMatrizReal(matrizReal, ano) {
                const thead = document.getElementById('tabelaRealHead');
                const tbody = document.getElementById('tabelaRealBody');
                const tfoot = document.getElementById('tabelaRealFoot');

                let statusUnicos = new Set();
                nomeMeses.forEach(mes => {
                    if (matrizReal[mes]) {
                        Object.keys(matrizReal[mes]).forEach(sit => statusUnicos.add(sit));
                    }
                });
                const statusArray = Array.from(statusUnicos).sort();

                let htmlHead = '<tr><th>- Mês da Ação</th>';
                statusArray.forEach(s => { htmlHead += \`<th>\${s}</th>\`; });
                htmlHead += '<th>Total Itens no Mês</th></tr>';
                thead.innerHTML = htmlHead;

                let htmlBody = '';
                const totaisColunas = Array(statusArray.length).fill(0);
                let grandeTotal = 0;

                nomeMeses.forEach((rotulo, idx) => {
                    const dadosMes = matrizReal[rotulo] || {};
                    let totalMes = 0;
                    statusArray.forEach(s => totalMes += (dadosMes[s] || 0));

                    const mesAtual = new Date().getMonth();
                    const anoAtual = new Date().getFullYear();
                    if (totalMes === 0 && parseInt(ano) >= anoAtual && idx > mesAtual) return;

                    htmlBody += \`<tr><td>\${rotulo}</td>\`;
                    statusArray.forEach((s, i) => {
                        const qtd = dadosMes[s] || 0;
                        totaisColunas[i] += qtd;
                        htmlBody += \`<td>\${qtd > 0 ? qtd : '-'}</td>\`;
                    });
                    htmlBody += \`<td style="font-weight: bold; background-color: #f8fafc;">\${totalMes > 0 ? totalMes : '-'}</td></tr>\`;
                    grandeTotal += totalMes;
                });
                tbody.innerHTML = htmlBody;

                let htmlFoot = \`<tr class="row-total"><td>Total geral</td>\`;
                totaisColunas.forEach(t => { htmlFoot += \`<td>\${t}</td>\`; });
                htmlFoot += \`<td>\${grandeTotal}</td></tr>\`;
                tfoot.innerHTML = htmlFoot;
            }

            async function exportarMesAcao() {
                const ano = document.getElementById('inputAno').value;
                const selectMes = document.getElementById('selectMesAcao');
                const mesIndex = selectMes.value;
                const nomeMes = selectMes.options[selectMes.selectedIndex].text;

                if (!ano) return alert('Por favor, insira o ano no topo da página.');

                const btn = document.getElementById('btnExportarMesAcao');
                const textoOriginal = btn.innerHTML;
                
                btn.innerHTML = '⏳ Varrendo PNCP... Aguarde';
                btn.disabled = true;

                try {
                    const response = await fetch('/api/pregoes/exportar-mes-acao', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ano, mesIndex, nomeMes })
                    });

                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.erro || 'Falha ao processar a geração do Excel no servidor.');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`Itens_Homologados_\${nomeMes}_\${ano}.xlsx\`;
                    
                    document.body.appendChild(a);
                    a.click();
                    
                    a.remove();
                    window.URL.revokeObjectURL(url);
                    
                } catch (error) {
                    console.error('Erro na exportação por mês:', error);
                    alert('❌ ' + error.message);
                } finally {
                    btn.innerHTML = textoOriginal;
                    btn.disabled = false;
                }
            }

            function abrirModalDetalhes(mes, status, ano) {
                const tbody = document.getElementById('tabelaModalBody');
                tbody.innerHTML = '';
                
                modalCurrentMes = mes;
                modalCurrentStatus = status;
                
                document.getElementById('modalTitle').innerText = \`Itens de \${mes} - \${status} (\${ano})\`;
                document.getElementById('modalSubtitle').innerText = \`Totalizando os pregões que compõem este número.\`;

                const pregoesFiltrados = dadosGlobaisPregoes.filter(p => p.mesFormatado === mes && p.status && p.status[status] > 0);
                
                modalPregoesList = pregoesFiltrados.map(p => ({
                    idCompra: p.idCompra,
                    pregaoFormatado: p.pregaoFormatado,
                    sei: p.sei
                }));
                
                let htmlBody = '';
                pregoesFiltrados.forEach(p => {
                    const qtdNoStatus = p.status[status];
                    htmlBody += \`<tr>
                        <td><strong>\${p.pregaoFormatado}</strong></td>
                        <td>\${p.sei || 'N/A'}</td>
                        <td>\${p.situacaoFormatada}</td>
                        <td style="font-weight:bold; color:#8e44ad; text-align: center;">\${qtdNoStatus}</td>
                    </tr>\`;
                });
                
                tbody.innerHTML = htmlBody;
                document.getElementById('modalDetalhes').style.display = 'block';
            }

            function fecharModal() {
                document.getElementById('modalDetalhes').style.display = 'none';
            }
            
            window.onclick = function(event) {
                const modal = document.getElementById('modalDetalhes');
                if (event.target === modal) fecharModal();
            }

            async function exportarExcelModal() {
                if (!modalPregoesList || modalPregoesList.length === 0) return alert('Nenhum dado de pregão selecionado para exportar.');
                
                const btn = document.getElementById('btnExportarExcel');
                const textoOriginal = btn.innerHTML;
                
                btn.innerHTML = '⏳ Buscando no PNCP... Isso pode demorar';
                btn.disabled = true;

                try {
                    const response = await fetch('/api/pregoes/exportar-itens', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pregoes: modalPregoesList,
                            statusFiltrado: modalCurrentStatus,
                            mes: modalCurrentMes
                        })
                    });

                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.erro || 'Falha ao processar a geração do Excel no servidor.');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    
                    const nomeSeguro = String(modalCurrentStatus).replace(/[^a-zA-Z0-9]/g, '_');
                    a.download = \`Itens_\${modalCurrentMes}_\${nomeSeguro}.xlsx\`;
                    
                    document.body.appendChild(a);
                    a.click();
                    
                    a.remove();
                    window.URL.revokeObjectURL(url);
                    
                } catch (error) {
                    console.error('Erro na exportação:', error);
                    alert('❌ Falha ao exportar o Excel detalhado: ' + error.message);
                } finally {
                    btn.innerHTML = textoOriginal;
                    btn.disabled = false;
                }
            }

            function renderizarGraficoBarras(contagemMensal, ano) {
                if (chartInstancia) chartInstancia.destroy();
                const ctx = document.getElementById('chartEvolucao').getContext('2d');
                
                const mesesAtivos = [];
                const dataTotal = [];
                const dataHomologado = [];
                
                const anoAtual = new Date().getFullYear();
                const anoBuscado = parseInt(ano);

                nomeMeses.forEach((mes, idx) => {
                    const dadosMes = contagemMensal[mes] || {};
                    let totalMes = 0;
                    let homologadosMes = 0;
                    
                    Object.keys(dadosMes).forEach(sit => {
                        const qtd = dadosMes[sit] || 0;
                        totalMes += qtd;
                        if(sit.toLowerCase().includes('homologado') || sit.toLowerCase().includes('adjudicado')) {
                            homologadosMes += qtd;
                        }
                    });

                    if (totalMes > 0 || (anoBuscado < anoAtual) || (anoBuscado === anoAtual && idx <= new Date().getMonth())) {
                        mesesAtivos.push(mes.toUpperCase());
                        dataTotal.push(totalMes);
                        dataHomologado.push(homologadosMes);
                    }
                });

                // Aumentar levemente o eixo X para garantir que os rótulos de porcentagem caibam sem cortar
                let maxVal = Math.max(...dataTotal, 10);
                
                chartInstancia = new Chart(ctx, {
                    type: 'bar',
                    data: { 
                        labels: mesesAtivos, 
                        datasets: [
                            { label: 'Total de Itens Abertos', data: dataTotal, backgroundColor: '#34495e', borderRadius: 4 },
                            { label: 'Itens Homologados', data: dataHomologado, backgroundColor: '#27ae60', borderRadius: 4 }
                        ] 
                    },
                    options: {
                        indexAxis: 'y', 
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 11, family: 'Segoe UI' }, usePointStyle: true, boxWidth: 8 } },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const idx = context.dataIndex;
                                        const total = dataTotal[idx];
                                        const homologados = dataHomologado[idx];
                                        const pendentes = total - homologados;
                                        
                                        const percHomol = total > 0 ? ((homologados / total) * 100).toFixed(1) : 0;
                                        const percPend = total > 0 ? ((pendentes / total) * 100).toFixed(1) : 0;
                                        
                                        if (context.datasetIndex === 0) {
                                            return \`Total Licitado: \${total} itens (\${percPend}% ainda pendentes)\`;
                                        } else {
                                            return \`Homologados: \${homologados} itens (\${percHomol}% do edital)\`;
                                        }
                                    }
                                }
                            },
                            datalabels: { 
                                color: '#fff', 
                                font: { weight: 'bold', size: 11 }, 
                                formatter: (value, context) => {
                                    if (value === 0) return null;
                                    const idx = context.dataIndex;
                                    const total = dataTotal[idx];
                                    
                                    if (context.datasetIndex === 1) { 
                                        // Etiqueta da barra verde (Homologados)
                                        const perc = total > 0 ? ((value / total) * 100).toFixed(1).replace('.0', '') : 0;
                                        return \`\${value} (\${perc}%)\`;
                                    } else { 
                                        // Etiqueta da barra escura (Total / Pendentes)
                                        const pendentes = total - dataHomologado[idx];
                                        const percPendentes = total > 0 ? ((pendentes / total) * 100).toFixed(1).replace('.0', '') : 0;
                                        return \`\${value} (Pendentes: \${percPendentes}%)\`;
                                    }
                                },
                                // Alinha os números à direita dentro da barra, mas sem colar na borda
                                anchor: 'end',
                                align: 'start',
                                offset: 4
                            }
                        },
                        scales: {
                            x: { beginAtZero: true, grid: { display: true }, max: maxVal * 1.15 }, 
                            y: { grid: { display: false } }
                        },
                        interaction: { mode: 'index', axis: 'y', intersect: false } 
                    }
                });
            }

            function renderizarGraficoLinha(linhaDoTempo, ano) {
                if (chartInstanciaLinha) chartInstanciaLinha.destroy();
                if (!linhaDoTempo) return;

                const ctx = document.getElementById('chartLinhaTempo').getContext('2d');
                const anoAtual = new Date().getFullYear();
                const mesAtual = new Date().getMonth();
                const limiteMes = (parseInt(ano) === anoAtual) ? mesAtual + 1 : 12;

                const labelsAtivos = nomeMeses.slice(0, limiteMes);
                const dadosAbertos = linhaDoTempo.abertos.slice(0, limiteMes);
                const dadosHomologados = linhaDoTempo.homologados.slice(0, limiteMes);
                const dadosEmAndamento = linhaDoTempo.emAndamento.slice(0, limiteMes);
                const dadosFracassados = linhaDoTempo.fracassados.slice(0, limiteMes);
                const dadosDesertos = linhaDoTempo.desertos.slice(0, limiteMes);
                const dadosAnulados = linhaDoTempo.anulados.slice(0, limiteMes);

                chartInstanciaLinha = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labelsAtivos,
                        datasets: [
                            { label: 'Em andamento', data: dadosEmAndamento, borderColor: '#F1C40F', backgroundColor: '#F1C40F', borderWidth: 3, fill: false, tension: 0.1, pointRadius: 4, pointHoverRadius: 6 },
                            { label: 'Homologados', data: dadosHomologados, borderColor: '#A9CCE3', backgroundColor: '#A9CCE3', borderWidth: 3, fill: false, tension: 0.1, pointRadius: 4, pointHoverRadius: 6 },
                            { label: 'Fracassado', data: dadosFracassados, borderColor: '#E74C3C', backgroundColor: '#E74C3C', borderWidth: 3, fill: false, tension: 0.1, pointRadius: 4, pointHoverRadius: 6 },
                            { label: 'Deserto', data: dadosDesertos, borderColor: '#E67E22', backgroundColor: '#E67E22', borderWidth: 3, fill: false, tension: 0.1, pointRadius: 4, pointHoverRadius: 6 },
                            { label: 'Anulado/Revogado', data: dadosAnulados, borderColor: '#8E44AD', backgroundColor: '#8E44AD', borderWidth: 3, fill: false, tension: 0.1, pointRadius: 4, pointHoverRadius: 6 },
                            { label: 'Abertos', data: dadosAbertos, borderColor: '#1B4F72', backgroundColor: '#1B4F72', borderWidth: 3, fill: false, tension: 0.1, pointRadius: 4, pointHoverRadius: 6 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', labels: { font: { family: 'Segoe UI', size: 12 }, usePointStyle: false, boxWidth: 15 } },
                            datalabels: { display: false }
                        },
                        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { display: false } } },
                        interaction: { mode: 'index', intersect: false }
                    }
                });
            }

            function renderizarGraficoComparativo(dadosVigenteReal, dadosAnteriorReal, anoVigente, anoAnterior) {
                if (chartComparativo) chartComparativo.destroy();

                const ctx = document.getElementById('chartComparativo').getContext('2d');
                const anoAtual = new Date().getFullYear();
                const mesAtual = new Date().getMonth();
                
                const isAnoAtual = parseInt(anoVigente) === anoAtual;
                
                const dadosVigente = dadosVigenteReal.map((val, idx) => {
                    return (isAnoAtual && idx > mesAtual) ? null : val;
                });
                
                const dadosAnterior = dadosAnteriorReal.map((val, idx) => {
                    return (isAnoAtual && idx > mesAtual) ? null : val;
                });

                chartComparativo = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: nomeMeses,
                        datasets: [
                            {
                                label: \`Produtividade \${anoVigente}\`, data: dadosVigente,
                                borderColor: '#27ae60', backgroundColor: 'rgba(39, 174, 96, 0.2)',
                                borderWidth: 3, fill: true, tension: 0.3, pointRadius: 5, pointHoverRadius: 7
                            },
                            {
                                label: \`Produtividade \${anoAnterior}\`, data: dadosAnterior,
                                borderColor: '#95a5a6', backgroundColor: 'transparent',
                                borderWidth: 2, borderDash: [5, 5], fill: false, tension: 0.3, pointRadius: 4, pointHoverRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', labels: { font: { family: 'Segoe UI', size: 12 }, usePointStyle: true, boxWidth: 10 } },
                            datalabels: { display: false }
                        },
                        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { display: false } } },
                        interaction: { mode: 'index', intersect: false }
                    }
                });
            }

            // ---- Nova lógica de Paginação para Tabela Detalhes ----
            function renderizarTabelaDetalhes(todasSituacoesUnicas, pregoesDetalhes) {
                detalhesDadosGlobais = pregoesDetalhes;
                colunasUnicasGlobais = todasSituacoesUnicas;
                currentPageDetalhes = 1;
                
                const thead = document.getElementById('tabelaDetalhesHead');
                let htmlHead = '<tr><th>Pregão</th><th>Mês Origem</th><th>Processo SEI</th><th>Situação do Pregão</th><th>Total Itens</th>';
                todasSituacoesUnicas.forEach(s => htmlHead += \`<th>\${s}</th>\`);
                htmlHead += '</tr>';
                thead.innerHTML = htmlHead;

                renderPaginaDetalhes();
            }

            function renderPaginaDetalhes() {
                const tbody = document.getElementById('tabelaDetalhesBody');
                const start = (currentPageDetalhes - 1) * rowsPerPage;
                const end = start + rowsPerPage;
                const pageData = detalhesDadosGlobais.slice(start, end);

                let htmlBody = '';
                pageData.forEach(p => {
                    htmlBody += \`<tr>
                        <td><strong>\${p.pregaoFormatado}</strong></td>
                        <td>\${p.mesFormatado}</td>
                        <td>\${p.sei || 'N/A'}</td>
                        <td>\${p.situacaoFormatada}</td>
                        <td style="font-weight:bold; background-color:#f8fafc;">\${p.totalItens || 0}</td>\`;
                    
                    const statusObj = p.status || {};
                    colunasUnicasGlobais.forEach(sit => {
                        const qtd = statusObj[sit] || 0;
                        htmlBody += \`<td>\${qtd > 0 ? qtd : '-'}</td>\`;
                    });
                    htmlBody += '</tr>';
                });
                
                if(pageData.length === 0) {
                     htmlBody = \`<tr><td colspan="\${colunasUnicasGlobais.length + 5}">Nenhum detalhe disponível.</td></tr>\`;
                }

                tbody.innerHTML = htmlBody;

                const totalPages = Math.ceil(detalhesDadosGlobais.length / rowsPerPage) || 1;
                document.getElementById('pageInfoDetalhes').innerText = \`Página \${currentPageDetalhes} de \${totalPages}\`;
                
                document.getElementById('btnPrevDetalhes').disabled = currentPageDetalhes === 1;
                document.getElementById('btnNextDetalhes').disabled = currentPageDetalhes >= totalPages;
            }

            function prevPageDetalhes() {
                if (currentPageDetalhes > 1) {
                    currentPageDetalhes--;
                    renderPaginaDetalhes();
                }
            }

            function nextPageDetalhes() {
                if ((currentPageDetalhes * rowsPerPage) < detalhesDadosGlobais.length) {
                    currentPageDetalhes++;
                    renderPaginaDetalhes();
                }
            }

            window.onload = function() {
                iniciarCronometroAtualizacao();
                carregarDados();
            };
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderPregoes };
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderDashboardDinamico(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Dashboard Dinâmico - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>
        <style>
            .tabs-container { display: flex; gap: 10px; margin-bottom: 20px; }
            .tab-btn { flex: 1; padding: 12px 20px; border: none; background: #bdc3c7; color: #2c3e50; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold; transition: 0.3s; }
            .tab-btn.active { background: #8e44ad; color: white; box-shadow: 0 4px 10px rgba(142, 68, 173, 0.3); }
            .box-secao { background: white; padding: 20px; border-radius: 10px; box-shadow: 5px 5px 15px #c8d0e7, -5px -5px 15px #ffffff; margin-bottom: 20px; }
            .secao-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; }
            .filter-row { display: flex; gap: 15px; align-items: center; margin-bottom: 10px; background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0; }
            .filter-row select { padding: 8px; border-radius: 5px; border: 1px solid #ccc; flex: 1; font-size: 14px; }
            .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-top: 20px; }
            .chart-card { background: #fdfdfd; padding: 15px; border-radius: 8px; border: 1px solid #ecf0f1; text-align: center; }
            canvas { max-width: 100%; height: auto !important; max-height: 300px; margin-top: 10px; }
            .table-responsive { overflow-x: auto; max-height: 500px; overflow-y: auto; border: 1px solid #ecf0f1; border-radius: 5px; }
            #tabelaDados { width: 100%; border-collapse: collapse; white-space: nowrap; }
            #tabelaDados th { position: sticky; top: 0; background-color: #2c3e50; color: white; padding: 12px; text-align: left; font-size: 13px; }
            #tabelaDados td { padding: 10px 12px; border-bottom: 1px solid #ddd; font-size: 13px; }
            #tabelaDados tr:hover { background-color: #f1f2f6; }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div class="container" style="max-width: 1400px; width: 95%;">
            <h1 style="color: #2c3e50; margin-bottom: 15px;">🔍 Dashboard Dinâmico - Filtros Livres</h1>
            
            <div class="box-secao">
                <div class="secao-header">
                    <h2 style="color: #2c3e50; margin: 0; font-size: 20px;">🛠️ Regras de Filtro</h2>
                    <button class="btn" onclick="adicionarFiltro()" style="background-color: #3498db;">➕ Adicionar Filtro</button>
                </div>
                <div id="filtrosContainer">
                    <p id="msgSemFiltro" style="color: #7f8c8d; font-style: italic; margin: 0;">Nenhum filtro aplicado. Mostrando todos os dados.</p>
                </div>
            </div>

            <div class="box-secao" style="background: #f4f6f7; border-left: 5px solid #8e44ad;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <h3 style="margin: 0; color: #2c3e50;">📊 Agrupar Gráficos Por:</h3>
                    <select id="selectAgrupamento" onchange="aplicarFiltrosEGerarGraficos()" style="padding: 10px; border-radius: 5px; border: 1px solid #bdc3c7; font-size: 15px; font-weight: bold; width: 250px;">
                        <option value="catEstoque">Saúde do Estoque</option>
                        <option value="catAtas">Status das Atas</option>
                        <option value="catProcessos">Status dos Processos</option>
                        <option value="planejador">Planejador</option>
                        <option value="local">Local (FAR/ALM)</option>
                        <option value="familia">Família de Materiais</option>
                    </select>
                </div>

                <div class="charts-grid">
                    <div class="chart-card">
                        <h4 style="margin: 0 0 10px 0; color: #34495e;">Distribuição (Proporção)</h4>
                        <canvas id="chartPizza"></canvas>
                    </div>
                    <div class="chart-card">
                        <h4 style="margin: 0 0 10px 0; color: #34495e;">Quantidades Absolutas</h4>
                        <canvas id="chartBarra"></canvas>
                    </div>
                </div>
            </div>

            <div class="box-secao">
                <div class="secao-header">
                    <h2 style="color: #2c3e50; margin: 0; font-size: 20px;">📄 Dados Filtrados (<span id="contadorLinhas">0</span> itens)</h2>
                </div>
                <div class="table-responsive">
                    <table id="tabelaDados">
                        <thead id="tabelaHead"></thead>
                        <tbody id="tabelaBody"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <script>
            Chart.register(ChartDataLabels);
            Chart.defaults.set('plugins.datalabels', { color: '#fff', font: { weight: 'bold', size: 12 }, textShadowBlur: 4, textShadowColor: 'rgba(0, 0, 0, 0.8)' });

            let dadosMaster = [];
            let dadosFiltrados = [];
            let colunasDisponiveis = [];
            let filtroIndex = 0;
            
            let chartPizzaInstancia = null;
            let chartBarraInstancia = null;

            const mapaColunas = {
                item: 'Código do Item', descricao: 'Descrição', familia: 'Família', local: 'Local (FAR/ALM)', planejador: 'Planejador',
                saldoEmDias: 'Saldo em Dias', saldoAtual: 'Saldo Atual', cmm12: 'CMM 12', saldoAta: 'Saldo da Ata',
                catEstoque: 'Saúde do Estoque', catAtas: 'Status Atas', catProcessos: 'Status Processos',
                isAcaoImediata: 'Furo s/ Reposição', isSegurancaEstoque: 'Segurança de Estoque', temEmpenho: 'Possui Empenho', temAe: 'Possui AE',
                processoAta: 'Processo da Ata', processoAndamento: 'Proc. em Andamento'
            };

            const formatadorPizza = {
                formatter: (value, ctx) => {
                    if (value === 0) return null;
                    let sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    let percentage = (value * 100 / sum).toFixed(1) + "%";
                    return value + '\\n(' + percentage + ')';
                }, textAlign: 'center'
            };
            const formatadorBarra = { formatter: (value) => value > 0 ? value : null };

            async function carregarDadosIniciais() {
                try {
                    const resposta = await fetch('/api/dados-dinamicos');
                    dadosMaster = await resposta.json();
                    if (dadosMaster.length > 0) { colunasDisponiveis = Object.keys(dadosMaster[0]); renderizarTabelaHead(); }
                    aplicarFiltrosEGerarGraficos();
                } catch (e) { alert("Erro ao conectar com a base de dados."); }
            }

            function traduzirBool(valor) { if (valor === true) return 'Sim'; if (valor === false) return 'Não'; return valor; }

            function renderizarTabelaHead() {
                const thead = document.getElementById('tabelaHead');
                const tr = document.createElement('tr');
                colunasDisponiveis.forEach(col => { const th = document.createElement('th'); th.innerText = mapaColunas[col] || col; tr.appendChild(th); });
                thead.appendChild(tr);
            }

            function adicionarFiltro() {
                document.getElementById('msgSemFiltro').style.display = 'none';
                const idDiv = 'filtro-' + filtroIndex++;
                const div = document.createElement('div');
                div.className = 'filter-row';
                div.id = idDiv;

                let opcoesColunas = '<option value="">-- Selecione a Coluna --</option>';
                colunasDisponiveis.forEach(col => { opcoesColunas += \`<option value="\${col}">\${mapaColunas[col] || col}</option>\`; });

                div.innerHTML = \`
                    <select id="coluna-\${idDiv}" onchange="popularValoresFiltro('\${idDiv}')">\${opcoesColunas}</select>
                    <select id="valor-\${idDiv}" onchange="aplicarFiltrosEGerarGraficos()"><option value="">-- Selecione o Valor --</option></select>
                    <button class="btn btn-danger" onclick="removerFiltro('\${idDiv}')">🗑️ Remover</button>
                \`;
                document.getElementById('filtrosContainer').appendChild(div);
            }

            function removerFiltro(idDiv) {
                document.getElementById(idDiv).remove();
                if (document.getElementById('filtrosContainer').children.length === 1) document.getElementById('msgSemFiltro').style.display = 'block';
                aplicarFiltrosEGerarGraficos();
            }

            window.popularValoresFiltro = function(idDiv) {
                const coluna = document.getElementById(\`coluna-\${idDiv}\`).value;
                const selectValor = document.getElementById(\`valor-\${idDiv}\`);
                selectValor.innerHTML = '<option value="">-- Selecione o Valor --</option>';
                if (!coluna) return;

                const valoresUnicos = new Set();
                dadosMaster.forEach(item => { valoresUnicos.add(traduzirBool(item[coluna])); });

                Array.from(valoresUnicos).sort().forEach(val => {
                    const option = document.createElement('option');
                    option.value = val; option.innerText = val; selectValor.appendChild(option);
                });
                aplicarFiltrosEGerarGraficos();
            };

            function lerFiltrosAtivos() {
                const filtros = [];
                document.querySelectorAll('.filter-row').forEach(row => {
                    const selects = row.querySelectorAll('select');
                    if (selects[0].value && selects[1].value) filtros.push({ coluna: selects[0].value, valor: selects[1].value });
                });
                return filtros;
            }

            window.aplicarFiltrosEGerarGraficos = function() {
                const filtros = lerFiltrosAtivos();
                dadosFiltrados = dadosMaster.filter(item => filtros.every(f => String(traduzirBool(item[f.coluna])) === f.valor));
                document.getElementById('contadorLinhas').innerText = dadosFiltrados.length;

                const tbody = document.getElementById('tabelaBody');
                tbody.innerHTML = '';
                const limite = Math.min(dadosFiltrados.length, 200);
                for (let i = 0; i < limite; i++) {
                    const tr = document.createElement('tr');
                    colunasDisponiveis.forEach(col => { const td = document.createElement('td'); td.innerText = traduzirBool(dadosFiltrados[i][col]); tr.appendChild(td); });
                    tbody.appendChild(tr);
                }
                
                if (dadosFiltrados.length > 200) {
                    const trInfo = document.createElement('tr');
                    const tdInfo = document.createElement('td');
                    tdInfo.colSpan = colunasDisponiveis.length;
                    tdInfo.style.textAlign = 'center'; tdInfo.style.fontStyle = 'italic';
                    tdInfo.innerText = \`... e mais \${dadosFiltrados.length - 200} linhas omitidas para desempenho.\`;
                    trInfo.appendChild(tdInfo); tbody.appendChild(trInfo);
                }
                gerarGraficos();
            };

            const paletaCoresDinamica = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#d35400', '#7f8c8d', '#c0392b', '#16a085'];

            function gerarGraficos() {
                if (chartPizzaInstancia) chartPizzaInstancia.destroy();
                if (chartBarraInstancia) chartBarraInstancia.destroy();

                const colunaAgrupamento = document.getElementById('selectAgrupamento').value;
                const contagem = {};
                dadosFiltrados.forEach(item => { const chave = traduzirBool(item[colunaAgrupamento]) || 'N/A'; contagem[chave] = (contagem[chave] || 0) + 1; });

                const labels = Object.keys(contagem);
                const dataValues = Object.values(contagem);

                chartPizzaInstancia = new Chart(document.getElementById('chartPizza'), {
                    type: 'pie',
                    data: { labels: labels, datasets: [{ data: dataValues, backgroundColor: paletaCoresDinamica.slice(0, labels.length), borderWidth: 1 }] },
                    options: { responsive: true, plugins: { legend: { position: 'right' }, datalabels: formatadorPizza } }
                });

                chartBarraInstancia = new Chart(document.getElementById('chartBarra'), {
                    type: 'bar',
                    data: { labels: labels, datasets: [{ label: 'Quantidade de Itens', data: dataValues, backgroundColor: '#3498db', borderRadius: 4 }] },
                    options: { responsive: true, plugins: { legend: { display: false }, datalabels: formatadorBarra }, scales: { y: { beginAtZero: true } } }
                });
            }

            window.onload = carregarDadosIniciais;
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderDashboardDinamico };
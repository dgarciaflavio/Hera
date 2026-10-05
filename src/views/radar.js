// src/views/radar.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderRadar(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Radar de Itens - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body { background-color: #f4f7f6; }
            .radar-container { max-width: 1400px; margin: 30px auto; padding: 20px; }
            
            .grid-layout { display: grid; grid-template-columns: 1fr 2fr; gap: 20px; align-items: start; }
            @media (max-width: 1000px) { .grid-layout { grid-template-columns: 1fr; } }

            .panel { background: #ffffff; border-radius: 12px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-bottom: 20px; }
            .panel-header { font-size: 18px; font-weight: 800; color: #2c3e50; margin-bottom: 15px; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
            
            .input-group { margin-bottom: 15px; }
            .input-group label { display: block; font-size: 13px; font-weight: bold; color: #7f8c8d; margin-bottom: 5px; }
            .textarea-lote { width: 100%; height: 100px; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-family: monospace; resize: vertical; box-sizing: border-box; }
            
            .table-container { max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th { background: #f8fafc; position: sticky; top: 0; padding: 10px; text-align: left; color: #475569; }
            td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
            .btn-remover { background: none; border: none; color: #e74c3c; cursor: pointer; font-weight: bold; font-size: 16px; padding: 0 5px; transition: 0.2s; }
            .btn-remover:hover { transform: scale(1.2); }

            /* Cards de Detalhamento */
            .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .kpi-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.02); border-left: 4px solid #3498db; }
            .kpi-title { margin: 0 0 5px 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; }
            .kpi-value { margin: 0; font-size: 16px; font-weight: 800; color: #1e293b; }
            .kpi-sub { margin: 5px 0 0 0; font-size: 12px; color: #7f8c8d; }
            
            .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            @media (max-width: 800px) { .charts-grid { grid-template-columns: 1fr; } }
            .chart-wrapper { position: relative; height: 300px; width: 100%; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; box-sizing: border-box; }

            .btn-disparar { background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; width: 100%; padding: 15px; font-size: 16px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3); transition: 0.3s; margin-top: 10px; }
            .btn-disparar:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(39, 174, 96, 0.4); }
            .btn-disparar:disabled { background: #95a5a6; cursor: not-allowed; transform: none; box-shadow: none; }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div class="radar-container">
            <h1 style="color: #2c3e50; margin-bottom: 5px;">📡 Radar de Itens Críticos</h1>
            <p style="color: #7f8c8d; margin-bottom: 25px;">Monitoramento cirúrgico de materiais selecionados, com envio de alertas automáticos via WhatsApp e extração de tendências (MQO).</p>

            <div class="grid-layout">
                <!-- COLUNA ESQUERDA: GESTÃO -->
                <div>
                    <!-- Painel de Contatos -->
                    <div class="panel">
                        <div class="panel-header">👥 Destinatários do Alerta</div>
                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <input type="text" id="nomeContato" placeholder="Nome" class="input-text" style="flex: 1; min-width: 80px;">
                            <input type="text" id="telContato" placeholder="Telefone (só números)" class="input-text" style="flex: 1; min-width: 120px;">
                            <button class="btn" onclick="adicionarContato(this)" style="background: #3498db;">Add</button>
                        </div>
                        <div class="table-container">
                            <table>
                                <thead><tr><th>Nome</th><th>Telefone</th><th>Excluir</th></tr></thead>
                                <tbody id="listaContatos"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Painel de Itens -->
                    <div class="panel">
                        <div class="panel-header">🎯 Lista do Radar</div>
                        <div class="input-group">
                            <label>Adicionar itens (separados por vírgula ou quebra de linha):</label>
                            <textarea id="inputItens" class="textarea-lote" placeholder="Ex: A01485, 1509, 12345..."></textarea>
                        </div>
                        <button class="btn" onclick="adicionarItensLote(this)" style="background: #8e44ad; width: 100%; margin-bottom: 15px;">📥 Inserir no Radar</button>
                        
                        <div class="table-container">
                            <table>
                                <thead><tr><th>Item Monitorado</th><th>Excluir</th></tr></thead>
                                <tbody id="listaItensRadar"></tbody>
                            </table>
                        </div>
                        
                        <!-- BOTÃO DE DISPARO MANUAL -->
                        <button id="btnDisparar" class="btn-disparar" onclick="dispararRadarManual(this)">📲 Disparar Relatório Agora</button>
                    </div>
                </div>

                <!-- COLUNA DIREITA: DASHBOARD ANALÍTICO -->
                <div class="panel" style="min-height: 800px;">
                    <div class="panel-header">
                        <span>🔍 Análise Detalhada do Item</span>
                        <select id="selectAnaliseItem" class="input-text" style="width: 250px; font-weight: bold;" onchange="analisarItemRadar()">
                            <option value="">-- Selecione um item do radar --</option>
                        </select>
                    </div>

                    <div id="painelVazio" style="text-align: center; color: #95a5a6; padding: 50px 20px;">
                        <h2>Nenhum item selecionado</h2>
                        <p>Selecione um código acima para carregar o Raio-X logístico e as tendências.</p>
                    </div>

                    <div id="painelAnalise" style="display: none; animation: slideUpFadeIn 0.4s ease forwards;">
                        <h2 id="tituloItem" style="margin-top: 0; color: #16a085;"></h2>
                        
                        <!-- CARDS LOGÍSTICOS DETALHADOS -->
                        <div class="kpi-grid">
                            <div class="kpi-card" style="border-color: #8e44ad;">
                                <p class="kpi-title">Andamento do Processo</p>
                                <p class="kpi-value" id="cardProcesso">--</p>
                                <p class="kpi-sub" id="cardProcessoSub">--</p>
                            </div>
                            <div class="kpi-card" style="border-color: #27ae60;">
                                <p class="kpi-title">Cobertura de Ata</p>
                                <p class="kpi-value" id="cardAta">--</p>
                                <p class="kpi-sub" id="cardAtaSub">--</p>
                            </div>
                            <div class="kpi-card" style="border-color: #e67e22;">
                                <p class="kpi-title">Físico & Empenhos</p>
                                <p class="kpi-value" id="cardFisico">--</p>
                                <p class="kpi-sub" id="cardFisicoSub">--</p>
                            </div>
                        </div>

                        <!-- GRÁFICOS MQO -->
                        <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px;">📈 Projeções de Consumo (MQO)</h3>
                        <div class="charts-grid">
                            <div class="chart-wrapper">
                                <canvas id="chartMqoPuro"></canvas>
                            </div>
                            <div class="chart-wrapper">
                                <canvas id="chartIntervencao"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            // Sistema de captura visual de erros críticos para não deixar a tela "morta"
            window.onerror = function(msg, url, line) {
                console.error("ERRO CRÍTICO NO SCRIPT: " + msg + " na linha " + line);
            };

            let chartInstancia1 = null;
            let chartInstancia2 = null;

            async function tratarRespostaApi(res) {
                if (!res.ok) {
                    let msgErro = 'Falha de comunicação com a Hera. (Servidor Offline ou Rota não encontrada)';
                    try {
                        const dadosErro = await res.json();
                        if (dadosErro.erro) msgErro = dadosErro.erro;
                        else if (dadosErro.mensagem) msgErro = dadosErro.mensagem;
                    } catch (e) {}
                    throw new Error(msgErro);
                }
                return res.json();
            }

            // ==========================================
            // GESTÃO DOS CONTATOS
            // ==========================================
            window.carregarContatos = async function() {
                try {
                    const res = await fetch('/api/radar/contatos');
                    const contatos = await tratarRespostaApi(res);
                    
                    const tbody = document.getElementById('listaContatos');
                    
                    if (contatos.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#95a5a6;">Nenhum contato cadastrado.</td></tr>';
                        return;
                    }

                    let htmlTabela = '';
                    contatos.forEach(function(c) {
                        htmlTabela += '<tr>' +
                            '<td>' + c.nome_radar + '</td>' +
                            '<td>' + c.telefone_radar + '</td>' +
                            '<td><button class="btn-remover" onclick="removerContato(\\'' + c.telefone_radar + '\\')">✕</button></td>' +
                            '</tr>';
                    });
                    tbody.innerHTML = htmlTabela;

                } catch(e) { 
                    console.error('Erro ao carregar contatos:', e); 
                    document.getElementById('listaContatos').innerHTML = '<tr><td colspan="3" style="color:red; text-align:center;">' + e.message + '</td></tr>';
                }
            };

            window.adicionarContato = async function(btn) {
                const nome = document.getElementById('nomeContato').value.trim();
                const telefone = document.getElementById('telContato').value.trim();
                
                if(!nome || !telefone) return alert('⚠️ Por favor, preencha o Nome e o Telefone.');
                
                const textoOriginal = btn.innerText;
                btn.innerText = '⏳...';
                btn.disabled = true;

                try {
                    const res = await fetch('/api/radar/contatos', { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify({ nome: nome, telefone: telefone }) 
                    });
                    
                    const dados = await tratarRespostaApi(res);
                    alert('✅ ' + (dados.mensagem || 'Contato salvo com sucesso!'));
                    
                    document.getElementById('nomeContato').value = '';
                    document.getElementById('telContato').value = '';
                    carregarContatos();
                } catch(e) { 
                    alert('❌ Erro: ' + e.message); 
                } finally {
                    btn.innerText = textoOriginal;
                    btn.disabled = false;
                }
            };

            window.removerContato = async function(telefone) {
                if(!confirm('Tem certeza que deseja remover este contato do Radar?')) return;
                try {
                    const res = await fetch('/api/radar/contatos/' + telefone, { method: 'DELETE' });
                    await tratarRespostaApi(res);
                    carregarContatos();
                } catch(e) { 
                    alert('❌ Erro ao remover: ' + e.message); 
                }
            };

            // ==========================================
            // GESTÃO DOS ITENS
            // ==========================================
            window.carregarItensRadar = async function() {
                try {
                    const res = await fetch('/api/radar/itens');
                    const itens = await tratarRespostaApi(res);
                    
                    const tbody = document.getElementById('listaItensRadar');
                    const select = document.getElementById('selectAnaliseItem');
                    
                    if (itens.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#95a5a6;">O Radar está vazio.</td></tr>';
                        select.innerHTML = '<option value="">-- Selecione um item do radar --</option>';
                        return;
                    }

                    let htmlTabela = '';
                    let htmlSelect = '<option value="">-- Selecione um item do radar --</option>';
                    
                    itens.forEach(function(i) {
                        // Concatenando a descrição com o código para exibição na tabela e no select
                        const tituloExibicao = i.item + (i.descricao ? ' - ' + i.descricao : '');
                        
                        htmlTabela += '<tr>' +
                            '<td><strong>' + tituloExibicao + '</strong></td>' +
                            '<td><button class="btn-remover" onclick="removerItem(\\'' + i.item + '\\')">✕</button></td>' +
                            '</tr>';
                            
                        htmlSelect += '<option value="' + i.item + '">' + tituloExibicao + '</option>';
                    });

                    tbody.innerHTML = htmlTabela;
                    select.innerHTML = htmlSelect;

                } catch(e) { 
                    console.error('Erro ao carregar itens:', e);
                    document.getElementById('listaItensRadar').innerHTML = '<tr><td colspan="2" style="color:red; text-align:center;">' + e.message + '</td></tr>';
                }
            };

            window.adicionarItensLote = async function(btn) {
                const texto = document.getElementById('inputItens').value;
                const itensRaw = texto.split(/[,\\n]/).map(function(i) { return i.trim().toUpperCase(); }).filter(function(i) { return i; });
                
                if(itensRaw.length === 0) return alert('⚠️ Insira pelo menos um código válido na caixa de texto.');
                
                const textoOriginal = btn.innerHTML;
                btn.innerHTML = '⏳ Inserindo...';
                btn.disabled = true;

                try {
                    const res = await fetch('/api/radar/itens', { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify({ itens: itensRaw }) 
                    });
                    
                    const dados = await tratarRespostaApi(res);
                    alert('✅ ' + (dados.mensagem || 'Itens adicionados com sucesso!'));
                    
                    document.getElementById('inputItens').value = '';
                    carregarItensRadar();
                } catch(e) { 
                    alert('❌ Erro: ' + e.message); 
                } finally {
                    btn.innerHTML = textoOriginal;
                    btn.disabled = false;
                }
            };

            window.removerItem = async function(item) {
                if(!confirm('Tem certeza que deseja remover o item ' + item + ' do radar?')) return;
                try {
                    const res = await fetch('/api/radar/itens/' + item, { method: 'DELETE' });
                    await tratarRespostaApi(res);
                    
                    carregarItensRadar();
                    
                    if (document.getElementById('selectAnaliseItem').value === item) {
                        document.getElementById('selectAnaliseItem').value = '';
                        document.getElementById('painelAnalise').style.display = 'none';
                        document.getElementById('painelVazio').style.display = 'block';
                    }
                } catch(e) { 
                    alert('❌ Erro ao remover item: ' + e.message); 
                }
            };

            // ==========================================
            // DISPARO MANUAL
            // ==========================================
            window.dispararRadarManual = async function(btn) {
                const htmlOriginal = btn.innerHTML;
                btn.innerHTML = '⏳ Cruzando dados e Enviando pelo WhatsApp...';
                btn.disabled = true;

                try {
                    const res = await fetch('/api/radar/disparar', { method: 'POST' });
                    const dados = await tratarRespostaApi(res);
                    alert('✅ ' + dados.mensagem);
                } catch(e) {
                    alert('❌ Erro no Disparo:\\n' + e.message + '\\n\\n(O Whatsapp Web da Hera pode estar desconectado)');
                } finally {
                    btn.innerHTML = htmlOriginal;
                    btn.disabled = false;
                }
            };

            // ==========================================
            // ANÁLISE DO ITEM (DASHBOARD)
            // ==========================================
            window.analisarItemRadar = async function() {
                const codigo = document.getElementById('selectAnaliseItem').value;
                if(!codigo) {
                    document.getElementById('painelAnalise').style.display = 'none';
                    document.getElementById('painelVazio').style.display = 'block';
                    return;
                }

                document.getElementById('painelVazio').style.display = 'none';
                document.getElementById('painelAnalise').style.display = 'block';
                document.getElementById('tituloItem').innerText = '⏳ Carregando dados do item...';

                try {
                    const res = await fetch('/api/radar/analise/' + encodeURIComponent(codigo));
                    const dados = await tratarRespostaApi(res);

                    document.getElementById('tituloItem').innerText = '📦 ' + codigo + ' - ' + dados.detalhesLogisticos.descricao;

                    const logi = dados.detalhesLogisticos;
                    
                    document.getElementById('cardProcesso').innerText = logi.processoAtual || 'Sem Processo';
                    document.getElementById('cardProcessoSub').innerText = 'Mod: ' + logi.modalidade + ' | ' + logi.pregaoAssociado;
                    
                    document.getElementById('cardAta').innerText = 'Saldo: ' + Number(logi.saldoAta).toLocaleString('pt-BR');
                    document.getElementById('cardAtaSub').innerText = 'Validade: ' + logi.validadeAta;

                    document.getElementById('cardFisico').innerText = 'Estoque Atual: ' + Number(logi.saldoAtual).toLocaleString('pt-BR');
                    
                    const txtEmpenho = logi.temEmpenho ? 'SIM' : 'NÃO';
                    const txtAe = logi.temAe ? 'SIM' : 'NÃO';
                    document.getElementById('cardFisicoSub').innerText = 'Empenho Ativo: ' + txtEmpenho + ' | AE Emitida: ' + txtAe + '\\nÚlt. Entrada: ' + logi.ultimaEntrada;

                    desenharGraficos(dados.historicoOriginal, dados.analise, dados.intervencao);

                } catch(e) {
                    console.error(e);
                    document.getElementById('tituloItem').innerText = '❌ Erro: ' + e.message;
                }
            };

            function desenharGraficos(histCompleto, analise, intervencao) {
                if (chartInstancia1) chartInstancia1.destroy();
                if (chartInstancia2) chartInstancia2.destroy();

                if (!histCompleto || histCompleto.length === 0) return;

                const inicioCorte = Math.max(0, histCompleto.length - 12);
                const histVisual = histCompleto.slice(inicioCorte);
                const ajustadoVisual = analise.historicoAjustado.slice(inicioCorte);
                
                const labels1 = histVisual.map(function(h) { return h.data; });
                for (let i = 1; i <= analise.projecaoFutura.length; i++) labels1.push('Mês +' + i);
                
                const dataRealFull1 = [].concat(histVisual.map(function(h) { return h.valor; }), Array(analise.projecaoFutura.length).fill(null));
                const dataTendencia1 = [].concat(ajustadoVisual, Array(analise.projecaoFutura.length).fill(null));
                
                const ultimoAjustado = ajustadoVisual[ajustadoVisual.length - 1];
                const dataProjecao1 = Array(histVisual.length - 1).fill(null);
                dataProjecao1.push(ultimoAjustado);
                dataProjecao1.push.apply(dataProjecao1, analise.projecaoFutura);

                const ctx1 = document.getElementById('chartMqoPuro').getContext('2d');
                chartInstancia1 = new Chart(ctx1, {
                    type: 'line',
                    data: {
                        labels: labels1,
                        datasets: [
                            { label: 'Real', data: dataRealFull1, borderColor: '#2c3e50', borderWidth: 2, tension: 0.1 },
                            { label: 'Reta (MQO)', data: dataTendencia1, borderColor: '#3498db', borderDash: [5, 5], borderWidth: 2 },
                            { label: 'Projeção Pura', data: dataProjecao1, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.2)', borderWidth: 3, fill: true, tension: 0.1 }
                        ]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } } }
                });

                if (intervencao && intervencao.length > 0) {
                    const ctx2 = document.getElementById('chartIntervencao').getContext('2d');
                    const labels2 = ['Hoje'];
                    for (let i = 1; i <= intervencao.length; i++) labels2.push('Mês +' + i);
                    
                    const ultimoReal = histCompleto[histCompleto.length - 1].valor;
                    const dadosIntervencao = [ultimoReal].concat(intervencao);

                    chartInstancia2 = new Chart(ctx2, {
                        type: 'line',
                        data: {
                            labels: labels2,
                            datasets: [{
                                label: 'Projeção c/ Intervenções Logísticas',
                                data: dadosIntervencao,
                                borderColor: '#27ae60',
                                backgroundColor: 'rgba(39, 174, 96, 0.2)',
                                borderWidth: 3, fill: true, tension: 0.2
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } } }
                    });
                }
            }

            // Inicialização Perfeita
            window.onload = function() {
                console.log("Interface do Radar carregada com sucesso.");
                carregarContatos();
                carregarItensRadar();
            };
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderRadar };
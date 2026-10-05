// src/views/ressuprimento.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderRessuprimento(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Plano de Ressuprimento - Hera</title>
        ${estiloCSS}
        <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
        <style>
            body { background-color: #f4f7f6; }
            .container-ressuprimento { max-width: 1400px; margin: 30px auto; padding: 20px; }
            
            .header-panel { background: white; padding: 20px 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; border-left: 5px solid #e67e22; }
            .header-title h1 { margin: 0; color: #2c3e50; font-size: 24px; }
            .header-title p { margin: 5px 0 0 0; color: #7f8c8d; font-size: 14px; }
            
            .filters-bar { display: flex; gap: 15px; align-items: flex-end; background: #fdfdfd; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 25px; border: 1px solid #e2e8f0; flex-wrap: wrap; }
            .filter-group { display: flex; flex-direction: column; flex: 1; min-width: 150px; }
            .filter-group label { font-size: 13px; font-weight: bold; color: #64748b; margin-bottom: 5px; text-transform: uppercase; }
            .filter-group select, .filter-group input { padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 15px; font-weight: bold; color: #2c3e50; outline: none; transition: 0.3s; }
            .filter-group select:focus, .filter-group input:focus { border-color: #e67e22; box-shadow: 0 0 0 3px rgba(230, 126, 34, 0.15); }
            
            .filtro-rapido { background: #fdfdfd; padding: 10px 15px; border-radius: 8px; border: 1px solid #bdc3c7; display: inline-flex; align-items: center; gap: 10px; box-shadow: 2px 2px 5px rgba(0,0,0,0.05); margin-right: 15px; margin-bottom: 10px; }
            .filtro-rapido label { font-size: 14px; font-weight: bold; color: #2c3e50; cursor: pointer; margin: 0; text-transform: none; }
            .filtro-rapido input[type="checkbox"] { transform: scale(1.2); cursor: pointer; margin: 0; }

            .btn-primario { background: linear-gradient(135deg, #e67e22, #d35400); color: white; border: none; padding: 12px 25px; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 10px rgba(230, 126, 34, 0.3); height: 45px; }
            .btn-primario:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(230, 126, 34, 0.4); }
            
            .btn-excel { background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; border: none; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 10px rgba(39, 174, 96, 0.3); display: flex; align-items: center; gap: 8px; height: 45px; }
            .btn-excel:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(39, 174, 96, 0.4); }

            .card-panel { background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); padding: 25px; border: 1px solid #e2e8f0; overflow: hidden; }
            
            .table-responsive { overflow-x: auto; border-radius: 8px; border: 1px solid #e2e8f0; max-height: 600px; overflow-y: auto; }
            table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
            th { background-color: #2c3e50; color: white; padding: 14px 15px; text-align: left; font-weight: bold; position: sticky; top: 0; z-index: 2; white-space: nowrap; }
            td { padding: 14px 15px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
            tr:hover td { background-color: #f8fafc; }
            
            .badge-alerta { background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 12px; border: 1px solid #f87171; display: inline-block; margin-top: 4px; }
            .badge-dias { background: #fef3c7; color: #b45309; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 12px; border: 1px solid #fbbf24; }
            .badge-dias.critico { background: #fee2e2; color: #b91c1c; border-color: #f87171; }
            
            .btn-copiar { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; white-space: nowrap; }
            .btn-copiar:hover { background: #e2e8f0; color: #1e293b; }

            #loadingOverlay { display: none; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: #e67e22; }
            .spinner { border: 4px solid rgba(230, 126, 34, 0.1); width: 40px; height: 40px; border-radius: 50%; border-left-color: #e67e22; animation: spin 1s linear infinite; margin-bottom: 15px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div class="container-ressuprimento">
            <div class="header-panel">
                <div class="header-title">
                    <h1>🛒 Plano de Ressuprimento (Sugestões de Compra)</h1>
                    <p>Cruzamento automático do MQO com os saldos virtuais e limites da Ata de Registro de Preços.</p>
                </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; margin-bottom: -15px; padding: 0 20px;">
                <div class="filtro-rapido">
                    <input type="checkbox" id="chkIgnorar116" onchange="carregarDados()">
                    <label for="chkIgnorar116">Ignorar Grupos 116 e 143 (Família C)</label>
                </div>
                <div class="filtro-rapido">
                    <input type="checkbox" id="chkIgnorarSemDemanda" checked onchange="carregarDados()">
                    <label for="chkIgnorarSemDemanda">Ignorar Material Sem Demanda</label>
                </div>
                <div class="filtro-rapido">
                    <input type="checkbox" id="chkIgnorarAvn" onchange="carregarDados()">
                    <label for="chkIgnorarAvn">Ignorar itens AVN</label>
                </div>
            </div>

            <div class="filters-bar">
                <div class="filter-group" style="flex: 2;">
                    <label>Planejador:</label>
                    <select id="selectPlanejador" onchange="carregarDados()">
                        <option value="Todos">Todos os Planejadores</option>
                        <!-- Preenchido dinamicamente -->
                    </select>
                </div>
                <div class="filter-group">
                    <label>Código do Item:</label>
                    <input type="text" id="inputCodigo" placeholder="Ex: 00508" onkeypress="if(event.key === 'Enter') carregarDados()">
                </div>
                <div class="filter-group">
                    <label>Meses de Cobertura:</label>
                    <input type="number" id="inputMeses" min="1" max="12" value="6" onchange="carregarDados()">
                </div>
                <button class="btn-primario" onclick="carregarDados()">🔄 Atualizar</button>
                <button class="btn-excel" onclick="exportarExcel()" id="btnExportar" disabled>📊 Exportar</button>
            </div>

            <div id="loadingOverlay">
                <div class="spinner"></div>
                <h3 style="margin: 0; color: #2c3e50;">Calculando necessidades e limites...</h3>
                <p style="color: #7f8c8d; margin-top: 5px;">Aguarde, a Hera está cruzando as Atas com a tendência de consumo.</p>
            </div>

            <div id="conteudoPainel" style="display: none;">
                <div class="card-panel">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h2 style="margin: 0; color: #2c3e50; font-size: 18px;">📋 Sugestões de Pedido (<span id="totalItens">0</span> itens críticos)</h2>
                        <span style="font-size: 13px; color: #7f8c8d;">Ordenado por proximidade de ruptura</span>
                    </div>
                    
                    <div class="table-responsive">
                        <table id="tabelaSugestoes">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Descrição / Demanda</th>
                                    <th>Status do Estoque</th>
                                    <th>Dados da Ata</th>
                                    <th>Sugestão de Pedido</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="tabelaBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let dadosGerais = [];
            let planejadoresCarregados = false;

            async function carregarDados() {
                const planejador = document.getElementById('selectPlanejador').value;
                const meses = document.getElementById('inputMeses').value || 6;
                const codigo = document.getElementById('inputCodigo').value.trim();
                const ignorar116 = document.getElementById('chkIgnorar116').checked;
                const ignorarSemDemanda = document.getElementById('chkIgnorarSemDemanda').checked;
                const ignorarAvn = document.getElementById('chkIgnorarAvn').checked;

                document.getElementById('conteudoPainel').style.display = 'none';
                document.getElementById('loadingOverlay').style.display = 'flex';
                document.getElementById('btnExportar').disabled = true;

                try {
                    const resposta = await fetch(\`/api/ressuprimento/dados?planejador=\${encodeURIComponent(planejador)}&meses=\${meses}&codigo=\${encodeURIComponent(codigo)}&ignorar116=\${ignorar116}&ignorarSemDemanda=\${ignorarSemDemanda}&ignorarAvn=\${ignorarAvn}\`);
                    const dados = await resposta.json();

                    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao buscar dados.');

                    dadosGerais = dados;
                    
                    if (!planejadoresCarregados && planejador === 'Todos' && !codigo) {
                        popularDropdownPlanejadores(dados);
                        planejadoresCarregados = true;
                    }

                    renderizarTabela(dados);
                    
                    document.getElementById('totalItens').innerText = dados.length;
                    document.getElementById('conteudoPainel').style.display = 'block';
                    if (dados.length > 0) document.getElementById('btnExportar').disabled = false;

                } catch (erro) {
                    console.error(erro);
                    alert('❌ ' + erro.message);
                } finally {
                    document.getElementById('loadingOverlay').style.display = 'none';
                }
            }

            function popularDropdownPlanejadores(dados) {
                const select = document.getElementById('selectPlanejador');
                const planejadores = new Set();
                dados.forEach(d => {
                    if (d.planejador && d.planejador !== 'Sem Dono') {
                        planejadores.add(d.planejador);
                    }
                });

                const optionAtual = select.value;
                select.innerHTML = '<option value="Todos">Todos os Planejadores</option>';
                
                Array.from(planejadores).sort().forEach(p => {
                    const option = document.createElement('option');
                    option.value = p;
                    option.innerText = p;
                    select.appendChild(option);
                });
                
                select.value = optionAtual;
            }

            function formatarMoeda(valor) {
                return Number(valor).toLocaleString('pt-BR');
            }

            function renderizarTabela(dados) {
                const tbody = document.getElementById('tabelaBody');
                let html = '';

                if (dados.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color:#7f8c8d;">Nenhum item requer ressuprimento imediato para os filtros selecionados. 🎉</td></tr>';
                    return;
                }

                dados.forEach((item, index) => {
                    const classeDias = item.diasCoberturaVirtual <= 15 ? 'critico' : '';
                    
                    let alertaAtaHtml = '';
                    if (item.alertaAta) {
                        alertaAtaHtml = \`<br><span class="badge-alerta">⚠️ Limitado pelo saldo da Ata (Faltam \${formatarMoeda(item.necessidadeOriginal - item.pedidoSugerido)} und)</span>\`;
                    }

                    const jsonParaCopia = encodeURIComponent(JSON.stringify(item));

                    html += \`
                        <tr>
                            <td>
                                <strong style="color: #2c3e50; font-size: 15px;">\${item.codigo}</strong><br>
                                <span style="font-size: 11px; color: #94a3b8;">\${item.planejador}</span>
                            </td>
                            <td style="max-width: 250px;">
                                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="\${item.descricao}">
                                    \${item.descricao}
                                </div>
                                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
                                    Notes: <strong>\${item.solicitacao}</strong> | Consumo: \${formatarMoeda(item.consumoConsiderado)}/mês
                                </div>
                            </td>
                            <td>
                                <div>Virtual: <strong>\${formatarMoeda(item.estoqueVirtual)}</strong> und</div>
                                <div style="font-size: 11px; color: #94a3b8;">(Físico: \${formatarMoeda(item.saldoAtual)} | A Receber: \${formatarMoeda(item.aReceber)} | Ata: \${formatarMoeda(item.saldoAta)})</div>
                                <div style="margin-top: 5px;">
                                    <span class="badge-dias \${classeDias}">Ruptura geral em \${item.diasCoberturaVirtual} dias</span>
                                </div>
                            </td>
                            <td>
                                <div>Ata: <strong>\${item.processoAta}</strong></div>
                                <div style="font-size: 12px; color: #64748b;">Saldo: \${formatarMoeda(item.saldoAta)} und</div>
                                <div style="font-size: 12px; color: #64748b;">Vence em: \${item.vencimentoAta}</div>
                            </td>
                            <td style="background-color: #f8fafc; border-left: 2px solid #e2e8f0;">
                                <strong style="font-size: 18px; color: #d35400;">\${formatarMoeda(item.pedidoSugerido)}</strong> und
                                \${alertaAtaHtml}
                            </td>
                            <td>
                                <button class="btn-copiar" onclick="copiarTexto('\${jsonParaCopia}')">📋 Copiar Resumo</button>
                            </td>
                        </tr>
                    \`;
                });

                tbody.innerHTML = html;
            }

            window.copiarTexto = function(jsonEncoded) {
                try {
                    const item = JSON.parse(decodeURIComponent(jsonEncoded));
                    const limiteMsg = item.alertaAta ? \`\\n⚠️ ATENÇÃO: A necessidade real para \${item.mesesCoberturaAlvo} meses é de \${item.necessidadeOriginal} und, mas a sugestão foi limitada ao saldo remanescente da ata.\` : '';
                    
                    const texto = \`⚠️ *\${item.codigo}* - *\${item.descricao.trim()}* (Notes: \${item.solicitacao})
Estoque Físico: \${item.saldoAtual} und | Estoque Virtual (A Receber + Ata): \${item.estoqueVirtual} und (Ruptura estimada em \${item.diasCoberturaVirtual} dias)
📦 *Ação Sugerida:* Emissão de pedido de *\${item.pedidoSugerido} und* para garantir cobertura aproximada de \${item.mesesCoberturaAlvo} meses.
📋 *Ata:* \${item.processoAta} (Válida até \${item.vencimentoAta} - Saldo restante antes do pedido: \${item.saldoAta} und)\${limiteMsg}\`;

                    navigator.clipboard.writeText(texto).then(() => {
                        alert('Resumo copiado para a área de transferência!');
                    }).catch(err => {
                        console.error('Erro ao copiar:', err);
                        alert('Falha ao copiar texto.');
                    });
                } catch (e) {
                    console.error('Erro no parse do JSON:', e);
                }
            };

            window.exportarExcel = function() {
                if (!dadosGerais || dadosGerais.length === 0) return alert('Não há dados para exportar.');
                
                const dadosPlanilha = dadosGerais.map(i => ({
                    'Planejador': i.planejador,
                    'Código': i.codigo,
                    'Descrição': i.descricao,
                    'Solicitação (Notes)': i.solicitacao,
                    'Saldo Físico': i.saldoAtual,
                    'A Receber (Empenhos)': i.aReceber,
                    'Estoque Virtual': i.estoqueVirtual,
                    'Cobertura (Dias)': i.diasCoberturaVirtual,
                    'Consumo Base/Mês': i.consumoConsiderado,
                    'Processo Ata': i.processoAta,
                    'Vencimento Ata': i.vencimentoAta,
                    'Saldo Atual Ata': i.saldoAta,
                    'Sugestão de Pedido (Und)': i.pedidoSugerido,
                    'Meses Cobertura Alvo': i.mesesCoberturaAlvo,
                    'Necessidade Original (Sem Trava)': i.necessidadeOriginal,
                    'Limitado pela Ata?': i.alertaAta ? 'SIM' : 'NÃO',
                    'Tendência Acelerada (MQO)?': i.isTendenciaAcelerada ? 'SIM' : 'NÃO'
                }));

                const worksheet = XLSX.utils.json_to_sheet(dadosPlanilha);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Plano_Ressuprimento");

                const dataHoje = new Date().toISOString().split('T')[0];
                const planejadorLabel = document.getElementById('selectPlanejador').value.replace(/[^a-zA-Z0-9]/g, '');
                
                XLSX.writeFile(workbook, \`Plano_Compras_\${planejadorLabel}_\${dataHoje}.xlsx\`);
            };

            window.onload = () => {
                carregarDados();
            };
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderRessuprimento };
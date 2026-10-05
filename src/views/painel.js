// src/views/painel.js
const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderTabelaConsultas(historico = []) {
    let linhasTabela = '';
    historico.forEach(item => {
        linhasTabela += `<tr><td>${item.data}</td><td>${item.telefone}</td><td>${item.termo}</td></tr>`;
    });
    return `
        <div class="card" style="border-left: 5px solid #8e44ad;">
            <h2 style="margin-top: 0; color: #2c3e50;">Últimas Consultas</h2>
            <table style="background: #fcfcfc; border-radius: 8px; overflow: hidden; width: 100%;">
                <tr>
                    <th style="background: #ecf0f1; text-align: left; padding: 10px;">Data/Hora</th>
                    <th style="background: #ecf0f1; text-align: left; padding: 10px;">Número</th>
                    <th style="background: #ecf0f1; text-align: left; padding: 10px;">Termo Buscado</th>
                </tr>
                ${linhasTabela || '<tr><td colspan="3" style="text-align: center; color: #7f8c8d; padding: 10px;">Nenhuma consulta registrada até o momento.</td></tr>'}
            </table>
        </div>
    `;
}

function renderBancoDados() {
    return `
        <div class="card" style="background: #fdf5e6; border-left: 5px solid #f39c12; margin-top: 20px;">
            <h2 style="margin-top: 0; color: #d35400;">📥 Importação Diária (Banco de Dados)</h2>
            <p style="color: #555;">Selecione os arquivos conforme baixados. Não é necessário converter.</p>
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Arquivo de Empenhos (.csv ou .xlsx):</label>
                <input type="file" id="fileEmpenhos" accept=".csv, .xlsx" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Planilha Saldo abaixo de 90 dias (.xlsx):</label>
                <input type="file" id="filePlanilha" accept=".xlsx" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Movimentação Anos Anteriores (.xlsx ou .csv):</label>
                <input type="file" id="fileMovimentacao" accept=".xlsx, .csv" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Tabela PDM (.xlsx ou .csv):</label>
                <input type="file" id="filePdm" accept=".xlsx, .csv" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Maior Consumidor (Cotas) (.xlsx ou .csv):</label>
                <input type="file" id="fileMaiorConsumidor" accept=".xlsx, .csv" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
            </div>

            <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #2c3e50;">🕰️ Importação de Histórico Retroativo</h3>
            <p style="color: #555; font-size: 14px;">Utilize esta área apenas se quiser carregar uma foto antiga do estoque para alimentar o histórico de tendências.</p>

            <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                <div style="flex: 1;">
                    <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Planilha Antiga (.csv ou .xlsx):</label>
                    <input type="file" id="fileHistorico" accept=".csv, .xlsx" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
                </div>
                <div style="flex: 1;">
                    <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Data (Opcional - Hera lê o nome do arquivo):</label>
                    <input type="date" id="dataRetroativa" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
                </div>
            </div>

            <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #2c3e50;">📁 Importação DFD (PCA e PNCP em Massa)</h3>
            <p style="color: #555; font-size: 14px;">Selecione múltiplos arquivos simultaneamente. O ano e o formato serão validados de forma inteligente.</p>

            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Arquivos PCA (.csv ou .xlsx):</label>
                <input type="file" id="filePca" accept=".csv, .xlsx" multiple style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Arquivos PNCP (.csv ou .xlsx):</label>
                <input type="file" id="filePncp" accept=".csv, .xlsx" multiple style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; background: #fff; width: 100%;">
            </div>

            <button class="btn" onclick="importarArquivosSelecionados()" id="btnImportarDb" style="background-color: #27ae60; font-size: 15px; padding: 12px 20px; box-shadow: 0 4px 6px rgba(39, 174, 96, 0.3); transition: 0.3s; margin-top: 10px;">🚀 Importar para .db</button>
            <pre id="statusImportacao" style="margin-top: 15px; font-weight: bold; background: #fff; padding: 15px; border-radius: 8px; display: none; white-space: pre-wrap; font-family: monospace; border: 1px solid #ddd; color: #333;"></pre>
        </div>
    `;
}

function renderCartaoCorporativo() {
    return `
        <div class="card" style="background: #eaf2f8; border-left: 5px solid #2980b9; margin-top: 20px;">
            <h2 style="margin-top: 0; color: #2980b9;">💳 Lançamento - Cartão Corporativo (Dispensa 75-II)</h2>
            <p style="color: #555;">Registre aqui as compras feitas via cartão de crédito corporativo. O ano corrente será atribuído automaticamente para controle do teto do PDM.</p>
            
            <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                <div style="flex: 1;">
                    <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Código INCA (Item):</label>
                    <input type="text" id="cartaoCodItem" placeholder="Ex: 1509 ou A01485" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; width: 100%; box-sizing: border-box;">
                </div>
                <div style="flex: 1;">
                    <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Valor Total (R$):</label>
                    <input type="text" id="cartaoValor" placeholder="Ex: 1250,50" style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; width: 100%; box-sizing: border-box;">
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #2c3e50;">Fornecedor:</label>
                <input type="text" id="cartaoFornecedor" placeholder="Nome da empresa fornecedora..." style="padding: 8px; border: 1px solid #bdc3c7; border-radius: 5px; width: 100%; box-sizing: border-box;">
            </div>

            <button class="btn" onclick="lancarCompraCartao()" id="btnLancarCartao" style="background-color: #2980b9; font-size: 15px; padding: 12px 20px; box-shadow: 0 4px 6px rgba(41, 128, 185, 0.3); transition: 0.3s; margin-top: 10px;">💾 Salvar Lançamento</button>
        </div>
    `;
}

function renderStatus({ statusRobo, qrCodeImagem, isAdmin }) {
    // BOTÃO EXCLUSIVO PARA O ADMINISTRADOR MESTRE
    const botaoReset = isAdmin ? `
        <div style="margin-top: 30px;">
            <button class="btn" onclick="reiniciarHeraFull()" style="background-color: #e74c3c; font-size: 15px; padding: 12px 20px; box-shadow: 0 4px 6px rgba(231, 76, 60, 0.3); transition: 0.3s;">🔄 Reiniciar Hera (Reset Completo)</button>
        </div>
    ` : '';

    return `
        <div class="card" style="text-align: center; padding: 40px 20px; border-bottom: 5px solid #2ecc71;">
            <h2 style="font-size: 26px; color: #2c3e50; margin-top: 0;">🤖 Status da Hera: <span style="color: #27ae60; font-weight: bold;">${statusRobo || 'Iniciando...'}</span></h2>
            ${qrCodeImagem 
                ? `<div style="margin: 25px auto; padding: 15px; background: white; display: inline-block; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);"><img src="${qrCodeImagem}" alt="QR Code" style="max-width: 300px; border-radius: 10px;"></div>` 
                : '<p style="font-size: 18px; color: #7f8c8d; margin-top: 20px;">✅ Conectada e operando.</p>'}
            
            ${botaoReset}
        </div>
    `;
}

function renderPainel(dados = {}) {
    const { tipoPagina = 'status', historico = [], statusRobo = '', qrCodeImagem = '', usuario } = dados;
    let conteudo = '';
    
    // Verifica se quem está carregando a página é o Admin
    const isAdmin = usuario && (usuario.is_admin === 1 || usuario.login === 'admin');
    
    if (tipoPagina === 'importacao') {
        conteudo = renderBancoDados() + renderCartaoCorporativo();
    } else if (tipoPagina === 'consultas') {
        conteudo = renderTabelaConsultas(historico);
    } else {
        conteudo = renderStatus({ statusRobo, qrCodeImagem, isAdmin });
    }

    const metaRefresh = tipoPagina === 'status' ? '<meta http-equiv="refresh" content="3">' : '';

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        ${metaRefresh}
        <title>Painel da Hera</title>
        ${estiloCSS}
    </head>
    <body>
        ${gerarNavbar(usuario)}
        <div class="container">
            <h1 style="color: #2c3e50;">✨ Painel de Controle - Hera</h1>
            ${conteudo}
        </div>

        <script>
            async function importarArquivosSelecionados() {
                const fEmp = document.getElementById('fileEmpenhos') ? document.getElementById('fileEmpenhos').files[0] : null;
                const fPlan = document.getElementById('filePlanilha') ? document.getElementById('filePlanilha').files[0] : null;
                const fMov = document.getElementById('fileMovimentacao') ? document.getElementById('fileMovimentacao').files[0] : null;
                const fPdm = document.getElementById('filePdm') ? document.getElementById('filePdm').files[0] : null;
                const fMaiorConsumidor = document.getElementById('fileMaiorConsumidor') ? document.getElementById('fileMaiorConsumidor').files[0] : null;
                const fHist = document.getElementById('fileHistorico') ? document.getElementById('fileHistorico').files[0] : null;
                const dataHist = document.getElementById('dataRetroativa') ? document.getElementById('dataRetroativa').value : null;
                const fPcaFiles = document.getElementById('filePca') ? document.getElementById('filePca').files : [];
                const fPncpFiles = document.getElementById('filePncp') ? document.getElementById('filePncp').files : [];

                if (!fEmp && !fPlan && !fMov && !fPdm && !fMaiorConsumidor && !fHist && fPcaFiles.length === 0 && fPncpFiles.length === 0) {
                    return alert('Selecione ao menos um arquivo!');
                }

                const btn = document.getElementById('btnImportarDb');
                btn.disabled = true; 
                btn.innerHTML = '⏳ Processando um a um...';
                
                const statusConsole = document.getElementById('statusImportacao');
                statusConsole.style.display = 'block';
                statusConsole.innerText = 'Iniciando importação sequencial para não sobrecarregar a memória...\\n\\n';

                const toBase64 = (f) => new Promise(res => { 
                    const r = new FileReader(); 
                    r.onload = () => res({ nome: f.name, dados: r.result.split(',')[1] }); 
                    r.readAsDataURL(f); 
                });

                async function enviarLote(payloadParcial, nomeLote) {
                    statusConsole.innerText += \`⏳ Enviando: \${nomeLote}...\\n\`;
                    try {
                        const resp = await fetch('/api/db/importar-arquivos', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payloadParcial) });
                        if (!resp.ok) throw new Error('Falha de resposta do servidor.');
                        const data = await resp.json();
                        statusConsole.innerText += \`✅ \${(data.detalhes || []).join('\\n')}\\n\\n\`;
                    } catch (e) {
                        statusConsole.innerText += \`❌ Erro no lote \${nomeLote}: \${e.message}\\n\\n\`;
                    }
                }

                try {
                    if (fEmp) await enviarLote({ empenhos: await toBase64(fEmp) }, 'Empenhos');
                    if (fPlan) await enviarLote({ planilha: await toBase64(fPlan) }, 'Planilha Saldo');
                    if (fMov) await enviarLote({ movimentacao: await toBase64(fMov) }, 'Movimentação Anos Anteriores');
                    if (fPdm) await enviarLote({ pdm: await toBase64(fPdm) }, 'Tabela PDM');
                    if (fMaiorConsumidor) await enviarLote({ maiorConsumidor: await toBase64(fMaiorConsumidor) }, 'Maior Consumidor (Cotas)');
                    if (fHist) await enviarLote({ historico: { nome: fHist.name, dados: (await toBase64(fHist)).dados, data: dataHist } }, 'Histórico Retroativo');

                    if (fPcaFiles.length > 0) {
                        for (let i = 0; i < fPcaFiles.length; i++) {
                            await enviarLote({ pcaList: [await toBase64(fPcaFiles[i])] }, \`PCA (\${i + 1}/\${fPcaFiles.length})\`);
                        }
                    }

                    if (fPncpFiles.length > 0) {
                        for (let i = 0; i < fPncpFiles.length; i++) {
                            await enviarLote({ pncpList: [await toBase64(fPncpFiles[i])] }, \`PNCP (\${i + 1}/\${fPncpFiles.length})\`);
                        }
                    }

                    statusConsole.innerText += '🎉 Todas as importações foram concluídas!';
                } catch (e) {
                    alert('Erro inesperado: ' + e.message);
                } finally {
                    btn.disabled = false; btn.innerHTML = '🚀 Importar para .db';
                }
            }
            
            async function lancarCompraCartao() {
                const codItem = document.getElementById('cartaoCodItem').value;
                const valorTotal = document.getElementById('cartaoValor').value;
                const fornecedor = document.getElementById('cartaoFornecedor').value;

                if (!codItem || !valorTotal || !fornecedor) return alert('Por favor, preencha todos os campos.');

                const btn = document.getElementById('btnLancarCartao');
                const textoOriginal = btn.innerHTML;
                btn.innerHTML = '⏳ Salvando lançamento...';
                btn.disabled = true;

                try {
                    const resp = await fetch('/api/cartao/cadastrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codItem, valorTotal, fornecedor }) });
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data.mensagem || data.erro || 'Erro desconhecido ao salvar.');
                    alert(data.mensagem);
                    document.getElementById('cartaoCodItem').value = ''; document.getElementById('cartaoValor').value = ''; document.getElementById('cartaoFornecedor').value = '';
                } catch (e) {
                    alert('❌ Falha ao gravar lançamento: ' + e.message);
                } finally {
                    btn.innerHTML = textoOriginal; btn.disabled = false;
                }
            }

            async function reiniciarHeraFull() {
                if(!confirm('Tem certeza que deseja executar o protocolo de reset completo da Hera?')) return;
                try {
                    const resp = await fetch('/api/restart-hera', { method: 'POST' });
                    const data = await resp.json();
                    alert(data.mensagem);
                    setTimeout(() => { window.location.reload(); }, 10000);
                } catch (e) {
                    alert('Comando enviado! O servidor já está reiniciando e cortou a conexão.');
                    setTimeout(() => { window.location.reload(); }, 10000);
                }
            }
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderPainel };
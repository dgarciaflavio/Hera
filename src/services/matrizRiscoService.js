// src/services/matrizRiscoService.js
const fs = require('fs');
const path = require('path');
const { getDbConnection } = require('./database');
const { analisarTendenciaEProjetar } = require('./projecao');

// Garante que o diretório de cache existe
const cacheDir = path.join(process.cwd(), 'data', 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

function executarQuerySql(query, parametros = []) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(query, parametros, (err, rows) => {
            db.close();
            if (err) {
                if (err.message.includes('no such table')) resolve([]);
                else reject(err);
            }
            else resolve(rows || []);
        });
    });
}

// Trata números no padrão brasileiro
function paraNumero(valor, padrao = 0) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return padrao;
    
    let texto = String(valor).trim();
    
    if (texto.includes('.') && texto.includes(',')) {
        texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',')) {
        texto = texto.replace(',', '.');
    }
    
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : padrao;
}

function possuiAERelacionada(linha) {
    return Object.keys(linha).some(chave => {
        const chaveNormalizada = String(chave || '').trim().toUpperCase();
        if (!chaveNormalizada.startsWith('AE') && !chaveNormalizada.includes('SOLICITA')) {
            return false;
        }
        if (chaveNormalizada.includes('QTDE') || chaveNormalizada.includes('EMPENHAR') || chaveNormalizada === 'NOTES' || chaveNormalizada.includes('NOTES EM ANDAMENTO')) {
            return false;
        }
        const valor = linha[chave];
        return valor !== undefined && valor !== null && String(valor).trim() !== '' && String(valor).trim() !== '0' && String(valor).trim().toUpperCase() !== 'N/A';
    });
}

// Limpa arquivos de cache antigos
function limparCacheAntigo(prefixoAtual) {
    try {
        const arquivos = fs.readdirSync(cacheDir);
        arquivos.forEach(arquivo => {
            if (arquivo.startsWith('matriz_') && !arquivo.includes(prefixoAtual)) {
                fs.unlinkSync(path.join(cacheDir, arquivo));
            }
        });
    } catch (e) {
        console.error('Erro ao limpar cache antigo:', e);
    }
}

async function getDadosMatrizRisco(local = 'GERAL', ignorar116 = true) {
    try {
        const resMaxData = await executarQuerySql(`SELECT MAX(data_historico) as ultima_data FROM historico_estoque`);
        const dataMaisRecente = resMaxData.length > 0 ? resMaxData[0].ultima_data : null;

        if (!dataMaisRecente) {
            return { kpis: { quedaAcelerada: 0, estavel: 0, alta: 0 }, grafico: [], tabela: [] };
        }

        // CACHE FÍSICO v5
        const nomeArquivoCache = `matriz_${local}_116${ignorar116}_${dataMaisRecente}_v5.json`;
        const caminhoCache = path.join(cacheDir, nomeArquivoCache);

        if (fs.existsSync(caminhoCache)) {
            console.log(`⚡ Carregando Matriz de Risco do CACHE (${nomeArquivoCache})...`);
            return JSON.parse(fs.readFileSync(caminhoCache, 'utf8'));
        }

        // SINAL DE BLOQUEIO ATIVADO
        global.calculandoMQO = true;
        
        console.log(`⚙️ Calculando Matriz de Risco do zero (Busca exata de colunas + Filtro de Inconsistências)...`);

        const snapshot = await executarQuerySql(`
            SELECT * FROM historico_estoque 
            WHERE data_historico = '${dataMaisRecente}'
        `);

        const itensProcessados = new Map();

        // RESPIRO FORTE PARA REDE: setTimeout ao invés de setImmediate
        for (let i = 0; i < snapshot.length; i++) {
            if (i % 100 === 0) await new Promise(resolve => setTimeout(resolve, 5));

            const linha = snapshot[i];
            let item = '';
            let descricao = '';
            let criticidade = '';
            let grupoEstoque = '';
            let localLinha = '';
            let saldoAtual = 0;
            let cmm12 = 0;
            let temEmpenho = false;
            let temAE = false;

            for (const k in linha) {
                const low = k.trim().toLowerCase();
                const valStr = String(linha[k] || '').trim();

                if (low === 'item' || low === 'codigo') item = valStr.toUpperCase();
                else if (low.includes('descri')) descricao = valStr;
                else if (low === 'criticidade' || low === 'zyz' || low === 'xyz' || low === 'curva') criticidade = valStr.toUpperCase();
                else if (low === 'grupo_de_estoque' || low === 'grupo de estoque') grupoEstoque = valStr;
                else if (low === 'local' || low === 'c_1') localLinha = valStr.toUpperCase();
                
                else if (low === 'saldo_atual') saldoAtual = paraNumero(valStr, 0); 
                else if (low === 'cmm12' || low === 'cmm') cmm12 = paraNumero(valStr, 0); 
                
                else if (low === 'num.empenho' || low === 'num_empenho') {
                    if (valStr && valStr !== '0' && valStr.toUpperCase() !== 'N/A') temEmpenho = true;
                }
            }

            if (!item) continue;

            temAE = possuiAERelacionada(linha);

            if (String(ignorar116) === 'true' && grupoEstoque.includes('116')) continue;
            if (local !== 'GERAL' && localLinha !== local) continue;

            if (cmm12 === 0 && saldoAtual <= 0) continue;

            if (!itensProcessados.has(item)) {
                itensProcessados.set(item, {
                    item, descricao, criticidade, saldoAtual, temEmpenho, temAE
                });
            } else {
                const existente = itensProcessados.get(item);
                existente.saldoAtual += saldoAtual;
                existente.temEmpenho = existente.temEmpenho || temEmpenho;
                existente.temAE = existente.temAE || temAE;
            }
        }

        const itensValidosIds = Array.from(itensProcessados.keys());
        if (itensValidosIds.length === 0) {
            global.calculandoMQO = false;
            return { kpis: { quedaAcelerada: 0, estavel: 0, alta: 0 }, grafico: [], tabela: [] };
        }

        const historicoRaw = await executarQuerySql(`SELECT * FROM historico_estoque ORDER BY data_historico ASC`);
        const historicoPorItem = {};

        // RESPIRO FORTE PARA REDE
        for (let i = 0; i < historicoRaw.length; i++) {
            if (i % 200 === 0) await new Promise(resolve => setTimeout(resolve, 5));
            
            const linha = historicoRaw[i];
            let itemHist = '';
            let saldoHist = 0;
            let localLinhaHist = '';
            
            for (const k in linha) {
                const low = k.trim().toLowerCase();
                if (low === 'item' || low === 'codigo') itemHist = String(linha[k] || '').trim().toUpperCase();
                else if (low === 'saldo_atual') saldoHist = paraNumero(linha[k], 0);
                else if (low === 'local' || low === 'c_1') localLinhaHist = String(linha[k] || '').trim().toUpperCase();
            }

            if (!itemHist || !itensProcessados.has(itemHist)) continue; 
            if (local !== 'GERAL' && localLinhaHist !== local) continue;

            const dataHist = linha.data_historico;

            if (!historicoPorItem[itemHist]) historicoPorItem[itemHist] = {};
            if (!historicoPorItem[itemHist][dataHist]) historicoPorItem[itemHist][dataHist] = 0;
            
            historicoPorItem[itemHist][dataHist] += saldoHist;
        }

        const historicoArrayPorItem = {};
        const chavesHistorico = Object.keys(historicoPorItem);
        for (let i = 0; i < chavesHistorico.length; i++) {
            if (i % 100 === 0) await new Promise(resolve => setTimeout(resolve, 5));
            const item = chavesHistorico[i];
            const datas = Object.keys(historicoPorItem[item]).sort();
            historicoArrayPorItem[item] = datas.map(d => ({ data: d, valor: historicoPorItem[item][d] }));
        }

        let kpis = { quedaAcelerada: 0, estavel: 0, alta: 0 };
        let grafico = [];
        let tabela = [];

        const itensProcessadosArray = Array.from(itensProcessados.values());
        
        // RESPIRO MAIS FREQUENTE PARA O CÁLCULO PESADO
        for (let i = 0; i < itensProcessadosArray.length; i++) {
            // Pausa a cada 20 itens calculados, dando tempo do Baileys confirmar recebimento pro celular!
            if (i % 20 === 0) await new Promise(resolve => setTimeout(resolve, 8));
            
            const info = itensProcessadosArray[i];
            if (!info.criticidade) continue;

            const hist = historicoArrayPorItem[info.item] || [];
            const ultimos = hist.slice(-6);

            if (ultimos.length > 1) {
               const analise = analisarTendenciaEProjetar(ultimos, 1);
			   const beta = typeof analise.coeficienteAngular_b === 'number' ? analise.coeficienteAngular_b : 0;

                let y = 0;
                let critLabel = info.criticidade;

                if (info.criticidade === 'Z') y = 3;
                else if (info.criticidade === 'Y') y = 2;
                else if (info.criticidade === 'X') y = 1;
                else critLabel = 'N/A';

                if (y > 0) {
                    if (beta <= -0.1) kpis.quedaAcelerada++;
                    else if (beta >= 0.1) kpis.alta++;
                    else kpis.estavel++;

                    grafico.push({
                        x: beta,
                        y: y,
                        item: info.item,
                        descricao: info.descricao,
                        criticidadeLabel: critLabel
                    });

                    if ((y === 3 || y === 2) && beta < 0) {
                        let projecaoNum = analise.projecoes && analise.projecoes.length > 0 ? analise.projecoes[0].valor : 0;
                        projecaoNum = Math.max(0, Math.round(projecaoNum));

                        tabela.push({
                            criticidade: critLabel,
                            item: info.item,
                            descricao: info.descricao,
                            saldoAtual: info.saldoAtual,
                            mqoBeta: beta,
                            projecaoM1: projecaoNum,
                            temEmpenho: info.temEmpenho,
                            temAE: info.temAE,
                            pesoSort: (y * 1000) + Math.abs(beta) 
                        });
                    }
                }
            }
        }

        tabela.sort((a, b) => b.pesoSort - a.pesoSort);
        const resultadoFinal = { kpis, grafico, tabela };

        fs.writeFileSync(caminhoCache, JSON.stringify(resultadoFinal), 'utf8');
        limparCacheAntigo(`${dataMaisRecente}_v5`);

        // SINAL DE BLOQUEIO DESATIVADO
        global.calculandoMQO = false;
        
        return resultadoFinal;

    } catch (erro) {
        global.calculandoMQO = false; // Garante a liberação se der erro
        console.error('Erro ao gerar dados da Matriz de Risco:', erro);
        throw erro;
    }
}

module.exports = {
    getDadosMatrizRisco
};
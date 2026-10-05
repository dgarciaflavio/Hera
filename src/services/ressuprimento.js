// src/services/ressuprimento.js
const { getDbConnection } = require('./database');

function executarQuerySql(query, parametros = []) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(query, parametros, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function limparRefParaPlanejador(texto) {
    if (!texto) return '';
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toUpperCase();
}

// FUNÇÃO BLINDADA: Remove letras, espaços e símbolos (ex: "730 und" vira 730)
function paraNumero(valor, padrao = 0) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return padrao;
    
    let texto = String(valor).replace(/[^\d.,-]/g, '').trim();
    if (!texto) return padrao;
    
    if (texto.includes('.') && texto.includes(',')) {
        texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',')) {
        texto = texto.replace(',', '.');
    } else if (texto.includes('.')) {
        const partes = texto.split('.');
        if (partes.length > 2 || partes[partes.length - 1].length === 3) {
            texto = texto.replace(/\./g, '');
        }
    }
    
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : padrao;
}

function converterDataExcel(valor) {
    if (!valor || valor === 'Sem Ata' || valor === 'N/A' || valor === '-' || valor === '0') return '-';
    
    let txt = String(valor).trim();
    let numLimpo = txt.split(',')[0].split('.')[0]; 
    
    const num = Number(numLimpo);
    if (!isNaN(num) && num > 30000 && num < 60000) {
        const data = new Date((num - 25569) * 86400 * 1000);
        data.setUTCHours(12);
        
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        return `${dia}/${mes}/${ano}`;
    }
    
    if (txt.match(/^\d{2}\/\d{2}\/\d{4}/)) return txt;
    
    return valor;
}

async function carregarRegrasPlanejadores() {
    const regras = [];
    try {
        const dados = await executarQuerySql(`SELECT * FROM config_equipe`);
        for (const row of dados) {
            let colRef = '';
            let colNome = '';
            for (const k in row) {
                const lowK = k.trim().toLowerCase();
                if (lowK.includes('coluna_') || lowK.includes('vazia')) continue;
                if (lowK === 'familia' || lowK === 'grupo_de_estoque' || lowK === 'grupo de estoque' || lowK === 'item' || lowK === 'ref') colRef = String(row[k] || '');
                else if (!colRef && (lowK.includes('famili') || lowK.includes('grupo') || lowK.includes('item') || lowK.includes('ref')) && !lowK.includes('sub')) colRef = String(row[k] || '');
                if (lowK === 'responsavel' || lowK === 'planejador' || lowK === 'nome') colNome = String(row[k] || '');
                else if (!colNome && (lowK.includes('responsavel') || lowK.includes('planejador') || lowK.includes('nome'))) colNome = String(row[k] || '');
            }
            const refLimpo = limparRefParaPlanejador(colRef);
            const nomePlanejador = colNome.trim();
            if (refLimpo && nomePlanejador) regras.push({ ref: refLimpo, nome: nomePlanejador });
        }
    } catch (e) {
        console.error('Erro ao carregar regras de planejadores:', e);
    }
    return regras;
}

function encontrarPlanejador(itemOriginal, familiaOriginal, grupoEstoqueOriginal, valorColA, regras) {
    const itemLimpo = limparRefParaPlanejador(itemOriginal);
    const famLimpa = limparRefParaPlanejador(familiaOriginal);
    const grupoLimpo = limparRefParaPlanejador(grupoEstoqueOriginal);
    const colALimpa = limparRefParaPlanejador(valorColA);
    let donoItem = null, donoFam = null, donoGrupo = null, donoFAR = null;
    for (const r of regras) {
        if (r.ref === 'FAR') donoFAR = r.nome;
        if (r.ref === itemLimpo) donoItem = r.nome;
        if (r.ref === famLimpa && !donoFam) donoFam = r.nome;
        if (r.ref === grupoLimpo && !donoGrupo) donoGrupo = r.nome;
    }
    return (colALimpa === 'FAR' && donoFAR) ? donoFAR : (donoItem || donoFam || donoGrupo || 'Sem Dono');
}

function calcularMQO(historicoItem) {
    if (!historicoItem || historicoItem.length < 3) return null;
    const n = historicoItem.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    historicoItem.forEach((ponto, i) => {
        const x = i + 1;
        const y = Number(ponto.saldo) || 0;
        sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    });
    return ((n * sumXY) - (sumX * sumY)) / ((n * sumX2) - (sumX * sumX));
}

function extrairProcessos(valor) {
    if (!valor) return '-';
    const str = String(valor).trim();
    if (str.toUpperCase() === 'N/A' || str === '-' || str === '') return '-';
    const matches = str.match(/\d{5}\.\d{6}\/\d{4}-\d{2}/g);
    if (matches && matches.length > 0) return [...new Set(matches)].join(', ');
    return str; 
}

async function gerarSugestoesRessuprimento(planejadorFiltro = 'Todos', mesesCobertura = 6, codigoFiltro = '', ignorar116 = false, ignorarSemDemanda = true, ignorarAvn = false) {
    const regrasPlanejadores = await carregarRegrasPlanejadores();
    const itensLogistica = await executarQuerySql(`SELECT * FROM planilha_saldoabaixode90dias`);
    
    // Busca a lista de AVNs no banco caso o filtro seja ativado
    const avnRows = await executarQuerySql(`SELECT cod_item FROM avn`);
    const setAvn = new Set(avnRows.map(r => String(r.cod_item).toUpperCase()));

    const historicoRaw = await executarQuerySql(`
        SELECT UPPER(TRIM(item)) as codigo, data_historico, saldo_atual 
        FROM historico_estoque 
        WHERE data_historico >= date('now', '-30 days')
        ORDER BY codigo, data_historico ASC
    `);

    const historicoAgrupado = {};
    historicoRaw.forEach(row => {
        if (!historicoAgrupado[row.codigo]) historicoAgrupado[row.codigo] = [];
        historicoAgrupado[row.codigo].push({ saldo: row.saldo_atual });
    });

    const itensAgrupados = {};
    itensLogistica.forEach(linha => {
        let item = '';
        for (const k in linha) {
            if (k.trim().toLowerCase() === 'item' || k.trim().toLowerCase() === 'codigo') {
                item = String(linha[k] || '').trim().toUpperCase();
            }
        }
        if (!item || item.startsWith('A50')) return;
        if (!itensAgrupados[item]) itensAgrupados[item] = [];
        itensAgrupados[item].push(linha);
    });

    const sugestoes = [];

    for (const codigo in itensAgrupados) {
        if (codigoFiltro && !codigo.includes(codigoFiltro.toUpperCase())) continue;
        
        // Aplicação do Filtro de Itens AVN
        if (ignorarAvn && setAvn.has(codigo)) continue;

        const linhasDoMesmoItem = itensAgrupados[codigo];
        const linhaBase = linhasDoMesmoItem[0];

        let descricao = '', familia = '', grupoEstoque = '', valorColA = '';
        const chavesBase = Object.keys(linhaBase);
        if (chavesBase.length > 0) valorColA = String(linhaBase[chavesBase[0]] || '').trim().toUpperCase();

        for (const k in linhaBase) {
            const low = k.trim().toLowerCase();
            const val = linhaBase[k];

            if (low === 'local' || low === 'c_1') valorColA = String(val || '').trim().toUpperCase();
            if (low.includes('descri')) descricao = String(val || '').trim();
            if (low === 'familia' || low === 'família' || low === 'c_familia') familia = String(val || '').trim();
            else if (!familia && low.includes('famili') && !low.includes('sub')) familia = String(val || '').trim();
            if (low === 'grupo_de_estoque' || low === 'grupo de estoque') grupoEstoque = String(val || '').trim();
            else if (!grupoEstoque && (low.includes('grupo') && !low.includes('sub'))) grupoEstoque = String(val || '').trim();
        }

        // Aplicação do Filtro de Grupos 116 e 143
        if (ignorar116) {
            if (grupoEstoque.includes('116')) continue;
            if (grupoEstoque.includes('143') && familia.trim().toUpperCase().startsWith('C')) continue;
        }

        const planejador = encontrarPlanejador(codigo, familia, grupoEstoque, valorColA, regrasPlanejadores);
        if (planejadorFiltro !== 'Todos' && planejador !== planejadorFiltro) continue;

        let processosAtaArray = [];
        let vencimentosArray = [];
        let solicitacoesArray = [];
        
        let saldoAtualTotal = 0;
        let aReceberTotal = 0;
        let saldoAtaTotal = 0;
        let cmm12 = 0;

        linhasDoMesmoItem.forEach(linha => {
            let procAta = '';
            for (const k in linha) {
                const low = k.trim().toLowerCase();
                const val = linha[k];
                const valStr = String(val || '').trim();

                if (low.includes('solicita') || low === 'notes') {
                    if (valStr && valStr !== '-' && valStr !== '0') solicitacoesArray.push(valStr);
                }
                
                if (low === 'processo_com_ata' || low === 'processo' || low === 'ata' || (low.includes('processo') && low.includes('ata'))) {
                    if (valStr && valStr !== '-' && valStr !== '0') procAta = valStr;
                }
                
                if (low === 'venc_ata' || low === 'vencimento' || (low.includes('venc') && low.includes('ata'))) {
                    const dataFormatada = converterDataExcel(valStr);
                    if (dataFormatada !== '-') vencimentosArray.push(dataFormatada);
                }

                if (low === 'saldo_atual' || low === 'saldo atual' || low === 'saldo_fisico' || (low.includes('saldo') && low.includes('atual'))) {
                    saldoAtualTotal += paraNumero(val);
                }
                
                if (low === 'qtde_a_receber' || low === 'a_receber' || low === 'qtde a receber' || (low.includes('qtde') && low.includes('receber'))) {
                    aReceberTotal += paraNumero(val);
                }
                
                if (low === 'saldo_da_ata' || low === 'saldo ata' || low === 'saldo_ata' || (low.includes('saldo') && low.includes('ata')) || (low.includes('qtde') && low.includes('ata')) || low.includes('saldo_remanescente')) {
                    const vNum = paraNumero(val);
                    if (vNum > saldoAtaTotal) saldoAtaTotal = vNum;
                }
                
                if (low === 'cmm12' || low.includes('cmm')) {
                    const vNum = paraNumero(val);
                    if (vNum > cmm12) cmm12 = vNum;
                }
            }
            if (procAta && procAta !== '0' && procAta.toUpperCase() !== 'N/A') {
                processosAtaArray.push(procAta);
            }
        });

        // Aplicação do Filtro de Material Sem Demanda
        const isSemDemanda = (cmm12 === 0 && saldoAtualTotal <= 0);
        if (ignorarSemDemanda && isSemDemanda) continue;

        const processoAtaFinal = processosAtaArray.length > 0 ? extrairProcessos(processosAtaArray.join(', ')) : '-';
        const vencimentoAtaFinal = vencimentosArray.length > 0 ? [...new Set(vencimentosArray)].join(', ') : '-';
        const solicitacaoFinal = solicitacoesArray.length > 0 ? [...new Set(solicitacoesArray)].join(', ') : '-';

        const hist = historicoAgrupado[codigo];
        const beta = calcularMQO(hist);
        
        let consumoMensalBase = cmm12;
        let isTendenciaAcelerada = false;

        if (beta !== null && beta < 0) {
            const consumoProjetadoMensal = Math.abs(beta) * 30;
            if (consumoProjetadoMensal > (cmm12 * 1.2)) {
                consumoMensalBase = consumoProjetadoMensal;
                isTendenciaAcelerada = true;
            }
        }

        if (consumoMensalBase <= 0) continue;

        // CORREÇÃO: Estoque Virtual = APENAS A Receber + Ata
        const estoqueVirtual = aReceberTotal + saldoAtaTotal;
        const estoqueGeral = saldoAtualTotal + estoqueVirtual;
        const consumoDiario = consumoMensalBase / 30;
        
        // Os dias de cobertura contabilizam o Estoque Geral (Físico + Virtual)
        const diasCoberturaVirtual = Math.round(estoqueGeral / consumoDiario);

        if (diasCoberturaVirtual > 90) continue;

        const necessidadeTotal = Math.ceil(consumoMensalBase * mesesCobertura);
        let pedidoSugerido = necessidadeTotal;
        let alertaAta = false;

        if (pedidoSugerido > saldoAtaTotal) {
            pedidoSugerido = Math.floor(saldoAtaTotal);
            alertaAta = true;
        }

        sugestoes.push({
            codigo,
            descricao,
            planejador,
            solicitacao: solicitacaoFinal,
            processoAta: processoAtaFinal,
            vencimentoAta: vencimentoAtaFinal,
            saldoAtual: saldoAtualTotal,
            aReceber: aReceberTotal,
            estoqueVirtual,
            estoqueGeral,
            saldoAta: saldoAtaTotal,
            cmm12,
            consumoConsiderado: Math.round(consumoMensalBase),
            isTendenciaAcelerada,
            diasCoberturaVirtual,
            mesesCoberturaAlvo: mesesCobertura,
            necessidadeOriginal: necessidadeTotal,
            pedidoSugerido,
            alertaAta
        });
    }

    sugestoes.sort((a, b) => a.diasCoberturaVirtual - b.diasCoberturaVirtual);
    return sugestoes;
}

module.exports = { gerarSugestoesRessuprimento };
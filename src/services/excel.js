const fs = require('fs');
const os = require('os');
const path = require('path');
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');
const { getDbConnection } = require('./database');
const { buscarPregaoPorSei } = require('./pregoesCache');

const LIMITE_RESULTADOS_POR_PAGINA = 30;

// === FUNÇÕES DE CONEXÃO E CONSULTA AO BANCO ===
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

async function carregarDadosDaPlanilha() {
    try {
        const rows = await executarQuerySql(`SELECT * FROM planilha_saldoabaixode90dias`);
        return rows;
    } catch (e) {
        console.error('Erro ao ler tabela planilha_saldoabaixode90dias do DB:', e);
        return [];
    }
}

async function carregarDadosEmpenhosExcel() {
    try {
        const rows = await executarQuerySql(`SELECT * FROM empenhos_entradaempenhos`);
        return rows.map(linha => {
            const linhaLimpa = {};
            for (let chave in linha) {
                const novaChave = String(chave).trim().toUpperCase();
                linhaLimpa[novaChave] = linha[chave];
            }
            return linhaLimpa;
        });
    } catch (e) {
        console.error('Erro ao ler tabela empenhos_entradaempenhos do DB:', e);
        return [];
    }
}

// === FUNÇÕES UTILITÁRIAS E VALIDAÇÕES ===

// NOVA TRAVA: Só aceita Processos de verdade (tem que ter a barra '/')
function isProcessoValido(processoStr) {
    const p = String(processoStr).trim();
    if (!p || p === '0' || p.toUpperCase() === 'N/A') return false;
    // Se não tiver '/', provavelmente é lixo numérico do Excel (ex: 0.0425)
    if (!p.includes('/')) return false;
    return true;
}

function deveIgnorarProcesso(processoStr) {
    if (!isProcessoValido(processoStr)) return true; // Filtra os falsos positivos na raiz
    
    const anoAtual = new Date().getFullYear();
    const match = String(processoStr).match(/\/(\d{4})(?:-|$)/);
    if (match) {
        const ano = parseInt(match[1], 10);
        return ano <= (anoAtual - 3);
    }
    return false;
}

function removerAcentos(texto) {
    if (!texto) return '';
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normalizarTexto(texto) {
    return removerAcentos(texto).toLowerCase();
}

function limparCodigo(texto) {
    return String(texto || '').trim().toUpperCase();
}

function limparCodigoSemZeros(texto) {
    return limparCodigo(texto).replace(/^0+/, '');
}

function somenteLetras(texto) {
    return limparCodigo(texto).replace(/[^A-Z]/g, '');
}

function somenteNumeros(texto) {
    return limparCodigo(texto).replace(/\D/g, '');
}

function parseNumeroPTBR(valor) {
    if (valor === undefined || valor === null || valor === '') return 0;
    if (typeof valor === 'number') return valor;
    
    const texto = String(valor).trim();
    if (texto.includes(',') && texto.includes('.') && texto.indexOf('.') < texto.indexOf(',')) {
        return parseFloat(texto.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (texto.includes(',')) {
        return parseFloat(texto.replace(',', '.')) || 0;
    }
    return parseFloat(texto) || 0;
}

function obterValorOuPadrao(valor, padrao = 'N/A') {
    if (valor === undefined || valor === null) return padrao;
    const texto = String(valor).trim();
    if (!texto) return padrao;
    if (texto === '0') return '0';
    if (/^n\/?a$/i.test(texto)) return padrao;
    return texto;
}

function formatarValorBR(valor, decimais = null) {
    if (valor === undefined || valor === null || String(valor).trim() === '' || String(valor).trim().toUpperCase() === 'N/A') return 'N/A';
    const numero = parseNumeroPTBR(valor);
    if (isNaN(numero)) return String(valor).trim();
    
    const options = {};
    if (decimais !== null) {
        options.minimumFractionDigits = decimais;
        options.maximumFractionDigits = decimais;
    } else {
        options.minimumFractionDigits = 0;
        options.maximumFractionDigits = 4;
    }
    return numero.toLocaleString('pt-BR', options);
}

function limparRefParaPlanejador(texto) {
    if (!texto) return '';
    let limpo = String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .toUpperCase();
        
    // Correção para igualar formatos decimais do Excel (ex: "5.5020" ser lido igual a "5.502")
    if (/^\d+\.\d+$/.test(limpo)) {
        return Number(limpo).toString();
    }
    return limpo;
}

function formatarDataExcel(valor) {
    if (!valor) return 'N/A';
    const valorNumerico = Number(valor);
    if (!isNaN(valorNumerico) && String(valor).trim() !== '') {
        const dataObj = new Date((valorNumerico - 25569) * 86400 * 1000);
        if (!isNaN(dataObj.getTime())) {
            return dataObj.toLocaleDateString('pt-BR');
        }
    }
    return String(valor).trim() || 'N/A';
}

function extrairDataJSDeExcel(valor) {
    if (!valor) return null;
    const valorNumerico = Number(valor);
    if (!isNaN(valorNumerico) && String(valor).trim() !== '') {
        const dataObj = new Date((valorNumerico - 25569) * 86400 * 1000);
        dataObj.setUTCHours(12);
        return isNaN(dataObj.getTime()) ? null : dataObj;
    }
    const txt = String(valor).trim();
    const partes = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (partes) {
        return new Date(parseInt(partes[3], 10), parseInt(partes[2], 10) - 1, parseInt(partes[1], 10), 12, 0, 0);
    }
    const partesIso = txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (partesIso) {
        return new Date(parseInt(partesIso[1], 10), parseInt(partesIso[2], 10) - 1, parseInt(partesIso[3], 10), 12, 0, 0);
    }
    return null;
}

// === FUNÇÕES DE NEGÓCIO E BUSCA ===

async function temAcessoNome(idContato) {
    if (!idContato) return false;
    const numProcurado = String(idContato).replace(/\D/g, '');
    const meuNumero = String(process.env.MEU_NUMERO || '').replace(/\D/g, '');
    if (meuNumero && (numProcurado === meuNumero || numProcurado.endsWith(meuNumero))) return true;
    
    try {
        const dados = await executarQuerySql(`SELECT * FROM config_equipe_acessonome`);
        for (const row of dados) {
            for (const key in row) {
                const valorLimpo = String(row[key] || '').replace(/\D/g, '');
                if (valorLimpo && valorLimpo.length >= 8) {
                    if (valorLimpo.slice(-8) === numProcurado.slice(-8)) return true;
                }
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function verificarPerfilCadAlerta(idContato) {
    if (!idContato) return { supervisor: false, planejador: null };
    const meuNumero = String(process.env.MEU_NUMERO || '').replace(/\D/g, '');
    const numProcurado = String(idContato).replace(/\D/g, '');
    if (meuNumero && (numProcurado === meuNumero || numProcurado.endsWith(meuNumero))) return { supervisor: true, planejador: null };
    
    try {
        const dados = await executarQuerySql(`SELECT * FROM config_equipe_cad_alerta`);
        if (!dados || dados.length === 0) return { supervisor: true, planejador: null };
        
        for (const row of dados) {
            let numPlanilha = '';
            let nome = '';
            let recebeCopia = false;
            for (const chave in row) {
                const low = chave.toLowerCase().replace(/\s/g, '');
                if (low.includes('numero') || low.includes('telefone')) numPlanilha = String(row[chave]).replace(/\D/g, '');
                if (low.includes('nome') || low.includes('planejador')) nome = String(row[chave]).trim();
                if (low.includes('copia') || low.includes('supervisor')) {
                    const val = String(row[chave]).toLowerCase().trim();
                    if (val === 'sim' || val === 'x' || val === 'true' || val === '1') recebeCopia = true;
                }
            }
            if (numPlanilha && numPlanilha.length >= 8 && (numProcurado === numPlanilha || numProcurado.endsWith(numPlanilha))) {
                return { supervisor: recebeCopia, planejador: nome };
            }
        }
        return { supervisor: false, planejador: null };
    } catch (e) {
        return { supervisor: true, planejador: null };
    }
}

async function obterPlanejadorResponsavel(itemOriginal, familiaOriginal, valorColA = '') {
    try {
        const dados = await executarQuerySql(`SELECT * FROM config_equipe`);
        const itemLimpo = limparRefParaPlanejador(itemOriginal);
        const famLimpa = limparRefParaPlanejador(familiaOriginal);
        const colALimpa = limparRefParaPlanejador(valorColA);
        
        let donoItem = null, donoFam = null, donoFAR = null;
        for (const row of dados) {
            let colRef = '';
            let colNome = '';
            
            // Garantia: Puxa pelas colunas 1 e 2 diretamente pelo índice como fallback absoluto
            const chaves = Object.keys(row);
            if (chaves.length > 0) colRef = String(row[chaves[0]] || '');
            if (chaves.length > 1) colNome = String(row[chaves[1]] || '');

            for (const k in row) {
                const low = k.trim().toLowerCase();
                
                if (low.includes('vazia')) continue;
                
                if (low === 'familia' || low === 'grupo_de_estoque' || low === 'grupo de estoque' || low === 'item' || low === 'ref') colRef = String(row[k] || '');
                else if (!colRef && (low.includes('famili') || low.includes('grupo') || low.includes('item') || low.includes('ref')) && !low.includes('sub')) colRef = String(row[k] || '');
                
                if (low === 'responsavel' || low === 'planejador' || low === 'nome') colNome = String(row[k] || '');
                else if (!colNome && (low.includes('responsavel') || low.includes('planejador') || low.includes('nome'))) colNome = String(row[k] || '');
            }
            
            const refLimpo = limparRefParaPlanejador(colRef);
            const nomePlanejador = colNome.trim();
            
            if (refLimpo === 'FAR') donoFAR = nomePlanejador;
            if (refLimpo === itemLimpo && itemLimpo !== '') donoItem = nomePlanejador;
            if (refLimpo === famLimpa && famLimpa !== '' && !donoFam) donoFam = nomePlanejador;
        }
        return (colALimpa === 'FAR' && donoFAR) ? donoFAR : (donoItem || donoFam || 'Sem dono cadastrado');
    } catch (e) {
        return 'Erro ao ler planejamento';
    }
}

function montarMapasDeProcessos(linhasDoMesmoItem) {
    const comAta = new Map();
    const emAndamento = new Map();
    linhasDoMesmoItem.forEach(linha => {
        let procAta = '';
        let qtdeAta = 'N/A';
        let procAndamento = '';
        let qtdeAndamento = 'N/A';
        let solAndamento = 'N/A';

        for (const k in linha) {
            const low = k.trim().toLowerCase();
            const val = linha[k];
            
            if (val === undefined || val === null) continue;

            // Grupo 1: Processos Concluídos/Ata/Dispensas
            if (low === 'processo_com_ata' || low === 'processo') {
                procAta = String(val).trim();
            }
            if (low === 'qtde_original' || low === 'quantidade_original') {
                if (qtdeAta === 'N/A' && val) qtdeAta = String(val).trim();
            }

            // Grupo 2: Processos em Andamento
            if (low === 'processo_em_andamento' || low === 'processo_2' || (low.includes('processo') && low.includes('andamento'))) {
                procAndamento = String(val).trim();
            }
            if (low === 'qtde' || low === 'qtde_2' || low === 'quantidade') {
                if (qtdeAndamento === 'N/A' && val) qtdeAndamento = String(val).trim();
            }
            if (low === 'solicitacao_2' || low === 'solicitação_2') {
                if (solAndamento === 'N/A' && val) solAndamento = String(val).trim();
            }
        }

        if (procAta && isProcessoValido(procAta) && !deveIgnorarProcesso(procAta)) {
            if (!comAta.has(procAta) || comAta.get(procAta) === 'N/A') {
                comAta.set(procAta, qtdeAta);
            }
        }

        if (procAndamento && isProcessoValido(procAndamento) && !deveIgnorarProcesso(procAndamento)) {
            const existente = emAndamento.get(procAndamento) || { quantidade: 'N/A', solicitacao: 'N/A' };
            if (existente.quantidade === 'N/A' && qtdeAndamento !== 'N/A') existente.quantidade = qtdeAndamento;
            if (existente.solicitacao === 'N/A' && solAndamento !== 'N/A') existente.solicitacao = solAndamento;
            emAndamento.set(procAndamento, existente);
        }
    });
    return { comAta, emAndamento };
}

function montarMapaDeProcessos(linhasDoMesmoItem) {
    const { comAta, emAndamento } = montarMapasDeProcessos(linhasDoMesmoItem);
    const mapa = new Map();
    for (const [k, v] of comAta) mapa.set(k, v);
    for (const [k, v] of emAndamento) mapa.set(k, v.quantidade); // fallback p/ compatibilidade de strings
    return mapa;
}

function montarMapaDeAes(linhasDoMesmoItem) {
    const mapa = new Map();
    linhasDoMesmoItem.forEach(linha => {
        const chaves = Object.keys(linha);
        for (let i = 0; i < chaves.length; i++) {
            const low = chaves[i].trim().toLowerCase();
            if (low.startsWith('ae') && !low.includes('empenhar') && !low.includes('qtde')) {
                const ae = String(linha[chaves[i]] || '').trim();
                if (!ae || ae === '0' || ae.toLowerCase() === 'n/a') continue;
                let quantidade = 'N/A';
                if (i + 1 < chaves.length && chaves[i + 1].trim().toLowerCase().startsWith('qtde')) {
                    quantidade = String(linha[chaves[i + 1]] || '').trim() || 'N/A';
                }
                if (!mapa.has(ae) || mapa.get(ae) === 'N/A') {
                    mapa.set(ae, quantidade);
                }
            }
        }
    });
    return mapa;
}

function montarListaDeEmpenhos(linhasDoMesmoItem) {
    const empenhosMap = new Map();
    linhasDoMesmoItem.forEach(linha => {
        let numEmpenho = '';
        let qtdeReceberStr = '';
        let valorUnitario = '';
        let fornecedor = '';
        
        for (const k in linha) {
            const lowOriginal = k.trim().toLowerCase();
            const low = lowOriginal.replace(/_/g, '').replace(/\./g, '');
            
            // Prioridade para as colunas exatas informadas no mapping
            if (lowOriginal === 'num_empenho' || (!numEmpenho && (low === 'numempenho' || low === 'empenho'))) numEmpenho = String(linha[k] || '');
            if (lowOriginal === 'qtde_a_receber' || (!qtdeReceberStr && (low.includes('qtde') && low.includes('receber')))) qtdeReceberStr = String(linha[k] || '');
            if (lowOriginal === 'valor_unitario' || (!valorUnitario && ((low.includes('valor') && low.includes('unit')) || (low.includes('vlr') && low.includes('unit')) || (low.includes('preco') && low.includes('unit'))))) valorUnitario = String(linha[k] || '');
            if (lowOriginal === 'fornecedor_empenho' || (!fornecedor && low.includes('fornecedor'))) fornecedor = String(linha[k] || '');
        }
        numEmpenho = numEmpenho.trim();
        
        if (!numEmpenho || numEmpenho === '0' || numEmpenho.toLowerCase() === 'n/a') return;
        
        let anoEmpenho = null;
        const matchAno = numEmpenho.match(/^(\d{4})/);
        if (matchAno) anoEmpenho = parseInt(matchAno[1], 10);
        
        if (!empenhosMap.has(numEmpenho)) {
            empenhosMap.set(numEmpenho, {
                empenho: numEmpenho,
                ano: anoEmpenho,
                quantidade: qtdeReceberStr.trim() || '0',
                valorUnitario: valorUnitario.trim() || 'Não informado',
                fornecedor: fornecedor.trim() || 'Não informado'
            });
        }
    });
    return Array.from(empenhosMap.values());
}

function obterItensSimilares(dados, itemPrincipal) {
    let codigoPrincipal = '';
    let descricaoPrincipal = '';
    
    for (const k in itemPrincipal) {
        const low = k.trim().toLowerCase();
        if (low === 'item' || low === 'codigo') codigoPrincipal = String(itemPrincipal[k]).trim();
        if (low.includes('descri')) descricaoPrincipal = String(itemPrincipal[k]).trim();
    }
    if (!descricaoPrincipal) return [];
    
    let textoLimpo = descricaoPrincipal.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,\-;:_()/xX]/g, ' ').toLowerCase();
    const palavras = textoLimpo.split(/\s+/).filter(Boolean);
    
    while (palavras.length > 0) {
        const encontrados = dados.filter(linha => {
            let codigoLinha = '';
            let descricaoLinha = '';
            for (const k in linha) {
                const low = k.trim().toLowerCase();
                if (low === 'item' || low === 'codigo') codigoLinha = String(linha[k]).trim();
                if (low.includes('descri')) descricaoLinha = String(linha[k]).trim();
            }
            if (codigoLinha === codigoPrincipal) return false;
            
            descricaoLinha = descricaoLinha.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return palavras.every(palavra => descricaoLinha.includes(palavra));
        });
        
        if (encontrados.length > 0) {
            const unicos = [];
            const codigosVistos = new Set();
            encontrados.forEach(item => {
                let codigo = '';
                for (const k in item) { if (k.trim().toLowerCase() === 'item' || k.trim().toLowerCase() === 'codigo') codigo = String(item[k]).trim(); }
                if (codigo && !codigosVistos.has(codigo)) {
                    codigosVistos.add(codigo);
                    unicos.push(item);
                }
            });
            return unicos.slice(0, 7);
        }
        palavras.pop();
    }
    return [];
}

async function montarRespostaDetalhada(dados, principal, idContato = null) {
    let codigoPrincipal = '';
    let familiaPrincipal = '';
    let descricaoItem = 'N/A';
    let maiorConsumo12m = 'N/A';
    let grupoEstoquePrincipal = ''; // Adicionado para capturar o código do grupo
    
    for (const k in principal) {
        const low = k.trim().toLowerCase();
        if (low === 'item' || low === 'codigo') codigoPrincipal = String(principal[k]).trim().toUpperCase();
        if (low.includes('descri')) descricaoItem = String(principal[k]).trim();
        
        if (low === 'familia' || low === 'família') familiaPrincipal = String(principal[k]).trim();
        else if (!familiaPrincipal && low.includes('famili') && !low.includes('sub')) familiaPrincipal = String(principal[k]).trim();
        else if (!familiaPrincipal && (low === 'c_5' || low === 'coluna_5' || low === 'c_4' || low === 'coluna_4')) familiaPrincipal = String(principal[k]).trim();
        
        if (low.includes('maior_consumo')) maiorConsumo12m = String(principal[k]).trim();

        // NOVA IMPLEMENTAÇÃO: Captura do grupo de estoque
        if (low === 'grupo_de_estoque' || low === 'grupo de estoque') grupoEstoquePrincipal = String(principal[k]).trim();
        else if (!grupoEstoquePrincipal && (low.includes('grupo') && !low.includes('sub'))) grupoEstoquePrincipal = String(principal[k]).trim();
    }
    
    const linhasDoMesmoItem = dados.filter(linha => {
        let codigoLinhaVal = '';
        for (const k in linha) {
            if (k.trim().toLowerCase() === 'item' || k.trim().toLowerCase() === 'codigo') codigoLinhaVal = linha[k];
        }
        return String(codigoLinhaVal || '').trim().toUpperCase() === codigoPrincipal;
    });

    const mapaSolicitacoesProcesso = new Map();
    const mapaDetalhesProcessoAta = new Map();
    const mapaDetalhesProcessoAndamento = new Map();

    linhasDoMesmoItem.forEach(linha => {
        let procAta = '';
        let procAndamento = '';
        let solNotes = '';
        let solAe = '';
        let qtdeOriginal = 'N/A';
        let saldoAtaStr = 'N/A';
        let fornecedorAta = 'N/A';
        let modalidadeStr = 'N/A';
        let modalidade2Str = 'N/A';
        let solAndamento = 'N/A';

        for (const k in linha) {
            const low = k.trim().toLowerCase();
            const val = linha[k];
            
            if (val === undefined || val === null) continue;
            const valStr = String(val).trim();

            // Grupo 1: Concluídos / Atas (Colunas 22 a 29)
            if (low === 'processo_com_ata' || low === 'processo') procAta = valStr;
            if (low === 'modalidade') modalidadeStr = valStr;
            if (low === 'fornecedor_ata' || low === 'fornecedorata' || (low.includes('fornecedor') && !low.includes('empenho'))) fornecedorAta = valStr;
            if (low === 'qtde_original' || (low.includes('qtde') && low.includes('original'))) qtdeOriginal = valStr;
            if (low === 'saldo_da_ata' || (!saldoAtaStr && (low.includes('saldo') && low.includes('ata')))) saldoAtaStr = valStr;
            
            // Grupo 2: Processos em Andamento (Colunas 30 a 35)
            if (low === 'processo_em_andamento' || low === 'processo_2' || (low.includes('processo') && low.includes('andamento'))) procAndamento = valStr;
            if (low === 'modalidade_2' || low.includes('modalidade_2')) modalidade2Str = valStr;
            if (low === 'solicitacao_2' || low === 'solicitação_2') solAndamento = valStr;
            
            // Outras
            if (low === 'solicitacao' || (!solNotes && (low === 'notes' || low === 'observacao' || low === 'obs'))) solNotes = valStr;
            if (low.includes('solicita') && low.includes('_1')) solAe = valStr;
        }

        const validProcAta = (procAta && procAta !== '0' && procAta.toUpperCase() !== 'N/A') ? procAta : null;
        if (validProcAta && !deveIgnorarProcesso(validProcAta)) {
            const atual = mapaSolicitacoesProcesso.get(validProcAta) || { solNotes: 'N/A', solAe: 'N/A' };
            if (solNotes && solNotes !== '0' && solNotes.toUpperCase() !== 'N/A') atual.solNotes = solNotes;
            if (solAe && solAe !== '0' && solAe.toUpperCase() !== 'N/A') atual.solAe = solAe;
            mapaSolicitacoesProcesso.set(validProcAta, atual);
        }

        // Acumulação garantida (Trava contra linhas vazias apagando dados cheios)
        if (procAta && procAta !== '0' && procAta.toUpperCase() !== 'N/A' && !deveIgnorarProcesso(procAta)) {
            const existente = mapaDetalhesProcessoAta.get(procAta) || { qtdeOriginal: 'N/A', saldoAta: 'N/A', fornecedorAta: 'N/A', modalidade: 'N/A' };
            if (qtdeOriginal && qtdeOriginal !== 'N/A') existente.qtdeOriginal = qtdeOriginal;
            if (saldoAtaStr && saldoAtaStr !== 'N/A') existente.saldoAta = saldoAtaStr;
            if (fornecedorAta && fornecedorAta !== 'N/A') existente.fornecedorAta = fornecedorAta;
            if (modalidadeStr && modalidadeStr !== 'N/A') existente.modalidade = modalidadeStr;
            
            mapaDetalhesProcessoAta.set(procAta, existente);
        }

        if (procAndamento && procAndamento !== '0' && procAndamento.toUpperCase() !== 'N/A' && !deveIgnorarProcesso(procAndamento)) {
            const existente = mapaDetalhesProcessoAndamento.get(procAndamento) || { modalidade2: 'N/A', solicitacao2: 'N/A' };
            if (modalidade2Str && modalidade2Str !== 'N/A') existente.modalidade2 = modalidade2Str;
            if (solAndamento && solAndamento !== 'N/A') existente.solicitacao2 = solAndamento;
            mapaDetalhesProcessoAndamento.set(procAndamento, existente);
        }
    });
    
    const atasUnicas = new Map();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    linhasDoMesmoItem.forEach(linha => {
        let venc = '';
        let processoAtaStr = '';
        let modalidadeStr = '';
        let saldoStr = '';
        let notesStr = '';
        
        for (const k in linha) {
            const low = k.trim().toLowerCase();
            if (low === 'venc_ata' || (!venc && (low.includes('venc') && low.includes('ata')))) venc = linha[k];
            if (low === 'processo_com_ata' || low === 'processo') processoAtaStr = linha[k];
            if (low === 'modalidade') modalidadeStr = linha[k];
            if (low === 'saldo_da_ata' || (!saldoStr && (low.includes('saldo') && low.includes('ata')))) saldoStr = linha[k];
            if (low === 'solicitacao' || (!notesStr && (low === 'notes' || low === 'observacao' || low === 'obs'))) notesStr = linha[k];
        }
        
        venc = String(venc || '').trim();
        processoAtaStr = String(processoAtaStr || '').trim();
        
        if (deveIgnorarProcesso(processoAtaStr)) return;
        modalidadeStr = String(modalidadeStr || '').trim();
        saldoStr = (saldoStr === undefined || saldoStr === null || String(saldoStr).trim() === '' || String(saldoStr).trim().toUpperCase() === 'N/A') ? '0' : String(saldoStr).trim();
        notesStr = String(notesStr || '').trim();
        
        if (venc && venc !== '0' && venc.toUpperCase() !== 'N/A') {
            const dataFormatada = formatarDataExcel(venc);
            const processo = (processoAtaStr && processoAtaStr !== '0') ? processoAtaStr : 'N/A';
            const modalidade = (modalidadeStr && modalidadeStr !== '0') ? modalidadeStr : 'N/A';
            const notes = (notesStr && notesStr !== '0' && notesStr.toUpperCase() !== 'N/A') ? notesStr : 'N/A';
            
            const dataVencimentoJs = extrairDataJSDeExcel(venc);
            let ataValida = dataVencimentoJs && (dataVencimentoJs >= hoje);

            const modUpper = modalidadeStr.toUpperCase();
            const ehModalidadeFechada = modUpper.includes('DISPENSA') || modUpper.includes('INEXIGIBILIDADE') || modUpper.includes('ADESÃO') || modUpper.includes('ADESAO');

            if (ehModalidadeFechada && parseNumeroPTBR(saldoStr) <= 0) {
                ataValida = false;
            }

            const solicitacoesVinculadas = mapaSolicitacoesProcesso.get(processoAtaStr) || { solNotes: 'N/A', solAe: 'N/A' };
            const chave = `${processo}-${dataFormatada}`;
            if (!atasUnicas.has(chave)) {
                atasUnicas.set(chave, {
                     processo,
                     modalidade,
                     vencimento: dataFormatada,
                     saldo: saldoStr,
                     ataValida,
                     notes,
                    solicitacaoAe: solicitacoesVinculadas.solAe
                });
            }
        }
    });
    
    const mapasProcessosObj = montarMapasDeProcessos(linhasDoMesmoItem);
    const mapaAes = montarMapaDeAes(linhasDoMesmoItem);
    const listaEmpenhosBruta = montarListaDeEmpenhos(linhasDoMesmoItem);
    const itensSimilares = obterItensSimilares(dados, principal);
    
    // Função auxiliar para identificar tipos alternativos de modalidades
    function isModalidadeAlternativa(mod) {
        if (!mod || mod === 'N/A') return false;
        const modUpper = String(mod).toUpperCase();
        if (modUpper === 'PREGÃO - REGISTRO DE PREÇOS' || modUpper === 'PREGÃO - REGISTRO DE PREÇOS - REPETIÇÃO') return false;
        return modUpper.includes('EMERGENCIAL') || modUpper.includes('DISPENSA') || modUpper.includes('INEX') || modUpper.includes('PREGÃO');
    }

    // INTELIGÊNCIA HERA: Transferir automaticamente Processos em Andamento para "Com Ata" caso identifique como Dispensa
    const processosParaMover = [];
    for (const [processo, objAndamento] of mapasProcessosObj.emAndamento.entries()) {
        const quantidade = typeof objAndamento === 'object' ? objAndamento.quantidade : objAndamento;
        const detalhesAndamento = mapaDetalhesProcessoAndamento.get(processo) || { modalidade2: 'N/A' };
        const mod2 = detalhesAndamento.modalidade2;
        if (isModalidadeAlternativa(mod2)) {
            processosParaMover.push({ processo, quantidade, mod2 });
        }
    }
    processosParaMover.forEach(p => {
        mapasProcessosObj.comAta.set(p.processo, p.quantidade);
        mapaDetalhesProcessoAta.set(p.processo, {
            qtdeOriginal: p.quantidade,
            saldoAta: 'N/A', // Dispensas e Andamento podem não controlar saldo da mesma forma aqui
            fornecedorAta: 'N/A',
            modalidade: p.mod2
        });
        mapasProcessosObj.emAndamento.delete(p.processo);
    });
    
    const dadosEmpenhosExtra = await carregarDadosEmpenhosExcel();
    const empenhosDoItem = dadosEmpenhosExtra.filter(e => String(e['COD_ITEM'] || '').trim().toUpperCase() === codigoPrincipal);
    let ultimaDataObj = null;
    let ultimaDataTexto = 'Não informada';
    empenhosDoItem.forEach(emp => {
        const valData = emp['DATA_ULT_ENTRADA'];
        if (valData) {
            let dataLocal = null;
            if (typeof valData === 'number') {
                dataLocal = new Date((valData - 25569) * 86400 * 1000);
            } else {
                const txt = String(valData).trim();
                const partesBr = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                if (partesBr) dataLocal = new Date(`${partesBr[3]}-${partesBr[2]}-${partesBr[1]}T00:00:00`);
                else dataLocal = new Date(txt);
            }
            if (dataLocal && !isNaN(dataLocal.getTime())) {
                if (!ultimaDataObj || dataLocal.getTime() > ultimaDataObj.getTime()) {
                    ultimaDataObj = dataLocal;
                    ultimaDataTexto = formatarDataExcel(valData);
                }
            }
        }
    });
    
    empenhosDoItem.forEach(emp => {
        const proc = String(emp['PROCESSO'] || '').trim();
        if (proc && proc !== '0' && proc.toLowerCase() !== 'n/a' && !deveIgnorarProcesso(proc)) {
            if (!mapasProcessosObj.comAta.has(proc) && !mapasProcessosObj.emAndamento.has(proc)) {
                mapasProcessosObj.emAndamento.set(proc, { quantidade: 'N/A', solicitacao: 'N/A' }); 
            }
        }
    });

    const mapaEmpenhosConsolidados = new Map();
    listaEmpenhosBruta.forEach(emp => {
        const num = String(emp.empenho).trim();
        mapaEmpenhosConsolidados.set(num, {
            ...emp,
            qtdeRecebida: '0',
            saldo: parseNumeroPTBR(emp.quantidade),
            temExtra: false
        });
    });

    const empenhosAjustadosParaZero = []; 
    empenhosDoItem.forEach(empExtra => {
        const numEmpenho = String(empExtra['EMPENHO'] || '').trim();
        if (!numEmpenho || numEmpenho === '0') return;
        
        let qtdeEmpenhada = empExtra['QTDE_EMPENHADA'] !== undefined ? empExtra['QTDE_EMPENHADA'] : '0';
        let qtdeRecebida = empExtra['QTDE_RECEBIDA'] !== undefined ? empExtra['QTDE_RECEBIDA'] : '0';
        const saldoAempenhar = empExtra['SALDO_A_EMPENHAR'];
        
        if (saldoAempenhar !== undefined && String(saldoAempenhar).trim() !== '' && parseNumeroPTBR(saldoAempenhar) === 0) {
            if (parseNumeroPTBR(qtdeEmpenhada) !== parseNumeroPTBR(qtdeRecebida)) {
                qtdeRecebida = qtdeEmpenhada; 
                empenhosAjustadosParaZero.push(numEmpenho); 
            }
        }
        
        // Busca flexível do Valor Unitário no banco extra
        const valorUnitario = empExtra['VALOR_UNITARIO'] || empExtra['VLR_UNITARIO'] || empExtra['PRECO_UNITARIO'] || '';
        const fornecedor = empExtra['NOME_FORNECEDOR'] || '';
        
        const valorEmpenhadoMat = parseNumeroPTBR(qtdeEmpenhada);
        const valorRecebidoMat = parseNumeroPTBR(qtdeRecebida);
        const saldoMat = valorEmpenhadoMat - valorRecebidoMat;
        
        let anoEmpenho = null;
        const matchAno = numEmpenho.match(/^(\d{4})/);
        if (matchAno) anoEmpenho = parseInt(matchAno[1], 10);
        
        if (mapaEmpenhosConsolidados.has(numEmpenho)) {
            const e = mapaEmpenhosConsolidados.get(numEmpenho);
            e.quantidade = qtdeEmpenhada;
            e.qtdeRecebida = qtdeRecebida;
            e.saldo = saldoMat;
            e.temExtra = true;
            if (fornecedor) e.fornecedor = fornecedor;
            if (valorUnitario) e.valorUnitario = valorUnitario;
        } else {
            mapaEmpenhosConsolidados.set(numEmpenho, {
                empenho: numEmpenho,
                ano: anoEmpenho,
                quantidade: qtdeEmpenhada,
                valorUnitario: valorUnitario,
                fornecedor: fornecedor,
                qtdeRecebida: qtdeRecebida,
                saldo: saldoMat,
                temExtra: true
            });
        }
    });

    const listaEmpenhosBrutaConsolidada = Array.from(mapaEmpenhosConsolidados.values());
    const anoAtual = new Date().getFullYear();
    const empenhosValidos = [];
    
    let temAnoAtual = false;
    let temAnoAnterior = false;
    const empenhosAntigos = [];
    listaEmpenhosBrutaConsolidada.forEach(emp => {
        if (emp.saldo > 0) {
            if (emp.ano === anoAtual) {
                empenhosValidos.push(emp);
                temAnoAtual = true;
            } else if (emp.ano === anoAtual - 1) {
                empenhosValidos.push(emp);
                temAnoAnterior = true;
            } else if (emp.ano && emp.ano < anoAtual - 1) {
                empenhosAntigos.push(emp);
            } else if (!emp.ano) {
                empenhosValidos.push(emp);
            }
        }
    });
    
    let saldoAtual = '0';
    let cmm12 = '0';
    let cmm12Atrib = '0';
    let saldoEmDias = '0';
    let obs = 'Nenhuma';
    for (const k in principal) {
        const low = k.trim().toLowerCase();
        if (low === 'saldo_atual' || (low.includes('saldo') && low.includes('atual'))) saldoAtual = String(principal[k]);
        if (low === 'cmm12') cmm12 = String(principal[k]);
        else if (low.includes('cmm12') && !low.includes('atrib')) cmm12 = String(principal[k]);
        if (low === 'cmm12_atrib') cmm12Atrib = String(principal[k]);
        if (low === 'saldo_em_dias') saldoEmDias = String(principal[k]);
    }
    
    let cmmHistoricoCom2024 = 0;
    let cmmHistoricoSem2024 = 0;
    try {
        const queryMov = `SELECT qtde, data_entrada FROM movimentacao_anos_anteriores WHERE TRIM(UPPER(item)) = ? OR TRIM(UPPER(item)) = ?`;
        const movs = await executarQuerySql(queryMov, [codigoPrincipal.trim().toUpperCase(), limparCodigoSemZeros(codigoPrincipal).trim().toUpperCase()]);
        
        let somaCom2024 = 0;
        let somaSem2024 = 0;
        
        movs.forEach(mov => {
            const qtdeStr = String(mov.qtde || '0').trim();
            const qtde = parseNumeroPTBR(qtdeStr);
            let ano = null;
            const dataVal = String(mov.data_entrada || '').trim();
            
            if (dataVal) {
                if (/^\d+$/.test(dataVal)) {
                    const dataJs = extrairDataJSDeExcel(dataVal);
                    if(dataJs) ano = dataJs.getFullYear();
                } else if (dataVal.includes('/')) {
                    const partes = dataVal.split('/');
                    ano = parseInt(partes[partes.length - 1], 10);
                } else if (dataVal.includes('-')) {
                    ano = parseInt(dataVal.split('-')[0], 10);
                }
            }

            if (ano) {
                if (ano < 100) ano += 2000;
                somaCom2024 += qtde;
                if (ano !== 2024) somaSem2024 += qtde;
            }
        });

        cmmHistoricoCom2024 = somaCom2024 / 48;
        cmmHistoricoSem2024 = somaSem2024 / 36;
    } catch(e) {
        console.error("Erro ao calcular CMM histórico. A tabela já foi criada? ", e);
    }

    let resposta = `*Informações do Item:*\n\n`;
    resposta += `*Item:* ${codigoPrincipal}\n`;
    resposta += `*Descrição:* ${descricaoItem}\n`;
    resposta += `*Saldo Atual:* ${formatarValorBR(saldoAtual)}\n`;
    resposta += `*CMM12:* ${formatarValorBR(cmm12)}\n`;
    resposta += `*Maior Consumo nos últimos 12 meses:* ${formatarValorBR(maiorConsumo12m)}\n`;
    resposta += `*CMM Atribuído:* ${formatarValorBR(cmm12Atrib)}\n`;
    resposta += `*Saldo em Dias:* ${formatarValorBR(saldoEmDias)}\n`;
    resposta += `*Obs:* ${obs || 'Nenhuma'}\n`;
    resposta += `*Data Última Entrada:* ${ultimaDataTexto}\n`;
    
    if (await temAcessoNome(idContato)) {
        const chaveColA = Object.keys(principal)[0];
        const valorColA = String(principal[chaveColA] || '');
        const planejador = await obterPlanejadorResponsavel(codigoPrincipal, familiaPrincipal, valorColA);
        resposta += `*Planejador:* ${planejador}\n`;
    }

    if (grupoEstoquePrincipal) {
        try {
            const geCheck = await executarQuerySql('SELECT ds_grupo_estoque FROM grupo_estoque WHERE cd_grupo_estoque = ?', [grupoEstoquePrincipal]);
            if (geCheck.length > 0 && geCheck[0].ds_grupo_estoque) {
                resposta += `*G.E:* ${grupoEstoquePrincipal} - ${geCheck[0].ds_grupo_estoque}\n`;
            } else {
                resposta += `*G.E:* ${grupoEstoquePrincipal}\n`;
            }
        } catch (e) {
            console.error('Erro ao verificar Grupo de Estoque:', e);
            resposta += `*G.E:* ${grupoEstoquePrincipal}\n`;
        }
    }
    
    try {
        const avnCheck = await executarQuerySql('SELECT cod_item FROM avn WHERE cod_item = ?', [codigoPrincipal]);
        resposta += `*Item AVN:* ${avnCheck.length > 0 ? 'Sim' : 'Não'}\n`;
    } catch (e) {
        console.error('Erro ao verificar AVN:', e);
        resposta += `*Item AVN:* Erro ao consultar\n`;
    }

    // NOVA IMPLEMENTAÇÃO: MAIOR CONSUMIDOR
    try {
        // Busca pelo código tanto no EMS quanto no Código do Material
        const queryMC = `SELECT * FROM maior_usuario_consumidor WHERE UPPER(TRIM(codigo_ems)) = ? OR UPPER(TRIM(codigo_do_material)) = ?`;
        const maiorConsumidor = await executarQuerySql(queryMC, [codigoPrincipal, codigoPrincipal]);
        
        if (maiorConsumidor && maiorConsumidor.length > 0) {
            resposta += `\n*Distribuição de Cotas (Top 3 Consumidores):*\n`;
            
            // Calcula o total mensal para ordenar do maior para o menor (Ranking)
            const cotasCalculadas = maiorConsumidor.map(mc => {
                const qtdBase = mc.quantidade_cota || 0;
                const tipoCota = String(mc.tipo_cota || '').trim().toLowerCase();
                let multiplicador = 1;
                
                if (tipoCota.includes('diario') || tipoCota.includes('diário')) multiplicador = 30;
                else if (tipoCota.includes('semanal')) multiplicador = 4;
                
                return {
                    ...mc,
                    totalCotaMes: qtdBase * multiplicador,
                    qtdBase,
                    tipoCotaOriginal: mc.tipo_cota || 'N/A'
                };
            }).sort((a, b) => b.totalCotaMes - a.totalCotaMes);

            // Pega apenas os 3 setores com maior cota
            const top3 = cotasCalculadas.slice(0, 3);

            // Lista formatada com quebra de linha para melhor leitura no WhatsApp
            top3.forEach(mc => {
                // Formatação: o valor .toFixed(2) vai remover casas decimais inúteis se for inteiro, usando replace.
                const valorMes = mc.totalCotaMes % 1 === 0 ? mc.totalCotaMes : mc.totalCotaMes.toFixed(2);
                const valorBase = mc.qtdBase % 1 === 0 ? mc.qtdBase : mc.qtdBase.toFixed(2);
                
                resposta += `🔹 *${mc.setor_solicitante || 'N/A'}*\n      (${mc.unidade_solicitante || 'N/A'}): ${valorMes}/mês (${valorBase} ${mc.tipoCotaOriginal})\n`;
            });
        }
    } catch (e) {
        console.error('Erro ao consultar Maior Consumidor:', e);
    }

    resposta += `\n`;
    
    if (atasUnicas.size > 0) {
        const temAtaValida = Array.from(atasUnicas.values()).some(ata => ata.ataValida);
        if (temAtaValida) {
            resposta += `*Validade das Atas:*\n`;
            for (const ata of atasUnicas.values()) {
                if (ata.ataValida) {
                    const mod = ata.modalidade && ata.modalidade !== 'N/A' ? ` (${ata.modalidade})` : '';
                    resposta += `Proc: ${ata.processo}${mod}\n`;
                    resposta += `Venc. ata: ${ata.vencimento}\n`;
                    resposta += `Saldo Ata: ${formatarValorBR(ata.saldo)}\n`;
                    
                    if (ata.notes && ata.notes !== 'N/A') resposta += `Notes: ${ata.notes}\n`;
                    if (ata.solicitacaoAe && ata.solicitacaoAe.toUpperCase() !== 'N/A') resposta += `Solicitação (AE): ${ata.solicitacaoAe}\n`;
                    resposta += `\n`;
                }
            }
        } else {
            resposta += `*Validade das Atas:* Nenhuma ata válida cadastrada.\n\n`;
        }
    } else {
        resposta += `*Validade das Atas:* Nenhuma ata válida cadastrada.\n\n`;
    }
    
    if (empenhosValidos.length > 0) {
        resposta += `*Empenho(s) a Receber:*\n`;
        empenhosValidos.forEach(emp => {
            resposta += `Empenho: ${emp.empenho}\n`;
            resposta += `Quantidade: ${formatarValorBR(emp.quantidade)}\n`;
            if (emp.temExtra) {
                resposta += `Qtd. Recebida: ${formatarValorBR(emp.qtdeRecebida)}\n`;
                resposta += `Saldo do Empenho: ${formatarValorBR(emp.saldo, 2)}\n`;
            }
            resposta += `Valor Unit.: ${formatarValorBR(emp.valorUnitario, 4)}\n`;
            resposta += `Fornecedor: ${emp.fornecedor}\n\n`;
        });
    }
    if (temAnoAtual && temAnoAnterior) {
        resposta += `*Aviso de Empenho:* Constam empenhos de ${anoAtual} e ${anoAtual - 1}. Sugere-se avaliar o cancelamento do saldo do empenho de ${anoAtual - 1}.\n\n`;
    }
    if (empenhosAntigos.length > 0) {
        resposta += `*Atenção:* Há empenho(s) antigo(s) na grade. Sugestão de verificação para cancelamento de saldo:\n`;
        empenhosAntigos.forEach(emp => resposta += `- ${emp.empenho} (Fornecedor: ${emp.fornecedor})\n`);
        resposta += `\n`;
    }
    
    if (empenhosAjustadosParaZero.length > 0) {
        resposta += `*Nota:* O(s) empenho(s) a seguir tiveram o saldo ajustado para 0 no sistema (considerados entregues, pois a coluna SALDO_A_EMPENHAR está zerada): ${empenhosAjustadosParaZero.join(', ')}\n\n`;
    }

    if (mapasProcessosObj.comAta.size > 0) {
        resposta += `*Processo(s) com Ata / Contratação Direta*\n`;
        for (const [processo, quantidade] of mapasProcessosObj.comAta.entries()) {
            const detalhes = mapaDetalhesProcessoAta.get(processo) || { qtdeOriginal: 'N/A', saldoAta: 'N/A', fornecedorAta: 'N/A', modalidade: 'N/A' };
            const mod = detalhes.modalidade;
            
            if (mod !== 'N/A' && mod !== '') resposta += `${processo} - ${mod}\n`;
            else resposta += `${processo}\n`;

            if (isModalidadeAlternativa(mod)) {
                resposta += `Quantidade Homologada: ${formatarValorBR(detalhes.qtdeOriginal)}\n`;
                if (detalhes.saldoAta !== 'N/A') resposta += `Saldo: ${formatarValorBR(detalhes.saldoAta)}\n`;
                if (detalhes.fornecedorAta !== 'N/A') resposta += `Fornecedor: ${detalhes.fornecedorAta}\n\n`;
                else resposta += `\n`;
            } else {
                const pregaoAssociado = await buscarPregaoPorSei(processo);
                const refPregao = pregaoAssociado ? `Pregão ${pregaoAssociado.numero_limpo}/${pregaoAssociado.ano}` : 'Pregão não identificado';
                resposta += `Quantidade Homologada: ${formatarValorBR(detalhes.qtdeOriginal)}\n`;
                resposta += `Saldo: ${formatarValorBR(detalhes.saldoAta)}\n`;
                resposta += `Fornecedor: ${detalhes.fornecedorAta}\n`;
                resposta += `${refPregao}\n\n`;
            }
        }
    }
    
    if (mapasProcessosObj.emAndamento.size > 0) {
        resposta += `*Processo(s) em Andamento*\n`;
        for (const [processo, objAndamento] of mapasProcessosObj.emAndamento.entries()) {
            const detalhesAndamento = mapaDetalhesProcessoAndamento.get(processo) || { modalidade2: 'N/A', solicitacao2: 'N/A' };
            const mod2 = detalhesAndamento.modalidade2;
            const sol = objAndamento.solicitacao !== 'N/A' ? objAndamento.solicitacao : detalhesAndamento.solicitacao2;
            
            if (mod2 !== 'N/A' && mod2 !== '') resposta += `${processo} - ${mod2}\n`;
            else resposta += `${processo}\n`;
            
            if (sol && sol !== 'N/A') resposta += `Solicitação: ${sol}\n`;
            resposta += `Quantidade: ${formatarValorBR(objAndamento.quantidade)}\n`;
            
            const pregaoAssociado = await buscarPregaoPorSei(processo);
            const refPregao = pregaoAssociado ? `(PE ${pregaoAssociado.numero_limpo}/${pregaoAssociado.ano})` : '';
            if (refPregao) resposta += `${refPregao}\n`;
            resposta += `\n`;
        }
    }

    if (mapaAes.size > 0) {
        resposta += `*AE(s): | Quantidade*\n`;
        mapaAes.forEach((quantidade, ae) => {
            resposta += `${ae} | ${formatarValorBR(quantidade)}\n`;
        });
        resposta += `\n`;
    } else {
        resposta += `*AE(s):* Nenhum\n\n`;
    }
    
    if (itensSimilares.length > 0) {
        resposta += `*Outros itens similares na grade:*\n`;
        itensSimilares.forEach(similar => {
            let saldoSim = '0';
            let descSim = 'N/A';
            let itemSim = '';
            for (const k in similar) {
                const low = k.trim().toLowerCase();
                if (low === 'saldo_atual' || (low.includes('saldo') && low.includes('atual'))) saldoSim = String(similar[k]);
                if (low.includes('descri')) descSim = String(similar[k]).trim();
                if (low === 'item' || low === 'codigo') itemSim = similar[k];
            }
            resposta += `*${String(itemSim || '').trim()}* - ${descSim} (Estoque ${formatarValorBR(saldoSim)})\n`;
        });
    }
    
    return resposta.trim();
}

function buscarPorCodigoExato(dados, termoBusca) {
    const termoCodigo = limparCodigo(termoBusca);
    const termoCodigoSemZeros = limparCodigoSemZeros(termoBusca);
    return dados.find(linha => {
        let codigoLinhaVal = '';
        for (const k in linha) { 
            const low = k.trim().toLowerCase();
            if (low === 'item' || low === 'codigo') codigoLinhaVal = linha[k]; 
        }
        const codigoLinha = limparCodigo(codigoLinhaVal);
        const codigoLinhaSemZeros = limparCodigoSemZeros(codigoLinhaVal);
        return codigoLinha === termoCodigo || codigoLinhaSemZeros === termoCodigoSemZeros;
    });
}

function buscarPorDescricao(dados, termoBusca) {
    const termoNormalizado = normalizarTexto(termoBusca);
    if (!termoNormalizado) return [];
    const palavrasBusca = termoNormalizado.split(' ').filter(Boolean);
    
    const encontrados = dados.filter(linha => {
        let descricaoVal = '';
        let codigoVal = '';
        let familiaVal = '';
        for (const k in linha) {
            const low = k.trim().toLowerCase();
            if (low.includes('descri')) descricaoVal = linha[k];
            if (low === 'item' || low === 'codigo') codigoVal = linha[k];
            if (low.includes('famili') && !low.includes('sub')) familiaVal = linha[k];
        }
        const descricao = normalizarTexto(String(descricaoVal));
        const codigo = normalizarTexto(String(codigoVal));
        const familia = normalizarTexto(String(familiaVal));
        const textoLinha = `${codigo} ${descricao} ${familia}`;
        return palavrasBusca.every(palavra => textoLinha.includes(palavra));
    });
    
    const unicos = [];
    const codigosVistos = new Set();
    encontrados.forEach(linha => {
        let codigoVal = '';
        for (const k in linha) { 
            const low = k.trim().toLowerCase();
            if (low === 'item' || low === 'codigo') codigoVal = linha[k]; 
        }
        const codigo = limparCodigo(codigoVal);
        if (codigo && !codigosVistos.has(codigo)) {
            codigosVistos.add(codigo);
            unicos.push(linha);
        }
    });
    return unicos;
}

function textoPedeCodigo(termoBusca) {
    const texto = normalizarTexto(termoBusca);
    return (
        texto.includes('codigo da ') || texto.includes('código da ') ||
        texto.includes('codigo do ') || texto.includes('código do ') ||
        texto.includes('qual o codigo') || texto.includes('qual o código') ||
        texto.includes('me fala o codigo') || texto.includes('me fala o código')
    );
}

function extrairDescricaoDoPedidoDeCodigo(termoBusca) {
    const textoOriginal = String(termoBusca || '').trim();
    const padroes = [
        /codigo da (.+)/i, /código da (.+)/i, /codigo do (.+)/i, /código do (.+)/i,
        /qual o codigo da (.+)/i, /qual o código da (.+)/i, /qual o codigo do (.+)/i, /qual o código do (.+)/i,
        /me fala o codigo da (.+)/i, /me fala o código da (.+)/i, /me fala o codigo do (.+)/i, /me fala o código do (.+)/i
    ];
    for (const padrao of padroes) {
        const match = textoOriginal.match(padrao);
        if (match && match[1]) return match[1].trim();
    }
    return textoOriginal;
}

function montarRespostaComCodigos(itensEncontrados, termoBuscaOriginal, pagina = 1) {
    if (!itensEncontrados.length) {
        return `Desculpe, não encontrei nenhuma informação sobre "${termoBuscaOriginal}" na base.`;
    }
    if (itensEncontrados.length === 1) {
        const item = itensEncontrados[0];
        let descricaoItem = '';
        let codigoVal = '';
        for (const k in item) {
            const low = k.trim().toLowerCase();
            if (low.includes('descri')) descricaoItem = String(item[k]);
            if (low === 'item' || low === 'codigo') codigoVal = item[k];
        }
        return `Encontrei 1 item para "${termoBuscaOriginal}":\n\n*${String(codigoVal).trim()}* - ${descricaoItem}`;
    }
    
    const paginaAtual = Math.max(1, Number(pagina) || 1);
    const inicio = (paginaAtual - 1) * LIMITE_RESULTADOS_POR_PAGINA;
    const fim = inicio + LIMITE_RESULTADOS_POR_PAGINA;
    const itensDaPagina = itensEncontrados.slice(inicio, fim);
    
    let resposta = `Encontrei ${itensEncontrados.length} código(s) relacionado(s) a "${termoBuscaOriginal}".\n`;
    resposta += `Mostrando resultados ${inicio + 1} até ${Math.min(fim, itensEncontrados.length)}:\n\n`;
    
    itensDaPagina.forEach(item => {
        let descricaoItem = '';
        let codigoVal = '';
        for (const k in item) {
            const low = k.trim().toLowerCase();
            if (low.includes('descri')) descricaoItem = String(item[k]);
            if (low === 'item' || low === 'codigo') codigoVal = item[k];
        }
        resposta += `*${String(codigoVal).trim()}* - ${descricaoItem}\n`;
    });
    
    if (fim < itensEncontrados.length) {
        resposta += `\nEnvie "mais ${termoBuscaOriginal}" para continuar.`;
    }
    return resposta.trim();
}

function calcularDistanciaLevenshtein(a, b) {
    const textoA = String(a || '');
    const textoB = String(b || '');
    const linhas = textoB.length + 1;
    const colunas = textoA.length + 1;
    const matriz = Array.from({ length: linhas }, () => Array(colunas).fill(0));
    for (let i = 0; i < linhas; i++) matriz[i][0] = i;
    for (let j = 0; j < colunas; j++) matriz[0][j] = j;
    for (let i = 1; i < linhas; i++) {
        for (let j = 1; j < colunas; j++) {
            const custo = textoA[j - 1] === textoB[i - 1] ? 0 : 1;
            matriz[i][j] = Math.min(
                matriz[i - 1][j] + 1,
                matriz[i][j - 1] + 1,
                matriz[i - 1][j - 1] + custo
            );
        }
    }
    return matriz[linhas - 1][colunas - 1];
}

function termoPareceCodigo(termoBusca) {
    const termo = limparCodigo(termoBusca);
    return /^[A-Z]?\d{3,10}$/.test(termo);
}

function calcularScoreDeCodigo(termoBusca, codigoCandidato) {
    const termoOriginal = limparCodigo(termoBusca);
    const candidatoOriginal = limparCodigo(codigoCandidato);
    const termoNumeros = somenteNumeros(termoOriginal);
    const candidatoNumeros = somenteNumeros(candidatoOriginal);
    const termoLetras = somenteLetras(termoOriginal);
    const candidatoLetras = somenteLetras(candidatoOriginal);
    
    let score = 1000;
    const distanciaOriginal = calcularDistanciaLevenshtein(termoOriginal, candidatoOriginal);
    score = Math.min(score, distanciaOriginal * 10);
    
    if (termoNumeros && candidatoNumeros) {
        const distanciaNumeros = calcularDistanciaLevenshtein(termoNumeros, candidatoNumeros);
        score = Math.min(score, distanciaNumeros * 4);
        if (candidatoNumeros === termoNumeros) score -= 30;
        if (candidatoNumeros.endsWith(termoNumeros) || termoNumeros.endsWith(candidatoNumeros)) score -= 20;
        if (candidatoNumeros.includes(termoNumeros) || termoNumeros.includes(candidatoNumeros)) score -= 10;
        if (termoNumeros.length >= 4 && candidatoNumeros.length >= 4) {
            if (termoNumeros.slice(-4) === candidatoNumeros.slice(-4)) score -= 12;
        }
    }
    
    if (termoLetras && candidatoLetras) {
        if (termoLetras === candidatoLetras) score -= 12;
        else score += 8;
    }
    if (!termoLetras && candidatoLetras) score += 3;
    if (termoLetras && !candidatoLetras) score += 6;
    score += Math.abs(candidatoOriginal.length - termoOriginal.length) * 2;
    return score;
}

function buscarSugestoesDeCodigo(dados, termoBusca) {
    const unicos = new Map();
    dados.forEach(linha => {
        let codigoVal = '';
        for (const k in linha) { 
            const low = k.trim().toLowerCase();
            if (low === 'item' || low === 'codigo') codigoVal = linha[k]; 
        }
        const codigo = limparCodigo(codigoVal);
        if (codigo && !unicos.has(codigo)) unicos.set(codigo, linha);
    });
    
    const avaliados = Array.from(unicos.values())
        .map(item => {
            let codigoVal = '';
            for (const k in item) { 
                const low = k.trim().toLowerCase();
                if (low === 'item' || low === 'codigo') codigoVal = item[k]; 
            }
            return { item, score: calcularScoreDeCodigo(termoBusca, codigoVal) };
        })
        .filter(registro => registro.score < 60)
        .sort((a, b) => a.score - b.score);
        
    return avaliados.slice(0, 5).map(registro => registro.item);
}

function montarRespostaComSugestaoDeCodigo(sugestoes, termoOriginal) {
    if (!sugestoes.length) {
        return `Desculpe, não encontrei nenhuma informação sobre "${termoOriginal}" na base.`;
    }
    if (sugestoes.length === 1) {
        let descricaoItem = '';
        let codigoVal = '';
        for (const k in sugestoes[0]) {
            const low = k.trim().toLowerCase();
            if (low.includes('descri')) descricaoItem = String(sugestoes[0][k]);
            if (low === 'item' || low === 'codigo') codigoVal = sugestoes[0][k];
        }
        return `Desculpe, não encontrei nenhuma informação sobre "${termoOriginal}" na base.\n\nVocê quis dizer:\n*${String(codigoVal).trim()}* - ${descricaoItem}`;
    }
    
    let resposta = `Desculpe, não encontrei nenhuma informação sobre "${termoOriginal}" na base.\n\nEncontrei alguns códigos parecidos. Você quis dizer um destes?\n\n`;
    sugestoes.forEach(item => {
        let descricaoItem = '';
        let codigoVal = '';
        for (const k in item) {
            const low = k.trim().toLowerCase();
            if (low.includes('descri')) descricaoItem = String(item[k]);
            if (low === 'item' || low === 'codigo') codigoVal = item[k];
        }
        resposta += `*${String(codigoVal).trim()}* - ${descricaoItem}\n`;
    });
    return resposta.trim();
}

function extrairComandoMais(termoBusca) {
    const textoOriginal = String(termoBusca || '').trim();
    const match = textoOriginal.match(/^mais\s+(.+)$/i);
    if (!match || !match[1]) return null;
    return match[1].trim();
}

async function buscarItem(termoBusca, pagina = 1, idContato = null) {
    try {
        const dados = await carregarDadosDaPlanilha();
        const termoOriginal = String(termoBusca || '').trim();
        if (!termoOriginal) return 'Por favor, informe um item ou uma descrição para pesquisa.';
        
        const termoMais = extrairComandoMais(termoOriginal);
        const termoBase = termoMais || termoOriginal;
        const paginaAtual = termoMais ? Math.max(2, Number(pagina) || 2) : Math.max(1, Number(pagina) || 1);
        
        if (textoPedeCodigo(termoBase)) {
            const descricaoProcurada = extrairDescricaoDoPedidoDeCodigo(termoBase);
            const itensPorDescricao = buscarPorDescricao(dados, descricaoProcurada);
            return montarRespostaComCodigos(itensPorDescricao, descricaoProcurada, paginaAtual);
        }
        
        const itemExato = buscarPorCodigoExato(dados, termoBase);
        if (itemExato && !termoMais) {
            return await montarRespostaDetalhada(dados, itemExato, idContato);
        }
        
        const itensEncontrados = buscarPorDescricao(dados, termoBase);
        
        if (itensEncontrados.length === 1 && !termoMais) {
            return await montarRespostaDetalhada(dados, itensEncontrados[0], idContato);
        }
        
        if (itensEncontrados.length > 1) {
            const inicio = (paginaAtual - 1) * LIMITE_RESULTADOS_POR_PAGINA;
            const fim = inicio + LIMITE_RESULTADOS_POR_PAGINA;
            const itensDaPagina = itensEncontrados.slice(inicio, fim);
            
            if (!itensDaPagina.length) return `Não há mais resultados para "${termoBase}".`;
            
            let resposta = `Encontrei ${itensEncontrados.length} opções diferentes para "${termoBase}". Por favor, me informe qual destes códigos você deseja detalhar:\n\n`;
            itensDaPagina.forEach(item => {
                let saldo = '0';
                let descricaoItem = '';
                let codigoVal = '';
                for (const k in item) {
                    const low = k.trim().toLowerCase();
                    if (low === 'saldo_atual' || (low.includes('saldo') && low.includes('atual'))) saldo = String(item[k]);
                    if (low.includes('descri')) descricaoItem = String(item[k]);
                    if (low === 'item' || low === 'codigo') codigoVal = item[k];
                }
                resposta += `*${String(codigoVal).trim()}* - ${descricaoItem} (Estoque ${formatarValorBR(saldo)})\n`;
            });
            resposta += `\n*(Mostrando resultados ${inicio + 1} a ${Math.min(fim, itensEncontrados.length)} de ${itensEncontrados.length})*`;
            if (fim < itensEncontrados.length) resposta += `\nEnvie "mais ${termoBase}" para continuar`;
            return resposta.trim();
        }
        
        if (termoPareceCodigo(termoBase) && !termoMais) {
            const sugestoes = buscarSugestoesDeCodigo(dados, termoBase);
            return montarRespostaComSugestaoDeCodigo(sugestoes, termoBase);
        }
        
        return `Desculpe, não encontrei nenhuma informação sobre "${termoBase}" na base.`;
    } catch (erro) {
        console.error('Erro ao ler do BD:', erro);
        return 'Ocorreu um erro ao tentar acessar o banco de dados.';
    }
}

async function buscarItensEmLote(codigos = [], idContato = null) {
    const lista = Array.isArray(codigos) ? codigos.map(codigo => String(codigo || '').trim()).filter(Boolean) : [];
    if (!lista.length) return [];
    
    const resultados = [];
    for (const codigo of lista) {
        resultados.push({ codigo, resposta: await buscarItem(codigo, 1, idContato) });
    }
    return resultados;
}

async function contarItensGrade() {
    try {
        const dados = await carregarDadosDaPlanilha();
        const codigosVistos = new Set();
        dados.forEach(linha => {
            let codigoVal = '';
            for (const k in linha) { 
                const low = k.trim().toLowerCase();
                if (low === 'item' || low === 'codigo') codigoVal = linha[k]; 
            }
            const codigo = String(codigoVal || '').trim();
            if (codigo) codigosVistos.add(codigo);
        });
        return codigosVistos.size;
    } catch (erro) {
        console.error('Erro ao contar a grade:', erro);
        return 0;
    }
}

async function obterDadosBrutosItem(termoBusca) {
    const dados = await carregarDadosDaPlanilha();
    const principal = buscarPorCodigoExato(dados, termoBusca);
    
    if (!principal) return null;
    
    let codigoPrincipal = '';
    let descricaoItem = 'N/A';
    let saldoAtual = '0';
    let cmm12 = '0';
    let saldoEmDias = '0';
    let obs = 'Nenhuma';
    let familiaPrincipal = '';
    
    for (const k in principal) {
        const low = k.trim().toLowerCase();
        if (low === 'item' || low === 'codigo') codigoPrincipal = String(principal[k]).trim().toUpperCase();
        if (low.includes('descri')) descricaoItem = String(principal[k]).trim();
        if (low === 'saldo_atual' || (low.includes('saldo') && low.includes('atual'))) saldoAtual = String(principal[k]).trim();
        if (low === 'cmm12' || (low.includes('cmm12') && !low.includes('atrib'))) cmm12 = String(principal[k]).trim();
        if (low === 'saldo_em_dias') saldoEmDias = String(principal[k]).trim();
        if (low === 'obs' || low === 'observacao' || low === 'observações') obs = String(principal[k]).trim();
        
        if (low === 'familia' || low === 'família') familiaPrincipal = String(principal[k]).trim();
        else if (!familiaPrincipal && low.includes('famili') && !low.includes('sub')) familiaPrincipal = String(principal[k]).trim();
        else if (!familiaPrincipal && (low === 'c_5' || low === 'coluna_5' || low === 'c_4' || low === 'coluna_4')) familiaPrincipal = String(principal[k]).trim();
    }
    
    const linhasDoMesmoItem = dados.filter(linha => {
        let codigoLinhaVal = '';
        for (const k in linha) { 
            const low = k.trim().toLowerCase();
            if (low === 'item' || low === 'codigo') codigoLinhaVal = linha[k]; 
        }
        return String(codigoLinhaVal || '').trim().toUpperCase() === codigoPrincipal;
    });
    
    const mapaSolicitacoesProcesso = new Map();
    linhasDoMesmoItem.forEach(linha => {
        let procAta = '';
        let solNotes = '';
        let solAe = '';
        for (const k in linha) {
            const low = k.trim().toLowerCase();
            if (low === 'processo_com_ata' || low === 'processo') procAta = linha[k];
            if (low === 'solicitacao' || (!solNotes && (low === 'notes' || low === 'observacao' || low === 'obs'))) solNotes = linha[k];
            if (low.includes('solicita') && low.includes('_1')) solAe = linha[k];
        }
        procAta = String(procAta || '').trim();
        
        if (deveIgnorarProcesso(procAta)) procAta = '';
        
        solNotes = String(solNotes || '').trim();
        solAe = String(solAe || '').trim();
        if (procAta && procAta.toUpperCase() !== 'N/A') {
            const atual = mapaSolicitacoesProcesso.get(procAta) || { solNotes: 'N/A', solAe: 'N/A' };
            if (solNotes && solNotes !== '0' && solNotes.toUpperCase() !== 'N/A') atual.solNotes = solNotes;
            if (solAe && solAe !== '0' && solAe.toUpperCase() !== 'N/A') atual.solAe = solAe;
            mapaSolicitacoesProcesso.set(procAta, atual);
        }
    });
    
    let linhaComAta = principal;
    for (const linha of linhasDoMesmoItem) {
        let venc = '';
        let procA = '';
        for (const k in linha) {
            const low = k.trim().toLowerCase();
            if (low === 'venc_ata' || (!venc && (low.includes('venc') && low.includes('ata')))) venc = linha[k];
            if (low === 'processo_com_ata' || low === 'processo') procA = linha[k];
        }
        if (deveIgnorarProcesso(procA)) continue;
        venc = String(venc || '').trim();
        if (venc && venc !== '0' && venc.toUpperCase() !== 'N/A') {
            linhaComAta = linha;
            break;
        }
    }
    
    let vencVal = '';
    let saldoAtaVal = '';
    let processoAtaStr = '';
    let modalidadeStr = '';
    for (const k in linhaComAta) {
        const low = k.trim().toLowerCase();
        if (low === 'venc_ata' || (!vencVal && (low.includes('venc') && low.includes('ata')))) vencVal = linhaComAta[k];
        if (low === 'saldo_da_ata' || (!saldoAtaVal && (low.includes('saldo') && low.includes('ata')))) saldoAtaVal = linhaComAta[k];
        if (low === 'processo_com_ata' || low === 'processo') processoAtaStr = linhaComAta[k];
        if (low === 'modalidade') modalidadeStr = linhaComAta[k];
    }
    
    processoAtaStr = String(processoAtaStr || '').trim();
    const vencimentoAta = formatarDataExcel(vencVal);
    const saldoAta = (saldoAtaVal === undefined || saldoAtaVal === null || String(saldoAtaVal).trim() === '' || String(saldoAtaVal).trim().toUpperCase() === 'N/A') ? '0' : String(saldoAtaVal).trim();
    const processoAta = (processoAtaStr && processoAtaStr !== '0') ? processoAtaStr : 'N/A';
    const modalidadeAta = (String(modalidadeStr || '').trim() && String(modalidadeStr || '').trim() !== '0') ? String(modalidadeStr || '').trim() : 'N/A';
    
    const solicitacoesVinculadas = mapaSolicitacoesProcesso.get(processoAta) || { solNotes: 'N/A', solAe: 'N/A' };
    const solicitacaoNotesAta = solicitacoesVinculadas.solNotes;
    const solicitacaoAeAta = solicitacoesVinculadas.solAe;
    
    const mapaProcessos = montarMapaDeProcessos(linhasDoMesmoItem);
    const mapaAes = montarMapaDeAes(linhasDoMesmoItem);
    const listaEmpenhosBruta = montarListaDeEmpenhos(linhasDoMesmoItem);
    
    const dadosEmpenhosExtra = await carregarDadosEmpenhosExcel();
    const empenhosDoItem = dadosEmpenhosExtra.filter(e => String(e['COD_ITEM'] || '').trim().toUpperCase() === codigoPrincipal);
    
    let ultimaDataObj = null;
    let ultimaDataTexto = 'Não informada';
    empenhosDoItem.forEach(e => {
        const valData = e['DATA_ULT_ENTRADA'];
        if (valData) {
            let dataLocal = null;
            if (typeof valData === 'number') {
                dataLocal = new Date((valData - 25569) * 86400 * 1000);
            } else {
                const txt = String(valData).trim();
                const partesBr = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                if (partesBr) dataLocal = new Date(`${partesBr[3]}-${partesBr[2]}-${partesBr[1]}T00:00:00`);
                else dataLocal = new Date(txt);
            }
            if (dataLocal && !isNaN(dataLocal.getTime())) {
                if (!ultimaDataObj || dataLocal.getTime() > ultimaDataObj.getTime()) {
                    ultimaDataObj = dataLocal;
                    ultimaDataTexto = formatarDataExcel(valData);
                }
            }
        }
    });

    return {
        codigo: codigoPrincipal,
        descricao: descricaoItem,
        saldoAtual: obterValorOuPadrao(saldoAtual),
        cmm12: obterValorOuPadrao(cmm12),
        saldoEmDias: obterValorOuPadrao(saldoEmDias),
        obs: obs || 'Nenhuma',
        dataUltimaEntrada: ultimaDataTexto,
        vencimentoAta,
        saldoAta,
        processoAta,
        modalidadeAta,
        solicitacaoNotesAta,
        solicitacaoAeAta,
        processosEmAndamento: Array.from(mapaProcessos.entries()).map(([k, v]) => `${k} (Qtd: ${v})`).join(', ') || 'Nenhum',
        aesEmAndamento: Array.from(mapaAes.entries()).map(([k, v]) => `${k} (Qtd: ${v})`).join(', ') || 'Nenhum',
        empenhos: listaEmpenhosBruta.map(e => `${e.empenho} (${e.quantidade})`).join(', ') || 'Nenhum'
    };
}

async function buscarAtasPorVencimento(diasAlvo, idContato = null) {
    try {
        const dados = await carregarDadosDaPlanilha();
        const numDias = parseFloat(diasAlvo);
        
        if (isNaN(numDias) || numDias < 0) {
            return { texto: "Por favor, informe um número válido de dias (ex: 15, 30.5).", arquivo: null };
        }
        
        const hojeAlvo = new Date();
        hojeAlvo.setHours(0, 0, 0, 0);
        hojeAlvo.setDate(hojeAlvo.getDate() + numDias);
        
        if (String(diasAlvo).includes('.')) {
            if (hojeAlvo.getDay() === 6) hojeAlvo.setDate(hojeAlvo.getDate() + 2);
            else if (hojeAlvo.getDay() === 0) hojeAlvo.setDate(hojeAlvo.getDate() + 1);
        }
        
        const tempoAlvo = hojeAlvo.getTime();
        const resultados = new Map();
        
        dados.forEach(linha => {
            let vencVal = '';
            let codigoVal = '';
            let descricaoVal = '';
            let processoAtaStr = '';
            
            for (const k in linha) {
                const low = k.trim().toLowerCase();
                if (low === 'venc_ata' || (!vencVal && (low.includes('venc') && low.includes('ata')))) vencVal = linha[k];
                if (low === 'item' || low === 'codigo') codigoVal = linha[k];
                if (low.includes('descri')) descricaoVal = linha[k];
                if (low === 'processo_com_ata' || (!processoAtaStr && (low.includes('processo') && low.includes('ata')))) processoAtaStr = linha[k];
            }
            
            if (deveIgnorarProcesso(processoAtaStr)) return;
            
            const vencTxt = String(vencVal || '').trim();
            if (vencTxt && vencTxt !== '0' && vencTxt.toUpperCase() !== 'N/A') {
                const dataJs = extrairDataJSDeExcel(vencVal);
                if (dataJs && dataJs.getTime() >= tempoAlvo) {
                    const codigo = String(codigoVal).trim().toUpperCase();
                    if (codigo && !resultados.has(codigo)) {
                        resultados.set(codigo, {
                            item: codigo,
                            descricao: String(descricaoVal).trim(),
                            vencimento: formatarDataExcel(vencVal),
                            data_js: dataJs
                        });
                    }
                }
            }
        });
        
        if (resultados.size === 0) {
            return { texto: `Não encontrei itens com atas vigentes que vencem a partir de ${hojeAlvo.toLocaleDateString('pt-BR')}.`, arquivo: null };
        }
        
        const listaOrdenada = Array.from(resultados.values()).sort((a, b) => a.data_js.getTime() - b.data_js.getTime());
        const wsData = [['Item', 'Descrição', 'Vencimento da Ata'], ...listaOrdenada.map(r => [r.item, r.descricao, r.vencimento])];
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.aoa_to_sheet(wsData);
        xlsx.utils.book_append_sheet(wb, ws, "Atas_Vigentes");
        
        const fileName = `atas_validade_${Date.now()}.xlsx`;
        const filePath = path.join(os.tmpdir(), fileName);
        xlsx.writeFile(wb, filePath);
        
        return { texto: `Encontrei ${resultados.size} item(ns) com atas vigentes a partir de ${hojeAlvo.toLocaleDateString('pt-BR')}.\n\nEstou gerando uma planilha Excel com o resultado completo para você.`, arquivo: filePath };
        
    } catch (erro) {
        console.error('Erro ao buscar atas por validade:', erro);
        return { texto: 'Ocorreu um erro ao consultar as atas por validade.', arquivo: null };
    }
}

async function gerarRelatorioEstoque(idContato) {
    try {
        const dados = await carregarDadosDaPlanilha();
        const uniqueItemsMap = new Map();
        
        dados.forEach(linha => {
            let itemVal = '';
            let descVal = '';
            let obsVal = '';
            let vencVal = '';
            let saldoVal = '';
            let empenhoVal = '';
            let modalidadeVal = '';

            for (const k in linha) {
                const low = k.trim().toLowerCase();
                if (low === 'item' || low === 'codigo') itemVal = linha[k];
                if (low.includes('descri')) descVal = linha[k];
                if (low === 'obs' || low === 'observacao' || low === 'observações') obsVal = linha[k];
                if (low === 'venc_ata' || (!vencVal && (low.includes('venc') && low.includes('ata')))) vencVal = linha[k];
                if (low === 'saldo_da_ata' || (!saldoVal && (low.includes('saldo') && low.includes('ata')))) saldoVal = linha[k];
                if (low === 'num_empenho' || (!empenhoVal && (low === 'num_empenho' || low === 'empenho'))) empenhoVal = linha[k];
                if (low === 'modalidade') modalidadeVal = linha[k];
            }

            const codigo = String(itemVal || '').trim().toUpperCase();
            if (!codigo) return;

            if (!uniqueItemsMap.has(codigo)) {
                uniqueItemsMap.set(codigo, { descricao: String(descVal || '').trim(), obs: String(obsVal || '').trim(), atas: [], empenhos: new Set() });
            }

            const itemData = uniqueItemsMap.get(codigo);
            if (!itemData.obs && String(obsVal || '').trim()) itemData.obs = String(obsVal || '').trim();

            const v = String(vencVal || '').trim();
            if (v && v !== '0' && v.toUpperCase() !== 'N/A') {
                itemData.atas.push({ vencimento: v, saldo: parseNumeroPTBR(saldoVal), modalidade: String(modalidadeVal || '').trim() });
            }

            const empenhoStr = String(empenhoVal || '').trim();
            if (empenhoStr && empenhoStr !== '0' && empenhoStr.toUpperCase() !== 'N/A') {
                itemData.empenhos.add(empenhoStr);
            }
        });

        const obsCounts = {};
        let totalItensParaObs = 0;
        const atasComSaldo = [];
        const atasSemSaldo = [];
        let itensComEmpenhoAnoAtual = 0;
        let itensComEmpenhoAnoAnterior = 0;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const anoAtual = hoje.getFullYear().toString(); 
        const anoAnterior = (hoje.getFullYear() - 1).toString();

        for (const [codigo, data] of uniqueItemsMap.entries()) {
            const obsTexto = data.obs || "sem parâmetro para cálculo";
            obsCounts[obsTexto] = (obsCounts[obsTexto] || 0) + 1;
            totalItensParaObs++;

            let ataValidaEncontrada = null;
            for (const ata of data.atas) {
                let vStr = String(ata.vencimento).trim();
                let dataJs = extrairDataJSDeExcel(vStr);
                if (!dataJs && /^\d{4,5}$/.test(vStr)) dataJs = extrairDataJSDeExcel(Number(vStr));
                if (!dataJs && /^\d{4}-\d{2}-\d{2}/.test(vStr)) dataJs = new Date(vStr + 'T12:00:00');

                if (dataJs && dataJs.getTime() >= hoje.getTime()) {
                    const modUpper = String(ata.modalidade).toUpperCase();
                    const ehModalidadeFechada = modUpper.includes('DISPENSA') || modUpper.includes('INEXIGIBILIDADE') || modUpper.includes('ADESÃO');
                    if (ehModalidadeFechada && ata.saldo <= 0) continue; 
                    ataValidaEncontrada = ata;
                    if (ata.saldo > 0) break;
                }
            }

            if (ataValidaEncontrada) {
                const itemFinal = { 
                    item: codigo, 
                    descricao: data.descricao, 
                    vencimento: formatarDataExcel(ataValidaEncontrada.vencimento) || ataValidaEncontrada.vencimento, 
                    saldo: ataValidaEncontrada.saldo 
                };
                if (ataValidaEncontrada.saldo > 0) atasComSaldo.push(itemFinal);
                else atasSemSaldo.push(itemFinal);
            }

            let temEmpenhoAtual = false;
            let temEmpenhoAnterior = false;
            for (const emp of data.empenhos) {
                if (emp.startsWith(anoAtual)) temEmpenhoAtual = true;
                if (emp.startsWith(anoAnterior)) temEmpenhoAnterior = true;
            }
            if (temEmpenhoAtual) itensComEmpenhoAnoAtual++;
            if (temEmpenhoAnterior) itensComEmpenhoAnoAnterior++;
        }

        const obsAnalise = Object.keys(obsCounts).map(chave => {
            const qtd = obsCounts[chave];
            return { observacao: chave, quantidade: qtd, percentual: ((qtd / totalItensParaObs) * 100).toFixed(2) };
        }).sort((a, b) => b.quantidade - a.quantidade);

        const dadosAgregados = {
            totalItensUnicos: uniqueItemsMap.size,
            analiseObservacoes: obsAnalise,
            atasVigentesComSaldo: atasComSaldo,
            atasVigentesSemSaldo: atasSemSaldo,
            empenhosAnoAtual: itensComEmpenhoAnoAtual,
            empenhosAnoAnterior: itensComEmpenhoAnoAnterior,
            totalLinhasAnalisadas: totalItensParaObs
        };

        const { analisarEstoqueComGroq } = require('./groq');
        const { gerarPDFRelatorioEstoque } = require('./pdfGenerator');

        const insightsIA = await analisarEstoqueComGroq(dadosAgregados);
        const pdfPath = await gerarPDFRelatorioEstoque(dadosAgregados, insightsIA);

        return {
            erro: null,
            pdfPath,
            mensagemResumo: `✅ *Relatório de Estoque Finalizado!*\n\n` +
                            `📊 *Itens Únicos:* ${dadosAgregados.totalItensUnicos}\n` +
                            `🟢 *Atas Vigentes COM Saldo:* ${dadosAgregados.atasVigentesComSaldo.length}\n` +
                            `🔴 *Atas Vigentes SEM Saldo:* ${dadosAgregados.atasVigentesSemSaldo.length}\n\n` +
                            `📝 _Insights gerados pela IA inclusos no PDF anexado._`
        };
    } catch (erro) {
        console.error('Erro em gerarRelatorioEstoque:', erro);
        return { erro: 'Ocorreu um erro ao processar os dados para o relatório de estoque.' };
    }
}

async function gerarPlanilhaAtas(periodoFiltro) {
    try {
        const dados = await carregarDadosDaPlanilha();
        if (!dados || dados.length === 0) return { erro: 'A base de dados de estoque/saldo está vazia no momento.' };

        const textoFiltro = String(periodoFiltro || '').trim();
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let dataInicio = null, dataFim = null;
        if (/^\d+$/.test(textoFiltro) && Number(textoFiltro) <= 1000) {
            dataInicio = new Date(hoje);
            dataFim = new Date(hoje);
            dataFim.setDate(dataFim.getDate() + parseInt(textoFiltro, 10));
        } else if (/^(\d{1,2})\/(\d{4})$/.test(textoFiltro)) {
            const m = textoFiltro.match(/^(\d{1,2})\/(\d{4})$/);
            dataInicio = new Date(parseInt(m[2], 10), parseInt(m[1], 10) - 1, 1, 0, 0, 0);
            dataFim = new Date(parseInt(m[2], 10), parseInt(m[1], 10), 0, 23, 59, 59);
        } else if (/^\d{4}$/.test(textoFiltro)) {
            const ano = parseInt(textoFiltro, 10);
            dataInicio = new Date(ano, 0, 1, 0, 0, 0);
            dataFim = new Date(ano, 11, 31, 23, 59, 59);
        } else if (/^(\d{2}\/\d{2}\/\d{4})\s*(?:a|-|até)\s*(\d{2}\/\d{2}\/\d{4})$/i.test(textoFiltro)) {
            const match = textoFiltro.match(/^(\d{2}\/\d{2}\/\d{4})\s*(?:a|-|até)\s*(\d{2}\/\d{2}\/\d{4})$/i);
            dataInicio = extrairDataJSDeExcel(match[1]);
            dataFim = extrairDataJSDeExcel(match[2]);
            if (dataFim) dataFim.setHours(23, 59, 59);
        }

        const linhasFiltradas = [];
        const chavesUnicas = new Set(); 

        dados.forEach(linha => {
            let item = '', descricao = '', saldo_atual = 0, cmm12 = 0, saldo_em_dias = 0, obs = '';
            let processo_com_ata = '', fornecedor_ata = '', qtde_original = 0, saldo_da_ata = 0;
            let preco_unitario = 0, venc_ata_raw = '', processo_em_andamento = '', modalidade_2 = '', qtde_nova = 0;

            for (const k in linha) {
                const low = k.trim().toLowerCase();
                const val = linha[k];
                if (low === 'item' || low === 'codigo') item = String(val || '').trim();
                if (low.includes('descri')) descricao = String(val || '').trim();
                if (low === 'saldo_atual' || (low.includes('saldo') && low.includes('atual'))) saldo_atual = parseNumeroPTBR(val);
                if (low.includes('cmm12')) cmm12 = parseNumeroPTBR(val);
                if (low === 'saldo_em_dias' || (low.includes('saldo') && low.includes('dias'))) saldo_em_dias = parseNumeroPTBR(val);
                if (low === 'obs' || low === 'observacao' || low === 'observações') obs = String(val || '').trim();
                if (low === 'processo_com_ata' || low === 'processo') processo_com_ata = String(val || '').trim();
                if (low.includes('fornecedor')) fornecedor_ata = String(val || '').trim();
                if (low === 'qtde_original' || (low.includes('qtde') && low.includes('original'))) qtde_original = parseNumeroPTBR(val);
                if (low === 'saldo_da_ata' || (!saldo_da_ata && (low.includes('saldo') && low.includes('ata')))) saldo_da_ata = parseNumeroPTBR(val);
                if (low === 'preco_unitario' || low.includes('unitario') || low.includes('unitário')) preco_unitario = parseNumeroPTBR(val);
                if (low === 'venc_ata' || (!venc_ata_raw && (low.includes('venc') && low.includes('ata')))) venc_ata_raw = val;
                if (low === 'processo_em_andamento' || low === 'processo_2' || (low.includes('processo') && low.includes('andamento'))) processo_em_andamento = String(val || '').trim();
                if (low === 'modalidade_2' || low.includes('modalidade_2')) modalidade_2 = String(val || '').trim();
                if (low === 'qtde' || low === 'qtde_2' || low === 'quantidade') qtde_nova = parseNumeroPTBR(val);
            }

            if (!item) return;

            const dataVencJs = extrairDataJSDeExcel(venc_ata_raw);
            const venc_ata_formatada = formatarDataExcel(venc_ata_raw);

            if (dataInicio && dataFim) {
                if (!dataVencJs) return;
                if (dataVencJs.getTime() < dataInicio.getTime() || dataVencJs.getTime() > dataFim.getTime()) return;
            }

            const chaveDedup = `${item}-${processo_com_ata}-${venc_ata_raw}`;
            if (chavesUnicas.has(chaveDedup)) return;
            chavesUnicas.add(chaveDedup);

            let sugestao = '';
            if (processo_em_andamento && processo_em_andamento !== '0' && processo_em_andamento.toUpperCase() !== 'N/A') {
                sugestao = 'AGUARDAR NOVO PROCESSO';
            } else if (cmm12 === 0) {
                sugestao = 'NÃO RENOVAR (SEM DEMANDA)';
            } else if (saldo_da_ata <= 0) {
                sugestao = 'ATA ZERADA (URGENTE)';
            } else {
                sugestao = 'AVALIAR RENOVAÇÃO';
            }

            linhasFiltradas.push({
                item, descricao, saldo_atual, cmm12, saldo_em_dias, obs, processo_com_ata, fornecedor_ata,
                qtde_original, saldo_da_ata, preco_unitario, venc_ata: venc_ata_formatada,
                processos_novos: processo_em_andamento, modalidade_nova: modalidade_2,
                qtde_nova, sugestao, destacarVermelho: saldo_da_ata < cmm12
            });
        });

        if (linhasFiltradas.length === 0) return { erro: `Nenhuma ata encontrada para o período informado: "${periodoFiltro}".` };

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Atas');

        worksheet.columns = [
            { header: 'Item', key: 'item', width: 12 },
            { header: 'Descrição', key: 'descricao', width: 45 },
            { header: 'Saldo Atual', key: 'saldo_atual', width: 15 },
            { header: 'CMM 12', key: 'cmm12', width: 12 },
            { header: 'Saldo em Dias', key: 'saldo_em_dias', width: 15 },
            { header: 'Observação', key: 'obs', width: 20 },
            { header: 'Processo com Ata', key: 'processo_com_ata', width: 22 },
            { header: 'Fornecedor da Ata', key: 'fornecedor_ata', width: 45 },
            { header: 'Qtde Original', key: 'qtde_original', width: 15 },
            { header: 'Saldo da Ata', key: 'saldo_da_ata', width: 15 },
            { header: 'Preço Unitário', key: 'preco_unitario', width: 15 },
            { header: 'Vencimento da Ata', key: 'venc_ata', width: 20 },
            { header: 'Processos Novos', key: 'processos_novos', width: 22 },
            { header: 'Modalidade', key: 'modalidade_nova', width: 20 },
            { header: 'Quantidade', key: 'qtde_nova', width: 15 },
            { header: 'Sugestão da Hera', key: 'sugestao', width: 35 }
        ];

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAECEE' } };

        linhasFiltradas.forEach(linha => {
            const row = worksheet.addRow(linha);
            if (linha.destacarVermelho) {
                row.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFADBD8' } };
                    cell.font = { color: { argb: 'FF900C3F' } };
                });
            }
        });

        const filePath = path.join(os.tmpdir(), `atas_geradas_${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(filePath);

        return { arquivo: filePath, totalLinhas: linhasFiltradas.length };

    } catch (erro) {
        console.error('Erro ao gerar planilha de atas:', erro);
        return { erro: 'Ocorreu um erro interno ao gerar a planilha de atas.' };
    }
}

// NOVA FUNÇÃO EXCLUSIVA PARA O DISPARO DIÁRIO POR PLANEJADOR
async function gerarPlanilhaAlertasPlanejadores() {
    try {
        const dados = await carregarDadosDaPlanilha();
        if (!dados || dados.length === 0) return { erro: 'A base de dados de estoque está vazia.' };

        const configEquipe = await executarQuerySql(`SELECT * FROM config_equipe`);

        const mapaPlanejadores = new Map();
        const resumo = { totalItens: 0, acaoImediata: 0, atasVencendo: 0 };
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        for (const linha of dados) {
            let item = '', descricao = '', familia = '', colA = '', saldo_atual = 0, cmm12 = 0;
            let processo_com_ata = '', venc_ata_raw = '', num_empenho = '';

            const chaves = Object.keys(linha);
            if (chaves.length > 0) colA = String(linha[chaves[0]] || '');

            for (const k in linha) {
                const low = k.trim().toLowerCase();
                const val = linha[k];
                if (low === 'item' || low === 'codigo') item = String(val || '').trim().toUpperCase();
                if (low.includes('descri')) descricao = String(val || '').trim();
                if (low === 'familia' || low === 'família' || (!familia && low.includes('famili') && !low.includes('sub'))) familia = String(val || '').trim();
                if (low === 'saldo_atual' || (low.includes('saldo') && low.includes('atual'))) saldo_atual = parseNumeroPTBR(val);
                if (low.includes('cmm12') && !low.includes('atrib')) cmm12 = parseNumeroPTBR(val);
                if (low === 'processo_com_ata' || low === 'processo') processo_com_ata = String(val || '').trim();
                if (low === 'venc_ata' || (!venc_ata_raw && (low.includes('venc') && low.includes('ata')))) venc_ata_raw = val;
                if (low === 'num_empenho' || (!num_empenho && (low === 'num_empenho' || low === 'empenho'))) num_empenho = String(val || '').trim();
            }

            if (!item) continue;

            let donoItem = null, donoFam = null, donoFAR = null;
            const itemLimpo = limparRefParaPlanejador(item);
            const famLimpa = limparRefParaPlanejador(familia);
            const colALimpa = limparRefParaPlanejador(colA);

            for (const row of configEquipe) {
                let colRef = '', colNome = '';
                const chk = Object.keys(row);
                if (chk.length > 0) colRef = String(row[chk[0]] || '');
                if (chk.length > 1) colNome = String(row[chk[1]] || '');

                for (const k in row) {
                    const low = k.trim().toLowerCase();
                    if (low.includes('vazia')) continue;
                    if (low === 'familia' || low === 'grupo_de_estoque' || low === 'item' || low === 'ref') colRef = String(row[k] || '');
                    else if (!colRef && (low.includes('famili') || low.includes('grupo') || low.includes('item') || low.includes('ref')) && !low.includes('sub')) colRef = String(row[k] || '');

                    if (low === 'responsavel' || low === 'planejador' || low === 'nome') colNome = String(row[k] || '');
                    else if (!colNome && (low.includes('responsavel') || low.includes('planejador') || low.includes('nome'))) colNome = String(row[k] || '');
                }

                const refLimpo = limparRefParaPlanejador(colRef);
                const nomePlanejador = colNome.trim();

                if (refLimpo === 'FAR') donoFAR = nomePlanejador;
                if (refLimpo === itemLimpo && itemLimpo !== '') donoItem = nomePlanejador;
                if (refLimpo === famLimpa && famLimpa !== '' && !donoFam) donoFam = nomePlanejador;
            }
            const planejador = (colALimpa === 'FAR' && donoFAR) ? donoFAR : (donoItem || donoFam || 'Sem dono cadastrado');

            const dataVencJs = extrairDataJSDeExcel(venc_ata_raw);
            const procValido = isProcessoValido(processo_com_ata) && !deveIgnorarProcesso(processo_com_ata);
            const temEmpenho = num_empenho && num_empenho !== '0' && num_empenho.toUpperCase() !== 'N/A';

            let isAcaoImediata = false;
            let isAtaVencendo = false;
            let diasParaVencer = 9999;

            // Classificação: Ação Imediata
            if (saldo_atual <= 0 && cmm12 > 0 && !procValido && !temEmpenho) {
                isAcaoImediata = true;
                resumo.acaoImediata++;
            }

            // Classificação: Ata Vencendo (<= 60 dias)
            if (dataVencJs) {
                const diffTime = dataVencJs.getTime() - hoje.getTime();
                diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diasParaVencer >= 0 && diasParaVencer <= 60) {
                    isAtaVencendo = true;
                    resumo.atasVencendo++;
                }
            }

            resumo.totalItens++;

            if (!mapaPlanejadores.has(planejador)) {
                mapaPlanejadores.set(planejador, []);
            }

            mapaPlanejadores.get(planejador).push({
                item, descricao, saldo_atual, cmm12,
                processo_com_ata, venc_ata: formatarDataExcel(venc_ata_raw),
                num_empenho, isAcaoImediata, isAtaVencendo, diasParaVencer
            });
        }

        const workbook = new ExcelJS.Workbook();

        // 1. Aba de Resumo Executivo
        const wsResumo = workbook.addWorksheet('RESUMO GERAL');
        wsResumo.columns = [
            { header: 'Métrica Operacional', key: 'metrica', width: 45 },
            { header: 'Quantidade', key: 'qtd', width: 20 }
        ];
        wsResumo.getRow(1).font = { bold: true };
        wsResumo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };
        wsResumo.addRow({ metrica: 'Total de Itens Monitorados na Grade', qtd: resumo.totalItens });
        wsResumo.addRow({ metrica: '🚨 Ação Imediata (Zerados s/ Proc e s/ Emp)', qtd: resumo.acaoImediata }).font = { color: { argb: 'FFC0392B' }, bold: true };
        wsResumo.addRow({ metrica: '⚠️ Atas Vencendo (<= 60 dias)', qtd: resumo.atasVencendo }).font = { color: { argb: 'FFF39C12' }, bold: true };

        const nomesPlanejadores = Array.from(mapaPlanejadores.keys()).sort();

        // 2. Abas Individuais por Planejador
        for (const plan of nomesPlanejadores) {
            // Tratamento do nome da aba para não estourar o limite do Excel (31 caracteres) e remover caracteres proibidos
            const nomeAba = plan.replace(/[\\\\/*?\\[\\]]/g, '').substring(0, 31);
            const ws = workbook.addWorksheet(nomeAba);
            
            ws.columns = [
                { header: 'Status / Alerta', key: 'classificacao', width: 22 },
                { header: 'Item', key: 'item', width: 12 },
                { header: 'Descrição', key: 'descricao', width: 55 },
                { header: 'Saldo Atual', key: 'saldo_atual', width: 15 },
                { header: 'CMM 12', key: 'cmm12', width: 15 },
                { header: 'Processo', key: 'processo', width: 22 },
                { header: 'Venc. Ata', key: 'venc_ata', width: 15 },
                { header: 'Empenho', key: 'empenho', width: 18 }
            ];
            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };

            let itensPlanejador = mapaPlanejadores.get(plan);

            // Ordenação: 1º Ação imediata, 2º Atas Vencendo, 3º Demais (por vencimento)
            itensPlanejador.sort((a, b) => {
                if (a.isAcaoImediata && !b.isAcaoImediata) return -1;
                if (!a.isAcaoImediata && b.isAcaoImediata) return 1;
                if (a.isAtaVencendo && !b.isAtaVencendo) return -1;
                if (!a.isAtaVencendo && b.isAtaVencendo) return 1;
                return a.diasParaVencer - b.diasParaVencer;
            });

            itensPlanejador.forEach(i => {
                let classif = '✅ MONITORAR';
                if (i.isAcaoImediata) classif = '🚨 AÇÃO IMEDIATA';
                else if (i.isAtaVencendo) classif = '⚠️ ATA VENCENDO';

                const row = ws.addRow({
                    classificacao: classif,
                    item: i.item,
                    descricao: i.descricao,
                    saldo_atual: formatarValorBR(i.saldo_atual),
                    cmm12: formatarValorBR(i.cmm12),
                    processo: i.processo_com_ata,
                    venc_ata: i.venc_ata,
                    empenho: i.num_empenho
                });

                // Injetando o layout visual nas linhas (Formatação Condicional Fixa)
                if (i.isAcaoImediata) {
                    row.eachCell(cell => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFADBD8' } };
                        cell.font = { color: { argb: 'FF900C3F' }, bold: true };
                    });
                } else if (i.isAtaVencendo) {
                    row.eachCell(cell => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCF3CF' } };
                        cell.font = { color: { argb: 'FFB9770E' }, bold: true };
                    });
                }
            });
        }

        const filePath = path.join(os.tmpdir(), `Relatorio_Planejadores_Alertas_${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(filePath);

        return {
            sucesso: true,
            arquivo: filePath,
            resumo
        };

    } catch (erro) {
        console.error('Erro ao gerar planilha unificada de alertas diários:', erro);
        return { erro: 'Ocorreu um erro interno ao gerar a planilha de alertas.' };
    }
}

module.exports = {
    buscarItem,
    buscarItensEmLote,
    contarItensGrade,
    obterDadosBrutosItem,
    buscarAtasPorVencimento,
    obterPlanejadorResponsavel,
    temAcessoNome,
    verificarPerfilCadAlerta,
    gerarRelatorioEstoque,
    gerarPlanilhaAtas,
    gerarPlanilhaAlertasPlanejadores
};
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDbConnection } = require('./database');

let disparoDeAtasEmAndamento = false;
let ultimoRunIdDisparoAtas = 0;

const limparRef = (texto) => {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .toUpperCase();
};

function gerarRunIdDisparoAtas() {
    ultimoRunIdDisparoAtas += 1;
    return `ATAS-${Date.now()}-${ultimoRunIdDisparoAtas}`;
}

function paraNumero(valor, padrao = 0) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return padrao;
    const texto = String(valor).trim();
    if (/^-?\d+([.,]\d+)?$/.test(texto)) {
        const numero = Number(texto.replace(',', '.'));
        return Number.isFinite(numero) ? numero : padrao;
    }
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : padrao;
}

function calcularSugestaoAE(cmm12) {
    return Math.ceil(paraNumero(cmm12, 0) * 6);
}

function converterDataExcelOuTexto(valor) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return null;
    const texto = String(valor).trim();
    
    const matchBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (matchBr) {
        const [, dia, mes, ano] = matchBr;
        const data = new Date(parseInt(ano, 10), parseInt(mes, 10) - 1, parseInt(dia, 10), 12, 0, 0);
        return isNaN(data.getTime()) ? null : data;
    }

    if (/^\d+([.,]\d+)?$/.test(texto)) {
        const valorNumerico = Number(texto.replace(',', '.'));
        if (!isNaN(valorNumerico) && valorNumerico > 10000) {
            const data = new Date((valorNumerico - 25569) * 86400 * 1000);
            data.setUTCHours(12); 
            return isNaN(data.getTime()) ? null : data;
        }
    }

    const data = new Date(texto);
    return isNaN(data.getTime()) ? null : data;
}

function formatarDataBR(data) {
    if (!(data instanceof Date) || isNaN(data.getTime())) return 'N/A';
    return data.toLocaleDateString('pt-BR');
}

function possuiAERelacionada(linha) {
    return Object.keys(linha).some(chave => {
        const chaveNormalizada = String(chave || '').trim().toUpperCase();
        if (!chaveNormalizada.startsWith('AE')) return false;
        if (chaveNormalizada.includes('QTDE') || chaveNormalizada.includes('EMPENHAR')) return false;
        const valor = linha[chave];
        return valor !== undefined && valor !== null && String(valor).trim() !== '';
    });
}

function deveIgnorarProcesso(processoStr, anoAtual) {
    return false;
}

async function dispararAlertasDeAta(client, isManual = false, nomeTesteFiltro = null, numeroDestinoTeste = null) {
    if (disparoDeAtasEmAndamento) {
        const mensagem = 'Já existe um disparo de atas em andamento.';
        console.warn(`⚠️ ${mensagem}`);
        return `⚠️ ${mensagem}`;
    }

    disparoDeAtasEmAndamento = true;
    const runId = gerarRunIdDisparoAtas();

    try {
        console.log('\n==================================================');
        console.log(`🚀 [${runId}] INICIANDO VARREDURA DE ATAS PELA HERA...`);

        const dataAtual = new Date();
        const diaDaSemana = dataAtual.getDay();

        if (!isManual && !nomeTesteFiltro && (diaDaSemana === 0 || diaDaSemana === 6)) {
            console.log(`⛔ [${runId}] Operação automática interrompida: hoje é final de semana.`);
            return '⛔ Disparo automático cancelado: A Hera está configurada para não enviar alertas no final de semana.';
        }

        const isTesteGlobal = process.env.MODO_TESTE === 'true';
        const isTesteDirecionado = !!nomeTesteFiltro;
        const isTeste = isTesteGlobal || isTesteDirecionado;
        const numeroFlavio = process.env.MEU_NUMERO;

        if (isTeste) {
            console.log(`⚠️ [${runId}] AVISO: MODO TESTE ATIVADO. Mensagens redirecionadas.`);
            if (isTesteDirecionado) console.log(`🎯 [${runId}] Teste direcionado para o planejador: ${nomeTesteFiltro}`);
        }

        const db = getDbConnection();

        const executarQuery = (query) => {
            return new Promise((resolve, reject) => {
                db.all(query, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        let cadDados = [];
        let configDados = [];
        let dados = [];

        try {
            cadDados = await executarQuery("SELECT * FROM config_equipe_cad_alerta");
            configDados = await executarQuery("SELECT * FROM config_equipe");
            dados = await executarQuery("SELECT * FROM planilha_saldoabaixode90dias");
        } catch (err) {
            db.close();
            console.log(`❌ [${runId}] ERRO CRÍTICO: Não foi possível ler as tabelas no banco de dados. Erro: ${err.message}`);
            return `❌ Erro: Tabelas não encontradas no banco de dados hera.db.`;
        }

        db.close();

        const telefones = {};

        cadDados.forEach(linha => {
            const cols = Object.keys(linha);
            if (cols.length < 2) return;

            const nomeRaw = String(linha[cols[0]] || '').trim();
            const nomeLimpo = limparRef(nomeRaw);
            const telRaw = String(linha[cols[1]] || '').trim();

            if (nomeLimpo && telRaw) {
                let numeroFinal;
                if (telRaw.includes('@')) {
                    numeroFinal = telRaw.replace(/\s/g, '');
                } else {
                    const soNumeros = telRaw.replace(/\D/g, '');
                    if (soNumeros.length >= 10) {
                        numeroFinal = `${soNumeros}@c.us`;
                    }
                }

                if (numeroFinal) {
                    telefones[nomeLimpo] = {
                        nomeReal: nomeRaw,
                        numero: numeroFinal
                    };
                }
            }
        });

        const regras = [];
        const supervisores = [];

        configDados.forEach(linha => {
            const cols = Object.keys(linha);
            if (cols.length < 2) return;

            const referenciaRaw = String(linha[cols[0]] || '').trim();
            const referenciaLimpa = limparRef(referenciaRaw);
            const nomeResponsavelRaw = String(linha[cols[1]] || '').trim();
            const nomeResponsavelLimpo = limparRef(nomeResponsavelRaw);

            const contatoEncontrado = telefones[nomeResponsavelLimpo];

            if (!contatoEncontrado && referenciaLimpa !== '') return;

            if (referenciaLimpa === 'TODASASFAMILIAS') {
                supervisores.push({
                    nome: contatoEncontrado.nomeReal,
                    telefone: contatoEncontrado.numero
                });
            } else if (referenciaLimpa !== 'TESTES' && referenciaLimpa !== '') {
                regras.push({
                    ref: referenciaLimpa,
                    nome: contatoEncontrado.nomeReal,
                    telefone: contatoEncontrado.numero,
                    refOriginal: referenciaRaw
                });
            }
        });

        const alertasPorTelefone = {};
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const anoAtual = hoje.getFullYear();

        const itensAgrupados = {};
        dados.forEach(linha => {
            let isMai = false;
            let itemOriginal = '';
            for (const k in linha) {
                const low = k.trim().toLowerCase();
                if (low === 'local' || low === 'c_1') {
                    if (String(linha[k] || '').trim().toUpperCase() === 'MAI') isMai = true;
                }
                if (low === 'item') itemOriginal = String(linha[k] || '').trim();
            }
            if (isMai || !itemOriginal) return;

            if (!itensAgrupados[itemOriginal]) itensAgrupados[itemOriginal] = [];
            itensAgrupados[itemOriginal].push(linha);
        });

        let itensProcessados = 0;
        let itensSemDono = 0;

        for (const itemOriginal in itensAgrupados) {
            const linhasDoMesmoItem = itensAgrupados[itemOriginal];
            const linhaBase = linhasDoMesmoItem[0];
            const itemLimpo = limparRef(itemOriginal);
            
            let familiaOriginal = '';
            let grupoEstoqueOriginal = '';
            let saldoEmDiasRaw = 0;
            let cmm12Raw = 0;
            let descricao = '';
            let saldoAtual = '0';
            let notesItem = 'SEM NOTES';

            for (const k in linhaBase) {
                const low = k.trim().toLowerCase();
                if (low === 'familia' || low === 'família' || low === 'c_familia') {
                    familiaOriginal = String(linhaBase[k] || '').trim();
                } else if (!familiaOriginal && low.includes('famili') && !low.includes('sub')) {
                    familiaOriginal = String(linhaBase[k] || '').trim();
                }

                if (low === 'grupo_de_estoque' || low === 'grupo de estoque') {
                    grupoEstoqueOriginal = String(linhaBase[k] || '').trim();
                } else if (!grupoEstoqueOriginal && (low.includes('grupo') && !low.includes('sub'))) {
                    grupoEstoqueOriginal = String(linhaBase[k] || '').trim();
                }

                if (low === 'saldo em dias' || low === 'saldo_em_dias') saldoEmDiasRaw = linhaBase[k];
                if (low === 'cmm12') cmm12Raw = linhaBase[k];
                if (low.includes('descri')) descricao = String(linhaBase[k] || '').trim();
                if (low === 'saldo atual' || low === 'saldo_atual') saldoAtual = String(linhaBase[k] || '').trim();
                
                if (low === 'notes' || low === 'c_19') {
                    const val = String(linhaBase[k] || '').trim();
                    if (val !== '' && val.toUpperCase() !== 'N/A') notesItem = val;
                }
            }

            const familiaLimpa = limparRef(familiaOriginal);
            const grupoLimpo = limparRef(grupoEstoqueOriginal);
            const saldoEmDias = paraNumero(saldoEmDiasRaw, 0);
            const cmm12 = paraNumero(cmm12Raw, 0);
            const saldoAtualNum = paraNumero(saldoAtual, 0);
            
            if (saldoAtualNum === 0 && cmm12 === 0) continue;
            if (saldoEmDias > 90) continue;

            const naoTemAE = !linhasDoMesmoItem.some(l => possuiAERelacionada(l));

            let temAnoAtual = false;
            let temAnoAnterior = false;
            const empenhosAntigos = new Set();

            let temAtaValida = false;
            let temSaldoAta = false;
            const atasDetalhadas = new Set();

            const mapaSolicitacoesProcesso = new Map();
            linhasDoMesmoItem.forEach(l => {
                const chaves = Object.keys(l);
                let proc = '';
                let solNotes = '';
                let solAe = '';
                
                for (const k of chaves) {
                    const low = k.trim().toLowerCase();
                    if (!proc && (low === 'processo_com_ata' || low === 'processocomata' || low === 'processo com ata' || low === 'processo' || low === 'processo ata' || low === 'num. processo' || low === 'num_processo')) proc = l[k];
                    if (!solNotes && (low === 'notes' || low === 'solicitação' || low === 'solicitacao' || low === 'solicitaçao' || low === 'solicita o')) solNotes = l[k];
                    if (!solAe && (low === 'solicitação_1' || low === 'solicitacao_1' || low === 'solicitaçao_1' || low === 'solicita o_1')) solAe = l[k];
                }
                proc = String(proc || '').trim();
                
                if (deveIgnorarProcesso(proc, anoAtual)) proc = '';

                solNotes = String(solNotes || '').trim();
                solAe = String(solAe || '').trim();
                
                if (proc && proc.toUpperCase() !== 'N/A') {
                    const atual = mapaSolicitacoesProcesso.get(proc) || { solNotes: 'N/A', solAe: 'N/A' };
                    if (solNotes && solNotes !== '0' && solNotes.toUpperCase() !== 'N/A') atual.solNotes = solNotes;
                    if (solAe && solAe !== '0' && solAe.toUpperCase() !== 'N/A') atual.solAe = solAe;
                    mapaSolicitacoesProcesso.set(proc, atual);
                }
            });

            linhasDoMesmoItem.forEach(l => {
                let numEmpenho = '';
                let fornecedor = '';
                let vencAtaRawLoop = '';
                let processoAtaLoop = '';
                let modalidadeStr = '';
                let saldoAtaLoop = '';

                const chaves = Object.keys(l);
                for (const k of chaves) {
                    const low = k.trim().toLowerCase();
                    if (low === 'num.empenho' || low === 'num_empenho' || low === 'num empenho') numEmpenho = String(l[k] || '').trim();
                    if (low === 'fornecedor empenho' || low === 'fornecedor_empenho') fornecedor = String(l[k] || '').trim();
                    if (!vencAtaRawLoop && (low.includes('venc.ata') || low.includes('venc ata') || low.includes('venc_ata'))) vencAtaRawLoop = l[k];
                    if (!processoAtaLoop && (low === 'processo_com_ata' || low === 'processocomata' || low === 'processo com ata' || low === 'processo' || low === 'processo ata' || low === 'num. processo' || low === 'num_processo')) processoAtaLoop = l[k];
                    if (!modalidadeStr && low === 'modalidade') modalidadeStr = l[k];
                    if (!saldoAtaLoop && (low === 'saldo_da_ata' || low === 'saldo da ata' || (low.includes('saldo') && low.includes('ata')))) saldoAtaLoop = l[k];
                }

                processoAtaLoop = String(processoAtaLoop || '').trim() || 'Sem Processo';
                
                if (deveIgnorarProcesso(processoAtaLoop, anoAtual)) return;

                if (numEmpenho && numEmpenho !== '0' && numEmpenho.toLowerCase() !== 'n/a') {
                    const matchAno = numEmpenho.match(/^(\d{4})/);
                    if (matchAno) {
                        const anoEmpenho = parseInt(matchAno[1], 10);
                        if (anoEmpenho === anoAtual) temAnoAtual = true;
                        else if (anoEmpenho === anoAtual - 1) temAnoAnterior = true;
                        else if (anoEmpenho < anoAtual - 1) empenhosAntigos.add(`${numEmpenho} (Fornecedor: ${fornecedor || 'Não informado'})`);
                    }
                }

                const dataAtaLoop = converterDataExcelOuTexto(vencAtaRawLoop);
                modalidadeStr = String(modalidadeStr || '').trim();
                const mod = modalidadeStr && modalidadeStr !== 'N/A' && modalidadeStr !== '0' ? ` (${modalidadeStr})` : '';
                let saldoFormatado = (saldoAtaLoop === undefined || saldoAtaLoop === null || String(saldoAtaLoop).trim() === '' || String(saldoAtaLoop).trim().toUpperCase() === 'N/A') ? '0' : String(saldoAtaLoop).trim();
                
                if (paraNumero(saldoFormatado, 0) > 0) temSaldoAta = true;

                if (dataAtaLoop instanceof Date && !isNaN(dataAtaLoop.getTime())) {
                    const dataFormatada = formatarDataBR(dataAtaLoop);
                    let textoAta = `Proc: ${processoAtaLoop}${mod}\nVenc.: ${dataFormatada}\nSaldo: ${saldoFormatado}`;
                    
                    if (dataAtaLoop >= hoje) {
                        const modUpper = modalidadeStr.toUpperCase();
                        const ehModalidadeFechada = modUpper.includes('DISPENSA') || 
                                                    modUpper.includes('INEXIGIBILIDADE') || 
                                                    modUpper.includes('ADESÃO') || 
                                                    modUpper.includes('ADESAO');
                        
                        if (ehModalidadeFechada && paraNumero(saldoFormatado, 0) <= 0) {
                            // Ata morta
                        } else {
                            temAtaValida = true;
                        }
                        
                        const solicitacoesVinculadas = mapaSolicitacoesProcesso.get(processoAtaLoop) || { solNotes: 'N/A', solAe: 'N/A' };
                        if (solicitacoesVinculadas.solNotes && solicitacoesVinculadas.solNotes !== '0' && solicitacoesVinculadas.solNotes.toUpperCase() !== 'N/A') {
                            textoAta += `\nNotes: ${solicitacoesVinculadas.solNotes}`;
                        }
                        if (solicitacoesVinculadas.solAe && solicitacoesVinculadas.solAe !== '0' && solicitacoesVinculadas.solAe.toUpperCase() !== 'N/A') {
                            textoAta += `\nAE: ${solicitacoesVinculadas.solAe}`;
                        }
                    }
                    atasDetalhadas.add(textoAta);
                }
            });

            const naoTemEmpenhoValido = !temAnoAtual && !temAnoAnterior;
            const precisaReposicao = (cmm12 > 0 && temAtaValida && naoTemAE && naoTemEmpenhoValido);
            const sugestaoCancelamentoDuplo = (temAnoAtual && temAnoAnterior);
            const sugestaoCancelamentoAntigo = (empenhosAntigos.size > 0);

            const isAlerta = (precisaReposicao || sugestaoCancelamentoDuplo || sugestaoCancelamentoAntigo);

            const chaveColA = Object.keys(linhaBase)[0];
            const valorColA = limparRef(linhaBase[chaveColA]);

            const dadosItemExcel = {
                item: itemOriginal,
                descricao: descricao,
                saldoAtual: saldoAtual,
                saldoEmDias: saldoEmDiasRaw,
                cmm12: cmm12Raw,
                sugestaoAE: isAlerta && precisaReposicao ? calcularSugestaoAE(cmm12) : 0,
                atas: atasDetalhadas.size > 0 ? Array.from(atasDetalhadas).join('\n\n') : 'Nenhuma ata válida.',
                avisos: [
                    sugestaoCancelamentoDuplo ? '⚠️ Empenhos ano atual e anterior.' : '',
                    sugestaoCancelamentoAntigo ? '⚠️ Empenhos antigos:\n' + Array.from(empenhosAntigos).join('\n') : ''
                ].filter(Boolean).join('\n\n')
            };

            const alocarNoPlanejador = (donoRef) => {
                if (!alertasPorTelefone[donoRef.telefone]) {
                    alertasPorTelefone[donoRef.telefone] = { nome: donoRef.nome, gruposNotes: {} };
                }
                if (!alertasPorTelefone[donoRef.telefone].gruposNotes[notesItem]) {
                    // ADICIONADO: Array 'outros' para Monitoramento Geral
                    alertasPorTelefone[donoRef.telefone].gruposNotes[notesItem] = { comSaldo: [], semSaldo: [], outros: [] };
                }
                
                if (isAlerta) {
                    if (temSaldoAta) {
                        alertasPorTelefone[donoRef.telefone].gruposNotes[notesItem].comSaldo.push(dadosItemExcel);
                    } else {
                        alertasPorTelefone[donoRef.telefone].gruposNotes[notesItem].semSaldo.push(dadosItemExcel);
                    }
                } else {
                    // ADICIONADO: Restante da carteira do planejador (que não ativou gatilho de alerta crítico)
                    alertasPorTelefone[donoRef.telefone].gruposNotes[notesItem].outros.push(dadosItemExcel);
                }
                itensProcessados++;
            };

            if (valorColA === 'FAR') {
                const donoFAR = regras.find(r => r.ref === 'FAR');
                if (donoFAR) alocarNoPlanejador(donoFAR);
                continue;
            }

            const dono = (itemLimpo !== '' ? regras.find(r => r.ref === itemLimpo) : null) || 
                         (familiaLimpa !== '' ? regras.find(r => r.ref === familiaLimpa) : null) || 
                         (grupoLimpo !== '' ? regras.find(r => r.ref === grupoLimpo) : null);

            if (dono) {
                alocarNoPlanejador(dono);
            } else {
                itensSemDono++;
            }
        }

        console.log(`\n📦 [${runId}] Resumo: ${itensProcessados} item(ns) atribuídos.`);
        console.log(`⚠️ [${runId}] Itens sem dono: ${itensSemDono}.`);
        console.log(`\n📲 [${runId}] GERANDO EXCEL E DISPARANDO MENSAGENS...`);

        let enviosFeitos = 0;
        
        // --- INÍCIO DO ESCOPO DE SUPERVISÃO ---
        const workbookSupervisor = new ExcelJS.Workbook();
        let temDadosSupervisao = false;
        
        const colunasPlanilha = [
            { header: 'Item', key: 'item', width: 12 },
            { header: 'Descrição', key: 'descricao', width: 45 },
            { header: 'Saldo Atual', key: 'saldoAtual', width: 12 },
            { header: 'Saldo Dias', key: 'saldoEmDias', width: 12 },
            { header: 'CMM12', key: 'cmm12', width: 10 },
            { header: 'Sugestão AE', key: 'sugestaoAE', width: 15 },
            { header: 'Validade das Atas', key: 'atas', width: 40 },
            { header: 'Avisos de Empenho', key: 'avisos', width: 45 }
        ];

        for (const telefoneDestino in alertasPorTelefone) {
            const dadosDestino = alertasPorTelefone[telefoneDestino];

            if (nomeTesteFiltro && !dadosDestino.nome.toLowerCase().includes(nomeTesteFiltro.toLowerCase())) {
                continue;
            }

            let totalItensUsuario = 0;
            for (const notes in dadosDestino.gruposNotes) {
                totalItensUsuario += dadosDestino.gruposNotes[notes].comSaldo.length + 
                                     dadosDestino.gruposNotes[notes].semSaldo.length + 
                                     dadosDestino.gruposNotes[notes].outros.length; // INCLUINDO OS OUTROS
            }
            if (totalItensUsuario === 0) continue;

            const workbook = new ExcelJS.Workbook();
            const wsComSaldo = workbook.addWorksheet('Atas com Saldo');
            const wsSemSaldo = workbook.addWorksheet('Atas sem Saldo');
            const wsOutros = workbook.addWorksheet('Monitoramento Geral'); // NOVA GUIA
            
            wsComSaldo.columns = colunasPlanilha;
            wsSemSaldo.columns = colunasPlanilha;
            wsOutros.columns = colunasPlanilha;

            [wsComSaldo, wsSemSaldo, wsOutros].forEach(ws => {
                const headerRow = ws.getRow(1);
                headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
                headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            });

            let wsComSaldoSup = null;
            let wsSemSaldoSup = null;
            let wsOutrosSup = null;

            const chavesNotes = Object.keys(dadosDestino.gruposNotes).sort();
            
            for (const notes of chavesNotes) {
                const cat = dadosDestino.gruposNotes[notes];

                // ABA: COM SALDO
                if (cat.comSaldo.length > 0) {
                    const rowG = wsComSaldo.addRow([`📁 NOTES: ${notes}`]);
                    rowG.font = { bold: true };
                    rowG.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
                    wsComSaldo.mergeCells(`A${rowG.number}:H${rowG.number}`);
                    
                    cat.comSaldo.forEach(d => {
                        const r = wsComSaldo.addRow(d);
                        r.alignment = { wrapText: true, vertical: 'top' };
                    });

                    if (!wsComSaldoSup) {
                        const tabName = `C. Saldo ${dadosDestino.nome}`.replace(/[\\/?*\[\]:]/g, '').substring(0, 31);
                        wsComSaldoSup = workbookSupervisor.addWorksheet(tabName);
                        wsComSaldoSup.columns = colunasPlanilha;
                        const headerRowSup = wsComSaldoSup.getRow(1);
                        headerRowSup.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                        headerRowSup.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
                        headerRowSup.alignment = { vertical: 'middle', horizontal: 'center' };
                        temDadosSupervisao = true;
                    }
                    const rowGSup = wsComSaldoSup.addRow([`📁 NOTES: ${notes}`]);
                    rowGSup.font = { bold: true };
                    rowGSup.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
                    wsComSaldoSup.mergeCells(`A${rowGSup.number}:H${rowGSup.number}`);
                    
                    cat.comSaldo.forEach(d => {
                        const r = wsComSaldoSup.addRow(d);
                        r.alignment = { wrapText: true, vertical: 'top' };
                    });
                }

                // ABA: SEM SALDO
                if (cat.semSaldo.length > 0) {
                    const rowG = wsSemSaldo.addRow([`📁 NOTES: ${notes}`]);
                    rowG.font = { bold: true };
                    rowG.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
                    wsSemSaldo.mergeCells(`A${rowG.number}:H${rowG.number}`);
                    
                    cat.semSaldo.forEach(d => {
                        const r = wsSemSaldo.addRow(d);
                        r.alignment = { wrapText: true, vertical: 'top' };
                    });

                    if (!wsSemSaldoSup) {
                        const tabName = `S. Saldo ${dadosDestino.nome}`.replace(/[\\/?*\[\]:]/g, '').substring(0, 31);
                        wsSemSaldoSup = workbookSupervisor.addWorksheet(tabName);
                        wsSemSaldoSup.columns = colunasPlanilha;
                        const headerRowSup = wsSemSaldoSup.getRow(1);
                        headerRowSup.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                        headerRowSup.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
                        headerRowSup.alignment = { vertical: 'middle', horizontal: 'center' };
                        temDadosSupervisao = true;
                    }
                    const rowGSup = wsSemSaldoSup.addRow([`📁 NOTES: ${notes}`]);
                    rowGSup.font = { bold: true };
                    rowGSup.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
                    wsSemSaldoSup.mergeCells(`A${rowGSup.number}:H${rowGSup.number}`);
                    
                    cat.semSaldo.forEach(d => {
                        const r = wsSemSaldoSup.addRow(d);
                        r.alignment = { wrapText: true, vertical: 'top' };
                    });
                }

                // ABA: OUTROS (MONITORAMENTO GERAL)
                if (cat.outros.length > 0) {
                    const rowG = wsOutros.addRow([`📁 NOTES: ${notes}`]);
                    rowG.font = { bold: true };
                    rowG.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
                    wsOutros.mergeCells(`A${rowG.number}:H${rowG.number}`);
                    
                    cat.outros.forEach(d => {
                        const r = wsOutros.addRow(d);
                        r.alignment = { wrapText: true, vertical: 'top' };
                    });

                    if (!wsOutrosSup) {
                        const tabName = `M. Geral ${dadosDestino.nome}`.replace(/[\\/?*\[\]:]/g, '').substring(0, 31);
                        wsOutrosSup = workbookSupervisor.addWorksheet(tabName);
                        wsOutrosSup.columns = colunasPlanilha;
                        const headerRowSup = wsOutrosSup.getRow(1);
                        headerRowSup.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                        headerRowSup.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
                        headerRowSup.alignment = { vertical: 'middle', horizontal: 'center' };
                        temDadosSupervisao = true;
                    }
                    const rowGSup = wsOutrosSup.addRow([`📁 NOTES: ${notes}`]);
                    rowGSup.font = { bold: true };
                    rowGSup.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
                    wsOutrosSup.mergeCells(`A${rowGSup.number}:H${rowGSup.number}`);
                    
                    cat.outros.forEach(d => {
                        const r = wsOutrosSup.addRow(d);
                        r.alignment = { wrapText: true, vertical: 'top' };
                    });
                }
            }

            const nomeFormatado = dadosDestino.nome.replace(/\s+/g, '_');
            const fileName = `Alertas_Atas_${nomeFormatado}.xlsx`;
            const filePath = path.join(os.tmpdir(), fileName);
            await workbook.xlsx.writeFile(filePath);

            let numeroFinal = telefoneDestino;
            let msgCaption = `Olá, ${dadosDestino.nome}! 🤖 Aqui é a Hera.\n\nIdentifiquei itens sob sua responsabilidade precisando de análise nas abas "Atas com Saldo" e "Atas sem Saldo" (*SALDO EM DIAS <= 90*, *ATA VÁLIDA*, *SEM EMPENHO* e *SEM AE* ou *EMPENHOS ANTIGOS/DUPLOS*).\n\n💡 *Novidade:* Adicionei uma terceira aba chamada "Monitoramento Geral" para você acompanhar livremente o restante da sua carteira, tudo organizado por Notes!`;

            if (isTeste) {
                msgCaption = `⚠️ *[MODO TESTE]*\n_A planilha abaixo seria enviada para: ${dadosDestino.nome}_\n\n` + msgCaption;
                
                if (numeroDestinoTeste) {
                    numeroFinal = numeroDestinoTeste.includes('@') ? numeroDestinoTeste : `${numeroDestinoTeste.replace(/\D/g, '')}@c.us`;
                } else if (numeroFlavio) {
                    numeroFinal = `${numeroFlavio.replace(/\D/g, '')}@c.us`;
                }
            }

            try {
                console.log(`📤 [${runId}] Enviando planilha para ${dadosDestino.nome}...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const fileBuffer = fs.readFileSync(filePath);
                await client.sendMessage(numeroFinal, {
                    document: fileBuffer,
                    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    fileName: fileName,
                    caption: msgCaption
                });
                enviosFeitos++;
                fs.unlinkSync(filePath);

            } catch (err) {
                console.log(`❌ [${runId}] Falha ao enviar para ${dadosDestino.nome}. Erro: ${err.message}`);
                try { fs.unlinkSync(filePath); } catch (e) {} 
            }
        } 

        // --- DISPARO DOS SUPERVISORES ---
        if (temDadosSupervisao && !isTesteDirecionado) {
            const fileNameSup = `Resumo_Supervisao_Atas.xlsx`;
            const filePathSup = path.join(os.tmpdir(), fileNameSup);
            await workbookSupervisor.xlsx.writeFile(filePathSup);
            const fileBufferSup = fs.readFileSync(filePathSup);

            for (const sup of supervisores) {
                let msgSup = `📋 *RESUMO GERAL - ALERTAS DE ATA E MONITORAMENTO*\n\nOlá, ${sup.nome}. Segue o arquivo único contendo as abas de todos os planejadores analisados no dia de hoje (incluindo o monitoramento geral de cada um).`;
                let numeroSupFinal = sup.telefone;

                if (isTesteGlobal) {
                    msgSup = `⚠️ *[MODO TESTE - CÓPIA SUPERVISOR]*\n_A cópia abaixo seria enviada para ${sup.nome}:_\n\n${msgSup}`;
                    numeroSupFinal = numeroDestinoTeste ? (numeroDestinoTeste.includes('@') ? numeroDestinoTeste : `${numeroDestinoTeste.replace(/\D/g, '')}@c.us`) : (numeroFlavio ? `${numeroFlavio.replace(/\D/g, '')}@c.us` : numeroSupFinal);
                }

                console.log(`📤 [${runId}] Enviando arquivo unificado de supervisão para ${sup.nome}...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                try {
                    await client.sendMessage(numeroSupFinal, {
                        document: fileBufferSup,
                        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        fileName: fileNameSup,
                        caption: msgSup
                    });
                    enviosFeitos++;
                } catch (e) {
                    console.log(`❌ [${runId}] Falha ao enviar para supervisor ${sup.nome}. Erro: ${e.message}`);
                }
            }
            try { fs.unlinkSync(filePathSup); } catch (e) {}
        }

        console.log(`\n🎯 [${runId}] FINALIZADO: ${enviosFeitos} arquivo(s) enviado(s)!`);

        return '✅ Verificação concluída! Planilhas geradas e processadas com sucesso.';
    } catch (erro) {
        console.error(`❌ [${runId}] Ocorreu um erro geral no bloco de notificações:`, erro);
        return '❌ Ocorreu um erro ao tentar gerar as planilhas de notificação de ata.';
    } finally {
        disparoDeAtasEmAndamento = false;
        console.log(`🏁 [${runId}] Fim da rotina de disparo de atas.`);
        console.log('==================================================\n');
    }
}

function disparoDeAtasEstaEmAndamento() {
    return disparoDeAtasEmAndamento;
}

module.exports = {
    dispararAlertasDeAta,
    disparoDeAtasEstaEmAndamento
};
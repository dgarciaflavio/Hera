// src/services/dashboard.js
const { getDbConnection } = require('./database');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const CACHE_TENDENCIAS_PATH = path.join(process.cwd(), 'data', 'cache_tendencias.json');

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

function extrairDataJSDeExcel(valor) {
    if (!valor) return null;
    
    const valorNumerico = Number(valor);
    if (!isNaN(valorNumerico) && String(valor).trim() !== '') {
        if (valorNumerico > 30000 && valorNumerico < 60000) {
            const dataObj = new Date((valorNumerico - 25569) * 86400 * 1000);
            dataObj.setUTCHours(12);
            return isNaN(dataObj.getTime()) ? null : dataObj;
        }
    }
    
    const txt = String(valor).trim();
    
    let partes = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (partes) return new Date(parseInt(partes[3], 10), parseInt(partes[2], 10) - 1, parseInt(partes[1], 10), 12, 0, 0);
    
    partes = txt.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (partes) return new Date(parseInt(partes[1], 10), parseInt(partes[2], 10) - 1, parseInt(partes[3], 10), 12, 0, 0);
    
    partes = txt.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (partes) {
        let ano = parseInt(partes[3], 10);
        ano += (ano < 50 ? 2000 : 1900); 
        return new Date(ano, parseInt(partes[2], 10) - 1, parseInt(partes[1], 10), 12, 0, 0);
    }

    const dataPadrao = new Date(txt);
    if (!isNaN(dataPadrao.getTime())) return dataPadrao;
    
    return null;
}

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

function limparRefParaPlanejador(texto) {
    if (!texto) return '';
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toUpperCase();
}

function possuiAERelacionada(linha) {
    return Object.keys(linha).some(chave => {
        const chaveNormalizada = String(chave || '').trim().toUpperCase();
        if (!chaveNormalizada.startsWith('AE') && !chaveNormalizada.includes('SOLICITA')) return false;
        if (chaveNormalizada.includes('QTDE') || chaveNormalizada.includes('EMPENHAR') || chaveNormalizada === 'NOTES' || chaveNormalizada.includes('NOTES EM ANDAMENTO')) return false;
        const valor = linha[chave];
        return valor !== undefined && valor !== null && String(valor).trim() !== '' && String(valor).trim() !== '0' && String(valor).trim().toUpperCase() !== 'N/A';
    });
}

function extrairProcessos(valor) {
    if (!valor) return '-';
    const str = String(valor).trim();
    if (str.toUpperCase() === 'N/A' || str === '-' || str === '') return '-';
    
    const matches = str.match(/\d{5}\.\d{6}\/\d{4}-\d{2}/g);
    if (matches && matches.length > 0) return [...new Set(matches)].join(', ');
    return str; 
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
    
    return (colALimpa === 'FAR' && donoFAR) ? donoFAR : (donoItem || donoFam || donoGrupo || 'Sem dono cadastrado');
}

function criarBaseEstatisticas() {
    return {
        estoque: { critico: 0, atencao: 0, monitorar: 0, cmmZero: 0, grupo116: 0, semDemanda: 0 },
        // ATUALIZAÇÃO DOS STATUS DAS ATAS NO MASTER STATS
        atas: { vigenteSegura: 0, vigenteAlerta: 0, vigenteSemSaldo: 0, vencidas: 0, semAta: 0 },
        processos: { comAta: 0, emAndamento: 0, nenhum: 0 },
        zerados: { critico: 0, comAta: 0, comAeEAta: 0, comEmpenho: 0, semDemanda: 0 },
        vidaVsMorto: { vivos: 0, mortos: 0 },
        totalItens: 0,
        acaoImediata: 0,
        segurancaEstoque: 0, 
        porPlanejador: {},
        detalhes: []
    };
}

async function getEstatisticasDashboard(ignorar116 = false, ignorarSemDemanda = true, ignorarAvn = false) {
    try {
        const regrasPlanejadores = await carregarRegrasPlanejadores();
        const dados = await executarQuerySql(`SELECT * FROM planilha_saldoabaixode90dias`);
        const avnRows = await executarQuerySql(`SELECT cod_item FROM avn`);
        const setAvn = new Set(avnRows.map(r => r.cod_item.toUpperCase()));
        
        const masterStats = {
            GERAL: criarBaseEstatisticas(),
            FAR: criarBaseEstatisticas(),
            ALM: criarBaseEstatisticas()
        };

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const itensAgrupados = {};
        dados.forEach(linha => {
            let isMai = false;
            let item = '';
            for (const k in linha) {
                const low = k.trim().toLowerCase();
                if (low === 'local' || low === 'c_1') {
                    if (String(linha[k] || '').trim().toUpperCase() === 'MAI') isMai = true;
                }
                if (low === 'item' || low === 'codigo') item = String(linha[k] || '').trim().toUpperCase();
            }
            if (isMai || !item) return; 

            if (ignorarAvn && setAvn.has(item)) return;

            if (!itensAgrupados[item]) itensAgrupados[item] = [];
            itensAgrupados[item].push(linha);
        });

        for (const itemOriginal in itensAgrupados) {
            if (itemOriginal.toUpperCase().startsWith('A50')) continue;

            const linhasDoMesmoItem = itensAgrupados[itemOriginal];
            const linhaBase = linhasDoMesmoItem[0];

            let descricao = '', familia = '', grupoEstoque = '', valorColA = '';
            let saldoEmDias = 0, saldoAtual = 0, cmm12 = 0;

            const chavesBase = Object.keys(linhaBase);
            if (chavesBase.length > 0) valorColA = String(linhaBase[chavesBase[0]] || '').trim().toUpperCase();

            for (const k in linhaBase) {
                const low = k.trim().toLowerCase();
                if (low === 'local' || low === 'c_1') valorColA = String(linhaBase[k] || '').trim().toUpperCase();
                
                if (low.includes('descri')) descricao = String(linhaBase[k] || '').trim();
                
                if (low === 'familia' || low === 'família' || low === 'c_familia') familia = String(linhaBase[k] || '').trim();
                else if (!familia && low.includes('famili') && !low.includes('sub')) familia = String(linhaBase[k] || '').trim();

                if (low === 'grupo_de_estoque' || low === 'grupo de estoque') grupoEstoque = String(linhaBase[k] || '').trim();
                else if (!grupoEstoque && (low.includes('grupo') && !low.includes('sub'))) grupoEstoque = String(linhaBase[k] || '').trim();

                if (low === 'saldo_em_dias') saldoEmDias = paraNumero(linhaBase[k], 0);
                if (low === 'saldo_atual') saldoAtual = paraNumero(linhaBase[k], 0);
                if (low === 'cmm12') cmm12 = paraNumero(linhaBase[k], 0);
            }

            if (ignorar116) {
                if (grupoEstoque.includes('116')) continue;
                if (grupoEstoque.includes('143') && familia.trim().toUpperCase().startsWith('C')) continue;
            }

            const isSemDemanda = (cmm12 === 0 && saldoAtual <= 0); 
            const isCmmZero = (cmm12 === 0 && saldoAtual > 0);     

            if (ignorarSemDemanda && isSemDemanda) continue;

            const planejador = encontrarPlanejador(itemOriginal, familia, grupoEstoque, valorColA, regrasPlanejadores);
            // Substituição do termo
            const planejadorDisplay = planejador === 'Sem dono cadastrado' ? 'Sem Planejador Atribuído' : planejador;

            let temProcAta = false, procAtaFinal = '-';
            let temProcAndamento = false, procAndamentoFinal = '-';
            
            let temAtaValidaSegura = false;
            let temAtaValidaAlerta = false;
            let temAtaValidaSemSaldo = false;
            let temAtaVencida = false;
            let teveAlgumaAtaCadastrada = false; 

            let temEmpenhoValido = false, temAeValida = false;
            let aeFinal = '-'; 
            
            let saldoAtaValidoTotal = 0, totalQtdAta = 0, totalQtdEmpenho = 0;
            let dataValidadeMaisDistante = null;

            let processosAtaArray = [], processosAndamentoArray = [];

            linhasDoMesmoItem.forEach(linha => {
                let vencAta = '', saldoAtaLinha = 0, procAtaLoop = '', procAndamentoLoop = '', qtdAtaLinha = 0, qtdEmpenhoLinha = 0;

                for (const k in linha) {
                    const low = k.trim().toLowerCase();
                    const valStr = String(linha[k] || '').trim();

                    if (low.includes('venc') && low.includes('ata')) vencAta = valStr;
                    if (low === 'saldo_da_ata' || low === 'saldo da ata') saldoAtaLinha = paraNumero(linha[k], 0);
                    if (low === 'processo_com_ata' || low === 'processocomata' || low === 'processo da ata' || low === 'processo') procAtaLoop = valStr;
                    if (low === 'processo_em_andamento' || low === 'processoemandamento' || low === 'processo_2' || (low.includes('processo') && low.includes('andamento'))) procAndamentoLoop = valStr;
                    
                    if (low === 'num.empenho' || low === 'num_empenho' || low === 'num empenho' || low === 'empenho') {
                        if (valStr && valStr !== '0' && valStr.toUpperCase() !== 'N/A') temEmpenhoValido = true;
                    }

                    if (low === 'qtde_original' || low === 'qtde da ata' || low === 'qtde_ata' || low === 'quantidade_ata' || low === 'qtde_da_ata') qtdAtaLinha = paraNumero(linha[k], 0);
                    if (low === 'qtde a empenhar' || low === 'qtde_empenhar' || low === 'quantidade_empenho' || low === 'qtde_a_empenhar') qtdEmpenhoLinha = paraNumero(linha[k], 0);
                }

                totalQtdAta += qtdAtaLinha;
                totalQtdEmpenho += qtdEmpenhoLinha;

                if (procAtaLoop && procAtaLoop !== '0' && procAtaLoop.toUpperCase() !== 'N/A') {
                    temProcAta = true;
                    processosAtaArray.push(procAtaLoop);
                }
                
                if (procAndamentoLoop && procAndamentoLoop !== '0' && procAndamentoLoop.toUpperCase() !== 'N/A') {
                    if (procAndamentoLoop !== procAtaLoop) {
                        temProcAndamento = true;
                        processosAndamentoArray.push(procAndamentoLoop);
                    }
                }

                const dataVencimento = extrairDataJSDeExcel(vencAta);
                if (dataVencimento) {
                    teveAlgumaAtaCadastrada = true; 
                    
                    if (!dataValidadeMaisDistante || dataVencimento > dataValidadeMaisDistante) {
                        dataValidadeMaisDistante = dataVencimento;
                    }

                    if (dataVencimento >= hoje) {
                        saldoAtaValidoTotal += saldoAtaLinha; 
                        if (saldoAtaLinha > 0) {
                            if (saldoAtaLinha > (cmm12 * 3)) {
                                temAtaValidaSegura = true;
                            } else {
                                temAtaValidaAlerta = true;
                            }
                        } else {
                            temAtaValidaSemSaldo = true;
                        }
                    } else {
                        temAtaVencida = true;
                    }
                } else {
                    if (procAtaLoop && procAtaLoop !== '0' && procAtaLoop.toUpperCase() !== 'N/A') {
                        teveAlgumaAtaCadastrada = true;
                    }
                }

                if (possuiAERelacionada(linha)) {
                    temAeValida = true;
                    for (const k in linha) {
                        const low = k.trim().toLowerCase();
                        if (low.startsWith('ae') && !low.includes('qtde') && !low.includes('empenhar')) {
                            const valStr = String(linha[k] || '').trim();
                            if (valStr && valStr !== '0' && valStr.toUpperCase() !== 'N/A') aeFinal = valStr;
                        }
                    }
                }
            });

            if (processosAtaArray.length > 0) procAtaFinal = extrairProcessos(processosAtaArray.join(', '));
            if (processosAndamentoArray.length > 0) procAndamentoFinal = extrairProcessos(processosAndamentoArray.join(', '));
            
            const validadeAtaFormatada = dataValidadeMaisDistante ? dataValidadeMaisDistante.toLocaleDateString('pt-BR') : '-';

            const isAcaoImediata = (!isSemDemanda && saldoAtual <= 0 && !temEmpenhoValido && !temAeValida);
            const isSegurancaEstoque = (cmm12 > 0) && (saldoAtaValidoTotal >= (1.5 * cmm12)) && (saldoAtual >= (2 * cmm12));

            let catEstoque = 'monitorar';
            if (isSemDemanda) {
                catEstoque = 'semDemanda';
            } else if (grupoEstoque.includes('116') || (grupoEstoque.includes('143') && familia.trim().toUpperCase().startsWith('C'))) {
                catEstoque = 'grupo116'; 
            } else if (cmm12 === 0) {
                catEstoque = 'cmmZero'; 
            } else if (saldoEmDias <= 30) {
                catEstoque = 'critico';
            } else if (saldoEmDias <= 60) {
                catEstoque = 'atencao';
            }

            let catAtas = 'semAta';
            if (teveAlgumaAtaCadastrada) {
                if (temAtaValidaSegura) {
                    catAtas = 'vigenteSegura';
                } else if (temAtaValidaAlerta) {
                    catAtas = 'vigenteAlerta';
                } else if (temAtaValidaSemSaldo) {
                    catAtas = 'vigenteSemSaldo';
                } else if (temAtaVencida) {
                    catAtas = 'vencidas';
                } else {
                    catAtas = 'vencidas';
                }
            }

            let catProcessos = 'nenhum';
            if (temProcAta) catProcessos = 'comAta';
            else if (temProcAndamento) catProcessos = 'emAndamento';

            let catZerado = null;
            if (saldoAtual <= 0) {
                if (isSemDemanda) {
                    catZerado = 'semDemanda';
                } else if (temEmpenhoValido) {
                    catZerado = 'comEmpenho';
                } else if (temAeValida && (temAtaValidaSegura || temAtaValidaAlerta || temAtaValidaSemSaldo)) {
                    catZerado = 'comAeEAta';
                } else if (temAtaValidaSegura || temAtaValidaAlerta || (temAtaValidaSemSaldo && saldoAtaValidoTotal > 0)) { 
                    // CORREÇÃO: "Com Ata" agora exige que o saldoAtaValidoTotal seja maior que 0.
                    // Se for 0, cai para 'critico' (sem saldo ou ata válida sem saldo)
                    catZerado = 'comAta';
                } else {
                    catZerado = 'critico'; // Item zerado SEM AE e SEM ATA VIGENTE COM SALDO
                }
            }

            const locaisParaAdicionar = ['GERAL'];
            if (valorColA === 'FAR') locaisParaAdicionar.push('FAR');
            if (valorColA === 'ALM') locaisParaAdicionar.push('ALM');

            locaisParaAdicionar.forEach(loc => {
                const st = masterStats[loc];
                
                st.totalItens++;
                if (isSemDemanda) st.vidaVsMorto.mortos++;
                else st.vidaVsMorto.vivos++;

                st.estoque[catEstoque]++;
                st.atas[catAtas]++;
                st.processos[catProcessos]++;
                
                if (isAcaoImediata) st.acaoImediata++;
                if (isSegurancaEstoque) st.segurancaEstoque++;
                
                if (catZerado) st.zerados[catZerado]++;

                if (!st.porPlanejador[planejadorDisplay]) {
                    st.porPlanejador[planejadorDisplay] = {
                        estoque: { critico: 0, atencao: 0, monitorar: 0, cmmZero: 0, grupo116: 0, semDemanda: 0 },
                        atas: { vigenteSegura: 0, vigenteAlerta: 0, vigenteSemSaldo: 0, vencidas: 0, semAta: 0 },
                        processos: { comAta: 0, emAndamento: 0, nenhum: 0 },
                        total: 0
                    };
                }
                
                st.porPlanejador[planejadorDisplay].estoque[catEstoque]++;
                st.porPlanejador[planejadorDisplay].atas[catAtas]++;
                st.porPlanejador[planejadorDisplay].processos[catProcessos]++;
                st.porPlanejador[planejadorDisplay].total++;

                st.detalhes.push({
                    item: itemOriginal,
                    descricao,
                    planejador: planejadorDisplay,
                    cmm12,
                    saldoAtual, 
                    ae: aeFinal, 
                    saldoEmDias,
                    catEstoque,
                    catAtas,
                    catProcessos,
                    catZerado, 
                    isAcaoImediata,
                    isSegurancaEstoque,
                    processoAta: procAtaFinal,
                    processoAndamento: procAndamentoFinal,
                    local: valorColA,
                    qtdEmpenho: totalQtdEmpenho,
                    qtdAta: totalQtdAta,
                    saldoAta: saldoAtaValidoTotal,
                    validadeAta: validadeAtaFormatada
                });
            });
        }

        return masterStats;
    } catch (error) {
        console.error('Erro em getEstatisticasDashboard:', error);
        throw error;
    }
}

async function getEstatisticasPainelExecutivo() {
    // Busca dados com os filtros: Ignorar 116/143, Sem Demanda e AVN
    const dadosBrutos = await getEstatisticasDashboard(true, true, true);
    
    const formatarVisao = (master) => {
        const detalhesZerados = master.detalhes.filter(d => d.saldoAtual <= 0);
        const stats = {
            resumoZerados: master.zerados,
            totalItensAnalisados: master.totalItens,
            detalhes: detalhesZerados,
            porPlanejador: {}
        };

        detalhesZerados.forEach(d => {
            if (!stats.porPlanejador[d.planejador]) {
                stats.porPlanejador[d.planejador] = {
                    critico: 0, comAta: 0, comAeEAta: 0, comEmpenho: 0, total: 0
                };
            }
            stats.porPlanejador[d.planejador][d.catZerado]++;
            stats.porPlanejador[d.planejador].total++;
        });

        return stats;
    };

    // Retorna as 3 visões mapeadas separadamente
    return {
        GERAL: formatarVisao(dadosBrutos.GERAL),
        FAR: formatarVisao(dadosBrutos.FAR),
        ALM: formatarVisao(dadosBrutos.ALM)
    };
}

async function getDadosDinamicos(ignorarAvn = false) {
    try {
        const regrasPlanejadores = await carregarRegrasPlanejadores();
        const dados = await executarQuerySql(`SELECT * FROM planilha_saldoabaixode90dias`);
        const avnRows = await executarQuerySql(`SELECT cod_item FROM avn`);
        const setAvn = new Set(avnRows.map(r => r.cod_item.toUpperCase()));
        
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const itensAgrupados = {};
        dados.forEach(linha => {
            let isMai = false;
            let item = '';
            for (const k in linha) {
                const low = k.trim().toLowerCase();
                if (low === 'local' || low === 'c_1') {
                    if (String(linha[k] || '').trim().toUpperCase() === 'MAI') isMai = true;
                }
                if (low === 'item' || low === 'codigo') item = String(linha[k] || '').trim().toUpperCase();
            }
            if (isMai || !item) return;

            // Filtro AVN antecipado
            if (ignorarAvn && setAvn.has(item)) return;

            if (!itensAgrupados[item]) itensAgrupados[item] = [];
            itensAgrupados[item].push(linha);
        });

        const resultados = [];

        for (const itemOriginal in itensAgrupados) {
            if (itemOriginal.toUpperCase().startsWith('A50')) continue;

            const linhasDoMesmoItem = itensAgrupados[itemOriginal];
            const linhaBase = linhasDoMesmoItem[0];

            let descricao = '', familia = '', grupoEstoque = '', valorColA = '';
            let saldoEmDias = 0, saldoAtual = 0, cmm12 = 0;

            const chavesBase = Object.keys(linhaBase);
            if (chavesBase.length > 0) valorColA = String(linhaBase[chavesBase[0]] || '').trim().toUpperCase();

            for (const k in linhaBase) {
                const low = k.trim().toLowerCase();
                if (low === 'local' || low === 'c_1') valorColA = String(linhaBase[k] || '').trim().toUpperCase();
                if (low.includes('descri')) descricao = String(linhaBase[k] || '').trim();
                
                if (low === 'familia' || low === 'família' || low === 'c_familia') familia = String(linhaBase[k] || '').trim();
                else if (!familia && low.includes('famili') && !low.includes('sub')) familia = String(linhaBase[k] || '').trim();

                if (low === 'grupo_de_estoque' || low === 'grupo de estoque') grupoEstoque = String(linhaBase[k] || '').trim();
                else if (!grupoEstoque && (low.includes('grupo') && !low.includes('sub'))) grupoEstoque = String(linhaBase[k] || '').trim();

                if (low === 'saldo_em_dias') saldoEmDias = paraNumero(linhaBase[k], 0);
                if (low === 'saldo_atual') saldoAtual = paraNumero(linhaBase[k], 0);
                if (low === 'cmm12') cmm12 = paraNumero(linhaBase[k], 0);
            }

            const planejador = encontrarPlanejador(itemOriginal, familia, grupoEstoque, valorColA, regrasPlanejadores);

            let temProcAta = false, procAtaFinal = '-';
            let temProcAndamento = false, procAndamentoFinal = '-';
            
            // Variáveis de checagem da validade e saldo das atas
            let temAtaValidaSegura = false;
            let temAtaValidaAlerta = false;
            let temAtaValidaSemSaldo = false;
            let temAtaVencida = false;
            let teveAlgumaAtaCadastrada = false; // flag para diferenciar o 'Sem Ata' do 'Vencida'

            let temEmpenhoValido = false, temAeValida = false;
            let aeFinal = '-'; 
            
            let saldoAtaValidoTotal = 0, totalQtdAta = 0, totalQtdEmpenho = 0;
            let dataValidadeMaisDistante = null;

            let processosAtaArray = [], processosAndamentoArray = [];

            linhasDoMesmoItem.forEach(linha => {
                let vencAta = '', saldoAtaLinha = 0, procAtaLoop = '', procAndamentoLoop = '', qtdAtaLinha = 0, qtdEmpenhoLinha = 0;

                for (const k in linha) {
                    const low = k.trim().toLowerCase();
                    const valStr = String(linha[k] || '').trim();

                    if (low.includes('venc') && low.includes('ata')) vencAta = valStr;
                    if (low === 'saldo_da_ata' || low === 'saldo da ata') saldoAtaLinha = paraNumero(linha[k], 0);
                    if (low === 'processo_com_ata' || low === 'processocomata' || low === 'processo da ata' || low === 'processo') procAtaLoop = valStr;
                    if (low === 'processo_em_andamento' || low === 'processoemandamento' || low === 'processo_2' || (low.includes('processo') && low.includes('andamento'))) procAndamentoLoop = valStr;
                    
                    if (low === 'num.empenho' || low === 'num_empenho' || low === 'num empenho' || low === 'empenho') {
                        if (valStr && valStr !== '0' && valStr.toUpperCase() !== 'N/A') temEmpenhoValido = true;
                    }

                    if (low === 'qtde_original' || low === 'qtde da ata' || low === 'qtde_ata' || low === 'quantidade_ata' || low === 'qtde_da_ata') qtdAtaLinha = paraNumero(linha[k], 0);
                    if (low === 'qtde a empenhar' || low === 'qtde_empenhar' || low === 'quantidade_empenho' || low === 'qtde_a_empenhar') qtdEmpenhoLinha = paraNumero(linha[k], 0);
                }

                totalQtdAta += qtdAtaLinha;
                totalQtdEmpenho += qtdEmpenhoLinha;

                if (procAtaLoop && procAtaLoop !== '0' && procAtaLoop.toUpperCase() !== 'N/A') {
                    temProcAta = true;
                    processosAtaArray.push(procAtaLoop);
                }
                
                if (procAndamentoLoop && procAndamentoLoop !== '0' && procAndamentoLoop.toUpperCase() !== 'N/A') {
                    if (procAndamentoLoop !== procAtaLoop) {
                        temProcAndamento = true;
                        processosAndamentoArray.push(procAndamentoLoop);
                    }
                }

                const dataVencimento = extrairDataJSDeExcel(vencAta);
                if (dataVencimento) {
                    teveAlgumaAtaCadastrada = true; // Achou data, significa que não é um item cru sem ata
                    
                    if (!dataValidadeMaisDistante || dataVencimento > dataValidadeMaisDistante) {
                        dataValidadeMaisDistante = dataVencimento;
                    }

                    if (dataVencimento >= hoje) {
                        saldoAtaValidoTotal += saldoAtaLinha; // Soma saldos válidos
                        if (saldoAtaLinha > 0) {
                            // Verifica se o saldo atende pelo menos 3 meses de demanda
                            if (saldoAtaLinha > (cmm12 * 3)) {
                                temAtaValidaSegura = true;
                            } else {
                                temAtaValidaAlerta = true;
                            }
                        } else {
                            temAtaValidaSemSaldo = true;
                        }
                    } else {
                        // Data no passado
                        temAtaVencida = true;
                    }
                } else {
                    // Trata também a existência do PROCESSO DE ATA preenchido na linha como indicador de que existiu ata
                    if (procAtaLoop && procAtaLoop !== '0' && procAtaLoop.toUpperCase() !== 'N/A') {
                        teveAlgumaAtaCadastrada = true;
                    }
                }

                if (possuiAERelacionada(linha)) {
                    temAeValida = true;
                    for (const k in linha) {
                        const low = k.trim().toLowerCase();
                        if (low.startsWith('ae') && !low.includes('qtde') && !low.includes('empenhar')) {
                            const valStr = String(linha[k] || '').trim();
                            if (valStr && valStr !== '0' && valStr.toUpperCase() !== 'N/A') aeFinal = valStr;
                        }
                    }
                }
            });

            if (processosAtaArray.length > 0) procAtaFinal = extrairProcessos(processosAtaArray.join(', '));
            if (processosAndamentoArray.length > 0) procAndamentoFinal = extrairProcessos(processosAndamentoArray.join(', '));
            const validadeAtaFormatada = dataValidadeMaisDistante ? dataValidadeMaisDistante.toLocaleDateString('pt-BR') : '-';

            // CORREÇÃO: Lógica CMM Zero vs Sem Demanda
            const isSemDemanda = (cmm12 === 0 && saldoAtual <= 0); // Morto: Sem demanda e sem estoque
            const isAcaoImediata = (!isSemDemanda && saldoAtual <= 0 && !temEmpenhoValido && !temAeValida);
            const isSegurancaEstoque = (cmm12 > 0) && (saldoAtaValidoTotal >= (1.5 * cmm12)) && (saldoAtual >= (2 * cmm12));

            let catEstoque = 'Monitorar';
            if (isSemDemanda) catEstoque = 'Sem Demanda';
            else if (grupoEstoque.includes('116') || (grupoEstoque.includes('143') && familia.trim().toUpperCase().startsWith('C'))) catEstoque = 'Grupos 116 e 143';
            else if (cmm12 === 0) catEstoque = 'CMM Zero'; 
            else if (saldoEmDias <= 30) catEstoque = 'Crítico';
            else if (saldoEmDias <= 60) catEstoque = 'Atenção';

            let catAtas = 'Sem Ata';
            if (teveAlgumaAtaCadastrada) {
                // Hierarquia: Se tem alguma válida no meio de vencidas, a situação real do item é baseada na válida
                if (temAtaValidaSegura) {
                    catAtas = 'Vigente Segura';
                } else if (temAtaValidaAlerta) {
                    catAtas = 'Vigente Alerta';
                } else if (temAtaValidaSemSaldo) {
                    catAtas = 'Vigente S/ Saldo';
                } else if (temAtaVencida) {
                    catAtas = 'Vencida';
                } else {
                    catAtas = 'Vencida'; // Fallback
                }
            }

            let catProcessos = 'Nenhum Processo';
            if (temProcAta) catProcessos = 'Com Ata';
            else if (temProcAndamento) catProcessos = 'Em Andamento';

            resultados.push({
                item: itemOriginal, descricao, familia, grupoEstoque, local: valorColA, planejador,
                saldoEmDias, saldoAtual, ae: aeFinal, cmm12, saldoAta: saldoAtaValidoTotal, qtdAta: totalQtdAta,
                qtdEmpenho: totalQtdEmpenho, validadeAta: validadeAtaFormatada, catEstoque, catAtas,
                catProcessos, isAcaoImediata, isSegurancaEstoque, temEmpenho: temEmpenhoValido,
                temAe: temAeValida, processoAta: procAtaFinal, processoAndamento: procAndamentoFinal
            });
        }

        return resultados;
    } catch (erro) {
        console.error('Erro ao buscar dados dinâmicos:', erro);
        return [];
    }
}

async function getEstatisticasTendencias(localFiltro = 'Todos') {
    try {
        let payloadFinal;

        if (fs.existsSync(CACHE_TENDENCIAS_PATH)) {
            console.log('⚡ Lendo dados de Tendências a partir do Cache Físico...');
            const cacheRaw = await fsPromises.readFile(CACHE_TENDENCIAS_PATH, 'utf-8');
            payloadFinal = JSON.parse(cacheRaw);
        } else {
            console.log('⚙️ Cache de Tendências não encontrado. Processando dados do zero (Isso pode levar alguns segundos)...');

            const dados = await executarQuerySql(`SELECT * FROM historico_estoque`);
            const agrupamento = {};
            const datasSet = new Set();
            const itensIgnorados = new Set();

            dados.forEach(linha => {
                let dataHist = linha.data_historico || 'Sem Data';
                datasSet.add(dataHist);
                
                let item = '';
                for (const k in linha) {
                    const low = k.trim().toLowerCase();
                    if (low === 'item' || low === 'codigo') item = String(linha[k] || '').trim();
                }
                
                if (!item) return; 
                if (!agrupamento[dataHist]) agrupamento[dataHist] = {};
                if (!agrupamento[dataHist][item]) agrupamento[dataHist][item] = [];
                
                agrupamento[dataHist][item].push(linha);
            });

            const datasOrdenadas = Array.from(datasSet).sort();
            
            const saudeGeral = {};
            const faixasCobertura = {}; 
            const itensEvolucao = {};
            const detalhesSaude = {};
            const detalhesFaixa = {};

            datasOrdenadas.forEach(data => {
                saudeGeral[data] = { critico: 0, atencao: 0, monitorar: 0 };
                faixasCobertura[data] = { semDemanda: 0, zerados: 0, dias30a59: 0, dias60a89: 0, dias90Mais: 0, primeiraCompra: 0 };
                detalhesSaude[data] = { critico: [], atencao: [], monitorar: [] };
                detalhesFaixa[data] = { semDemanda: [], zerados: [], dias30a59: [], dias60a89: [], dias90Mais: [], primeiraCompra: [] };
                
                for (const itemOriginal in agrupamento[data]) {
                    if (itensIgnorados.has(itemOriginal)) continue;

                    if (itemOriginal.toUpperCase().startsWith('A50')) {
                        itensIgnorados.add(itemOriginal);
                        continue;
                    }

                    const linhasDoMesmoItem = agrupamento[data][itemOriginal];
                    const linhaBase = linhasDoMesmoItem[0];

                    let descricao = '', familia = '', grupoEstoque = '', valorColA = '';
                    let saldoEmDias = 0, saldoAtual = 0, cmm12 = 0, obs = ''; 

                    const chavesBase = Object.keys(linhaBase);
                    if (chavesBase.length > 0) valorColA = String(linhaBase[chavesBase[0]] || '').trim().toUpperCase();

                    for (const k in linhaBase) {
                        const low = k.trim().toLowerCase();
                        if (low === 'local' || low === 'c_1') valorColA = String(linhaBase[k] || '').trim().toUpperCase();
                        if (low.includes('descri')) descricao = String(linhaBase[k] || '').trim();
                        
                        if (low === 'familia' || low === 'família' || low === 'c_familia') familia = String(linhaBase[k] || '').trim();
                        else if (!familia && low.includes('famili') && !low.includes('sub')) familia = String(linhaBase[k] || '').trim();

                        if (low === 'grupo_de_estoque' || low === 'grupo de estoque') grupoEstoque = String(linhaBase[k] || '').trim();
                        else if (!grupoEstoque && (low.includes('grupo') && !low.includes('sub'))) grupoEstoque = String(linhaBase[k] || '').trim();

                        if (low === 'saldo_em_dias') saldoEmDias = paraNumero(linhaBase[k], 0);
                        if (low === 'saldo_atual') saldoAtual = paraNumero(linhaBase[k], 0);
                        if (low === 'cmm12') cmm12 = paraNumero(linhaBase[k], 0);
                        if (low === 'obs' || low === 'observacao' || low === 'observações') obs = String(linhaBase[k] || '').trim(); 
                    }

                    if (grupoEstoque.includes('116') || (grupoEstoque.includes('143') && familia.trim().toUpperCase().startsWith('C'))) {
                        itensIgnorados.add(itemOriginal);
                        continue;
                    }

                    let catFaixa = 'semDemanda'; 
                    let obsUpper = obs.toUpperCase();
                    let catEstoque = 'monitorar';

                    if (cmm12 === 0) {
                        catFaixa = 'semDemanda';
                    } else if (saldoAtual <= 0 && cmm12 > 0) {
                        catFaixa = 'zerados';
                    } else if (obsUpper.includes('PRIMEIRA COMPRA')) {
                        catFaixa = 'primeiraCompra';
                    } else if (obsUpper.includes('30 E 59')) {
                        catFaixa = 'dias30a59';
                    } else if (obsUpper.includes('60 E 89')) {
                        catFaixa = 'dias60a89';
                    } else if (obsUpper.includes('90 DIAS')) {
                        catFaixa = 'dias90Mais';
                    } else {
                        if (saldoEmDias < 30) catFaixa = 'zerados'; 
                        else if (saldoEmDias >= 30 && saldoEmDias <= 59) catFaixa = 'dias30a59';
                        else if (saldoEmDias >= 60 && saldoEmDias <= 89) catFaixa = 'dias60a89';
                        else if (saldoEmDias >= 90) catFaixa = 'dias90Mais';
                    }

                    if (cmm12 > 0) {
                        if (catFaixa === 'zerados' || catFaixa === 'primeiraCompra' || (saldoEmDias >= 1 && saldoEmDias <= 30)) {
                            catEstoque = 'critico';
                        } else if (saldoEmDias >= 31 && saldoEmDias <= 60) {
                            catEstoque = 'atencao';
                        } else {
                            catEstoque = 'monitorar';
                        }
                        
                        saudeGeral[data][catEstoque]++;
                        detalhesSaude[data][catEstoque].push({ item: itemOriginal, descricao, saldoEmDias, saldoAtual, cmm12, obs });
                    }

                    faixasCobertura[data][catFaixa]++;
                    detalhesFaixa[data][catFaixa].push({ item: itemOriginal, descricao, saldoEmDias, saldoAtual, cmm12, obs });

                    if (!itensEvolucao[itemOriginal]) {
                        itensEvolucao[itemOriginal] = { descricao, familia, grupoEstoque, local: valorColA, historico: {} };
                    }

                    itensEvolucao[itemOriginal].historico[data] = { saldo: saldoAtual, saldoEmDias: saldoEmDias, cmm12: cmm12 };
                }
            });

            payloadFinal = { 
                datas: datasOrdenadas, 
                saudeGeral, 
                faixasCobertura, 
                itens: itensEvolucao,
                detalhesSaude,
                detalhesFaixa
            };

            const dir = path.dirname(CACHE_TENDENCIAS_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            await fsPromises.writeFile(CACHE_TENDENCIAS_PATH, JSON.stringify(payloadFinal), 'utf-8');
            console.log('✅ Cache de Tendências salvo com sucesso!');
        }

        // ============================================
        // APLICA O FILTRO POR LOCAL ANTES DE DEVOLVER
        // ============================================
        if (localFiltro !== 'Todos') {
            const filteredPayload = {
                datas: payloadFinal.datas,
                saudeGeral: {},
                faixasCobertura: {},
                itens: {},
                detalhesSaude: {},
                detalhesFaixa: {}
            };

            for (const [codItem, info] of Object.entries(payloadFinal.itens)) {
                const localItem = String(info.local || '').trim().toUpperCase();
                if (localItem === localFiltro.toUpperCase()) {
                    filteredPayload.itens[codItem] = info;
                }
            }

            for (const data of filteredPayload.datas) {
                filteredPayload.saudeGeral[data] = { critico: 0, atencao: 0, monitorar: 0 };
                filteredPayload.faixasCobertura[data] = { semDemanda: 0, zerados: 0, dias30a59: 0, dias60a89: 0, dias90Mais: 0, primeiraCompra: 0 };
                filteredPayload.detalhesSaude[data] = { critico: [], atencao: [], monitorar: [] };
                filteredPayload.detalhesFaixa[data] = { semDemanda: [], zerados: [], dias30a59: [], dias60a89: [], dias90Mais: [], primeiraCompra: [] };

                for (const cat of ['critico', 'atencao', 'monitorar']) {
                    const itemsInCat = payloadFinal.detalhesSaude[data][cat] || [];
                    for (const item of itemsInCat) {
                        if (filteredPayload.itens[item.item]) { 
                            filteredPayload.detalhesSaude[data][cat].push(item);
                            filteredPayload.saudeGeral[data][cat]++;
                        }
                    }
                }

                for (const cat of ['semDemanda', 'zerados', 'dias30a59', 'dias60a89', 'dias90Mais', 'primeiraCompra']) {
                    const itemsInCat = payloadFinal.detalhesFaixa[data][cat] || [];
                    for (const item of itemsInCat) {
                        if (filteredPayload.itens[item.item]) {
                            filteredPayload.detalhesFaixa[data][cat].push(item);
                            filteredPayload.faixasCobertura[data][cat]++;
                        }
                    }
                }
            }
            return filteredPayload;
        }

        return payloadFinal;
    } catch (erro) {
        console.error('Erro ao buscar estatísticas de tendências:', erro);
        return { datas: [], saudeGeral: {}, faixasCobertura: {}, itens: {}, detalhesSaude: {}, detalhesFaixa: {} };
    }
}

module.exports = { getEstatisticasDashboard, getDadosDinamicos, getEstatisticasTendencias, getEstatisticasPainelExecutivo };
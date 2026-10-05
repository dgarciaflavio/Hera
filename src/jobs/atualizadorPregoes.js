// src/jobs/atualizadorPregoes.js
const fs = require('fs');
const path = require('path');
const { abrirBanco, salvarPregaoCache, buscarPregaoCache, buscarTodosPregoesPorAnoCache, salvarItensCache, buscarItensCache } = require('../services/pregoesCache');
const { buscarTodosItensDaCompra } = require('../services/api');
const { pncpFetch } = require('../services/pncpLimiter');

const UASG_PADRAO = '250052';

let sincronizacaoPregoesEmAndamento = false;
let rotinaMadrugadaEmAndamento = false;
let sincronizacaoInicialJaExecutada = false;

function montarUrlBuscaPNCP(ano, uasg) {
    const url = new URL('https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133');
    url.searchParams.set('unidadeOrgaoCodigoUnidade', String(uasg));
    url.searchParams.set('codigoModalidade', '5');
    url.searchParams.set('dataPublicacaoPncpInicial', `${ano}-01-01`);
    url.searchParams.set('dataPublicacaoPncpFinal', `${ano}-12-31`);
    url.searchParams.set('tamanhoPagina', '500');
    return url.toString();
}

// NOVA FUNÇÃO AUXILIAR: Centraliza a matemática de status da matriz
async function recalcularStatusPregao(itensBrutos) {
    let homologados = 0;
    let desertos = 0;
    let frustrados = 0;
    const statusAgrupado = {};

    itensBrutos.forEach(item => {
        const sitLabel = String(item.situacaoCompraItemNome || item.situacaoItem || 'Em Andamento / Não Informado').trim();
        statusAgrupado[sitLabel] = (statusAgrupado[sitLabel] || 0) + 1;

        const sit = sitLabel.toLowerCase();
        if (sit.includes('homologado') || sit.includes('adjudicado')) homologados++;
        else if (sit.includes('deserto')) desertos++;
        else if (sit.includes('fracassado') || sit.includes('cancelado') || sit.includes('anulado')) frustrados++;
    });

    const totalEncerrados = homologados + desertos + frustrados;
    const concluido = (itensBrutos.length > 0 && totalEncerrados === itensBrutos.length);

    return {
        homologados,
        desertos,
        frustrados,
        statusAgrupado,
        concluido,
        totalItens: itensBrutos.length
    };
}

async function rotinaMadrugadaPregoes() {
    if (rotinaMadrugadaEmAndamento) {
        console.warn('⚠️ [CRON] Rotina de madrugada de pregões já está em andamento. Nova execução ignorada.');
        return { sucesso: false, ignorado: true, erro: 'Rotina em andamento.' };
    }

    rotinaMadrugadaEmAndamento = true;
    console.log('\n🔄 [CRON] Iniciando atualização de madrugada dos pregões pendentes...');

    const db = abrirBanco();
    let pregoesPendentes = [];

    try {
        pregoesPendentes = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM pregoes_resumo WHERE concluido = 0 OR status_json IS NULL OR status_json = '{}'", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    } catch (erro) {
        console.error('❌ [CRON] Erro ao buscar pregões pendentes:', erro);
        return { sucesso: false, erro: erro.message };
    } finally {
        try { db.close(); } catch (e) {}
    }

    const totalPendentes = pregoesPendentes.length;

    if (totalPendentes === 0) {
        console.log('✅ [CRON] Nenhum pregão pendente de atualização.');
        rotinaMadrugadaEmAndamento = false;
        return { sucesso: true, totalAtualizados: 0, totalConcluidos: 0 };
    }

    let totalAtualizados = 0;
    let totalConcluidos = 0;
    let index = 1;

    try {
        for (const pregao of pregoesPendentes) {
            try {
                const pregRestantes = totalPendentes - index;
                console.log(`\n▶️ [CRON] Atualizando PE ${pregao.numero_limpo}/${pregao.ano} (${index}/${totalPendentes}) - Faltam ${pregRestantes} pregões.`);
                
                // Repassando o numeroLimpo para ter o visual limpo nas páginas
                const itensBrutos = await buscarTodosItensDaCompra(pregao.id_compra, pregao.ano, pregao.numero_limpo);

                if (itensBrutos && itensBrutos.length > 0) {
                    await salvarItensCache(pregao.id_compra, itensBrutos);
                    console.log(`   ✅ Gravados ${itensBrutos.length} itens do PE ${pregao.numero_limpo} na tabela (pregoes_itens).`);
                }

                // UTILIZANDO A NOVA FUNÇÃO CENTRALIZADA
                const calculo = await recalcularStatusPregao(itensBrutos);

                await salvarPregaoCache({
                    idCompra: pregao.id_compra,
                    numeroLimpo: pregao.numero_limpo,
                    ano: pregao.ano,
                    situacaoGeral: pregao.situacao_geral,
                    totalItens: calculo.totalItens,
                    homologados: calculo.homologados,
                    desertos: calculo.desertos,
                    frustrados: calculo.frustrados,
                    concluido: calculo.concluido,
                    processoSei: pregao.processo_sei,
                    statusJson: JSON.stringify(calculo.statusAgrupado),
                    mesPublicacao: pregao.mes_publicacao
                });

                console.log(`   💾 Resumo do PE ${pregao.numero_limpo} atualizado (pregoes_resumo).`);
                totalAtualizados++;

                if (calculo.concluido) {
                    totalConcluidos++;
                    console.log(`   🌟 PE ${pregao.numero_limpo} atingiu 100% de conclusão definitiva!`);
                }
            } catch (erro) {
                console.error(`   ❌ [CRON] Erro ao atualizar PE ${pregao.numero_limpo}:`, erro.message || erro);
            }
            index++;
        }

        console.log(`\n✅ [CRON] Atualização de madrugada finalizada. ${totalAtualizados} atualizados. ${totalConcluidos} concluídos.`);
        return { sucesso: true, totalAtualizados, totalConcluidos };
    } finally {
        rotinaMadrugadaEmAndamento = false;
    }
}

async function processarSincronizacaoAnos(anosArray, uasg = UASG_PADRAO) {
    let totalPregoesSalvos = 0;

    for (const ano of anosArray) {
        try {
            const urlBuscaPNCP = montarUrlBuscaPNCP(ano, uasg);
            
            const resposta = await pncpFetch(
                urlBuscaPNCP,
                { method: 'GET', headers: { Accept: 'application/json' } },
                `Buscando lista de pregões do ano ${ano}`
            );
            
            const dados = await resposta.json();
            const contratacoes = Array.isArray(dados?.resultado) ? dados.resultado : [];
            const totalContratacoes = contratacoes.length;

            console.log(`\n================================================================`);
            console.log(`📅 [SYNC] INICIANDO VARREDURA DO ANO ${ano} - ${totalContratacoes} Pregões localizados.`);
            console.log(`================================================================`);

            let index = 1;

            for (const pregao of contratacoes) {
                const numeroLimpo = String(pregao.numeroCompra || '').trim();
                const idCompra = pregao.idCompra;
                const situacaoGeral = pregao.situacaoCompraNomePncp || 'N/A';
                const objetoPregao = String(pregao.objetoCompra || pregao.objeto || '');

                const pregRestantes = totalContratacoes - index;
                console.log(`\n▶️ [Ano ${ano}] Sincronizando PE ${numeroLimpo} (${index}/${totalContratacoes}) - Faltam ${pregRestantes} pregões.`);

                const matchSEI = objetoPregao.match(/25410\.\d{6}\/\d{4}-\d{2}/);
                const processoSei = matchSEI ? matchSEI[0] : null;

                if (!idCompra) {
                    index++;
                    continue;
                }

                let mesPublicacao = 0;
                if (pregao.dataPublicacaoPncp) {
                    const dataObj = new Date(pregao.dataPublicacaoPncp);
                    if (!isNaN(dataObj.getTime())) {
                        mesPublicacao = dataObj.getMonth();
                    }
                }

                const cacheExistente = await buscarPregaoCache(idCompra);

                let statusJson = cacheExistente ? cacheExistente.status_json : '{}';
                let totalItens = cacheExistente ? cacheExistente.total_itens : 0;
                let homologados = cacheExistente ? cacheExistente.homologados : 0;
                let desertos = cacheExistente ? cacheExistente.desertos : 0;
                let frustrados = cacheExistente ? cacheExistente.frustrados : 0;
                let concluido = cacheExistente ? (cacheExistente.concluido === 1) : false;

                const precisaSincronizarItens = !cacheExistente || !concluido || !statusJson || statusJson === '{}';

                if (precisaSincronizarItens) {
                    try {
                        // Repassando o numeroLimpo para o log ficar transparente
                        const itensBrutos = await buscarTodosItensDaCompra(idCompra, ano, numeroLimpo);

                        if (itensBrutos && itensBrutos.length > 0) {
                            await salvarItensCache(idCompra, itensBrutos);
                            console.log(`   ✅ Gravados ${itensBrutos.length} itens do PE ${numeroLimpo} na tabela (pregoes_itens).`);
                        } else {
                            console.log(`   ⚠️ PE ${numeroLimpo} não retornou nenhum item.`);
                        }

                        // UTILIZANDO A NOVA FUNÇÃO CENTRALIZADA
                        const calculo = await recalcularStatusPregao(itensBrutos);
                        
                        totalItens = calculo.totalItens;
                        homologados = calculo.homologados;
                        desertos = calculo.desertos;
                        frustrados = calculo.frustrados;
                        statusJson = JSON.stringify(calculo.statusAgrupado);
                        concluido = calculo.concluido;

                    } catch (errItens) {
                        console.error(`   ❌ [SYNC] Erro ao buscar itens do pregão ${numeroLimpo}:`, errItens.message);
                    }
                } else {
                    console.log(`   ⏭️ PE ${numeroLimpo} já estava 100% concluído no banco. Pulando verificação de itens...`);
                }

                const dadosSalvar = {
                    idCompra,
                    numeroLimpo,
                    ano: String(ano),
                    situacaoGeral,
                    totalItens,
                    homologados,
                    desertos,
                    frustrados,
                    concluido,
                    processoSei: processoSei || (cacheExistente ? cacheExistente.processo_sei : null),
                    statusJson,
                    mesPublicacao
                };

                await salvarPregaoCache(dadosSalvar);
                console.log(`   💾 Resumo do PE ${numeroLimpo} atualizado no banco principal (pregoes_resumo).`);
                
                totalPregoesSalvos++;
                index++;
            }
        } catch (err) {
            console.error(`\n❌ [SYNC] Erro ao sincronizar pregões do ano ${ano}:`, err.message || err);
        }
    }

    return { sucesso: true, totalPregoesSalvos };
}

async function sincronizarPregoesInicial() {
    if (sincronizacaoInicialJaExecutada || sincronizacaoPregoesEmAndamento) return { sucesso: false, ignorado: true };

    sincronizacaoInicialJaExecutada = true;
    sincronizacaoPregoesEmAndamento = true;

    try {
        console.log('\n🚀 [INIT] Iniciando sincronização histórica de Pregões (2025 em diante)...');
        const anoAtual = new Date().getFullYear();
        const anosParaBuscar = [];

        for (let ano = 2025; ano <= anoAtual; ano++) anosParaBuscar.push(ano);

        const resultado = await processarSincronizacaoAnos(anosParaBuscar, UASG_PADRAO);
        console.log(`\n✅ [INIT] Sincronização histórica finalizada. ${resultado?.totalPregoesSalvos || 0} salvo(s).`);
        return { sucesso: true, ...resultado };
    } catch (erro) {
        console.error('\n❌ [INIT] Erro na sincronização histórica:', erro);
        return { sucesso: false, erro: erro.message };
    } finally {
        sincronizacaoPregoesEmAndamento = false;
    }
}

async function atualizarCachePregoesSei() {
    if (sincronizacaoPregoesEmAndamento) return { sucesso: false, ignorado: true };

    sincronizacaoPregoesEmAndamento = true;

    try {
        console.log('\n🔄 [CRON] Iniciando atualização de base de Pregões e Processos SEI do ano vigente...');
        const anoAtual = new Date().getFullYear();
        const resultado = await processarSincronizacaoAnos([anoAtual], UASG_PADRAO);
        
        console.log(`\n✅ [CRON] Sincronização finalizada. ${resultado?.totalPregoesSalvos || 0} salvo(s).`);
        return { sucesso: true, ...resultado };
    } catch (erro) {
        console.error('\n❌ [CRON] Erro na atualização:', erro);
        return { sucesso: false, erro: erro.message };
    } finally {
        sincronizacaoPregoesEmAndamento = false;
    }
}

function sincronizacaoPregoesEstaEmAndamento() {
    return sincronizacaoPregoesEmAndamento;
}

// NOVA FUNÇÃO: GERAR CACHE DA MATRIZ REAL
async function gerarCacheMatrizReal(anoAlvo) {
    console.log(`\n[CRON] 📊 Iniciando cálculo da Matriz de Produtividade Real para o ano ${anoAlvo}...`);
    const anoAnterior = anoAlvo - 1;

    const pregoesAtual = await buscarTodosPregoesPorAnoCache(anoAlvo);
    const pregoesAnterior = await buscarTodosPregoesPorAnoCache(anoAnterior);
    const todosPregoes = [...(pregoesAnterior || []), ...(pregoesAtual || [])];

    const nomeMeses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    let matrizReal = {};
    nomeMeses.forEach(mes => { matrizReal[mes] = {}; });

    if (todosPregoes.length > 0) {
        for (const p of todosPregoes) {
            if (!p.id_compra || p.total_itens === 0) continue;

            // OTIMIZAÇÃO: Filtro inteligente no cache local
            let temAcao = false;
            if (p.status_json) {
                try {
                    const statusJson = JSON.parse(p.status_json);
                    for (const [sit, qtd] of Object.entries(statusJson)) {
                        if (qtd > 0) {
                            temAcao = true;
                            break;
                        }
                    }
                } catch (e) {}
            }
            
            if (!temAcao) continue;

            try {
                // Tenta puxar do banco rápido primeiro. Se não tiver, busca da internet.
                let itensBrutos = await buscarItensCache(p.id_compra);
                
                if (!itensBrutos || itensBrutos.length === 0) {
                    itensBrutos = await buscarTodosItensDaCompra(p.id_compra, p.ano, p.numero_limpo);
                    if (itensBrutos.length > 0) {
                        await salvarItensCache(p.id_compra, itensBrutos);
                    }
                }

                itensBrutos.forEach(item => {
                    const sitLabel = String(item.situacaoCompraItemNome || item.situacaoItem || 'Em Andamento / Não Informado').trim();
                    const dataAcaoStr = item.dataResultado || item.dataAtualizacaoPncp || item.dataInclusaoPncp || null;
                    if (!dataAcaoStr) return;

                    const dataAcaoObj = new Date(dataAcaoStr);
                    if (isNaN(dataAcaoObj.getTime())) return;

                    // Se a ação ocorreu no ano alvo, contabilizamos no mês correspondente
                    if (dataAcaoObj.getFullYear() === anoAlvo) {
                        const mesAcaoIdx = dataAcaoObj.getMonth();
                        const rotuloMes = nomeMeses[mesAcaoIdx];
                        matrizReal[rotuloMes][sitLabel] = (matrizReal[rotuloMes][sitLabel] || 0) + 1;
                    }
                });
            } catch (errItem) {
                console.error(`❌ Erro ao varrer itens da compra ${p.id_compra} para matriz real:`, errItem.message);
            }
        }
    }

    const dirCache = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dirCache)) fs.mkdirSync(dirCache, { recursive: true });
    
    const cachePath = path.join(dirCache, `matriz_real_${anoAlvo}.json`);
    fs.writeFileSync(cachePath, JSON.stringify({ 
        ultimaAtualizacao: new Date().toISOString(), 
        matrizReal 
    }, null, 2));

    console.log(`✅ [CRON] Matriz de Produtividade Real (${anoAlvo}) gerada e salva em cache com sucesso!\n`);
    return matrizReal;
}

module.exports = {
    rotinaMadrugadaPregoes,
    atualizarCachePregoesSei,
    sincronizarPregoesInicial,
    sincronizacaoPregoesEstaEmAndamento,
    gerarCacheMatrizReal,
    recalcularStatusPregao
};
const {
    iniciarBancoSidec,
    abrirBanco,
    dbRun,
    itemEstaSuspenso,
    extrairStatusVisual,
    extrairSituacaoItem
} = require('./sidec');

const API_ITEM_URL = 'https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial';
const TIMEOUT_MS = 30000;
const MAX_TENTATIVAS = 5; // Aumentado para lidar com bloqueios temporários
const ESPERA_ENTRE_TENTATIVAS_MS = 2000; 
const ESPERA_ENTRE_PAGINAS_MS = 10000; // Aumentado de 800ms para 10s para evitar 429 preventivamente

let atualizacaoEmAndamento = false;

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function montarUrlComParams(url, params = {}) {
    const urlObj = new URL(url);

    Object.entries(params).forEach(([chave, valor]) => {
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
            urlObj.searchParams.set(chave, String(valor));
        }
    });

    return urlObj;
}

async function requisicaoJson(url, params = {}, timeoutMs = TIMEOUT_MS) {
    const urlObj = montarUrlComParams(url, params);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const resposta = await fetch(urlObj.toString(), {
            method: 'GET',
            signal: controller.signal
        });

        if (!resposta.ok) {
            throw new Error(`HTTP ${resposta.status} ao consultar ${urlObj.toString()}`);
        }

        const json = await resposta.json();

        if (!json || typeof json !== 'object') {
            throw new Error(`Resposta JSON inválida em ${urlObj.toString()}`);
        }

        return json;
    } catch (erro) {
        if (erro?.name === 'AbortError') {
            throw new Error(`Timeout de ${timeoutMs}ms ao consultar ${urlObj.toString()}`);
        }

        throw erro;
    } finally {
        clearTimeout(timeout);
    }
}

async function requisicaoJsonComRetry(url, params = {}, options = {}) {
    const {
        timeoutMs = TIMEOUT_MS,
        maxTentativas = MAX_TENTATIVAS,
        esperaEntreTentativasMs = ESPERA_ENTRE_TENTATIVAS_MS
    } = options;

    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            if (tentativa > 1) {
                console.log(`🔁 Nova tentativa ${tentativa}/${maxTentativas} para página ${params?.pagina}...`);
            }

            return await requisicaoJson(url, params, timeoutMs);
        } catch (erro) {
            ultimoErro = erro;

            console.error(
                `⚠️ Falha na tentativa ${tentativa}/${maxTentativas} da página ${params?.pagina}:`,
                erro.message || erro
            );

            if (tentativa < maxTentativas) {
                // Exponential Backoff
                // Se for um erro 429, triplicamos o tempo base a cada tentativa. Se for outro erro, dobramos.
                const ehErro429 = erro.message && erro.message.includes('429');
                const multiplicador = ehErro429 ? 3 : 2;
                const delay = esperaEntreTentativasMs * Math.pow(multiplicador, tentativa); 
                
                if (ehErro429) {
                    console.log(`⏳ [API PNCP] Limite do Governo excedido (429). Hera aguardando ${delay/1000}s antes de tentar novamente...`);
                }
                
                await esperar(delay);
            }
        }
    }

    throw ultimoErro || new Error('Falha desconhecida na requisição com retry.');
}

async function atualizarCatalogoSidecAtivo() {
    if (atualizacaoEmAndamento) {
        const mensagem = 'Já existe uma atualização do catálogo SIDEC em andamento.';
        console.warn(`⚠️ ${mensagem}`);

        return {
            sucesso: false,
            ignorado: true,
            erro: mensagem
        };
    }

    atualizacaoEmAndamento = true;

    await iniciarBancoSidec();
    const db = abrirBanco();

    try {
        console.log('🌙 Atualização do catálogo SIDEC iniciada...');
        console.log('🧹 Limpando tabela catalogo_ativo para recarga completa...');

        await dbRun(db, 'DELETE FROM catalogo_ativo');

        let pagina = 1;
        const tamanhoPagina = 100; // Reduzido de 500 para 100 itens por página
        let totalInseridos = 0;
        let totalSuspensosIgnorados = 0;
        let totalPaginasProcessadas = 0;

        while (true) {
            console.log(`📦 Baixando página ${pagina}...`);

            const dados = await requisicaoJsonComRetry(API_ITEM_URL, {
                statusItem: 'true',
                pagina,
                tamanhoPagina
            });

            const resultados = Array.isArray(dados?.resultado) ? dados.resultado : [];

            console.log(`📄 Página ${pagina} retornou ${resultados.length} registro(s).`);

            if (!resultados.length) {
                console.log(`🏁 Fim da paginação confirmado na página ${pagina}.`);
                break;
            }

            for (const item of resultados) {
                if (itemEstaSuspenso(item)) {
                    totalSuspensosIgnorados++;
                    continue;
                }

                await dbRun(db, `
                    INSERT OR REPLACE INTO catalogo_ativo (
                        codigo_item,
                        descricao_item,
                        codigo_pdm,
                        nome_pdm,
                        codigo_classe,
                        situacao_item,
                        status_visual,
                        atualizado_em
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    String(item.codigoItem || '').trim(),
                    String(item.descricaoItem || '').trim(),
                    String(item.codigoPdm || '').trim(),
                    String(item.nomePdm || '').trim(),
                    String(item.codigoClasse || '').trim(),
                    extrairSituacaoItem(item),
                    extrairStatusVisual(item)
                ]);

                totalInseridos++;
            }

            totalPaginasProcessadas++;
            pagina++;

            // Espera preventiva entre cada página processada com sucesso
            await esperar(ESPERA_ENTRE_PAGINAS_MS);
        }

        console.log(
            `✅ Catálogo atualizado com sucesso. ` +
            `${totalInseridos} itens gravados. ` +
            `${totalSuspensosIgnorados} suspenso(s) ignorado(s). ` +
            `${totalPaginasProcessadas} página(s) processada(s).`
        );

        return {
            sucesso: true,
            totalInseridos,
            totalSuspensosIgnorados,
            totalPaginasProcessadas
        };
    } catch (erro) {
        console.error('❌ Erro ao atualizar catálogo SIDEC:', erro);

        return {
            sucesso: false,
            erro: erro?.message || 'Erro desconhecido'
        };
    } finally {
        atualizacaoEmAndamento = false;

        try {
            db.close();
        } catch (erroFechamento) {
            console.error('⚠️ Erro ao fechar banco SIDEC:', erroFechamento);
        }
    }
}

function catalogoSidecEstaAtualizando() {
    return atualizacaoEmAndamento;
}

module.exports = {
    atualizarCatalogoSidecAtivo,
    catalogoSidecEstaAtualizando
};
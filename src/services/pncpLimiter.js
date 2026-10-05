// src/services/pncpLimiter.js
//
// Fila central de requisições para a API do PNCP / Compras.gov.
// Objetivo: garantir que NENHUMA parte do sistema (sync noturna, exportação
// de planilha, consulta de pregão via chat, etc.) dispare chamadas em
// paralelo ou em intervalo menor que o mínimo seguro — que é a causa raiz
// do 429 "Limite do Governo excedido".

const INTERVALO_MINIMO_MS = 1200;   // intervalo mínimo entre 2 chamadas quaisquer ao PNCP
const MAX_TENTATIVAS = 6;
const ESPERA_BASE_MS = 8000;        // base do backoff exponencial em caso de 429 sem Retry-After
const ESPERA_MAX_MS = 60000;        // teto de espera por tentativa

let filaAtiva = Promise.resolve();  // garante execução serializada (1 por vez)
let ultimoDisparoEm = 0;

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(ms) {
    // +/- 20% para evitar que múltiplos processos acordem no mesmo instante
    const variacao = ms * 0.2;
    return Math.round(ms - variacao + Math.random() * variacao * 2);
}

function extrairRetryAfterMs(resposta, corpoErro) {
    // 1) Header padrão HTTP (o jeito correto e mais confiável)
    const headerRetry = resposta.headers?.get?.('retry-after');
    if (headerRetry && !Number.isNaN(Number(headerRetry))) {
        return (Number(headerRetry) + 1) * 1000;
    }

    // 2) Fallback: tenta achar no corpo, tipo "Try again in 12 seconds"
    const match = String(corpoErro || '').match(/(\d+)\s*seconds?/i);
    if (match && match[1]) {
        return (parseInt(match[1], 10) + 2) * 1000;
    }

    return null;
}

/**
 * Garante espaçamento mínimo entre chamadas, enfileirando quem chegar depois.
 */
async function reservarSlot() {
    const executarAgora = filaAtiva.then(async () => {
        const agora = Date.now();
        const faltam = INTERVALO_MINIMO_MS - (agora - ultimoDisparoEm);
        if (faltam > 0) {
            await esperar(faltam);
        }
        ultimoDisparoEm = Date.now();
    });

    filaAtiva = executarAgora.catch(() => {}); // não deixa uma falha travar a fila
    await executarAgora;
}

/**
 * Substituto de fetch() para qualquer chamada à API do PNCP/Compras.gov.
 * Serializa, respeita Retry-After, faz backoff exponencial com jitter.
 */
async function pncpFetch(url, options = {}, contexto = 'PNCP') {
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        await reservarSlot();

        try {
            // Adicionando transparência total no terminal antes do disparo
            if (tentativa === 1) {
                console.log(`🌐 [${contexto}] Requisitando dados do PNCP...`);
            } else {
                console.log(`🌐 [${contexto}] Retentativa ${tentativa}/${MAX_TENTATIVAS}...`);
            }

            const resposta = await fetch(url, options);

            if (resposta.status === 429) {
                const corpoErro = await resposta.text().catch(() => '');
                let espera = extrairRetryAfterMs(resposta, corpoErro);

                if (espera === null) {
                    espera = Math.min(ESPERA_BASE_MS * tentativa, ESPERA_MAX_MS);
                }
                espera = jitter(espera);

                console.log(`⏳ [${contexto}] 429 recebido. Aguardando ${(espera / 1000).toFixed(1)}s (tentativa ${tentativa}/${MAX_TENTATIVAS})...`);
                await esperar(espera);
                ultimoErro = new Error(`HTTP 429 em ${url}`);
                continue;
            }

            if ([500, 502, 503, 504, 408].includes(resposta.status)) {
                const espera = jitter(Math.min(ESPERA_BASE_MS * tentativa, ESPERA_MAX_MS));
                console.log(`🔁 [${contexto}] HTTP ${resposta.status}. Nova tentativa em ${(espera / 1000).toFixed(1)}s...`);
                await esperar(espera);
                ultimoErro = new Error(`HTTP ${resposta.status} em ${url}`);
                continue;
            }

            // Sucesso ou erro definitivo (400, 401, 403, 404...) -> retorna direto
            return resposta;
        } catch (erro) {
            ultimoErro = erro;
            console.error(`⚠️ [${contexto}] Falha de rede na tentativa ${tentativa}/${MAX_TENTATIVAS}:`, erro.message || erro);
            await esperar(jitter(Math.min(ESPERA_BASE_MS * tentativa, ESPERA_MAX_MS)));
        }
    }

    throw ultimoErro || new Error(`Falha desconhecida ao consultar ${contexto}`);
}

module.exports = { pncpFetch };
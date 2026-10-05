// src/services/api.js
const pdfParse = require('pdf-parse-new');
const { iniciarBancoPregoes, buscarPregaoCache, salvarPregaoCache } = require('./pregoesCache');
const { salvarAtaCache, buscarAtasPorAnoCache, buscarAtaPorNumeroCache, limparAtasPorAnoCache } = require('./atasCache');
const { pncpFetch } = require('./pncpLimiter');

let atualizacaoCompletaAtasEmAndamento = false;
let atualizacaoVigentesAtasEmAndamento = false;

async function consultarEmpenhoARP(numeroAta, unidadeGerenciadora) {
    try {
        const urlGoverno = `https://dadosabertos.compras.gov.br/modulo-arp/4_consultarEmpenhosSaldoItem?numeroAta=${numeroAta}&unidadeGerenciadora=${unidadeGerenciadora}`;

        const resposta = await pncpFetch(urlGoverno, {
            method: 'GET',
            headers: { Accept: '*/*' }
        }, 'Consultar Empenho ARP');

        if (!resposta.ok) {
            if (resposta.status === 404) return `⚠️ Não encontrei dados para a Ata *${numeroAta}* na UASG *${unidadeGerenciadora}*.`;
            return `❌ Erro ao consultar o sistema de compras (Código: ${resposta.status}).`;
        }

        const dados = await resposta.json();

        if (!dados.resultado || dados.resultado.length === 0) {
            return `⚠️ Nenhum empenho encontrado para esta Ata e UASG.`;
        }

        const empenho = dados.resultado[0];

        let texto = `🔎 *Consulta de Saldo e Empenho (ARP)*\n\n`;
        texto += `*Item:* ${empenho.numeroItem || 'N/A'}\n`;
        texto += `*Unidade:* ${empenho.unidade || 'N/A'}\n`;
        texto += `*Qtd. Registrada:* ${empenho.quantidadeRegistrada || 0}\n`;
        texto += `*Qtd. Empenhada:* ${empenho.quantidadeEmpenhada || 0}\n`;
        texto += `*Saldo para Empenho:* ${empenho.saldoEmpenho || 0}\n\n`;

        let dataAtualizacao = 'N/A';
        if (empenho.dataHoraAtualizacao) {
            const dataObj = new Date(empenho.dataHoraAtualizacao);
            dataAtualizacao = dataObj.toLocaleString('pt-BR');
        }

        texto += `_Última atualização no Compras.gov.br: ${dataAtualizacao}_`;

        return texto;
    } catch (erro) {
        console.error('Erro ao consultar a API de compras:', erro);
        return '❌ Ocorreu um erro de conexão ao tentar consultar os dados da ata. Tente novamente mais tarde.';
    }
}

function normalizarNumeroPregao(numeroPregao) {
    const texto = String(numeroPregao || '').trim();

    let numeroLimpo = '';
    let ano = '';

    if (texto.includes('/')) {
        const partes = texto.split('/');
        numeroLimpo = String(partes[0]).replace(/\D/g, '');
        ano = String(partes[1]).replace(/\D/g, '');
    } else {
        const apenasNumeros = texto.replace(/\D/g, '');

        if (apenasNumeros.length >= 5) {
            ano = apenasNumeros.slice(-4);
            numeroLimpo = apenasNumeros.slice(0, -4);
        } else {
            numeroLimpo = apenasNumeros;
            ano = new Date().getFullYear().toString();
        }
    }

    return { numeroLimpo, ano };
}

function obterListaResultado(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.resultado)) return payload.resultado;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.itens)) return payload.itens;
    if (Array.isArray(payload.content)) return payload.content;
    return [];
}

function obterNumeroItem(item) {
    const valor = item.numeroItemCompra ?? item.numeroItemPncp ?? item.numeroItem ?? item.item ?? '999999';
    const numero = parseInt(String(valor).replace(/\D/g, ''), 10);
    return Number.isNaN(numero) ? 999999 : numero;
}

function formatarMoeda(valor) {
    if (valor === null || valor === undefined || valor === '') {
        return 'N/A';
    }

    if (typeof valor === 'string') {
        const texto = valor.trim();

        if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(texto)) {
            return `R$ ${texto}`;
        }

        const normalizado = texto.replace(/\./g, '').replace(',', '.');
        const numero = Number(normalizado);

        if (Number.isFinite(numero)) {
            return numero.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            });
        }

        return texto;
    }

    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        return 'N/A';
    }

    return numero.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function consolidarItens(itens) {
    const mapa = new Map();

    itens.forEach(item => {
        const numeroItem = String(
            item.numeroItemCompra ??
            item.numeroItemPncp ??
            item.numeroItem ??
            item.item ??
            'N/A'
        ).trim();

        const descricao = String(
            item.descricaoResumida ??
            item.descricao ??
            item.objetoCompra ??
            'N/A'
        ).trim();

        const situacao = String(
            item.situacaoCompraItemNome ??
            item.situacaoItem ??
            item.situacao ??
            'N/A'
        ).trim();

        const fornecedor = String(
            item.nomeFornecedor ??
            item.nomeRazaoSocialFornecedor ??
            item.fornecedor ??
            ''
        ).trim();

        const valor =
            item.valorTotalResultado ??
            item.valorTotal ??
            item.valorUnitarioResultado ??
            item.valorUnitario ??
            item.valorHomologado ??
            null;

        const chave = `${numeroItem}|||${descricao}`;

        if (!mapa.has(chave)) {
            mapa.set(chave, {
                numeroItem,
                descricao,
                situacoes: [],
                fornecedor: '',
                valor
            });
        }

        const registro = mapa.get(chave);

        if (situacao && !registro.situacoes.includes(situacao)) {
            registro.situacoes.push(situacao);
        }

        if (fornecedor && !registro.fornecedor) {
            registro.fornecedor = fornecedor;
        }

        if (
            (registro.valor === null || registro.valor === undefined || registro.valor === '') &&
            valor !== null &&
            valor !== undefined &&
            valor !== ''
        ) {
            registro.valor = valor;
        }
    });

    return Array.from(mapa.values()).sort((a, b) => {
        const numeroA = parseInt(String(a.numeroItem).replace(/\D/g, ''), 10);
        const numeroB = parseInt(String(b.numeroItem).replace(/\D/g, ''), 10);

        const valorA = Number.isNaN(numeroA) ? 999999 : numeroA;
        const valorB = Number.isNaN(numeroB) ? 999999 : numeroB;

        return valorA - valorB;
    });
}

async function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function criarFaixasTrimestraisDoAno(ano) {
    return [
        { inicio: `${ano}-01-01`, fim: `${ano}-03-31`, rotulo: `${ano} T1` },
        { inicio: `${ano}-04-01`, fim: `${ano}-06-30`, rotulo: `${ano} T2` },
        { inicio: `${ano}-07-01`, fim: `${ano}-09-30`, rotulo: `${ano} T3` },
        { inicio: `${ano}-10-01`, fim: `${ano}-12-31`, rotulo: `${ano} T4` }
    ];
}

function criarFaixaVigentesRecentes() {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const anoAnterior = anoAtual - 1;

    return {
        inicio: `${anoAnterior}-01-01`,
        fim: `${anoAtual + 1}-12-31`,
        rotulo: `${anoAnterior}-${anoAtual + 1}`
    };
}

function deduplicarAtasPorNumero(lista) {
    const mapa = new Map();

    for (const ata of lista || []) {
        const numero =
            String(
                ata?.numeroAtaRegistroPreco ||
                ata?.numeroAta ||
                ata?.numero_ata ||
                ''
            ).trim();

        if (!numero) continue;

        if (!mapa.has(numero)) {
            mapa.set(numero, ata);
        }
    }

    return Array.from(mapa.values());
}

function deduplicarItensAta(lista) {
    const mapa = new Map();

    for (const item of lista || []) {
        const chave = [
            item?.numeroAtaRegistroPreco || item?.numeroAta || '',
            item?.numeroItem || '',
            item?.codigoItem || '',
            item?.niFornecedor || '',
            item?.nomeRazaoSocialFornecedor || ''
        ].join('|||');

        if (!mapa.has(chave)) {
            mapa.set(chave, item);
        }
    }

    return Array.from(mapa.values());
}

function anoDaAta(ata) {
    const datasPossiveis = [
        ata?.dataAssinatura,
        ata?.dataVigenciaInicial,
        ata?.dataVigenciaFinal,
        ata?.fimVigencia,
        ata?.dataFimVigencia
    ];

    for (const valor of datasPossiveis) {
        if (!valor) continue;
        const data = new Date(valor);
        if (!Number.isNaN(data.getTime())) {
            return data.getFullYear();
        }
    }

    const numeroAta = String(ata?.numeroAtaRegistroPreco || ata?.numeroAta || '');
    const matchAno = numeroAta.match(/\/(\d{4})$/);
    if (matchAno) {
        return Number(matchAno[1]);
    }

    return null;
}

function ataPertenceAoAno(ata, ano) {
    const anoExtraido = anoDaAta(ata);
    return Number(anoExtraido) === Number(ano);
}

function normalizarAtaParaBanco(ata, itensDaAta = [], anoPreferencial = null) {
    const numeroAta =
        ata?.numeroAtaRegistroPreco ||
        ata?.numeroAta ||
        ata?.numero_ata ||
        '';

    const numeroCompra =
        ata?.numeroCompra ||
        ata?.numeroPregao ||
        ata?.numeroContratacao ||
        '';

    const fornecedoresSet = new Set();
    itensDaAta.forEach(i => {
        const fornecedor = i?.nomeRazaoSocialFornecedor || i?.nomeFornecedor || '';
        if (fornecedor) fornecedoresSet.add(fornecedor);
    });

    const fornecedoresString =
        fornecedoresSet.size > 0
            ? Array.from(fornecedoresSet).join(' / ')
            : 'Sem fornecedor cadastrado nos itens';

    const anoFinal =
        anoPreferencial ||
        anoDaAta(ata) ||
        new Date().getFullYear();

    return {
        numero_ata: String(numeroAta).trim(),
        ano: parseInt(anoFinal, 10),
        numero_compra: String(numeroCompra || '').trim(),
        fornecedores: fornecedoresString,
        dados_gerais: ata,
        itens: itensDaAta
    };
}

// ATUALIZADO: Agora repassa o contexto para a limitação da rede, exibindo o log completo no terminal.
async function buscarTodasPaginas(urlBase, contexto = 'API') {
    const TAMANHO_PAGINA = 100;
    let resultados = [];
    let pagina = 1;
    let totalPaginas = 1;

    do {
        const separador = urlBase.includes('?') ? '&' : '?';
        const url = `${urlBase}${separador}pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`;

        try {
            const response = await pncpFetch(url, {
                method: 'GET',
                headers: { Accept: '*/*' }
            }, `${contexto} - pag ${pagina}`);

            if (response.status === 404) {
                return {
                    ok: false,
                    resultados,
                    erro: `HTTP 404 no endpoint ${urlBase}`
                };
            }

            if (!response.ok) {
                const corpoErro = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}. ${corpoErro.slice(0, 400)}`);
            }

            const data = await response.json();
            const itens = obterListaResultado(data);

            if (Array.isArray(itens)) {
                resultados = resultados.concat(itens);
            }

            totalPaginas =
                Number(data?.totalPaginas) ||
                Number(data?.total_pages) ||
                Number(data?.pages) ||
                1;

            pagina++;
        } catch (error) {
            return {
                ok: false,
                resultados,
                erro: error.message || 'Falha desconhecida ao consultar API'
            };
        }
    } while (pagina <= totalPaginas);

    return {
        ok: true,
        resultados,
        erro: null
    };
}

async function buscarAtasPorFimVigencia(uasg, dataInicial, dataFinal, contexto = 'ATAS FIM VIGENCIA') {
    const url = `https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP?codigoUnidadeGerenciadora=${uasg}&dataVigenciaInicialMin=${dataInicial}&dataVigenciaInicialMax=${dataFinal}`;
    return buscarTodasPaginas(url, `${contexto} (${dataInicial} a ${dataFinal})`);
}

async function buscarItensAtasPorFimVigencia(uasg, dataInicial, dataFinal, contexto = 'ITENS ATAS FIM VIGENCIA') {
    const url = `https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem?codigoUnidadeGerenciadora=${uasg}&dataVigenciaInicialMin=${dataInicial}&dataVigenciaInicialMax=${dataFinal}`;
    return buscarTodasPaginas(url, `${contexto} (${dataInicial} a ${dataFinal})`);
}

async function sincronizarAtasAno(ano) {
    console.log(`[SYNC ATAS] Iniciando download das atas do ano ${ano} em blocos trimestrais por fim de vigência...`);

    const uasg = '250052';
    const faixas = criarFaixasTrimestraisDoAno(ano);

    let todasAtas = [];
    let todosItens = [];

    for (const faixa of faixas) {
        console.log(`📦 [SYNC ATAS] Processando faixa ${faixa.rotulo}: ${faixa.inicio} até ${faixa.fim}`);

        // ATUALIZADO: Identificando o ano exato
        const retornoAtas = await buscarAtasPorFimVigencia(uasg, faixa.inicio, faixa.fim, `SYNC ATAS ${ano}`);
        if (!retornoAtas.ok) {
            throw new Error(`Falha ao consultar atas na faixa ${faixa.rotulo}: ${retornoAtas.erro}`);
        }

        // ATUALIZADO: Identificando o ano exato
        const retornoItens = await buscarItensAtasPorFimVigencia(uasg, faixa.inicio, faixa.fim, `SYNC ITENS ATAS ${ano}`);
        if (!retornoItens.ok) {
            throw new Error(`Falha ao consultar itens das atas na faixa ${faixa.rotulo}: ${retornoItens.erro}`);
        }

        todasAtas = todasAtas.concat(retornoAtas.resultados || []);
        todosItens = todosItens.concat(retornoItens.resultados || []);
    }

    const listaAtasDedup = deduplicarAtasPorNumero(todasAtas);
    const listaItensDedup = deduplicarItensAta(todosItens);

    if (listaAtasDedup.length === 0) {
        console.log(`[SYNC ATAS] Nenhuma ata encontrada na API para ${ano}.`);
        return 0;
    }

    await limparAtasPorAnoCache(ano);

    let atasSalvas = 0;
    for (const ata of listaAtasDedup) {
        const numeroAta =
            ata?.numeroAtaRegistroPreco ||
            ata?.numeroAta ||
            ata?.numero_ata ||
            '';

        if (!numeroAta) continue;

        const itensDestaAta = listaItensDedup.filter(i => {
            const numeroAtaItem = i?.numeroAtaRegistroPreco || i?.numeroAta || '';
            return String(numeroAtaItem).trim() === String(numeroAta).trim();
        });

        const ataFormatadaDb = normalizarAtaParaBanco(ata, itensDestaAta, ano);

        try {
            await salvarAtaCache(ataFormatadaDb);
            atasSalvas++;
        } catch (dbErr) {
            console.error(`[SYNC ATAS] Erro ao salvar a ata ${numeroAta}:`, dbErr.message);
        }
    }

    console.log(`[SYNC ATAS] Concluído. ${atasSalvas} atas salvas/atualizadas para ${ano}.`);
    return atasSalvas;
}

async function atualizarTodasAtasDesde2024() {
    if (atualizacaoCompletaAtasEmAndamento) {
        return {
            sucesso: false,
            ignorado: true,
            mensagem: '⚠️ Já existe uma atualização completa de atas em andamento.'
        };
    }

    atualizacaoCompletaAtasEmAndamento = true;

    try {
        const anoAtual = new Date().getFullYear();
        let totalSalvas = 0;
        const detalhes = [];

        console.log('🚀 [ATAS FULL] Iniciando atualização completa de atas desde 2024...');

        for (let ano = 2024; ano <= anoAtual; ano++) {
            try {
                console.log(`📚 [ATAS FULL] Sincronizando ano ${ano}...`);
                const salvas = await sincronizarAtasAno(ano);
                totalSalvas += salvas;
                detalhes.push({ ano, salvas, sucesso: true });
            } catch (erro) {
                console.error(`❌ [ATAS FULL] Falha ao sincronizar ano ${ano}:`, erro.message || erro);
                detalhes.push({ ano, salvas: 0, sucesso: false, erro: erro.message || 'Erro desconhecido' });
            }
        }

        console.log(`✅ [ATAS FULL] Atualização completa finalizada. Total salvo: ${totalSalvas}`);

        return {
            sucesso: true,
            totalSalvas,
            detalhes,
            mensagem: `✅ Atualização completa de atas finalizada. Total de atas salvas/atualizadas desde 2024: ${totalSalvas}.`
        };
    } finally {
        atualizacaoCompletaAtasEmAndamento = false;
    }
}

async function atualizarAtasVigentesMadrugada() {
    if (atualizacaoVigentesAtasEmAndamento) {
        return {
            sucesso: false,
            ignorado: true,
            mensagem: '⚠️ Já existe uma atualização de atas vigentes em andamento.'
        };
    }

    atualizacaoVigentesAtasEmAndamento = true;

    try {
        const uasg = '250052';
        const faixa = criarFaixaVigentesRecentes();

        console.log(`🌙 [ATAS VIGENTES] Atualizando atas vigentes/recentes na faixa ${faixa.inicio} até ${faixa.fim}...`);

        const retornoAtas = await buscarAtasPorFimVigencia(uasg, faixa.inicio, faixa.fim, 'ATAS VIGENTES MADRUGADA');
        if (!retornoAtas.ok) {
            throw new Error(retornoAtas.erro);
        }

        const retornoItens = await buscarItensAtasPorFimVigencia(uasg, faixa.inicio, faixa.fim, 'ITENS ATAS VIGENTES MADRUGADA');
        if (!retornoItens.ok) {
            throw new Error(retornoItens.erro);
        }

        const listaAtas = deduplicarAtasPorNumero(retornoAtas.resultados || []);
        const listaItens = deduplicarItensAta(retornoItens.resultados || []);

        let totalSalvas = 0;

        for (const ata of listaAtas) {
            const numeroAta =
                ata?.numeroAtaRegistroPreco ||
                ata?.numeroAta ||
                ata?.numero_ata ||
                '';

            if (!numeroAta) continue;

            const itensDestaAta = listaItens.filter(i => {
                const numeroAtaItem = i?.numeroAtaRegistroPreco || i?.numeroAta || '';
                return String(numeroAtaItem).trim() === String(numeroAta).trim();
            });

            const ataFormatadaDb = normalizarAtaParaBanco(ata, itensDestaAta);

            try {
                await salvarAtaCache(ataFormatadaDb);
                totalSalvas++;
            } catch (dbErr) {
                console.error(`[ATAS VIGENTES] Erro ao salvar a ata ${numeroAta}:`, dbErr.message);
            }
        }

        console.log(`✅ [ATAS VIGENTES] Atualização concluída. ${totalSalvas} atas salvas/atualizadas.`);

        return {
            sucesso: true,
            totalSalvas,
            mensagem: `✅ Atualização de atas vigentes concluída. ${totalSalvas} atas salvas/atualizadas.`
        };
    } finally {
        atualizacaoVigentesAtasEmAndamento = false;
    }
}

// ATUALIZADO: Repassando o ano (se disponível) para exibir no terminal
async function buscarTodosItensDaCompra(idCompra, anoDeContexto = '', numeroLimpo = '') {
    let pagina = 1;
    const tamanhoPagina = 50;
    let todosItens = [];
    
    // Variáveis para rastrear os limites do Governo e blindar o sistema
    let totalPaginas = '?';
    let totalRegistros = '?';

    // Rótulo amigável (ex: PE 123/2026 ou ID longo)
    const refPregao = numeroLimpo ? `PE ${numeroLimpo}` : `ID ${idCompra}`;
    const strAno = anoDeContexto ? `[Ano ${anoDeContexto}]` : '';

    while (true) {
        let paginasRestantes = totalPaginas !== '?' ? (totalPaginas - pagina) : '?';
        
        // Exemplo visual: [Ano 2026] PE 12 - Baixando pág 1/10 (Restam: 9) - Total: 500 itens
        let infoPagina = totalPaginas !== '?' ? `${pagina}/${totalPaginas}` : `${pagina}`;
        let infoTotal = totalRegistros !== '?' ? ` | Total: ${totalRegistros} itens` : '';
        const contextoMsg = `${strAno} ${refPregao} - Baixando pág ${infoPagina} (Restam: ${paginasRestantes})${infoTotal}`;

        const urlItens = `https://dadosabertos.compras.gov.br/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id?tipo=idCompra&codigo=${idCompra}&tamanhoPagina=${tamanhoPagina}&pagina=${pagina}`;

        const respostaItens = await pncpFetch(urlItens, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        }, contextoMsg);

        if (respostaItens.status === 404) {
            return todosItens;
        }

        if (!respostaItens.ok) {
            const corpoErro = await respostaItens.text().catch(() => '');
            throw new Error(`Erro ao buscar os itens do pregão. Código: ${respostaItens.status}. ${corpoErro.slice(0, 300)}`);
        }

        const dadosItens = await respostaItens.json();

        // Registra o teto na primeira requisição para organizar os logs e blindar o loop
        if (pagina === 1) {
            totalPaginas = Number(dadosItens.totalPaginas) || Number(dadosItens.total_pages) || '?';
            totalRegistros = Number(dadosItens.totalRegistros) || Number(dadosItens.totalElements) || '?';
        }

        const itensPagina = obterListaResultado(dadosItens);

        if (!itensPagina.length) {
            return todosItens;
        }

        todosItens = todosItens.concat(itensPagina);

        // 🛡️ TRAVA 1: PNCP reportou que acabou
        if (totalPaginas !== '?' && pagina >= totalPaginas) {
            return todosItens;
        }

        // 🛡️ TRAVA 2: Faltou item na página, a base esgotou
        if (itensPagina.length < tamanhoPagina) {
            return todosItens;
        }

        // 🛡️ TRAVA 3: Anti-Loop Infinito do PNCP (impede o erro de 4.175+ páginas)
        if (pagina > 400) {
            console.error(`   🚨 [ERRO PNCP] Loop infinito detectado na base do Governo para a compra ${idCompra}. Abortando coleta excessiva.`);
            return todosItens;
        }

        pagina += 1;
    }
}

async function consultarItensPregao(numeroPregao) {
    try {
        const uasg = '250052';
        const { numeroLimpo, ano } = normalizarNumeroPregao(numeroPregao);

        const urlBuscaPNCP = `https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?unidadeOrgaoCodigoUnidade=${uasg}&codigoModalidade=5&dataPublicacaoPncpInicial=${ano}-01-01&dataPublicacaoPncpFinal=${ano}-12-31&tamanhoPagina=500`;

        const respostaBusca = await pncpFetch(urlBuscaPNCP, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        }, `Buscar Pregão ${numeroLimpo}/${ano}`);

        if (!respostaBusca.ok) {
            return `❌ Erro ao consultar a base principal do Governo (PNCP). Código: ${respostaBusca.status}`;
        }

        const dadosBusca = await respostaBusca.json();
        const contratacoes = dadosBusca.resultado || [];
        const pregaoEncontrado = contratacoes.find(p => String(p.numeroCompra) === numeroLimpo);

        if (!pregaoEncontrado) {
            return `⚠️ *Aviso da Hera:* O pregão *${numeroLimpo}/${ano}* não foi encontrado na base de dados.`;
        }

        const idCompra = pregaoEncontrado.idCompra;

        if (!idCompra) {
            return `❌ A contratação do pregão *${numeroLimpo}/${ano}* foi encontrada, mas o PNCP não retornou o identificador da compra.`;
        }

        const objetoPregao = String(pregaoEncontrado.objetoCompra || pregaoEncontrado.objeto || '');
        const matchSEI = objetoPregao.match(/25410\.\d{6}\/\d{4}-\d{2}/);
        const processoSEI = matchSEI ? matchSEI[0] : 'Não identificado';

        let todosItensBrutos = [];

        try {
            // ATUALIZADO: Enviando o ano para o log do terminal
            todosItensBrutos = await buscarTodosItensDaCompra(idCompra, ano);
        } catch (erroItens) {
            const situacao = pregaoEncontrado.situacaoCompraNomePncp || 'N/A';

            return (
                `⚠️ *Pregão localizado, mas a API de itens do PNCP está instável no momento.*\n\n` +
                `*Pregão Nº:* ${numeroLimpo}/${ano}\n` +
                `*Processo SEI:* ${processoSEI}\n` +
                `*Situação Geral:* ${situacao}\n` +
                `*ID da Compra:* ${idCompra}\n\n` +
                `A consulta dos itens retornou erro temporário (${erroItens.message}). ` +
                `Tente novamente em alguns instantes.`
            );
        }

        if (!todosItensBrutos.length) {
            return `⚠️ O Pregão *${numeroLimpo}/${ano}* foi encontrado, mas ainda não possui itens cadastrados na base aberta.`;
        }

        const itensOrdenados = [...todosItensBrutos].sort((a, b) => obterNumeroItem(a) - obterNumeroItem(b));
        const itensConsolidados = consolidarItens(itensOrdenados);

        let texto = `🏛️ *Consulta de Pregão (PNCP - Nova Lei)*\n`;
        texto += `*Pregão Nº:* ${numeroLimpo}/${ano}\n`;
        texto += `*Processo SEI:* ${processoSEI}\n`;
        texto += `*Situação Geral:* ${pregaoEncontrado.situacaoCompraNomePncp || 'N/A'}\n`;
        texto += `*ID da Compra:* ${idCompra}\n`;
        texto += `*Total de registros retornados pela API:* ${todosItensBrutos.length}\n`;
        texto += `*Total de itens consolidados:* ${itensConsolidados.length}\n\n`;

        itensConsolidados.forEach(item => {
            texto += `*Item:* ${item.numeroItem}\n`;
            texto += `*Descrição:* ${item.descricao}\n`;

            if (item.situacoes.length === 1) {
                texto += `*Situação:* ${item.situacoes[0]}\n`;
            } else {
                texto += `*Situações:* ${item.situacoes.join(' | ')}\n`;
            }

            if (item.fornecedor) {
                texto += `*Vencedor:* ${item.fornecedor}\n`;
            }

            texto += `*Valor:* ${formatarMoeda(item.valor)}\n`;
            texto += `--------------------\n`;
        });

        return texto.trim();
    } catch (erro) {
        console.error('Erro ao consultar a API PNCP:', erro);
        return '❌ Ocorreu um erro de conexão ao tentar buscar o pregão. Tente novamente mais tarde.';
    }
}

async function lerEditalPregao(numeroPregao) {
    try {
        const uasg = '250052';
        let numeroLimpo = '';
        let ano = '';

        if (numeroPregao.includes('/')) {
            const partes = numeroPregao.split('/');
            numeroLimpo = String(partes[0]).replace(/\D/g, '');
            ano = String(partes[1]).replace(/\D/g, '');
        } else {
            const apenasNumeros = String(numeroPregao).replace(/\D/g, '');
            if (apenasNumeros.length >= 5) {
                ano = apenasNumeros.slice(-4);
                numeroLimpo = apenasNumeros.slice(0, -4);
            } else {
                numeroLimpo = apenasNumeros;
                ano = new Date().getFullYear().toString();
            }
        }

        const urlBusca = `https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?unidadeOrgaoCodigoUnidade=${uasg}&codigoModalidade=5&dataPublicacaoPncpInicial=${ano}-01-01&dataPublicacaoPncpFinal=${ano}-12-31&tamanhoPagina=500`;

        const respostaBusca = await pncpFetch(urlBusca, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        }, `Buscar Contratações PNCP ${ano}`);

        if (!respostaBusca.ok) {
            return `❌ Erro ao consultar a base para localizar o edital. Código: ${respostaBusca.status}`;
        }

        const dadosBusca = await respostaBusca.json();
        const pregaoEncontrado = (dadosBusca.resultado || []).find(p => String(p.numeroCompra) === numeroLimpo);

        if (!pregaoEncontrado) {
            return `⚠️ O pregão *${numeroLimpo}/${ano}* não foi encontrado para baixar o Edital.`;
        }

        let cnpj = pregaoEncontrado.orgaoEntidadeCnpj || (pregaoEncontrado.orgaoEntidade && pregaoEncontrado.orgaoEntidade.cnpj);
        let sequencial = pregaoEncontrado.sequencialCompra;

        if (!cnpj || !sequencial) {
            const controle = pregaoEncontrado.numeroControlePNCP || pregaoEncontrado.numeroControlePncp;
            if (controle) {
                const match = controle.match(/^(\d{14})-1-(\d+)\/\d{4}$/);
                if (match) {
                    cnpj = match[1];
                    sequencial = match[2];
                }
            }
        }

        if (!cnpj || !sequencial) {
            return `❌ Erro: Não foi possível extrair o CNPJ e o Sequencial desta contratação para acessar os documentos.`;
        }

        cnpj = String(cnpj).replace(/\D/g, '');

        let urlDocs = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/documentos`;
        let respostaDocs = await pncpFetch(urlDocs, { method: 'GET', headers: { Accept: 'application/json' } }, `Documentos PNCP ${sequencial} (${ano})`);

        if (!respostaDocs.ok || respostaDocs.status === 404) {
            urlDocs = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`;
            respostaDocs = await pncpFetch(urlDocs, { method: 'GET', headers: { Accept: 'application/json' } }, `Arquivos PNCP ${sequencial} (${ano})`);
        }

        if (!respostaDocs.ok) {
            return `⚠️ A Hera encontrou a contratação, mas a API de Documentos do PNCP bloqueou a leitura (Status ${respostaDocs.status}).`;
        }

        const dadosDocs = await respostaDocs.json();

        let listaDocumentos = [];
        if (Array.isArray(dadosDocs)) listaDocumentos = dadosDocs;
        else if (dadosDocs.data && Array.isArray(dadosDocs.data)) listaDocumentos = dadosDocs.data;
        else if (dadosDocs.resultado && Array.isArray(dadosDocs.resultado)) listaDocumentos = dadosDocs.resultado;

        if (listaDocumentos.length === 0) {
            return `⚠️ O PNCP não retornou nenhum documento anexo para este pregão.`;
        }

        let arquivoEdital = listaDocumentos.find(arq => {
            const textoObj = JSON.stringify(arq).toLowerCase();
            return (textoObj.includes('edital') || textoObj.includes('termo de refer') || textoObj.includes('termo_de_referencia')) && textoObj.includes('.pdf');
        });

        if (!arquivoEdital) {
            arquivoEdital = listaDocumentos.find(arq => JSON.stringify(arq).toLowerCase().includes('.pdf'));
        }

        if (!arquivoEdital) {
            const docsAchados = listaDocumentos.map(d => d.tituloDocumento || d.nomeArquivo || d.titulo || 'Doc Sem Nome').slice(0, 5).join(', ');
            return `⚠️ O documento do Edital deste pregão não foi encontrado. Anexos disponíveis no sistema: [${docsAchados}]`;
        }

        const linkDownload = arquivoEdital.linkArquivo || arquivoEdital.url || arquivoEdital.linkDownload || arquivoEdital.urlAcesso;

        if (!linkDownload) {
            return `❌ Encontrei o arquivo, mas a API do PNCP não liberou a URL de download para a Hera.`;
        }

        const respostaPdf = await pncpFetch(linkDownload, { method: 'GET' }, `Download PDF Edital (${ano})`);
        if (!respostaPdf.ok) return `❌ Erro ao tentar fazer o download do PDF do Edital no portal do Governo.`;

        const bufferPdf = await respostaPdf.arrayBuffer();

        const dadosExtraidos = await pdfParse(Buffer.from(bufferPdf));
        const textoCompleto = dadosExtraidos.text;

        const regexTabela = /Rela[cç][aã]o de produtos pr[eé]-qualificados|Relat[oó]rio de Marcas Pr[eé]-Qualificadas/i;
        const indexInicio = textoCompleto.search(regexTabela);

        if (indexInicio === -1) {
            return `📄 O Edital foi lido com sucesso pela Hera via PNCP, mas a seção "Relação de produtos pré-qualificados" não está no documento.`;
        }

        const textoTabela = textoCompleto.substring(indexInicio);
        const linhas = textoTabela.split('\n');

        let extracao = `📄 *Leitura Oficial do Edital PNCP: PE ${numeroLimpo}/${ano}*\n_Tabela de Marcas Pré-Qualificadas extraída!_\n\n`;
        let encontrouItens = false;

        linhas.forEach(linha => {
            const match = linha.match(/(?:^|\s)(\d{1,3})\s+(?:-\s+)?(\d{4,7})(?:\s|$)/);
            if (match) {
                extracao += `*Seq ${match[1]}* - Código: ${match[2]}\n`;
                encontrouItens = true;
            }
        });

        if (!encontrouItens) {
            extracao += `⚠️ Encontrei a página correta no PDF do PNCP, mas a formatação especial impediu a extração exata dos códigos e sequências.`;
        }

        return extracao;
    } catch (erro) {
        console.error('Erro ao ler o Edital via PNCP:', erro);
        return '❌ Ocorreu um erro interno na Hera ao tentar processar as APIs do PNCP.';
    }
}

function formatarData(valor) {
    if (!valor) return 'N/A';

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
        return String(valor);
    }

    return data.toLocaleDateString('pt-BR');
}

function normalizarNumeroContratoExato(valor) {
    return String(valor || '')
        .trim()
        .replace(/[\/\-\s]/g, '')
        .toUpperCase();
}

function numeroContratoExatoEhValido(numero = '') {
    if (/^\d{9}$/.test(numero)) return true;
    if (/^[A-Z0-9]{12}$/.test(numero)) return true;
    return false;
}

function parseFiltrosContrato(termoBusca) {
    const original = String(termoBusca || '').trim();
    let restante = ` ${original} `;

    const filtros = {
        original,
        numeroContrato: '',
        uasg: '',
        orgao: '',
        fornecedor: '',
        textoLivre: ''
    };

    const regexNumeroContrato = /\b(?:contrato\s+)?([0-9]{4}[A-Z]{1,5}[0-9]{3,}|[0-9A-Z./-]{3,}\/[0-9]{4}|[0-9A-Z./-]{6,})\b/i;
    const regexUasg = /\b(?:uasg|unidade gestora|ug)\s+(\d{5,6})\b/i;
    const regexOrgao = /\b[oó]rg[aã]o\s+(.+?)(?=(?:\bfornecedor\b|\buasg\b|\bunidade gestora\b|\bug\b|$))/i;
    const regexFornecedor = /\bfornecedor\s+(.+?)(?=(?:\buasg\b|\bunidade gestora\b|\bug\b|\b[oó]rg[aã]o\b|$))/i;

    const matchUasg = restante.match(regexUasg);
    if (matchUasg) {
        filtros.uasg = String(matchUasg[1] || '').trim();
        restante = restante.replace(matchUasg[0], ' ');
    }

    const matchFornecedor = restante.match(regexFornecedor);
    if (matchFornecedor) {
        filtros.fornecedor = String(matchFornecedor[1] || '').trim();
        restante = restante.replace(matchFornecedor[0], ' ');
    }

    const matchOrgao = restante.match(regexOrgao);
    if (matchOrgao) {
        filtros.orgao = String(matchOrgao[1] || '').trim();
        restante = restante.replace(matchOrgao[0], ' ');
    }

    const matchNumeroContrato = restante.match(regexNumeroContrato);
    if (matchNumeroContrato) {
        filtros.numeroContrato = String(matchNumeroContrato[1] || '').trim();
        restante = restante.replace(matchNumeroContrato[0], ' ');
    }

    filtros.textoLivre = String(restante || '').replace(/\s+/g, ' ').trim();

    return filtros;
}

function extrairPayloadContrato(dados) {
    if (!dados) return null;
    if (Array.isArray(dados)) return dados[0] || null;
    if (dados.data && typeof dados.data === 'object') return extrairPayloadContrato(dados.data);
    if (dados.resultado && typeof dados.resultado === 'object') return extrairPayloadContrato(dados.resultado);
    if (dados.contrato && typeof dados.contrato === 'object') return extrairPayloadContrato(dados.contrato);
    return dados;
}

function formatarContratoExatoApi(dados, numeroConsultado, uasgFixa) {
    const payload = extrairPayloadContrato(dados) || {};

    const contratante = payload?.contratante || {};
    const orgaoOrigem = contratante?.orgao_origem || {};
    const orgaoAtual = contratante?.orgao || {};
    const unidadeOrigem =
        orgaoOrigem?.unidade_gestora_origem ||
        orgaoAtual?.unidade_gestora ||
        {};

    const fornecedor = payload?.fornecedor || {};
    const links = payload?.links || {};

    const numero = payload?.numero || numeroConsultado;
    const id = payload?.id || '-';
    const receitaDespesa = payload?.receita_despesa || '-';
    const tipo = payload?.tipo || '-';
    const subtipo = payload?.subtipo || '-';
    const situacao = payload?.situacao || payload?.status || '-';
    const categoria = payload?.categoria || '-';
    const modalidade = payload?.modalidade || '-';
    const processo = payload?.processo || '-';
    const licitacaoNumero = payload?.licitacao_numero || '-';
    const objeto = payload?.objeto || '-';
    const amparoLegal = payload?.amparo_legal || '-';

    const dataAssinatura = formatarData(payload?.data_assinatura);
    const vigenciaInicio = formatarData(payload?.vigencia_inicio);
    const vigenciaFim = formatarData(payload?.vigencia_fim);

    const valorInicial = formatarMoeda(payload?.valor_inicial);
    const valorGlobal = formatarMoeda(payload?.valor_global);
    const valorParcela = formatarMoeda(payload?.valor_parcela);

    const fornecedorNome = fornecedor?.nome || '-';
    const fornecedorDocumento = fornecedor?.cnpj_cpf_idgener || '-';
    const fornecedorTipo = fornecedor?.tipo || '-';

    const orgaoCodigo = orgaoOrigem?.codigo || orgaoAtual?.codigo || '-';
    const orgaoNome = orgaoOrigem?.nome || orgaoAtual?.nome || '-';

    const ugCodigo = unidadeOrigem?.codigo || payload?.unidade_compra || uasgFixa;
    const ugNomeResumido = unidadeOrigem?.nome_resumido || '-';
    const ugNome = unidadeOrigem?.nome || '-';
    const ugSisg = unidadeOrigem?.sisg || '-';

    let resposta = `📑 *Contrato localizado*\n\n`;
    resposta += `*Número:* ${numero}\n`;
    resposta += `*ID:* ${id}\n`;
    resposta += `*Receita/Despesa:* ${receitaDespesa}\n`;
    resposta += `*Tipo:* ${tipo}\n`;

    if (subtipo !== '-') {
        resposta += `*Subtipo:* ${subtipo}\n`;
    }

    resposta += `*Situação:* ${situacao}\n`;
    resposta += `*Categoria:* ${categoria}\n`;
    resposta += `*Modalidade:* ${modalidade}\n`;
    resposta += `*Licitação:* ${licitacaoNumero}\n`;
    resposta += `*Processo:* ${processo}\n`;
    resposta += `*Amparo legal:* ${amparoLegal}\n`;
    resposta += `*Data da assinatura:* ${dataAssinatura}\n`;
    resposta += `*Vigência:* ${vigenciaInicio} até ${vigenciaFim}\n`;
    resposta += `*Valor inicial:* ${valorInicial}\n`;
    resposta += `*Valor global:* ${valorGlobal}\n`;

    if (valorParcela !== 'N/A') {
        resposta += `*Valor da parcela:* ${valorParcela}\n`;
    }

    resposta += `\n🏢 *Contratante*\n`;
    resposta += `*Órgão:* ${orgaoNome}\n`;
    resposta += `*Código do órgão:* ${orgaoCodigo}\n`;
    resposta += `*UG origem:* ${ugCodigo}\n`;
    resposta += `*UG resumida:* ${ugNomeResumido}\n`;
    resposta += `*UG nome:* ${ugNome}\n`;
    resposta += `*SISG:* ${ugSisg}\n`;

    resposta += `\n🏭 *Fornecedor*\n`;
    resposta += `*Nome:* ${fornecedorNome}\n`;
    resposta += `*Documento:* ${fornecedorDocumento}\n`;
    resposta += `*Tipo:* ${fornecedorTipo}\n`;

    resposta += `\n📝 *Objeto*\n${objeto}\n`;

    if (links?.historico || links?.empenhos || links?.itens || links?.arquivos) {
        resposta += `\n🔗 *Links disponíveis*\n`;
        if (links.historico) resposta += `- Histórico disponível\n`;
        if (links.empenhos) resposta += `- Empenhos disponíveis\n`;
        if (links.itens) resposta += `- Itens disponíveis\n`;
        if (links.arquivos) resposta += `- Arquivos disponíveis\n`;
    }

    return resposta.trim();
}

async function fetchJsonComTimeout(url, {
    accept = 'application/json',
    timeoutMs = 15000,
    headers = {}
} = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const resposta = await pncpFetch(url, {
            method: 'GET',
            headers: {
                Accept: accept,
                ...headers
            },
            signal: controller.signal
        }, 'Contratos / Timeout');

        const contentType = resposta.headers.get('content-type') || '';
        let dados = null;

        if (contentType.includes('application/json')) {
            dados = await resposta.json().catch(() => null);
        } else {
            const texto = await resposta.text().catch(() => '');
            dados = texto;
        }

        return {
            ok: resposta.ok,
            status: resposta.status,
            data: dados
        };
    } catch (erro) {
        return {
            ok: false,
            status: 0,
            error: erro
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function consultarContratoExatoComprasnet(numeroContratoOriginal) {
    const uasgFixa = '250052';
    const numeroContrato = normalizarNumeroContratoExato(numeroContratoOriginal);

    if (!numeroContratoExatoEhValido(numeroContrato)) {
        return {
            ok: false,
            mensagem:
                '❌ Número de contrato inválido.\n\n' +
                'Envie 9 dígitos sem barra (ex.: 000452023) ' +
                'ou 12 caracteres para empenho com força de contrato (ex.: 2023NE000123).'
        };
    }

    const url = `https://contratos.comprasnet.gov.br/api/contrato/ugorigem/${uasgFixa}/numeroano/${numeroContrato}`;

    const headers = {};
    if (process.env.CONTRATOS_TOKEN) {
        headers.Authorization = `Bearer ${process.env.CONTRATOS_TOKEN}`;
    }

    const resposta = await fetchJsonComTimeout(url, {
        accept: 'application/json',
        timeoutMs: 20000,
        headers
    });

    if (!resposta.ok) {
        if (resposta.status === 401) {
            return {
                ok: false,
                mensagem:
                    '❌ A consulta de contratos retornou erro 401 (autenticação necessária).\n' +
                    'Se o ambiente atual exigir token, configure CONTRATOS_TOKEN.'
            };
        }

        if (resposta.status === 404) {
            return {
                ok: false,
                mensagem: `📭 Não encontrei contrato para o número ${numeroContrato} na UASG ${uasgFixa}.`
            };
        }

        if (resposta.status === 422) {
            const detalhe = resposta?.data?.errors
                ? `\nDetalhe da API: ${JSON.stringify(resposta.data.errors)}`
                : '';

            return {
                ok: false,
                mensagem:
                    '❌ O número informado foi rejeitado pela API de contratos (erro 422).\n' +
                    'Confira se ele foi enviado com 9 dígitos sem barra, ou 12 caracteres no caso de empenho.' +
                    detalhe
            };
        }

        if (resposta.status === 0) {
            return {
                ok: false,
                mensagem: '❌ Não foi possível conectar à API do Comprasnet Contratos no momento.'
            };
        }

        return {
            ok: false,
            mensagem: `❌ Falha ao consultar a API de contratos. Status HTTP: ${resposta.status}.`
        };
    }

    if (!resposta.data || typeof resposta.data !== 'object') {
        return {
            ok: false,
            mensagem: '⚠️ A API respondeu, mas não retornou um JSON de contrato válido.'
        };
    }

    return {
        ok: true,
        mensagem: formatarContratoExatoApi(resposta.data, numeroContrato, uasgFixa)
    };
}

async function consultarContratos(termoBusca) {
    try {
        const filtros = parseFiltrosContrato(termoBusca);

        if (!filtros.original || !filtros.numeroContrato) {
            return (
                '⚠️ Informe o número do contrato.\n\n' +
                'Exemplos:\n' +
                '- *Contrato 000452023*\n' +
                '- *Contrato 2023NE000123*'
            );
        }

        const resultadoExato = await consultarContratoExatoComprasnet(filtros.numeroContrato);
        return resultadoExato.mensagem;
    } catch (erro) {
        console.error('Erro ao consultar contratos:', erro);
        return '❌ Ocorreu um erro ao consultar contratos no Compras.gov.br. Tente novamente mais tarde.';
    }
}

async function gerarRelatorioPregoesAno(ano) {
    const ExcelJS = require('exceljs');
    const os = require('os');
    const path = require('path');
    const uasg = '250052';
    const anoBuscado = parseInt(ano, 10);

    const urlAnoAtual = `https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?unidadeOrgaoCodigoUnidade=${uasg}&codigoModalidade=5&dataPublicacaoPncpInicial=${anoBuscado}-01-01&dataPublicacaoPncpFinal=${anoBuscado}-12-31&tamanhoPagina=500`;
    const urlAnoAnterior = `https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?unidadeOrgaoCodigoUnidade=${uasg}&codigoModalidade=5&dataPublicacaoPncpInicial=${anoBuscado-1}-01-01&dataPublicacaoPncpFinal=${anoBuscado-1}-12-31&tamanhoPagina=500`;

    try {
        const [respostaAtual, respostaAnterior] = await Promise.all([
            pncpFetch(urlAnoAtual, { method: 'GET', headers: { Accept: 'application/json' } }, `Relatório Ano Atual (${anoBuscado})`),
            pncpFetch(urlAnoAnterior, { method: 'GET', headers: { Accept: 'application/json' } }, `Relatório Ano Anterior (${anoBuscado-1})`)
        ]);

        if (!respostaAtual.ok && !respostaAnterior.ok) {
            return { erro: `❌ Erro ao consultar o PNCP. Códigos: ${respostaAtual.status}` };
        }

        const dadosAtual = await respostaAtual.json().catch(() => ({ resultado: [] }));
        const dadosAnterior = await respostaAnterior.json().catch(() => ({ resultado: [] }));
        const contratacoes = [...(dadosAnterior.resultado || []), ...(dadosAtual.resultado || [])];

        if (contratacoes.length === 0) {
            return { erro: `⚠️ Nenhum pregão encontrado para o ano de ${ano}.` };
        }

        let estatisticasGerais = {};
        let estatisticasMensais = {};
        let pregoesDetalhes = [];
        let totalItensGeral = 0;
        
        let linhaDoTempo = {
            abertos: Array(12).fill(0),
            homologados: Array(12).fill(0),
            emAndamento: Array(12).fill(0),
            fracassados: Array(12).fill(0),
            desertos: Array(12).fill(0),
            anulados: Array(12).fill(0)
        };
        
        const nomeMeses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
        nomeMeses.forEach(mes => {
            if (!estatisticasMensais[mes]) estatisticasMensais[mes] = {};
        });

        for (const pregao of contratacoes) {
            const numeroLimpo = String(pregao.numeroCompra);
            const idCompra = pregao.idCompra;
            const situacaoGeral = pregao.situacaoCompraNomePncp || 'N/A';
            const objetoPregao = String(pregao.objetoCompra || pregao.objeto || '');
            const matchSEI = objetoPregao.match(/25410\.\d{6}\/\d{4}-\d{2}/);
            const processoSEI = matchSEI ? matchSEI[0] : 'Não identificado';
            
            let mesPublicacao = 0;
            let anoPublicacao = anoBuscado;

            if (pregao.dataPublicacaoPncp) {
                const dataObj = new Date(pregao.dataPublicacaoPncp);
                if (!isNaN(dataObj.getTime())) {
                    mesPublicacao = dataObj.getMonth();
                    anoPublicacao = dataObj.getFullYear();
                }
            }

            let itensBrutos = [];
            try {
                // ATUALIZADO: Enviando o anoPublicacao ao PNCP Limiter
                itensBrutos = await buscarTodosItensDaCompra(idCompra, anoPublicacao);
            } catch (e) {
                console.log(`Erro ao buscar itens do pregão ${numeroLimpo}:`, e.message);
            }

            if (anoPublicacao === anoBuscado) {
                linhaDoTempo.abertos[mesPublicacao] += itensBrutos.length;
            }

            let statusPregao = {};
            let relatarPregaoNesteAno = (anoPublicacao === anoBuscado);

            itensBrutos.forEach(item => {
                let sit = String(item.situacaoCompraItemNome || item.situacaoItem || 'Em Andamento / Não Informado').trim();
                let sLow = sit.toLowerCase();
                
                let ehHomologado = sLow.includes('homologado') || sLow.includes('adjudicado');
                let ehFracassado = sLow.includes('fracassado');
                let ehDeserto = sLow.includes('deserto');
                let ehAnulado = sLow.includes('anulado') || sLow.includes('revogado') || sLow.includes('cancelado');
                let ehEmAndamento = sLow.includes('andamento') || sLow.includes('informado');
                
                let dataAcao = item.dataAtualizacao || pregao.dataAtualizacao || pregao.dataPublicacaoPncp;
                let anoAcao = anoPublicacao;
                let mesAcao = mesPublicacao;

                if (dataAcao) {
                    const d = new Date(dataAcao);
                    if (!isNaN(d.getTime())) {
                        anoAcao = d.getFullYear();
                        mesAcao = d.getMonth();
                    }
                }

                const acaoNesteAno = (anoAcao === anoBuscado);

                if (acaoNesteAno) {
                    if (ehHomologado) linhaDoTempo.homologados[mesAcao] += 1;
                    else if (ehFracassado) linhaDoTempo.fracassados[mesAcao] += 1;
                    else if (ehDeserto) linhaDoTempo.desertos[mesAcao] += 1;
                    else if (ehAnulado) linhaDoTempo.anulados[mesAcao] += 1;
                    else if (ehEmAndamento) linhaDoTempo.emAndamento[mesAcao] += 1;
                    
                    relatarPregaoNesteAno = true;
                }

                if (anoPublicacao === anoBuscado || acaoNesteAno) {
                    statusPregao[sit] = (statusPregao[sit] || 0) + 1;
                    estatisticasGerais[sit] = (estatisticasGerais[sit] || 0) + 1;
                    
                    let rotuloMes = acaoNesteAno ? nomeMeses[mesAcao] : nomeMeses[mesPublicacao];
                    
                    if (!estatisticasMensais[rotuloMes]) estatisticasMensais[rotuloMes] = {};
                    estatisticasMensais[rotuloMes][sit] = (estatisticasMensais[rotuloMes][sit] || 0) + 1;
                    
                    totalItensGeral++;
                }
            });

            if (relatarPregaoNesteAno && Object.keys(statusPregao).length > 0) {
                pregoesDetalhes.push({
                    pregao: `PE ${numeroLimpo}/${anoPublicacao}`,
                    sei: processoSEI,
                    situacao: situacaoGeral,
                    totalItens: itensBrutos.length,
                    status: statusPregao,
                    mes: nomeMeses[mesPublicacao],
                    mesIndex: mesPublicacao
                });
            }
        }

        const todasSituacoesUnicas = Object.keys(estatisticasGerais);

        const workbook = new ExcelJS.Workbook();
        
        const wsResumo = workbook.addWorksheet('Resumo Anual');
        wsResumo.columns = [
            { header: 'Situação do Item', key: 'sit', width: 40 },
            { header: 'Quantidade', key: 'qtd', width: 15 },
            { header: 'Percentual (%)', key: 'perc', width: 15 }
        ];
        wsResumo.getRow(1).font = { bold: true };
        wsResumo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };

        let resumoTexto = `📊 *Relatório Anual de Pregões (${ano})*\n\n`;
        resumoTexto += `*Total de Pregões Processados no Retrato:* ${pregoesDetalhes.length}\n`;
        resumoTexto += `*Total de Ações/Itens:* ${totalItensGeral}\n\n`;
        resumoTexto += `📈 *Aproveitamento Exato:*\n`;

        const situacoesOrdenadas = Object.entries(estatisticasGerais).sort((a, b) => b[1] - a[1]);

        for (const [sit, qtd] of situacoesOrdenadas) {
            const perc = totalItensGeral > 0 ? ((qtd / totalItensGeral) * 100).toFixed(1) : 0;
            wsResumo.addRow({ sit, qtd, perc: Number(perc) });
            
            let icon = '▪️';
            const sLow = sit.toLowerCase();
            if (sLow.includes('homologado') || sLow.includes('adjudicado')) icon = '✅';
            else if (sLow.includes('deserto')) icon = '⚠️';
            else if (sLow.includes('fracassado') || sLow.includes('cancelado') || sLow.includes('anulado')) icon = '❌';
            else if (sLow.includes('andamento') || sLow.includes('informado')) icon = '⏳';
            
            resumoTexto += `${icon} *${sit}:* ${perc}% (${qtd} itens)\n`;
        }

        const wsMensal = workbook.addWorksheet('Desempenho Mensal');
        
        const colunasMensal = [{ header: '- Mês', key: 'mes', width: 15 }];
        todasSituacoesUnicas.forEach(sit => {
            colunasMensal.push({ header: sit, key: sit, width: 20 });
        });
        colunasMensal.push({ header: 'Total Mensal', key: 'total', width: 15 });
        
        wsMensal.columns = colunasMensal;
        wsMensal.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
        wsMensal.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

        const totaisColunas = {};
        todasSituacoesUnicas.forEach(sit => totaisColunas[sit] = 0);
        let grandeTotal = 0;

        nomeMeses.forEach(mes => {
            if (estatisticasMensais[mes]) {
                let rowData = { mes: mes };
                let totalDoMes = 0;
                
                todasSituacoesUnicas.forEach(sit => {
                    const qtd = estatisticasMensais[mes][sit] || 0;
                    rowData[sit] = qtd;
                    totaisColunas[sit] += qtd;
                    totalDoMes += qtd;
                });
                
                rowData.total = totalDoMes;
                grandeTotal += totalDoMes;
                wsMensal.addRow(rowData);
            }
        });

        let rowTotalizadores = { mes: 'Total geral', total: grandeTotal };
        todasSituacoesUnicas.forEach(sit => {
            rowTotalizadores[sit] = totaisColunas[sit];
        });
        
        const rowFinalObj = wsMensal.addRow(rowTotalizadores);
        rowFinalObj.font = { bold: true };
        rowFinalObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5DBDB' } };

        const wsDetalhes = workbook.addWorksheet('Detalhes por Pregão');
        const colunasDetalhes = [
            { header: 'Pregão', key: 'pregao', width: 15 },
            { header: 'Mês Origem', key: 'mes', width: 10 },
            { header: 'Processo SEI', key: 'sei', width: 25 },
            { header: 'Situação do Pregão', key: 'situacao', width: 30 },
            { header: 'Total de Itens', key: 'total', width: 15 }
        ];
        
        todasSituacoesUnicas.forEach(sit => {
            colunasDetalhes.push({ header: sit, key: sit, width: 20 });
        });
        
        wsDetalhes.columns = colunasDetalhes;
        wsDetalhes.getRow(1).font = { bold: true };
        wsDetalhes.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEDED' } };

        pregoesDetalhes.sort((a, b) => a.mesIndex - b.mesIndex);

        pregoesDetalhes.forEach(p => {
            let rowData = {
                pregao: p.pregao,
                mes: p.mes,
                sei: p.sei,
                situacao: p.situacao,
                total: p.totalItens
            };
            todasSituacoesUnicas.forEach(sit => {
                rowData[sit] = p.status[sit] || 0; 
            });
            wsDetalhes.addRow(rowData);
        });

        const fileName = `Relatorio_Pregoes_${ano}_${Date.now()}.xlsx`;
        const filePath = path.join(os.tmpdir(), fileName);
        await workbook.xlsx.writeFile(filePath);

        resumoTexto += `\n_Estou enviando a planilha detalhada (incluindo visão mensal) em anexo._`;

        return {
            sucesso: true,
            mensagemResumo: resumoTexto,
            arquivo: filePath,
            pregoes: pregoesDetalhes,
            linhaDoTempo: linhaDoTempo
        };

    } catch (erro) {
        console.error('Erro na varredura anual:', erro);
        return { erro: '❌ Ocorreu um erro ao processar o relatório anual de pregões. Tente novamente mais tarde.' };
    }
}

async function resumoAtasPorAno(ano) {
    let atasNoBanco = await buscarAtasPorAnoCache(ano);

    if (!atasNoBanco || atasNoBanco.length === 0) {
        console.log(`[CACHE MISS] Atas de ${ano} não estão no banco. Buscando na API...`);

        try {
            const atasBaixadas = await sincronizarAtasAno(ano);
            if (atasBaixadas > 0) {
                atasNoBanco = await buscarAtasPorAnoCache(ano);
            }
        } catch (erro) {
            console.error(`[ATAS ${ano}] Falha ao sincronizar:`, erro.message || erro);
            return {
                quantidade: 0,
                mensagem1: `⚠️ Não consegui consultar as Atas de Registro de Preços de ${ano} porque a API do Compras.gov.br está instável ou o endpoint de atas não respondeu corretamente no momento. Tente novamente mais tarde.`,
                mensagem2: null
            };
        }
    }

    if (!atasNoBanco || atasNoBanco.length === 0) {
        return {
            quantidade: 0,
            mensagem1: `Desculpe, não encontrei nenhuma Ata de Registro de Preços cadastrada para o ano de ${ano}.`,
            mensagem2: null
        };
    }

    const quantidadeAtas = atasNoBanco.length;
    const mensagem1 = `Encontrei *${quantidadeAtas}* Ata(s) de Registro de Preços salvas no ano de ${ano}.`;

    let mensagem2 = `*Lista de Atas - ${ano}:*\n\n`;
    atasNoBanco.forEach(ataDb => {
        mensagem2 += `📄 *Ata:* ${ataDb.numero_ata}\n`;
        mensagem2 += `🛒 *Compra Associada:* ${ataDb.numero_compra || 'N/A'}\n`;
        mensagem2 += `🏢 *Fornecedor(es):* ${ataDb.fornecedores}\n`;
        mensagem2 += `-----------------------------------\n`;
    });

    mensagem2 += `\n💡 Para ver o conteúdo completo de uma ata, digite:\n*Mostrar Ata [número da ata]*\nExemplo: *Mostrar Ata 0001/2024*`;

    return { quantidade: quantidadeAtas, mensagem1, mensagem2 };
}

async function formatarDetalhesAta(numeroAta) {
    const ataDb = await buscarAtaPorNumeroCache(numeroAta);

    if (!ataDb) {
        return `⚠️ A Ata *${numeroAta}* não está no nosso banco de dados rápido.\nDigite *Atas AAAA* (ex: Atas 2024) para eu baixar todas as atas desse ano e tentar novamente!`;
    }

    const ata = JSON.parse(ataDb.dados_gerais);
    const itens = JSON.parse(ataDb.itens);

    const formataData = (isoDate) => isoDate ? new Date(isoDate).toLocaleDateString('pt-BR') : 'Não informada';
    const formataMoedaItem = (valor) =>
        typeof valor === 'number'
            ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : 'R$ 0,00';

    let resposta = `*📚 DETALHES COMPLETOS DA ATA: ${ata.numeroAtaRegistroPreco || ata.numeroAta || ataDb.numero_ata}*\n\n`;
    resposta += `*Órgão Gerenciador:* ${ata.nomeUnidadeGerenciadora || ata.unidadeGerenciadora || 'N/A'}\n`;
    resposta += `*Modalidade:* ${ata.nomeModalidadeCompra || ata.modalidade || 'N/A'} (Compra Nº: ${ata.numeroCompra || ataDb.numero_compra || 'N/A'})\n`;
    resposta += `*Objeto:* ${ata.objeto || ata.objetoCompra || 'N/A'}\n\n`;

    resposta += `*Situação:* ${ata.statusAta || ata.situacao || 'N/A'}\n`;
    resposta += `*Data da Assinatura:* ${formataData(ata.dataAssinatura)}\n`;
    resposta += `*Início da Vigência:* ${formataData(ata.dataVigenciaInicial)}\n`;
    resposta += `*Fim da Vigência:* ${formataData(ata.dataVigenciaFinal || ata.fimVigencia || ata.dataFimVigencia)}\n`;
    resposta += `*Qtd Total de Itens:* ${ata.quantidadeItens || itens.length}\n`;
    resposta += `*Valor Global da Ata:* ${formataMoedaItem(ata.valorTotal)}\n\n`;

    if (itens.length > 0) {
        resposta += `*📦 ITENS DESTA ATA (${itens.length}):*\n`;
        itens.forEach((item) => {
            resposta += `\n🔸 *Item ${item.numeroItem || 'N/A'}:* ${item.descricaoItem || item.descricao || 'N/A'}\n`;
            resposta += `- *Código:* ${item.codigoItem || 'N/A'} (${item.tipoItem || 'N/A'})\n`;
            if (item.nomePdm) resposta += `- *PDM:* ${item.codigoPdm} - ${item.nomePdm}\n`;

            resposta += `- *Fornecedor:* ${item.nomeRazaoSocialFornecedor || item.nomeFornecedor || 'N/A'}\n`;
            resposta += `- *CNPJ/ID:* ${item.niFornecedor || 'N/A'} (${item.classificacaoFornecedor || 'Porte não informado'})\n`;

            resposta += `- *Qtd. Homologada:* ${item.quantidadeHomologadaVencedor || item.quantidadeRegistrada || 0}\n`;
            if (item.quantidadeEmpenhada) resposta += `- *Qtd. Empenhada:* ${item.quantidadeEmpenhada}\n`;

            resposta += `- *Valor Unitário:* ${formataMoedaItem(item.valorUnitario)}\n`;
            resposta += `- *Valor Total do Item:* ${formataMoedaItem(item.valorTotal)}\n`;
            if (item.percentualMaiorDesconto > 0) resposta += `- *Maior Desconto:* ${item.percentualMaiorDesconto}%\n`;
        });
    } else {
        resposta += `*Itens:* Nenhum item detalhado encontrado na base para esta ata.\n`;
    }

    if (ata.linkAtaPNCP || ata.linkCompraPNCP) {
        resposta += `\n🔗 *Links Oficiais PNCP:*\n`;
        if (ata.linkAtaPNCP) resposta += `Visualizar Ata: ${ata.linkAtaPNCP}\n`;
        if (ata.linkCompraPNCP) resposta += `Visualizar Compra: ${ata.linkCompraPNCP}\n`;
    }

    return resposta;
}

async function consultarAdesoesAta(termoBusca) {
    try {
        const termo = String(termoBusca || '').trim();
        const ehCatmat = /^\d+$/.test(termo);

        let url = `https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem?tamanhoPagina=100`;
        if (ehCatmat) {
            url += `&codigoItem=${termo}`;
        } else {
            url += `&descricaoItem=${encodeURIComponent(termo)}`;
        }

        const resposta = await pncpFetch(url, { method: 'GET', headers: { Accept: '*/*' } }, 'Consultar Adesões Ata');

        if (!resposta.ok) {
            return '⚠️ Não consegui acessar a base de atas do Governo no momento. Tente novamente mais tarde.';
        }

        const dados = await resposta.json();
        const itens = dados.resultado || [];

        if (itens.length === 0) {
            return `Nenhuma ata encontrada com o termo: *${termo}*`;
        }

        const hoje = new Date();
        const resultadosValidos = [];

        for (const item of itens) {
            const fimVigencia = item.dataFimVigencia || item.dataVigenciaFinal;
            if (fimVigencia) {
                const dataFim = new Date(fimVigencia);
                if (dataFim < hoje) continue;
            } else {
                continue;
            }

            const orgao = String(item.nomeUnidadeGerenciadora || '').toUpperCase();
            if (
                orgao.includes('PREFEITURA') ||
                orgao.includes('MUNICIPAL') ||
                orgao.includes('MUNICÍPIO') ||
                orgao.includes('GOVERNO DO ESTADO') ||
                orgao.includes('SECRETARIA DE ESTADO') ||
                orgao.includes('FUNDO MUNICIPAL') ||
                orgao.includes('FUNDO ESTADUAL') ||
                orgao.includes('CÂMARA MUNICIPAL')
            ) {
                continue;
            }

            const situacao = String(item.situacaoItem || '').toUpperCase();
            if (situacao.includes('CANCELADO') || situacao.includes('SUSPENSO')) {
                continue;
            }

            resultadosValidos.push(item);
            if (resultadosValidos.length >= 5) break; 
        }

        if (resultadosValidos.length === 0) {
            return `Não encontrei nenhuma ata federal *vigente* para o termo: *${termo}* (as atas retornadas eram municipais/estaduais ou já estavam vencidas).`;
        }

        let texto = `📊 *Possíveis Atas para Adesão Encontradas*\n\n`;
        resultadosValidos.forEach((item, index) => {
            texto += `*Catmat:* ${item.codigoItem || 'N/A'}\n`;
            texto += `*Descrição:* ${item.descricaoItem || 'N/A'}\n`;
            texto += `*Quantidade:* ${item.quantidadeHomologadaVencedor || item.quantidadeRegistrada || 'N/A'}\n`;
            texto += `*Órgão:* ${item.nomeUnidadeGerenciadora || 'N/A'}\n`;
            texto += `*Uasg:* ${item.unidadeGerenciadora || 'N/A'}\n`;
            texto += `*Fornecedor:* ${item.nomeRazaoSocialFornecedor || item.nomeFornecedor || 'N/A'}\n`;

            const endereco = [item.municipioFornecedor, item.ufFornecedor].filter(Boolean).join(' - ');
            if (endereco) {
                texto += `*Endereço Fornecedor:* ${endereco}\n`;
            }

            if (index < resultadosValidos.length - 1) {
                texto += `\n-------------------------\n\n`;
            }
        });

        return texto;

    } catch (erro) {
        console.error('Erro ao consultar adesões:', erro);
        return '⚠️ Ocorreu um erro interno ao tentar buscar as atas para adesão.';
    }
}

module.exports = {
    consultarEmpenhoARP,
    consultarItensPregao,
    lerEditalPregao,
    consultarContratos,
    gerarRelatorioPregoesAno,
    buscarTodosItensDaCompra,
    sincronizarAtasAno,
    resumoAtasPorAno,
    formatarDetalhesAta,
    atualizarTodasAtasDesde2024,
    atualizarAtasVigentesMadrugada,
    consultarAdesoesAta
};
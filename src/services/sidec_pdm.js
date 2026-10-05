const { getDbConnection, calcularConsumoPdm } = require('./database');

function executarQuerySql(query, params = []) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(query, params, (err, rows) => {
            db.close();
            if (err) {
                if (err.message.includes('no such table')) resolve([]);
                else reject(err);
            }
            else resolve(rows || []);
        });
    });
}

async function fetchComTentativas(url, maxTentativas = 3, tempoEsperaMs = 1500) {
    for (let t = 1; t <= maxTentativas; t++) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return await response.json();
            }
            await new Promise(resolve => setTimeout(resolve, tempoEsperaMs));
        } catch (erro) {
            await new Promise(resolve => setTimeout(resolve, tempoEsperaMs));
        }
    }
    return null; 
}

async function consultarItemOriginal(codigoItem) {
    const url = `https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?codigoItem=${codigoItem}`;
    const json = await fetchComTentativas(url);
    
    if (json && json.resultado && json.resultado.length > 0) {
        return json.resultado[0];
    }
    return null;
}

async function buscarMelhorSubstituto(itemAntigo) {
    let listaAtivos = [];
    
    if (itemAntigo.codigoPdm) {
        const urlPdm = `https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?codigoPdm=${itemAntigo.codigoPdm}&statusItem=true&tamanhoPagina=100`;
        const jsonPdm = await fetchComTentativas(urlPdm);
        if (jsonPdm && jsonPdm.resultado) {
            listaAtivos = jsonPdm.resultado;
        }
    }

    const descAntiga = itemAntigo.descricaoItem || "";

    if (listaAtivos.length === 0 && descAntiga) {
        const palavrasChave = descAntiga.split(/[\s,.;:()]+/)
            .filter(p => p.length > 3)
            .slice(0, 2)
            .join(' ');
        
        if (palavrasChave !== "") {
            const urlTexto = `https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?statusItem=true&descricaoItem=${encodeURIComponent(palavrasChave)}&tamanhoPagina=100`;
            const jsonTexto = await fetchComTentativas(urlTexto);
            if (jsonTexto && jsonTexto.resultado) {
                listaAtivos = jsonTexto.resultado;
            }
        }
    }

    if (listaAtivos.length === 0) {
        return null;
    }

    let melhorItem = listaAtivos[0];
    let maiorScore = -1;
    const palavrasAntigas = descAntiga.toLowerCase().split(/[\s,.;:()]+/);

    for (const candidato of listaAtivos) {
        const descCandidato = (candidato.descricaoItem || "").toLowerCase();
        let score = 0;
        
        for (const palavra of palavrasAntigas) {
            if (palavra.length > 2 && descCandidato.includes(palavra)) {
                score++;
            }
        }

        if (score > maiorScore) {
            maiorScore = score;
            melhorItem = candidato;
        }
    }

    return melhorItem;
}

async function analisarItemSidec(codigoItem) {
    const itemOriginal = await consultarItemOriginal(codigoItem);
    
    if (!itemOriginal) {
        return { status: 'Não encontrado / Erro', original: null, substituto: null };
    }

    const isAtivo = itemOriginal.statusItem === true || itemOriginal.statusItem === 1 || itemOriginal.statusItem === 'true';

    if (isAtivo) {
        return { status: 'Ativo', original: itemOriginal, substituto: null };
    }

    const substituto = await buscarMelhorSubstituto(itemOriginal);
    
    if (!substituto) {
        return { status: 'Inativo (Nenhum substituto encontrado)', original: itemOriginal, substituto: null };
    }

    return { status: 'Inativo (Substituído)', original: itemOriginal, substituto: substituto };
}

async function orquestrarConsultaPdm(codigoBusca) {
    const termo = String(codigoBusca).trim().toUpperCase();

    const itemDb = await executarQuerySql(
        `SELECT item as codigoItem, cod_familia_pdm as codigoPdm1, familia_pdm as codigoPdm2 
         FROM pdm WHERE item = ?`, [termo]
    );

    let codigoPdm = null;

    if (itemDb.length > 0) {
        codigoPdm = itemDb[0].codigoPdm1 || itemDb[0].codigoPdm2;
    } 

    if (!codigoPdm) {
        const infoApi = await analisarItemSidec(termo);
        if (infoApi.original && infoApi.original.codigoPdm) {
            codigoPdm = infoApi.original.codigoPdm;
        } else if (infoApi.substituto && infoApi.substituto.codigoPdm) {
            codigoPdm = infoApi.substituto.codigoPdm;
        }
    }

    if (!codigoPdm) {
        return { erro: `Não consegui localizar o Código PDM para o item *${termo}*, nem na nossa base de dados nem no catálogo online do SIDEC.` };
    }

    const itensDoPdmDb = await executarQuerySql(
        `SELECT item as codigoItem, familia_pdm as descricao 
         FROM pdm WHERE cod_familia_pdm = ? OR familia_pdm = ?`, 
         [codigoPdm, codigoPdm]
    );

    const somaPdm = await calcularConsumoPdm(codigoPdm);
    const anoAtual = new Date().getFullYear().toString();

    // Busca os gastos por item (Empenho)
    const empenhosAno = await executarQuerySql(
        `SELECT cod_item, valor_empenhado 
         FROM empenhos_entradaempenhos 
         WHERE upper(modalidade) LIKE '%DISPENSA 75-II%' AND data_ae LIKE ?`, 
         [`%${anoAtual}%`]
    );

    // Busca os gastos por item (Cartão Corporativo)
    let comprasCartao = [];
    try {
        comprasCartao = await executarQuerySql(
            `SELECT cod_item, valor_total 
             FROM compras_cartao 
             WHERE ano = ?`, 
             [anoAtual]
        );
    } catch (e) {
        // A tabela pode ainda não ter sido criada
    }

    // Mapa unificado dos gastos do item
    const mapaValores = {};
    
    empenhosAno.forEach(emp => {
        const cod = String(emp.cod_item).trim().toUpperCase();
        let val = emp.valor_empenhado || '0';
        if (typeof val === 'string') {
            val = val.replace(/\./g, '').replace(',', '.');
        }
        const num = parseFloat(val);
        if (!isNaN(num)) {
            mapaValores[cod] = (mapaValores[cod] || 0) + num;
        }
    });

    comprasCartao.forEach(compra => {
        const cod = String(compra.cod_item).trim().toUpperCase();
        const num = parseFloat(compra.valor_total) || 0;
        if (!isNaN(num)) {
            mapaValores[cod] = (mapaValores[cod] || 0) + num;
        }
    });

    let itensDoGrupo = itensDoPdmDb.map(i => ({
        codigoItem: i.codigoItem,
        descricao: i.descricao || 'Sem descrição',
        somaItem: mapaValores[i.codigoItem] || 0
    }));

    const itemJaEstaNaLista = itensDoGrupo.some(i => i.codigoItem === termo);
    if (!itemJaEstaNaLista) {
        itensDoGrupo.push({
            codigoItem: termo,
            descricao: 'Item detectado via SIDEC (Ausente na planilha PDM)',
            somaItem: mapaValores[termo] || 0
        });
    }

    const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    const resultados = [{
        codigoPdm: codigoPdm,
        somaPdm: somaPdm,
        itensDoGrupo: itensDoGrupo
    }];

    return {
        resultados,
        mensagemResumo: `✅ Relatório gerado para o PDM *${codigoPdm}*.\n\nAté o momento, foram consumidos *${formatador.format(somaPdm)}* do limite legal no ano de ${anoAtual} (Empenhos + Cartão). Segue o PDF com o detalhamento.`
    };
}

module.exports = { 
    analisarItemSidec, 
    consultarItemOriginal, 
    buscarMelhorSubstituto,
    orquestrarConsultaPdm
};
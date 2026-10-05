function respostaPossuiTextoValido(texto) {
    return typeof texto === 'string' && texto.trim().length > 0;
}

function extrairComandoBuscar(texto) {
    const textoOriginal = String(texto || '').trim();
    if (!textoOriginal) {
        return null;
    }
    
    // Aceita: "buscar", "busca", "buscar item" ou "item" seguido do termo
    const match = textoOriginal.match(/^(?:buscar\s+item|buscar|busca|item)\s+([\s\S]+)$/i);
    if (!match || !match[1]) {
        return null;
    }
    return match[1].trim();
}

function extrairComandoCriarPDF(texto = '') {
    const textoOriginal = String(texto || '').trim();
    const match = textoOriginal.match(/^(?:criarpdf|criar\s+pdf)\s+([\s\S]+)$/i);
    if (!match || !match[1]) return [];
    return extrairCodigosDeItens(match[1]);
}

function limparPrefixoWhatsapp(linha = '') {
    return String(linha || '')
        .replace(/^\[\d{1,2}:\d{2},\s*\d{1,2}\/\d{1,2}\/\d{4}\]\s*[^:]+:\s*/i, '')
        .trim();
}

function normalizarLinhaDeBusca(linha = '') {
    return limparPrefixoWhatsapp(linha)
        .replace(/^buscar\s+/i, '')
        .trim();
}

function extrairCodigoDaLinha(linha = '') {
    const linhaNormalizada = normalizarLinhaDeBusca(linha);
    if (!linhaNormalizada) {
        return null;
    }
    const match = linhaNormalizada.match(/^([A-Z]?\d{3,10})\b/i);
    if (!match || !match[1]) {
        return null;
    }
    return match[1].toUpperCase();
}

function extrairListaDeItens(texto) {
    const textoOriginal = String(texto || '').trim();
    if (!textoOriginal) {
        return [];
    }
    const partes = textoOriginal
        .split(/[\n,;]+/)
        .map(item => String(item || '').trim())
        .filter(Boolean);
    if (partes.length <= 1) {
        return [];
    }
    const codigos = [];
    const codigosVistos = new Set();
    for (const parte of partes) {
        const codigo = extrairCodigoDaLinha(parte);
        if (!codigo) {
            continue;
        }
        if (!codigosVistos.has(codigo)) {
            codigosVistos.add(codigo);
            codigos.push(codigo);
        }
    }
    return codigos.length > 1 ? codigos : [];
}

function extrairCodigosDeItens(texto = '') {
    const textoOriginal = String(texto || '').trim();
    if (!textoOriginal) {
        return [];
    }
    const linhas = textoOriginal
        .split(/\r?\n/)
        .map(linha => String(linha || '').trim())
        .filter(Boolean);
    const codigos = [];
    const codigosVistos = new Set();
    for (const linha of linhas) {
        const codigo = extrairCodigoDaLinha(linha);
        if (!codigo) {
            continue;
        }
        if (!codigosVistos.has(codigo)) {
            codigosVistos.add(codigo);
            codigos.push(codigo);
        }
    }
    return codigos;
}

function extrairNumeroPregao(texto = '') {
    const textoOriginal = String(texto || '').trim();
    if (!textoOriginal) {
        return null;
    }
    const matchFormatoComBarra = textoOriginal.match(/\b(?:PE|Preg[aõ]o)\s+(\d{1,6}\/\d{4})\b/i);
    if (matchFormatoComBarra && matchFormatoComBarra[1]) {
        return matchFormatoComBarra[1].trim();
    }
    const matchFormatoSemBarra = textoOriginal.match(/\b(?:PE|Preg[aõ]o)\s+(\d{5,10})\b/i);
    if (matchFormatoSemBarra && matchFormatoSemBarra[1]) {
        return matchFormatoSemBarra[1].trim();
    }
    return null;
}

function extrairComandoContrato(texto = '') {
    const textoOriginal = String(texto || '').trim();
    if (!textoOriginal) {
        return null;
    }
    const match = textoOriginal.match(/^(?:consultar\s+)?contrato\s+([A-Za-z0-9\/.-]+)$/i);
    if (!match || !match[1]) {
        return null;
    }
    return match[1].trim();
}

function extrairComandoDfd(texto = '') {
    const textoOriginal = String(texto || '').trim();
    if (!textoOriginal) {
        return null;
    }
    const match = textoOriginal.match(/^dfd\s+([A-Za-z0-9\/.-]+)$/i);
    if (!match || !match[1]) {
        return null;
    }
    return match[1].trim();
}

function ehComandoCadastroPca(texto = '') {
    return /^cadastropca$/i.test(String(texto || '').trim());
}

function extrairProcessosSEI(texto = '') {
    const encontrados = String(texto || '').match(/\b\d{5}\.\d{6}\/\d{4}-\d{2}\b/g);
    return encontrados || [];
}

function extrairComandoAdesao(texto = '') {
    const textoOriginal = String(texto || '').trim();
    if (!textoOriginal) return null;
    const match = textoOriginal.match(/^ades[aã]o\s+(.+)$/i);
    if (!match || !match[1]) return null;
    return match[1].trim();
}

function extrairComandoValidadeAtas(texto = '') {
    const textoOriginal = String(texto || '').trim();
    // A regex agora aceita números decimais (ex: 15.2)
    const match = textoOriginal.match(/^validade\s+atas\s+(\d+(?:\.\d+)?)$/i);
    if (!match || !match[1]) {
        return null;
    }
    return match[1];
}

module.exports = {
    respostaPossuiTextoValido,
    extrairComandoBuscar,
    extrairComandoCriarPDF,
    extrairListaDeItens,
    extrairCodigosDeItens,
    extrairNumeroPregao,
    extrairComandoContrato,
    extrairComandoDfd,
    ehComandoCadastroPca,
    extrairProcessosSEI,
    extrairComandoAdesao,
    extrairComandoValidadeAtas
};
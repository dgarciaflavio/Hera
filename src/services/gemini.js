const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('@xenova/transformers');
const { WaveFile } = require('wavefile');
const pdfParse = require('pdf-parse-new');
const ffmpeg = require('fluent-ffmpeg');
let ffmpegPathDetectado = require('ffmpeg-static');

if (ffmpegPathDetectado && typeof ffmpegPathDetectado === 'object' && ffmpegPathDetectado.path) {
    ffmpegPathDetectado = ffmpegPathDetectado.path;
}

if (!ffmpegPathDetectado) {
    ffmpegPathDetectado = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
}

if (!fs.existsSync(ffmpegPathDetectado)) {
    console.error('⚠️ ALERTA CRÍTICO: FFmpeg não encontrado fisicamente em:', ffmpegPathDetectado);
}

ffmpeg.setFfmpegPath(ffmpegPathDetectado);

function normalizarTextoMinusculo(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizarRespostaDeTexto(texto) {
    return String(texto || '').trim();
}

function garantizarTextoUtil(texto, mensagemPadrao) {
    const textoNormalizado = normalizarRespostaDeTexto(texto);
    return textoNormalizado || mensagemPadrao;
}

function textoEhPedidoDeAnaliseDocumento(texto) {
    const t = normalizarTextoMinusculo(texto);
    return (
        t.includes('analise esse documento') ||
        t.includes('analisa esse documento') ||
        t.includes('analise este documento') ||
        t.includes('analise esse tr') ||
        t.includes('analise este tr') ||
        t.includes('analise esse termo de referencia') ||
        t.includes('analise esse termo de referência') ||
        t.includes('analise este termo de referencia') ||
        t.includes('analise este termo de referência') ||
        t.includes('veja inconsistencias nesse termo de referencia') ||
        t.includes('veja inconsistências nesse termo de referência') ||
        t.includes('avalie esse documento') ||
        t.includes('avalie este documento') ||
        t.includes('com base na lei 14133') ||
        t.includes('conforme a lei 14133') ||
        t.includes('com base na 14133') ||
        t.includes('aderente a 14133') ||
        t.includes('aderente à 14133')
    );
}

async function testarConexaoOllama(urlBase) {
    const resposta = await fetch(`${urlBase}/api/tags`, {
        method: 'GET'
    });
    return resposta.ok;
}

async function gerarTextoComOllamaLocal(mensagens, temperatura = 0.5, base64Imagem = null) {
    const ollamaAtivo = String(process.env.OLLAMA_ATIVO || 'false').toLowerCase() === 'true';
    if (!ollamaAtivo) throw new Error('Ollama local está desativado no arquivo de ambiente.');

    const urlBaseDoOllama = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const modeloDoOllama = base64Imagem ? 'llama3.2-vision' : (process.env.OLLAMA_MODEL || 'llama3.2');

    let mensagensFormatadas = JSON.parse(JSON.stringify(mensagens));
    if (base64Imagem && mensagensFormatadas.length > 0) {
        const ultimaMsg = mensagensFormatadas[mensagensFormatadas.length - 1];
        if (ultimaMsg.role === 'user') {
            ultimaMsg.images = [base64Imagem];
        }
    }

    try {
        await testarConexaoOllama(urlBaseDoOllama);
    } catch (erro) {
        throw new Error(`Não consegui conectar ao Ollama em ${urlBaseDoOllama}. Verifique se o serviço está ativo. Detalhe: ${erro.message}`);
    }

    const resposta = await fetch(`${urlBaseDoOllama}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modeloDoOllama,
            messages: mensagensFormatadas,
            stream: false,
            options: {
                temperature: temperatura,
                num_ctx: 8192
            },
            keep_alive: -1
        })
    });

    if (!resposta.ok) {
        const textoDoErro = await resposta.text();
        throw new Error(`Erro HTTP no Ollama: ${resposta.status} - ${textoDoErro}`);
    }

    const dados = await resposta.json();
    if (!dados || !dados.message || !dados.message.content) {
        throw new Error('Resposta inválida retornada pelo Ollama.');
    }

    const textoFinal = normalizarRespostaDeTexto(dados.message.content);
    if (!textoFinal) throw new Error('O Ollama retornou conteúdo vazio.');

    return textoFinal;
}

async function gerarTextoComFallback(mensagens, temperatura = 0.3, base64Imagem = null) {
    try {
        return await gerarTextoComOllamaLocal(mensagens, temperatura, base64Imagem);
    } catch (erro) {
        console.error('❌ Falha na IA local (Ollama):', erro.message);
        return 'Sistema temporariamente indisponível. A inteligência artificial local parece estar desligada ou inacessível no momento.';
    }
}

function dividirEmBlocos(texto, tamanho = 1800) {
    const textoLimpo = String(texto || '').trim();
    if (!textoLimpo) return [];
    const blocos = [];
    for (let i = 0; i < textoLimpo.length; i += tamanho) {
        blocos.push(textoLimpo.slice(i, i + tamanho));
    }
    return blocos;
}

function pontuarTrecho(pergunta, trecho) {
    const palavrasPergunta = normalizarTextoMinusculo(pergunta).split(/\s+/).filter(p => p.length > 2);
    const trechoNormalizado = normalizarTextoMinusculo(trecho);
    let score = 0;

    palavrasPergunta.forEach(palavra => {
        if (trechoNormalizado.includes(palavra)) score += 1;
    });

    const t = normalizarTextoMinusculo(pergunta);
    if (t.includes('14133') && trechoNormalizado.includes('14133')) score += 8;
    if (t.includes('lei 14133') && trechoNormalizado.includes('lei')) score += 8;
    if (t.includes('termo de referencia') && trechoNormalizado.includes('termo')) score += 8;
    if (t.includes('termo de referência') && trechoNormalizado.includes('termo')) score += 8;
    if (t.includes('licitacao') && trechoNormalizado.includes('licit')) score += 6;
    if (t.includes('licitação') && trechoNormalizado.includes('licit')) score += 6;
    if (t.includes('dispensa') && trechoNormalizado.includes('dispensa')) score += 6;
    if (t.includes('inexigibilidade') && trechoNormalizado.includes('inexigibilidade')) score += 6;
    if (t.includes('pncp') && trechoNormalizado.includes('pncp')) score += 6;
    if (t.includes('edital') && trechoNormalizado.includes('edital')) score += 4;
    if (t.includes('contrato') && trechoNormalizado.includes('contrato')) score += 4;

    return score;
}

async function listarArquivosBaseJuridica() {
    const caminhoDiretorio = path.join(process.cwd(), 'data', 'contrato');
    if (!fs.existsSync(caminhoDiretorio)) return [];
    return fs.readdirSync(caminhoDiretorio)
        .filter(a => a.toLowerCase().endsWith('.txt') || a.toLowerCase().endsWith('.pdf'))
        .map(nome => path.join(caminhoDiretorio, nome));
}

async function extrairTextoDeArquivo(caminhoArquivo) {
    const ext = path.extname(caminhoArquivo).toLowerCase();

    if (ext === '.txt') {
        return fs.readFileSync(caminhoArquivo, 'utf-8');
    }

    if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(caminhoArquivo);
        const data = await pdfParse(dataBuffer);
        return data.text || '';
    }

    return '';
}

async function buscarTrechosRelevantesContrato(pergunta) {
    const arquivos = await listarArquivosBaseJuridica();
    const resultados = [];

    const t = normalizarTextoMinusculo(pergunta);
    const palavrasPergunta = t.split(/\s+/).filter(p => p.length > 3);

    const arquivosComScore = arquivos.map(caminho => {
        const nomeArquivo = normalizarTextoMinusculo(path.basename(caminho));
        let score = 0;

        palavrasPergunta.forEach(palavra => {
            if (nomeArquivo.includes(palavra)) score += 5;
        });

        const isRH = t.includes('ponto') || t.includes('atraso') || t.includes('férias') || t.includes('ferias') || t.includes('escala') || t.includes('rh') || t.includes('jornada');
        const isLicitacao = t.includes('14133') || t.includes('licitação') || t.includes('licitacao') || t.includes('edital') || t.includes('contrato') || t.includes('termo de referencia');

        if (isRH && (nomeArquivo.includes('ponto') || nomeArquivo.includes('rh') || nomeArquivo.includes('regras') || nomeArquivo.includes('escala'))) score += 15;
        if (isLicitacao && (nomeArquivo.includes('14133') || nomeArquivo.includes('lei') || nomeArquivo.includes('licita'))) score += 15;

        return { caminho, nome: path.basename(caminho), score };
    });

    arquivosComScore.sort((a, b) => b.score - a.score);
    const arquivosParaLer = arquivosComScore.slice(0, 2);

    for (const item of arquivosParaLer) {
        try {
            const conteudo = await extrairTextoDeArquivo(item.caminho);
            const blocos = dividirEmBlocos(conteudo, 1800);

            blocos.forEach((bloco, index) => {
                const scoreTrecho = pontuarTrecho(pergunta, bloco);
                if (scoreTrecho > 0) {
                    resultados.push({ index, score: scoreTrecho, trecho: bloco });
                }
            });
        } catch (erro) {
            console.error(`Erro ao analisar trechos do arquivo ${item.nome}:`, erro);
        }
    }

    return resultados.sort((a, b) => b.score - a.score).slice(0, 6);
}

function resumirDocumentoParaAnalise(textoDocumento, tamanhoMaximo = 24000) {
    const texto = String(textoDocumento || '').trim();
    if (!texto) return '';

    if (texto.length <= tamanhoMaximo) {
        return texto;
    }

    const inicio = texto.slice(0, 8000);
    const meioInicio = Math.max(0, Math.floor(texto.length / 2) - 4000);
    const meio = texto.slice(meioInicio, meioInicio + 8000);
    const fim = texto.slice(-8000);

    return [
        '### INÍCIO DO DOCUMENTO',
        inicio,
        '### TRECHO CENTRAL DO DOCUMENTO',
        meio,
        '### FINAL DO DOCUMENTO',
        fim,
        '[... documento resumido automaticamente para caber na análise ...]'
    ].join('\n\n');
}

async function analisarDocumentoComBaseLegal({ perguntaUsuario, textoDocumento, nomeDocumento = 'documento enviado' }) {
    const pergunta = String(perguntaUsuario || '').trim() || `Analise o documento ${nomeDocumento} com base na Lei 14.133 e demais normas disponíveis.`;
    const documentoOriginal = String(textoDocumento || '').trim();

    if (!documentoOriginal) {
        return 'Eu não consegui extrair texto útil do documento enviado. Se possível, envie em PDF com texto selecionável ou em arquivo .txt.';
    }

    const documentoResumido = resumirDocumentoParaAnalise(documentoOriginal, 24000);
    const trechosBase = await buscarTrechosRelevantesContrato(`${pergunta}\n${documentoResumido.slice(0, 6000)}`);

    const contextoBase = trechosBase.length
        ? trechosBase.map((item, i) => `### BASE LEGAL ${i + 1}\n${item.trecho}`).join('\n\n')
        : 'Nenhuma base legal/documental relevante foi encontrada na pasta data/contrato.';

    const prompt = `Você é a Hera, assistente virtual especializada em análise documental administrativa e licitações públicas.

TAREFA:
Analise o documento "${nomeDocumento}" com base na Lei 14.133 e demais normas/documentos de apoio fornecidos na base.

PERGUNTA/INSTRUÇÃO DO USUÁRIO:
"${pergunta}"

DOCUMENTO ENVIADO PELO USUÁRIO:
${documentoResumido}

BASE LEGAL / BASE DE CONHECIMENTO:
${contextoBase}

REGRAS OBRIGATÓRIAS:
1. NÃO invente artigo, regra, vedação ou obrigação.
2. Use SOMENTE o documento enviado e a base legal/documental fornecida.
3. Se algo não estiver claro, diga explicitamente que não conseguiu confirmar com segurança.
4. Responda em português do Brasil.
5. Estruture a resposta em:
   - Resumo executivo
   - Pontos adequados
   - Pontos de atenção / riscos
   - Lacunas ou inconsistências
   - Recomendações práticas de ajuste
6. Se o documento parecer um Termo de Referência, avalie especialmente:
   - objeto
   - justificativa
   - requisitos da contratação
   - estimativa/critério
   - obrigações
   - riscos
   - fiscalização/gestão contratual
   - critérios de medição/pagamento
   - aderência geral à 14.133
7. Não trate sua resposta como parecer jurídico definitivo.
8. NUNCA cite o nome dos arquivos de base legal, não mencione "de acordo com o trecho" ou referências de documentos em links. Dê apenas a resposta natural e fluida.`;

    try {
        const resposta = await gerarTextoComOllamaLocal([{ role: 'user', content: prompt }], 0.2);
        return garantizarTextoUtil(
            resposta,
            'Eu não consegui concluir a análise do documento com a base legal disponível.'
        );
    } catch (erro) {
        console.error('Erro na análise documental com base legal:', erro);
        return `Eu recebi o documento, mas não consegui concluir a análise agora.\n\nDetalhe técnico: ${erro.message}`;
    }
}

let transcriber = null;

async function transcreverAudio(mediaBase64) {
    const tempDir = os.tmpdir();
    const idUnico = Date.now();
    const caminhoOgg = path.join(tempDir, `audio_${idUnico}.ogg`);
    
    try {
        // Grava o arquivo original temporariamente para ambos os métodos usarem
        fs.writeFileSync(caminhoOgg, Buffer.from(mediaBase64, 'base64'));

        // ==========================================
        // TENTATIVA 1: GROQ API (ULTRA RÁPIDA)
        // ==========================================
        const groqApiKey = process.env.GROQ_API_KEY;
        if (groqApiKey && groqApiKey.trim() !== '') {
            try {
                console.log('⚡ [AUDIO] Enviando para a Groq API...');
                const formData = new FormData();
                const bufferOgg = fs.readFileSync(caminhoOgg);
                const blob = new Blob([bufferOgg], { type: 'audio/ogg' });
                
                formData.append('file', blob, 'audio.ogg');
                formData.append('model', 'whisper-large-v3');
                formData.append('response_format', 'json');
                formData.append('language', 'pt');

                const groqReq = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqApiKey}`
                    },
                    body: formData
                });

                if (groqReq.ok) {
                    const groqRes = await groqReq.json();
                    try { fs.unlinkSync(caminhoOgg); } catch(e){}
                    console.log('✅ [AUDIO] Transcrição via Groq concluída com sucesso!');
                    return groqRes.text.trim();
                } else {
                    const erroDetalhe = await groqReq.text();
                    console.error(`⚠️ [AUDIO] Groq falhou (Status: ${groqReq.status}):`, erroDetalhe);
                    throw new Error('Groq indisponível');
                }
            } catch (erroGroq) {
                console.log('🔄 [AUDIO] Falha na nuvem. Acionando o Whisper local de backup...');
            }
        } else {
            console.log('⚠️ [AUDIO] Chave da Groq não configurada. Indo direto para Whisper local...');
        }

        // ==========================================
        // TENTATIVA 2: WHISPER LOCAL (BACKUP SEGURO)
        // ==========================================
        const caminhoWav = path.join(tempDir, `audio_${idUnico}.wav`);

        await new Promise((resolve, reject) => {
            const comando = ffmpeg(caminhoOgg);

            if (ffmpegPathDetectado) {
                comando.setFfmpegPath(ffmpegPathDetectado);
            }

            comando.on('start', () => {
                console.log('⏳ [AUDIO] Convertendo formato via FFmpeg local...');
            });

            comando
                .toFormat('wav')
                .audioFrequency(16000)
                .audioChannels(1)
                .on('end', resolve)
                .on('error', (err) => {
                    console.error('❌ Falha na conversão com FFmpeg:', err.message);
                    reject(err);
                })
                .save(caminhoWav);
        });

        const wavBuffer = fs.readFileSync(caminhoWav);
        const wav = new WaveFile(wavBuffer);

        wav.toBitDepth('32f');
        let audioData = wav.getSamples();
        if (Array.isArray(audioData)) {
            audioData = audioData[0];
        }

        if (!transcriber) {
            console.log('⏳ [AUDIO] Carregando modelo Whisper-Small local...');
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small');
        }

        const resultado = await transcriber(audioData, {
            language: 'portuguese',
            task: 'transcribe'
        });

        try { fs.unlinkSync(caminhoOgg); } catch (e) {}
        try { fs.unlinkSync(caminhoWav); } catch (e) {}

        return resultado.text ? resultado.text.trim() : 'Não consegui identificar nenhuma fala neste áudio.';
    } catch (erro) {
        console.error('Erro na transcrição de áudio:', erro);
        try { fs.unlinkSync(caminhoOgg); } catch (e) {}
        return 'Aconteceu um erro ao tentar transcrever seu áudio no sistema local e na nuvem. Por favor, envie sua mensagem por texto.';
    }
}

async function resumirProcessoSEI(textoExtraido, numeroProcesso) {
    try {
        const prompt = `Você é um assessor administrativo especialista em licitações, compras e processos públicos (SEI).
Analise atentamente a extração dos últimos 20 documentos do processo SEI nº ${numeroProcesso}.
Sua tarefa: 1. Resumo Executivo. 2. Histórico Recente. 3. Status Atual.
Textos extraídos: ${textoExtraido}`;
        return await gerarTextoComFallback([{ role: 'user', content: prompt }], 0.3);
    } catch (erro) {
        console.error('Erro ao resumir o SEI:', erro);
        return 'Falha ao processar o resumo do processo SEI via inteligência artificial.';
    }
}

module.exports = {
    transcreverAudio,
    resumirProcessoSEI,
    extrairTextoDeArquivo,
    analisarDocumentoComBaseLegal,
    textoEhPedidoDeAnaliseDocumento
};
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse-new');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

async function extrairTextoDocumento(caminhoArquivo) {
    const ext = path.extname(caminhoArquivo).toLowerCase();
    
    if (ext === '.pdf') {
        const buffer = fs.readFileSync(caminhoArquivo);
        const data = await pdfParse(buffer);
        return data.text || '';
    } else {
        return fs.readFileSync(caminhoArquivo, 'utf-8') || '';
    }
}

// NOVA FUNÇÃO: O "Triage" super rápido para identificar se a pergunta já existe no banco
async function triagemPerguntaSimilar(perguntaUsuario, listaPerguntasSalvas) {
    if (!listaPerguntasSalvas || listaPerguntasSalvas.length === 0) return null;

    // Monta a lista de perguntas salvas no formato "ID | Pergunta"
    const listaFormatada = listaPerguntasSalvas.map(p => `ID: ${p.id} | Pergunta: ${p.pergunta}`).join('\n');

    const prompt = `Você é um classificador semântico rigoroso.
Sua tarefa é verificar se a "Pergunta do Usuário" tem o mesmo significado, intenção ou busca a mesma resposta que alguma das "Perguntas Salvas".

Regras Estritas:
1. Responda APENAS com o NÚMERO do ID correspondente.
2. Não escreva mais nenhuma palavra, pontuação ou explicação. Apenas o número.
3. Se nenhuma pergunta salva for similar, responda APENAS 0.

Perguntas Salvas:
${listaFormatada}

Pergunta do Usuário: ${perguntaUsuario}`;

    try {
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: prompt,
                stream: false,
                options: { 
                    temperature: 0.0 // Zero absoluto para ser puramente lógico e direto
                }
            })
        });

        if (!response.ok) return null;

        const data = await response.json();
        const respostaId = parseInt(data.response.trim(), 10);

        // Se o Ollama identificou um ID válido, pegamos a resposta salva no banco
        if (!isNaN(respostaId) && respostaId > 0) {
            const faqEncontrado = listaPerguntasSalvas.find(p => p.id === respostaId);
            return faqEncontrado ? faqEncontrado.resposta : null;
        }
        
        return null; // Nenhuma pergunta similar encontrada
    } catch (erro) {
        console.error('Erro na triagem do Ollama:', erro);
        return null; // Se falhar a triagem, segue o fluxo normal de ler o PDF
    }
}

async function consultarOllamaDocumento(pergunta, caminhoArquivo) {
    try {
        const textoDocumento = await extrairTextoDocumento(caminhoArquivo);
        
        if (!textoDocumento || !textoDocumento.trim()) {
            return '⚠️ Não foi possível extrair o texto deste documento para consulta.';
        }

        const textoLimitado = textoDocumento.slice(0, 15000);

        const prompt = `Você é um assistente virtual especializado.
Sua tarefa é responder à pergunta do usuário usando ESTRITAMENTE e EXCLUSIVAMENTE as informações contidas no documento fornecido abaixo.

DIRETRIZES RÍGIDAS:
1. Responda de forma clara, direta e objetiva.
2. Não utilize conhecimentos externos ou prévios.
3. Se a resposta para a pergunta não estiver presente no texto fornecido, responda EXATAMENTE: "Desculpe, não encontrei essa informação no documento selecionado."
4. Não invente ou suponha nada.

--- INÍCIO DO DOCUMENTO ---
${textoLimitado}
--- FIM DO DOCUMENTO ---

Pergunta do usuário: ${pergunta}`;

        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.1
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Erro na API do Ollama: HTTP ${response.status}`);
        }

        const data = await response.json();
        const respostaTexto = data.response ? data.response.trim() : '';

        if (!respostaTexto) {
            return 'O Ollama não retornou uma resposta válida.';
        }

        return respostaTexto;
    } catch (erro) {
        console.error('Erro na integração com Ollama:', erro);
        return '❌ Não foi possível conectar ao motor de IA local (Ollama). Verifique se o serviço do Ollama está rodando na máquina.';
    }
}

module.exports = { consultarOllamaDocumento, triagemPerguntaSimilar };
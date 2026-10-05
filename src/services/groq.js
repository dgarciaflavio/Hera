/**
 * Envia os dados agregados do estoque para a API do Groq e retorna insights analíticos.
 * @param {Object} dadosAgregados - Objeto contendo as métricas calculadas pelo excel.js
 * @returns {Promise<string>} - Texto em Markdown com os insights gerados
 */
async function analisarEstoqueComGroq(dadosAgregados) {
    // Tenta usar a chave de relatórios primeiro. Se não existir, usa a chave principal como fallback.
    const apiKey = process.env.GROQ_API_KEY_RELATORIOS || process.env.GROQ_API_KEY;

    if (!apiKey) {
        console.warn("⚠️ Chave da API do Groq não configurada no .env.");
        return "> *Aviso da Hera:* Insights gerados por IA indisponíveis (Chave da API não configurada).";
    }

    // Pega as 5 observações mais frequentes para dar contexto à IA sem estourar o limite de tokens
    const resumoObs = dadosAgregados.analiseObservacoes
        .slice(0, 5)
        .map(obs => `- ${obs.observacao}: ${obs.percentual}% (${obs.quantidade} itens)`)
        .join('\n');

    // Prompt de comando (Engenharia de Prompt)
    const prompt = `
    Atue como um analista de estoque e inteligência de negócios focado em gestão governamental/pública.
    Analise os seguintes dados do nosso estoque e crie um relatório executivo com insights, avaliação de gargalos e recomendações.
    
    DADOS CONSOLIDADOS:
    - Total de Itens Únicos analisados: ${dadosAgregados.totalItensUnicos}
    - Atas Vigentes COM Saldo (Prontas para uso): ${dadosAgregados.atasVigentesComSaldo.length}
    - Atas Vigentes SEM Saldo (Necessitam aditivo ou nova licitação): ${dadosAgregados.atasVigentesSemSaldo.length}
    - Empenhos Ativos (Soma de empenhos do Ano Atual e Ano Anterior): ${dadosAgregados.empenhosAnoAtual + dadosAgregados.empenhosAnoAnterior}
    
    PRINCIPAIS STATUS DE GESTÃO (COLUNA OBS):
    ${resumoObs}
    
    INSTRUÇÕES DE SAÍDA:
    O texto fará parte de um PDF oficial. Seja direto, formal, elegante e objetivo. Não use saudações. 
    Estruture a resposta obrigatoriamente nos 3 tópicos abaixo usando negrito e bullet points:
    
    1. Visão Geral da Saúde do Estoque
    2. Alertas e Pontos Críticos (Foque na relação entre o saldo das atas e os empenhos ativos pendentes)
    3. Recomendações e Plano de Ação Estratégico
    `;

    try {
        // Utiliza o fetch nativo do Node.js (sem precisar de importações ou bibliotecas de terceiros)
        const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', // Modelo mais robusto e atual da Groq
                messages: [
                    { 
                        role: 'system', 
                        content: 'Você é um assistente executivo especialista em logística, contratos e gestão de estoque. Seu tom é analítico, sintético e voltado à resolução de problemas.' 
                    },
                    { 
                        role: 'user', 
                        content: prompt 
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500
            })
        });

        if (!resposta.ok) {
            const erroData = await resposta.text();
            console.error("🔴 Erro na API Groq:", erroData);
            return "> *Aviso da Hera:* Não foi possível processar a análise com a IA no momento. Servidor indisponível ou limite de taxa atingido.";
        }

        const dados = await resposta.json();
        return dados.choices[0].message.content.trim();

    } catch (erro) {
        console.error('🔴 Erro de conexão com o Groq:', erro);
        return "> *Aviso da Hera:* Ocorreu uma falha de rede ao tentar contatar o servidor de Inteligência Artificial.";
    }
}

module.exports = { analisarEstoqueComGroq };
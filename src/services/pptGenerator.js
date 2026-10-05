const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Função para pedir ao Gemini que gere os insights do slide em formato estruturado (JSON)
 */
async function gerarInsightsGemini(estatisticas) {
    console.log('🧠 Conectando ao Gemini para análise executiva dos dados...');
    
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY_PPT);
        // ATENÇÃO: O nome correto do modelo rápido do Google é gemini-1.5-flash
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
        
        const prompt = `
            Atue como um Diretor de Supply Chain Hospitalar/Público elaborando um relatório executivo para a alta gestão.
            Analise os dados abaixo de forma fria e estratégica. 
            Preste MUITA ATENÇÃO à proporção de itens "Mortos/Sem Demanda" (que possuem CMM = 0 e Saldo = 0 consecutivamente) em relação à base total.
            
            [VITALIDADE DA BASE]
            - Total de Itens Monitorados: ${estatisticas.totalItens}
            - Itens Com Vida (Giram no estoque): ${estatisticas.vidaVsMorto ? estatisticas.vidaVsMorto.vivos : 0}
            - Itens Mortos / Sem Demanda (CMM=0 e Saldo=0): ${estatisticas.vidaVsMorto ? estatisticas.vidaVsMorto.mortos : 0}
            
            [RAIO-X DOS ZERADOS E RUPTURAS]
            - Furo sem reposição (Ruptura Crítica Real): ${estatisticas.acaoImediata}
            - Zerados aguardando Empenho chegar: ${estatisticas.zerados ? estatisticas.zerados.comEmpenho : 0}
            - Zerados aguardando virar AE: ${estatisticas.zerados ? estatisticas.zerados.comAeEAta : 0}
            
            [SAÚDE DO ESTOQUE VIVO E ATAS]
            - Estoque Saudável (Segurança): ${estatisticas.segurancaEstoque}
            - Estoque Crítico (<= 30 dias): ${estatisticas.estoque ? estatisticas.estoque.critico : 0}
            - Atas Vencidas / Sem Ata: ${estatisticas.atas ? estatisticas.atas.vencidasOuSemAta : 0}
            - Processos em Andamento: ${estatisticas.processos ? estatisticas.processos.emAndamento : 0}
            - Itens Totalmente Descobertos (Nenhum Processo): ${estatisticas.processos ? estatisticas.processos.nenhum : 0}
            
            Retorne um objeto JSON estrito e válido com a seguinte estrutura exata:
            {
                "resumo_executivo": "1 parágrafo executivo (máx 4 linhas) resumindo a saúde geral do estoque, os gargalos de processos e as rupturas.",
                "alerta_itens_mortos": "Uma frase de forte impacto gerencial chamando a atenção para o volume e percentual de itens com CMM=0 e Saldo=0, exigindo higienização do cadastro de materiais.",
                "pontos_atencao": ["risco curto 1", "risco curto 2", "risco curto 3", "risco curto 4"],
                "recomendacoes_estrategicas": ["ação direta 1", "ação direta 2", "ação direta 3", "ação direta 4"]
            }
            Não utilize formatação markdown como \`\`\`json. Apenas o objeto puro.
        `;

        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        
        // Limpeza de markdown de bloco de código, caso o Gemini insira
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        const insights = JSON.parse(responseText);
        console.log('✅ Insights do Gemini gerados com sucesso!');
        return insights;

    } catch (erro) {
        console.error('❌ Erro de conexão ou parsing no Gemini:', erro.message);
        return {
            resumo_executivo: "A análise executiva não pôde ser gerada no momento devido a indisponibilidade da Inteligência Artificial.",
            alerta_itens_mortos: "Atenção: Não foi possível processar a vitalidade da base.",
            pontos_atencao: ["Verificar chave de API no servidor.", "Confirmar estabilidade da rede."],
            recomendacoes_estrategicas: ["Avaliar os gráficos manualmente enquanto o serviço de IA é restabelecido."]
        };
    }
}

/**
 * Função auxiliar para dividir um array grande em "páginas" (chunks) menores
 */
function dividirEmPaginas(array, tamanhoPagina) {
    const resultado = [];
    for (let i = 0; i < array.length; i += tamanhoPagina) {
        resultado.push(array.slice(i, i + tamanhoPagina));
    }
    return resultado;
}

/**
 * Função principal que monta o PPTX
 */
async function criarApresentacao(graficosBase64, estatisticas) {
    const pptx = new PptxGenJS();
    
    // Configura o layout padrão (Widescreen 16:9)
    pptx.layout = 'LAYOUT_16x9';
    
    // Caminhos para as imagens de template
    const templateDir = path.join(process.cwd(), 'data', 'Template');
    const imgCapa = path.join(templateDir, '01 - Capa.PNG');
    const imgConteudo = path.join(templateDir, '02 - Conteude.PNG');
    const imgFim = path.join(templateDir, '03 - Fim.PNG');

    // 1. Definição dos Master Slides (Mestres)
    pptx.defineSlideMaster({
        title: 'MASTER_CAPA',
        background: { path: fs.existsSync(imgCapa) ? imgCapa : null }
    });

    pptx.defineSlideMaster({
        title: 'MASTER_CONTEUDO',
        background: { path: fs.existsSync(imgConteudo) ? imgConteudo : null }
    });

    pptx.defineSlideMaster({
        title: 'MASTER_FIM',
        background: { path: fs.existsSync(imgFim) ? imgFim : null }
    });

    // Chama a IA do Google para processar os números
    const insights = await gerarInsightsGemini(estatisticas);

    // ==========================================
    // SLIDE 1: CAPA
    // ==========================================
    const slideCapa = pptx.addSlide({ masterName: 'MASTER_CAPA' });
    
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    slideCapa.addText(`Relatório Executivo de Suprimentos\nGerado em: ${dataHoje}`, {
        x: '10%', y: '65%', w: '80%', h: 1.5,
        fontSize: 28, bold: true, color: 'FFFFFF', align: 'center'
    });

    // ==========================================
    // SLIDE 2: VISÃO GERAL (Gráficos + Resumo)
    // ==========================================
    const slideVisao = pptx.addSlide({ masterName: 'MASTER_CONTEUDO' });

    slideVisao.addText('Dashboard Executivo', {
        x: '5%', y: '5%', w: '90%', h: 0.8,
        fontSize: 24, bold: true, color: '2C3E50'
    });

    // Resumo Executivo do Gemini
    slideVisao.addText(insights.resumo_executivo, {
        x: '5%', y: '15%', w: '90%', h: 1.2,
        fontSize: 14, color: '333333', italic: false, valign: 'top'
    });

    // DESTAQUE: Alerta de Itens Mortos
    slideVisao.addText(`💡 Higienização de Base: ${insights.alerta_itens_mortos}`, {
        x: '5%', y: '28%', w: '90%', h: 0.6,
        fontSize: 13, bold: true, color: 'C0392B', italic: true, valign: 'top'
    });

    // Inserindo os gráficos capturados da tela (Lado a Lado)
    if (graficosBase64.chartVida) {
        slideVisao.addImage({ data: graficosBase64.chartVida, x: '5%', y: '40%', w: '28%', h: '45%' });
    }
    if (graficosBase64.chartZerados) {
        slideVisao.addImage({ data: graficosBase64.chartZerados, x: '35%', y: '40%', w: '28%', h: '45%' });
    }
    if (graficosBase64.chartEstoque) {
        slideVisao.addImage({ data: graficosBase64.chartEstoque, x: '65%', y: '40%', w: '28%', h: '45%' });
    }

    // ==========================================
    // SLIDE 3: RISCOS E PLANO DE AÇÃO (IA)
    // ==========================================
    const slideEstrategia = pptx.addSlide({ masterName: 'MASTER_CONTEUDO' });
    
    slideEstrategia.addText('Análise Estratégica e Plano de Ação', {
        x: '5%', y: '5%', w: '90%', h: 0.8,
        fontSize: 24, bold: true, color: '2C3E50'
    });

    // Coluna Esquerda: Riscos
    slideEstrategia.addText('⚠️ Principais Riscos e Ofensores', {
        x: '5%', y: '20%', w: '40%', fontSize: 18, bold: true, color: 'C0392B'
    });
    
    (insights.pontos_atencao || []).forEach((ponto, i) => {
        slideEstrategia.addText(`• ${ponto}`, {
            x: '5%', y: `${30 + (i * 12)}%`, w: '42%', fontSize: 14, color: '333333'
        });
    });

    // Coluna Direita: Ações
    slideEstrategia.addText('🎯 Recomendações e Ações', {
        x: '52%', y: '20%', w: '45%', fontSize: 18, bold: true, color: '27AE60'
    });

    (insights.recomendacoes_estrategicas || []).forEach((rec, i) => {
        slideEstrategia.addText(`• ${rec}`, {
            x: '52%', y: `${30 + (i * 12)}%`, w: '45%', fontSize: 14, color: '333333'
        });
    });

    // ==========================================
    // SLIDE 4: TOP 10 RUPTURAS
    // ==========================================
    const todosDetalhes = estatisticas.detalhes || [];
    const itensRuptura = todosDetalhes.filter(i => i.isAcaoImediata);
    
    if (itensRuptura.length > 0) {
        const slideRuptura = pptx.addSlide({ masterName: 'MASTER_CONTEUDO' });
        
        slideRuptura.addText(`Top ${Math.min(10, itensRuptura.length)}: Foco de Ação Imediata (Ruptura Crítica S/ Reposição)`, {
            x: '5%', y: '5%', w: '90%', h: 0.8, fontSize: 20, bold: true, color: 'C0392B'
        });

        const rowsTabela = [
            [
                { text: 'CÓDIGO', options: { fill: '2C3E50', color: 'FFFFFF', bold: true } },
                { text: 'DESCRIÇÃO', options: { fill: '2C3E50', color: 'FFFFFF', bold: true } },
                { text: 'PLANEJADOR', options: { fill: '2C3E50', color: 'FFFFFF', bold: true } },
                { text: 'LOCAL', options: { fill: '2C3E50', color: 'FFFFFF', bold: true } }
            ]
        ];

        // Limita ao Top 10 para uma visão exclusivamente executiva
        const top10 = itensRuptura.slice(0, 10);
        
        top10.forEach(item => {
            rowsTabela.push([
                item.item,
                item.descricao.length > 60 ? item.descricao.substring(0, 57) + '...' : item.descricao,
                item.planejador,
                item.local
            ]);
        });

        slideRuptura.addTable(rowsTabela, {
            x: '5%', y: '20%', w: '90%',
            colW: [1.5, 5, 2, 1],
            border: { pt: 1, color: 'CCCCCC' },
            fontSize: 11,
            color: '333333',
            rowH: 0.4,
            valign: 'middle'
        });
    }

    // ==========================================
    // SLIDE FIM
    // ==========================================
    pptx.addSlide({ masterName: 'MASTER_FIM' });

    const buffer = await pptx.write('nodebuffer');
    return buffer;
}

module.exports = { criarApresentacao };
const fs = require('fs');
const path = require('path');
const os = require('os');
const pino = require('pino'); // Necessário para baixar mídias da Baileys silenciosamente
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// Substituindo o MessageMedia nativo pelo nosso próprio mock simples
const MessageMedia = {
    fromFilePath: (filePath) => ({ filePath })
};

const {
    salvarMensagem,
    dbSalvarConsulta
} = require('../services/memoria');

const {
    transcreverAudio,
    analisarDocumentoComBaseLegal,
    textoEhPedidoDeAnaliseDocumento
} = require('../services/gemini');

const notificacoes = require('../services/notificacoes') || {};
const dispararAlertasDeAta = notificacoes.dispararAlertasDeAta || null;

// ADIÇÃO AQUI: Importação do gerarPlanilhaAtas
const { buscarItem, buscarItensEmLote, obterDadosBrutosItem, buscarAtasPorVencimento, gerarRelatorioEstoque, gerarPlanilhaAtas } = require('../services/excel');
const { gerarPDFItens } = require('../services/pdfGenerator');

const { consultarDfd, cadastrarPca } = require('../services/dfd');
const { processarArquivoExcelSidec } = require('../services/sidecExcel');
const { atualizarCatalogoSidecAtivo } = require('../services/sidecCatalogoUpdater');

const {
    debugCodigoSidecMaterial,
    bloquearCodigoSidec,
    desbloquearCodigoSidec,
    listarBloqueiosSidec
} = require('../services/sidec');

// --- IMPORTAÇÕES DO NOVO SISTEMA PDM E BANCO DE DADOS ---
const { orquestrarConsultaPdm, analisarItemSidec } = require('../services/sidec_pdm');
const { upsertItemPdm, importarEmpenhos, importarPlanilhaSaldo } = require('../services/database');
const { gerarRelatorioPdfPdm } = require('../services/pdfPdm');

const {
    consultarItensPregao,
    gerarRelatorioPregoesAno,
    resumoAtasPorAno,
    formatarDetalhesAta,
    atualizarTodasAtasDesde2024,
    consultarAdesoesAta
} = require('../services/api');

// --- NOVAS IMPORTAÇÕES DO MENU DE AJUDA E FAQ ---
const { listarDocumentosDisponiveis, obterDocumentoPorId } = require('../services/documentos');
const { consultarOllamaDocumento, triagemPerguntaSimilar } = require('../services/ollama');
const { inicializarTabelaFaq, buscarFaqPorDocumento, salvarFaq } = require('../services/faq');

const { chatsPausados } = require('../core/state');

const {
    respostaPossuiTextoValido,
    extrairComandoBuscar,
    extrairComandoCriarPDF,
    extrairListaDeItens,
    extrairCodigosDeItens,
    extrairNumeroPregao,
    extrairComandoDfd,
    ehComandoCadastroPca,
    extrairComandoAdesao,
    extrairComandoValidadeAtas
} = require('../utils/texto');

const MENSAGEM_SEM_AUTORIZACAO_CONSULTA =
    'Você não pode fazer essa consulta pois seu número não está salvo, enviei para o Flavio verificar e te dar um retorno.';

const cadastrosPcaEmAndamento = new Map();
const cadastrosPdmEmAndamento = new Map(); // NOVO ESTADO: Controle do UPSERT de PDM
const atualizacoesDbEmAndamento = new Map(); // NOVO ESTADO: Controle de Atualização DB via Arquivo
const geracaoAtasEmAndamento = new Map(); // NOVO ESTADO: Controle para o comando "Gerar Atas"
const paginacaoBuscaPorContato = new Map();
const ultimosDocumentosPorContato = new Map();
const sessoesAjuda = new Map(); 

const pathAutorizacoes = path.join(__dirname, '..', 'autorizacoes_whatsapp.json');

if (!global.mensagensProcessadas) {
    global.mensagensProcessadas = new Set();
}

function lerAutorizacoes() {
    try {
        if (!fs.existsSync(pathAutorizacoes)) {
            fs.writeFileSync(pathAutorizacoes, JSON.stringify({}, null, 4));
        }
        const data = fs.readFileSync(pathAutorizacoes, 'utf8');
        return JSON.parse(data);
    } catch (erro) {
        console.error('Erro ao ler autorizações:', erro);
        return {};
    }
}

function salvarAutorizacoes(dados) {
    try {
        fs.writeFileSync(pathAutorizacoes, JSON.stringify(dados, null, 4));
    } catch (erro) {
        console.error('Erro ao salvar autorizações:', erro);
    }
}

function garantirDiretorio(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function extensaoPareceExcel(filename = '') {
    const nome = String(filename || '').toLowerCase().trim();
    return nome.endsWith('.xlsx') || nome.endsWith('.xlsm') || nome.endsWith('.xls');
}

function extensaoPareceDocumentoAnalise(filename = '') {
    const nome = String(filename || '').toLowerCase().trim();
    return nome.endsWith('.pdf') || nome.endsWith('.txt');
}

function extrairCodigoDoComandoDebugSidec(texto) {
    const match = String(texto || '').trim().match(/^hera,\s*debug\s+sidec\s+([A-Z0-9.-]+)$/i);
    return match ? match[1].trim() : null;
}

function ehComandoAtualizarCatalogoSidec(texto) {
    return /^hera,\s*atualizar\s+cat[áa]logo\s+sidec$/i.test(String(texto || '').trim());
}

function extrairComandoBloquearSidec(texto) {
    const match = String(texto || '').trim().match(/^hera,\s*bloquear\s+sidec\s+([A-Z0-9.-]+)\s+(.+)$/i);
    if (!match) return null;
    return {
        codigo: match[1].trim(),
        motivo: match[2].trim()
    };
}

function extrairComandoDesbloquearSidec(texto) {
    const match = String(texto || '').trim().match(/^hera,\s*desbloquear\s+sidec\s+([A-Z0-9.-]+)$/i);
    return match ? match[1].trim() : null;
}

function ehComandoListarBloqueiosSidec(texto) {
    return /^hera,\s*listar\s+bloqueios\s+sidec$/i.test(String(texto || '').trim());
}

async function contatoPodeConsultarPlanilha(idContato, nomeContato, client, ehConversaComigoMesmo) {
    const meuNumero = String(process.env.MEU_NUMERO || '').replace(/\D/g, '');
    const adminNum = String(process.env.NUMERO_ADMIN || '').replace(/\D/g, '');
    const num = String(idContato).replace(/\D/g, '');

    // Tratamento do 9º dígito: compara os últimos 8 dígitos
    const isBot = meuNumero && num.slice(-8) === meuNumero.slice(-8);
    const isAdmin = adminNum && num.slice(-8) === adminNum.slice(-8);

    // Permissão automática para o próprio bot ou para o ADMIN
    if (ehConversaComigoMesmo || isBot || isAdmin) return true;
    
    const autorizacoes = lerAutorizacoes();
    
    if (autorizacoes[num] === 'aprovado') return true;
    
    if (autorizacoes[num] !== 'pendente' && autorizacoes[num] !== 'negado') {
        autorizacoes[num] = 'pendente';
        salvarAutorizacoes(autorizacoes);
        
        if (adminNum) {
            try {
                // Pega o número admin real que está no .env para enviar a mensagem
                const jidAdmin = process.env.NUMERO_ADMIN.includes('@') ? process.env.NUMERO_ADMIN : `${adminNum}@s.whatsapp.net`;
                await client.sendMessage(jidAdmin, { 
                    text: `⚠️ *Nova solicitação de acesso!*\n\n👤 Nome: ${nomeContato}\n📱 Número: ${num}\n\nResponda *sim* para aprovar ou *não* para negar.` 
                });
            } catch (e) {
                console.error("Erro ao notificar admin", e);
            }
        }
    }
    return false;
}

function mensagemFoiEnviadaPorMimMesmo(idContato, mensagemFoiEnviadaPorMim) {
    const meuNumero = String(process.env.MEU_NUMERO || '').replace(/\D/g, '');
    const contatoAtual = String(idContato || '').replace(/\D/g, '');
    return Boolean(mensagemFoiEnviadaPorMim && meuNumero && contatoAtual && meuNumero === contatoAtual);
}

async function contatoPodeCadastrarPca(idContato, mensagemFoiEnviadaPorMim, nomeContato, client) {
    if (mensagemFoiEnviadaPorMimMesmo(idContato, mensagemFoiEnviadaPorMim)) {
        return true;
    }
    return await contatoPodeConsultarPlanilha(idContato, nomeContato, client, false);
}

function extrairComandoMaisBusca(texto) {
    const match = String(texto || '').trim().match(/^mais\s+(.+)$/i);
    return match && match[1] ? match[1].trim() : null;
}

function limparPaginacaoBusca(idContato) {
    paginacaoBuscaPorContato.delete(idContato);
}

function salvarPaginacaoBusca(idContato, termo, paginaAtual, totalResultadosEstimado = null) {
    paginacaoBuscaPorContato.set(idContato, {
        termo: String(termo || '').trim().toLowerCase(),
        paginaAtual: Number(paginaAtual) || 1,
        totalResultadosEstimado
    });
}

function obterPaginacaoBusca(idContato) {
    return paginacaoBuscaPorContato.get(idContato) || null;
}

function limparDocumentoTemporario(idContato) {
    const doc = ultimosDocumentosPorContato.get(idContato);
    if (doc?.caminhoArquivo && fs.existsSync(doc.caminhoArquivo)) {
        try { fs.unlinkSync(doc.caminhoArquivo); } catch (erro) {}
    }
    ultimosDocumentosPorContato.delete(idContato);
}

function salvarDocumentoTemporario(idContato, payload) {
    limparDocumentoTemporario(idContato);
    ultimosDocumentosPorContato.set(idContato, {
        ...payload,
        salvoEm: Date.now()
    });
}

function obterUltimoDocumento(idContato) {
    return ultimosDocumentosPorContato.get(idContato) || null;
}

function montarAlertaIrpSeNecessario(resultado) {
    const resultados = resultado?.resultados || [];
    const temNaoUtilizavel = resultados.some(item => item.Status === 'Não utilizável');
    const temNaoEncontrado = resultados.some(item => item.Status === 'Não Encontrado');
    const temSugestao = resultados.some(item => String(item.Novo_Cod || '').trim() && String(item.Novo_Cod || '').trim() !== '-');

    if (!temNaoUtilizavel && !temNaoEncontrado && !temSugestao) {
        return null;
    }

    let alerta = `⚠️ *Atenção ao lançar a IRP:*\n\n`;
    alerta += `- Sempre valide o item no catálogo visual do Compras.gov.br antes do lançamento.\n`;
    alerta += `- A API pública pode indicar um item como utilizável mesmo quando o portal o trata como suspenso ou não utilizável.\n`;
    
    if (temNaoUtilizavel) {
        alerta += `- Há item(ns) marcado(s) como *Não utilizável* nesta planilha. Não lance o código original sem conferência.\n`;
    }
    if (temNaoEncontrado) {
        alerta += `- Há item(ns) *Não encontrados*. Revise manualmente antes de seguir.\n`;
    }
    if (temSugestao) {
        alerta += `- Há sugestão(ões) de substituição. Confirme o SIDEC sugerido no catálogo antes de usar na IRP.\n`;
    }
    alerta += `- Em caso de divergência entre planilha, API e portal, priorize a validação final no catálogo visual.`;
    return alerta;
}

// ==========================================
// FUNÇÃO: PROCESSAR IMPORTAÇÃO DIRETA DE BANCO
// ==========================================
async function processarArquivoDbWhatsApp({ mensagem, chat, idContato }) {
    const sessao = atualizacoesDbEmAndamento.get(idContato);
    if (!sessao) return false;

    const media = await mensagem.downloadMedia();
    if (!media) {
        await mensagem.reply('Não consegui baixar o arquivo enviado. Tente novamente ou digite "cancelar".');
        return true;
    }

    const nomeArquivo = media.filename || `arquivo_${Date.now()}.xlsx`;
    const extensao = path.extname(nomeArquivo).toLowerCase();
    
    if (extensao !== '.xlsx' && extensao !== '.xls' && extensao !== '.csv') {
        await mensagem.reply('❌ Formato inválido. Por favor, envie uma planilha Excel (.xlsx, .xls) ou .csv.\n\nPara cancelar a operação, digite "cancelar".');
        try { await chat.markUnread(); } catch (e) {}
        return true;
    }

    const dirTemp = path.join(os.tmpdir(), 'hera-whatsapp-db');
    garantirDiretorio(dirTemp);
    const caminhoEntrada = path.join(dirTemp, `${Date.now()}_${nomeArquivo}`);
    fs.writeFileSync(caminhoEntrada, Buffer.from(media.data, 'base64'));

    const tipoLabel = sessao.tipo === 'empenhos' ? 'Empenhos' : 'Saldo (Abaixo de 90 dias)';
    await mensagem.reply(`⏳ Recebi a planilha. Processando e importando a base de dados de *${tipoLabel}*... Isso pode demorar alguns minutos.`);

    try {
        let resultado = '';
        if (sessao.tipo === 'empenhos') {
            resultado = await importarEmpenhos(caminhoEntrada);
        } else if (sessao.tipo === 'saldo') {
            const dataHoje = new Date().toISOString().split('T')[0];
            resultado = await importarPlanilhaSaldo(caminhoEntrada, dataHoje);
        }

        await mensagem.reply(`✅ *Sucesso!*\n\n${resultado}`);
        salvarMensagem(idContato, 'assistant', `Atualização DB concluída: ${resultado}`);
        dbSalvarConsulta(idContato, `Atualização DB: ${sessao.tipo}`);
        
        atualizacoesDbEmAndamento.delete(idContato);
    } catch (erro) {
        console.error(`Erro na atualização DB (${sessao.tipo}):`, erro);
        await mensagem.reply(`❌ Ocorreu um erro ao importar os dados:\n${erro.message}\n\nTente enviar o arquivo novamente ou digite "cancelar".`);
    } finally {
        try { fs.unlinkSync(caminhoEntrada); } catch (e) {}
        try { await chat.markUnread(); } catch (e) {}
    }

    return true;
}

async function processarDocumentoExcelWhatsApp({ mensagem, chat, idContato }) {
    const media = await mensagem.downloadMedia();
    if (!media) {
        await mensagem.reply('Não consegui baixar o arquivo enviado.');
        return true;
    }

    const nomeArquivo = media.filename || `arquivo_${Date.now()}.xlsx`;
    
    if (!extensaoPareceExcel(nomeArquivo)) {
        return false;
    }

    const dirTemp = path.join(os.tmpdir(), 'hera-whatsapp-excel');
    garantirDiretorio(dirTemp);

    const caminhoEntrada = path.join(dirTemp, `${Date.now()}_${nomeArquivo}`);
    fs.writeFileSync(caminhoEntrada, Buffer.from(media.data, 'base64'));

    await mensagem.reply(
        '📊 Recebi sua planilha.\n\n' +
        '🔎 Vou validar os códigos SIDEC, verificar os PDMs e procurar substitutos para os itens não utilizáveis.\n' +
        'Isso pode levar alguns minutos, dependendo do tamanho do arquivo.'
    );

    let ultimoAviso = 0;

    try {
        const resultado = await processarArquivoExcelSidec(caminhoEntrada, {
            concorrencia: 3,
            onProgress: async ({ total, processadas, etapa }) => {
                if (etapa !== 'processando') return;
                
                const agora = Date.now();
                if (agora - ultimoAviso < 30000) return;
                ultimoAviso = agora;

                try {
                    await mensagem.reply(`⏳ Processamento em andamento: ${processadas}/${total} linha(s) concluídas.`);
                } catch (erro) {}
            }
        });

        const mediaResultado = MessageMedia.fromFilePath(resultado.caminhoSaida);
        await chat.sendMessage(mediaResultado, {
            caption:
                '✅ Processamento concluído.\n\n' +
                `Linhas válidas: ${resultado.resumo.totalLinhasValidas}\n` +
                `Utilizáveis: ${resultado.resultados.filter(r => r.Status === 'Utilizável').length}\n` +
                `Não utilizáveis: ${resultado.resultados.filter(r => r.Status === 'Não utilizável').length}\n` +
                `Não encontrados: ${resultado.resumo.naoEncontrados}\n\n` +
                'Estou enviando a planilha com o resultado completo.'
        });

        const alertaIrp = montarAlertaIrpSeNecessario(resultado);
        if (alertaIrp) {
            await mensagem.reply(alertaIrp);
            salvarMensagem(idContato, 'assistant', alertaIrp);
            dbSalvarConsulta(idContato, 'Alerta IRP após processamento SIDEC');
        }

        salvarMensagem(idContato, 'assistant', `Planilha SIDEC processada: ${nomeArquivo}`);
        dbSalvarConsulta(idContato, `Processamento Excel SIDEC: ${nomeArquivo}`);

        try { fs.unlinkSync(caminhoEntrada); } catch (erro) {}
        try { fs.unlinkSync(resultado.caminhoSaida); } catch (erro) {}

        try { await chat.markUnread(); } catch (erro) {}

        return true;
    } catch (erro) {
        console.error('🔴 Erro ao processar Excel do WhatsApp:', erro);
        await mensagem.reply(
            '❌ Ocorreu um erro ao processar a planilha enviada.\n' +
            'Verifique se o arquivo contém as colunas "Código Sidec" e "Descrição do Material".'
        );
        try { fs.unlinkSync(caminhoEntrada); } catch (erro2) {}
        try { await chat.markUnread(); } catch (erro2) {}
        return true;
    }
}

async function processarDocumentoAnaliseWhatsApp({ mensagem, chat, idContato }) {
    const media = await mensagem.downloadMedia();
    if (!media) {
        await mensagem.reply('Não consegui baixar o documento enviado.');
        return true;
    }

    const nomeArquivo = media.filename || `documento_${Date.now()}.pdf`;

    if (!extensaoPareceDocumentoAnalise(nomeArquivo)) {
        return false;
    }

    const dirTemp = path.join(os.tmpdir(), 'hera-whatsapp-documentos');
    garantirDiretorio(dirTemp);
    const caminhoEntrada = path.join(dirTemp, `${Date.now()}_${nomeArquivo}`);
    fs.writeFileSync(caminhoEntrada, Buffer.from(media.data, 'base64'));

    try {
        await mensagem.reply(`📄 Recebi o documento *${nomeArquivo}*. Vou extrair o texto agora...`);

        const textoExtraido = await extrairTextoDeArquivo(caminhoEntrada);

        if (!textoExtraido || !String(textoExtraido).trim()) {
            await mensagem.reply(
                '⚠️ Recebi o documento, mas não consegui extrair texto útil dele.\n' +
                'Se for um PDF escaneado como imagem, tente enviar uma versão com texto selecionável ou um arquivo .txt.'
            );
            try { await chat.markUnread(); } catch (erro) {}
            return true;
        }

        salvarDocumentoTemporario(idContato, {
            nomeArquivo,
            caminhoArquivo: caminhoEntrada,
            textoExtraido
        });

        const resposta =
            `✅ Documento recebido com sucesso: ${nomeArquivo}\n\n` +
            `Eu já consigo analisar esse arquivo com base na Lei 14.133 e demais documentos da pasta de base.\n` +
            `Agora você pode me pedir, por exemplo:\n` +
            `- "analise esse documento com base na lei 14133"\n` +
            `- "analise esse TR"\n` +
            `- "veja inconsistências nesse termo de referência"`;

        salvarMensagem(idContato, 'assistant', resposta);
        dbSalvarConsulta(idContato, `Documento recebido para análise: ${nomeArquivo}`);
        await mensagem.reply(resposta);

        try { await chat.markUnread(); } catch (erro) {}

        return true;
    } catch (erro) {
        console.error('🔴 Erro ao processar documento para análise:', erro);
        await mensagem.reply(
            '❌ Ocorreu um erro ao processar o documento enviado para análise.\n' +
            'Tente novamente com um PDF ou TXT válido.'
        );
        try { fs.unlinkSync(caminhoEntrada); } catch (erro2) {}
        try { await chat.markUnread(); } catch (erro2) {}
        return true;
    }
}

async function responderEtapaCadastroPca({ mensagem, chat, idContato, textoMensagemOriginal }) {
    const sessao = cadastrosPcaEmAndamento.get(idContato);
    if (!sessao) return false;

    const texto = String(textoMensagemOriginal || '').trim();
    if (!texto) {
        await mensagem.reply('Não entendi sua resposta. Tente novamente.');
        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    if (sessao.etapa === 'aguardando_ano') {
        if (!/^\d{4}$/.test(texto)) {
            await mensagem.reply('❌ Informe o Ano do PCA no formato AAAA. Exemplo: 2026');
            try { await chat.markUnread(); } catch (erro) {}
            return true;
        }
        sessao.ano = texto;
        sessao.etapa = 'aguardando_id_pca_pncp';
        cadastrosPcaEmAndamento.set(idContato, sessao);

        const resposta = 'Perfeito. Agora me envie o:\n\nId pca PNCP:';
        salvarMensagem(idContato, 'assistant', resposta);
        dbSalvarConsulta(idContato, `CadastroPCA etapa ID - ano ${texto}`);
        await mensagem.reply(resposta);
        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    if (sessao.etapa === 'aguardando_id_pca_pncp') {
        sessao.idPcaPncp = texto;
        sessao.etapa = 'aguardando_data_publicacao';
        cadastrosPcaEmAndamento.set(idContato, sessao);

        const resposta = 'Agora me envie a:\n\nData de publicação no PNCP:';
        salvarMensagem(idContato, 'assistant', resposta);
        dbSalvarConsulta(idContato, `CadastroPCA etapa data - ano ${sessao.ano}`);
        await mensagem.reply(resposta);
        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    if (sessao.etapa === 'aguardando_data_publicacao') {
        const resultado = cadastrarPca({
            ano: sessao.ano,
            idPcaPncp: sessao.idPcaPncp,
            dataPublicacaoPncp: texto
        });

        cadastrosPcaEmAndamento.delete(idContato);

        salvarMensagem(idContato, 'assistant', resultado.mensagem);
        dbSalvarConsulta(idContato, `CadastroPCA concluído ${sessao.ano}`);
        await mensagem.reply(resultado.mensagem);
        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    return false;
}

// ==========================================
// FUNÇÃO DE MÁQUINA DE ESTADOS DO CADASTRO PDM
// ==========================================
async function responderEtapaCadastroPdm({ mensagem, chat, idContato, textoMensagemOriginal }) {
    const sessao = cadastrosPdmEmAndamento.get(idContato);
    if (!sessao) return false;

    const texto = String(textoMensagemOriginal || '').trim();
    if (!texto) {
        await mensagem.reply('Não entendi sua resposta. Tente novamente.');
        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    // ETAPA 1: SALVA O CÓDIGO INCA
    if (sessao.etapa === 'aguardando_codigo_inca') {
        sessao.codigoInca = texto.toUpperCase();
        sessao.etapa = 'aguardando_codigo_sidec';
        cadastrosPdmEmAndamento.set(idContato, sessao);

        const resposta = 'Perfeito. Agora me envie o *Código SIDEC* exato desse item para que eu possa consultar o painel do Governo Federal:';
        salvarMensagem(idContato, 'assistant', resposta);
        dbSalvarConsulta(idContato, `CadastroPDM etapa SIDEC - INCA ${texto}`);
        await mensagem.reply(resposta);
        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    // ETAPA 2: FAZ A MÁGICA COM O SIDEC E SALVA NO BANCO
    if (sessao.etapa === 'aguardando_codigo_sidec') {
        const sidec = texto;
        cadastrosPdmEmAndamento.delete(idContato); // Limpa a sessão

        await mensagem.reply(`⏳ Consultando o SIDEC ${sidec} no Compras.gov.br...`);

        try {
            const infoApi = await analisarItemSidec(sidec);
            let codigoPdm = null;
            let descricaoFamilia = '';

            // Se achou o PDM ativo original ou substituto
            if (infoApi.original && infoApi.original.codigoPdm) {
                codigoPdm = infoApi.original.codigoPdm;
                descricaoFamilia = infoApi.original.nomePdm || infoApi.original.descricaoItem || '';
            } else if (infoApi.substituto && infoApi.substituto.codigoPdm) {
                codigoPdm = infoApi.substituto.codigoPdm;
                descricaoFamilia = infoApi.substituto.nomePdm || infoApi.substituto.descricaoItem || '';
            }

            if (!codigoPdm) {
                const erroMsg = `❌ Não encontrei um PDM válido para o SIDEC ${sidec} na API do governo. Tente novamente com outro código ou verifique se o SIDEC está correto.`;
                salvarMensagem(idContato, 'assistant', erroMsg);
                await mensagem.reply(erroMsg);
                return true;
            }

            // Grava no banco de dados local da Hera (Inserindo ou Atualizando a linha)
            const resultadoUpsert = await upsertItemPdm(sessao.codigoInca, codigoPdm, descricaoFamilia);
            
            const acaoTxt = resultadoUpsert.acao === 'inserido' ? 'vinculado' : 'atualizado';
            const sucessoMsg = `✅ Sucesso! O item *${sessao.codigoInca}* foi ${acaoTxt} ao PDM *${codigoPdm}* (${descricaoFamilia}) no banco de dados.\n\nVocê já pode usar o comando *PDM ${sessao.codigoInca}* para puxar o relatório executivo.`;
            
            salvarMensagem(idContato, 'assistant', sucessoMsg);
            dbSalvarConsulta(idContato, `CadastroPDM concluído: INCA ${sessao.codigoInca} -> PDM ${codigoPdm}`);
            await mensagem.reply(sucessoMsg);

        } catch (error) {
            console.error('Erro no Cadastro PDM:', error);
            await mensagem.reply('❌ Ocorreu um erro interno ao tentar cadastrar o PDM. Verifique os logs do servidor.');
        }

        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    return false;
}

// ==========================================
// FUNÇÃO DE MÁQUINA DE ESTADOS DO GERAR ATAS
// ==========================================
async function responderEtapaGerarAtas({ mensagem, chat, idContato, textoMensagemOriginal }) {
    const sessao = geracaoAtasEmAndamento.get(idContato);
    if (!sessao) return false;

    const texto = String(textoMensagemOriginal || '').trim();
    if (!texto) {
        await mensagem.reply('Não entendi sua resposta. Tente novamente.');
        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    if (sessao.etapa === 'aguardando_periodo') {
        const periodo = texto;
        geracaoAtasEmAndamento.delete(idContato);

        await mensagem.reply(`⏳ Entendido! Gerando a planilha de atas para o período: *${periodo}*... Isso pode levar alguns instantes, pois estou aplicando a formatação condicional.`);

        try {
            const resultado = await gerarPlanilhaAtas(periodo);

            if (resultado.erro) {
                await mensagem.reply(`❌ ${resultado.erro}`);
            } else if (resultado.arquivo) {
                const mediaXlsx = MessageMedia.fromFilePath(resultado.arquivo);
                await chat.sendMessage(mediaXlsx, { caption: `✅ Planilha de Atas gerada com sucesso para o período: ${periodo}` });
                try { fs.unlinkSync(resultado.arquivo); } catch (e) {}
            }
        } catch (error) {
            console.error('Erro na geração de atas:', error);
            await mensagem.reply('❌ Ocorreu um erro interno ao gerar a planilha.');
        }

        try { await chat.markUnread(); } catch (erro) {}
        return true;
    }

    return false;
}

// ==========================================
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO
// ==========================================
async function processarMensagemRecebida({ client, mensagem: msgRaw, tempoInicio }) {
    try {
        if (!msgRaw || !msgRaw.message) return;

        const msgTimestamp = msgRaw.messageTimestamp;
        if (msgTimestamp < tempoInicio) return;

        const jid = msgRaw.key.remoteJid;
        if (jid === 'status@broadcast') return;

        const ehGrupo = jid.includes('@g.us');
        if (ehGrupo) return;

        const fromMe = msgRaw.key.fromMe;
        
        let textoMensagemOriginal = '';
        const msgObj = msgRaw.message;
        if (msgObj) {
            if (msgObj.conversation) textoMensagemOriginal = msgObj.conversation;
            else if (msgObj.extendedTextMessage?.text) textoMensagemOriginal = msgObj.extendedTextMessage.text;
            else if (msgObj.imageMessage?.caption) textoMensagemOriginal = msgObj.imageMessage.caption;
            else if (msgObj.documentMessage?.caption) textoMensagemOriginal = msgObj.documentMessage.caption;
            else if (msgObj.audioMessage) textoMensagemOriginal = ''; 
        }
        textoMensagemOriginal = String(textoMensagemOriginal || '').trim();

        const idContato = jid.replace('@s.whatsapp.net', '');
        
        let nomeContatoLog = msgRaw.pushName || idContato;
        
        const meuNumero = process.env.MEU_NUMERO ? process.env.MEU_NUMERO.replace(/\D/g, '') : '';

        const chatCustom = {
            sendMessage: async (mediaObj, options) => {
                if (mediaObj && mediaObj.filePath) {
                    const buffer = fs.readFileSync(mediaObj.filePath);
                    const ext = path.extname(mediaObj.filePath).toLowerCase();
                    let mimetype = 'application/octet-stream';
                    if (ext === '.pdf') mimetype = 'application/pdf';
                    else if (ext === '.xlsx') mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    
                    return client.sendMessage(jid, {
                        document: buffer,
                        mimetype: mimetype,
                        fileName: path.basename(mediaObj.filePath),
                        caption: options?.caption || ''
                    });
                }
                return client.sendMessage(jid, { text: String(mediaObj) });
            },
            markUnread: async () => {} 
        };

        const contatoCustom = {
            name: msgRaw.pushName || idContato,
            number: idContato
        };

        const mensagemCustom = {
            id: { _serialized: msgRaw.key.id },
            timestamp: msgTimestamp,
            from: fromMe ? `${meuNumero}@c.us` : `${idContato}@c.us`,
            to: fromMe ? `${idContato}@c.us` : `${meuNumero}@c.us`,
            fromMe: fromMe,
            body: textoMensagemOriginal,
            hasMedia: !!(msgObj?.documentMessage || msgObj?.audioMessage || msgObj?.imageMessage),
            type: msgObj?.documentMessage ? 'document' : (msgObj?.audioMessage ? 'audio' : 'chat'),
            reply: async (texto) => client.sendMessage(jid, { text: texto }, { quoted: msgRaw }),
            delete: async () => client.sendMessage(jid, { delete: msgRaw.key }),
            downloadMedia: async () => {
                try {
                    const buffer = await downloadMediaMessage(msgRaw, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    let filename = `arquivo_${Date.now()}`;
                    if (msgObj?.documentMessage?.fileName) filename = msgObj.documentMessage.fileName;
                    return { data: buffer.toString('base64'), filename, mimetype: msgObj?.documentMessage?.mimetype || msgObj?.audioMessage?.mimetype };
                } catch (e) {
                    console.error("Erro no downloadMedia adaptado:", e);
                    return null;
                }
            },
            getChat: async () => chatCustom,
            getContact: async () => contatoCustom
        };

        const mensagem = mensagemCustom;

        const msgId = mensagem.id && mensagem.id._serialized;
        if (msgId) {
            if (global.mensagensProcessadas.has(msgId)) {
                return;
            }
            global.mensagensProcessadas.add(msgId);
            if (global.mensagensProcessadas.size > 2000) {
                const iter = global.mensagensProcessadas.values();
                for (let i = 0; i < 500; i++) global.mensagensProcessadas.delete(iter.next().value);
            }
        }

        const textoMensagemNormalizado = textoMensagemOriginal.toLowerCase();
        const mensagemFoiEnviadaPorMim = mensagem.fromMe || mensagem.from === process.env.MEU_NUMERO;
        const ehConversaComigoMesmo = mensagemFoiEnviadaPorMimMesmo(idContato, mensagemFoiEnviadaPorMim);
        
        // --- INÍCIO DA ADIÇÃO: TRATAMENTO DA RESPOSTA SIM/NÃO DO ADMIN ---
        const adminNum = String(process.env.NUMERO_ADMIN || '').replace(/\D/g, '');
        const idLimpo = idContato.replace(/\D/g, '');
        
        // Tratamento do 9º dígito
        const isFromAdmin = adminNum && idLimpo.slice(-8) === adminNum.slice(-8);
        
        if (isFromAdmin) {
            const respFlavio = textoMensagemNormalizado.trim();
            if (respFlavio === 'sim' || respFlavio === 'não' || respFlavio === 'nao') {
                const autorizacoes = lerAutorizacoes();
                
                // Pega todos os pendentes do arquivo JSON (protege contra reinicializações do servidor)
                const pendentes = Object.keys(autorizacoes).filter(n => autorizacoes[n] === 'pendente');
                
                if (pendentes.length > 0) {
                    for (const numPendente of pendentes) {
                        if (respFlavio === 'sim') {
                            autorizacoes[numPendente] = 'aprovado';
                            await mensagem.reply(`✅ Acesso aprovado para o número ${numPendente}.`);
                            try {
                                await client.sendMessage(`${numPendente}@s.whatsapp.net`, { 
                                    text: '🎉 *Aviso:* O Flavio acabou de aprovar o seu acesso! Você já pode consultar a Hera livremente.' 
                                });
                            } catch(e) {}
                        } else {
                            autorizacoes[numPendente] = 'negado';
                            await mensagem.reply(`🚫 Acesso negado para o número ${numPendente}.`);
                        }
                    }
                    salvarAutorizacoes(autorizacoes);
                } else {
                    await mensagem.reply('Nenhuma solicitação pendente encontrada no momento.');
                }
                return; // Encerra aqui, não tenta processar comandos da Hera nesta mensagem
            }
        }
        // --- FIM DA ADIÇÃO ---

        if (mensagemFoiEnviadaPorMim && !ehConversaComigoMesmo) {
            if (textoMensagemNormalizado === 'hera, disparar atas' || textoMensagemNormalizado === 'robô, disparar atas') {
                await mensagem.reply('🤖 _Iniciando varredura no estoque para disparar atas..._');
                if (dispararAlertasDeAta) {
                    const respostaDisparo = await dispararAlertasDeAta(client, true, null, idContato);
                    await mensagem.reply(respostaDisparo);
                }
                return;
            }

            if (textoMensagemOriginal === '&') {
                chatsPausados.add(idContato);
                limparPaginacaoBusca(idContato);
                try { await mensagem.delete(true); } catch (erro) {}
                console.log(`🤖 MODO HUMANO: Hera pausada para ${nomeContatoLog}`);
                return;
            }
            if (textoMensagemOriginal === '&&') {
                chatsPausados.delete(idContato);
                try { await mensagem.delete(true); } catch (erro) {}
                console.log(`🤖 MODO IA: Hera reativada para ${nomeContatoLog}`);
                return;
            }

            return;
        }

        if (!mensagemFoiEnviadaPorMim && chatsPausados.has(idContato)) {
            return;
        }

        let contato, chat;
        try {
            contato = await mensagem.getContact();
            chat = await mensagem.getChat();
            
            if (contato && contato.name) {
                nomeContatoLog = contato.name; 
            }
        } catch (erroExtracao) {
            console.error('Falha ao obter a instância do chat ou contato:', erroExtracao);
            return;
        }

        if (mensagem.hasMedia && mensagem.type === 'document') {
            if (atualizacoesDbEmAndamento.has(idContato)) {
                const foiTratadoDb = await processarArquivoDbWhatsApp({ mensagem, chat, idContato });
                if (foiTratadoDb) return;
            }

            const mediaInfo = await mensagem.downloadMedia().catch(() => null);

            if (mediaInfo && extensaoPareceExcel(mediaInfo.filename || '')) {
                const foiTratadoExcel = await processarDocumentoExcelWhatsApp({ mensagem, chat, idContato });
                if (foiTratadoExcel) return;
            }
            
            if (mediaInfo && extensaoPareceDocumentoAnalise(mediaInfo.filename || '')) {
                const foiTratadoDocumento = await processarDocumentoAnaliseWhatsApp({ mensagem, chat, idContato });
                if (foiTratadoDocumento) return;
            }
        }

        if (mensagem.hasMedia && (mensagem.type === 'audio' || mensagem.type === 'ptt')) {
            const media = await mensagem.downloadMedia().catch(() => null);
            if (media) {
                const textoTranscrito = await transcreverAudio(media.data).catch(() => null);
                if (respostaPossuiTextoValido(textoTranscrito)) {
                    textoMensagemOriginal = textoTranscrito;
                    await mensagem.reply(`🗣️ *Transcrição do áudio:*\n_${textoTranscrito}_`);
                } else {
                    try { await chat.markUnread(); } catch (erro) {}
                    return;
                }
            } else {
                return;
            }
        }

        if (!textoMensagemOriginal) {
            return;
        }

        const textoLimpoExato = textoMensagemOriginal.trim();
        const textoLimpoExatoLower = textoLimpoExato.toLowerCase();

        // === TRAVA DE PROCESSAMENTO DE MQO (Aviso Único) ===
        if (global.calculandoMQO) {
            if (!global.avisadosMQO) global.avisadosMQO = new Set();
            
            // Só avisa se ainda não avisou esse usuário nessa rodada de cálculo
            if (!global.avisadosMQO.has(idContato)) {
                global.avisadosMQO.add(idContato);
                await mensagem.reply('⏳ *Hera:* Estou processando uma grande carga de dados (Matriz de Risco). Coloquei o seu comando na fila e te respondo em instantes!');
            }
            
            // Segura o processamento dessa mensagem até a matriz terminar
            while (global.calculandoMQO) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Limpa o aviso quando a matriz terminar para liberar as próximas execuções
            global.avisadosMQO.delete(idContato);
        }
        // ======================================

        // ==========================================
        // COMANDO: CANCELAR OPERAÇÕES
        // ==========================================
        if (/^(cancelar|sair|parar)$/i.test(textoLimpoExatoLower)) {
            let cancelado = false;
            if (atualizacoesDbEmAndamento.has(idContato)) {
                atualizacoesDbEmAndamento.delete(idContato);
                cancelado = true;
            }
            if (cadastrosPcaEmAndamento.has(idContato)) {
                cadastrosPcaEmAndamento.delete(idContato);
                cancelado = true;
            }
            if (cadastrosPdmEmAndamento.has(idContato)) {
                cadastrosPdmEmAndamento.delete(idContato);
                cancelado = true;
            }
            if (sessoesAjuda.has(idContato)) {
                sessoesAjuda.delete(idContato);
                cancelado = true;
            }
            if (geracaoAtasEmAndamento.has(idContato)) {
                geracaoAtasEmAndamento.delete(idContato);
                cancelado = true;
            }
            
            if (cancelado) {
                await mensagem.reply('✅ Operação cancelada com sucesso.');
                try { await chat.markUnread(); } catch (e) {}
                return;
            }
        }

        // ==========================================
        // COMANDO: AJUDA (MÁQUINA DE ESTADOS COM CACHE)
        // ==========================================
        if (textoLimpoExatoLower === 'ajuda') {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const documentos = listarDocumentosDisponiveis();
            if (documentos.length === 0) {
                await mensagem.reply('Não encontrei nenhum documento na pasta base no momento.');
                try { await chat.markUnread(); } catch (e) {}
                return;
            }

            let menu = 'Em qual assunto você quer ajuda?\n\n';
            documentos.forEach(doc => {
                menu += `${doc.id} - ${doc.titulo}\n`;
            });

            sessoesAjuda.set(idContato, { etapa: 'aguardando_numero' });
            
            salvarMensagem(idContato, 'assistant', menu);
            await mensagem.reply(menu);
            try { await chat.markUnread(); } catch (e) {}
            return;
        }

        // ==========================================
        // COMANDO: TESTE ALERTA DIPAT
        // ==========================================
        if (textoLimpoExatoLower === 'teste dipat') {
            const { gerarRelatorioAlertasDipat } = require('../services/alertaDipat');
            const remetente = msgRaw.key.remoteJid;

            await client.sendMessage(remetente, { text: '⏳ *Hera:* Iniciando varredura da grade e cálculo do MQO para o alerta DIPAT. Como a grade é grande, isso pode levar alguns segundos...' });
            
            const resultado = await gerarRelatorioAlertasDipat();
            
            if (resultado.erro) {
                await client.sendMessage(remetente, { text: `❌ Erro ao gerar o alerta: ${resultado.erro}` });
                return;
            }

            let envios = 0;
            const fsLocal = require('fs');
            const bufferExcel = fsLocal.readFileSync(resultado.filePath);

            for (const dest of resultado.destinatarios) {
                const numeroLimpo = String(dest.telefone).replace(/\D/g, '');
                if (numeroLimpo) {
                    const numeroWpp = numeroLimpo + '@s.whatsapp.net';
                    try {
                        await client.sendMessage(numeroWpp, { text: `Olá, ${dest.nome}!\n\n${resultado.mensagem}` });
                        await client.sendMessage(numeroWpp, {
                            document: bufferExcel,
                            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            fileName: `Alerta_DIPAT_${new Date().toISOString().split('T')[0]}.xlsx`,
                            caption: '📊 Relatório Completo DIPAT (Grade e Tendências)'
                        });
                        envios++;
                    } catch(e) {
                        console.error(`Erro ao enviar alerta para ${numeroWpp}`, e);
                    }
                }
            }
            
            await client.sendMessage(remetente, { text: `✅ Concluído! O Alerta DIPAT foi gerado e disparado com sucesso para ${envios} contato(s).` });
            return;
        }

        if (sessoesAjuda.has(idContato)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            const sessao = sessoesAjuda.get(idContato);

            if (sessao.etapa === 'aguardando_numero') {
                const docSelecionado = obterDocumentoPorId(textoLimpoExato);
                
                if (!docSelecionado) {
                    const erroMsg = 'Opção inválida. Por favor, digite apenas o número correspondente à opção desejada.';
                    salvarMensagem(idContato, 'assistant', erroMsg);
                    await mensagem.reply(erroMsg);
                    try { await chat.markUnread(); } catch (e) {}
                    return;
                }

                sessao.etapa = 'aguardando_duvida';
                sessao.documento = docSelecionado;
                sessoesAjuda.set(idContato, sessao);

                const pergMsg = `Qual a tua dúvida sobre ${docSelecionado.titulo}?`;
                salvarMensagem(idContato, 'assistant', pergMsg);
                await mensagem.reply(pergMsg);
                try { await chat.markUnread(); } catch (e) {}
                return;
            }

            if (sessao.etapa === 'aguardando_duvida') {
                await inicializarTabelaFaq().catch(e => console.error("Erro ao iniciar tabela FAQ:", e));
                await mensagem.reply(`⏳ Consultando sua dúvida sobre "${sessao.documento.titulo}"...`);
                
                try {
                    const perguntasSalvas = await buscarFaqPorDocumento(sessao.documento.titulo);
                    const respostaDoCache = await triagemPerguntaSimilar(textoMensagemOriginal, perguntasSalvas);

                    if (respostaDoCache) {
                        const respostaFinal = `⚡ (Respondido da memória)\n\n${respostaDoCache}`;
                        salvarMensagem(idContato, 'assistant', respostaFinal);
                        dbSalvarConsulta(idContato, `Ajuda Cache: ${sessao.documento.titulo}`);
                        await mensagem.reply(respostaFinal);
                    } else {
                        await mensagem.reply('🧠 Lendo o documento profundamente para gerar a resposta. Um momento...');
                        const respostaOllama = await consultarOllamaDocumento(textoMensagemOriginal, sessao.documento.caminho);
                        
                        salvarMensagem(idContato, 'assistant', respostaOllama);
                        dbSalvarConsulta(idContato, `Ajuda Nova: ${sessao.documento.titulo}`);
                        await mensagem.reply(respostaOllama);

                        const repostaSemErro = !respostaOllama.includes('Não foi possível conectar') && 
                                               !respostaOllama.includes('Desculpe, não encontrei');
                        
                        if (repostaSemErro) {
                            await salvarFaq(sessao.documento.titulo, textoMensagemOriginal, respostaOllama).catch(e => console.error("Erro ao salvar FAQ", e));
                        }
                    }
                } catch (erro) {
                    console.error('Erro ao processar Ajuda:', erro);
                    const erroIamsg = '❌ Ocorreu um erro interno ao processar sua dúvida com a Inteligência Artificial.';
                    salvarMensagem(idContato, 'assistant', erroIamsg);
                    await mensagem.reply(erroIamsg);
                }

                sessoesAjuda.delete(idContato);
                try { await chat.markUnread(); } catch (e) {}
                return;
            }
        }

        // ==========================================
        // COMANDO: TESTE DISPARO DE ATAS DIRECIONADO
        // ==========================================
        const matchTesteAtas = textoLimpoExatoLower.match(/^teste\s+disparar\s+atas(?:\s+planejamento)?\s+(.+)$/i);
        if (matchTesteAtas) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            const nomePlanejador = matchTesteAtas[1].trim();
            console.log(`🤖 Comando TESTE DISPARAR ATAS detectado para ${nomeContatoLog}: ${nomePlanejador}`);
            await mensagem.reply(`🤖 _Iniciando teste DIRECIONADO de disparo de atas para o planejador: *${nomePlanejador}*..._`);

            if (dispararAlertasDeAta) {
                const respostaDisparo = await dispararAlertasDeAta(client, true, nomePlanejador, idContato);
                salvarMensagem(idContato, 'assistant', respostaDisparo);
                dbSalvarConsulta(idContato, `Teste Disparo Atas: ${nomePlanejador}`);
                
                if (typeof respostaDisparo === 'string') {
                    await mensagem.reply(respostaDisparo);
                }
            }
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (cadastrosPcaEmAndamento.has(idContato)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            const foiTratadoCadastroPca = await responderEtapaCadastroPca({
                mensagem,
                chat,
                idContato,
                textoMensagemOriginal
            });
            if (foiTratadoCadastroPca) return;
        }

        // ==========================================
        // FLUXO DO UPSERT (CADASTRAR OU ATUALIZAR) PDM
        // ==========================================
        if (cadastrosPdmEmAndamento.has(idContato)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            const foiTratadoCadastroPdm = await responderEtapaCadastroPdm({
                mensagem,
                chat,
                idContato,
                textoMensagemOriginal
            });
            if (foiTratadoCadastroPdm) return;
        }

        // ==========================================
        // FLUXO DO GERAR ATAS
        // ==========================================
        if (geracaoAtasEmAndamento.has(idContato)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            const foiTratadoGerarAtas = await responderEtapaGerarAtas({
                mensagem,
                chat,
                idContato,
                textoMensagemOriginal
            });
            if (foiTratadoGerarAtas) return;
        }
        
        // ==========================================
        // FLUXO DE ATUALIZAÇÃO DE DB (EMPENHOS / SALDO)
        // ==========================================
        if (/^atualizar\s+empenhos$/i.test(textoLimpoExatoLower)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                return;
            }

            atualizacoesDbEmAndamento.set(idContato, { tipo: 'empenhos' });
            const resposta = 'Comando recebido! 📥 Por favor, envie a planilha de *Empenhos* (.xlsx ou .csv) em anexo nesta conversa.\n\n_(Para cancelar, digite "cancelar")_';
            salvarMensagem(idContato, 'assistant', resposta);
            dbSalvarConsulta(idContato, 'Início Atualizar Empenhos');
            await mensagem.reply(resposta);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (/^atualizar\s+saldo$/i.test(textoLimpoExatoLower)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                return;
            }

            atualizacoesDbEmAndamento.set(idContato, { tipo: 'saldo' });
            const resposta = 'Comando recebido! 📥 Por favor, envie a planilha de *Saldo (Abaixo de 90 dias)* (.xlsx ou .csv) em anexo nesta conversa.\n\n_Obs: Ela será processada e registrada com a data de hoje no histórico de tendências. (Para cancelar, digite "cancelar")_';
            salvarMensagem(idContato, 'assistant', resposta);
            dbSalvarConsulta(idContato, 'Início Atualizar Saldo');
            await mensagem.reply(resposta);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        // Disparador do Cadastro PDM
        if (/^(cadastro|cadastrar|atualizar)\s+pdm$/i.test(textoMensagemOriginal)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'CadastroPDM negado sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            cadastrosPdmEmAndamento.set(idContato, {
                etapa: 'aguardando_codigo_inca',
                codigoInca: ''
            });

            const resposta = 'Certo! Vamos cadastrar ou atualizar um PDM no banco da Hera.\n\nPor favor, me envie o *Código INCA* do item (Ex: A01485 ou 1509):';
            salvarMensagem(idContato, 'assistant', resposta);
            dbSalvarConsulta(idContato, 'Início CadastroPDM');
            await mensagem.reply(resposta);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        // Disparador do Gerar Atas
        if (/^gerar\s+atas$/i.test(textoLimpoExatoLower)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                return;
            }

            geracaoAtasEmAndamento.set(idContato, {
                etapa: 'aguardando_periodo'
            });

            const resposta = 'Certo! Vamos gerar a planilha de atas.\n\nPor favor, me informe o *período* desejado para a geração do arquivo:';
            salvarMensagem(idContato, 'assistant', resposta);
            dbSalvarConsulta(idContato, 'Início Gerar Atas');
            await mensagem.reply(resposta);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        // ==========================================
        // COMANDO: PDM (GERAR RELATÓRIO PDF)
        // ==========================================
        const matchPdm = textoMensagemOriginal.match(/^pdm\s+([a-zA-Z0-9.-]+)$/i);
        if (matchPdm) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - PDM sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            const codigoBusca = matchPdm[1].trim().toUpperCase();
            console.log(`🤖 Comando PDM detectado para ${nomeContatoLog}: ${codigoBusca}`);
            await mensagem.reply(`🔎 Analisando o catálogo SIDEC e levantando o consumo da Dispensa 75-II para o item *${codigoBusca}*. Um momento...`);

            try {
                const relatorioPdm = await orquestrarConsultaPdm(codigoBusca);
                
                if (relatorioPdm.erro) {
                    await mensagem.reply(`❌ ${relatorioPdm.erro}\n\n*Dica:* Use o comando "Cadastro PDM" para forçar a inserção manual se o erro persistir.`);
                    salvarMensagem(idContato, 'assistant', relatorioPdm.erro);
                } else {
                    const pdfBuffer = await gerarRelatorioPdfPdm(relatorioPdm.resultados, codigoBusca);
                    
                    const tempPdfPath = path.join(os.tmpdir(), `Relatorio_PDM_${codigoBusca}_${Date.now()}.pdf`);
                    fs.writeFileSync(tempPdfPath, pdfBuffer);
                    
                    const mediaPDF = MessageMedia.fromFilePath(tempPdfPath);
                    await chat.sendMessage(mediaPDF, { caption: relatorioPdm.mensagemResumo });
                    
                    try { fs.unlinkSync(tempPdfPath); } catch (e) {}
                    salvarMensagem(idContato, 'assistant', 'PDF do PDM enviado com sucesso.');
                }
            } catch (erroPdm) {
                console.error('Erro ao processar PDM:', erroPdm);
                await mensagem.reply('❌ Ocorreu um erro interno ao gerar o relatório PDM. Tente novamente mais tarde.');
            }

            dbSalvarConsulta(idContato, `Consulta PDM: ${codigoBusca}`);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (textoEhPedidoDeAnaliseDocumento(textoMensagemOriginal)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            
            const documentoAtual = obterUltimoDocumento(idContato);
            if (!documentoAtual) {
                const resposta = 
                    'Eu ainda não tenho nenhum documento recente seu para analisar.\n\n' +
                    'Envie primeiro um PDF ou TXT e depois me peça a análise com base na Lei 14.133.';
                salvarMensagem(idContato, 'assistant', resposta);
                dbSalvarConsulta(idContato, 'Tentativa de análise sem documento');
                await mensagem.reply(resposta);
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            await mensagem.reply(
                `🔎 Recebi seu pedido. Vou analisar o documento ${documentoAtual.nomeArquivo} com base na Lei 14.133 e na base da pasta contrato.\n` +
                `Se o arquivo for grande, isso pode levar um pouco mais de tempo.`
            );

            let respostaAnalise = '';
            try {
                respostaAnalise = await analisarDocumentoComBaseLegal({
                    perguntaUsuario: textoMensagemOriginal,
                    textoDocumento: documentoAtual.textoExtraido,
                    nomeDocumento: documentoAtual.nomeArquivo
                });
            } catch (erro) {
                console.error('🔴 Erro ao analisar documento do usuário:', erro);
                respostaAnalise = '❌ Eu recebi o documento, mas ocorreu um erro ao tentar analisá-lo agora.';
            }

            salvarMensagem(idContato, 'assistant', respostaAnalise);
            dbSalvarConsulta(idContato, `Análise documental: ${documentoAtual.nomeArquivo}`);
            await mensagem.reply(respostaAnalise);
            
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (ehComandoCadastroPca(textoMensagemOriginal)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const podeCadastrar = await contatoPodeCadastrarPca(idContato, mensagemFoiEnviadaPorMim, nomeContatoLog, client);
            if (!podeCadastrar) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'CadastroPCA negado sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            cadastrosPcaEmAndamento.set(idContato, {
                etapa: 'aguardando_ano',
                ano: '',
                idPcaPncp: ''
            });

            const resposta = 'Vamos cadastrar um PCA.\n\nMe envie o Ano do PCA:';
            salvarMensagem(idContato, 'assistant', resposta);
            dbSalvarConsulta(idContato, 'Início CadastroPCA');
            await mensagem.reply(resposta);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (ehComandoAtualizarCatalogoSidec(textoMensagemOriginal)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            await mensagem.reply('⏳ Atualizando manualmente o catálogo SIDEC. Isso pode levar alguns minutos...');
            const resultadoAtualizacao = await atualizarCatalogoSidecAtivo();

            if (resultadoAtualizacao?.sucesso) {
                const resposta = 
                    `✅ Catálogo SIDEC atualizado com sucesso.\n\n` +
                    `Itens gravados: ${resultadoAtualizacao.totalInseridos}\n` +
                    `Suspensos/Não utilizáveis ignorados: ${resultadoAtualizacao.totalSuspensosIgnorados}`;
                salvarMensagem(idContato, 'assistant', resposta);
                dbSalvarConsulta(idContato, 'Atualização manual catálogo SIDEC');
                await mensagem.reply(resposta);
            } else {
                const resposta = 
                    `❌ Falha ao atualizar o catálogo SIDEC.\n` +
                    `Erro: ${resultadoAtualizacao?.erro || 'desconhecido'}`;
                salvarMensagem(idContato, 'assistant', resposta);
                dbSalvarConsulta(idContato, 'Falha atualização catálogo SIDEC');
                await mensagem.reply(resposta);
            }
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const codigoDebugSidec = extrairCodigoDoComandoDebugSidec(textoMensagemOriginal);
        if (codigoDebugSidec) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            await mensagem.reply(`🔎 Gerando debug do SIDEC ${codigoDebugSidec}...`);
            const respostaDebug = await debugCodigoSidecMaterial(codigoDebugSidec);
            
            salvarMensagem(idContato, 'assistant', respostaDebug);
            dbSalvarConsulta(idContato, `Debug SIDEC ${codigoDebugSidec}`);
            await mensagem.reply(respostaDebug);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const comandoBloquear = extrairComandoBloquearSidec(textoMensagemOriginal);
        if (comandoBloquear) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const resultado = bloquearCodigoSidec(comandoBloquear.codigo, comandoBloquear.motivo);
            
            salvarMensagem(idContato, 'assistant', resultado.mensagem);
            dbSalvarConsulta(idContato, `Bloquear SIDEC ${comandoBloquear.codigo}`);
            await mensagem.reply(resultado.mensagem);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const codigoDesbloquear = extrairComandoDesbloquearSidec(textoMensagemOriginal);
        if (codigoDesbloquear) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const resultado = desbloquearCodigoSidec(codigoDesbloquear);

            salvarMensagem(idContato, 'assistant', resultado.mensagem);
            dbSalvarConsulta(idContato, `Desbloquear SIDEC ${codigoDesbloquear}`);
            await mensagem.reply(resultado.mensagem);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (ehComandoListarBloqueiosSidec(textoMensagemOriginal)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const bloqueios = listarBloqueiosSidec();
            let resposta = '';

            if (!bloqueios.length) {
                resposta = 'Nenhum código SIDEC bloqueado manualmente no momento.';
            } else {
                resposta = `⛔ *Bloqueios manuais SIDEC (${bloqueios.length})*\n\n`;
                bloqueios.forEach(item => {
                    resposta += `- *${item.codigo}* — ${item.motivo}\n`;
                });
            }

            salvarMensagem(idContato, 'assistant', resposta);
            dbSalvarConsulta(idContato, 'Listar bloqueios SIDEC');
            await mensagem.reply(resposta);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const termoAdesao = extrairComandoAdesao(textoMensagemOriginal);
        if (termoAdesao) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - adesão sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            console.log(`🤖 Comando ADESÃO detectado para ${nomeContatoLog}: ${termoAdesao}`);
            await mensagem.reply(`🔎 Buscando possíveis atas federais vigentes para adesão: *${termoAdesao}*. Isso pode demorar um pouco...`);
            
            const respostaAdesao = await consultarAdesoesAta(termoAdesao);
            
            salvarMensagem(idContato, 'assistant', respostaAdesao);
            dbSalvarConsulta(idContato, `Adesão: ${termoAdesao}`);
            await mensagem.reply(respostaAdesao);

            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const comandoDfd = extrairComandoDfd(textoMensagemOriginal);
        if (comandoDfd) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - DFD sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            console.log(`🤖 Comando DFD detectado para ${nomeContatoLog}: ${comandoDfd}`);
            const respostaDfd = await consultarDfd(comandoDfd);
            
            salvarMensagem(idContato, 'assistant', respostaDfd);
            dbSalvarConsulta(idContato, `DFD: ${comandoDfd}`);
            await mensagem.reply(respostaDfd);

            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (/^listar\s+itens$/i.test(textoMensagemOriginal)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - listar itens sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            console.log(`🤖 Comando LISTAR ITENS detectado para ${nomeContatoLog}`);
            await mensagem.reply('📊 Iniciando o levantamento analítico do estoque. Isso envolve o cruzamento de atas, empenhos e a geração de insights com IA. O PDF executivo será enviado em alguns instantes...');

            try {
                const resultadoRelatorio = await gerarRelatorioEstoque(idContato);

                if (resultadoRelatorio.erro) {
                    await mensagem.reply(`❌ ${resultadoRelatorio.erro}`);
                    salvarMensagem(idContato, 'assistant', resultadoRelatorio.erro);
                } else {
                    const mediaPDF = MessageMedia.fromFilePath(resultadoRelatorio.pdfPath);
                    await chat.sendMessage(mediaPDF, { caption: resultadoRelatorio.mensagemResumo || '✅ Relatório Executivo gerado com sucesso!' });
                    
                    try { fs.unlinkSync(resultadoRelatorio.pdfPath); } catch (e) {}

                    salvarMensagem(idContato, 'assistant', 'PDF de Análise de Estoque enviado.');
                }
            } catch (erro) {
                console.error('Erro ao gerar relatório de estoque:', erro);
                await mensagem.reply('❌ Ocorreu um erro interno ao gerar o relatório analítico.');
            }

            dbSalvarConsulta(idContato, 'Listar itens');
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const codigosParaPDF = extrairComandoCriarPDF(textoMensagemOriginal);
        if (codigosParaPDF.length > 0) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - criar PDF sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            console.log(`🤖 Comando CriarPDF detectado para ${nomeContatoLog}: ${codigosParaPDF.join(', ')}`);
            await mensagem.reply(`📄 Preparando relatório executivo em PDF para ${codigosParaPDF.length} item(ns). Isso pode levar alguns instantes...`);

            const dadosParaPDF = [];
            for (const codigo of codigosParaPDF) {
                const dadosItem = await obterDadosBrutosItem(codigo);
                if (dadosItem) {
                    dadosParaPDF.push(dadosItem);
                }
            }

            if (dadosParaPDF.length === 0) {
                const erroMsg = '❌ Não encontrei dados válidos para os códigos informados na planilha.';
                salvarMensagem(idContato, 'assistant', erroMsg);
                await mensagem.reply(erroMsg);
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            try {
                const pdfPath = await gerarPDFItens(dadosParaPDF);
                const mediaPDF = MessageMedia.fromFilePath(pdfPath);
                
                await chat.sendMessage(mediaPDF, { caption: '✅ Relatório Executivo gerado com sucesso!' });
                
                try { fs.unlinkSync(pdfPath); } catch (e) {}

                salvarMensagem(idContato, 'assistant', 'PDF Executivo enviado.');
                dbSalvarConsulta(idContato, `CriarPDF: ${codigosParaPDF.join(', ')}`);
            } catch (erroPdf) {
                console.error('Erro ao gerar PDF:', erroPdf);
                await mensagem.reply('❌ Ocorreu um erro interno ao gerar o PDF. Tente novamente mais tarde.');
            }

            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const listaDeItens = extrairListaDeItens(textoMensagemOriginal);
        if (listaDeItens.length > 0) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - lista de itens sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            console.log(`🤖 Lista de itens detectada para ${nomeContatoLog}: ${listaDeItens.join(', ')}`);
            const resultados = await buscarItensEmLote(listaDeItens, idContato);

            for (const resultado of resultados) {
                let respostaBusca = resultado.resposta;
                if (!respostaPossuiTextoValido(respostaBusca)) {
                    respostaBusca = `Não consegui localizar resultados para "${resultado.codigo}" na planilha.`;
                }

                salvarMensagem(idContato, 'assistant', respostaBusca);
                dbSalvarConsulta(idContato, `Buscar lista: ${resultado.codigo}`);
                await mensagem.reply(respostaBusca);
                await new Promise(resolve => setTimeout(resolve, 700));
            }
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const termoDoComandoMaisRef = extrairComandoMaisBusca(textoMensagemOriginal);
        const estadoPaginacao = obterPaginacaoBusca(idContato);

        if (termoDoComandoMaisRef && estadoPaginacao) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            
            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - mais busca sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            const termoNormalizadoMais = termoDoComandoMaisRef.trim().toLowerCase();
            let proximaPagina = 2;

            if (estadoPaginacao.termo === termoNormalizadoMais) {
                proximaPagina = Number(estadoPaginacao.paginaAtual || 1) + 1;
            }

            console.log(`🤖 Comando MAIS detectado para ${nomeContatoLog}: ${termoDoComandoMaisRef} (página ${proximaPagina})`);

            let respostaBusca = await buscarItem(termoDoComandoMaisRef, proximaPagina, idContato);

            if (!respostaPossuiTextoValido(respostaBusca)) {
                respostaBusca = `Não consegui localizar resultados para "${termoDoComandoMaisRef}" na planilha.`;
            }

            if (/não há mais resultados/i.test(respostaBusca)) {
                limparPaginacaoBusca(idContato);
            } else {
                salvarPaginacaoBusca(idContato, termoDoComandoMaisRef, proximaPagina);
            }

            salvarMensagem(idContato, 'assistant', respostaBusca);
            dbSalvarConsulta(idContato, `Mais busca: ${termoDoComandoMaisRef} (página ${proximaPagina})`);
            
            await mensagem.reply(respostaBusca);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const termoDoComandoBuscar = extrairComandoBuscar(textoMensagemOriginal);
        if (termoDoComandoBuscar) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            
            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - buscar sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            console.log(`🤖 Comando BUSCAR detectado para ${nomeContatoLog}: ${termoDoComandoBuscar}`);

            const codigosDetectados = extrairCodigosDeItens(termoDoComandoBuscar);
            if (codigosDetectados.length > 1) {
                limparPaginacaoBusca(idContato);
                console.log(`🤖 Busca em lote detectada para ${nomeContatoLog}: ${codigosDetectados.join(', ')}`);
                const resultados = await buscarItensEmLote(codigosDetectados, idContato);

                for (const resultado of resultados) {
                    let respostaBusca = resultado.resposta;
                    if (!respostaPossuiTextoValido(respostaBusca)) {
                        respostaBusca = `Não consegui localizar resultados para "${resultado.codigo}" na planilha.`;
                    }

                    salvarMensagem(idContato, 'assistant', respostaBusca);
                    dbSalvarConsulta(idContato, `Buscar lote: ${resultado.codigo}`);
                    await mensagem.reply(respostaBusca);
                    await new Promise(resolve => setTimeout(resolve, 700));
                }
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            let respostaBusca = await buscarItem(termoDoComandoBuscar, 1, idContato);

            if (!respostaPossuiTextoValido(respostaBusca)) {
                respostaBusca = `Não consegui localizar resultados para "${termoDoComandoBuscar}" na planilha.`;
            }

            if (/Envie "mais /i.test(respostaBusca)) {
                salvarPaginacaoBusca(idContato, termoDoComandoBuscar, 1);
            } else {
                limparPaginacaoBusca(idContato);
            }

            salvarMensagem(idContato, 'assistant', respostaBusca);
            dbSalvarConsulta(idContato, `Buscar: ${termoDoComandoBuscar}`);
            
            await mensagem.reply(respostaBusca);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const diasValidadeAtas = extrairComandoValidadeAtas(textoMensagemOriginal);
        if (diasValidadeAtas !== null) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const autorizado = await contatoPodeConsultarPlanilha(idContato, nomeContatoLog, client, ehConversaComigoMesmo);
            if (!autorizado) {
                await mensagem.reply(MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                salvarMensagem(idContato, 'assistant', MENSAGEM_SEM_AUTORIZACAO_CONSULTA);
                dbSalvarConsulta(idContato, 'Consulta negada - validade atas sem autorização');
                try { await chat.markUnread(); } catch (erro) {}
                return;
            }

            const hojeAlvo = new Date();
            hojeAlvo.setHours(0, 0, 0, 0);
            const diasSomados = parseFloat(diasValidadeAtas);
            hojeAlvo.setDate(hojeAlvo.getDate() + diasSomados);
            if (String(diasValidadeAtas).includes('.')) {
                if (hojeAlvo.getDay() === 6) hojeAlvo.setDate(hojeAlvo.getDate() + 2);
                else if (hojeAlvo.getDay() === 0) hojeAlvo.setDate(hojeAlvo.getDate() + 1);
            }
            const dataAlvoStr = hojeAlvo.toLocaleDateString('pt-BR');

            console.log(`🤖 Comando VALIDADE ATAS detectado para ${nomeContatoLog}: ${diasValidadeAtas} dias (a partir de ${dataAlvoStr})`);
            await mensagem.reply(`🔎 Buscando atas na planilha que vencem a partir de ${dataAlvoStr}. Um momento...`);

            const resultadoValidade = await buscarAtasPorVencimento(diasValidadeAtas, idContato);
            
            salvarMensagem(idContato, 'assistant', resultadoValidade.texto);
            dbSalvarConsulta(idContato, `Validade Atas: ${diasValidadeAtas} dias`);
            
            await mensagem.reply(resultadoValidade.texto);

            if (resultadoValidade.arquivo && fs.existsSync(resultadoValidade.arquivo)) {
                const mediaXlsx = MessageMedia.fromFilePath(resultadoValidade.arquivo);
                await chat.sendMessage(mediaXlsx, { caption: '📊 Segue a planilha com os dados das atas extraídas.' });
                try { fs.unlinkSync(resultadoValidade.arquivo); } catch (e) {}
            }

            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        if (/^atualiza\s+atas$/i.test(textoMensagemOriginal)) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            console.log(`🤖 Comando ATUALIZA ATAS detectado para ${nomeContatoLog}`);
            await mensagem.reply(
                '🔄 Iniciando atualização completa das atas desde 2024.\n' +
                'Esse processo pode demorar bastante, pois a Hera vai consultar página por página, sem pressa.'
            );

            try {
                const resultadoAtualizacao = await atualizarTodasAtasDesde2024();
                const respostaFinal = resultadoAtualizacao?.mensagem || '✅ Atualização de atas finalizada.';
                await mensagem.reply(respostaFinal);
                salvarMensagem(idContato, 'assistant', respostaFinal);
            } catch (erro) {
                const respostaErro = 
                    '❌ Ocorreu um erro ao executar a atualização completa das atas.\n' +
                    `Motivo: ${erro.message || erro}`;
                await mensagem.reply(respostaErro);
                salvarMensagem(idContato, 'assistant', respostaErro);
            }

            dbSalvarConsulta(idContato, 'Atualização completa de atas');
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const matchAtasAno = textoMensagemOriginal.match(/^atas\s+(\d{4})$/i);
        if (matchAtasAno) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const ano = matchAtasAno[1];
            console.log(`🤖 Comando ATAS detectado para ${nomeContatoLog}: Ano ${ano}`);
            
            await mensagem.reply(`🔎 Buscando as Atas de Registro de Preço do ano ${ano}...`);
            const resultadoAtas = await resumoAtasPorAno(ano);
            
            await mensagem.reply(resultadoAtas.mensagem1);
            salvarMensagem(idContato, 'assistant', resultadoAtas.mensagem1);
            
            if (resultadoAtas.quantidade > 0 && resultadoAtas.mensagem2) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                await mensagem.reply(resultadoAtas.mensagem2);
                salvarMensagem(idContato, 'assistant', resultadoAtas.mensagem2);
            }

            dbSalvarConsulta(idContato, `Atas Ano ${ano}`);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const matchMostrarAta = textoMensagemOriginal.match(/^mostrar ata\s+(.+)$/i);
        if (matchMostrarAta) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const numeroAta = matchMostrarAta[1].trim();
            console.log(`🤖 Comando MOSTRAR ATA detectado para ${nomeContatoLog}: ${numeroAta}`);
            
            await mensagem.reply(`🔎 Buscando todas as informações da Ata ${numeroAta}...`);
            const detalhesDaAta = await formatarDetalhesAta(numeroAta);
            
            await mensagem.reply(detalhesDaAta);
            salvarMensagem(idContato, 'assistant', detalhesDaAta);
            dbSalvarConsulta(idContato, `Mostrar Ata ${numeroAta}`);

            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const matchPregoesAno = textoMensagemOriginal.match(/^preg[õo]es\s+(\d{4})$/i);
        if (matchPregoesAno) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            const ano = matchPregoesAno[1];
            console.log(`🤖 Comando RELATÓRIO DE PREGÕES detectado para ${nomeContatoLog}: Ano ${ano}`);
            
            await mensagem.reply(`📊 Iniciando o levantamento de todos os pregões de ${ano}. Isso pode levar alguns minutos...`);
            
            const relatorio = await gerarRelatorioPregoesAno(ano);
            
            if (relatorio.erro) {
                salvarMensagem(idContato, 'assistant', relatorio.erro);
                await mensagem.reply(relatorio.erro);
            } else {
                await mensagem.reply(relatorio.mensagemResumo);
                salvarMensagem(idContato, 'assistant', relatorio.mensagemResumo);

                // --- MODIFICADO PARA SUPORTAR O ENVIO DO EXCEL DE PREGÕES ---
                if (relatorio.arquivo && fs.existsSync(relatorio.arquivo)) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    const mediaXlsx = MessageMedia.fromFilePath(relatorio.arquivo);
                    await chat.sendMessage(mediaXlsx, { caption: '📊 Segue o relatório detalhado em Excel.' });
                    try { fs.unlinkSync(relatorio.arquivo); } catch (e) {}
                } else if (relatorio.mensagemLista) { // fallback
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    await mensagem.reply(relatorio.mensagemLista);
                    salvarMensagem(idContato, 'assistant', relatorio.mensagemLista);
                }
            }

            dbSalvarConsulta(idContato, `Relatório Pregões ${ano}`);
            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        const numeroPregao = extrairNumeroPregao(textoMensagemOriginal);
        if (numeroPregao) {
            salvarMensagem(idContato, 'user', textoMensagemOriginal);
            limparPaginacaoBusca(idContato);

            console.log(`🤖 Comando PE detectado para ${nomeContatoLog}: ${numeroPregao}`);
            await mensagem.reply(`🔎 Consultando pregão ${numeroPregao}...`);
            
            const respostaPregao = await consultarItensPregao(numeroPregao);
            
            salvarMensagem(idContato, 'assistant', respostaPregao);
            dbSalvarConsulta(idContato, `Pregão: ${numeroPregao}`);
            await mensagem.reply(respostaPregao);

            try { await chat.markUnread(); } catch (erro) {}
            return;
        }

        limparPaginacaoBusca(idContato);
        console.log(`🤖 Mensagem de ${nomeContatoLog} ignorada (não é um comando reconhecido pela Hera).`);
        try { await chat.markUnread(); } catch (erro) {}
        return;
    } catch (erro) {
        console.error('🔴 Erro geral ao processar mensagem:', erro);
        try {
            if (!msgRaw.key.fromMe) {
                await client.sendMessage(msgRaw.key.remoteJid, { text: '❌ Ocorreu um erro interno ao processar o comando solicitado.' }, { quoted: msgRaw });
            }
        } catch (erroEnvio) {}
    }
}

module.exports = { processarMensagemRecebida };
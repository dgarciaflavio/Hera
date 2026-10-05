const qrcodeLib = require('qrcode');
const cron = require('node-cron');

const { dispararAlertasDeAta } = require('../services/notificacoes');
const { processarMensagemRecebida } = require('./messageProcessor');
const { atualizarCatalogoSidecAtivo } = require('../services/sidecCatalogoUpdater');
const { atualizarCachePregoesSei, sincronizarPregoesInicial } = require('../jobs/atualizadorPregoes');
const { atualizarAtasVigentesMadrugada } = require('../services/api');

const {
    setStatusRobo,
    setQrCodeImagem
} = require('../core/state');

let cronsRegistrados = false;
let eventosRegistrados = false;

function executarCronComProtecao(nome, tarefa) {
    return async () => {
        const inicio = Date.now();

        try {
            console.log(`🕒 [CRON] Iniciando tarefa: ${nome}`);
            const resultado = await tarefa();
            const duracaoMs = Date.now() - inicio;
            console.log(`✅ [CRON] Tarefa finalizada: ${nome} (${duracaoMs} ms)`);
            return resultado;
        } catch (erro) {
            const duracaoMs = Date.now() - inicio;
            console.error(`❌ [CRON] Falha na tarefa: ${nome} (${duracaoMs} ms)`, erro);
            return null;
        }
    };
}

function registrarCrons(client) {
    if (cronsRegistrados) {
        console.warn('⚠️ [CRON] Crons já foram registrados anteriormente. Ignorando novo registro.');
        return;
    }

    cronsRegistrados = true;

    // 1) Disparo automático diário de alertas de atas
    cron.schedule(
        '30 7 * * *',
        executarCronComProtecao('Disparo automático diário de atas', async () => {
            console.log('📢 Hera iniciando disparo automático diário de atas...');
            await dispararAlertasDeAta(client);
        }),
        { scheduled: true, timezone: 'America/Sao_Paulo' }
    );

    // 2) Atualização de atas vigentes/recentes durante a madrugada
    cron.schedule(
        '15 2 * * *',
        executarCronComProtecao('Atualização de atas vigentes', async () => {
            const resultado = await atualizarAtasVigentesMadrugada();
            console.log('🗂️ [CRON] Resultado da atualização de atas vigentes:', resultado);
            return resultado;
        }),
        { scheduled: true, timezone: 'America/Sao_Paulo' }
    );

    // 3) Atualização do catálogo SIDEC
    cron.schedule(
        '0 4 * * *',
        executarCronComProtecao('Atualização noturna do catálogo SIDEC', async () => {
            console.log('🌙 Hera iniciando atualização noturna do catálogo SIDEC...');
            const resultado = await atualizarCatalogoSidecAtivo();
            console.log('🌙 Resultado da atualização do catálogo SIDEC:', resultado);
            return resultado;
        }),
        { scheduled: true, timezone: 'America/Sao_Paulo' }
    );

    // 4) Atualização periódica de pregões e processos SEI (A cada 4 horas)
    cron.schedule(
        '0 */4 * * *',
        executarCronComProtecao('Atualização de base de Pregões e Processos SEI', async () => {
            const resultado = await atualizarCachePregoesSei();
            console.log('🔄 [CRON] Resultado da atualização de Pregões/SEI:', resultado);
            return resultado;
        }),
        { scheduled: true, timezone: 'America/Sao_Paulo' }
    );

    console.log('🗓️ [CRON] Agendamentos registrados com sucesso.');
    console.log('🗓️ [CRON] Atas automáticas (alertas): 07:30 America/Sao_Paulo');
    console.log('🗓️ [CRON] Atas vigentes (cache): 02:15 America/Sao_Paulo');
    console.log('🗓️ [CRON] SIDEC: 04:00 America/Sao_Paulo');
    console.log('🗓️ [CRON] Pregões/SEI: a cada 4 horas, minuto 0, America/Sao_Paulo');
}

function registrarEventosWhatsApp(client) {
    if (eventosRegistrados) {
        console.warn('⚠️ [SISTEMA] Eventos do WhatsApp já registrados anteriormente. Ignorando duplicação.');
        return;
    }
    
    eventosRegistrados = true;

    client.on('qr', async qr => {
        setStatusRobo('Aguardando leitura do QR Code');
        setQrCodeImagem(await qrcodeLib.toDataURL(qr));
    });

    client.on('ready', () => {
        // Força a atualização do status no painel
        setStatusRobo('Online e Pronta!'); 
        setQrCodeImagem(''); 
        
        console.log('Hera está online e pronta para ajudar!');
        sincronizarPregoesInicial().catch(err => {
            console.error('  [INIT] Erro na sincronização inicial:', err);
        });
        registrarCrons(client);
    });

    const tempoInicio = Date.now() / 1000;

    client.on('message_create', async mensagem => {
        try {
            await processarMensagemRecebida({ client, mensagem, tempoInicio });
        } catch (erro) {
            console.error('❌ Erro no processamento de message_create:', erro);
        }
    });
}

module.exports = { registrarEventosWhatsApp };
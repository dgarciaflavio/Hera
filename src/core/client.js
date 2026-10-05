const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

const pino = require('pino');
const EventEmitter = require('events');

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class BaileysWrapper extends EventEmitter {
    constructor() {
        super();
        this.socket = null;

        // 1. MOCK obrigatório para enganar o Painel Web e liberar rotas
        this.info = {
            pushname: 'Hera',
            wid: { user: 'hera', _serialized: 'hera@c.us' }
        };
    }

    async getChats() { return []; }
    async getContacts() { return []; }
    async getState() { return 'CONNECTED'; }
    async getProfilePicUrl(jid) { return ''; }

    async getChatById(chatId) {
        return {
            getContact: async () => ({ name: chatId, number: chatId }),
            fetchMessages: async () => [] 
        };
    }

    async initialize() {
        console.log('🚀 Iniciando o motor da Baileys...');
        await esperar(2000); 

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`🌐 Versão WA Web: ${version.join('.')} (Mais recente: ${isLatest})`);

            // NOME DA PASTA ALTERADO: Garante uma sessão 100% virgem, ignorando arquivos antigos travados
            const { state, saveCreds } = await useMultiFileAuthState('sessao_whatsapp_limpa');
            
            if (state.creds.registered) {
                console.log('📂 Sessão carregada. O número já está emparelhado.');
            } else {
                console.log('📂 Nenhuma sessão anterior encontrada. Iniciando processo de emparelhamento...');
            }

            this.socket = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }), 
                printQRInTerminal: false,
                // O Ubuntu Chrome é a assinatura mais estável para solicitar Códigos de Emparelhamento na Baileys
                browser: ['Ubuntu', 'Chrome', '20.0.04']
            });

            this.socket.ev.on('creds.update', saveCreds);

            this.socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                // O GATILHO SEGURO: Se a API liberou o QR, significa que o soquete está 100% aberto e pronto!
                if (qr) {
                    this.emit('qr', qr);
                    
                    if (!state.creds.registered) {
                        console.log('⏳ Conexão estabilizada pelo servidor. Solicitando código numérico...');
                        let numeroTelefone = process.env.MEU_NUMERO || '';
                        numeroTelefone = numeroTelefone.replace(/\D/g, ''); 
                        
                        if (numeroTelefone) {
                            try {
                                const code = await this.socket.requestPairingCode(numeroTelefone);
                                console.log('\n======================================================');
                                console.log(`🔑 CÓDIGO DE EMPARELHAMENTO: ${code}`);
                                console.log('👉 Abra o WhatsApp no celular:');
                                console.log('1. Aparelhos Conectados > Conectar um aparelho');
                                console.log('2. Escolha "Conectar com número de telefone" (na parte inferior)');
                                console.log('3. Digite o código acima.');
                                console.log('======================================================\n');
                            } catch (errPairing) {
                                console.error('❌ Erro ao solicitar o código numérico:', errPairing.message);
                            }
                        } else {
                            console.log('⚠️ A variável MEU_NUMERO não está configurada no .env.');
                        }
                    }
                }

                if (connection === 'open') {
                    console.log('🟢 Hera conectada e pronta!');
                    this.emit('ready');
                }
                
                if (connection === 'close') {
                    const erroCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode || 'Desconhecido';
                    const erroMsg = lastDisconnect?.error?.message || 'Sem detalhes';
                    
                    console.log(`🔴 Conexão fechada. Código: ${erroCode} | Motivo: ${erroMsg}`);

                    if (erroCode === DisconnectReason.restartRequired) {
                        console.log('🔄 O WhatsApp solicitou um reinício seguro. Recriando conexão...');
                        this.initialize();
                    } else if (erroCode !== DisconnectReason.loggedOut && erroCode !== 401) {
                        console.log('⏳ Aguardando 5 segundos antes de tentar reconectar...');
                        await esperar(5000);
                        console.log('🔄 Tentando reconectar agora...');
                        this.initialize(); 
                    } else {
                        console.log('❌ O WhatsApp foi desconectado pelo celular. Apague a pasta sessao_whatsapp_limpa e reinicie.');
                        this.emit('disconnected', lastDisconnect);
                    }
                }
            });

            this.socket.ev.on('messages.upsert', (m) => {
                if (m.type === 'notify') {
                    for (const msg of m.messages) {
                        this.emit('message_create', msg);
                    }
                }
            });
        } catch (erro) {
            console.error('❌ Erro CRÍTICO na inicialização:', erro);
        }
    }
    
    async sendMessage(jid, content, options) {
        if (typeof content === 'string') {
            content = { text: content };
        }

        let jidFormatado = String(jid).trim();
        
        if (!jidFormatado.includes('@')) {
            jidFormatado = `${jidFormatado}@s.whatsapp.net`;
        } else if (jidFormatado.endsWith('@c.us')) {
            jidFormatado = jidFormatado.replace('@c.us', '@s.whatsapp.net');
        }

        return this.socket.sendMessage(jidFormatado, content, options);
    }
}

function criarClientWhatsApp() {
    return new BaileysWrapper();
}

module.exports = { criarClientWhatsApp };
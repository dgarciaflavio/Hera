require('dotenv').config();
process.on('unhandledRejection', error => {
    console.error('Engasgo na rede evitado. O robô continua de pé.', error);
});

const { iniciarRotinaDeMemoria } = require('./jobs/consolidador');
const express = require('express');
const { criarClientWhatsApp } = require('./core/client');
const { registrarRotasPainel } = require('./routes/painelRoutes');
const { registrarEventosWhatsApp } = require('./whatsapp/handlers');

const app = express();

// AUMENTANDO O LIMITE DE TAMANHO PARA PERMITIR IMPORTAÇÃO DE PLANILHAS GIGANTES EM MASSA
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const client = criarClientWhatsApp();

registrarRotasPainel(app, client);
registrarEventosWhatsApp(client);

const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => {
    console.log(`Painel Web da Hera rodando! Acesse: http://localhost:${PORT}`);
});

server.on('error', erro => {
    if (erro && erro.code === 'EADDRINUSE') {
        console.error(`A porta ${PORT} já está em uso. Verifique se já existe outra instância da Hera rodando.`);
        process.exit(1);
    }
    console.error('Erro ao iniciar servidor HTTP da Hera:', erro);
    process.exit(1);
});

client.initialize();
iniciarRotinaDeMemoria();
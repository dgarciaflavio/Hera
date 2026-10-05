// src/routes/painelRoutes.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');

const { dbLerHistorico } = require('../services/memoria');
const { renderPainel } = require('../views/painel');
const { renderContatos } = require('../views/contatos');
const { renderDashboard } = require('../views/dashboard');
const { renderPainelExecutivo } = require('../views/painelExecutivo');
const { renderDashboardDinamico } = require('../views/dashboardDinamico'); 
const { renderTendencias } = require('../views/tendencias'); 
const { renderDipat } = require('../views/dipat');
const { renderChat } = require('../views/chat');
const { renderLogin } = require('../views/login');
const { renderUsuarios } = require('../views/usuarios');
const { renderRadar } = require('../views/radar'); 
const { renderMatrizRisco } = require('../views/matrizRisco'); 
const { renderPregoes } = require('../views/pregoes');
const { renderRessuprimento } = require('../views/ressuprimento');
const { estiloCSS } = require('../views/style'); 
const { gerarNavbar } = require('../views/navbar'); 
const { analisarPerfilContato, processarTextoComIA } = require('../services/gemini');
const { getStatusRobo, getQrCodeImagem } = require('../core/state');
const { gerarSugestoesRessuprimento } = require('../services/ressuprimento');

// Importando cérebro principal da Hera para rodar todos os comandos na Web
const { processarMensagemRecebida } = require('../whatsapp/messageProcessor');

// Importando as funções do banco de dados e de segurança
const { 
    importarEmpenhos, 
    importarPlanilhaSaldo, 
    importarMovimentacaoAnosAnteriores, 
    importarHistoricoRetroativo,
    importarPdm,
    importarMaiorConsumidor,
    registrarCompraCartao,
    adicionarItemRadar,
    removerItemRadar,
    listarItensRadar,
    adicionarContatoRadar,
    removerContatoRadar,
    listarContatosRadar,
    verificarCredenciaisUsuario, 
    buscarUsuarioPorId, 
    registrarSessao,
    validarSessaoToken, 
    destruirSessao, 
    atualizarSenhaUsuario,
    listarTodosUsuarios, 
    criarUsuarioSecundario, 
    atualizarPermissoesDeUsuario,
    atualizarDadosUsuario,
    resetarSenhaUsuarioSecundario, 
    deletarUsuarioSecundario
} = require('../services/database');

const { buscarItem } = require('../services/excel');
const { extrairComandoBuscar } = require('../utils/texto');

const { importarPcaBanco, importarPncpBanco } = require('../services/dfd');
const { getEstatisticasDashboard, getEstatisticasPainelExecutivo, getDadosDinamicos, getEstatisticasTendencias } = require('../services/dashboard');
const { getDadosMatrizRisco } = require('../services/matrizRiscoService'); 
const { criarApresentacao } = require('../services/pptGenerator');
const { analisarTendenciaEProjetar, projetarComIntervencoes } = require('../services/projecao');
const { gerarRelatorioAlertasDipat } = require('../services/alertaDipat');
const { gerarRelatorioRadar } = require('../services/radarAlerta'); 
const { gerarRelatorioPregoesAno, buscarTodosItensDaCompra } = require('../services/api'); 
const { buscarTodosPregoesPorAnoCache, buscarItensCache, salvarItensCache } = require('../services/pregoesCache'); 
const { gerarCacheMatrizReal } = require('../jobs/atualizadorPregoes');

const {
    obterInstanciaAtual,
    listarProcessosSuspeitos,
    matarPid,
    matarProcessosAntigosDaHera,
    matarNavegadoresSuspeitos
} = require('../services/processosPainel');

const SENHA_ACESSO = process.env.SENHA_PAINEL || 'hera123';

// =========================================================
// RASTREADOR DE TAREFAS EM SEGUNDO PLANO
// =========================================================
const geracaoMatrizEmAndamento = new Set();

// =========================================================
// MINI BANCO DE DADOS PARA O CHAT WEB E PASTA DE DOWNLOADS
// =========================================================
const webChatDbPath = path.join(process.cwd(), 'data', 'web_chats.json');
const downloadsDir = path.join(process.cwd(), 'data', 'downloads');

if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

function loadWebChats() {
    if (!fs.existsSync(path.dirname(webChatDbPath))) fs.mkdirSync(path.dirname(webChatDbPath), { recursive: true });
    if (!fs.existsSync(webChatDbPath)) return { sessions: [], messages: {} };
    try {
        return JSON.parse(fs.readFileSync(webChatDbPath, 'utf8'));
    } catch(e) {
        return { sessions: [], messages: {} };
    }
}

function saveWebChats(data) {
    fs.writeFileSync(webChatDbPath, JSON.stringify(data, null, 2));
}

// =========================================================
// MIDDLEWARE DE AUTENTICAÇÃO REAL (MULTI-USUÁRIOS)
// =========================================================
async function checkAuth(req, res, next) {
    const rawCookies = req.headers.cookie || '';
    const match = rawCookies.match(/hera_session=([^;]+)/);
    const token = match ? match[1] : null;

    if (!token) {
        if (req.method === 'GET' && !req.originalUrl.startsWith('/api/')) {
            return res.send(renderLogin(req.originalUrl));
        }
        return res.status(401).json({ mensagem: 'Acesso negado. Faça login.' });
    }

    try {
        const usuario = await validarSessaoToken(token);
        
        if (!usuario) {
            res.setHeader('Set-Cookie', 'hera_session=; HttpOnly; Path=/; Max-Age=0');
            if (req.method === 'GET' && !req.originalUrl.startsWith('/api/')) {
                return res.send(renderLogin(req.originalUrl));
            }
            return res.status(401).json({ mensagem: 'Sessão inválida ou expirada.' });
        }

        req.usuario = usuario;

        if (usuario.precisa_trocar_senha === 1 && !req.originalUrl.includes('/api/auth/')) {
            if (req.method === 'GET') {
                return res.send(renderLogin(null, true)); 
            }
            return res.status(403).json({ erro: 'Troca de senha obrigatória pendente.' });
        }

        let pathPartes = req.path.split('/');
        let pathBase = pathPartes[1] || 'status'; 

        if (pathBase === 'api' && pathPartes.length > 2) {
            const subPath = pathPartes[2];
            if (subPath === 'chat') pathBase = 'chat';
            else if (subPath === 'dipat') pathBase = 'dipat';
            else if (subPath === 'radar') pathBase = 'radar';
            else if (subPath === 'matriz-risco') pathBase = 'matriz-risco';
            else if (subPath === 'ressuprimento') pathBase = 'ressuprimento'; 
            else if (subPath === 'dashboard-stats' || subPath === 'gerar-ppt' || subPath === 'painel-executivo-stats') pathBase = 'dashboard';
            else if (subPath === 'dashboard-stats' || subPath === 'gerar-ppt') pathBase = 'dashboard';
            else if (subPath === 'dados-dinamicos') pathBase = 'dashboard-dinamico';
            else if (subPath === 'tendencias-stats') pathBase = 'tendencias';
            else if (subPath === 'analisar') pathBase = 'contatos';
            else if (subPath === 'db' || subPath === 'cartao') pathBase = 'importacao';
            else if (subPath === 'processos' || subPath === 'restart-hera') pathBase = 'status';
        }

        let permissoes = [];
        try {
            permissoes = typeof usuario.permissoes === 'string' ? JSON.parse(usuario.permissoes) : (usuario.permissoes || []);
        } catch(e) {
            permissoes = [];
        }

        const temAcesso = usuario.is_admin === 1 || permissoes.includes('todas') || permissoes.includes(pathBase);

        if (!temAcesso && req.path === '/') {
            if (permissoes.includes('dipat')) return res.redirect('/dipat');
            if (permissoes.includes('radar')) return res.redirect('/radar');
            if (permissoes.includes('matriz-risco')) return res.redirect('/matriz-risco');
            if (permissoes.includes('ressuprimento')) return res.redirect('/ressuprimento'); 
            if (permissoes.includes('chat')) return res.redirect('/chat');
            if (permissoes.includes('dashboard')) return res.redirect('/dashboard');
            if (permissoes.includes('dashboard')) return res.redirect('/painel-executivo');
            if (permissoes.includes('pregoes')) return res.redirect('/pregoes'); 
            if (permissoes.includes('contatos')) return res.redirect('/contatos');
            if (permissoes.includes('dashboard-dinamico')) return res.redirect('/dashboard-dinamico');
            if (permissoes.includes('tendencias')) return res.redirect('/tendencias');
            if (permissoes.includes('importacao')) return res.redirect('/importacao');
            if (permissoes.includes('consultas')) return res.redirect('/consultas');
        }

        if (!temAcesso && !req.originalUrl.startsWith('/api/auth')) {
             if (req.method === 'GET') {
                 const htmlNegado = `
                 <!DOCTYPE html>
                 <html lang="pt-BR">
                 <head>
                     <meta charset="UTF-8">
                     <title>Acesso Negado</title>
                     ${estiloCSS}
                     <style>
                         body { display: flex; flex-direction: column; height: 100vh; margin: 0; background: #e0e5ec; }
                         .main-content { flex: 1; display: flex; justify-content: center; align-items: center; }
                         .denied-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 5px 5px 15px #c8d0e7, -5px -5px 15px #ffffff; text-align: center; max-width: 400px; }
                         .denied-box h2 { color: #e74c3c; margin-top: 0; font-size: 24px; }
                         .denied-box p { color: #555; margin-bottom: 25px; font-size: 15px; }
                         .btn-voltar { background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; transition: 0.3s; box-shadow: 0 4px 10px rgba(52, 152, 219, 0.3); }
                         .btn-voltar:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(52, 152, 219, 0.4); }
                     </style>
                 </head>
                 <body>
                     ${gerarNavbar(req.usuario)}
                     <div class="main-content">
                         <div class="denied-box">
                             <h2>🚫 Acesso Restrito</h2>
                             <p>Desculpe, seu usuário não tem as permissões necessárias para visualizar o conteúdo desta página.</p>
                             <a href="javascript:history.back()" class="btn-voltar">⬅️ Voltar</a>
                         </div>
                     </div>
                 </body>
                 </html>
                 `;
                 return res.send(htmlNegado);
             }
             return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
        }

        next();
    } catch (error) {
        console.error('Erro no checkAuth:', error);
        res.status(500).send('Erro na validação de segurança.');
    }
}

function registrarRotasPainel(app, client) {
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    app.use('/downloads', checkAuth, express.static(downloadsDir));

    app.post('/login', (req, res) => {
        const senhaDigitada = req.body.senha;
        const redirectUrl = req.body.redirect || '/';

        if (senhaDigitada === SENHA_ACESSO) {
            res.setHeader('Set-Cookie', 'hera_auth=sim; HttpOnly; Path=/; Max-Age=43200');
            res.redirect(redirectUrl);
        } else {
            res.send('<script>alert("Senha incorreta!"); window.history.back();</script>');
        }
    });

    app.post('/api/auth/login', async (req, res) => {
        const { login, senha, redirect } = req.body;
        try {
            const usuario = await verificarCredenciaisUsuario(login, senha);
            if (usuario) {
                const token = require('crypto').randomBytes(32).toString('hex');
                await registrarSessao(usuario.id, token);
                
                res.setHeader('Set-Cookie', `hera_session=${token}; HttpOnly; Path=/; Max-Age=43200`);
                res.redirect(redirect || '/');
            } else {
                res.send('<script>alert("Login ou senha incorretos!"); window.history.back();</script>');
            }
        } catch (error) {
            res.status(500).send('Erro interno ao tentar autenticar.');
        }
    });

    app.post('/api/auth/trocar-senha', checkAuth, async (req, res) => {
        const { nova_senha } = req.body;
        if (!nova_senha || nova_senha.length < 5) {
            return res.status(400).json({ erro: 'A senha deve ter pelo menos 5 caracteres.' });
        }
        try {
            await atualizarSenhaUsuario(req.usuario.id, nova_senha);
            res.json({ mensagem: 'Senha alterada com sucesso! Redirecionando...' });
        } catch (error) {
            res.status(500).json({ erro: 'Falha ao alterar a senha.' });
        }
    });

    app.get('/api/auth/logout', async (req, res) => {
        const rawCookies = req.headers.cookie || '';
        const match = rawCookies.match(/hera_session=([^;]+)/);
        if (match) {
            await destruirSessao(match[1]).catch(()=>null);
        }
        res.setHeader('Set-Cookie', 'hera_session=; HttpOnly; Path=/; Max-Age=0');
        res.redirect('/');
    });

    app.get('/usuarios', checkAuth, async (req, res) => {
        if (req.usuario.is_admin !== 1) return res.send('<h2>Acesso Negado. Apenas o administrador pode gerenciar a equipe.</h2>');
        const usuarios = await listarTodosUsuarios();
        res.send(renderUsuarios(usuarios, req.usuario)); 
    });

    app.post('/api/usuarios/criar', checkAuth, async (req, res) => {
        if (req.usuario.is_admin !== 1) return res.status(403).json({ erro: 'Acesso Negado.' });
        const { nome, login, permissoes } = req.body;
        try {
            const senhaProv = 'Inca123';
            await criarUsuarioSecundario(nome, login, senhaProv, permissoes || []);
            res.json({ mensagem: `Usuário criado!` });
        } catch (error) {
            res.status(400).json({ erro: error.message });
        }
    });

    app.put('/api/usuarios/:id/permissoes', checkAuth, async (req, res) => {
        if (req.usuario.is_admin !== 1) return res.status(403).json({ erro: 'Acesso Negado.' });
        try {
            await atualizarPermissoesDeUsuario(req.params.id, req.body.permissoes || []);
            res.json({ mensagem: 'Permissões atualizadas!' });
        } catch (error) {
            res.status(500).json({ erro: 'Erro ao atualizar.' });
        }
    });

    // NOVA ROTA PARA EDITAR NOME E LOGIN
    app.put('/api/usuarios/:id/dados', checkAuth, async (req, res) => {
        if (req.usuario.is_admin !== 1) return res.status(403).json({ erro: 'Acesso Negado.' });
        const { nome, login } = req.body;
        try {
            await atualizarDadosUsuario(req.params.id, nome, login);
            res.json({ mensagem: 'Dados do usuário atualizados com sucesso!' });
        } catch (error) {
            res.status(400).json({ erro: error.message });
        }
    });

    app.put('/api/usuarios/:id/permissoes', checkAuth, async (req, res) => {
        if (req.usuario.is_admin !== 1) return res.status(403).json({ erro: 'Acesso Negado.' });
        try {
            await atualizarPermissoesDeUsuario(req.params.id, req.body.permissoes || []);
            res.json({ mensagem: 'Permissões atualizadas!' });
        } catch (error) {
            res.status(500).json({ erro: 'Erro ao atualizar.' });
        }
    });

    app.post('/api/usuarios/:id/resetar', checkAuth, async (req, res) => {
        if (req.usuario.is_admin !== 1) return res.status(403).json({ erro: 'Acesso Negado.' });
        try {
            const senhaProv = 'Inca123';
            const sucesso = await resetarSenhaUsuarioSecundario(req.params.id, senhaProv);
            if(sucesso) res.json({ mensagem: `Senha resetada!` });
            else res.status(400).json({ erro: 'Não é possível resetar a senha do Administrador mestre.' });
        } catch (error) {
            res.status(500).json({ erro: 'Erro ao resetar.' });
        }
    });

    app.delete('/api/usuarios/:id', checkAuth, async (req, res) => {
        if (req.usuario.is_admin !== 1) return res.status(403).json({ erro: 'Acesso Negado.' });
        try {
            await deletarUsuarioSecundario(req.params.id);
            res.json({ mensagem: 'Usuário removido da equipe.' });
        } catch (error) {
            res.status(500).json({ erro: 'Erro ao excluir.' });
        }
    });

    // =========================================================
    // ROTAS DA MATRIZ DE RISCO (NOVA INTELIGÊNCIA LOGÍSTICA)
    // =========================================================
    app.get('/matriz-risco', checkAuth, (req, res) => {
        try {
            const html = renderMatrizRisco(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a matriz de risco:', erro);
            res.status(500).send('Erro interno ao carregar a página.');
        }
    });

    app.get('/api/matriz-risco/dados', checkAuth, async (req, res) => {
        try {
            const local = req.query.local || 'GERAL';
            const ignorar116 = req.query.ignorar116 === 'true';
            
            const dados = await getDadosMatrizRisco(local, ignorar116);
            res.json(dados);
        } catch (erro) {
            console.error('Erro ao buscar dados da matriz de risco:', erro);
            res.status(500).json({ erro: 'Falha ao processar a matriz de risco.' });
        }
    });

    // =========================================================
    // ROTAS DE SUGESTÃO DE RESSUPRIMENTO (PLANO DE COMPRAS)
    // =========================================================
    app.get('/ressuprimento', checkAuth, (req, res) => {
        try {
            const html = renderRessuprimento(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a página de ressuprimento:', erro);
            res.status(500).send('Erro interno ao carregar a página.');
        }
    });

    app.get('/api/ressuprimento/dados', checkAuth, async (req, res) => {
        try {
            const planejador = req.query.planejador || 'Todos';
            const meses = Number(req.query.meses) || 6;
            const codigoItem = req.query.codigo || ''; 
            
            // Novos Filtros Adicionados
            const ignorar116 = req.query.ignorar116 === 'true';
            const ignorarSemDemanda = req.query.ignorarSemDemanda === 'true';
            const ignorarAvn = req.query.ignorarAvn === 'true';
            
            const dados = await gerarSugestoesRessuprimento(planejador, meses, codigoItem, ignorar116, ignorarSemDemanda, ignorarAvn);
            res.json(dados);
        } catch (erro) {
            console.error('Erro ao buscar dados de ressuprimento:', erro);
            res.status(500).json({ erro: 'Falha ao calcular sugestões de ressuprimento.' });
        }
    });

    // =========================================================
    // ROTAS DO RADAR DE ITENS
    // =========================================================
    app.get('/radar', checkAuth, (req, res) => {
        try {
            const html = renderRadar(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a página Radar:', erro);
            res.status(500).send('Erro interno ao carregar a página Radar.');
        }
    });

    app.get('/api/radar/itens', checkAuth, async (req, res) => {
        try {
            const itens = await listarItensRadar();
            res.json(itens);
        } catch (erro) {
            res.status(500).json({ erro: 'Falha ao buscar itens do radar.' });
        }
    });

    app.post('/api/radar/itens', checkAuth, async (req, res) => {
        try {
            const { itens } = req.body;
            let inseridos = 0;
            if (Array.isArray(itens)) {
                for (const item of itens) {
                    const r = await adicionarItemRadar(item);
                    if (r.sucesso && r.inserido) inseridos++;
                }
            }
            res.json({ mensagem: `${inseridos} item(ns) adicionado(s) ao radar com sucesso!` });
        } catch (erro) {
            res.status(500).json({ erro: 'Falha ao adicionar itens ao radar.' });
        }
    });

    app.delete('/api/radar/itens/:item', checkAuth, async (req, res) => {
        try {
            await removerItemRadar(req.params.item);
            res.json({ mensagem: 'Item removido do radar.' });
        } catch (erro) {
            res.status(500).json({ erro: 'Falha ao remover item do radar.' });
        }
    });

    app.get('/api/radar/contatos', checkAuth, async (req, res) => {
        try {
            const contatos = await listarContatosRadar();
            res.json(contatos);
        } catch (erro) {
            res.status(500).json({ erro: 'Falha ao buscar contatos do radar.' });
        }
    });

    app.post('/api/radar/contatos', checkAuth, async (req, res) => {
        try {
            const { nome, telefone } = req.body;
            if (!nome || !telefone) return res.status(400).json({ erro: 'Nome e telefone obrigatórios.' });
            await adicionarContatoRadar(nome, telefone);
            res.json({ mensagem: 'Contato adicionado com sucesso!' });
        } catch (erro) {
            res.status(500).json({ erro: 'Falha ao adicionar contato ao radar.' });
        }
    });

    app.delete('/api/radar/contatos/:telefone', checkAuth, async (req, res) => {
        try {
            await removerContatoRadar(req.params.telefone);
            res.json({ mensagem: 'Contato removido do radar.' });
        } catch (erro) {
            res.status(500).json({ erro: 'Falha ao remover contato do radar.' });
        }
    });

    app.post('/api/radar/disparar', checkAuth, async (req, res) => {
        try {
            const resultado = await gerarRelatorioRadar();
            
            if (resultado.erro) {
                return res.status(400).json({ erro: resultado.erro });
            }

            let envios = 0;
            const fsLocal = require('fs');
            const bufferExcel = fsLocal.readFileSync(resultado.filePath);

            for (const dest of resultado.destinatarios) {
                const numeroLimpo = String(dest.telefone_radar).replace(/\D/g, '');
                if (numeroLimpo) {
                    const numeroWpp = numeroLimpo + '@s.whatsapp.net';
                    try {
                        await client.sendMessage(numeroWpp, { text: `Olá, ${dest.nome_radar}!\n\n${resultado.mensagem}` });
                        await client.sendMessage(numeroWpp, {
                            document: bufferExcel,
                            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            fileName: `Alerta_Radar_${new Date().toISOString().split('T')[0]}.xlsx`,
                            caption: '🎯 Relatório Executivo - Radar de Itens'
                        });
                        envios++;
                    } catch(e) {
                        console.error(`Erro ao enviar alerta Radar via WhatsApp para ${numeroWpp}:`, e);
                    }
                }
            }

            res.json({ mensagem: `Alerta do Radar gerado e disparado com sucesso para ${envios} contato(s)!` });
        } catch (erro) {
            console.error('Erro na rota de disparo do radar:', erro);
            res.status(500).json({ erro: 'Falha ao processar disparo do radar.' });
        }
    });

    app.get('/api/radar/analise/:item', checkAuth, async (req, res) => {
        try {
            const codigoItem = req.params.item;
            const db = require('../services/database').getDbConnection();
            
            const executarQuery = (sql, params = []) => {
                return new Promise((resolve, reject) => {
                    db.all(sql, params, (err, rows) => {
                        if (err) reject(err); else resolve(rows);
                    });
                });
            };

            const rowsHistorico = await executarQuery(
                `SELECT data_historico, saldo_atual FROM historico_estoque WHERE UPPER(TRIM(item)) = ? ORDER BY data_historico ASC`, 
                [codigoItem.toUpperCase()]
            );

            const mapaDias = new Map();
            rowsHistorico.forEach(row => {
                mapaDias.set(row.data_historico, Number(row.saldo_atual || row['saldo atual'] || 0));
            });
            const historico = Array.from(mapaDias.entries()).map(([data, valor]) => ({ data, valor }));

            const dadosLogisticaRaw = await executarQuery(
                'SELECT * FROM planilha_saldoabaixode90dias WHERE UPPER(TRIM(item)) = ? LIMIT 1',
                [codigoItem.toUpperCase()]
            );
            const logisticaLinha = dadosLogisticaRaw.length > 0 ? dadosLogisticaRaw[0] : {};

            let logistica = {
                descricao: 'Desconhecido',
                processo_com_ata: '',
                processo_em_andamento: '',
                modalidade: 'N/A',
                saldo_da_ata: 0,
                venc_ata: '',
                num_empenho: '',
                qtde: 0,
                qtde_a_receber: 0,
                tem_ae: false
            };

            for (const k in logisticaLinha) {
                const low = k.trim().toLowerCase();
                const val = logisticaLinha[k];
                
                if (low.includes('descri')) logistica.descricao = String(val || '').trim();
                
                if (low === 'processo' || low === 'processo_com_ata' || low === 'processocomata' || (low.includes('processo') && low.includes('ata'))) logistica.processo_com_ata = String(val || '').trim();
                if (low === 'processo_em_andamento' || low === 'processoemandamento' || (low.includes('processo') && low.includes('andamento'))) logistica.processo_em_andamento = String(val || '').trim();
                
                if (low === 'modalidade') logistica.modalidade = String(val || '').trim();
                if (low === 'saldo_da_ata' || (low.includes('saldo') && low.includes('ata'))) {
                    let v = String(val || '0').replace(',', '.');
                    logistica.saldo_da_ata = Number(v) || 0;
                }
                if (low === 'venc_ata' || (low.includes('venc') && low.includes('ata'))) logistica.venc_ata = String(val || '').trim();
                if (low === 'num.empenho' || low === 'num_empenho' || low === 'empenho') logistica.num_empenho = String(val || '').trim();
                if (low === 'qtde') logistica.qtde = Number(val || 0);
                if (low === 'qtde_a_receber' || (low.includes('qtde') && low.includes('receber'))) logistica.qtde_a_receber = Number(val || 0);
                if (low.startsWith('ae') && !low.includes('qtde') && !low.includes('empenhar') && val && String(val).toUpperCase() !== 'N/A' && String(val) !== '0') logistica.tem_ae = true;
            }

            const empenhos = await executarQuery(
                `SELECT data_ult_entrada FROM empenhos_entradaempenhos WHERE UPPER(TRIM(cod_item)) = ? ORDER BY data_ult_entrada DESC LIMIT 1`,
                [codigoItem.toUpperCase()]
            );

            let dataUltimaEntrada = 'Não informada';
            if (empenhos.length > 0 && empenhos[0].data_ult_entrada) {
                const valData = empenhos[0].data_ult_entrada;
                if (typeof valData === 'number') {
                    const dataObj = new Date((valData - 25569) * 86400 * 1000);
                    dataUltimaEntrada = dataObj.toLocaleDateString('pt-BR');
                } else {
                    dataUltimaEntrada = valData;
                }
            }

            const ultimos6 = historico.slice(-6);
            const analiseBase = analisarTendenciaEProjetar(ultimos6, 6);

            let projecaoComIntervencao = [];
            if (!analiseBase.erro && historico.length > 0) {
                const saldoAtual = Number(historico[historico.length - 1].valor);
                const consumoProjetado = analiseBase.coeficienteAngular_b < 0 ? Math.abs(analiseBase.coeficienteAngular_b) : 0;
                projecaoComIntervencao = projetarComIntervencoes(saldoAtual, consumoProjetado, logistica, 6);
            }

            db.close();

            const formatarData = (val) => {
                if (!val || val === '0' || val === 'N/A') return 'Sem Ata';
                const num = Number(val);
                if (!isNaN(num) && num > 30000 && num < 60000) {
                    const d = new Date((num - 25569) * 86400 * 1000);
                    return d.toLocaleDateString('pt-BR');
                }
                return val;
            };

            const procAtual = (logistica.processo_com_ata && logistica.processo_com_ata !== '0' && logistica.processo_com_ata !== 'N/A') ? logistica.processo_com_ata : logistica.processo_em_andamento;

            res.json({
                item: codigoItem,
                historicoOriginal: historico,
                analise: analiseBase,
                intervencao: projecaoComIntervencao,
                detalhesLogisticos: {
                    descricao: logistica.descricao || 'Desconhecido',
                    processoAtual: procAtual || 'Sem Processo',
                    pregaoAssociado: 'PE (Verificar painel)', 
                    modalidade: logistica.modalidade || 'N/A',
                    saldoAta: Number(logistica.saldo_da_ata) || 0,
                    validadeAta: formatarData(logistica.venc_ata),
                    saldoAtual: historico.length > 0 ? historico[historico.length - 1].valor : 0,
                    temEmpenho: !!(logistica.num_empenho && logistica.num_empenho !== '0' && logistica.num_empenho !== 'N/A'),
                    temAe: logistica.tem_ae,
                    ultimaEntrada: dataUltimaEntrada
                }
            });
        } catch (erro) {
            console.error('Erro na rota /api/radar/analise:', erro);
            res.status(500).json({ erro: 'Falha ao processar a análise MQO do radar.' });
        }
    });

    // =========================================================
    // ROTAS DE PREGÕES (NOVA ABA WEB)
    // =========================================================
    app.get('/pregoes', checkAuth, (req, res) => {
        try {
            const html = renderPregoes(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a página de pregões:', res.status(500).send('Erro interno ao carregar a página.'));
        }
    });

    // ROTA PARA LER DA CACHE E GERAR A LINHA DO TEMPO DE UM ÚNICO ANO
    app.get('/api/pregoes/:ano', checkAuth, async (req, res) => {
        try {
            const ano = req.params.ano;
            const pregoesBanco = await buscarTodosPregoesPorAnoCache(ano);

            if (!pregoesBanco || pregoesBanco.length === 0) {
                return res.json({ pregoes: [], mensagem: `Nenhum pregão processado no banco para ${ano}.` });
            }

            let linhaDoTempo = {
                abertos: Array(12).fill(0), homologados: Array(12).fill(0),
                emAndamento: Array(12).fill(0), fracassados: Array(12).fill(0),
                desertos: Array(12).fill(0), anulados: Array(12).fill(0)
            };

            const nomeMeses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

            const pregoesMacro = pregoesBanco.map(p => {
                const statusJson = p.status_json ? JSON.parse(p.status_json) : {};
                const mesIdx = p.mes_publicacao || 0;
                
                linhaDoTempo.abertos[mesIdx] += p.total_itens || 0;

                for (const [sit, qtd] of Object.entries(statusJson)) {
                    const sLow = sit.toLowerCase();
                    if (sLow.includes('homologado') || sLow.includes('adjudicado')) linhaDoTempo.homologados[mesIdx] += qtd;
                    else if (sLow.includes('fracassado')) linhaDoTempo.fracassados[mesIdx] += qtd;
                    else if (sLow.includes('deserto')) linhaDoTempo.desertos[mesIdx] += qtd;
                    else if (sLow.includes('anulado') || sLow.includes('revogado') || sLow.includes('cancelado')) linhaDoTempo.anulados[mesIdx] += qtd;
                    else if (sLow.includes('andamento') || sLow.includes('informado')) linhaDoTempo.emAndamento[mesIdx] += qtd;
                }

                return {
                    idCompra: p.id_compra,
                    numero: String(p.numero_limpo),
                    pregao: `PE ${p.numero_limpo}/${p.ano}`,
                    ano: p.ano,
                    sei: p.processo_sei || 'Não identificado',
                    situacaoGeral: p.situacao_geral || 'N/A',
                    mesIndex: mesIdx,
                    mes: nomeMeses[mesIdx],
                    totalItens: p.total_itens || 0,
                    status: statusJson
                };
            }).sort((a, b) => a.mesIndex - b.mesIndex);

            res.json({ pregoes: pregoesMacro, linhaDoTempo: linhaDoTempo });

        } catch (erro) {
            console.error('Erro na API web de Pregões (Cache):', erro);
            res.status(500).json({ erro: 'Falha ao processar os dados dos Pregões armazenados no banco.' });
        }
    });

    // ROTA PARA COMPARAR A PRODUTIVIDADE ENTRE DOIS ANOS
    app.get('/api/pregoes/comparacao/:ano', checkAuth, async (req, res) => {
        try {
            const anoAtual = parseInt(req.params.ano, 10);
            const anoAnterior = anoAtual - 1;
            
            const pregoesAtual = await buscarTodosPregoesPorAnoCache(anoAtual);
            const pregoesAnterior = await buscarTodosPregoesPorAnoCache(anoAnterior);

            const compilarLinhaDoTempo = (pregoesBanco, anoBase) => {
                let linhaDoTempo = {
                    abertos: Array(12).fill(0), homologados: Array(12).fill(0),
                    emAndamento: Array(12).fill(0), fracassados: Array(12).fill(0),
                    desertos: Array(12).fill(0), anulados: Array(12).fill(0)
                };

                const nomeMeses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
                const pregoesMacro = (pregoesBanco || []).map(p => {
                    const statusJson = p.status_json ? JSON.parse(p.status_json) : {};
                    const mesIdx = p.mes_publicacao || 0;
                    
                    linhaDoTempo.abertos[mesIdx] += p.total_itens || 0;

                    for (const [sit, qtd] of Object.entries(statusJson)) {
                        const sLow = sit.toLowerCase();
                        if (sLow.includes('homologado') || sLow.includes('adjudicado')) linhaDoTempo.homologados[mesIdx] += qtd;
                        else if (sLow.includes('fracassado')) linhaDoTempo.fracassados[mesIdx] += qtd;
                        else if (sLow.includes('deserto')) linhaDoTempo.desertos[mesIdx] += qtd;
                        else if (sLow.includes('anulado') || sLow.includes('revogado') || sLow.includes('cancelado')) linhaDoTempo.anulados[mesIdx] += qtd;
                        else if (sLow.includes('andamento') || sLow.includes('informado')) linhaDoTempo.emAndamento[mesIdx] += qtd;
                    }

                    return {
                        idCompra: p.id_comp_id_compra || p.id_compra,
                        numero: String(p.numero_limpo),
                        pregao: `PE ${p.numero_limpo}/${p.ano}`,
                        ano: p.ano,
                        sei: p.processo_sei || 'Não identificado',
                        situacaoGeral: p.situacao_geral || 'N/A',
                        mesIndex: mesIdx,
                        mes: nomeMeses[mesIdx],
                        totalItens: p.total_itens || 0,
                        status: statusJson
                    };
                }).sort((a, b) => a.mesIndex - b.mesIndex);

                return { pregoes: pregoesMacro, linhaDoTempo: linhaDoTempo };
            };

            res.json({
                anoVigente: { ano: anoAtual, ...compilarLinhaDoTempo(pregoesAtual, anoAtual) },
                anoAnterior: { ano: anoAnterior, ...compilarLinhaDoTempo(pregoesAnterior, anoAnterior) }
            });

        } catch (erro) {
            console.error('Erro na API web de Comparação de Pregões:', erro);
            res.status(500).json({ erro: 'Falha ao processar a comparação de Pregões.' });
        }
    });

    // ROTA PARA EXPORTAR EXCEL DETALHADO POR CLIQUE NA MATRIZ
    app.post('/api/pregoes/exportar-itens', checkAuth, async (req, res) => {
        try {
            const { pregoes, statusFiltrado, mes } = req.body;
            
            if (!pregoes || pregoes.length === 0) {
                return res.status(400).json({ erro: 'Nenhum pregão informado para exportação.' });
            }

            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('Itens Detalhados');

            ws.columns = [
                { header: 'Pregão', key: 'pregao', width: 15 },
                { header: 'Processo SEI', key: 'sei', width: 25 },
                { header: 'Mês', key: 'mes', width: 10 },
                { header: 'Item Num', key: 'num_item', width: 10 },
                { header: 'Descrição', key: 'descricao', width: 50 },
                { header: 'Situação', key: 'situacao', width: 25 },
                { header: 'Data da Ação/Homol.', key: 'data_situacao', width: 20 },
                { header: 'Valor', key: 'valor', width: 15 }
            ];
            ws.getRow(1).font = { bold: true };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };

            const formatarData = (val) => {
                if (!val) return '-';
                const d = new Date(val);
                return isNaN(d.getTime()) ? val : d.toLocaleDateString('pt-BR');
            };
            const formatarMoeda = (val) => {
                if (val === null || val === undefined) return '-';
                return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            };

            for (const p of pregoes) {
                if (!p.idCompra) continue;

                try {
                    // Busca primeiro no cache local
                    let itensBrutos = await buscarItensCache(p.idCompra);
                    
                    // Fallback: Se o cache estiver vazio, busca na API do PNCP e atualiza o banco
                    if (!itensBrutos || itensBrutos.length === 0) {
                        console.log(`[EXPORTAÇÃO] Pregão ${p.idCompra} sem itens no cache local. Buscando na API do Governo...`);
                        
                        itensBrutos = await buscarTodosItensDaCompra(p.idCompra, p.ano, p.numero);
                        
                        if (itensBrutos && itensBrutos.length > 0) {
                            await salvarItensCache(p.idCompra, itensBrutos);
                            console.log(`[EXPORTAÇÃO] Itens do Pregão ${p.idCompra} salvos em cache com sucesso.`);
                        } else {
                            console.log(`[EXPORTAÇÃO] Pregão ${p.idCompra} não retornou itens nem da API. Pulando.`);
                            continue;
                        }
                    }
                    
                    itensBrutos.forEach(item => {
                        const sitLabel = String(item.situacaoCompraItemNome || item.situacaoItem || 'Em Andamento / Não Informado').trim();
                        let statusCorrespondente = false;
                        const sLow = sitLabel.toLowerCase();
                        const filterLow = String(statusFiltrado).toLowerCase();
                        
                        if (filterLow.includes('homologado') && (sLow.includes('homologado') || sLow.includes('adjudicado'))) statusCorrespondente = true;
                        else if (filterLow.includes('fracassado') && sLow.includes('fracassado')) statusCorrespondente = true;
                        else if (filterLow.includes('deserto') && sLow.includes('deserto')) statusCorrespondente = true;
                        else if (filterLow.includes('anulado') && (sLow.includes('anulado') || sLow.includes('revogado') || sLow.includes('cancelado'))) statusCorrespondente = true;
                        else if (filterLow.includes('andamento') && (sLow.includes('andamento') || sLow.includes('informado'))) statusCorrespondente = true;
                        else if (sitLabel === statusFiltrado) statusCorrespondente = true;

                        if (statusCorrespondente) {
                            const dataAcao = item.dataResultado || item.dataAtualizacaoPncp || item.dataInclusaoPncp || p.dataPublicacaoPncp;
                            const descricaoReal = item.descricaoResumida || item.descricaodetalhada || item.descricaoItem || item.objetoCompra || item.materialOuServicoNome || 'Descrição não informada';
                            
                            ws.addRow({
                                pregao: p.pregaoFormatado,
                                sei: p.sei || 'N/A',
                                mes: mes,
                                num_item: item.numeroItem || item.numeroItemPncp || '-',
                                descricao: descricaoReal,
                                situacao: sitLabel,
                                data_situacao: formatarData(dataAcao),
                                valor: formatarMoeda(item.valorUnitarioHomologado || item.valorUnitarioResultado || item.valorUnitarioEstimado || item.valorTotal)
                            });
                        }
                    });
                } catch(err) {
                    console.error(`Erro ao buscar itens do pregão ${p.idCompra} para o Excel:`, err.message);
                }
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const nomeSeguro = String(statusFiltrado).replace(/[^a-zA-Z0-9]/g, '_');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Itens_${mes}_${nomeSeguro}.xlsx"`);
            res.send(buffer);

        } catch (erro) {
            console.error('Erro na exportação detalhada:', erro);
            res.status(500).json({ erro: 'Falha ao gerar o Excel detalhado.' });
        }
    });

    // NOVA ROTA: EXPORTAÇÃO RÁPIDA POR MÊS DA AÇÃO (TODOS OS PREGÕES DO ANO ATUAL E ANTERIOR)
    app.post('/api/pregoes/exportar-mes-acao', checkAuth, async (req, res) => {
        try {
            const { ano, mesIndex, nomeMes } = req.body;
            const anoAlvo = parseInt(ano, 10);
            const anoAnterior = anoAlvo - 1;

            if (!anoAlvo || mesIndex === undefined) {
                return res.status(400).json({ erro: 'Ano ou mês inválidos para exportação.' });
            }

            // Puxa do cache tanto o ano alvo quanto o ano anterior para varrer todas as viradas de lote
            const pregoesAtual = await buscarTodosPregoesPorAnoCache(anoAlvo);
            const pregoesAnterior = await buscarTodosPregoesPorAnoCache(anoAnterior);
            const todosPregoes = [...(pregoesAnterior || []), ...(pregoesAtual || [])];

            if (todosPregoes.length === 0) {
                return res.status(400).json({ erro: `Nenhum pregão em cache para os anos ${anoAnterior} e ${anoAlvo}.` });
            }

            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet(`Homologados_${nomeMes}_${anoAlvo}`);

            ws.columns = [
                { header: 'Pregão', key: 'pregao', width: 15 },
                { header: 'Processo SEI', key: 'sei', width: 25 },
                { header: 'Item Num', key: 'num_item', width: 10 },
                { header: 'Descrição do Material', key: 'descricao', width: 50 },
                { header: 'Situação do Item', key: 'situacao', width: 25 },
                { header: 'Data da Ação/Homol.', key: 'data_situacao', width: 20 },
                { header: 'Valor Unitário / Total', key: 'valor', width: 18 }
            ];
            ws.getRow(1).font = { bold: true };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };

            const formatarData = (val) => {
                if (!val) return '-';
                const d = new Date(val);
                return isNaN(d.getTime()) ? val : d.toLocaleDateString('pt-BR');
            };
            const formatarMoeda = (val) => {
                if (val === null || val === undefined) return '-';
                return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            };

            let totalItensExportados = 0;

            for (const p of todosPregoes) {
                if (!p.id_compra) continue;

                // OTIMIZAÇÃO: Filtro inteligente no cache local
                let temHomologado = false;
                if (p.status_json) {
                    try {
                        const statusJson = JSON.parse(p.status_json);
                        for (const [sit, qtd] of Object.entries(statusJson)) {
                            const sLow = sit.toLowerCase();
                            if ((sLow.includes('homologado') || sLow.includes('adjudicado')) && qtd > 0) {
                                temHomologado = true;
                                break;
                            }
                        }
                    } catch (e) {}
                }

                // Se o resumo do banco já diz que o pregão não tem nada homologado, aborta e vai pro próximo
                if (!temHomologado) continue;

                try {
                    // Busca primeiro no cache local
                    let itensBrutos = await buscarItensCache(p.id_compra);
                    
                    // Fallback: Se o cache estiver vazio, busca na API do PNCP e atualiza o banco
                    if (!itensBrutos || itensBrutos.length === 0) {
                        console.log(`[EXPORTAÇÃO RÁPIDA] Pregão ${p.id_compra} sem itens no cache local. Buscando na API do Governo...`);
                        
                        itensBrutos = await buscarTodosItensDaCompra(p.id_compra, p.ano, p.numero_limpo);
                        
                        if (itensBrutos && itensBrutos.length > 0) {
                            await salvarItensCache(p.id_compra, itensBrutos);
                            console.log(`[EXPORTAÇÃO RÁPIDA] Itens do Pregão ${p.id_compra} salvos em cache com sucesso.`);
                        } else {
                            console.log(`[EXPORTAÇÃO RÁPIDA] Pregão ${p.id_compra} não retornou itens nem da API. Pulando.`);
                            continue;
                        }
                    }

                    itensBrutos.forEach(item => {
                        const sitLabel = String(item.situacaoCompraItemNome || item.situacaoItem || '').trim();
                        const sLow = sitLabel.toLowerCase();

                        // Filtra apenas itens homologados ou adjudicados
                        const ehHomologado = sLow.includes('homologado') || sLow.includes('adjudicado');
                        if (!ehHomologado) return;

                        // Verifica a data exata da ação
                        const dataAcaoStr = item.dataResultado || item.dataAtualizacaoPncp || item.dataInclusaoPncp || null;
                        if (!dataAcaoStr) return;

                        const dataAcaoObj = new Date(dataAcaoStr);
                        if (isNaN(dataAcaoObj.getTime())) return;

                        // Valida se o mês e o ano da ação coincidem exatamente com a seleção do usuário
                        if (dataAcaoObj.getFullYear() === anoAlvo && dataAcaoObj.getMonth() === parseInt(mesIndex, 10)) {
                            const descricaoReal = item.descricaoResumida || item.descricaodetalhada || item.descricaoItem || item.objetoCompra || item.materialOuServicoNome || 'Descrição não informada';
                            
                            ws.addRow({
                                pregao: `PE ${p.numero_limpo}/${p.ano}`,
                                sei: p.processo_sei || 'N/A',
                                num_item: item.numeroItem || item.numeroItemPncp || '-',
                                descricao: descricaoReal,
                                situacao: sitLabel,
                                data_situacao: formatarData(dataAcaoStr),
                                valor: formatarMoeda(item.valorUnitarioHomologado || item.valorUnitarioResultado || item.valorUnitarioEstimado || item.valorTotal)
                            });
                            totalItensExportados++;
                        }
                    });
                } catch (errItem) {
                    console.error(`Erro ao varrer itens da compra ${p.id_compra} para exportação rápida:`, errItem.message);
                }
            }

            if (totalItensExportados === 0) {
                return res.status(400).json({ erro: `Nenhum item com data de homologação em ${nomeMes} de ${anoAlvo} foi encontrado nas APIs do PNCP.` });
            }

            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Itens_Homologados_${nomeMes}_${anoAlvo}.xlsx"`);
            res.send(buffer);

        } catch (erro) {
            console.error('Erro na exportação rápida por mês:', erro);
            res.status(500).json({ erro: 'Falha ao processar o relatório rápido de homologações.' });
        }
    });

    // NOVA ROTA (ASSÍNCRONA): GERAR MATRIZ REAL
    app.get('/api/pregoes/produtividade-real/:ano', checkAuth, async (req, res) => {
        try {
            const anoAlvo = parseInt(req.params.ano, 10);

            if (!anoAlvo) {
                return res.status(400).json({ erro: 'Ano inválido para cálculo da matriz real.' });
            }

            const cachePath = path.join(process.cwd(), 'data', `matriz_real_${anoAlvo}.json`);

            // Se o cache já existir e não for um recálculo forçado, lê na velocidade da luz
            if (fs.existsSync(cachePath) && req.query.force !== 'true') {
                const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                return res.json({ 
                    status: 'pronto', 
                    matrizReal: cacheData.matrizReal, 
                    ultimaAtualizacao: cacheData.ultimaAtualizacao 
                });
            }

            // Se a matriz já estiver sendo calculada em background por outro pedido
            if (geracaoMatrizEmAndamento.has(anoAlvo)) {
                return res.json({ 
                    status: 'processando', 
                    mensagem: `A Matriz Real de ${anoAlvo} já está sendo calculada em segundo plano. Por favor, aguarde alguns minutos.` 
                });
            }

            // Se o cache não existir, dispara a rotina pesada em background (Fire and Forget)
            geracaoMatrizEmAndamento.add(anoAlvo);
            gerarCacheMatrizReal(anoAlvo)
                .then(() => {
                    console.log(`✅ [BACKEND] Matriz Real de ${anoAlvo} gerada com sucesso em background.`);
                })
                .catch((err) => {
                    console.error(`❌ [BACKEND] Erro ao gerar Matriz Real de ${anoAlvo} em background:`, err);
                })
                .finally(() => {
                    geracaoMatrizEmAndamento.delete(anoAlvo);
                });

            // Responde imediatamente ao navegador para não travar a tela
            return res.json({ 
                status: 'iniciado', 
                mensagem: `O cálculo da Matriz Real de ${anoAlvo} foi iniciado nos bastidores. Como a Hera precisa consultar o Governo de forma cadenciada, o processo pode levar até 15 minutos. Pode utilizar o resto do painel normalmente e recarregar a página mais tarde!` 
            });

        } catch (erro) {
            console.error('Erro no roteamento da matriz real:', erro);
            res.status(500).json({ erro: 'Falha ao acionar a matriz real.' });
        }
    });

    // =========================================================
    // ROTAS EXISTENTES DA DIPAT E OUTRAS
    // =========================================================
    app.get('/dipat', checkAuth, (req, res) => {
        try {
            const html = renderDipat(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a página DIPAT:', res.status(500).send('Erro interno ao carregar a página DIPAT.'));
        }
    });

    app.get('/api/dipat/analise/:item', checkAuth, async (req, res) => {
        try {
            const codigoItem = req.params.item;
            const db = require('../services/database').getDbConnection();
            
            const executarQuery = (sql, params = []) => {
                return new Promise((resolve, reject) => {
                    db.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
            };

            const rowsHistorico = await executarQuery(
                `SELECT data_historico, saldo_atual FROM historico_estoque WHERE UPPER(TRIM(item)) = ? ORDER BY data_historico ASC`, 
                [codigoItem.toUpperCase()]
            );
            
            if (!rowsHistorico || rowsHistorico.length === 0) {
                db.close();
                return res.json({ erro: 'Sem dados históricos suficientes para calculate tendência.' });
            }

            const mapaDias = new Map();
            rowsHistorico.forEach(row => {
                const dataHist = row.data_historico;
                if (!mapaDias.has(dataHist)) {
                    let valor = 0;
                    for (let k in row) {
                        const col = k.toLowerCase().trim();
                        if (col === 'saldo_atual' || col === 'saldo atual') {
                            valor = Number(row[k]) || 0;
                        }
                    }
                    mapaDias.set(dataHist, valor);
                }
            });
            const historico = Array.from(mapaDias.entries()).map(([data, valor]) => ({ data, valor }));
            
            const dadosLogisticaRaw = await executarQuery(
                'SELECT * FROM planilha_saldoabaixode90dias WHERE UPPER(TRIM(item)) = ? LIMIT 1',
                [codigoItem.toUpperCase()]
            );
            const logisticaLinha = dadosLogisticaRaw.length > 0 ? dadosLogisticaRaw[0] : {};
            let logistica = {
                num_empenho: '',
                qtde_a_receber: 0,
                saldo_da_ata: 0,
                venc_ata: '',
                processo_2: '',
                qtde: 0,
                ratingFornecedor: 5
            };

            for (const k in logisticaLinha) {
                const low = k.trim().toLowerCase();
                const val = logisticaLinha[k];
                if (low === 'num.empenho' || low === 'num_empenho' || low === 'empenho') logistica.num_empenho = String(val || '').trim();
                if (low === 'qtde_a_receber' || (low.includes('qtde') && low.includes('receber'))) logistica.qtde_a_receber = Number(val || 0);
                if (low === 'saldo_da_ata' || (low.includes('saldo') && low.includes('ata'))) logistica.saldo_da_ata = Number(String(val||'0').replace(',', '.')) || 0;
                if (low === 'venc_ata' || (low.includes('venc') && low.includes('ata'))) logistica.venc_ata = String(val || '').trim();
                if (low === 'processo_2' || low === 'processo_em_andamento' || low.includes('andamento')) logistica.processo_2 = String(val || '').trim();
                if (low === 'qtde') logistica.qtde = Number(val || 0);
            }

            if (logistica.num_empenho) {
                const numEmpenhoLimpo = String(logistica.num_empenho).replace(/\D/g, '');
                const empenhos = await executarQuery(
                    `SELECT data_empenho, data_ult_entrada FROM empenhos_entradaempenhos 
                     WHERE REPLACE(empenho, '/', '') LIKE ? OR UPPER(TRIM(cod_item)) = ?`,
                    [`%${numEmpenhoLimpo}%`, codigoItem.toUpperCase()]
                );
                
                if (empenhos.length > 0) {
                    let totalEstrelas = 0;
                    let empenhosAvaliados = 0;
                    empenhos.forEach(emp => {
                        if (emp.data_empenho && emp.data_ult_entrada) {
                            
                            const parseData = (str) => {
                                if (String(str).includes('/')) {
                                    const p = String(str).split(' ')[0].split('/'); 
                                    return new Date(`${p[2]}-${p[1]}-${p[0]}T12:00:00`);
                                }
                                return new Date(str);
                            };

                            const dEmp = parseData(emp.data_empenho);
                            const dEnt = parseData(emp.data_ult_entrada);
                            
                            if (!isNaN(dEmp.getTime()) && !isNaN(dEnt.getTime())) {
                                const diffDays = Math.ceil(Math.abs(dEnt - dEmp) / (1000 * 60 * 60 * 24));
                                const toleranciaCorridos = 17; 
                                
                                let estrelas = 1;
                                if (diffDays <= toleranciaCorridos) estrelas = 5;
                                else if (diffDays <= toleranciaCorridos + 5) estrelas = 4;
                                else if (diffDays <= toleranciaCorridos + 10) estrelas = 3;
                                else if (diffDays <= toleranciaCorridos + 20) estrelas = 2;
                                
                                totalEstrelas += estrelas;
                                empenhosAvaliados++;
                            }
                        }
                    });
                    if (empenhosAvaliados > 0) {
                        logistica.ratingFornecedor = Math.round(totalEstrelas / empenhosAvaliados);
                    }
                }
            }

            const ultimos6 = historico.slice(-6);
            const analiseBase = analisarTendenciaEProjetar(ultimos6, 6);

            let projecaoComIntervencao = [];
            if (!analiseBase.erro && historico.length > 0) {
                const saldoAtual = Number(historico[historico.length - 1].valor);
                const consumoProjetado = analiseBase.coeficienteAngular_b < 0 ? Math.abs(analiseBase.coeficienteAngular_b) : 0;
                projecaoComIntervencao = projetarComIntervencoes(saldoAtual, consumoProjetado, logistica, 6);
            }

            db.close();

            res.json({
                item: codigoItem,
                historicoOriginal: historico,
                analise: analiseBase,
                intervencio: projecaoComIntervencao,
                logistica: {
                    qtdeAReceber: Number(logistica.qtde_a_receber) || 0,
                    saldoAta: Number(logistica.saldo_da_ata) || 0,
                    vencAta: logistica.venc_ata || 'Sem Ata',
                    processo2: logistica.processo_2 || 'Não Iniciado',
                    qtdeProcesso2: Number(logistica.qtde) || 0,
                    ratingFornecedor: logistica.ratingFornecedor
                }
            });
        } catch (erro) {
            console.error('Erro interno na rota /api/dipat/analise:', erro);
            res.status(500).json({ erro: 'Falha ao processar a análise MQO do item.' });
        }
    });

    app.get('/api/dipat/itens', checkAuth, (req, res) => {
        try {
            const db = require('../services/database').getDbConnection();
            
            db.all("PRAGMA table_info(planilha_saldoabaixode90dias)", [], (errInfo, cols) => {
                if (errInfo || !cols) {
                    db.close();
                    return res.status(500).json({ erro: 'Erro ao ler estrutura do banco.' });
                }

                let colDesc = 'descricao'; 
                for (let c of cols) {
                    if (c.name.toLowerCase().includes('descri')) {
                        colDesc = c.name;
                        break;
                    }
                }

                const query = `
                    SELECT d.itens, p.${colDesc} AS descricao 
                    FROM itens_dipat d
                    LEFT JOIN planilha_saldoabaixode90dias p 
                        ON UPPER(TRIM(d.itens)) = UPPER(TRIM(p.item))
                    GROUP BY d.itens
                    ORDER BY d.itens ASC
                `;

                db.all(query, [], (err, rows) => {
                    db.close();
                    if (err) {
                        if (err.message.includes('no such table')) {
                            return res.json([]); 
                        }
                        console.error('Erro ao buscar itens_dipat:', err);
                        return res.status(500).json({ erro: 'Erro ao buscar itens da DIPAT no banco.' });
                    }
                    
                    const resultado = rows.map(r => ({
                        itens: r.itens,
                        descricao: r.descricao || 'Descrição não encontrada na planilha'
                    }));

                    res.json(resultado || []);
                });
            });
        } catch (erro) {
            console.error('Erro interno na rota /api/dipat/itens:', erro);
            res.status(500).json({ erro: 'Falha ao processar os itens DIPAT.' });
        }
    });

    app.get('/', checkAuth, async (req, res) => {
        try {
            const html = renderPainel({
                tipoPagina: 'status',
                statusRobo: getStatusRobo(),
                qrCodeImagem: getQrCodeImagem(),
                instanciaAtual: obterInstanciaAtual(),
                processosSuspeitos: await listarProcessosSuspeitos(),
                usuario: req.usuario
            });
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a página de status:', erro);
            res.status(500).send('Erro interno ao carregar o status.');
        }
    });

    app.get('/importacao', checkAuth, async (req, res) => {
        try {
            const html = renderPainel({ tipoPagina: 'importacao', usuario: req.usuario });
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a página de importação:', erro);
            res.status(500).send('Erro interno ao carregar a importação.');
        }
    });

    app.get('/consultas', checkAuth, async (req, res) => {
        try {
            const historico = await dbLerHistorico();
            const html = renderPainel({ tipoPagina: 'consultas', historico, usuario: req.usuario });
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar a página de consultas:', erro);
            res.status(500).send('Erro interno ao carregar as consultas.');
        }
    });

    app.get('/contatos', checkAuth, async (req, res) => {
        if (!client || !client.info) {
            return res.send('<h2>Aguarde a Hera ficar Online e ler o QR Code primeiro!</h2><br><a href="/">Voltar</a>');
        }

        let chats = [];
        try {
            chats = await client.getChats();
        } catch (erroChats) {
            console.error('Erro ao carregar a lista de chats do painel:', erroChats.message);
            return res.send(`
                <div style="padding: 20px; font-family: sans-serif; text-align: center;">
                    <h2>A Hera não conseguiu carregar os contatos no momento.</h2>
                    <p>O WhatsApp Web pode estar passando por atualizações ou sincronizando.</p>
                    <a href="/">Voltar ao Início</a>
                </div>
            `);
        }

        const chatsIndividuais = chats.filter(chat => !chat.isGroup);
        const html = renderContatos(chatsIndividuais, req.usuario);
        res.send(html);
    });

    app.get('/chat', checkAuth, (req, res) => {
        try {
            const html = renderChat(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar o chat web:', erro);
            res.status(500).send('Erro interno ao carregar o chat.');
        }
    });

    app.get('/api/chat/sessions', checkAuth, (req, res) => {
        const db = loadWebChats();
        const sessions = db.sessions.filter(s => String(s.userId) === String(req.usuario.id)).sort((a, b) => b.updatedAt - a.updatedAt);
        res.json(sessions);
    });

    app.post('/api/chat/sessions', checkAuth, (req, res) => {
        const db = loadWebChats();
        const newSession = { id: Date.now().toString(), userId: String(req.usuario.id), title: 'Nova Conversa', updatedAt: Date.now() };
        db.sessions.push(newSession);
        db.messages[newSession.id] = [];
        saveWebChats(db);
        res.json(newSession);
    });

    app.get('/api/chat/sessions/:id/messages', checkAuth, (req, res) => {
        const db = loadWebChats();
        const session = db.sessions.find(s => s.id === req.params.id);
        if(!session || String(session.userId) !== String(req.usuario.id)) return res.status(403).json([]);
        res.json(db.messages[req.params.id] || []);
    });

    app.delete('/api/chat/sessions/:id', checkAuth, (req, res) => {
        const db = loadWebChats();
        const id = req.params.id;
        const session = db.sessions.find(s => s.id === id);
        if(!session || String(session.userId) !== String(req.usuario.id)) return res.status(403).json({erro: 'Acesso negado'});
        
        db.sessions = db.sessions.filter(s => s.id !== id);
        delete db.messages[id];
        saveWebChats(db);
        res.json({ sucesso: true });
    });

    app.post('/api/chat/send', checkAuth, async (req, res) => {
        const { mensagem, sessionId } = req.body;
        if (!mensagem || !sessionId) return res.status(400).json({ erro: 'Dados incompletos.' });

        let db = loadWebChats();
        const session = db.sessions.find(s => s.id === sessionId);
        if(!session || String(session.userId) !== String(req.usuario.id)) return res.status(403).json({erro: 'Acesso negado'});

        if (!db.messages[sessionId]) db.messages[sessionId] = [];
        db.messages[sessionId].push({ id: Date.now().toString(), role: 'user', text: mensagem, timestamp: Date.now() });
        
        if (session && session.title === 'Nova Conversa') {
            session.title = mensagem.length > 25 ? mensagem.substring(0, 25) + '...' : mensagem;
        }
        if (session) session.updatedAt = Date.now();
        saveWebChats(db);

        let respostasBuffer = [];
        
        const mockClient = {
            sendMessage: async (jid, content, options) => {
                if (content.text) {
                    respostasBuffer.push(content.text);
                } else if (content.document) {
                    let fileName = content.fileName || `documento-gerado-${Date.now()}.pdf`;
                    fileName = fileName.replace(/_/g, '-'); 
                    
                    const filePath = path.join(downloadsDir, fileName);
                    
                    fs.writeFileSync(filePath, content.document);

                    const linkHtml = `<br><br>📁 <a href="/downloads/${fileName}" target="_blank" download="${fileName}" style="color: #3498db; text-decoration: none; background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; display: inline-block; font-weight: bold; border: 1px solid #3498db;">⬇️ Baixar ou Abrir: ${fileName}</a>`;
                    
                    if (content.caption) {
                        respostasBuffer.push(content.caption + linkHtml);
                    } else {
                        respostasBuffer.push(`Arquivo finalizado.` + linkHtml);
                    }
                }
                return { key: { id: 'mock_' + Date.now() } };
            }
        };

        const nomeIdentificador = req.usuario.login + ' (Web)';
        const mockMsgRaw = {
            key: { remoteJid: 'WEB_ADMIN@s.whatsapp.net', fromMe: false, id: 'WEB_' + Date.now() },
            messageTimestamp: Date.now() / 1000,
            pushName: nomeIdentificador,
            message: { conversation: mensagem }
        };

        try {
            await processarMensagemRecebida({ client: mockClient, mensagem: mockMsgRaw, tempoInicio: 0 });

            if (respostasBuffer.length === 0) {
                if (processarTextoComIA) {
                    const resultadoIA = await processarTextoComIA(mensagem, { name: nomeIdentificador }, [], false);
                    respostasBuffer.push(resultadoIA?.resposta || resultadoIA || 'Não entendi o comando e a IA não retornou uma resposta válida.');
                } else {
                    respostasBuffer.push('Comando não reconhecido e IA indisponível.');
                }
            }

            const textoFinal = respostasBuffer.join('\n\n');
            db = loadWebChats(); 
            db.messages[sessionId].push({ id: (Date.now()+1).toString(), role: 'hera', text: textoFinal, timestamp: Date.now() });
            saveWebChats(db);

            res.json({ resposta: textoFinal });
        } catch (erro) {
            console.error('[WEB CHAT] Erro no roteamento:', erro);
            res.status(500).json({ erro: 'Ocorreu um erro interno ao processar sua solicitação.' });
        }
    });

    app.get('/api/processos', checkAuth, async (req, res) => {
        try {
            res.json({
                instanciaAtual: obterInstanciaAtual(),
                processosSuspeitos: await listarProcessosSuspeitos()
            });
        } catch (erro) {
            res.status(500).json({ mensagem: 'Erro ao listar processos.' });
        }
    });

    app.post('/api/processos/kill', checkAuth, async (req, res) => {
        const { pid } = req.body;
        const resultado = await matarPid(pid);
        res.json(resultado);
    });

    app.post('/api/processos/kill-antigos', checkAuth, async (req, res) => {
        const resultado = await matarProcessosAntigosDaHera();
        res.json(resultado);
    });

    app.post('/api/processos/kill-navegadores', checkAuth, async (req, res) => {
        const resultado = await matarNavegadoresSuspeitos();
        res.json(resultado);
    });

    app.post('/api/analisar', checkAuth, async (req, res) => {
        const { chatId } = req.body;
        try {
            const chatAlvo = await client.getChatById(chatId);
            const contatoAlvo = await chatAlvo.getContact();
            const mensagensAntigas = await chatAlvo.fetchMessages({ limit: 30 });

            const historicoLimpo = mensagensAntigas.map(mensagem => {
                const remetente = mensagem.fromMe ? 'Flávio' : (contatoAlvo.name || contatoAlvo.number);
                return `${remetente}: ${mensagem.body}`;
            }).join('\n');

            const idContatoLimpo = chatId.replace('@c.us', '');
            const respostaAnalise = await analisarPerfilContato(historicoLimpo, idContatoLimpo, contatoAlvo.name);

            res.json({ mensagem: respostaAnalise });
        } catch (erro) {
            console.error('Erro na API de análise silenciosa:', erro);
            res.json({ mensagem: '❌ Erro interno ao puxar o histórico. Tente novamente.' });
        }
    });
    
    app.post('/api/cartao/cadastrar', checkAuth, async (req, res) => {
        try {
            const { codItem, valorTotal, fornecedor } = req.body;
            
            if (!codItem || !valorTotal || !fornecedor) {
                return res.status(400).json({ mensagem: 'Por favor, preencha todos os campos do formulário.' });
            }

            const resultado = await registrarCompraCartao(codItem, valorTotal, fornecedor);
            
            if (resultado.sucesso) {
                res.json({ mensagem: '✅ Compra via Cartão Corporativo registrada com sucesso no banco de dados!' });
            } else {
                throw new Error('Falha ao gravar no banco.');
            }
        } catch (erro) {
            console.error('Erro na rota de cadastro do cartão:', res.status(500).json({ mensagem: 'Ocorreu um erro interno ao salvar o lançamento.', erro: erro.message }));
        }
    });
	
    app.post('/api/db/importar-arquivos', checkAuth, async (req, res) => {
        try {
            const resultados = [];
            const { empenhos, planilha, movimentacao, historico, pcaList, pncpList, pdm, maiorConsumidor } = req.body;
            
            const tempDir = path.join(process.cwd(), 'data', 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            if (empenhos) {
                const caminhoEmpenhos = path.join(tempDir, empenhos.nome);
                fs.writeFileSync(caminhoEmpenhos, Buffer.from(empenhos.dados, 'base64'));
                const resEmpenhos = await importarEmpenhos(caminhoEmpenhos);
                resultados.push(resEmpenhos);
                fs.unlinkSync(caminhoEmpenhos);
            }

            if (planilha) {
                const caminhoPlanilha = path.join(tempDir, planilha.nome);
                fs.writeFileSync(caminhoPlanilha, Buffer.from(planilha.dados, 'base64'));
                const resPlanilha = await importarPlanilhaSaldo(caminhoPlanilha);
                resultados.push(resPlanilha);
                fs.unlinkSync(caminhoPlanilha);

                // --- GATILHO AUTOMÁTICO DO ALERTA DIPAT ---
                try {
                    console.log('⏳ Pausa estratégica de 10 segundos para estabilização do WhatsApp (Event Loop)...');
                    await new Promise(resolve => setTimeout(resolve, 10000));

                    console.log('🤖 Disparando rotina automática de Alertas DIPAT pós-importação...');
                    const relatorioDipat = await gerarRelatorioAlertasDipat();
                    
                    if (relatorioDipat && !relatorioDipat.erro && relatorioDipat.destinatarios) {
                        const fsLocal = require('fs');
                        const bufferExcel = fsLocal.readFileSync(relatorioDipat.filePath);
                        
                        let envios = 0;
                        for (const dest of relatorioDipat.destinatarios) {
                            const numeroLimpo = String(dest.telefone).replace(/\D/g, '');
                            if (numeroLimpo) {
                                const numeroWpp = numeroLimpo + '@s.whatsapp.net';
                                
                                let sucessoEnvio = false;
                                for (let tentativa = 1; tentativa <= 3; tentativa++) {
                                    try {
                                        await client.sendMessage(numeroWpp, { text: `Olá, ${dest.nome}!\n\n${relatorioDipat.mensagem}` });
                                        await client.sendMessage(numeroWpp, {
                                            document: bufferExcel,
                                            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                            fileName: `Alerta_DIPAT_${new Date().toISOString().split('T')[0]}.xlsx`,
                                            caption: '📊 Relatório DIPAT de Movimentações'
                                        });
                                        envios++;
                                        sucessoEnvio = true;
                                        break; 
                                    } catch(e) {
                                        console.error(`Erro ao enviar alerta DIPAT via WhatsApp para ${numeroWpp} (Tentativa ${tentativa}/3):`, e.message);
                                        if (tentativa < 3) {
                                            console.log('Aguardando 5 segundos antes de tentar novamente...');
                                            await new Promise(resolve => setTimeout(resolve, 5000));
                                        }
                                    }
                                }
                                
                                if (!sucessoEnvio) {
                                    console.error(`Falha definitiva ao enviar alerta para ${numeroWpp} após 3 tentativas.`);
                                }
                            }
                        }
                        resultados.push(`Alerta DIPAT disparado com sucesso para ${envios} contato(s).`);
                    } else if (relatorioDipat && relatorioDipat.erro) {
                        console.log('Aviso DIPAT (não disparado):', relatorioDipat.erro);
                    }
                } catch (erroAlerta) {
                    console.error('Erro ao processar gatilho automático do alerta DIPAT:', erroAlerta);
                    resultados.push('A importação concluiu, mas houve falha ao tentar disparar o alerta DIPAT.');
                }
                // --- FIM DO GATILHO AUTOMÁTICO ---
            }

            if (historico && historico.dados) {
                const caminhoHistorico = path.join(tempDir, historico.nome);
                fs.writeFileSync(caminhoHistorico, Buffer.from(historico.dados, 'base64'));
                const resHistorico = await importarHistoricoRetroativo(caminhoHistorico, historico.data || null);
                resultados.push(resHistorico);
                fs.unlinkSync(caminhoHistorico);
            }

            if (movimentacao) {
                const caminhoMovimentacao = path.join(tempDir, movimentacao.nome);
                fs.writeFileSync(caminhoMovimentacao, Buffer.from(movimentacao.dados, 'base64'));
                const resMovimentacao = await importarMovimentacaoAnosAnteriores(caminhoMovimentacao);
                resultados.push(resMovimentacao);
                fs.unlinkSync(caminhoMovimentacao);
            }

            if (pdm) {
                const caminhoPdm = path.join(tempDir, pdm.nome);
                fs.writeFileSync(caminhoPdm, Buffer.from(pdm.dados, 'base64'));
                const resPdm = await importarPdm(caminhoPdm);
                resultados.push(resPdm);
                fs.unlinkSync(caminhoPdm);
            }

            if (maiorConsumidor) {
                const caminhoMc = path.join(tempDir, maiorConsumidor.nome);
                fs.writeFileSync(caminhoMc, Buffer.from(maiorConsumidor.dados, 'base64'));
                const resMc = await importarMaiorConsumidor(caminhoMc);
                resultados.push(resMc);
                fs.unlinkSync(caminhoMc);
            }

            if (pcaList && pcaList.length > 0) {
                for (const pcaFile of pcaList) {
                    const caminhoPca = path.join(tempDir, pcaFile.nome);
                    fs.writeFileSync(caminhoPca, Buffer.from(pcaFile.dados, 'base64'));
                    const resPca = await importarPcaBanco(caminhoPca);
                    resultados.push(resPca);
                    fs.unlinkSync(caminhoPca);
                }
            }

            if (pncpList && pncpList.length > 0) {
                for (const pncpFile of pncpList) {
                    const caminhoPncp = path.join(tempDir, pncpFile.nome);
                    fs.writeFileSync(caminhoPncp, Buffer.from(pncpFile.dados, 'base64'));
                    const resPncp = await importarPncpBanco(caminhoPncp);
                    resultados.push(resPncp);
                    fs.unlinkSync(caminhoPncp);
                }
            }

            // --- LIMPEZA DE CACHE DE TENDÊNCIAS ---
            try {
                const cachePath = path.join(process.cwd(), 'data', 'cache_tendencias.json');
                if (fs.existsSync(cachePath)) {
                    fs.unlinkSync(cachePath);
                    console.log('🧹 Cache de tendências apagado devido a nova importação.');
                    resultados.push('Cache de tendências invalidado com sucesso.');
                }
            } catch (e) {
                console.error('Erro ao apagar cache de tendências:', e);
            }

            res.json({ mensagem: 'Processamento concluído com sucesso!', detalhes: resultados });
        } catch (erro) {
            console.error('Erro na rota de importação de arquivos:', erro);
            res.status(500).json({ mensagem: 'Erro interno ao importar os arquivos.', erro: erro.message });
        }
    });

    app.post('/api/restart-hera', checkAuth, async (req, res) => {
        try {
            console.log('🔄 Iniciando protocolo de reset total da Hera (resetar-hera.ps1)...');
            res.json({ mensagem: 'A Hera executará o protocolo de reset agora. O painel ficará offline por segundos e tentará reconectar.' });
            
            setTimeout(() => {
                const scriptPath = path.join(process.cwd(), 'resetar-hera.ps1');
                const child = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
            }, 1000);

        } catch (erro) {
            console.error('Erro ao reiniciar a Hera:', erro);
            res.status(500).json({ mensagem: 'Erro ao tentar iniciar o script de reset.' });
        }
    });

    app.get('/dashboard', checkAuth, (req, res) => {
        try {
            const html = renderDashboard(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar o dashboard:', erro);
            res.status(500).send('Erro interno ao carregar o dashboard.');
        }
    });

    // =========================================================
    // NOVA ROTA: PAINEL EXECUTIVO (DIRGER)
    // =========================================================
    app.get('/painel-executivo', checkAuth, (req, res) => {
        try {
            const html = renderPainelExecutivo(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar o painel executivo:', erro);
            res.status(500).send('Erro interno ao carregar o painel executivo.');
        }
    });

    app.get('/api/painel-executivo-stats', checkAuth, async (req, res) => {
        try {
            const estatisticas = await getEstatisticasPainelExecutivo();
            res.json(estatisticas);
        } catch (erro) {
            console.error('Erro ao buscar estatísticas do painel executivo:', erro);
            res.status(500).json({ erro: 'Falha ao processar estatísticas' });
        }
    });

    app.get('/api/cotas/:item', checkAuth, async (req, res) => {
        try {
            const db = require('../services/database').getDbConnection();
            const item = req.params.item;
            const queryMC = `SELECT * FROM maior_usuario_consumidor WHERE UPPER(TRIM(codigo_ems)) = ? OR UPPER(TRIM(codigo_do_material)) = ?`;
            
            db.all(queryMC, [item, item], (err, rows) => {
                db.close();
                if (err) return res.status(500).json({ erro: 'Erro ao consultar banco de cotas.' });
                
                if (!rows || rows.length === 0) return res.json([]);

                const cotasCalculadas = rows.map(mc => {
                    const qtdBase = mc.quantidade_cota || 0;
                    const tipoCota = String(mc.tipo_cota || '').trim().toLowerCase();
                    let multiplicador = 1;
                    
                    if (tipoCota.includes('diario') || tipoCota.includes('diário')) multiplicador = 30;
                    else if (tipoCota.includes('semanal')) multiplicador = 4;
                    
                    return {
                        ...mc,
                        totalCotaMes: qtdBase * multiplicador,
                        qtdBase,
                        tipoCotaOriginal: mc.tipo_cota || 'N/A'
                    };
                }).sort((a, b) => b.totalCotaMes - a.totalCotaMes).slice(0, 10); // TOP 10
                
                res.json(cotasCalculadas);
            });
        } catch (erro) {
            console.error('Erro na rota de cotas:', erro);
            res.status(500).json({ erro: 'Falha ao buscar cotas.' });
        }
    });

    app.get('/dashboard-dinamico', checkAuth, (req, res) => {
        try {
            const html = renderDashboardDinamico(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar o dashboard dinâmico:', erro);
            res.status(500).send('Erro interno ao carregar o dashboard dinâmico.');
        }
    });

    app.get('/tendencias', checkAuth, (req, res) => {
        try {
            const html = renderTendencias(req.usuario);
            res.send(html);
        } catch (erro) {
            console.error('Erro ao renderizar tendências:', erro);
            res.status(500).send('Erro interno ao carregar a página de tendências.');
        }
    });

    app.get('/api/dashboard-stats', checkAuth, async (req, res) => {
        try {
            const ignorar116 = req.query.ignorar116 === 'true';
            const ignorarSemDemanda = req.query.ignorarSemDemanda === 'true'; 
            const ignorarAvn = req.query.ignorarAvn === 'true'; // Novo filtro capturado da URL
            
            const estatisticas = await getEstatisticasDashboard(ignorar116, ignorarSemDemanda, ignorarAvn);
            res.json(estatisticas);
        } catch (erro) {
            console.error('Erro ao buscar estatísticas do dashboard:', erro);
            res.status(500).json({ erro: 'Falha ao processar estatísticas' });
        }
    });

    app.get('/api/dados-dinamicos', checkAuth, async (req, res) => {
        try {
            const ignorarAvn = req.query.ignorarAvn === 'true'; // Novo filtro capturado da URL
            const dados = await getDadosDinamicos(ignorarAvn);
            res.json(dados);
        } catch (erro) {
            console.error('Erro ao buscar dados dinâmicos:', erro);
            res.status(500).json({ erro: 'Falha ao processar dados dinâmicos' });
        }
    });

    app.get('/api/tendencias-stats', checkAuth, async (req, res) => {
        try {
            const local = req.query.local || 'Todos';
            const estatisticas = await getEstatisticasTendencias(local);
            res.json(estatisticas);
        } catch (erro) {
            console.error('Erro ao buscar estatísticas de tendências:', erro);
            res.status(500).json({ erro: 'Falha ao processar tendências' });
        }
    });

    app.post('/api/gerar-ppt', checkAuth, async (req, res) => {
        try {
            const { graficosBase64, estatisticas } = req.body;
            
            if (!graficosBase64 || !estatisticas) {
                return res.status(400).json({ erro: 'Dados insuficientes para gerar a apresentação. Faltam gráficos ou estatísticas.' });
            }

            console.log('📊 Iniciando geração de apresentação executiva PPTX...');
            
            const bufferPpt = await criarApresentacao(graficosBase64, estatisticas);

            console.log('✅ Apresentação gerada com sucesso! Enviando para download.');

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            res.setHeader('Content-Disposition', 'attachment; filename="Relatorio_Executivo_Suprimentos.pptx"');
            
            res.send(bufferPpt);
        } catch (erro) {
            console.error('❌ Erro na rota de geração de PPT:', erro);
            res.status(500).json({ erro: 'Ocorreu uma falha interna ao gerar a apresentação de PowerPoint.' });
        }
    });
}

module.exports = { registrarRotasPainel };
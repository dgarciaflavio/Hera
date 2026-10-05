const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const crypto = require('crypto');
const { pcaCadastroPath } = require('../config/paths');
const { getDbConnection } = require('./database');

const UASG_FIXA = '250052';

function garantirDiretorio(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function normalizarValor(valor) {
    return String(valor || '').trim();
}

// Normalização radical: remove acentos, espaços, símbolos e converte para minúsculo
function normalizarCabecalho(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

// Leitor utilizando a biblioteca oficial xlsx para lidar com qualquer extensão sem quebrar com aspas duplas
function lerPlanilhaSegura(caminhoArquivo) {
    const dados = [];
    
    // A biblioteca xlsx consegue interpretar CSVs nativamente se não passarmos opções conflitantes
    const workbook = xlsx.readFile(caminhoArquivo, { raw: false });
    
    workbook.SheetNames.forEach(nomeAba => {
        const aba = workbook.Sheets[nomeAba];
        if (!aba) return;
        const json = xlsx.utils.sheet_to_json(aba, { defval: '' });
        json.forEach(linha => {
            const obj = {};
            for (const [k, v] of Object.entries(linha)) {
                obj[normalizarCabecalho(k)] = String(v || '').trim();
            }
            dados.push(obj);
        });
    });
    
    return dados;
}

function extrairInteiro(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return null;
    const match = texto.match(/\d+/);
    if (!match) return null;
    const numero = parseInt(match[0], 10);
    return Number.isNaN(numero) ? null : numero;
}

function agruparSequenciaisEmIntervalos(numeros) {
    const numerosValidos = Array.from(
        new Set(numeros.map(extrairInteiro).filter(numero => Number.isInteger(numero)))
    ).sort((a, b) => a - b);

    if (!numerosValidos.length) return '';

    const grupos = [];
    let inicio = numerosValidos[0];
    let fim = numerosValidos[0];

    for (let i = 1; i < numerosValidos.length; i++) {
        const atual = numerosValidos[i];
        if (atual === fim + 1) {
            fim = atual;
            continue;
        }
        grupos.push(inicio === fim ? `${inicio}` : `${inicio} a ${fim}`);
        inicio = atual;
        fim = atual;
    }
    grupos.push(inicio === fim ? `${inicio}` : `${inicio} a ${fim}`);

    return grupos.join(', ');
}

function montarInformacoesComplementares(statusContratacao, situacaoExecucao, encontrouPncp) {
    if (encontrouPncp) return '';
    return [
        'Informações complementares:',
        `Status da contratação: ${statusContratacao || ''}`,
        `Situação da Execução: ${situacaoExecucao || ''}`
    ].join('\n');
}

function montarBlocoResposta({
    idPcaPncp,
    dataPublicacaoPncp,
    idsAgrupados,
    classesGrupos,
    identificador,
    informacoesComplementares
}) {
    const linhas = [
        `I) ID PCA no PNCP: ${idPcaPncp}`,
        `II) Data de publicação no PNCP: ${dataPublicacaoPncp}`,
        `III) Id do item no PCA: ${idsAgrupados}`,
        `IV) Classe/Grupo: ${classesGrupos}`,
        `V) Identificador da Futura Contratação: ${identificador}`
    ];

    if (informacoesComplementares) {
        linhas.push('');
        linhas.push(informacoesComplementares);
    }
    return linhas.join('\n');
}

function lerCadastroPcaJson() {
    try {
        garantirDiretorio(path.dirname(pcaCadastroPath));
        if (!fs.existsSync(pcaCadastroPath)) {
            fs.writeFileSync(pcaCadastroPath, JSON.stringify({ anos: {} }, null, 2), 'utf-8');
        }
        const conteudo = fs.readFileSync(pcaCadastroPath, 'utf-8');
        const json = JSON.parse(conteudo);
        if (!json || typeof json !== 'object') return { anos: {} };
        if (!json.anos || typeof json.anos !== 'object') json.anos = {};
        return json;
    } catch (erro) {
        return { anos: {} };
    }
}

function salvarCadastroPcaJson(dados) {
    garantirDiretorio(path.dirname(pcaCadastroPath));
    fs.writeFileSync(pcaCadastroPath, JSON.stringify(dados, null, 2), 'utf-8');
}

function cadastrarPca({ ano, idPcaPncp, dataPublicacaoPncp }) {
    const anoNormalizado = normalizarValor(ano);
    const idNormalizado = normalizarValor(idPcaPncp);
    const dataNormalizada = normalizarValor(dataPublicacaoPncp);

    if (!/^\d{4}$/.test(anoNormalizado)) {
        return { sucesso: false, mensagem: '❌ Ano inválido. Informe no formato AAAA.' };
    }

    const baseAtual = lerCadastroPcaJson();
    baseAtual.anos[anoNormalizado] = {
        ano: anoNormalizado,
        idPcaPncp: idNormalizado,
        dataPublicacaoPncp: dataNormalizada,
        atualizadoEm: new Date().toISOString()
    };
    salvarCadastroPcaJson(baseAtual);

    return {
        sucesso: true,
        mensagem: `✅ CadastroPCA salvo.\n\nAno do PCA: ${anoNormalizado}\nId pca PNCP: ${idNormalizado}\nData de publicação no PNCP: ${dataNormalizada}`
    };
}

function obterCadastroPcaPorAno(ano) {
    const baseAtual = lerCadastroPcaJson();
    return baseAtual.anos[normalizarValor(ano)] || null;
}

// === FUNÇÕES DE ACESSO E IMPORTAÇÃO DE BANCO DE DADOS ===

function executarQuerySql(query, parametros = []) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(query, parametros, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function inicializarTabelasDfd() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS pca_dados (
                    hash_linha TEXT PRIMARY KEY,
                    ano INTEGER,
                    numero_contratacao TEXT,
                    status_contratacao TEXT,
                    situacao_execucao TEXT,
                    titulo_contratacao TEXT,
                    categoria_contratacao TEXT,
                    uasg_atual TEXT,
                    data_inicio_processo TEXT,
                    data_conclusao_processo TEXT,
                    prazo_duracao_processo TEXT,
                    area_requisitante TEXT,
                    numero_dfd TEXT,
                    prioridade TEXT,
                    numero_item_dfd TEXT,
                    data_conclusao_dfd TEXT,
                    classificacao_contratacao TEXT,
                    codigo_classe_grupo TEXT,
                    nome_classe_grupo TEXT,
                    codigo_pdm_material TEXT,
                    nome_pdm_material TEXT,
                    codigo_material_servico TEXT,
                    descricao_material_servico TEXT,
                    unidade_fornecimento TEXT,
                    valor_unitario TEXT,
                    quantidade TEXT,
                    valor_total TEXT
                )
            `);
            
            db.run(`
                CREATE TABLE IF NOT EXISTS pncp_dados (
                    hash_linha TEXT PRIMARY KEY,
                    ano INTEGER,
                    unidade_responsavel TEXT,
                    uasg TEXT,
                    id_item_pca TEXT,
                    categoria_item TEXT,
                    identificador TEXT,
                    nome_contratacao TEXT,
                    catalogo_utilizado TEXT,
                    classificacao_catalogo TEXT,
                    codigo_classe_grupo TEXT,
                    nome_classe_grupo TEXT,
                    codigo_pdm_item TEXT,
                    nome_pdm_item TEXT,
                    codigo_item TEXT,
                    descricao_item TEXT,
                    unidade_fornecimento TEXT,
                    quantidade_estimada TEXT,
                    valor_unitario_estimado TEXT,
                    valor_total_estimado TEXT,
                    valor_orcamentario_estimado TEXT,
                    data_desejada TEXT
                )
            `, (err) => {
                db.close();
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

async function importarPcaBanco(caminhoArquivo) {
    await inicializarTabelasDfd();
    
    return new Promise((resolve, reject) => {
        try {
            const dados = lerPlanilhaSegura(caminhoArquivo);
            let linhasInseridas = 0;

            const db = getDbConnection();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const stmt = db.prepare(`
                    INSERT OR IGNORE INTO pca_dados (
                        hash_linha, ano, numero_contratacao, status_contratacao, situacao_execucao, titulo_contratacao,
                        categoria_contratacao, uasg_atual, data_inicio_processo, data_conclusao_processo,
                        prazo_duracao_processo, area_requisitante, numero_dfd, prioridade, numero_item_dfd,
                        data_conclusao_dfd, classificacao_contratacao, codigo_classe_grupo, nome_classe_grupo,
                        codigo_pdm_material, nome_pdm_material, codigo_material_servico, descricao_material_servico,
                        unidade_fornecimento, valor_unitario, quantidade, valor_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                dados.forEach((linha) => {
                    const numeroContratacao = linha['numerodacontratacao'] || '';
                    if (!numeroContratacao) return;

                    let anoDetectado = new Date().getFullYear();
                    const matchAno = numeroContratacao.match(/\/(\d{4})$/);
                    if (matchAno) anoDetectado = parseInt(matchAno[1], 10);

                    // Gerando um hash único com aleatoriedade forte para não colidir entre múltiplos arquivos
                    const hashLinha = crypto.createHash('md5').update(JSON.stringify(linha) + crypto.randomBytes(8).toString('hex')).digest('hex');

                    stmt.run([
                        hashLinha, anoDetectado, numeroContratacao, linha['statusdacontratacao'], linha['situacaodaexecucao'], linha['titulodacontratacao'],
                        linha['categoriadacontratacao'], linha['uasgatual'] || linha['uasg'], linha['dataestimadaparaoiniciodoprocessodecontratacao'], linha['dataestimadaparaaconclusaodoprocessodecontratacao'],
                        linha['prazoestimadodeduracaodoprocessodecontratacaodias'], linha['arearequisitante'], linha['ndfd'] || linha['nodfd'] || linha['numerodfd'] || linha['dfd'], linha['prioridade'], linha['nodoitemnodfd'] || linha['itemnodfd'],
                        linha['datadaconclusaodacontratacaonodfd'], linha['classificacaodacontratacao'], linha['codigoclassegrupo'], linha['nomeclassegrupo'],
                        linha['codigopdmmaterial'], linha['nomepdmmaterial'] || linha['nomedopdmmaterial'], linha['codigomaterialservico'], linha['descricaomaterialservico'],
                        linha['unidadefornecimento'] || linha['unidadedefornecimento'], linha['valorunitario'], linha['quantidade'] || linha['quantidadeestimada'], linha['valortotal']
                    ]);
                    linhasInseridas++;
                });

                stmt.finalize();
                db.run('COMMIT', (err) => {
                    db.close();
                    if (err) reject(new Error(`Erro no commit do PCA: ${err.message}`));
                    else resolve(`Arquivo PCA processado: ${linhasInseridas} registros inseridos.`);
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar PCA: ${error.message}`));
        }
    });
}

async function importarPncpBanco(caminhoArquivo) {
    await inicializarTabelasDfd();
    return new Promise((resolve, reject) => {
        try {
            const dados = lerPlanilhaSegura(caminhoArquivo);
            let linhasInseridas = 0;
            let linhasIgnoradasUasg = 0;

            const db = getDbConnection();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const stmt = db.prepare(`
                    INSERT OR IGNORE INTO pncp_dados (
                        hash_linha, ano, unidade_responsavel, uasg, id_item_pca, categoria_item, identificador,
                        nome_contratacao, catalogo_utilizado, classificacao_catalogo, codigo_classe_grupo,
                        nome_classe_grupo, codigo_pdm_item, nome_pdm_item, codigo_item, descricao_item,
                        unidade_fornecimento, quantidade_estimada, valor_unitario_estimado,
                        valor_total_estimado, valor_orcamentario_estimado, data_desejada
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                dados.forEach((linha) => {
                    const uasgBruto = linha['uasg'] || linha['unidadegestora'] || '';
                    const uasgLimpo = String(uasgBruto).replace(/\D/g, ''); 
                    
                    if (uasgLimpo !== UASG_FIXA) {
                        linhasIgnoradasUasg++;
                        return;
                    }

                    const identificador = linha['identificadordafuturacontratacao'] || linha['identificador'] || '';

                    let anoDetectado = new Date().getFullYear();
                    const matchAno = identificador.match(/\/(\d{4})$/);
                    if (matchAno) anoDetectado = parseInt(matchAno[1], 10);

                    // Gerando um hash único com aleatoriedade forte para não colidir entre múltiplos arquivos
                    const hashLinha = crypto.createHash('md5').update(JSON.stringify(linha) + crypto.randomBytes(8).toString('hex')).digest('hex');

                    stmt.run([
                        hashLinha, anoDetectado, linha['unidaderesponsavel'], uasgBruto, linha['iddoitemnopca'] || linha['iddoitem'], linha['categoriadoitem'], identificador,
                        linha['nomedafuturacontratacao'], linha['catalogoutilizado'], linha['classificacaodocatalogo'], linha['codigodaclassificacaosuperiorclassegrupo'] || linha['codigoclassegrupo'],
                        linha['nomedaclassificacaosuperiorclassegrupo'] || linha['nomeclassegrupo'], linha['codigodopdmodoitem'] || linha['codigopdmitem'], linha['nomedopdmodoitem'] || linha['nomepdmitem'], linha['codigodoitem'], linha['descricaodoitem'],
                        linha['unidadedefornecimento'] || linha['unidadefornecimento'], linha['quantidadeestimada'], 
                        linha['valorunitarioestimador'] || linha['valorunitarioestimado'], 
                        linha['valortotalestimador'] || linha['valortotalestimado'], 
                        linha['valororcamentarioestimadoparaoexercicior'] || linha['valororcamentarioestimado'], 
                        linha['datadesejada']
                    ]);
                    linhasInseridas++;
                });

                stmt.finalize();
                db.run('COMMIT', (err) => {
                    db.close();
                    if (err) reject(new Error(`Erro no commit do PNCP: ${err.message}`));
                    else resolve(`Arquivo PNCP processado: ${linhasInseridas} registros válidos (Ignorados de outras UASGs: ${linhasIgnoradasUasg}).`);
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar PNCP: ${error.message}`));
        }
    });
}

// === LÓGICA PRINCIPAL ===

async function consultarDfd(numeroDfd) {
    try {
        await inicializarTabelasDfd();
        const numeroInformado = normalizarValor(numeroDfd);

        if (!numeroInformado) {
            return 'Por favor, informe o número do DFD. Exemplo: DFD 268/2025';
        }

        const numeroLimpo = numeroInformado.replace(/^0+/, '');

        const registrosPca = await executarQuerySql(
            `SELECT numero_contratacao, status_contratacao, situacao_execucao 
             FROM pca_dados 
             WHERE LTRIM(numero_dfd, '0') = ? OR numero_dfd = ?`,
            [numeroLimpo, numeroInformado]
        );

        if (!registrosPca.length) {
            return `❌ Nenhum registro foi encontrado para o DFD ${numeroInformado} no banco de dados da Hera. Aguarde a atualização ou ligue para o ramal 5747!`;
        }

        const mapaContratacoes = new Map();
        registrosPca.forEach(linha => {
            const numeroContratacao = linha.numero_contratacao;
            const registroAtual = mapaContratacoes.get(numeroContratacao) || {
                numeroContratacao,
                statusContratacao: '',
                situacaoExecucao: ''
            };
            if (!registroAtual.statusContratacao && linha.status_contratacao) {
                registroAtual.statusContratacao = linha.status_contratacao;
            }
            if (!registroAtual.situacaoExecucao && linha.situacao_execucao) {
                registroAtual.situacaoExecucao = linha.situacao_execucao;
            }
            mapaContratacoes.set(numeroContratacao, registroAtual);
        });

        const contratacoesAgrupadas = Array.from(mapaContratacoes.values());
        const blocosProcessados = [];

        for (const registroPca of contratacoesAgrupadas) {
            const numeroContratacao = registroPca.numeroContratacao;
            const anoDaContratacao = (numeroContratacao.match(/\/(\d{4})$/) || [])[1] || '';
            const cadastroAno = anoDaContratacao ? obterCadastroPcaPorAno(anoDaContratacao) : null;

            const identificador = `${UASG_FIXA}-${numeroContratacao}`;
            
            const linhasPncp = await executarQuerySql(
                `SELECT id_item_pca, codigo_classe_grupo 
                 FROM pncp_dados 
                 WHERE identificador = ?`,
                [identificador]
            );
            
            const encontrouPncp = linhasPncp.length > 0;

            const idsAgrupados = agruparSequenciaisEmIntervalos(
                linhasPncp.map(linha => linha.id_item_pca)
            );

            const classesGruposSet = new Set();
            linhasPncp.forEach(linha => {
                if (linha.codigo_classe_grupo) classesGruposSet.add(linha.codigo_classe_grupo);
            });
            const classesGrupos = Array.from(classesGruposSet).join(', ');

            const informacoesComplementares = montarInformacoesComplementares(
                registroPca.statusContratacao,
                registroPca.situacaoExecucao,
                encontrouPncp
            );

            const bloco = montarBlocoResposta({
                idPcaPncp: cadastroAno?.idPcaPncp || '',
                dataPublicacaoPncp: cadastroAno?.dataPublicacaoPncp || '',
                idsAgrupados,
                classesGrupos,
                identificador,
                informacoesComplementares
            });

            blocosProcessados.push(bloco);
        }

        return blocosProcessados.join('\n\n');
    } catch (erro) {
        console.error('Erro ao consultar DFD no banco:', erro);
        return '❌ Ocorreu um erro ao processar a consulta do DFD no banco de dados.';
    }
}

module.exports = {
    consultarDfd,
    cadastrarPca,
    obterCadastroPcaPorAno,
    importarPcaBanco,
    importarPncpBanco
};
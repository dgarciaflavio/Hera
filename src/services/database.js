// src/services/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');
const crypto = require('crypto');

const dbPath = path.join(process.cwd(), 'data', 'hera.db');

// ATIVAÇÃO DO MODO WAL E BUSY TIMEOUT PARA ACABAR COM SQLITE_BUSY
function getDbConnection() {
    const db = new sqlite3.Database(dbPath);
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA busy_timeout = 15000;"); // Espera até 15s se o banco estiver travado
    return db;
}

function processarCabecalhosPlanilha(cabecalhos) {
    const contagem = {};

    return cabecalhos.map((c, i) => {
        let nome = String(c || '').trim();

        if (nome.toLowerCase().includes('saldo em dias (calculado)')) {
            nome = 'Saldo em Dias';
        }

        if (!nome) nome = `Coluna_${i}`;
        
        if (contagem[nome]) {
            contagem[nome]++;
            return `${nome}_${contagem[nome]}`;
        }
        contagem[nome] = 1;
        return nome;
    });
}

function gerarNomesColunasSql(cabecalhos) {
    return cabecalhos.map(c => {
        let limpo = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        limpo = limpo.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        limpo = limpo.replace(/_+/g, '_');
        limpo = limpo.replace(/_$/g, '');
        if (/^[0-9]/.test(limpo)) limpo = 'c_' + limpo;
        return limpo;
    });
}

function processarCsvBlindado(caminhoArquivo) {
    const buffer = fs.readFileSync(caminhoArquivo);
    let conteudo = buffer.toString('utf8');
    
    if (conteudo.includes('\ufffd')) {
        conteudo = buffer.toString('latin1');
    }

    let separador = ',';
    let primeiraLinhaFim = conteudo.indexOf('\n');
    if (primeiraLinhaFim === -1) primeiraLinhaFim = conteudo.length;
    let primeiraLinha = conteudo.substring(0, primeiraLinhaFim);
    
    if (primeiraLinha.includes(';')) separador = ';';

    const linhas = [];
    let inQuote = false;
    let val = '';
    let linhaAtual = [];

    for (let i = 0; i < conteudo.length; i++) {
        const c = conteudo[i];
        if (c === '"') {
            if (inQuote && conteudo[i + 1] === '"') {
                val += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (c === separador && !inQuote) {
            linhaAtual.push(val.trim());
            val = '';
        } else if ((c === '\n' || c === '\r') && !inQuote) {
            if (c === '\r' && conteudo[i + 1] === '\n') i++;
            linhaAtual.push(val.trim());
            if (linhaAtual.length > 1 || linhaAtual[0] !== '') {
                linhas.push(linhaAtual);
            }
            linhaAtual = [];
            val = '';
        } else {
            val += c;
        }
    }
    if (val || linhaAtual.length > 0) {
        linhaAtual.push(val.trim());
        linhas.push(linhaAtual);
    }
    
    if (linhas.length > 0 && linhas[0][0] && linhas[0][0].charCodeAt(0) === 0xFEFF) {
        linhas[0][0] = linhas[0][0].slice(1);
    }
    return linhas;
}

function executarQuerySql(query, parametros = []) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(query, parametros, (err, rows) => {
            db.close();
            if (err) {
                if (err.message.includes('no such table')) resolve([]);
                else reject(err);
            }
            else resolve(rows || []);
        });
    });
}

// =======================================================
// IMPORTAÇÕES (BLINDADAS COM TRANSAÇÃO SÍNCRONA)
// =======================================================

async function importarEmpenhos(caminhoAbsoluto) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(caminhoAbsoluto)) return resolve(` Arquivo de empenhos não encontrado.`);
        try {
            let dados = [];
            if (caminhoAbsoluto.toLowerCase().endsWith('.csv')) {
                dados = processarCsvBlindado(caminhoAbsoluto);
            } else {
                const workbook = xlsx.readFile(caminhoAbsoluto);
                const aba = workbook.Sheets[workbook.SheetNames[0]]; 
                dados = xlsx.utils.sheet_to_json(aba, { header: 1, defval: '' });
            }
            
            if (dados.length < 2) return resolve(` O arquivo de empenhos está vazio.`);
            
            const cabecalhos = dados[0].map((c, i) => String(c || `Coluna_${i}`).trim());
            const colunasDb = gerarNomesColunasSql(cabecalhos);
            const colunasDef = colunasDb.map(c => `${c} TEXT`).join(', ');
            const placeholders = colunasDb.map(() => '?').join(', ');
            const nomeTabela = 'empenhos_entradaempenhos';
            
            const db = getDbConnection();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(`DROP TABLE IF EXISTS ${nomeTabela}`);
                db.run(`CREATE TABLE ${nomeTabela} (${colunasDef})`);
                
                let hasError = false;
                let errorMsg = '';
                
                try {
                    const stmt = db.prepare(`INSERT INTO ${nomeTabela} VALUES (${placeholders})`);
                    for (let i = 1; i < dados.length; i++) {
                        const linha = dados[i];
                        const valores = colunasDb.map((_, idx) => linha[idx] !== undefined ? String(linha[idx]) : '');
                        stmt.run(valores, (err) => { if (err && !hasError) { hasError = true; errorMsg = err.message; }});
                    }
                    stmt.finalize();
                } catch(e) {
                    hasError = true;
                    errorMsg = e.message;
                }
                
                db.get("SELECT 1", () => {
                    if (hasError) {
                        db.run('ROLLBACK', () => { db.close(); reject(new Error(`Erro de inserção (Banco travado?): ${errorMsg}`)); });
                    } else {
                        db.run('COMMIT', (err) => {
                            db.close();
                            if (err) reject(err);
                            else resolve(` Arquivo de Empenhos importado com sucesso (${dados.length - 1} linhas inseridas).`);
                        });
                    }
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar Empenhos: ${error.message}`));
        }
    });
}

async function importarPlanilhaSaldo(caminhoAbsoluto, dataRetroativa = null) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(caminhoAbsoluto)) return resolve(` Arquivo da planilha não encontrado.`);
        try {
            let dados = [];
            if (caminhoAbsoluto.toLowerCase().endsWith('.csv')) {
                const csvDados = processarCsvBlindado(caminhoAbsoluto);
                dados = csvDados.slice(1);
            } else {
                const workbook = xlsx.readFile(caminhoAbsoluto);
                const aba = workbook.Sheets[workbook.SheetNames[0]]; 
                dados = xlsx.utils.sheet_to_json(aba, { header: 1, defval: '', range: 1 });
            }
            
            if (dados.length < 2) return resolve(` O arquivo da planilha está vazio ou não há dados após pular a linha 1.`);
            
            const cabecalhos = processarCabecalhosPlanilha(dados[0]);
            const colunasDb = gerarNomesColunasSql(cabecalhos);
            
            const colunasDef = colunasDb.map(c => `${c} TEXT`).join(', ');
            const placeholders = colunasDb.map(() => '?').join(', ');
            
            const colunasDefHistorico = `data_historico TEXT, ` + colunasDef;
            const placeholdersHistorico = '?, ' + placeholders;

            const dataFoto = dataRetroativa || new Date().toISOString().split('T')[0];
            const colunasInsert = colunasDb.join(', ');
            
            const db = getDbConnection();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                db.run(`DROP TABLE IF EXISTS planilha_saldoabaixode90dias`);
                db.run(`CREATE TABLE planilha_saldoabaixode90dias (${colunasDef})`);
                
                db.run(`CREATE TABLE IF NOT EXISTS historico_estoque (data_historico TEXT, ${colunasDef})`);

                let hasError = false;
                let errorMessage = "";

                try {
                    const stmtPrincipal = db.prepare(`INSERT INTO planilha_saldoabaixode90dias (${colunasInsert}) VALUES (${placeholders})`);
                    const stmtHistorico = db.prepare(`INSERT INTO historico_estoque (data_historico, ${colunasInsert}) VALUES (${placeholdersHistorico})`);

                    for (let i = 1; i < dados.length; i++) {
                        const linha = dados[i];
                        const valores = colunasDb.map((_, idx) => linha[idx] !== undefined ? String(linha[idx]) : '');
                        
                        stmtPrincipal.run(valores, (err) => { if(err && !hasError) { hasError = true; errorMessage = err.message; } });
                        stmtHistorico.run([dataFoto, ...valores], (err) => { if(err && !hasError) { hasError = true; errorMessage = err.message; } });
                    }
                    
                    stmtPrincipal.finalize();
                    stmtHistorico.finalize();
                } catch(e) {
                    hasError = true;
                    errorMessage = e.message;
                }
                
                db.get("SELECT 1", () => {
                    if (hasError) {
                        db.run('ROLLBACK', () => { db.close(); reject(new Error(`Erro ao inserir lote no banco: ${errorMessage}`)); });
                    } else {
                        db.run('COMMIT', (err) => {
                            db.close();
                            if(err) reject(err);
                            else resolve(` Planilha principal importada e registrada no histórico (${dataFoto}) com sucesso (${dados.length - 1} linhas inseridas).`);
                        });
                    }
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar Planilha de Saldo: ${error.message}`));
        }
    });
}

async function importarHistoricoRetroativo(caminhoAbsoluto, dataRetroativa) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(caminhoAbsoluto)) return resolve(` Arquivo de histórico não encontrado.`);
        
        let dataFoto = dataRetroativa;
        
        if (!dataFoto) {
            const nomeArquivo = path.basename(caminhoAbsoluto);
            const matchBR = nomeArquivo.match(/(\d{2})[-_]?(\d{2})[-_]?(\d{4})/);
            if (matchBR) {
                dataFoto = `${matchBR[3]}-${matchBR[2]}-${matchBR[1]}`;
            } else {
                const matchISO = nomeArquivo.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
                if (matchISO) {
                    dataFoto = `${matchISO[1]}-${matchISO[2]}-${matchISO[3]}`;
                }
            }
        }

        if (!dataFoto) {
            return reject(new Error('Data não informada no painel e não localizada no nome do arquivo. Use o formato DDMMAAAA (ex: 26082026).'));
        }

        try {
            let dados = [];
            if (caminhoAbsoluto.toLowerCase().endsWith('.csv')) {
                const csvDados = processarCsvBlindado(caminhoAbsoluto);
                dados = csvDados.slice(1);
            } else {
                const workbook = xlsx.readFile(caminhoAbsoluto);
                const aba = workbook.Sheets[workbook.SheetNames[0]]; 
                dados = xlsx.utils.sheet_to_json(aba, { header: 1, defval: '', range: 1 });
            }
            
            if (dados.length < 2) return resolve(` O arquivo de histórico está vazio.`);
            
            const cabecalhos = processarCabecalhosPlanilha(dados[0]);
            const colunasDb = gerarNomesColunasSql(cabecalhos);
            
            const db = getDbConnection();
            db.serialize(() => {
                db.all("PRAGMA table_info(historico_estoque)", (err, tableInfo) => {
                    if (err) {
                        db.close();
                        return reject(new Error(`Erro ao ler estrutura do histórico: ${err.message}`));
                    }

                    const colunasValidasNoBanco = tableInfo.map(col => col.name);
                    const colunasParaInserir = [];
                    const indicesParaInserir = [];

                    colunasDb.forEach((col, idx) => {
                        if (colunasValidasNoBanco.includes(col)) {
                            colunasParaInserir.push(col);
                            indicesParaInserir.push(idx);
                        }
                    });

                    // TRAVA DE SEGURANÇA
                    if (colunasParaInserir.length < 20) {
                        db.close();
                        return reject(new Error("Ei, parece que você selecionou o arquivo errado! O arquivo possui menos de 20 colunas compatíveis com a estrutura do histórico."));
                    }

                    const colunasInsert = colunasParaInserir.join(', ');
                    const placeholders = '?, ' + colunasParaInserir.map(() => '?').join(', ');

                    db.run('BEGIN TRANSACTION');
                    
                    let hasError = false;
                    let errorMessage = "";

                    try {
                        const stmt = db.prepare(`INSERT INTO historico_estoque (data_historico, ${colunasInsert}) VALUES (${placeholders})`);
                        for (let i = 1; i < dados.length; i++) {
                            const linha = dados[i];
                            const valores = indicesParaInserir.map(idx => linha[idx] !== undefined ? String(linha[idx]) : '');
                            stmt.run([dataFoto, ...valores], function(errRun) {
                                if (errRun && !hasError) {
                                    hasError = true;
                                    errorMessage = errRun.message;
                                }
                            });
                        }
                        stmt.finalize();
                    } catch (e) {
                        hasError = true;
                        errorMessage = e.message;
                    }
                    
                    // Sincronia fina para capturar erros SQLITE_BUSY que rolaram na fila
                    db.get("SELECT 1", () => {
                        if (hasError) {
                            db.run('ROLLBACK', () => {
                                db.close();
                                reject(new Error(`Falha durante inserção (banco ocupado ou erro). Operação abortada: ${errorMessage}`));
                            });
                        } else {
                            db.run('COMMIT', (errCommit) => {
                                db.close();
                                if (errCommit) reject(errCommit);
                                else {
                                    const colIgnoradas = colunasDb.length - colunasParaInserir.length;
                                    resolve(` Histórico retroativo (${dataFoto}) importado com sucesso! (${dados.length - 1} linhas, ${colIgnoradas} colunas ignoradas).`);
                                }
                            });
                        }
                    });
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar Histórico Retroativo: ${error.message}`));
        }
    });
}

async function importarMovimentacaoAnosAnteriores(caminhoAbsoluto) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(caminhoAbsoluto)) return resolve(` Arquivo de movimentação não encontrado.`);
        try {
            let cabecalhos = [];
            let dados = [];
            let qtdAbasLidas = 1;

            if (caminhoAbsoluto.toLowerCase().endsWith('.csv')) {
                const csvDados = processarCsvBlindado(caminhoAbsoluto);
                if (csvDados.length > 1) {
                    cabecalhos = csvDados[0].map((c, i) => String(c || `Coluna_${i}`).trim());
                    for (let j = 1; j < csvDados.length; j++) {
                        dados.push(csvDados[j]);
                    }
                }
            } else {
                const workbook = xlsx.readFile(caminhoAbsoluto, { cellDates: true });
                qtdAbasLidas = workbook.SheetNames.length;
                
                workbook.SheetNames.forEach((sheetName) => {
                    const aba = workbook.Sheets[sheetName];
                    const dadosAba = xlsx.utils.sheet_to_json(aba, { header: 1, defval: '' });
                    
                    if (dadosAba.length > 1) {
                        if (cabecalhos.length === 0) {
                            cabecalhos = dadosAba[0].map((c, i) => String(c || `Coluna_${i}`).trim());
                        }
                        for (let j = 1; j < dadosAba.length; j++) {
                            dados.push(dadosAba[j]);
                        }
                    }
                });
            }
            
            if (dados.length === 0) return resolve(` O arquivo de movimentação está vazio.`);
            
            const colunasDb = gerarNomesColunasSql(cabecalhos);
            const colunasDef = colunasDb.map(c => `${c} TEXT`).join(', ');
            const placeholders = colunasDb.map(() => '?').join(', ');
            const nomeTabela = 'movimentacao_anos_anteriores';
            
            const db = getDbConnection();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(`DROP TABLE IF EXISTS ${nomeTabela}`);
                db.run(`CREATE TABLE ${nomeTabela} (${colunasDef})`);
                
                let hasError = false;
                let errorMsg = '';
                
                try {
                    const stmt = db.prepare(`INSERT INTO ${nomeTabela} VALUES (${placeholders})`);
                    for (let i = 0; i < dados.length; i++) {
                        const linha = dados[i];
                        const valores = colunasDb.map((_, idx) => {
                            let val = linha[idx];
                            if (val === undefined || val === null) return '';
                            if (val instanceof Date) {
                                const dia = String(val.getUTCDate()).padStart(2, '0');
                                const mes = String(val.getUTCMonth() + 1).padStart(2, '0');
                                const ano = val.getUTCFullYear();
                                return `${dia}/${mes}/${ano}`;
                            }
                            return String(val).trim();
                        });
                        stmt.run(valores, (err) => { if(err && !hasError){ hasError=true; errorMsg=err.message; } });
                    }
                    stmt.finalize();
                } catch(e) {
                    hasError = true;
                    errorMsg = e.message;
                }
                
                db.get("SELECT 1", () => {
                    if (hasError) {
                        db.run('ROLLBACK', () => { db.close(); reject(new Error(`Erro de inserção: ${errorMsg}`)); });
                    } else {
                        db.run('COMMIT', (err) => {
                            db.close();
                            if (err) reject(err);
                            else resolve(` Tabela de Movimentação importada com sucesso (${dados.length} linhas lidas de ${qtdAbasLidas} aba(s)).`);
                        });
                    }
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar Movimentação: ${error.message}`));
        }
    });
}

async function importarPdm(caminhoAbsoluto) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(caminhoAbsoluto)) return resolve(` Arquivo PDM não encontrado.`);
        try {
            let dados = [];
            if (caminhoAbsoluto.toLowerCase().endsWith('.csv')) {
                dados = processarCsvBlindado(caminhoAbsoluto);
            } else {
                const workbook = xlsx.readFile(caminhoAbsoluto);
                const aba = workbook.Sheets[workbook.SheetNames[0]]; 
                dados = xlsx.utils.sheet_to_json(aba, { header: 1, defval: '' });
            }
            
            if (dados.length < 2) return resolve(` O arquivo PDM está vazio.`);
            
            const cabecalhos = dados[0].map((c, i) => String(c || `Coluna_${i}`).trim());
            const colunasDb = gerarNomesColunasSql(cabecalhos); 
            const colunasDef = colunasDb.map(c => `${c} TEXT`).join(', ');
            const placeholders = colunasDb.map(() => '?').join(', ');
            const nomeTabela = 'pdm';
            
            const db = getDbConnection();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(`DROP TABLE IF EXISTS ${nomeTabela}`);
                db.run(`CREATE TABLE ${nomeTabela} (${colunasDef})`);
                
                let hasError = false;
                let errorMsg = '';
                
                try {
                    const stmt = db.prepare(`INSERT INTO ${nomeTabela} VALUES (${placeholders})`);
                    for (let i = 1; i < dados.length; i++) {
                        const linha = dados[i];
                        const valores = colunasDb.map((_, idx) => linha[idx] !== undefined ? String(linha[idx]) : '');
                        stmt.run(valores, (err) => { if(err && !hasError){ hasError=true; errorMsg=err.message; } });
                    }
                    stmt.finalize();
                } catch(e) {
                    hasError = true;
                    errorMsg = e.message;
                }
                
                db.get("SELECT 1", () => {
                    if (hasError) {
                        db.run('ROLLBACK', () => { db.close(); reject(new Error(`Erro de inserção PDM: ${errorMsg}`)); });
                    } else {
                        db.run('COMMIT', (err) => {
                            db.close();
                            if (err) reject(err);
                            else resolve(` Arquivo PDM importado com sucesso (${dados.length - 1} linhas inseridas).`);
                        });
                    }
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar PDM: ${error.message}`));
        }
    });
}

// ---------------------------------------------------------
// NOVA ÁREA: CARTÃO CORPORATIVO E PDM
// ---------------------------------------------------------
async function inicializarTabelaCartao() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`CREATE TABLE IF NOT EXISTS compras_cartao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cod_item TEXT,
            valor_total REAL,
            fornecedor TEXT,
            ano TEXT,
            data_registro TEXT
        )`, (err) => {
            db.close();
            if (err) reject(err);
            else resolve();
        });
    });
}

async function registrarCompraCartao(codItem, valorTotalStr, fornecedor) {
    await inicializarTabelaCartao();
    const anoAtual = new Date().getFullYear().toString();
    const dataHoje = new Date().toISOString();
    
    let valor = String(valorTotalStr).replace(/\./g, '').replace(',', '.');
    const valorReal = parseFloat(valor) || 0;

    const query = `INSERT INTO compras_cartao (cod_item, valor_total, fornecedor, ano, data_registro) VALUES (?, ?, ?, ?, ?)`;
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(query, [String(codItem).trim().toUpperCase(), valorReal, String(fornecedor).trim(), anoAtual, dataHoje], function(err) {
            db.close();
            if (err) reject(new Error(`Erro ao registrar cartão: ${err.message}`));
            else resolve({ sucesso: true, id: this.lastID });
        });
    });
}

async function calcularConsumoPdm(codigoPdm) {
    await inicializarTabelaCartao(); 
    const anoAtual = new Date().getFullYear().toString();
    
    const queryEmpenhos = `
        SELECT valor_empenhado 
        FROM empenhos_entradaempenhos 
        WHERE cod_item IN (
            SELECT item FROM pdm 
            WHERE cod_familia_pdm = ? OR familia_pdm = ?
        ) 
        AND upper(modalidade) LIKE '%DISPENSA 75-II%' 
        AND data_ae LIKE ?;
    `;
    
    const queryCartao = `
        SELECT valor_total 
        FROM compras_cartao 
        WHERE cod_item IN (
            SELECT item FROM pdm 
            WHERE cod_familia_pdm = ? OR familia_pdm = ?
        ) 
        AND ano = ?;
    `;
    
    const paramsEmpenho = [codigoPdm, codigoPdm, `%${anoAtual}%`];
    const paramsCartao = [codigoPdm, codigoPdm, anoAtual];
    
    try {
        const rowsEmpenhos = await executarQuerySql(queryEmpenhos, paramsEmpenho);
        const rowsCartao = await executarQuerySql(queryCartao, paramsCartao);
        
        let total = 0;
        
        rowsEmpenhos.forEach(r => {
            let val = r.valor_empenhado || '0';
            if (typeof val === 'string') {
                val = val.replace(/\./g, '').replace(',', '.');
            }
            const numero = parseFloat(val);
            if (!isNaN(numero)) {
                total += numero;
            }
        });
        
        rowsCartao.forEach(r => {
            const numero = parseFloat(r.valor_total);
            if (!isNaN(numero)) {
                total += numero;
            }
        });
        
        return total;
    } catch (error) {
        console.error('Erro ao calcular consumo do PDM (Empenho + Cartão):', error);
        return 0;
    }
}

// ---------------------------------------------------------
// UPSERT (UPDATE OR INSERT) DO PDM MANUALMENTE
// ---------------------------------------------------------
async function upsertItemPdm(codigoInca, codigoPdm, descricaoFamilia) {
    const item = String(codigoInca).trim().toUpperCase();
    const codPdm = String(codigoPdm).trim();
    const desc = String(descricaoFamilia || 'Adicionado manualmente').trim();
    
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        
        db.get(`SELECT * FROM pdm WHERE item = ?`, [item], (err, row) => {
            if (err) {
                db.close();
                return reject(err);
            }
            
            if (row) {
                db.run(`UPDATE pdm SET cod_familia_pdm = ?, familia_pdm = ? WHERE item = ?`, 
                [codPdm, desc, item], function(errUpdate) {
                    db.close();
                    if (errUpdate) reject(errUpdate);
                    else resolve({ sucesso: true, acao: 'atualizado' });
                });
            } else {
                db.run(`INSERT INTO pdm (item, cod_familia_pdm, familia_pdm) VALUES (?, ?, ?)`, 
                [item, codPdm, desc], function(errInsert) {
                    db.close();
                    if (errInsert) reject(errInsert);
                    else resolve({ sucesso: true, acao: 'inserido' });
                });
            }
        });
    });
}

// =======================================================
// NOVA ÁREA: AVN
// =======================================================
async function inicializarTabelaAvn() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`CREATE TABLE IF NOT EXISTS avn (
            cod_item TEXT PRIMARY KEY
        )`, (err) => {
            db.close();
            if (err) reject(err);
            else resolve();
        });
    });
}

// Inicializa no arranque
inicializarTabelaAvn().catch(e => console.error("Erro ao inicializar tabela AVN:", e));

async function adicionarItemAvn(codItem) {
    const item = String(codItem).trim().toUpperCase();
    if (!item) return { sucesso: false, erro: 'Item inválido' };
    
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`INSERT OR IGNORE INTO avn (cod_item) VALUES (?)`, [item], function(err) {
            db.close();
            if (err) reject(err);
            else resolve({ sucesso: true, inserido: this.changes > 0 });
        });
    });
}

async function removerItemAvn(codItem) {
    const item = String(codItem).trim().toUpperCase();
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`DELETE FROM avn WHERE cod_item = ?`, [item], function(err) {
            db.close();
            if (err) reject(err);
            else resolve({ sucesso: true, removido: this.changes > 0 });
        });
    });
}

async function listarItensAvn() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(`SELECT cod_item FROM avn ORDER BY cod_item ASC`, [], (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// =======================================================
// NOVA ÁREA: RADAR DE ITENS
// =======================================================
async function inicializarTabelasRadar() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS radar_alertas (
                item TEXT PRIMARY KEY
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS alertas_radar (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_radar TEXT,
                telefone_radar TEXT UNIQUE
            )`, (err) => {
                db.close();
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

// Inicializa no arranque
inicializarTabelasRadar().catch(e => console.error("Erro ao inicializar tabelas do Radar:", e));

async function adicionarItemRadar(itemStr) {
    const item = String(itemStr).trim().toUpperCase();
    if (!item) return { sucesso: false, erro: 'Item inválido' };
    
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`INSERT OR IGNORE INTO radar_alertas (item) VALUES (?)`, [item], function(err) {
            db.close();
            if (err) reject(err);
            else resolve({ sucesso: true, inserido: this.changes > 0 });
        });
    });
}

async function removerItemRadar(itemStr) {
    const item = String(itemStr).trim().toUpperCase();
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`DELETE FROM radar_alertas WHERE item = ?`, [item], function(err) {
            db.close();
            if (err) reject(err);
            else resolve({ sucesso: true, removido: this.changes > 0 });
        });
    });
}

async function listarItensRadar() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(`SELECT item FROM radar_alertas ORDER BY item ASC`, [], (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function adicionarContatoRadar(nome, telefone) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`INSERT OR IGNORE INTO alertas_radar (nome_radar, telefone_radar) VALUES (?, ?)`, [nome, telefone], function(err) {
            db.close();
            if (err) reject(err);
            else resolve({ sucesso: true, inserido: this.changes > 0 });
        });
    });
}

async function removerContatoRadar(telefone) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`DELETE FROM alertas_radar WHERE telefone_radar = ?`, [telefone], function(err) {
            db.close();
            if (err) reject(err);
            else resolve({ sucesso: true, removido: this.changes > 0 });
        });
    });
}

async function listarContatosRadar() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(`SELECT * FROM alertas_radar ORDER BY nome_radar ASC`, [], (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// =======================================================
// CONTROLE DE AUTENTICAÇÃO E USUÁRIOS (SISTEMA DE LOGINS)
// =======================================================

function hashSenha(senhaPlana) {
    return crypto.createHash('sha256').update(senhaPlana).digest('hex');
}

async function inicializarTabelasAuth() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT,
                login TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                precisa_trocar_senha INTEGER DEFAULT 1,
                permissoes TEXT DEFAULT '[]',
                criado_em TEXT
            )`);

            // Tenta adicionar a coluna nome silenciosamente caso a tabela seja do modelo antigo
            db.run(`ALTER TABLE usuarios ADD COLUMN nome TEXT`, (err) => { /* Ignora se já existir */ });

            db.run(`CREATE TABLE IF NOT EXISTS sessoes_web (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE NOT NULL,
                usuario_id INTEGER NOT NULL,
                criado_em TEXT,
                FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
            )`);

            db.get(`SELECT COUNT(*) as count FROM usuarios`, (err, row) => {
                if (!err && row && row.count === 0) {
                    const senhaPadrao = process.env.SENHA_PAINEL || 'hera123';
                    const hashAdmin = hashSenha(senhaPadrao);
                    const permissoesFull = JSON.stringify(["todas"]);
                    const dataAgora = new Date().toISOString();

                    db.run(`INSERT INTO usuarios (nome, login, senha, is_admin, precisa_trocar_senha, permissoes, criado_em)
                            VALUES (?, ?, ?, 1, 1, ?, ?)`, 
                            ['Administrador', 'admin', hashAdmin, permissoesFull, dataAgora]);
                    console.log('✅ Usuário Master "admin" criado com sucesso no banco de dados!');
                }
                db.close();
                resolve();
            });
        });
    });
}

inicializarTabelasAuth().catch(e => console.error("Erro ao inicializar segurança:", e));

async function verificarCredenciaisUsuario(login, senhaPlana) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(senhaPlana);
        const db = getDbConnection();
        db.get(`SELECT * FROM usuarios WHERE login = ? AND senha = ?`, [login, hash], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row || null); 
        });
    });
}

async function buscarUsuarioPorId(id) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.get(`SELECT id, nome, login, is_admin, precisa_trocar_senha, permissoes FROM usuarios WHERE id = ?`, [id], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

async function registrarSessao(usuarioId, tokenToken) {
    return new Promise((resolve, reject) => {
        const dataAgora = new Date().toISOString();
        const db = getDbConnection();
        db.run(`INSERT INTO sessoes_web (token, usuario_id, criado_em) VALUES (?, ?, ?)`, 
            [tokenToken, usuarioId, dataAgora], function(err) {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

async function validarSessaoToken(tokenToken) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        const query = `
            SELECT u.* FROM sessoes_web s 
            JOIN usuarios u ON s.usuario_id = u.id 
            WHERE s.token = ?
        `;
        db.get(query, [tokenToken], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

async function destruirSessao(tokenToken) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`DELETE FROM sessoes_web WHERE token = ?`, [tokenToken], (err) => {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

async function atualizarSenhaUsuario(usuarioId, novaSenhaPlana) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(novaSenhaPlana);
        const db = getDbConnection();
        db.run(`UPDATE usuarios SET senha = ?, precisa_trocar_senha = 0 WHERE id = ?`, [hash, usuarioId], (err) => {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

async function listarTodosUsuarios() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(`SELECT id, nome, login, is_admin, precisa_trocar_senha, permissoes, criado_em FROM usuarios ORDER BY id ASC`, [], (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function criarUsuarioSecundario(nome, login, senhaProvisoria, permissoesArray) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(senhaProvisoria);
        const permissoesJson = JSON.stringify(permissoesArray);
        const dataAgora = new Date().toISOString();
        const db = getDbConnection();
        
        db.run(`INSERT INTO usuarios (nome, login, senha, is_admin, precisa_trocar_senha, permissoes, criado_em)
                VALUES (?, ?, ?, 0, 1, ?, ?)`, 
                [nome, login, hash, permissoesJson, dataAgora], function(err) {
            db.close();
            if (err) reject(new Error('Login já existente ou falha no banco de dados.'));
            else resolve({ sucesso: true, id: this.lastID });
        });
    });
}

async function atualizarPermissoesDeUsuario(usuarioId, permissoesArray) {
    return new Promise((resolve, reject) => {
        const permissoesJson = JSON.stringify(permissoesArray);
        const db = getDbConnection();
        db.run(`UPDATE usuarios SET permissoes = ? WHERE id = ?`, [permissoesJson, usuarioId], (err) => {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

// NOVA FUNÇÃO: Atualizar Nome e Login
async function atualizarDadosUsuario(usuarioId, nome, login) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`UPDATE usuarios SET nome = ?, login = ? WHERE id = ?`, [nome, login, usuarioId], function(err) {
            db.close();
            if (err) reject(new Error('Falha ao atualizar dados. Este login já pode estar em uso por outra pessoa.'));
            else resolve(true);
        });
    });
}

async function resetarSenhaUsuarioSecundario(usuarioId, novaSenhaProvisoria) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(novaSenhaProvisoria);
        const db = getDbConnection();
        db.run(`UPDATE usuarios SET senha = ?, precisa_trocar_senha = 1 WHERE id = ? AND is_admin = 0`, [hash, usuarioId], function(err) {
            db.close();
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

async function deletarUsuarioSecundario(usuarioId) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run(`DELETE FROM sessoes_web WHERE usuario_id = ?`, [usuarioId]);
            db.run(`DELETE FROM usuarios WHERE id = ? AND is_admin = 0`, [usuarioId]);
            db.run('COMMIT', (err) => {
                db.close();
                if (err) reject(err);
                else resolve(true);
            });
        });
    });
}

inicializarTabelasAuth().catch(e => console.error("Erro ao inicializar segurança:", e));

async function verificarCredenciaisUsuario(login, senhaPlana) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(senhaPlana);
        const db = getDbConnection();
        db.get(`SELECT * FROM usuarios WHERE login = ? AND senha = ?`, [login, hash], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row || null); 
        });
    });
}

async function buscarUsuarioPorId(id) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.get(`SELECT id, login, is_admin, precisa_trocar_senha, permissoes FROM usuarios WHERE id = ?`, [id], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

async function registrarSessao(usuarioId, tokenToken) {
    return new Promise((resolve, reject) => {
        const dataAgora = new Date().toISOString();
        const db = getDbConnection();
        db.run(`INSERT INTO sessoes_web (token, usuario_id, criado_em) VALUES (?, ?, ?)`, 
            [tokenToken, usuarioId, dataAgora], function(err) {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

async function validarSessaoToken(tokenToken) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        const query = `
            SELECT u.* FROM sessoes_web s 
            JOIN usuarios u ON s.usuario_id = u.id 
            WHERE s.token = ?
        `;
        db.get(query, [tokenToken], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

async function destruirSessao(tokenToken) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`DELETE FROM sessoes_web WHERE token = ?`, [tokenToken], (err) => {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

async function atualizarSenhaUsuario(usuarioId, novaSenhaPlana) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(novaSenhaPlana);
        const db = getDbConnection();
        db.run(`UPDATE usuarios SET senha = ?, precisa_trocar_senha = 0 WHERE id = ?`, [hash, usuarioId], (err) => {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

async function listarTodosUsuarios() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(`SELECT id, login, is_admin, precisa_trocar_senha, permissoes, criado_em FROM usuarios ORDER BY id ASC`, [], (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function criarUsuarioSecundario(login, senhaProvisoria, permissoesArray) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(senhaProvisoria);
        const permissoesJson = JSON.stringify(permissoesArray);
        const dataAgora = new Date().toISOString();
        const db = getDbConnection();
        
        db.run(`INSERT INTO usuarios (login, senha, is_admin, precisa_trocar_senha, permissoes, criado_em)
                VALUES (?, ?, 0, 1, ?, ?)`, 
                [login, hash, permissoesJson, dataAgora], function(err) {
            db.close();
            if (err) reject(new Error('Login já existente ou falha no banco de dados.'));
            else resolve({ sucesso: true, id: this.lastID });
        });
    });
}

async function atualizarPermissoesDeUsuario(usuarioId, permissoesArray) {
    return new Promise((resolve, reject) => {
        const permissoesJson = JSON.stringify(permissoesArray);
        const db = getDbConnection();
        db.run(`UPDATE usuarios SET permissoes = ? WHERE id = ?`, [permissoesJson, usuarioId], (err) => {
            db.close();
            if (err) reject(err);
            else resolve(true);
        });
    });
}

async function resetarSenhaUsuarioSecundario(usuarioId, novaSenhaProvisoria) {
    return new Promise((resolve, reject) => {
        const hash = hashSenha(novaSenhaProvisoria);
        const db = getDbConnection();
        db.run(`UPDATE usuarios SET senha = ?, precisa_trocar_senha = 1 WHERE id = ? AND is_admin = 0`, [hash, usuarioId], function(err) {
            db.close();
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

async function deletarUsuarioSecundario(usuarioId) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run(`DELETE FROM sessoes_web WHERE usuario_id = ?`, [usuarioId]);
            db.run(`DELETE FROM usuarios WHERE id = ? AND is_admin = 0`, [usuarioId]);
            db.run('COMMIT', (err) => {
                db.close();
                if (err) reject(err);
                else resolve(true);
            });
        });
    });
}

// =======================================================
// NOVA ÁREA: MAIOR USUÁRIO CONSUMIDOR
// =======================================================
async function importarMaiorConsumidor(caminhoAbsoluto) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(caminhoAbsoluto)) return resolve(` Arquivo de Maior Consumidor não encontrado.`);
        try {
            let dados = [];
            if (caminhoAbsoluto.toLowerCase().endsWith('.csv')) {
                dados = processarCsvBlindado(caminhoAbsoluto);
            } else {
                const workbook = xlsx.readFile(caminhoAbsoluto);
                const aba = workbook.Sheets[workbook.SheetNames[0]]; 
                dados = xlsx.utils.sheet_to_json(aba, { header: 1, defval: '' });
            }
            
            if (dados.length < 2) return resolve(` O arquivo de Maior Consumidor está vazio.`);
            
            const nomeTabela = 'maior_usuario_consumidor';
            
            const db = getDbConnection();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Criação da tabela garantindo a estrutura correta caso não exista
                db.run(`CREATE TABLE IF NOT EXISTS ${nomeTabela} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    unidade_solicitante VARCHAR(100),
                    setor_solicitante VARCHAR(100),
                    centro_custo_solicitante VARCHAR(100),
                    codigo_do_material VARCHAR(50),
                    codigo_ems VARCHAR(50),
                    nome_do_material VARCHAR(255),
                    unid_medida VARCHAR(20),
                    quantidade_cota REAL,
                    tipo_cota VARCHAR(50)
                )`);
                
                // Limpando a tabela para receber os dados novos
                db.run(`DELETE FROM ${nomeTabela}`);
                
                let hasError = false;
                let errorMsg = '';
                
                try {
                    const stmt = db.prepare(`INSERT INTO ${nomeTabela} (
                        unidade_solicitante, setor_solicitante, centro_custo_solicitante,
                        codigo_do_material, codigo_ems, nome_do_material, unid_medida,
                        quantidade_cota, tipo_cota
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                    
                    // Pula o cabeçalho (índice 0)
                    for (let i = 1; i < dados.length; i++) {
                        const linha = dados[i];
                        if (!linha || linha.length === 0) continue; 
                        
                        // O código do material está no índice 3 (4ª coluna)
                        const valCodigo = String(linha[3] || '').trim().toUpperCase();
                        if (!valCodigo) continue;

                        const valUnidade = String(linha[0] || '').trim();
                        const valSetor = String(linha[1] || '').trim();
                        const valCentroCusto = String(linha[2] || '').trim();
                        const valEms = String(linha[4] || '').trim();
                        const valNome = String(linha[5] || '').trim();
                        const valUnid = String(linha[6] || '').trim();
                        
                        // Tratamento do número da cota (pode vir com vírgula)
                        let valQtd = String(linha[7] || '').trim();
                        if (valQtd.includes(',')) valQtd = valQtd.replace(/\./g, '').replace(',', '.');
                        const numQtd = parseFloat(valQtd) || 0;

                        const valTipo = String(linha[8] || '').trim();

                        stmt.run([
                            valUnidade, valSetor, valCentroCusto, valCodigo, valEms, valNome, valUnid, numQtd, valTipo
                        ], (err) => { if(err && !hasError){ hasError=true; errorMsg=err.message; } });
                    }
                    stmt.finalize();
                } catch(e) {
                    hasError = true;
                    errorMsg = e.message;
                }
                
                db.get("SELECT 1", () => {
                    if (hasError) {
                        db.run('ROLLBACK', () => { db.close(); reject(new Error(`Erro de inserção Maior Consumidor: ${errorMsg}`)); });
                    } else {
                        db.run('COMMIT', (err) => {
                            db.close();
                            if (err) reject(err);
                            else resolve(` Arquivo de Maior Consumidor importado com sucesso (${dados.length - 1} linhas inseridas).`);
                        });
                    }
                });
            });
        } catch (error) {
            reject(new Error(`Erro ao importar Maior Consumidor: ${error.message}`));
        }
    });
}

module.exports = {
    importarEmpenhos,
    importarPlanilhaSaldo,
    importarHistoricoRetroativo,
    importarMovimentacaoAnosAnteriores,
    importarPdm,
    importarMaiorConsumidor,
    registrarCompraCartao,
    calcularConsumoPdm,
    upsertItemPdm,
    adicionarItemAvn,
    removerItemAvn,
    listarItensAvn,
    adicionarItemRadar,
    removerItemRadar,
    listarItensRadar,
    adicionarContatoRadar,
    removerContatoRadar,
    listarContatosRadar,
    getDbConnection,
    verificarCredenciaisUsuario,
    buscarUsuarioPorId,
    registrarSessao,
    validarSessaoToken,
    destruirSessao,
    atualizarSenhaUsuario,
    listarTodosUsuarios,
    criarUsuarioSecundario,
    atualizarDadosUsuario,
    atualizarPermissoesDeUsuario,
    resetarSenhaUsuarioSecundario,
    deletarUsuarioSecundario
};
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { pregoesCachePath } = require('../config/paths');

// Variável para não precisar checar a tabela em toda consulta durante a mesma execução
let bancoIniciado = false;

function garantirDiretorioDoBanco() {
    const diretorio = path.dirname(pregoesCachePath);
    if (!fs.existsSync(diretorio)) {
        fs.mkdirSync(diretorio, { recursive: true });
    }
}

function abrirBanco() {
    garantirDiretorioDoBanco();
    return new sqlite3.Database(pregoesCachePath);
}

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (erro) {
            if (erro) reject(erro);
            else resolve(this);
        });
    });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (erro, row) => {
            if (erro) reject(erro);
            else resolve(row);
        });
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (erro, rows) => {
            if (erro) reject(erro);
            else resolve(rows || []);
        });
    });
}

async function iniciarBancoPregoes() {
    if (bancoIniciado) return;

    const db = abrirBanco();
    try {
        await dbRun(db, `
            CREATE TABLE IF NOT EXISTS pregoes_resumo (
                id_compra TEXT PRIMARY KEY,
                numero_limpo TEXT,
                ano TEXT,
                situacao_geral TEXT,
                total_itens INTEGER,
                homologados INTEGER,
                desertos INTEGER,
                frustrados INTEGER,
                concluido BOOLEAN,
                processo_sei TEXT,
                status_json TEXT,
                mes_publicacao INTEGER,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Nova tabela para armazenar os itens detalhados do pregão e permitir exportação rápida
        await dbRun(db, `
            CREATE TABLE IF NOT EXISTS pregoes_itens (
                id_compra TEXT,
                numero_item TEXT,
                dados_json TEXT,
                PRIMARY KEY (id_compra, numero_item)
            )
        `);
        
        // Tenta adicionar a coluna caso a tabela já exista e seja antiga
        try { await dbRun(db, `ALTER TABLE pregoes_resumo ADD COLUMN processo_sei TEXT`); } catch (e) {}
        try { await dbRun(db, `ALTER TABLE pregoes_resumo ADD COLUMN status_json TEXT`); } catch (e) {}
        try { await dbRun(db, `ALTER TABLE pregoes_resumo ADD COLUMN mes_publicacao INTEGER`); } catch (e) {}
        
        bancoIniciado = true;
    } finally {
        db.close();
    }
}

async function buscarPregaoCache(idCompra) {
    await iniciarBancoPregoes(); // Garante que a tabela está pronta
    const db = abrirBanco();
    try {
        return await dbGet(db, 'SELECT * FROM pregoes_resumo WHERE id_compra = ?', [idCompra]);
    } finally {
        db.close();
    }
}

async function buscarTodosPregoesPorAnoCache(ano) {
    await iniciarBancoPregoes(); 
    const db = abrirBanco();
    try {
        return await dbAll(db, 'SELECT * FROM pregoes_resumo WHERE ano = ?', [String(ano)]);
    } finally {
        db.close();
    }
}

async function salvarPregaoCache(dados) {
    await iniciarBancoPregoes(); // Garante que a tabela está pronta
    const db = abrirBanco();
    try {
        await dbRun(db, `
            INSERT OR REPLACE INTO pregoes_resumo (
                id_compra, numero_limpo, ano, situacao_geral, total_itens, 
                homologados, desertos, frustrados, concluido, processo_sei,
                status_json, mes_publicacao, atualizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            dados.idCompra, dados.numeroLimpo, dados.ano, dados.situacaoGeral,
            dados.totalItens, dados.homologados, dados.desertos, dados.frustrados,
            dados.concluido ? 1 : 0, dados.processoSei || null,
            dados.statusJson || null, dados.mesPublicacao || 0
        ]);
    } finally {
        db.close();
    }
}

async function buscarPregaoPorSei(processoSei) {
    await iniciarBancoPregoes(); // Garante que a tabela e a coluna existam antes do SELECT
    const db = abrirBanco();
    try {
        // Busca o pregão mais recente atrelado a esse processo SEI
        return await dbGet(db, 'SELECT numero_limpo, ano FROM pregoes_resumo WHERE processo_sei LIKE ? ORDER BY ano DESC, numero_limpo DESC LIMIT 1', [`%${processoSei}%`]);
    } finally {
        db.close();
    }
}

// NOVA FUNÇÃO: Salvar a lista de itens de um pregão no banco local
// NOVA FUNÇÃO: Salvar a lista de itens de um pregão no banco local
async function salvarItensCache(idCompra, itensArray) {
    await iniciarBancoPregoes();
    const db = abrirBanco();
    try {
        await dbRun(db, 'BEGIN TRANSACTION');
        // Remove os itens antigos para evitar duplicações caso haja atualização
        await dbRun(db, 'DELETE FROM pregoes_itens WHERE id_compra = ?', [idCompra]);
        
        for (const item of (itensArray || [])) {
            const numeroItem = item.numeroItemCompra || item.numeroItemPncp || item.numeroItem || item.item || 'N/A';
            await dbRun(db, `
                INSERT OR REPLACE INTO pregoes_itens (id_compra, numero_item, dados_json)
                VALUES (?, ?, ?)
            `, [idCompra, String(numeroItem), JSON.stringify(item)]);
        }
        await dbRun(db, 'COMMIT');
    } catch (erro) {
        await dbRun(db, 'ROLLBACK');
        throw erro;
    } finally {
        db.close();
    }
}

// NOVA FUNÇÃO: Recuperar os itens do pregão diretamente do banco local
async function buscarItensCache(idCompra) {
    await iniciarBancoPregoes();
    const db = abrirBanco();
    try {
        const rows = await dbAll(db, 'SELECT dados_json FROM pregoes_itens WHERE id_compra = ?', [idCompra]);
        return rows.map(r => JSON.parse(r.dados_json));
    } finally {
        db.close();
    }
}

module.exports = {
    iniciarBancoPregoes,
    buscarPregaoCache,
    buscarTodosPregoesPorAnoCache,
    salvarPregaoCache,
    buscarPregaoPorSei,
    salvarItensCache,
    buscarItensCache,
    abrirBanco,
    dbGet,
    dbAll
};
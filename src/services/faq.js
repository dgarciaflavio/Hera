const { getDbConnection } = require('./database');

function inicializarTabelaFaq() {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(`
            CREATE TABLE IF NOT EXISTS conhecimento_faq (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_documento TEXT NOT NULL,
                pergunta TEXT NOT NULL,
                resposta TEXT NOT NULL,
                data_criacao TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            db.close();
            if (err) reject(err);
            else resolve();
        });
    });
}

function buscarFaqPorDocumento(idDocumento) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.all(
            `SELECT id, pergunta, resposta FROM conhecimento_faq WHERE id_documento = ?`,
            [String(idDocumento)],
            (err, rows) => {
                db.close();
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

function salvarFaq(idDocumento, pergunta, resposta) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(
            `INSERT INTO conhecimento_faq (id_documento, pergunta, resposta) VALUES (?, ?, ?)`,
            [String(idDocumento), String(pergunta).trim(), String(resposta).trim()],
            (err) => {
                db.close();
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function limparFaqPorDocumento(idDocumento) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        db.run(
            `DELETE FROM conhecimento_faq WHERE id_documento = ?`,
            [String(idDocumento)],
            (err) => {
                db.close();
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

module.exports = {
    inicializarTabelaFaq,
    buscarFaqPorDocumento,
    salvarFaq,
    limparFaqPorDocumento
};
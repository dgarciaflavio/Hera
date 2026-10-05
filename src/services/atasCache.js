const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'data', 'atas.db');

function iniciarBancoAtas() {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) return reject(err);
            
            db.run(`
                CREATE TABLE IF NOT EXISTS atas (
                    numero_ata TEXT PRIMARY KEY,
                    ano INTEGER,
                    numero_compra TEXT,
                    fornecedores TEXT,
                    dados_gerais TEXT,
                    itens TEXT,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve(db);
            });
        });
    });
}

function salvarAtaCache(ataData) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await iniciarBancoAtas();
            const query = `
                INSERT INTO atas (numero_ata, ano, numero_compra, fornecedores, dados_gerais, itens, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(numero_ata) DO UPDATE SET
                    fornecedores = excluded.fornecedores,
                    dados_gerais = excluded.dados_gerais,
                    itens = excluded.itens,
                    atualizado_em = CURRENT_TIMESTAMP
            `;
            
            db.run(query, [
                ataData.numero_ata,
                ataData.ano,
                ataData.numero_compra,
                ataData.fornecedores,
                JSON.stringify(ataData.dados_gerais),
                JSON.stringify(ataData.itens)
            ], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        } catch (error) {
            reject(error);
        }
    });
}

function buscarAtasPorAnoCache(ano) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await iniciarBancoAtas();
            db.all(`SELECT * FROM atas WHERE ano = ? ORDER BY numero_ata ASC`, [ano], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        } catch (error) {
            reject(error);
        }
    });
}

function buscarAtaPorNumeroCache(numeroAta) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await iniciarBancoAtas();
            db.get(`SELECT * FROM atas WHERE numero_ata = ?`, [numeroAta], (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        } catch (error) {
            reject(error);
        }
    });
}

function limparAtasPorAnoCache(ano) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await iniciarBancoAtas();
            db.run(`DELETE FROM atas WHERE ano = ?`, [ano], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    iniciarBancoAtas,
    salvarAtaCache,
    buscarAtasPorAnoCache,
    buscarAtaPorNumeroCache,
    limparAtasPorAnoCache
};
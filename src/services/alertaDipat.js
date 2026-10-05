// src/services/alertaDipat.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const { getDbConnection } = require('./database');
const { analisarTendenciaEProjetar } = require('./projecao');

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

async function gerarRelatorioAlertasDipat() {
    try {
        // 1. Verifica quem vai receber antes de começar o processamento
        const destinatarios = await executarQuerySql(`SELECT nome, telefone FROM alertas_dipat`);
        if (!destinatarios || destinatarios.length === 0) {
            return { erro: 'A tabela alertas_dipat está vazia. Cadastre pelo menos um número para receber o alerta.' };
        }

        // 1.5. Busca exclusivamente os itens monitorados pela DIPAT
        const rawItensDipat = await executarQuerySql(`SELECT * FROM itens_dipat`);
        const itensMonitorados = new Set();
        
        rawItensDipat.forEach(row => {
            let codigo = '';
            for (let k in row) {
                const low = k.trim().toLowerCase();
                if (low === 'itens' || low === 'item' || low === 'codigo') {
                    codigo = String(row[k]).trim().toUpperCase();
                }
            }
            if (codigo) itensMonitorados.add(codigo);
        });

        if (itensMonitorados.size === 0) {
            return { erro: 'A tabela "itens_dipat" está vazia ou não possui a coluna "item". Cadastre os itens que deseja monitorar antes de gerar o alerta.' };
        }

        // 2. Resgata os dois dias mais recentes do histórico
        const datas = await executarQuerySql(`SELECT DISTINCT data_historico FROM historico_estoque ORDER BY data_historico DESC LIMIT 2`);
        if (datas.length < 2) {
            return { erro: 'É necessário ter pelo menos 2 dias importados no histórico para calcular as movimentações.' };
        }
        
        const dataHoje = datas[0].data_historico;
        const dataOntem = datas[1].data_historico;

        // 3. Cruzamento para achar alterações de saldo
        const rowsHojeRaw = await executarQuerySql(`SELECT * FROM historico_estoque WHERE data_historico = ?`, [dataHoje]);
        const rowsOntemRaw = await executarQuerySql(`SELECT item, saldo_atual FROM historico_estoque WHERE data_historico = ?`, [dataOntem]);

        const rowsHoje = rowsHojeRaw.filter(r => itensMonitorados.has(String(r.item).trim().toUpperCase()));
        const rowsOntem = rowsOntemRaw.filter(r => itensMonitorados.has(String(r.item).trim().toUpperCase()));

        const mapaOntem = new Map();
        rowsOntem.forEach(r => mapaOntem.set(String(r.item).trim(), Number(r.saldo_atual) || 0));

        const mapaHoje = new Map();
        const dadosUnicosHoje = new Map();
        rowsHoje.forEach(r => {
            const item = String(r.item).trim();
            if (!mapaHoje.has(item)) {
                mapaHoje.set(item, Number(r.saldo_atual) || 0);
                dadosUnicosHoje.set(item, r);
            }
        });

        const comparacao = [];
        mapaHoje.forEach((saldoHoje, item) => {
            if (mapaOntem.has(item)) {
                const saldoOntem = mapaOntem.get(item);
                const variacao = saldoHoje - saldoOntem;
                
                let tipo, icone;
                if (variacao > 0) {
                    tipo = 'ENTRADA';
                    icone = '⬆️';
                } else if (variacao < 0) {
                    tipo = 'SAIDA';
                    icone = '⬇️';
                } else {
                    tipo = 'ESTAVEL';
                    icone = '➖';
                }

                comparacao.push({
                    item: item,
                    descricao: dadosUnicosHoje.get(item).descricao || 'N/A',
                    saldoOntem: saldoOntem,
                    saldoHoje: saldoHoje,
                    variacaoExata: variacao,
                    variacaoAbsoluta: Math.abs(variacao),
                    tipo: tipo,
                    icone: icone
                });
            }
        });

        const entradas = comparacao.filter(c => c.tipo === 'ENTRADA').sort((a, b) => b.variacaoAbsoluta - a.variacaoAbsoluta);
        const saidas = comparacao.filter(c => c.tipo === 'SAIDA').sort((a, b) => b.variacaoAbsoluta - a.variacaoAbsoluta);

        // 4. Montagem Visual da Mensagem de Texto (Sem os itens estáveis)
        let mensagem = `🚨 *Alerta de Movimentação - DIPAT* 🚨\n🗓️ Comparação: ${dataOntem} ➡️ ${dataHoje}\n\n`;
        
        let teveMovimentacao = false;

        if (entradas.length > 0) {
            teveMovimentacao = true;
            mensagem += `📦 *ENTRADAS NO ESTOQUE*\n`;
            entradas.slice(0, 15).forEach(q => {
                mensagem += `🟢 *${q.item} - ${q.descricao}*: ${q.saldoOntem} ➡️ ${q.saldoHoje} (+${q.variacaoAbsoluta})\n`;
            });
            if (entradas.length > 15) mensagem += `_...e mais ${entradas.length - 15} entradas_\n`;
            mensagem += `\n`;
        }

        if (saidas.length > 0) {
            teveMovimentacao = true;
            mensagem += `🚚 *SAÍDAS DO ESTOQUE*\n`;
            saidas.slice(0, 15).forEach(q => {
                mensagem += `🔴 *${q.item} - ${q.descricao}*: ${q.saldoOntem} ➡️ ${q.saldoHoje} (-${q.variacaoAbsoluta})\n`;
            });
            if (saidas.length > 15) mensagem += `_...e mais ${saidas.length - 15} saídas_\n`;
            mensagem += `\n`;
        }

        if (!teveMovimentacao) {
            mensagem += `Nenhum item monitorado sofreu alteração de saldo hoje. ✅\n\n`;
        }

        mensagem += `📊 *A lista completa (incluindo os itens sem movimentação) e as tendências (MQO) estão na planilha em anexo.*`;

        // 5. Histórico Completo para Projeção e Matriz Mensal
        const allHistoryRaw = await executarQuerySql(`SELECT item, descricao, data_historico, saldo_atual FROM historico_estoque ORDER BY data_historico ASC`);
        const allHistory = allHistoryRaw.filter(r => itensMonitorados.has(String(r.item).trim().toUpperCase()));

        const historicoPorItem = new Map(); 
        const historicoMensalPorItem = new Map(); 
        const mesesRegistrados = new Set();
        const descricaoItens = new Map();

        allHistory.forEach(r => {
            const item = String(r.item).trim();
            const dataRaw = String(r.data_historico).trim();
            const saldo = Number(r.saldo_atual) || 0;
            
            descricaoItens.set(item, r.descricao || 'N/A');

            if (!historicoPorItem.has(item)) historicoPorItem.set(item, new Map());
            historicoPorItem.get(item).set(dataRaw, saldo);

            const mesAno = dataRaw.substring(0, 7); 
            if (!historicoMensalPorItem.has(item)) historicoMensalPorItem.set(item, new Map());
            
            historicoMensalPorItem.get(item).set(mesAno, saldo);
            mesesRegistrados.add(mesAno);
        });

        const ultimos12Meses = Array.from(mesesRegistrados).sort().slice(-12);

        const dadosDash = [];
        dadosUnicosHoje.forEach((r, item) => {
            const mapDias = historicoPorItem.get(item);
            if (mapDias) {
                const arrayHistorico = Array.from(mapDias.entries())
                    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
                    .map(([data, valor]) => ({ data, valor }));
                
                const ultimos = arrayHistorico.slice(-6); 

                if (ultimos.length > 1) {
                    const analise = analisarTendenciaEProjetar(ultimos, 3);
                    const coeficienteSeguro = (typeof analise.coeficienteAngular === 'number') ? analise.coeficienteAngular.toFixed(4) : '0.0000';
                    
                    const saldoOntem = mapaOntem.has(item) ? mapaOntem.get(item) : Number(r.saldo_atual);
                    const saldoHoje = Number(r.saldo_atual) || 0;
                    const variacao = saldoHoje - saldoOntem;

                    dadosDash.push({
                        item: item,
                        descricao: r.descricao || 'N/A',
                        saldoOntem: saldoOntem,
                        saldo: saldoHoje,
                        variacao: variacao,
                        direcao: analise.direcao || 'Estável',
                        coeficiente: coeficienteSeguro,
                        proj1: analise.projecoes && analise.projecoes.length > 0 ? Math.round(analise.projecoes[0].valor) : 0,
                        proj2: analise.projecoes && analise.projecoes.length > 1 ? Math.round(analise.projecoes[1].valor) : 0,
                        proj3: analise.projecoes && analise.projecoes.length > 2 ? Math.round(analise.projecoes[2].valor) : 0
                    });
                }
            }
        });

        // 6. Geração Física do Excel
        const workbook = new ExcelJS.Workbook();
        
        const wsGrade = workbook.addWorksheet('Informações e Tendências (MQO)');
        wsGrade.columns = [
            { header: 'Item', key: 'item', width: 12 },
            { header: 'Descrição', key: 'descricao', width: 45 },
            { header: 'Saldo Ontem', key: 'saldoOntem', width: 15 },
            { header: 'Saldo Atual', key: 'saldo', width: 15 },
            { header: 'Variação', key: 'variacao', width: 15 },
            { header: 'Direção da Tendência', key: 'direcao', width: 22 },
            { header: 'Coeficiente (MQO)', key: 'coeficiente', width: 18 },
            { header: 'Projeção Mês +1', key: 'proj1', width: 18 },
            { header: 'Projeção Mês +2', key: 'proj2', width: 18 },
            { header: 'Projeção Mês +3', key: 'proj3', width: 18 }
        ];
        wsGrade.getRow(1).font = { bold: true };
        wsGrade.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };

        dadosDash.forEach(d => {
            const row = wsGrade.addRow(d);
            
            // Cores para a Direção da Tendência
            if (d.direcao === 'Queda') row.getCell('direcao').font = { color: { argb: 'FFC0392B' }, bold: true };
            else if (d.direcao === 'Alta') row.getCell('direcao').font = { color: { argb: 'FF27AE60' }, bold: true };

            // Cores e formatação para a Variação do Estoque
            const celulaVariacao = row.getCell('variacao');
            if (d.variacao > 0) {
                celulaVariacao.font = { color: { argb: 'FF27AE60' }, bold: true };
                celulaVariacao.value = `+${d.variacao}`;
            } else if (d.variacao < 0) {
                celulaVariacao.font = { color: { argb: 'FFC0392B' }, bold: true };
                celulaVariacao.value = `${d.variacao}`;
            } else {
                celulaVariacao.font = { color: { argb: 'FF7F8C8D' } };
                celulaVariacao.value = '0';
            }
        });

        const wsGrafico = workbook.addWorksheet('Base Gráfica (12 Meses)');
        const colunasGrafico = [
            { header: 'Item', key: 'item', width: 12 },
            { header: 'Descrição', key: 'descricao', width: 45 },
            ...ultimos12Meses.map(m => ({ header: m, key: m, width: 15 }))
        ];
        wsGrafico.columns = colunasGrafico;
        wsGrafico.getRow(1).font = { bold: true };
        wsGrafico.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEDED' } };

        historicoMensalPorItem.forEach((mapaMeses, item) => {
            const linha = { item: item, descricao: descricaoItens.get(item) };
            ultimos12Meses.forEach(mes => {
                linha[mes] = mapaMeses.get(mes) !== undefined ? mapaMeses.get(mes) : '';
            });
            wsGrafico.addRow(linha);
        });

        const fileName = `Alerta_DIPAT_${Date.now()}.xlsx`;
        const filePath = path.join(os.tmpdir(), fileName);
        await workbook.xlsx.writeFile(filePath);

        return { mensagem, filePath, destinatarios };

    } catch (error) {
        console.error('Erro na geração do Alerta DIPAT:', error);
        return { erro: error.message };
    }
}

module.exports = { gerarRelatorioAlertasDipat };
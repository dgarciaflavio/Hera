// src/services/radarAlerta.js
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

function paraNumero(valor, padrao = 0) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return padrao;
    let texto = String(valor).trim();
    if (texto.includes('.') && texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
    else if (texto.includes(',')) texto = texto.replace(',', '.');
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : padrao;
}

function possuiAERelacionada(linha) {
    return Object.keys(linha).some(chave => {
        const c = String(chave || '').trim().toUpperCase();
        if (!c.startsWith('AE')) return false;
        if (c.includes('QTDE') || c.includes('EMPENHAR')) return false;
        const val = linha[chave];
        return val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '0' && String(val).trim().toUpperCase() !== 'N/A';
    });
}

function extrairDataJSDeExcel(valor) {
    if (!valor) return null;
    const num = Number(valor);
    if (!isNaN(num) && num > 30000 && num < 60000) {
        const d = new Date((num - 25569) * 86400 * 1000);
        d.setUTCHours(12);
        return isNaN(d.getTime()) ? null : d;
    }
    const txt = String(valor).trim();
    const partes = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (partes) return new Date(parseInt(partes[3], 10), parseInt(partes[2], 10) - 1, parseInt(partes[1], 10), 12, 0, 0);
    return null;
}

async function gerarRelatorioRadar() {
    try {
        const destinatarios = await executarQuerySql(`SELECT nome_radar, telefone_radar FROM alertas_radar`);
        if (!destinatarios || destinatarios.length === 0) {
            return { erro: 'A tabela de contatos do radar está vazia. Cadastre alguém para receber o alerta.' };
        }

        const radarItens = await executarQuerySql(`SELECT item FROM radar_alertas`);
        if (!radarItens || radarItens.length === 0) {
            return { erro: 'O Radar não possui itens cadastrados para monitoramento.' };
        }
        
        const itensMonitorados = radarItens.map(r => r.item.toUpperCase().trim());
        const placeholders = itensMonitorados.map(() => '?').join(',');

        const queryPlanilha = `SELECT * FROM planilha_saldoabaixode90dias WHERE UPPER(TRIM(item)) IN (${placeholders})`;
        const dadosPlanilha = await executarQuerySql(queryPlanilha, itensMonitorados);

        const dadosResumo = [];
        const dadosMqo = [];
        const dadosHistorico = new Map();
        
        const mesesRegistrados = new Set();
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const queryHistorico = `SELECT item, data_historico, saldo_atual FROM historico_estoque WHERE UPPER(TRIM(item)) IN (${placeholders}) ORDER BY data_historico ASC`;
        const allHistoryRaw = await executarQuerySql(queryHistorico, itensMonitorados);

        const historicoPorItem = new Map();
        allHistoryRaw.forEach(r => {
            const i = String(r.item).trim().toUpperCase();
            const d = String(r.data_historico).trim();
            const s = Number(r.saldo_atual) || 0;
            
            if (!historicoPorItem.has(i)) historicoPorItem.set(i, new Map());
            historicoPorItem.get(i).set(d, s);
            
            const mesAno = d.substring(0, 7);
            mesesRegistrados.add(mesAno);
        });
        const ultimos12Meses = Array.from(mesesRegistrados).sort().slice(-12);

        itensMonitorados.forEach(codigoItem => {
            const linha = dadosPlanilha.find(l => {
                let cod = '';
                for(let k in l) if(k.toLowerCase().trim() === 'item') cod = String(l[k]).toUpperCase().trim();
                return cod === codigoItem;
            });

            let descricao = 'Não encontrado na planilha recente';
            let saldoAtual = 0;
            let cmm12 = 0;
            let processoComAta = 'N/A';
            let processoEmAndamento = 'N/A';
            let saldoDaAta = 0;
            let vencAta = '';
            let temEmpenhoValido = false;
            let temAe = false;

            if (linha) {
                for (const k in linha) {
                    const low = k.trim().toLowerCase();
                    const val = linha[k];
                    if (low.includes('descri')) descricao = String(val || '').trim();
                    if (low === 'saldo_atual' || low === 'saldo atual') saldoAtual = paraNumero(val);
                    if (low === 'cmm12') cmm12 = paraNumero(val);
                    if (low === 'processo_com_ata' || low === 'processo') processoComAta = String(val || '').trim();
                    if (low === 'processo_em_andamento') processoEmAndamento = String(val || '').trim();
                    if (low === 'saldo_da_ata') saldoDaAta = paraNumero(val);
                    if (low === 'venc_ata') vencAta = String(val || '').trim();
                    if (low === 'num.empenho' || low === 'num_empenho') {
                        if (val && val !== '0' && String(val).toUpperCase() !== 'N/A') temEmpenhoValido = true;
                    }
                }
                temAe = possuiAERelacionada(linha);
            }

            let ataValida = false;
            const dataVencimento = extrairDataJSDeExcel(vencAta);
            if (dataVencimento && dataVencimento >= hoje && saldoDaAta > 0) {
                ataValida = true;
            }

            dadosResumo.push({
                item: codigoItem,
                descricao,
                saldoAtual,
                cmm12,
                processo: (processoComAta && processoComAta !== '0' && processoComAta.toUpperCase() !== 'N/A') ? processoComAta : processoEmAndamento,
                ataVigente: ataValida ? 'SIM' : 'NÃO',
                saldoAta: saldoDaAta,
                temEmpenho: temEmpenhoValido ? 'SIM' : 'NÃO',
                temAe: temAe ? 'SIM' : 'NÃO'
            });

            const histDoItem = historicoPorItem.get(codigoItem);
            if (histDoItem) {
                const arrayHistorico = Array.from(histDoItem.entries())
                    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
                    .map(([data, valor]) => ({ data, valor }));
                
                const ultimos = arrayHistorico.slice(-6);
                if (ultimos.length > 1) {
                    const analise = analisarTendenciaEProjetar(ultimos, 3);
                    dadosMqo.push({
                        item: codigoItem,
                        descricao,
                        tendencia: analise.tendencia || 'Estável',
                        proj1: analise.projecoes && analise.projecoes.length > 0 ? Math.round(analise.projecoes[0].valor) : 0,
                        proj2: analise.projecoes && analise.projecoes.length > 1 ? Math.round(analise.projecoes[1].valor) : 0,
                        proj3: analise.projecoes && analise.projecoes.length > 2 ? Math.round(analise.projecoes[2].valor) : 0
                    });
                }
                
                const linhaHistorico = { item: codigoItem, descricao };
                ultimos12Meses.forEach(mes => {
                    linhaHistorico[mes] = histDoItem.get(mes) !== undefined ? histDoItem.get(mes) : '';
                });
                dadosHistorico.set(codigoItem, linhaHistorico);
            }
        });

        const workbook = new ExcelJS.Workbook();
        
        // ABA 1: RESUMO DO RADAR
        const wsResumo = workbook.addWorksheet('Resumo Logístico');
        wsResumo.columns = [
            { header: 'Item', key: 'item', width: 12 },
            { header: 'Descrição', key: 'descricao', width: 45 },
            { header: 'Saldo Atual', key: 'saldoAtual', width: 15 },
            { header: 'CMM12', key: 'cmm12', width: 12 },
            { header: 'Processo', key: 'processo', width: 22 },
            { header: 'Ata Vigente c/ Saldo?', key: 'ataVigente', width: 20 },
            { header: 'Saldo Ata', key: 'saldoAta', width: 15 },
            { header: 'Tem AE?', key: 'temAe', width: 12 },
            { header: 'Tem Empenho?', key: 'temEmpenho', width: 15 }
        ];
        wsResumo.getRow(1).font = { bold: true };
        wsResumo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };
        dadosResumo.forEach(d => {
            const row = wsResumo.addRow(d);
            if(d.saldoAtual <= 0) row.getCell('saldoAtual').font = { color: { argb: 'FFC0392B' }, bold: true };
            if(d.ataVigente === 'SIM') row.getCell('ataVigente').font = { color: { argb: 'FF27AE60' }, bold: true };
            else row.getCell('ataVigente').font = { color: { argb: 'FFC0392B' }, bold: true };
        });

        // ABA 2: TENDÊNCIAS MQO
        const wsMqo = workbook.addWorksheet('Tendências (MQO)');
        wsMqo.columns = [
            { header: 'Item', key: 'item', width: 12 },
            { header: 'Descrição', key: 'descricao', width: 45 },
            { header: 'Direção da Tendência', key: 'tendencia', width: 22 },
            { header: 'Projeção Mês +1', key: 'proj1', width: 18 },
            { header: 'Projeção Mês +2', key: 'proj2', width: 18 },
            { header: 'Projeção Mês +3', key: 'proj3', width: 18 }
        ];
        wsMqo.getRow(1).font = { bold: true };
        wsMqo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9E79F' } };
        dadosMqo.forEach(d => {
            const row = wsMqo.addRow(d);
            if (d.tendencia === 'Queda') row.getCell('tendencia').font = { color: { argb: 'FFC0392B' }, bold: true };
            else if (d.tendencia === 'Alta') row.getCell('tendencia').font = { color: { argb: 'FF27AE60' }, bold: true };
        });

        // ABA 3: HISTÓRICO
        const wsGrafico = workbook.addWorksheet('Histórico (Evolução)');
        const colunasGrafico = [
            { header: 'Item', key: 'item', width: 12 },
            { header: 'Descrição', key: 'descricao', width: 45 },
            ...ultimos12Meses.map(m => ({ header: m, key: m, width: 15 }))
        ];
        wsGrafico.columns = colunasGrafico;
        wsGrafico.getRow(1).font = { bold: true };
        wsGrafico.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEDED' } };
        dadosHistorico.forEach((linha) => wsGrafico.addRow(linha));

        const fileName = `Alerta_Radar_${Date.now()}.xlsx`;
        const filePath = path.join(os.tmpdir(), fileName);
        await workbook.xlsx.writeFile(filePath);

        // Construindo a mensagem WhatsApp
        let mensagem = `🚨 *Radar de Itens Críticos* 🚨\n\n`;
        mensagem += `Analisei os *${itensMonitorados.length}* itens cadastrados no radar e compilei os dados de saldo, processos e tendências na planilha em anexo.\n\n`;
        
        const zerados = dadosResumo.filter(i => i.saldoAtual <= 0);
        if (zerados.length > 0) {
            mensagem += `⚠️ *Atenção: ${zerados.length} item(ns) estão ZERADOS neste momento!*\n`;
        }

        mensagem += `\nAbra o arquivo Excel para verificar o Raio-X logístico e o comportamento (MQO) detalhado de cada material.`;

        return { mensagem, filePath, destinatarios };

    } catch (error) {
        console.error('Erro na geração do Relatório Radar:', error);
        return { erro: error.message };
    }
}

module.exports = { gerarRelatorioRadar };
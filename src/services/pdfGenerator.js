const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function gerarPDFItens(dadosItens) {
    // 🛡️ IMPLEMENTAÇÃO DE SEGURANÇA: Previne o erro "Cannot read properties of undefined (reading 'length')"
    if (!dadosItens || !Array.isArray(dadosItens) || dadosItens.length === 0) {
        throw new Error('Não foi possível gerar o PDF: A lista de itens fornecida está vazia ou é inválida.');
    }
    let html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { margin: 20px; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2c3e50; padding: 20px; }
            .header { text-align: center; border-bottom: 3px solid #16a085; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; color: #2c3e50; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 5px 0 0 0; font-size: 12px; color: #7f8c8d; }
            .item-container { background: #fdfdfd; border: 1px solid #ecf0f1; border-left: 5px solid #2980b9; border-radius: 6px; padding: 20px; margin-bottom: 30px; page-break-inside: avoid; }
            .item-title { font-size: 20px; font-weight: bold; color: #2980b9; margin-bottom: 15px; }
            .grid { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; }
            .card { background: #ffffff; border: 1px solid #e0e6ed; border-radius: 6px; padding: 12px; flex: 1; min-width: 120px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
            .card-title { font-size: 11px; color: #95a5a6; text-transform: uppercase; font-weight: bold; margin-bottom: 5px; }
            .card-value { font-size: 16px; color: #34495e; font-weight: bold; }
            .obs { background: #fff8e1; border-left: 4px solid #f1c40f; padding: 10px; font-size: 13px; color: #7f8c8d; margin-bottom: 20px; border-radius: 0 4px 4px 0;}
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
            th, td { border: 1px solid #ecf0f1; padding: 10px; text-align: left; }
            th { background-color: #f4f6f7; color: #34495e; font-weight: bold; text-transform: uppercase; }
            tr:nth-child(even) { background-color: #fafbfc; }
            h3 { font-size: 14px; color: #34495e; margin-bottom: 10px; margin-top: 0; text-transform: uppercase; border-bottom: 1px solid #ecf0f1; padding-bottom: 5px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Relatório Executivo de Itens</h1>
            <p>Gerado pela Inteligência Artificial Hera em ${new Date().toLocaleString('pt-BR')}</p>
        </div>
    `;

    for (const item of dadosItens) {
        html += `
        <div class="item-container">
            <div class="item-title">${item.item} - ${item.descricao}</div>
            <div class="grid">
                <div class="card"><div class="card-title">Saldo Atual</div><div class="card-value">${item.saldoAtual}</div></div>
                <div class="card"><div class="card-title">CMM12</div><div class="card-value">${item.cmm12}</div></div>
                <div class="card"><div class="card-title">Saldo em Dias</div><div class="card-value">${item.saldoEmDias}</div></div>
                <div class="card"><div class="card-title">Venc. Ata</div><div class="card-value">${item.vencimentoAta}</div></div>
                <div class="card"><div class="card-title">Saldo da Ata</div><div class="card-value">${item.saldoAta}</div></div>
            </div>
        `;

        if (item.obs && item.obs !== 'Nenhuma' && item.obs.trim() !== '') {
            html += `<div class="obs"><strong>Observação:</strong> ${item.obs}</div>`;
        }

        // 🛡️️ Adicionado fallback seguro com (?.) e (|| [])
        if (item.empenhosValidos?.length > 0) {
            html += `<h3>Empenho(s) a Receber</h3><table>
                <tr><th>Empenho</th><th>Fornecedor</th><th>Qtd Empenhada</th><th>Qtd Recebida</th><th>Saldo Final</th><th>Val. Unitário</th></tr>`;
            for (const emp of item.empenhosValidos || []) {
                const saldoStr = emp.temExtra ? emp.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : emp.quantidade;
                const qtdeRecebidaStr = emp.temExtra ? emp.qtdeRecebida : '-';
                html += `<tr>
                    <td>${emp.empenho}</td>
                    <td>${emp.fornecedor}</td>
                    <td>${emp.quantidade}</td>
                    <td>${qtdeRecebidaStr}</td>
                    <td style="font-weight: bold; color: #16a085;">${saldoStr}</td>
                    <td>R$ ${emp.valorUnitario}</td>
                </tr>`;
            }
            html += `</table>`;
        }

        if (item.processos?.length > 0) {
            html += `<h3>Processos Associados</h3><table>
                <tr><th>Processo SEI</th><th>Modalidade / Ref.</th><th>Quantidade</th></tr>`;
            for (const proc of item.processos || []) {
                html += `<tr><td>${proc.processo}</td><td>${proc.modalidadeRef}</td><td>${proc.quantidade}</td></tr>`;
            }
            html += `</table>`;
        }

        if (item.aes?.length > 0) {
            html += `<h3>Autorizações de Empenho (AEs)</h3><table>
                <tr><th>Número da AE</th><th>Quantidade</th></tr>`;
            for (const ae of item.aes || []) {
                html += `<tr><td>${ae.ae}</td><td>${ae.quantidade}</td></tr>`;
            }
            html += `</table>`;
        }

        html += `</div>`;
    }

    html += `</body></html>`;

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const dirTemp = path.join(os.tmpdir(), 'hera-pdfs');
    if (!fs.existsSync(dirTemp)) fs.mkdirSync(dirTemp, { recursive: true });
    
    const filePath = path.join(dirTemp, `Relatorio_Hera_${Date.now()}.pdf`);

    await page.pdf({ 
        path: filePath, 
        format: 'A4', 
        printBackground: true 
    });
    
    await browser.close();

    return filePath;
}

/**
 * Função responsável por gerar o Relatório Executivo Analítico do Estoque.
 * Integra gráficos gerados via QuickChart, indicadores de risco, Curva ABC quantitativa e análise IA.
 */
async function gerarPDFRelatorioEstoque(dadosAgregados, insightsIA) {
    // Mini conversor de Markdown para HTML
    const formatarMarkdown = (texto) => {
        let convertido = texto
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/### (.*?)\n/g, '<h3>$1</h3>')
            .replace(/## (.*?)\n/g, '<h2>$1</h2>')
            .replace(/# (.*?)\n/g, '<h1>$1</h1>');
        
        convertido = convertido.split('\n').map(linha => {
            if (linha.trim().startsWith('- ')) {
                return `<li>${linha.trim().substring(2)}</li>`;
            }
            return linha.trim() === '' ? '<br>' : `<p>${linha}</p>`;
        }).join('');

        convertido = convertido.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>').replace(/<\/ul><ul>/g, '');
        return convertido;
    };

    const textoIAFormatado = formatarMarkdown(insightsIA);
    
    // --- LÓGICA DE DADOS ANALÍTICOS EXTRAS PARA A PÁGINA 1 ---
    const totalAtas = dadosAgregados.atasVigentesComSaldo.length + dadosAgregados.atasVigentesSemSaldo.length;
    const totalEmpenhosAtivos = dadosAgregados.empenhosAnoAtual + dadosAgregados.empenhosAnoAnterior;
    
    // KPIs de Cobertura e Risco
    const taxaCobertura = dadosAgregados.totalItensUnicos > 0 ? ((totalAtas / dadosAgregados.totalItensUnicos) * 100).toFixed(1) : 0;
    const taxaEsgotamento = totalAtas > 0 ? ((dadosAgregados.atasVigentesSemSaldo.length / totalAtas) * 100).toFixed(1) : 0;

    // Função auxiliar para ordenar datas no formato DD/MM/YYYY
    const parseDataBR = (str) => {
        if (!str) return new Date(9999, 11, 31).getTime();
        const p = str.split('/');
        if (p.length === 3) return new Date(p[2], p[1] - 1, p[0]).getTime();
        return new Date(9999, 11, 31).getTime();
    };

    // Ordenar Atas a Vencer (Urgência - Data mais próxima)
    const atasUrgentes = [...dadosAgregados.atasVigentesComSaldo]
        .sort((a, b) => parseDataBR(a.vencimento) - parseDataBR(b.vencimento))
        .slice(0, 5);

    // Ordenar Curva A Quantitativa (Maiores saldos)
    const curvaA = [...dadosAgregados.atasVigentesComSaldo]
        .sort((a, b) => b.saldo - a.saldo)
        .slice(0, 5);

    // --- MONTAGEM DE GRÁFICOS (QUICKCHART.IO) ---
    // Gráfico de Pizza (Proporção com Saldo x Sem Saldo)
    const chartAtasUrl = `https://quickchart.io/chart?c={type:'pie',data:{labels:['Com Saldo','Sem Saldo'],datasets:[{data:[${dadosAgregados.atasVigentesComSaldo.length},${dadosAgregados.atasVigentesSemSaldo.length}],backgroundColor:['%2327ae60','%23e74c3c']}]},options:{plugins:{legend:{position:'bottom'}}}}`;
    
    // Gráfico de Medidor (Gauge) de Taxa de Esgotamento
    const colorRisco = taxaEsgotamento > 50 ? '%23e74c3c' : (taxaEsgotamento > 25 ? '%23f39c12' : '%2327ae60');
    const chartRiscoUrl = `https://quickchart.io/chart?c={type:'doughnut',data:{labels:['Esgotado','Disponível'],datasets:[{data:[${taxaEsgotamento},${100-taxaEsgotamento}],backgroundColor:['${colorRisco}','%23ecf0f1'],borderWidth:0}]},options:{cutoutPercentage:75,plugins:{legend:{display:false},doughnutlabel:{labels:[{text:'${taxaEsgotamento}%',font:{size:30,weight:'bold'},color:'${colorRisco}'},{text:'Esgotamento',font:{size:14}}]}}}}`;

    // Gráfico de Barras (Top 5 Observações)
    const top5Obs = dadosAgregados.analiseObservacoes.slice(0, 5);
    const labelsObs = top5Obs.map(o => `'${o.observacao.substring(0,12)}...'`).join(',');
    const dataObs = top5Obs.map(o => o.quantidade).join(',');
    const chartObsUrl = `https://quickchart.io/chart?c={type:'bar',data:{labels:[${encodeURIComponent(labelsObs)}],datasets:[{label:'Itens',data:[${dataObs}],backgroundColor:'%233498db'}]},options:{plugins:{legend:{display:false}},scales:{xAxes:[{ticks:{fontSize:10}}]}}}`;

    let html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { margin: 25px; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2c3e50; padding: 0; line-height: 1.4; }
            .header { text-align: center; border-bottom: 4px solid #8e44ad; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 26px; color: #2c3e50; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 5px 0 0 0; font-size: 13px; color: #7f8c8d; }
            
            .dashboard { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; }
            .card { background: #f8f9fa; border: 1px solid #e0e6ed; border-radius: 8px; padding: 15px; flex: 1; text-align: center; }
            .card-title { font-size: 11px; color: #7f8c8d; text-transform: uppercase; font-weight: bold; margin-bottom: 5px; }
            .card-value { font-size: 22px; color: #2c3e50; font-weight: bold; }
            .card-subtitle { font-size: 10px; color: #95a5a6; margin-top: 5px; }
            
            .charts { display: flex; gap: 15px; margin-bottom: 20px; height: 180px; }
            .chart-container { flex: 1; text-align: center; background: #fff; padding: 10px; border: 1px solid #e0e6ed; border-radius: 8px; display: flex; flex-direction: column; justify-content: center; }
            .chart-container img { max-width: 100%; max-height: 140px; margin: 0 auto; }
            .chart-title { font-size: 13px; font-weight: bold; color: #34495e; margin-bottom: 5px; }
            
            .tables-container { display: flex; gap: 15px; margin-bottom: 20px; }
            .mini-table-box { flex: 1; background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #e0e6ed; }
            .mini-table-box h3 { margin-top: 0; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ecf0f1; padding-bottom: 5px; text-transform: uppercase; }
            
            .ia-insights { background: #fdf5e6; border-left: 5px solid #f39c12; padding: 25px; border-radius: 8px; margin-bottom: 30px; font-size: 14px; }
            .ia-insights h2 { color: #d35400; margin-top: 0; text-transform: uppercase; font-size: 20px; border-bottom: 1px solid #f39c12; padding-bottom: 10px; }
            
            .section-title { font-size: 18px; color: #2c3e50; border-bottom: 2px solid #bdc3c7; padding-bottom: 5px; margin-top: 30px; margin-bottom: 15px; text-transform: uppercase; }
            
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #bdc3c7; padding: 8px; text-align: left; }
            th { background-color: #ecf0f1; color: #2c3e50; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
        </style>
    </head>
    <body>
        <!-- ================= PÁGINA 1: DASHBOARD EXECUTIVO ================= -->
        <div class="header">
            <h1>Relatório Executivo de Estoque</h1>
            <p>Visão Analítica Global | Gerado por Hera (IA) em ${new Date().toLocaleString('pt-BR')}</p>
        </div>

        <div class="dashboard">
            <div class="card" style="border-top: 4px solid #34495e;">
                <div class="card-title">Itens na Grade</div>
                <div class="card-value">${dadosAgregados.totalItensUnicos}</div>
                <div class="card-subtitle">Itens únicos analisados</div>
            </div>
            <div class="card" style="border-top: 4px solid #3498db;">
                <div class="card-title">Cobertura de Atas</div>
                <div class="card-value" style="color: #2980b9;">${taxaCobertura}%</div>
                <div class="card-subtitle">${totalAtas} itens com ata ativa</div>
            </div>
            <div class="card" style="border-top: 4px solid #e74c3c;">
                <div class="card-title">Atas Sem Saldo</div>
                <div class="card-value" style="color: #c0392b;">${dadosAgregados.atasVigentesSemSaldo.length}</div>
                <div class="card-subtitle">Ruptura iminente</div>
            </div>
            <div class="card" style="border-top: 4px solid #f39c12;">
                <div class="card-title">Empenhos Ativos</div>
                <div class="card-value" style="color: #d35400;">${totalEmpenhosAtivos}</div>
                <div class="card-subtitle">Ano vigente + anterior</div>
            </div>
        </div>

        <div class="charts">
            <div class="chart-container">
                <div class="chart-title">Status dos Saldos (Atas)</div>
                <img src="${chartAtasUrl}" alt="Gráfico de Atas" />
            </div>
            <div class="chart-container">
                <div class="chart-title">Risco de Esgotamento</div>
                <img src="${chartRiscoUrl}" alt="Gauge de Risco" />
            </div>
            <div class="chart-container" style="flex: 1.5;">
                <div class="chart-title">Status/Parecer (Top 5)</div>
                <img src="${chartObsUrl}" alt="Gráfico de Observações" />
            </div>
        </div>

        <div class="tables-container">
            <!-- Tabela: Curva de Urgência -->
            <div class="mini-table-box" style="border-top: 4px solid #e74c3c;">
                <h3 style="color: #c0392b;">⚠️ Curva de Urgência (Top 5 Vencimentos)</h3>
                <table>
                    <tr><th>Item</th><th>Vencimento</th><th>Saldo Restante</th></tr>
                    ${atasUrgentes.map(a => `
                    <tr>
                        <td><strong>${a.item}</strong></td>
                        <td style="color: #c0392b; font-weight: bold;">${a.vencimento}</td>
                        <td>${a.saldo.toLocaleString('pt-BR')}</td>
                    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Sem atas próximas</td></tr>'}
                </table>
            </div>

            <!-- Tabela: Curva A -->
            <div class="mini-table-box" style="border-top: 4px solid #27ae60;">
                <h3 style="color: #27ae60;">📦 Curva A Quantitativa (Top 5 Saldos)</h3>
                <table>
                    <tr><th>Item</th><th>Vencimento</th><th>Saldo Disponível</th></tr>
                    ${curvaA.map(a => `
                    <tr>
                        <td><strong>${a.item}</strong></td>
                        <td>${a.vencimento}</td>
                        <td style="color: #27ae60; font-weight: bold;">${a.saldo.toLocaleString('pt-BR')}</td>
                    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Sem dados</td></tr>'}
                </table>
            </div>
        </div>

        <!-- ================= PÁGINA 2: INSIGHTS DA HERA ================= -->
        <div style="page-break-before: always;"></div>
        
        <div class="header">
            <h1>Parecer Estratégico</h1>
            <p>Análise Qualitativa Automatizada</p>
        </div>

        <div class="ia-insights">
            <h2>🧠 Insights Hera</h2>
            ${textoIAFormatado}
        </div>

        <!-- ================= PÁGINA 3 EM DIANTE: DETALHAMENTOS ================= -->
        <div style="page-break-before: always;"></div>
        
        <h2 class="section-title">Detalhamento: Atas Vigentes Sem Saldo (Ruptura)</h2>
        <p style="font-size: 12px; color: #7f8c8d;">Itens que possuem cobertura contratual vigente, mas o saldo quantitativo foi totalmente consumido.</p>
        <table style="margin-bottom: 30px;">
            <thead>
                <tr>
                    <th style="width: 15%">Código</th>
                    <th style="width: 55%">Descrição</th>
                    <th style="width: 15%">Vencimento</th>
                    <th style="width: 15%">Saldo Restante</th>
                </tr>
            </thead>
            <tbody>
                ${dadosAgregados.atasVigentesSemSaldo.map(item => `
                <tr>
                    <td><strong>${item.item}</strong></td>
                    <td>${item.descricao}</td>
                    <td>${item.vencimento}</td>
                    <td style="color: #e74c3c; font-weight: bold;">0</td>
                </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">Nenhum item nesta condição.</td></tr>'}
            </tbody>
        </table>

        <h2 class="section-title">Detalhamento: Atas Vigentes Com Saldo (Disponíveis)</h2>
        <p style="font-size: 12px; color: #7f8c8d;">Itens com cobertura contratual e quantitativo disponível para emissão de novos empenhos.</p>
        <table>
            <thead>
                <tr>
                    <th style="width: 15%">Código</th>
                    <th style="width: 55%">Descrição</th>
                    <th style="width: 15%">Vencimento</th>
                    <th style="width: 15%">Saldo Restante</th>
                </tr>
            </thead>
            <tbody>
                ${dadosAgregados.atasVigentesComSaldo.map(item => `
                <tr>
                    <td><strong>${item.item}</strong></td>
                    <td>${item.descricao}</td>
                    <td>${item.vencimento}</td>
                    <td style="color: #27ae60; font-weight: bold;">${item.saldo.toLocaleString('pt-BR')}</td>
                </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">Nenhum item nesta condição.</td></tr>'}
            </tbody>
        </table>

    </body>
    </html>
    `;

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    // Aumenta o timeout e usa networkidle0 para garantir que as imagens dos gráficos carreguem perfeitamente
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    const dirTemp = path.join(os.tmpdir(), 'hera-pdfs');
    if (!fs.existsSync(dirTemp)) fs.mkdirSync(dirTemp, { recursive: true });
    
    const filePath = path.join(dirTemp, `Analise_Estoque_${Date.now()}.pdf`);

    await page.pdf({ 
        path: filePath, 
        format: 'A4', 
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    
    await browser.close();

    return filePath;
}

module.exports = { gerarPDFItens, gerarPDFRelatorioEstoque };
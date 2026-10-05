const puppeteer = require('puppeteer');

// O limite da Dispensa 75-II
const LIMITE_MAXIMO_PDM = 65492.11;

/**
 * Utilitário para formatar moeda no padrão Brasileiro (R$ 1.234,56)
 */
function formatarMoedaBrasil(valor) {
    return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
    }).format(valor || 0);
}

/**
 * Blindagem contra caracteres especiais no HTML
 */
function _escapeHtml_(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Função principal que gera o Buffer do PDF
 */
async function gerarRelatorioPdfPdm(resultados, termoBusca) {
    const gruposPdm = {};
    
    // 1. Agrupando os itens pela família PDM
    resultados.forEach(r => {
        const pdm = r.codigoPdm || 'NÃO INFORMADO';
        if (!gruposPdm[pdm]) {
            gruposPdm[pdm] = { 
                somaPdm: r.somaPdm || 0, 
                itens: r.itensDoGrupo || [] 
            };
        }
    });
    
    // 2. Construindo a estrutura HTML base (Mantivemos a sua identidade visual)
    let htmlPdf = `
    <!DOCTYPE html>
    <html><head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; color: #333; margin: 20px; }
            h1 { color: #1a73e8; font-size: 22px; border-bottom: 2px solid #1a73e8; padding-bottom: 8px; margin-bottom: 5px; }
            .sub { color: #666; font-size: 12px; margin-bottom: 25px; }
            h2 { font-size: 16px; background: #f1f3f4; padding: 8px; border-left: 5px solid #1a73e8; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
            th { background: #eceff1; padding: 8px; border-bottom: 2px solid #cfd8dc; text-align: left; }
            td { padding: 7px; border-bottom: 1px solid #eceff1; }
            .v { text-align: right; white-space: nowrap; }
            .rodape-pdm { text-align: right; margin-top: 15px; font-size: 13px; line-height: 1.6; }
            .highlight-disponivel { font-size: 15px; font-weight: bold; }
        </style>
    </head><body>
        <h1>Relatório de Distribuição PDM</h1>
        <div class="sub">Relatório gerado automaticamente pela Hera a partir da busca pelo termo: <b>${_escapeHtml_(termoBusca)}</b></div>
    `;
    
    // 3. Injetando os dados dos PDMs e Itens nas tabelas
    Object.keys(gruposPdm).forEach(pdm => {
        const totalPdm = gruposPdm[pdm].somaPdm || 0;
        const disponivel = LIMITE_MAXIMO_PDM - totalPdm;
        const corDisp = disponivel >= 0 ? '#188038' : '#d93025'; // Verde se OK, Vermelho se estourou
        
        htmlPdf += `
            <h2>Código PDM: ${_escapeHtml_(pdm)}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Descrição</th>
                        <th>Código PDM</th>
                        <th class="v">Valor Consumido (75-II)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        gruposPdm[pdm].itens.forEach(it => {
            htmlPdf += `
                <tr>
                    <td>${_escapeHtml_(it.codigoItem || '')}</td>
                    <td>${_escapeHtml_(it.descricao || '')}</td>
                    <td>${pdm !== 'NÃO INFORMADO' ? _escapeHtml_(pdm) : '-'}</td>
                    <td class="v">${formatarMoedaBrasil(it.somaItem || 0)}</td>
                </tr>
            `;
        });
        
        htmlPdf += `
                </tbody>
            </table>
            <div class="rodape-pdm">
                <b>Total já empenhado no PDM:</b> ${formatarMoedaBrasil(totalPdm)}<br>
                <b>Teto da Modalidade (Dispensa 75-II):</b> ${formatarMoedaBrasil(LIMITE_MAXIMO_PDM)}<br>
                <b>Margem Disponível:</b> <span class="highlight-disponivel" style="color:${corDisp};">${formatarMoedaBrasil(disponivel)}</span>
            </div>
        `;
    });
    
    htmlPdf += `</body></html>`;
    
    // 4. Transformando o HTML em PDF com o Puppeteer
    console.log(`📄 Iniciando geração do PDF para o termo: ${termoBusca}...`);
    
    const browser = await puppeteer.launch({ 
        headless: 'new', // Novo modo headless, mais leve e rápido
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    
    // Carrega o HTML na página invisível
    await page.setContent(htmlPdf, { waitUntil: 'networkidle0' });
    
    // "Imprime" a página em formato A4
    const pdfBuffer = await page.pdf({ 
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    
    await browser.close();
    console.log(`✅ PDF gerado com sucesso!`);
    
    return pdfBuffer;
}

module.exports = { gerarRelatorioPdfPdm, formatarMoedaBrasil };
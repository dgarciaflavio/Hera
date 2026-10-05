const fs = require('fs');
const path = require('path');

// Aponta para o novo diretório de documentos
const DOCS_DIR = path.join(process.cwd(), 'data', 'documentos');

function garantirDiretorioDocs() {
    if (!fs.existsSync(DOCS_DIR)) {
        fs.mkdirSync(DOCS_DIR, { recursive: true });
    }
}

function formatarTitulo(nomeArquivo) {
    // Remove a extensão do arquivo (.pdf, .txt, etc)
    const nomeSemExtensao = nomeArquivo.replace(/\.[^/.]+$/, "");
    
    // Substitui traços e underlines por espaços
    const comEspacos = nomeSemExtensao.replace(/[-_]/g, ' ');
    
    // Coloca a primeira letra de cada palavra em maiúscula para ficar amigável
    return comEspacos.replace(/\b\w/g, char => char.toUpperCase());
}

function listarDocumentosDisponiveis() {
    garantirDiretorioDocs();
    
    try {
        const arquivos = fs.readdirSync(DOCS_DIR);
        
        // Filtra apenas PDFs e TXTs e mapeia para criar os IDs do menu
        const documentos = arquivos
            .filter(arq => arq.toLowerCase().endsWith('.pdf') || arq.toLowerCase().endsWith('.txt'))
            .map((arquivo, index) => {
                return {
                    id: index + 1, // ID que o usuário vai digitar (1, 2, 3...)
                    arquivo: arquivo,
                    titulo: formatarTitulo(arquivo),
                    caminho: path.join(DOCS_DIR, arquivo)
                };
            });
            
        return documentos;
    } catch (erro) {
        console.error('Erro ao ler a pasta de documentos:', erro);
        return [];
    }
}

function obterDocumentoPorId(idStr) {
    const id = parseInt(String(idStr).trim(), 10);
    if (isNaN(id)) return null;

    const documentos = listarDocumentosDisponiveis();
    return documentos.find(doc => doc.id === id) || null;
}

module.exports = {
    listarDocumentosDisponiveis,
    obterDocumentoPorId
};
// src/views/navbar.js

function gerarNavbar(usuario) {
    const usr = usuario || { login: 'Visitante', is_admin: 0, permissoes: '[]' };
    const isAdmin = usr.is_admin === 1 || usr.login === 'admin';
    
    let permissoes = [];
    try {
        permissoes = typeof usr.permissoes === 'string' ? JSON.parse(usr.permissoes) : (usr.permissoes || []);
    } catch(e) {
        permissoes = [];
    }
    
    const temPermissao = (recurso) => isAdmin || permissoes.includes('todas') || permissoes.includes(recurso);
    
    // 1. Menu Inteligência
    const linkChat = temPermissao('chat') ? `<a href="/chat">💬 Chat Web</a>` : '';
    const linkContatos = temPermissao('contatos') ? `<a href="/contatos">👥 Analisar Contatos</a>` : '';
    const linkDipat = temPermissao('dipat') ? `<a href="/dipat">🎯 Análise DIPAT</a>` : '';
    const linkRadar = temPermissao('radar') ? `<a href="/radar">📡 Radar de Itens</a>` : ''; 
    const linkMatriz = temPermissao('matriz-risco') ? `<a href="/matriz-risco">⚖️ Matriz de Risco</a>` : ''; 
    const linkRessuprimento = temPermissao('ressuprimento') ? `<a href="/ressuprimento">🛒 Ressuprimento</a>` : ''; 
    
    const menuInteligencia = (linkChat || linkContatos || linkDipat || linkRadar || linkMatriz || linkRessuprimento) ? `
        <div class="dropdown">
            <button class="dropbtn">🧠 Inteligência ▾</button>
            <div class="dropdown-content">${linkChat}${linkContatos}${linkDipat}${linkRadar}${linkMatriz}${linkRessuprimento}</div>
        </div>` : '';
        
    // 2. Menu Dashboards
    const linkDash = temPermissao('dashboard') ? `<a href="/dashboard">📊 Dashboard</a>` : '';
    const linkExecutivo = temPermissao('dashboard') ? `<a href="/painel-executivo">💼 Painel Executivo</a>` : ''; // <-- NOVA LINHA ADICIONADA
    const linkDashDin = temPermissao('dashboard-dinamico') ? `<a href="/dashboard-dinamico">📈 Dinâmico</a>` : '';
    const linkTendencias = temPermissao('tendencias') ? `<a href="/tendencias">📉 Tendências</a>` : '';
    const linkPregoes = temPermissao('pregoes') ? `<a href="/pregoes">🏛️ Pregões</a>` : '';
    
    // ATUALIZAÇÃO: Inclusão do linkExecutivo no menu
    const menuDashboards = (linkDash || linkExecutivo || linkDashDin || linkTendencias || linkPregoes) ? `
        <div class="dropdown">
            <button class="dropbtn">📊 Dashboards ▾</button>
            <div class="dropdown-content">${linkDash}${linkExecutivo}${linkDashDin}${linkTendencias}${linkPregoes}</div>
        </div>` : '';
        
    // 3. Menu Operacional
    const linkStatus = temPermissao('status') ? `<a href="/">⚙️ Status</a>` : '';
    const linkImportacao = temPermissao('importacao') ? `<a href="/importacao">📥 Importar Dados</a>` : '';
    const linkConsultas = temPermissao('consultas') ? `<a href="/consultas">🗂️ Últimas Consultas</a>` : '';
    
    const menuOperacional = (linkStatus || linkImportacao || linkConsultas) ? `
        <div class="dropdown">
            <button class="dropbtn">⚙️ Operacional ▾</button>
            <div class="dropdown-content">${linkStatus}${linkImportacao}${linkConsultas}</div>
        </div>` : '';
        
    // 4. Menu do Usuário
    const linkGerenciarEquipe = isAdmin ? `<a href="/usuarios">👥 Gerenciar Equipe</a>` : '';
    
    const dropdownUsuario = `
        <div class="dropdown" style="margin-left: auto;">
            <button class="dropbtn">👤 ${usr.login || 'Usuário'} ▾</button>
            <div class="dropdown-content" style="right: 0; left: auto;">
                ${linkGerenciarEquipe}
                <a href="/api/auth/logout" style="color: #e74c3c; font-weight: bold;">🚪 Sair</a>
            </div>
        </div>`;
        
    return `
        <div class="navbar">
            <div class="nav-brand">📊 Painel Hera</div>
            ${menuInteligencia}
            ${menuDashboards}
            ${menuOperacional}
            ${dropdownUsuario}
        </div>
    `;
}

module.exports = { gerarNavbar };
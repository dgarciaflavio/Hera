const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderUsuarios(usuarios, usuarioLogado) {
    let linhasTabela = '';

    usuarios.forEach(u => {
        let permissoesArr = [];
        try {
            permissoesArr = JSON.parse(u.permissoes);
        } catch(e) {}
        
        let badges = '';
        if (u.is_admin === 1 || permissoesArr.includes('todas')) {
            badges = '<span class="badge" style="background:#8e44ad;">Acesso Total</span>';
        } else {
            permissoesArr.forEach(p => {
                badges += `<span class="badge" style="background:#34495e; margin-right:4px;">${p}</span>`;
            });
        }

        const btnEditarDados = u.is_admin === 0 ? `<button class="btn-sm btn-edit" onclick="abrirModalDados(${u.id}, '${u.nome || ''}', '${u.login}')">✏️ Editar Perfil</button>` : '';
        const btnPermissoes = u.is_admin === 0 ? `<button class="btn-sm btn-perm" onclick='abrirModalPermissoes(${u.id}, ${JSON.stringify(permissoesArr)})'>🛡️ Permissões</button>` : '';
        const btnResetar = u.is_admin === 0 ? `<button class="btn-sm btn-warn" onclick="resetarSenha(${u.id})">🔑 Resetar Senha</button>` : '';
        const btnExcluir = u.is_admin === 0 ? `<button class="btn-sm btn-danger" onclick="excluirUsuario(${u.id}, '${u.login}')">🗑️️ Excluir</button>` : '';

        linhasTabela += `
            <tr>
                <td style="text-align:center;"><b>${u.id}</b></td>
                <td><strong>${u.nome || 'Não Informado'}</strong></td>
                <td>${u.login} ${u.is_admin === 1 ? '👑' : ''}</td>
                <td>${badges || '<span style="color:#7f8c8d; font-style:italic;">Sem acessos</span>'}</td>
                <td>
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        ${btnEditarDados}
                        ${btnPermissoes}
                        ${btnResetar}
                        ${btnExcluir}
                    </div>
                </td>
            </tr>
        `;
    });

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Gestão de Equipe - Hera</title>
        ${estiloCSS}
        <style>
            .header-flex { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .btn-novo-usuario {
                background: linear-gradient(135deg, #27ae60, #2ecc71);
                color: white;
                padding: 12px 24px;
                border: none;
                border-radius: 30px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(39, 174, 96, 0.4);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .btn-novo-usuario:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(39, 174, 96, 0.6);
            }
            .table-users { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
            .table-users th { background: #34495e; color: white; padding: 15px; text-align: left; }
            .table-users td { padding: 15px; border-bottom: 1px solid #ecf0f1; }
            .table-users tr:hover { background: #f8f9fa; }
            .badge { padding: 4px 8px; border-radius: 12px; color: white; font-size: 11px; font-weight: bold; display: inline-block; margin-bottom: 4px; }
            
            .btn-sm { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; color: white; transition: 0.2s; }
            .btn-edit { background: #3498db; } .btn-edit:hover { background: #2980b9; }
            .btn-perm { background: #9b59b6; } .btn-perm:hover { background: #8e44ad; }
            .btn-warn { background: #f39c12; } .btn-warn:hover { background: #e67e22; }
            .btn-danger { background: #e74c3c; } .btn-danger:hover { background: #c0392b; }

            .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); justify-content: center; align-items: center; z-index: 1000; }
            .modal-content { background: white; padding: 30px; border-radius: 10px; width: 500px; max-width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
            .modal-header { font-size: 20px; font-weight: bold; margin-bottom: 20px; color: #2c3e50; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; }
            .input-group { margin-bottom: 15px; }
            .input-group label { display: block; font-weight: bold; margin-bottom: 5px; color: #34495e; }
            .input-group input[type="text"] { width: 100%; padding: 10px; border: 1px solid #bdc3c7; border-radius: 5px; box-sizing: border-box; }
            
            .checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
            .checkbox-item { display: flex; align-items: center; gap: 8px; background: #f8f9fa; padding: 8px; border-radius: 5px; border: 1px solid #ecf0f1; }
            
            .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; }
            .btn-cancelar { background: #bdc3c7; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
            .btn-salvar { background: #2ecc71; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        <div class="container" style="max-width: 1200px; margin: 30px auto;">
            <div class="header-flex">
                <div>
                    <h1 style="color: #2c3e50; margin: 0;">👥 Gestão de Equipe</h1>
                    <p style="color: #7f8c8d; margin-top: 5px;">Gerencie o acesso dos planejadores aos módulos da Hera.</p>
                </div>
                <button class="btn-novo-usuario" onclick="abrirModalCriar()">
                    <span style="font-size: 20px;">+</span> Adicionar Membro
                </button>
            </div>

            <table class="table-users">
                <thead>
                    <tr>
                        <th style="width: 50px; text-align: center;">ID</th>
                        <th>Nome</th>
                        <th>Login</th>
                        <th>Permissões Ativas</th>
                        <th style="width: 320px;">Ações Administrativas</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhasTabela}
                </tbody>
            </table>
        </div>

        <!-- MODAL CRIAR USUÁRIO -->
        <div id="modalCriar" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">➕ Criar Novo Usuário</div>
                <div class="input-group">
                    <label>Nome Completo:</label>
                    <input type="text" id="novoNome" placeholder="Ex: João Silva">
                </div>
                <div class="input-group">
                    <label>Login de Acesso:</label>
                    <input type="text" id="novoLogin" placeholder="Ex: joao.silva">
                </div>
                <p style="color: #e67e22; font-size: 12px; margin-bottom: 15px;">A senha provisória será <b>Inca123</b>. O usuário será forçado a trocar no primeiro acesso.</p>
                
                <label style="font-weight: bold; color: #34495e;">Permissões Iniciais:</label>
                <div class="checkbox-grid">
                    ${gerarCheckboxesPermissoes('criar')}
                </div>
                <div class="modal-footer">
                    <button class="btn-cancelar" onclick="fecharModal('modalCriar')">Cancelar</button>
                    <button class="btn-salvar" onclick="salvarNovoUsuario()">Cadastrar Usuário</button>
                </div>
            </div>
        </div>

        <!-- MODAL EDITAR DADOS -->
        <div id="modalDados" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">✏️ Editar Perfil do Usuário</div>
                <input type="hidden" id="editUserId">
                <div class="input-group">
                    <label>Nome Completo:</label>
                    <input type="text" id="editNome">
                </div>
                <div class="input-group">
                    <label>Login de Acesso:</label>
                    <input type="text" id="editLogin">
                </div>
                <div class="modal-footer">
                    <button class="btn-cancelar" onclick="fecharModal('modalDados')">Cancelar</button>
                    <button class="btn-salvar" onclick="salvarDadosUsuario()">Atualizar Dados</button>
                </div>
            </div>
        </div>

        <!-- MODAL EDITAR PERMISSÕES -->
        <div id="modalPermissoes" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">🛡️ Modificar Permissões</div>
                <input type="hidden" id="permUserId">
                <div class="checkbox-grid">
                    ${gerarCheckboxesPermissoes('edit')}
                </div>
                <div class="modal-footer">
                    <button class="btn-cancelar" onclick="fecharModal('modalPermissoes')">Cancelar</button>
                    <button class="btn-salvar" onclick="salvarPermissoes()">Salvar Permissões</button>
                </div>
            </div>
        </div>

        <script>
            function fecharModal(id) {
                document.getElementById(id).style.display = 'none';
            }

            // --- CRIAR USUÁRIO ---
            function abrirModalCriar() {
                document.getElementById('novoNome').value = '';
                document.getElementById('novoLogin').value = '';
                document.querySelectorAll('.chk-criar').forEach(c => c.checked = false);
                document.getElementById('modalCriar').style.display = 'flex';
            }

            async function salvarNovoUsuario() {
                const nome = document.getElementById('novoNome').value.trim();
                const login = document.getElementById('novoLogin').value.trim();
                if (!nome || !login) return alert('Preencha o Nome e o Login.');
                
                const permissoes = Array.from(document.querySelectorAll('.chk-criar:checked')).map(c => c.value);
                
                try {
                    const res = await fetch('/api/usuarios/criar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nome, login, permissoes })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.erro);
                    alert(data.mensagem);
                    window.location.reload();
                } catch(e) { alert('Erro: ' + e.message); }
            }

            // --- EDITAR DADOS (NOME/LOGIN) ---
            function abrirModalDados(id, nome, login) {
                document.getElementById('editUserId').value = id;
                document.getElementById('editNome').value = nome;
                document.getElementById('editLogin').value = login;
                document.getElementById('modalDados').style.display = 'flex';
            }

            async function salvarDadosUsuario() {
                const id = document.getElementById('editUserId').value;
                const nome = document.getElementById('editNome').value.trim();
                const login = document.getElementById('editLogin').value.trim();
                
                if (!nome || !login) return alert('Nome e Login não podem ficar vazios.');

                try {
                    const res = await fetch('/api/usuarios/' + id + '/dados', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nome, login })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.erro);
                    alert(data.mensagem);
                    window.location.reload();
                } catch(e) { alert('Erro: ' + e.message); }
            }

            // --- EDITAR PERMISSÕES ---
            function abrirModalPermissoes(id, permissoesAtuais) {
                document.getElementById('permUserId').value = id;
                document.querySelectorAll('.chk-edit').forEach(c => {
                    c.checked = permissoesAtuais.includes('todas') || permissoesAtuais.includes(c.value);
                });
                document.getElementById('modalPermissoes').style.display = 'flex';
            }

            async function salvarPermissoes() {
                const id = document.getElementById('permUserId').value;
                const permissoes = Array.from(document.querySelectorAll('.chk-edit:checked')).map(c => c.value);
                try {
                    const res = await fetch('/api/usuarios/' + id + '/permissoes', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ permissoes })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.erro);
                    alert(data.mensagem);
                    window.location.reload();
                } catch(e) { alert('Erro: ' + e.message); }
            }

            // --- OUTRAS FUNÇÕES ---
            async function resetarSenha(id) {
                if(!confirm('A senha voltará a ser "Inca123" e será exigida a troca no próximo acesso. Confirmar?')) return;
                try {
                    const res = await fetch('/api/usuarios/' + id + '/resetar', { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.erro);
                    alert(data.mensagem);
                } catch(e) { alert('Erro: ' + e.message); }
            }

            async function excluirUsuario(id, login) {
                if(!confirm('ATENÇÃO: Excluir permanentemente o usuário "' + login + '"?')) return;
                try {
                    const res = await fetch('/api/usuarios/' + id, { method: 'DELETE' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.erro);
                    window.location.reload();
                } catch(e) { alert('Erro: ' + e.message); }
            }
        </script>
    </body>
    </html>
    `;
}

// Helper interno para desenhar as caixas de seleção
function gerarCheckboxesPermissoes(prefix) {
    const lista = [
        { val: 'chat', label: '💬 Chat Web' },
        { val: 'contatos', label: '👥 Analisar Contatos' },
        { val: 'dipat', label: '🎯 Análise DIPAT' },
        { val: 'radar', label: '📡 Radar de Itens' },
        { val: 'matriz-risco', label: '⚖️ Matriz de Risco' },
        { val: 'ressuprimento', label: '🛒 Ressuprimento' },
        { val: 'dashboard', label: '📊 Dashboard Geral' },
        { val: 'painel-executivo', label: '💼 Painel Executivo' },
        { val: 'dashboard-dinamico', label: '📈 Dash. Dinâmico' },
        { val: 'tendencias', label: '📉 Tendências' },
        { val: 'pregoes', label: '🏛️ Pregões' },
        { val: 'status', label: '⚙️ Status da Hera' },
        { val: 'importacao', label: '📥 Importar Dados' },
        { val: 'consultas', label: '🗂️ Últimas Consultas' }
    ];

    return lista.map(p => `
        <label class="checkbox-item">
            <input type="checkbox" class="chk-${prefix}" value="${p.val}"> ${p.label}
        </label>
    `).join('');
}

module.exports = { renderUsuarios };
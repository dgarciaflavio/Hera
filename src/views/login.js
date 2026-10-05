const { estiloCSS } = require('./style');

function renderLogin(redirectUrl = '/', forcandoTroca = false) {
    if (forcandoTroca) {
        return `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Troca de Senha Obrigatória</title>
                ${estiloCSS}
                <style>
                    body { display: flex; flex-direction: column; height: 100vh; margin: 0; background: #e0e5ec; }
                    .login-container { flex: 1; display: flex; justify-content: center; align-items: center; }
                    .login-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 5px 5px 15px #c8d0e7, -5px -5px 15px #ffffff; text-align: center; width: 100%; max-width: 350px; }
                    input { padding: 12px; width: 100%; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; font-size: 16px; }
                    button { padding: 12px; background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px; transition: 0.3s; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
                    button:hover { background: linear-gradient(135deg, #c0392b, #a93226); transform: translateY(-2px); }
                </style>
            </head>
            <body>
                <div class="login-container">
                    <div class="login-box">
                        <h2 style="color: #e74c3c; margin-top: 0; margin-bottom: 10px;">⚠️ Atenção</h2>
                        <p style="color: #555; margin-bottom: 20px; font-size: 14px;">Você está usando uma senha provisória ou padrão. Por segurança, crie uma nova senha agora.</p>
                        <form id="formSenha">
                            <input type="password" id="novaSenha" placeholder="Digite sua nova senha" required autofocus minlength="5">
                            <button type="submit">Salvar e Continuar</button>
                        </form>
                    </div>
                </div>
                <script>
                    document.getElementById('formSenha').onsubmit = async (e) => {
                        e.preventDefault();
                        const pwd = document.getElementById('novaSenha').value;
                        try {
                            const res = await fetch('/api/auth/trocar-senha', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nova_senha: pwd })
                            });
                            const data = await res.json();
                            if(res.ok) { alert(data.mensagem); window.location.href = '/'; }
                            else { alert(data.erro); }
                        } catch(e) { alert('Erro na comunicação'); }
                    }
                </script>
            </body>
            </html>
        `;
    }

    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Login - Hera</title>
            ${estiloCSS}
            <style>
                body { display: flex; flex-direction: column; height: 100vh; margin: 0; background: #e0e5ec; }
                .login-container { flex: 1; display: flex; justify-content: center; align-items: center; }
                .login-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 5px 5px 15px #c8d0e7, -5px -5px 15px #ffffff; text-align: center; width: 100%; max-width: 300px; }
                input { padding: 12px; width: 100%; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; font-size: 16px; }
                button { padding: 12px; background: linear-gradient(135deg, #8e44ad, #bdc3c7); color: #130720; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px; transition: 0.3s; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
                button:hover { background: linear-gradient(135deg, #9b59b6, #ffffff); transform: translateY(-2px); }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-box">
                    <h2 style="color: #2c3e50; margin-top: 0; margin-bottom: 20px;">🔐 Acesso Restrito</h2>
                    <form method="POST" action="/api/auth/login">
                        <input type="text" name="login" placeholder="Nome de Usuário" required autofocus>
                        <input type="password" name="senha" placeholder="Digite a senha" required>
                        <input type="hidden" name="redirect" value="${redirectUrl || '/'}">
                        <button type="submit">Entrar no Painel</button>
                    </form>
                </div>
            </div>
        </body>
        </html>
    `;
}

module.exports = { renderLogin };
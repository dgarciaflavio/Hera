const { estiloCSS } = require('./style');
const { gerarNavbar } = require('./navbar');

function renderChat(usuarioLogado) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Chat Web - Hera</title>
        ${estiloCSS}
        <style>
            .container-gemini { max-width: 1500px; width: 95%; margin: 20px auto; height: calc(100vh - 120px); min-height: 600px; }
            .chat-layout { display: flex; height: 100%; border-radius: 20px; background: linear-gradient(135deg, #0b0314, #2a0a38); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), inset 0 1px 2px rgba(255, 255, 255, 0.2), inset 0 -1px 15px rgba(142, 68, 173, 0.3); overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1); }
            
            /* Sidebar */
            .chat-sidebar { width: 280px; background: rgba(0, 0, 0, 0.4); border-right: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; padding: 20px; backdrop-filter: blur(15px); box-shadow: 5px 0 25px rgba(0,0,0,0.3); z-index: 2; }
            .btn-novo-chat { background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255, 255, 255, 0.15); padding: 12px 18px; border-radius: 30px; cursor: pointer; font-weight: bold; font-size: 14px; transition: all 0.3s ease; display: flex; justify-content: center; align-items: center; gap: 10px; box-shadow: inset 0 2px 4px rgba(255,255,255,0.05); }
            .btn-novo-chat:hover { background: rgba(255, 255, 255, 0.15); box-shadow: 0 0 15px rgba(255, 255, 255, 0.2), inset 0 2px 4px rgba(255,255,255,0.1); transform: translateY(-2px); }
            .historico-titulo { color: rgba(255, 255, 255, 0.4); font-size: 11px; font-weight: bold; margin-top: 30px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1.5px; padding-left: 5px; }
            .historico-lista { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; padding-right: 5px; }
            .historico-lista::-webkit-scrollbar { width: 4px; }
            .historico-lista::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
            
            .historico-item { color: rgba(255, 255, 255, 0.65); padding: 12px 15px; border-radius: 12px; cursor: pointer; font-size: 13px; display: flex; justify-content: space-between; align-items: center; transition: all 0.3s ease; border: 1px solid transparent; background: rgba(255, 255, 255, 0.02); }
            .historico-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
            .historico-item:hover { background: rgba(255, 255, 255, 0.08); color: #fff; transform: translateX(5px); border-color: rgba(255,255,255,0.1); }
            .historico-item.active { background: linear-gradient(135deg, rgba(142, 68, 173, 0.4), rgba(44, 62, 80, 0.4)); border: 1px solid rgba(142, 68, 173, 0.5); color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.2), inset 0 0 10px rgba(142, 68, 173, 0.2); }
            
            .btn-delete { background: none; border: none; color: #e74c3c; cursor: pointer; opacity: 0; transition: 0.3s; font-size: 16px; padding: 0 5px; filter: grayscale(100%); }
            .historico-item:hover .btn-delete { opacity: 1; filter: grayscale(0%); }
            .btn-delete:hover { transform: scale(1.3) rotate(10deg); text-shadow: 0 0 5px rgba(231, 76, 60, 0.5); }
            
            /* Main Chat Area */
            .chat-main { flex: 1; display: flex; flex-direction: column; position: relative; background: radial-gradient(circle at 50% 0%, rgba(142, 68, 173, 0.15), transparent 60%); }
            .chat-header { padding: 20px 30px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #fff; font-size: 1.2rem; font-weight: bold; display: flex; align-items: center; justify-content: space-between; z-index: 1; background: rgba(0,0,0,0.2); backdrop-filter: blur(10px); }
            .header-title { display: flex; align-items: center; gap: 10px; text-shadow: 0 0 15px rgba(255,255,255,0.5); font-weight: 800; letter-spacing: 0.5px; }
            
            /* Messages */
            .chat-messages { flex: 1; padding: 30px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; z-index: 1; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
            .chat-messages::-webkit-scrollbar { width: 6px; }
            .chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
            
            /* Message Wrapper & Avatares */
            .chat-message-wrapper { display: flex; gap: 12px; align-items: flex-end; max-width: 85%; animation: slideUpFadeIn 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; opacity: 0; transform: translateY(20px); }
            .chat-message-wrapper.hera { align-self: flex-start; }
            .chat-message-wrapper.user { align-self: flex-end; flex-direction: row-reverse; }
            
            .avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); flex-shrink: 0; z-index: 2; border: 1px solid rgba(255,255,255,0.1); }
            .avatar.hera { background: linear-gradient(135deg, #8e44ad, #2980b9); }
            .avatar.user { background: linear-gradient(135deg, #34495e, #7f8c8d); }
            
            .chat-message { padding: 16px 22px; border-radius: 20px; font-size: 15px; line-height: 1.6; backdrop-filter: blur(12px); color: #fff; position: relative; white-space: pre-wrap; word-wrap: break-word; box-shadow: 0 8px 25px rgba(0,0,0,0.25); letter-spacing: 0.2px; }
            .chat-message-wrapper.hera .chat-message { background: linear-gradient(135deg, rgba(142, 68, 173, 0.25), rgba(44, 62, 80, 0.45)); border: 1px solid rgba(255, 255, 255, 0.15); border-bottom-left-radius: 4px; }
            .chat-message-wrapper.user .chat-message { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.25); border-bottom-right-radius: 4px; }
            
            @keyframes slideUpFadeIn { 
                to { opacity: 1; transform: translateY(0); } 
            }

            /* Input Area */
            .chat-input-container { padding: 25px 30px; display: flex; gap: 15px; z-index: 1; background: linear-gradient(to top, rgba(0,0,0,0.6), transparent); }
            .chat-input { flex: 1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); padding: 18px 25px; border-radius: 30px; color: white; font-size: 15px; outline: none; transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); box-shadow: inset 0 2px 5px rgba(0,0,0,0.2); backdrop-filter: blur(10px); }
            .chat-input:focus { background: rgba(255, 255, 255, 0.1); border-color: rgba(142, 68, 173, 0.8); box-shadow: 0 0 20px rgba(142, 68, 173, 0.4), inset 0 2px 5px rgba(0,0,0,0.2); transform: translateY(-2px); }
            .chat-input::placeholder { color: rgba(255, 255, 255, 0.3); }
            
            .btn-send { background: linear-gradient(135deg, #bdc3c7, #ffffff); border: none; color: #130720; width: 56px; height: 56px; border-radius: 50%; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); box-shadow: 0 5px 15px rgba(0,0,0,0.3); font-size: 22px; font-weight: bold; }
            .btn-send:hover { transform: scale(1.1) rotate(-10deg); box-shadow: 0 0 25px rgba(255, 255, 255, 0.6); background: linear-gradient(135deg, #ffffff, #e0e5ec); }
            .btn-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
            
            /* Typing Indicator (Dots) */
            .typing-indicator-container { display: none; align-items: center; gap: 10px; }
            .typing-label { font-size: 13px; color: rgba(255,255,255,0.7); font-style: italic; }
            .typing-dots { display: flex; gap: 4px; align-items: center; height: 20px; }
            .dot { width: 6px; height: 6px; background-color: #9b59b6; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; box-shadow: 0 0 5px rgba(155, 89, 182, 0.5); }
            .dot:nth-child(1) { animation-delay: -0.32s; }
            .dot:nth-child(2) { animation-delay: -0.16s; }
            @keyframes bounce { 
                0%, 80%, 100% { transform: scale(0); } 
                40% { transform: scale(1.2); } 
            }
        </style>
    </head>
    <body>
        ${gerarNavbar(usuarioLogado)}
        
        <div class="container-gemini">
            <div class="chat-layout">
                <div class="chat-sidebar">
                    <button class="btn-novo-chat" onclick="criarSessao()">➕ Novo Chat</button>
                    <div class="historico-titulo">Recentes</div>
                    <div class="historico-lista" id="listaSessoes"></div>
                </div>
                <div class="chat-main">
                    <div class="chat-header">
                        <div class="header-title"><span>✨</span> Hera - Assistente de IA</div>
                        
                        <div class="typing-indicator-container" id="typingIndicator">
                            <span class="typing-label">Hera está digitando</span>
                            <div class="typing-dots">
                                <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                            </div>
                        </div>

                    </div>
                    <div class="chat-messages" id="chatMessages">
                        <div class="chat-message-wrapper hera" style="animation-delay: 0s;">
                            <div class="avatar hera">✨</div>
                            <div class="chat-message">Olá! Crie um novo chat na barra lateral ou selecione uma conversa anterior para continuarmos.</div>
                        </div>
                    </div>
                    <div class="chat-input-container">
                        <input type="text" id="chatInput" class="chat-input" placeholder="Digite seus comandos para a Hera..." onkeypress="if(event.key === 'Enter') sendMessage()" disabled>
                        <button class="btn-send" onclick="sendMessage()" id="btnSend" disabled>➔</button>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let currentSessionId = null;

            async function carregarSessoes() {
                const res = await fetch('/api/chat/sessions');
                const sessions = await res.json();
                const lista = document.getElementById('listaSessoes');
                lista.innerHTML = '';
                sessions.forEach(s => {
                    const div = document.createElement('div');
                    div.className = 'historico-item' + (s.id === currentSessionId ? ' active' : '');
                    div.innerHTML = \`<span onclick="selecionarSessao('\${s.id}')" title="\${s.title}">\${s.title}</span><button class="btn-delete" onclick="deletarSessao('\${s.id}')" title="Apagar conversa">🗑️</button>\`;
                    lista.appendChild(div);
                });
            }

            async function criarSessao() {
                const res = await fetch('/api/chat/sessions', { method: 'POST' });
                const session = await res.json();
                selecionarSessao(session.id);
                carregarSessoes();
            }

            async function deletarSessao(id) {
                if(!confirm('Tem certeza que deseja apagar esta conversa para sempre?')) return;
                await fetch('/api/chat/sessions/' + id, { method: 'DELETE' });
                if (currentSessionId === id) { 
                    currentSessionId = null; 
                    document.getElementById('chatMessages').innerHTML = \`
                        <div class="chat-message-wrapper hera">
                            <div class="avatar hera">✨</div>
                            <div class="chat-message">Conversa apagada. Crie um novo chat para continuar.</div>
                        </div>\`; 
                    bloquearInput(true); 
                }
                carregarSessoes();
            }

            async function selecionarSessao(id) {
                currentSessionId = id; bloquearInput(false); carregarSessoes();
                const res = await fetch('/api/chat/sessions/' + id + '/messages');
                const msgs = await res.json();
                const chatBox = document.getElementById('chatMessages'); chatBox.innerHTML = '';
                
                if (msgs.length === 0) {
                    chatBox.innerHTML = \`
                        <div class="chat-message-wrapper hera">
                            <div class="avatar hera">✨</div>
                            <div class="chat-message">Sessão iniciada. Todos os comandos que funcionam no WhatsApp também funcionam aqui!</div>
                        </div>\`;
                } else {
                    msgs.forEach(m => addMessage(m.text, m.role));
                }
            }

            function bloquearInput(bloquear) { 
                document.getElementById('chatInput').disabled = bloquear; 
                document.getElementById('btnSend').disabled = bloquear; 
            }

            function formatarTextoWhatsAppParaWeb(texto) {
                if (!texto) return '';
                let formatado = texto.replace(/\\*([^*]+)\\*/g, '<b>$1</b>');
                formatado = formatado.replace(/_([^_]+)_/g, '<i>$1</i>');
                return formatado;
            }

            function addMessage(text, role) {
                const chatBox = document.getElementById('chatMessages');
                
                const wrapper = document.createElement('div');
                wrapper.className = 'chat-message-wrapper ' + role;
                
                const avatar = document.createElement('div');
                avatar.className = 'avatar ' + role;
                avatar.innerHTML = role === 'hera' ? '✨' : '👤';
                
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chat-message';
                msgDiv.innerHTML = formatarTextoWhatsAppParaWeb(text);
                
                wrapper.appendChild(avatar);
                wrapper.appendChild(msgDiv);
                
                chatBox.appendChild(wrapper);
                
                // Suaviza a rolagem para baixo
                chatBox.scrollTo({
                    top: chatBox.scrollHeight,
                    behavior: 'smooth'
                });
            }

            async function sendMessage() {
                const input = document.getElementById('chatInput');
                const text = input.value.trim();
                if (!text || !currentSessionId) return;
                
                addMessage(text, 'user'); 
                input.value = ''; 
                document.getElementById('typingIndicator').style.display = 'flex'; 
                bloquearInput(true);

                try {
                    const res = await fetch('/api/chat/send', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ mensagem: text, sessionId: currentSessionId }) 
                    });
                    const data = await res.json();
                    
                    document.getElementById('typingIndicator').style.display = 'none';
                    addMessage(data.resposta || 'Erro interno.', 'hera');
                    carregarSessoes();
                } catch (e) {
                    document.getElementById('typingIndicator').style.display = 'none'; 
                    addMessage('❌ Erro de conexão.', 'hera');
                } finally { 
                    bloquearInput(false); 
                    input.focus(); 
                }
            }

            carregarSessoes();
        </script>
    </body>
    </html>
    `;
}

module.exports = { renderChat };
const { exec } = require('child_process');
const os = require('os');

const DATA_INICIO_PROCESSO = new Date();
const INSTANCE_ID = `hera-${process.pid}-${Date.now()}`;

function executarComando(comando) {
    return new Promise(resolve => {
        exec(comando, { windowsHide: true }, (erro, stdout, stderr) => {
            resolve({
                erro,
                stdout: String(stdout || ''),
                stderr: String(stderr || '')
            });
        });
    });
}

function formatarTempoAtivo(segundos) {
    const total = Math.max(0, Math.floor(segundos));
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    return `${horas}h ${minutos}m ${secs}s`;
}

function obterInstanciaAtual() {
    return {
        instanceId: INSTANCE_ID,
        pid: process.pid,
        plataforma: process.platform,
        node: process.version,
        diretorio: process.cwd(),
        iniciadoEm: DATA_INICIO_PROCESSO.toISOString(),
        uptimeSegundos: Math.floor(process.uptime()),
        uptimeFormatado: formatarTempoAtivo(process.uptime()),
        hostname: os.hostname(),
        memoriaRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
    };
}

async function listarProcessosWindows() {
    const resultado = await executarComando('tasklist /FO CSV /NH');
    const linhas = resultado.stdout
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    const processos = [];

    for (const linha of linhas) {
        const match = linha.match(/^"([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"$/);
        if (!match) {
            continue;
        }

        const [, nomeImagem, pid, nomeSessao, numeroSessao, memoria] = match;

        processos.push({
            nomeImagem,
            pid: Number(pid),
            nomeSessao,
            numeroSessao,
            memoria
        });
    }

    return processos;
}

async function listarProcessosSuspeitos() {
    const todos = await listarProcessosWindows();
    const nomesAlvo = new Set(['node.exe', 'msedge.exe', 'chrome.exe']);

    return todos
        .filter(p => nomesAlvo.has(String(p.nomeImagem || '').toLowerCase()))
        .map(p => ({
            ...p,
            ehAtual: p.pid === process.pid
        }))
        .sort((a, b) => {
            if (a.ehAtual && !b.ehAtual) return -1;
            if (!a.ehAtual && b.ehAtual) return 1;
            return a.pid - b.pid;
        });
}

async function matarPid(pid) {
    const pidNumero = Number(pid);

    if (!Number.isFinite(pidNumero) || pidNumero <= 0) {
        return { sucesso: false, mensagem: 'PID inválido.' };
    }

    if (pidNumero === process.pid) {
        return { sucesso: false, mensagem: 'Não é permitido encerrar a instância atual da Hera.' };
    }

    const resultado = await executarComando(`taskkill /PID ${pidNumero} /F`);
    const texto = `${resultado.stdout}\n${resultado.stderr}`.trim();

    if (/SUCCESS|ÊXITO|sucesso/i.test(texto) || !resultado.erro) {
        return { sucesso: true, mensagem: `Processo ${pidNumero} encerrado com sucesso.` };
    }

    return { sucesso: false, mensagem: texto || `Falha ao encerrar PID ${pidNumero}.` };
}

async function matarProcessosAntigosDaHera() {
    const processos = await listarProcessosSuspeitos();
    const candidatos = processos.filter(p => p.nomeImagem.toLowerCase() === 'node.exe' && p.pid !== process.pid);

    if (!candidatos.length) {
        return {
            sucesso: true,
            mensagem: 'Nenhuma outra instância node.exe foi detectada além da atual.',
            encerrados: []
        };
    }

    const encerrados = [];

    for (const processo of candidatos) {
        const resultado = await matarPid(processo.pid);
        encerrados.push({
            pid: processo.pid,
            nomeImagem: processo.nomeImagem,
            ...resultado
        });
    }

    return {
        sucesso: encerrados.some(item => item.sucesso),
        mensagem: 'Tentativa de encerramento das instâncias antigas concluída.',
        encerrados
    };
}

async function matarNavegadoresSuspeitos() {
    const processos = await listarProcessosSuspeitos();
    const candidatos = processos.filter(p => {
        const nome = p.nomeImagem.toLowerCase();
        return nome === 'msedge.exe' || nome === 'chrome.exe';
    });

    if (!candidatos.length) {
        return {
            sucesso: true,
            mensagem: 'Nenhum navegador suspeito foi detectado.',
            encerrados: []
        };
    }

    const encerrados = [];

    for (const processo of candidatos) {
        const resultado = await matarPid(processo.pid);
        encerrados.push({
            pid: processo.pid,
            nomeImagem: processo.nomeImagem,
            ...resultado
        });
    }

    return {
        sucesso: encerrados.some(item => item.sucesso),
        mensagem: 'Tentativa de encerramento dos navegadores suspeitos concluída.',
        encerrados
    };
}

module.exports = {
    obterInstanciaAtual,
    listarProcessosSuspeitos,
    matarPid,
    matarProcessosAntigosDaHera,
    matarNavegadoresSuspeitos
};
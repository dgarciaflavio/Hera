// src/services/projecao.js

function calcularMQO(historico) {
    const n = historico.length;
    
    if (n === 0) return null;
    if (n === 1) {
        return {
            a: historico[0].valor,
            b: 0,
            reta: [historico[0].valor],
            projetar: (passos) => Array(passos).fill(historico[0].valor)
        };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
        const x = i + 1;
        const y = Number(historico[i].valor) || 0;
        
        sumX += x;
        sumY += y;
        sumXY += (x * y);
        sumX2 += (x * x);
    }

    const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const a = (sumY - b * sumX) / n;

    const reta = [];
    for (let i = 0; i < n; i++) {
        const x = i + 1;
        let yEstimado = a + (b * x);
        reta.push(Math.max(0, yEstimado)); 
    }

    return {
        a,
        b,
        reta,
        projetar: (passosFuturos) => {
            const projecoes = [];
            for (let p = 1; p <= passosFuturos; p++) {
                const xFuturo = n + p;
                let yFuturo = a + (b * xFuturo);
                projecoes.push(Math.max(0, yFuturo));
            }
            return projecoes;
        }
    };
}

function analisarTendenciaEProjetar(dados, periodosFuturos = 3) {
    if (!dados || dados.length === 0) {
        return { erro: 'Sem dados suficientes para calcular a tendência.' };
    }

    const modelo = calcularMQO(dados);
    if (!modelo) return { erro: 'Erro no cálculo do algoritmo MQO.' };

    const projecao = modelo.projetar(periodosFuturos);

    return {
        coeficienteLinear_a: modelo.a,
        coeficienteAngular_b: modelo.b,
        tendencia: modelo.b > 0 ? 'Alta' : (modelo.b < 0 ? 'Baixa' : 'Estável'),
        historicoAjustado: modelo.reta,
        projecaoFutura: projecao
    };
}

/**
 * Calcula a projeção com injeção de recebimentos, acionamento de atas e processos futuros.
 */
function projetarComIntervencoes(saldoAtual, consumoMensal, logistica, mesesProjecao = 10) {
    const projecao = [];
    let saldoSimulado = saldoAtual;
    
    let qtde_a_receber = Number(logistica.qtde_a_receber) || 0;
    let saldo_da_ata = Number(logistica.saldo_da_ata) || 0;
    let qtde_processo2 = Number(logistica.qtde) || 0; 
    let venc_ata = logistica.venc_ata || null;

    const dataHoje = new Date();
    let dataVencAta = null;
    if (venc_ata) {
        if (String(venc_ata).includes('/')) {
            const partes = String(venc_ata).split('/');
            dataVencAta = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T12:00:00`);
        } else {
            dataVencAta = new Date(venc_ata);
        }
    }

    for (let i = 1; i <= mesesProjecao; i++) {
        // 1. Consumo projetado
        saldoSimulado -= consumoMensal;

        // 2. Injeção de Empenhos a Receber (Curto prazo - Mês 1)
        if (i === 1 && qtde_a_receber > 0) {
            saldoSimulado += qtde_a_receber;
        }

        // 3. Acionamento da Ata (quando estoque zera)
        if (saldoSimulado <= 0 && saldo_da_ata > 0) {
            const dataProjetada = new Date(dataHoje.getFullYear(), dataHoje.getMonth() + i, 1);
            if (!dataVencAta || dataProjetada <= dataVencAta) {
                saldoSimulado += saldo_da_ata;
                saldo_da_ata = 0; 
            }
        }

        // 4. Injeção do Processo 2 (Longo Prazo - média de 8 meses conforme fechamento estimado entre 7 e 10)
        if (i === 8 && qtde_processo2 > 0) {
            saldoSimulado += qtde_processo2;
            qtde_processo2 = 0;
        }

        projecao.push(Math.max(0, Math.round(saldoSimulado)));
    }

    return projecao;
}

module.exports = {
    calcularMQO,
    analisarTendenciaEProjetar,
    projetarComIntervencoes
};
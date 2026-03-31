const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function callDeepSeek(prompt) {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6,
            max_tokens: 8000
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

app.post('/api/gerar-licao-completa', async (req, res) => {
    try {
        const { titulo, textoOriginal, publico } = req.body;
        console.log('Requisição recebida, público:', publico, 'tamanho:', textoOriginal?.length);

        const tituloFinal = titulo || textoOriginal.match(/^(LIÇÃO\s+\d+[:\s]+.*)$/im)?.[1] || 'Lição';

        let prompt;

        // ====================
        // LIÇÃO PARA JOVENS
        // ====================
        if (publico === 'jovens') {
            prompt = `Preciso que você elabore uma lição bíblica completa seguindo rigorosamente o formato abaixo. Utilize o conteúdo da revista que enviarei e siga estas orientações:
Mantenha TODO o conteúdo original da revista na íntegra, sem cortes ou alterações.
Estrutura do documento:
Cabeçalho com o número da lição e o Título da lição
VERSÍCULO DO DIA (com versículo)
VERDADE APLICADA
TEXTOS DE REFERÊNCIA (com os versículos)

ABERTURA OBRIGATÓRIA — ANÁLISE GERAL
Antes de iniciar a lição, escreva uma ANÁLISE GERAL do que será estudado.
Essa análise deve:
Explicar com clareza o tema central da lição;
Mostrar o fio condutor do estudo;
Destacar as principais verdades bíblicas abordadas;
Antecipar os impactos práticos na vida do jovem;
Ser bem desenvolvida — nunca superficial.
Evite comentários genéricos.

INTRODUÇÃO (conteúdo da revista)
APOIO PEDAGÓGICO (conteúdo complementar que você irá elaborar, com reflexões, contexto histórico, citações de autores, etc.)
APLICAÇÃO PRÁTICA (uma reflexão ou sugestão concreta de como aplicar o ensino no dia a dia)
Repetir o padrão para cada tópico e subtópico: conteúdo original da revista, depois APOIO PEDAGÓGICO, depois APLICAÇÃO PRÁTICA
CONCLUSÃO (conteúdo original da revista, seguido de APOIO PEDAGÓGICO e APLICAÇÃO PRÁTICA)
O conteúdo original da revista deve vir em negrito para facilitar a identificação.
O APOIO PEDAGÓGICO deve ser um texto mais profundo, explicativo, com reflexões teológicas, contexto histórico, citações de autores e referências bíblicas.
A APLICAÇÃO PRÁTICA deve ser curta, objetiva e trazer uma sugestão concreta de como viver o ensino na prática durante a semana.

Aqui está o conteúdo da revista:
"""
${textoOriginal}
"""

Agora, elabore a lição completa seguindo rigorosamente este formato. Siga o estilo do exemplo que lhe foi fornecido: use negrito no conteúdo original da revista, e os elementos que você criar (ANÁLISE GERAL, APOIO PEDAGÓGICO, APLICAÇÃO PRÁTICA) devem estar em negrito também. A linguagem deve ser adequada para jovens, conectando-se com suas realidades cotidianas.`;
        } 
        // ====================
        // LIÇÃO PARA ADULTOS (formato original)
        // ====================
        else {
            prompt = `Preciso que você elabore uma lição bíblica completa seguindo rigorosamente o formato abaixo. Utilize o conteúdo da revista que enviarei e siga estas orientações:

**INSTRUÇÕES DE FORMATAÇÃO IMPORTANTES:**
- Use APENAS tags HTML para formatação de negrito: <strong>texto</strong>.
- O conteúdo original da revista (tudo que vem do texto colado) deve permanecer em texto NORMAL, sem negrito.
- Apenas os elementos que VOCÊ (IA) cria devem estar em negrito: <strong>ANÁLISE GERAL</strong>, <strong>APOIO PEDAGÓGICO</strong>, <strong>APLICAÇÃO PRÁTICA</strong>, <strong>EU ENSINEI QUE:</strong> e os textos que você escrever dentro dessas seções devem estar em negrito.
- Os cabeçalhos do formato (TEXTO ÁUREO, VERDADE APLICADA, TEXTOS DE REFERÊNCIA, INTRODUÇÃO, 1-, 1.1., etc.) devem estar em texto NORMAL.
- Mantenha a numeração dos tópicos exatamente como 1-, 1.1., 1.2., etc., e subtópicos.

**Estrutura exata a seguir:**

${tituloFinal}

TEXTO ÁUREO
[versículo]

VERDADE APLICADA
[texto]

TEXTOS DE REFERÊNCIA
[versículos]

INTRODUÇÃO
[conteúdo original da revista]

<strong>ANÁLISE GERAL</strong>
[seu texto em negrito]

<strong>APOIO PEDAGÓGICO</strong>
[seu texto em negrito]

<strong>APLICAÇÃO PRÁTICA</strong>
[seu texto em negrito]

1- [Título do primeiro tópico]
[conteúdo original em texto normal]

1.1. [Subtítulo]
[conteúdo original em texto normal]

<strong>APOIO PEDAGÓGICO</strong>
[seu texto em negrito]

<strong>APLICAÇÃO PRÁTICA</strong>
[seu texto em negrito]

... (repetir o padrão para todos os subtópicos)

<strong>EU ENSINEI QUE:</strong>
[frase em negrito]

... (repetir para os tópicos seguintes)

CONCLUSÃO
[conteúdo original em texto normal]

<strong>APOIO PEDAGÓGICO</strong>
[seu texto em negrito]

<strong>APLICAÇÃO PRÁTICA</strong>
[seu texto em negrito]

Aqui está o conteúdo da revista:
"""
${textoOriginal}
"""

Agora, elabore a lição completa seguindo rigorosamente este formato.`;
        }

        const resultado = await callDeepSeek(prompt);
        console.log('Lição gerada, tamanho:', resultado.length);

        res.json({ licaoCompleta: resultado });

    } catch (error) {
        console.error('Erro no endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', deepseek_configured: !!DEEPSEEK_API_KEY });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`DeepSeek: ${DEEPSEEK_API_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
});

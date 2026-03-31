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
        console.log('Requisição recebida, tamanho:', textoOriginal?.length);

        const tituloFinal = titulo || textoOriginal.match(/^(LIÇÃO\s+\d+[:\s]+.*)$/im)?.[1] || 'Lição';

        const prompt = `Você é um professor de EBD. Elabore uma lição bíblica completa no formato abaixo.

**INSTRUÇÕES DE FORMATAÇÃO IMPORTANTES:**
- Use <strong>texto</strong> APENAS para os elementos que VOCÊ criar: ANÁLISE GERAL, APOIO PEDAGÓGICO, APLICAÇÃO PRÁTICA, EU ENSINEI QUE.
- Todo o conteúdo original da revista (que vem do texto colado) deve permanecer em texto NORMAL, sem <strong>.
- Não use asteriscos ** ou Markdown.

**FORMATO EXATO:**

${tituloFinal}

TEXTO ÁUREO
[versículo original]

VERDADE APLICADA
[texto original]

TEXTOS DE REFERÊNCIA
[versículos originais]

INTRODUÇÃO
[conteúdo original da revista]

<strong>ANÁLISE GERAL</strong>
[seu texto em negrito]

<strong>APOIO PEDAGÓGICO</strong>
[seu texto em negrito]

<strong>APLICAÇÃO PRÁTICA</strong>
[seu texto em negrito]

1- [Título do primeiro tópico original]
[conteúdo original]

1.1. [Subtítulo original]
[conteúdo original]

<strong>APOIO PEDAGÓGICO</strong>
[seu texto em negrito]

<strong>APLICAÇÃO PRÁTICA</strong>
[seu texto em negrito]

1.2. [Subtítulo original]
[conteúdo original]

... (repetir o padrão para todos os subtópicos)

<strong>EU ENSINEI QUE:</strong>
[frase em negrito]

... (repetir para os tópicos seguintes)

CONCLUSÃO
[conteúdo original]

<strong>APOIO PEDAGÓGICO</strong>
[seu texto em negrito]

<strong>APLICAÇÃO PRÁTICA</strong>
[seu texto em negrito]

Aqui está o conteúdo da revista:
"""
${textoOriginal}
"""

Agora, elabore a lição completa seguindo rigorosamente este formato.`;

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

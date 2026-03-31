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
        console.log('Requisição recebida, tamanho do texto original:', textoOriginal?.length);

        const prompt = `Preciso que você elabore uma lição bíblica completa seguindo rigorosamente o formato abaixo. Utilize o conteúdo da revista que enviarei e siga estas orientações:

**INSTRUÇÕES DE FORMATAÇÃO IMPORTANTES:**
- NÃO use Markdown (não use #, ##, ###, etc.)
- Use apenas texto puro
- Os títulos das seções devem estar em negrito com **, exemplo: **INTRODUÇÃO**
- Todo o conteúdo original da revista deve vir em negrito com **
- Mantenha a estrutura exatamente como descrita abaixo

**Estrutura do documento:**

**Lição [número]**

**Título da Lição:** [título]

**TEXTO ÁUREO**
[versículo]

**VERDADE APLICADA**
[texto]

**TEXTOS DE REFERÊNCIA**
[versículos]

**ABERTURA OBRIGATÓRIA — ANÁLISE GERAL**
[texto da análise]

**INTRODUÇÃO**
[conteúdo original da revista em negrito]

**APOIO PEDAGÓGICO**
[seu texto complementar]

**APLICAÇÃO PRÁTICA**
[seu texto curto e objetivo]

**1- [Título do primeiro tópico]**
[conteúdo original da revista em negrito]

**1.1. [Subtítulo]**
[conteúdo original em negrito]

**APOIO PEDAGÓGICO**
[seu texto]

**APLICAÇÃO PRÁTICA**
[seu texto]

[Repetir o padrão para 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, etc.]

**EU ENSINEI QUE:**
[frase em negrito]

**2- [Título do segundo tópico]**
[conteúdo original em negrito]

... (continua o padrão)

**3- [Título do terceiro tópico]**
[conteúdo original em negrito]

... (continua o padrão)

**CONCLUSÃO**
[conteúdo original da revista em negrito]

**APOIO PEDAGÓGICO**
[seu texto]

**APLICAÇÃO PRÁTICA**
[seu texto]

**Observações importantes:**
- Todo o conteúdo original da revista deve vir em **negrito**.
- O APOIO PEDAGÓGICO deve ser um texto mais profundo, com reflexões teológicas, contexto histórico, citações de autores e referências bíblicas.
- A APLICAÇÃO PRÁTICA deve ser curta, objetiva e trazer uma sugestão concreta de como viver o ensino na prática durante a semana.
- Mantenha a numeração dos tópicos exatamente como 1-, 1.1., 1.2., etc.
- Inclua os "EU ENSINEI QUE:" nos momentos apropriados (como no exemplo).

Aqui está o conteúdo da revista:
"""
${textoOriginal}
"""

Agora, elabore a lição completa seguindo rigorosamente este formato, usando apenas texto puro, sem Markdown.`;

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

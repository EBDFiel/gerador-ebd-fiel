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

        const prompt = `Preciso que você elabore uma lição bíblica completa seguindo rigorosamente o formato abaixo. Utilize o conteúdo da revista que enviarei e siga estas orientações:

**INSTRUÇÕES DE FORMATAÇÃO IMPORTANTES:**
- Use APENAS tags HTML para formatação de negrito: <strong>texto</strong>.
- NÃO use asteriscos ** ou Markdown.
- Use apenas texto puro + tags <strong>.
- Os títulos das seções devem estar em negrito com <strong>, exemplo: <strong>Lição 01: O chamado que transforma a dor em propósito.</strong>, <strong>TEXTO ÁUREO</strong>, etc.
- Todo o conteúdo original da revista deve vir em negrito com <strong>.
- Mantenha a numeração dos tópicos exatamente como 1-, 1.1., 1.2., etc., e subtópicos.
- Inclua os "EU ENSINEI QUE:" nos momentos apropriados (em negrito).
- **IMPORTANTE:** O título da lição deve vir exatamente como: <strong>${tituloFinal}</strong>.

**Estrutura exata a seguir:**

<strong>${tituloFinal}</strong>

<strong>TEXTO ÁUREO</strong>
[versículo]

<strong>VERDADE APLICADA</strong>
[texto]

<strong>TEXTOS DE REFERÊNCIA</strong>
[versículos]

<strong>INTRODUÇÃO</strong>
[conteúdo original da revista em negrito com <strong>]

<strong>APOIO PEDAGÓGICO</strong>
[seu texto]

<strong>APLICAÇÃO PRÁTICA</strong>
[seu texto]

... (seguir o padrão para todos os tópicos, subtópicos, EU ENSINEI QUE, conclusão)

Aqui está o conteúdo da revista:
"""
${textoOriginal}
"""

Agora, elabore a lição completa seguindo rigorosamente este formato, usando apenas tags <strong> para negrito, sem asteriscos. Não use Markdown.`;

        const resultado = await callDeepSeek(prompt);

        // Retorna o resultado como HTML para que o navegaco interprete as tags
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

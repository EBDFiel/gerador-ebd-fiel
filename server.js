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
            max_tokens: 5000
        })
    });
    if (!response.ok) throw new Error(`DeepSeek error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
}

app.post('/api/gerar-licao-completa', async (req, res) => {
    try {
        const { titulo, textoOriginal, publico } = req.body;
        console.log('Requisição recebida:', { titulo, tamanho: textoOriginal?.length });

        // Preservar o texto original
        let finalLesson = textoOriginal;

        // Extrair os títulos dos tópicos principais (1-, 2-, 3-) para o prompt
        const topicTitles = [];
        const lines = textoOriginal.split('\n');
        for (const line of lines) {
            if (line.match(/^\d+[-]\s+[A-Za-zÀ-ú]/)) {
                topicTitles.push(line.trim());
            }
        }

        // Gerar os itens que faltam
        let generated = '';
        try {
            const prompt = `Você é um professor de EBD. Com base no texto da lição abaixo, gere APENAS os seguintes elementos:

1. UMA ANÁLISE GERAL (3-4 parágrafos)
2. PARA CADA UM DOS ${topicTitles.length} TÓPICOS PRINCIPAIS (${topicTitles.join(', ')}), gere:
   - APOIO PEDAGÓGICO (sugestões para o professor ensinar aquele tópico)
   - APLICAÇÃO PRÁTICA (como os alunos podem aplicar)
3. APOIO PEDAGÓGICO FINAL (orientações para encerrar a aula)
4. APLICAÇÃO PRÁTICA FINAL (desafios para a semana)

Use o seguinte formato:

🔍 ANÁLISE GERAL
[texto]

${topicTitles.map(t => `📚 APOIO PEDAGÓGICO (${t})
[texto]
⚡ APLICAÇÃO PRÁTICA (${t})
[texto]`).join('\n\n')}

📚 APOIO PEDAGÓGICO FINAL
[texto]
⚡ APLICAÇÃO PRÁTICA FINAL
[texto]

Aqui está o texto da lição (use apenas como referência):
${textoOriginal.substring(0, 5000)}`;
            generated = await callDeepSeek(prompt);
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        // Adicionar os itens gerados ao final do texto original
        if (generated) {
            finalLesson += '\n\n' + generated;
        }

        res.json({ licaoCompleta: finalLesson });

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

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

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Extrai títulos dos tópicos principais (linhas que começam com 1-, 2-, 3-)
function extractTopicTitles(text) {
    const titles = [];
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.match(/^\d+[-]\s+[A-Za-zÀ-ú]/)) {
            titles.push(line.trim());
        }
    }
    return titles;
}

app.post('/api/gerar-licao-completa', async (req, res) => {
    try {
        const { titulo, textoOriginal, publico } = req.body;
        console.log('Requisição recebida:', { titulo, tamanho: textoOriginal?.length });

        // Preserva o texto original
        let finalLesson = textoOriginal;

        // Extrai títulos dos tópicos principais
        const topicTitles = extractTopicTitles(textoOriginal);
        console.log('Tópicos principais:', topicTitles);

        // Gera os blocos com a IA
        const prompt = `Você é um professor de EBD. Com base no texto da lição abaixo, gere APENAS os seguintes elementos:

1. UMA ANÁLISE GERAL (3-4 parágrafos)
2. PARA CADA UM DOS ${topicTitles.length} TÓPICOS PRINCIPAIS listados, gere:
   - APOIO PEDAGÓGICO (sugestões para o professor ensinar aquele tópico)
   - APLICAÇÃO PRÁTICA (como os alunos podem aplicar)
3. APOIO PEDAGÓGICO FINAL (orientações para encerrar a aula)
4. APLICAÇÃO PRÁTICA FINAL (desafios para a semana)

Use o seguinte formato exato:

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
${textoOriginal.substring(0, 5000)}

IMPORTANTE: Gere APENAS os itens solicitados, sem incluir título, texto áureo, etc. Use exatamente os títulos dos tópicos como estão listados.`;

        let generated = '';
        try {
            generated = await callDeepSeek(prompt);
            console.log('Conteúdo gerado pela IA (primeiros 500 chars):', generated.substring(0, 500));
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        // Extrair os blocos gerados
        let analysis = '';
        const topicSupports = [];
        let finalSupport = '';
        let finalApplication = '';

        // Análise geral
        const analysisMatch = generated.match(/🔍 ANÁLISE GERAL\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/);
        if (analysisMatch) analysis = analysisMatch[1].trim();

        // Blocos de apoio/aplicação para cada tópico
        for (let i = 0; i < topicTitles.length; i++) {
            const title = topicTitles[i];
            const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`📚 APOIO PEDAGÓGICO \\(${escapedTitle}\\)\\n([\\s\\S]*?)⚡ APLICAÇÃO PRÁTICA \\(${escapedTitle}\\)\\n([\\s\\S]*?)(?=📚 APOIO PEDAGÓGICO \\(|$)`);
            const match = generated.match(regex);
            if (match && match[1] && match[2]) {
                topicSupports.push({
                    title,
                    apoio: match[1].trim(),
                    aplicacao: match[2].trim()
                });
            }
        }

        // Apoios finais
        const finalMatch = generated.match(/📚 APOIO PEDAGÓGICO FINAL\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA FINAL\n([\s\S]*?)$/);
        if (finalMatch) {
            finalSupport = finalMatch[1].trim();
            finalApplication = finalMatch[2].trim();
        }

        // 1. Inserir análise geral antes da introdução
        if (analysis) {
            const introIndex = finalLesson.search(/\nINTRODUÇÃO/i);
            if (introIndex !== -1) {
                finalLesson = finalLesson.slice(0, introIndex) + '\n\n' + analysis + '\n\n' + finalLesson.slice(introIndex);
            }
        }

        // 2. Inserir apoios e aplicações após cada tópico principal
        if (topicSupports.length > 0) {
            for (let i = 0; i < topicSupports.length; i++) {
                const support = topicSupports[i];
                // Encontra a posição do título do tópico no texto
                const titleRegex = new RegExp(`^${support.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm');
                let lastIndex = -1;
                let match;
                while ((match = titleRegex.exec(finalLesson)) !== null) {
                    lastIndex = match.index + match[0].length;
                }
                if (lastIndex !== -1) {
                    // Encontra o fim do tópico (próximo título principal ou "CONCLUSÃO")
                    const nextTopicIndex = finalLesson.search(new RegExp(`\n${topicTitles[i+1]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || 'CONCLUSÃO'}`, 'i'));
                    let endIndex = finalLesson.length;
                    if (nextTopicIndex !== -1) {
                        endIndex = nextTopicIndex;
                    }
                    const insert = `\n\n📚 APOIO PEDAGÓGICO\n${support.apoio}\n\n⚡ APLICAÇÃO PRÁTICA\n${support.aplicacao}`;
                    finalLesson = finalLesson.slice(0, endIndex) + insert + finalLesson.slice(endIndex);
                }
            }
        }

        // 3. Inserir apoios finais antes da conclusão
        if (finalSupport || finalApplication) {
            const conclusionIndex = finalLesson.search(/\nCONCLUSÃO/i);
            if (conclusionIndex !== -1) {
                let insert = '';
                if (finalSupport) insert += `\n\n📚 APOIO PEDAGÓGICO FINAL\n${finalSupport}`;
                if (finalApplication) insert += `\n\n⚡ APLICAÇÃO PRÁTICA FINAL\n${finalApplication}`;
                finalLesson = finalLesson.slice(0, conclusionIndex) + insert + finalLesson.slice(conclusionIndex);
            } else {
                if (finalSupport) finalLesson += `\n\n📚 APOIO PEDAGÓGICO FINAL\n${finalSupport}`;
                if (finalApplication) finalLesson += `\n\n⚡ APLICAÇÃO PRÁTICA FINAL\n${finalApplication}`;
            }
        }

        res.json({ licaoCompleta: finalLesson });

    } catch (error) {
        console.error("Erro no endpoint:", error);
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

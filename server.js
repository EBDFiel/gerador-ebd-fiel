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

// Função para extrair blocos de forma simples
function extractSections(text) {
    const sections = {
        title: '',
        keyVerse: '',
        appliedTruth: '',
        referenceTexts: '',
        introduction: '',
        topics: '',
        conclusion: ''
    };

    // Título (primeira linha que começa com LIÇÃO ou Lição)
    const titleMatch = text.match(/^(LIÇÃO\s+\d+[:\s]+.*)$/im);
    if (titleMatch) sections.title = titleMatch[1].trim();

    // Texto Áureo: até encontrar "VERDADE APLICADA"
    const keyVerseMatch = text.match(/TEXTO\s*ÁUREO\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*VERDADE\s*APLICADA)/i);
    if (keyVerseMatch) sections.keyVerse = keyVerseMatch[1].trim();

    // Verdade Aplicada: até "TEXTOS DE REFERÊNCIA"
    const appliedMatch = text.match(/VERDADE\s*APLICADA\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*TEXTOS\s*DE\s*REFERÊNCIA)/i);
    if (appliedMatch) sections.appliedTruth = appliedMatch[1].trim();

    // Textos de Referência: da seção até antes da próxima seção (Introdução, Análise Geral, etc.)
    const refMatch = text.match(/TEXTOS\s*DE\s*REFERÊNCIA\s*\n([\s\S]*?)(?=\n\s*(INTRODUÇÃO|ANÁLISE\s*GERAL|🔍|✍️|$))/i);
    if (refMatch) sections.referenceTexts = refMatch[1].trim();

    // Introdução: até o primeiro tópico numerado (1., 2., etc.)
    const introMatch = text.match(/INTRODUÇÃO\s*\n([\s\S]*?)(?=\n\s*\d+\.\s+)/i);
    if (introMatch) sections.introduction = introMatch[1].trim();

    // Tópicos: do primeiro tópico até "CONCLUSÃO"
    const topicsMatch = text.match(/(\d+\.\s+[^\n]+[\s\S]*?)(?=\n\s*CONCLUSÃO)/i);
    if (topicsMatch) sections.topics = topicsMatch[1].trim();

    // Conclusão: após "CONCLUSÃO" até o fim
    const conclusionMatch = text.match(/CONCLUSÃO\s*\n([\s\S]*?)$/i);
    if (conclusionMatch) sections.conclusion = conclusionMatch[1].trim();

    return sections;
}

// Extrai títulos dos tópicos principais (1., 2., 3.)
function extractTopicTitles(topicsText) {
    const titles = [];
    const lines = topicsText.split('\n');
    for (const line of lines) {
        if (line.match(/^\d+\.\s+[A-Za-zÀ-ú]/) && !line.includes('.')) {
            titles.push(line.trim());
        }
    }
    return titles;
}

// Rota da API
app.post('/api/gerar-licao-completa', async (req, res) => {
    try {
        const { titulo, textoOriginal, publico } = req.body;
        console.log('Requisição recebida:', { titulo, tamanho: textoOriginal?.length });

        // Extrair as seções
        const sections = extractSections(textoOriginal);
        const finalTitle = titulo || sections.title;
        const topicTitles = extractTopicTitles(sections.topics);

        // Construir prompt para a IA gerar apenas o que falta
        const prompt = `Você é um professor de EBD. Com base no conteúdo da lição abaixo, gere APENAS os seguintes elementos:

1. ANÁLISE GERAL (3-4 parágrafos)
2. Para cada tópico principal (${topicTitles.join(', ') || 'os tópicos listados'}), gere:
   - APOIO PEDAGÓGICO (sugestões práticas para o professor)
   - APLICAÇÃO PRÁTICA (como os alunos podem aplicar)
3. APOIO PEDAGÓGICO FINAL (orientações para encerrar a aula)
4. APLICAÇÃO PRÁTICA FINAL (desafios para a semana)

Use o formato exato abaixo, substituindo [texto] pelo conteúdo real:

🔍 ANÁLISE GERAL
[texto]

${topicTitles.map(title => `📚 APOIO PEDAGÓGICO (${title})
[texto]
⚡ APLICAÇÃO PRÁTICA (${title})
[texto]`).join('\n\n')}

📚 APOIO PEDAGÓGICO FINAL
[texto]
⚡ APLICAÇÃO PRÁTICA FINAL
[texto]

Aqui está o conteúdo da lição (use apenas para gerar os itens acima, não inclua no resultado):
Título: ${finalTitle}
Texto Áureo: ${sections.keyVerse}
Verdade Aplicada: ${sections.appliedTruth}
Textos de Referência: ${sections.referenceTexts?.substring(0, 1000)}
Introdução: ${sections.introduction?.substring(0, 1000)}
Tópicos: ${sections.topics?.substring(0, 2000)}
Conclusão: ${sections.conclusion?.substring(0, 1000)}

IMPORTANTE: Gere APENAS os itens solicitados, sem incluir título, texto áureo, etc. Use exatamente os títulos dos tópicos como estão acima.`;

        // Gerar os complementos
        let generated = '';
        try {
            generated = await callDeepSeek(prompt);
            console.log('Conteúdo gerado pela IA (primeiros 500 chars):', generated.substring(0, 500));
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        // Montar a lição final preservando o original
        let finalLesson = `${finalTitle}\n\n`;
        finalLesson += `📖 TEXTO ÁUREO\n${sections.keyVerse}\n\n`;
        finalLesson += `🎯 VERDADE APLICADA\n${sections.appliedTruth}\n\n`;
        finalLesson += `📚 TEXTOS DE REFERÊNCIA\n${sections.referenceTexts}\n\n`;

        // Inserir análise geral (gerada)
        if (generated) {
            const analysisMatch = generated.match(/🔍 ANÁLISE GERAL\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/);
            if (analysisMatch && analysisMatch[1].trim()) {
                finalLesson += `🔍 ANÁLISE GERAL\n${analysisMatch[1].trim()}\n\n`;
            }
        }

        // Introdução original
        finalLesson += `✍️ INTRODUÇÃO\n${sections.introduction}\n\n`;

        // Tópicos originais (preservados integralmente)
        finalLesson += `${sections.topics}\n\n`;

        // Inserir APOIO PEDAGÓGICO e APLICAÇÃO PRÁTICA para cada tópico principal
        if (generated && topicTitles.length > 0) {
            for (let i = 0; i < topicTitles.length; i++) {
                const title = topicTitles[i];
                const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`📚 APOIO PEDAGÓGICO \\(${escaped}\\)\\n([\\s\\S]*?)⚡ APLICAÇÃO PRÁTICA \\(${escaped}\\)\\n([\\s\\S]*?)(?=📚 APOIO PEDAGÓGICO \\(|$)`);
                const match = generated.match(regex);
                if (match && match[1] && match[2]) {
                    finalLesson += `📚 APOIO PEDAGÓGICO\n${match[1].trim()}\n\n`;
                    finalLesson += `⚡ APLICAÇÃO PRÁTICA\n${match[2].trim()}\n\n`;
                } else {
                    // Fallback: tenta pegar na ordem sequencial (caso a IA não use os títulos)
                    const fallbackMatches = generated.match(/📚 APOIO PEDAGÓGICO\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/g);
                    if (fallbackMatches && fallbackMatches[i]) {
                        const parts = fallbackMatches[i].match(/📚 APOIO PEDAGÓGICO\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA\n([\s\S]*?)$/);
                        if (parts && parts[1] && parts[2]) {
                            finalLesson += `📚 APOIO PEDAGÓGICO\n${parts[1].trim()}\n\n`;
                            finalLesson += `⚡ APLICAÇÃO PRÁTICA\n${parts[2].trim()}\n\n`;
                        }
                    }
                }
            }
        }

        // Conclusão original
        finalLesson += `🏁 CONCLUSÃO\n${sections.conclusion}\n\n`;

        // Apoio Pedagógico Final e Aplicação Prática Final
        if (generated) {
            const finalMatch = generated.match(/📚 APOIO PEDAGÓGICO FINAL\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA FINAL\n([\s\S]*?)$/);
            if (finalMatch && finalMatch[1] && finalMatch[2]) {
                finalLesson += `📚 APOIO PEDAGÓGICO FINAL\n${finalMatch[1].trim()}\n\n`;
                finalLesson += `⚡ APLICAÇÃO PRÁTICA FINAL\n${finalMatch[2].trim()}`;
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

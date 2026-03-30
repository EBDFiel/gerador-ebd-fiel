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

// Extrai as partes essenciais do texto original
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

    // Título
    const titleMatch = text.match(/^(LIÇÃO\s+\d+[:\s]+.*)$/im);
    if (titleMatch) sections.title = titleMatch[1].trim();

    // Texto Áureo
    const keyVerseMatch = text.match(/TEXTO\s*ÁUREO\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*VERDADE\s*APLICADA)/i);
    if (keyVerseMatch) sections.keyVerse = keyVerseMatch[1].trim();

    // Verdade Aplicada
    const appliedMatch = text.match(/VERDADE\s*APLICADA\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*TEXTOS\s*DE\s*REFERÊNCIA|\n\s*OBJETIVOS)/i);
    if (appliedMatch) sections.appliedTruth = appliedMatch[1].trim();

    // Textos de Referência (até a próxima seção importante)
    const refMatch = text.match(/TEXTOS\s*DE\s*REFERÊNCIA\s*\n([\s\S]*?)(?=\n\s*(INTRODUÇÃO|PONTO\s*DE\s*PARTIDA|OBJETIVOS|LEITURAS|HINOS|MOTIVO|$))/i);
    if (refMatch) sections.referenceTexts = refMatch[1].trim();

    // Introdução
    const introMatch = text.match(/INTRODUÇÃO\s*\n([\s\S]*?)(?=\n\s*\d+\.\s+|\n\s*PONTO\s*DE\s*PARTIDA|\n\s*1-)/i);
    if (introMatch) sections.introduction = introMatch[1].trim();

    // Tópicos (do primeiro 1. até antes de CONCLUSÃO)
    const topicsMatch = text.match(/(\d+\.\s+[^\n]+[\s\S]*?)(?=\n\s*CONCLUSÃO)/i);
    if (topicsMatch) sections.topics = topicsMatch[1].trim();

    // Conclusão
    const conclusionMatch = text.match(/CONCLUSÃO\s*\n([\s\S]*?)$/i);
    if (conclusionMatch) sections.conclusion = conclusionMatch[1].trim();

    return sections;
}

// Extrai os títulos dos tópicos principais (1., 2., 3.) para o prompt da IA
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

        // Extrair seções
        const sections = extractSections(textoOriginal);
        const finalTitle = titulo || sections.title;
        const topicTitles = extractTopicTitles(sections.topics);

        // Construir prompt para a IA (só os blocos que faltam)
        const prompt = `Você é um professor de EBD. Com base no conteúdo abaixo, gere APENAS os seguintes elementos:

1. UMA ANÁLISE GERAL (3-4 parágrafos)
2. PARA CADA UM DOS ${topicTitles.length} TÓPICOS PRINCIPAIS, gere:
   - APOIO PEDAGÓGICO (sugestões práticas para o professor ensinar aquele tópico)
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

Aqui está o conteúdo da lição (use apenas como referência para gerar os itens acima):
Título: ${finalTitle}
Texto Áureo: ${sections.keyVerse}
Verdade Aplicada: ${sections.appliedTruth}
Textos de Referência:
${sections.referenceTexts}

Introdução:
${sections.introduction}

Tópicos:
${sections.topics}

Conclusão:
${sections.conclusion}

IMPORTANTE: Gere APENAS os itens solicitados, sem incluir título, texto áureo, etc. Use exatamente os títulos dos tópicos como estão listados.`;

        let generated = '';
        try {
            generated = await callDeepSeek(prompt);
            console.log('Conteúdo gerado (primeiros 500 chars):', generated.substring(0, 500));
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        // Extrair os blocos do que foi gerado
        let analysis = '';
        let topicSupports = []; // array de { apoio, aplicacao }
        let finalSupport = '';
        let finalApplication = '';

        // Análise geral
        const analysisMatch = generated.match(/🔍 ANÁLISE GERAL\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/);
        if (analysisMatch) analysis = analysisMatch[1].trim();

        // Blocos de apoio/aplicação para cada tópico
        const blockRegex = /📚 APOIO PEDAGÓGICO\s*\(([^)]+)\)\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA\s*\([^)]+\)\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|📚 APOIO PEDAGÓGICO FINAL|$)/g;
        let match;
        while ((match = blockRegex.exec(generated)) !== null) {
            topicSupports.push({
                title: match[1].trim(),
                apoio: match[2].trim(),
                aplicacao: match[3].trim()
            });
        }

        // Apoios finais
        const finalMatch = generated.match(/📚 APOIO PEDAGÓGICO FINAL\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA FINAL\n([\s\S]*?)$/);
        if (finalMatch) {
            finalSupport = finalMatch[1].trim();
            finalApplication = finalMatch[2].trim();
        }

        // Montar a lição final usando um template fixo
        let finalLesson = '';

        // 1. Título
        finalLesson += `${finalTitle}\n\n`;

        // 2. Texto Áureo
        if (sections.keyVerse) {
            finalLesson += `📖 TEXTO ÁUREO\n${sections.keyVerse}\n\n`;
        }

        // 3. Verdade Aplicada
        if (sections.appliedTruth) {
            finalLesson += `🎯 VERDADE APLICADA\n${sections.appliedTruth}\n\n`;
        }

        // 4. Textos de Referência
        if (sections.referenceTexts) {
            finalLesson += `📚 TEXTOS DE REFERÊNCIA\n${sections.referenceTexts}\n\n`;
        }

        // 5. Análise Geral (gerada)
        if (analysis) {
            finalLesson += `🔍 ANÁLISE GERAL\n${analysis}\n\n`;
        }

        // 6. Introdução
        if (sections.introduction) {
            finalLesson += `✍️ INTRODUÇÃO\n${sections.introduction}\n\n`;
        }

        // 7. Tópicos (preservados integralmente)
        if (sections.topics) {
            finalLesson += `${sections.topics}\n\n`;
        }

        // 8. Inserir APOIO PEDAGÓGICO e APLICAÇÃO PRÁTICA após cada tópico principal
        // Como os tópicos estão em um único bloco, precisamos identificar onde colocar os blocos gerados.
        // Vamos usar os títulos dos tópicos para encontrar a posição após cada um.
        if (topicSupports.length > 0) {
            let tempText = finalLesson;
            for (let i = 0; i < topicTitles.length && i < topicSupports.length; i++) {
                const title = topicTitles[i];
                const support = topicSupports[i];
                // Encontra o título do tópico no texto
                const titleRegex = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s*$)`, 'gm');
                let lastIndex = 0;
                let match;
                // Usa o último match para inserir após o tópico
                while ((match = titleRegex.exec(tempText)) !== null) {
                    lastIndex = match.index + match[0].length;
                }
                if (lastIndex > 0) {
                    const insertText = `\n\n📚 APOIO PEDAGÓGICO\n${support.apoio}\n\n⚡ APLICAÇÃO PRÁTICA\n${support.aplicacao}`;
                    tempText = tempText.slice(0, lastIndex) + insertText + tempText.slice(lastIndex);
                }
            }
            finalLesson = tempText;
        }

        // 9. Conclusão
        if (sections.conclusion) {
            finalLesson += `🏁 CONCLUSÃO\n${sections.conclusion}\n\n`;
        }

        // 10. Apoio Pedagógico Final e Aplicação Prática Final
        if (finalSupport) {
            finalLesson += `📚 APOIO PEDAGÓGICO FINAL\n${finalSupport}\n\n`;
        }
        if (finalApplication) {
            finalLesson += `⚡ APLICAÇÃO PRÁTICA FINAL\n${finalApplication}`;
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

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

// Função aprimorada para extrair todas as seções do texto colado
function extractOriginalSections(text) {
    const sections = {
        title: '',
        keyVerse: '',
        appliedTruth: '',
        referenceTexts: '',
        generalAnalysis: '',
        introduction: '',
        topicsFull: '',
        conclusion: ''
    };

    // Expressões regulares para identificar as seções
    const patterns = {
        title: /^(LIÇÃO\s+\d+[:\s]+.*?)$/im,
        keyVerse: /TEXTO\s*ÁUREO\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*🎯|\n\s*VERDADE\s*APLICADA)/i,
        appliedTruth: /VERDADE\s*APLICADA\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*📚|\n\s*TEXTOS\s*DE\s*REFERÊNCIA)/i,
        referenceTexts: /TEXTOS\s*DE\s*REFERÊNCIA\s*\n([\s\S]*?)(?=\n\s*🔍|\n\s*ANÁLISE\s*GERAL|\n\s*✍️|\n\s*INTRODUÇÃO)/i,
        generalAnalysis: /ANÁLISE\s*GERAL\s*\n([\s\S]*?)(?=\n\s*✍️|\n\s*INTRODUÇÃO)/i,
        introduction: /INTRODUÇÃO\s*\n([\s\S]*?)(?=\n\s*\d+\.\s+)/i,
        topics: /(\d+\.\s+[^\n]+(?:\n(?!\n\s*\d+\.\s+)[^\n]+)*)/g,
        conclusion: /CONCLUSÃO\s*\n([\s\S]*?)(?=\n\s*📚\s*APOIO|\n\s*APOIO\s*PEDAGÓGICO|\n\s*$)/i
    };

    // Título
    const titleMatch = text.match(patterns.title);
    if (titleMatch) sections.title = titleMatch[1].trim();

    // Texto Áureo
    const keyVerseMatch = text.match(patterns.keyVerse);
    if (keyVerseMatch) sections.keyVerse = keyVerseMatch[1].trim();

    // Verdade Aplicada
    const appliedMatch = text.match(patterns.appliedTruth);
    if (appliedMatch) sections.appliedTruth = appliedMatch[1].trim();

    // Textos de Referência
    const refMatch = text.match(patterns.referenceTexts);
    if (refMatch) sections.referenceTexts = refMatch[1].trim();

    // Análise Geral (se existir)
    const analysisMatch = text.match(patterns.generalAnalysis);
    if (analysisMatch) sections.generalAnalysis = analysisMatch[1].trim();

    // Introdução
    const introMatch = text.match(patterns.introduction);
    if (introMatch) sections.introduction = introMatch[1].trim();

    // Tópicos (preservar todo o bloco desde o primeiro tópico até antes da conclusão)
    const topicsStart = text.search(/\n\d+\.\s+[A-Za-zÀ-ú]/);
    const conclusionStart = text.search(/\nCONCLUSÃO/i);
    if (topicsStart !== -1 && conclusionStart !== -1) {
        sections.topicsFull = text.substring(topicsStart, conclusionStart).trim();
    } else if (topicsStart !== -1) {
        sections.topicsFull = text.substring(topicsStart).trim();
    }

    // Conclusão
    const conclusionMatch = text.match(patterns.conclusion);
    if (conclusionMatch) sections.conclusion = conclusionMatch[1].trim();

    // Fallback: se alguma seção ficou vazia, tenta extrair manualmente
    if (!sections.introduction) {
        const fallbackIntro = text.match(/INTRODUÇÃO\s*\n([\s\S]*?)(?=\n\d+\.\s+)/i);
        if (fallbackIntro) sections.introduction = fallbackIntro[1].trim();
    }

    if (!sections.conclusion) {
        const fallbackConc = text.match(/CONCLUSÃO\s*\n([\s\S]*?)$/i);
        if (fallbackConc) sections.conclusion = fallbackConc[1].trim();
    }

    return sections;
}

// Extrai os títulos dos tópicos principais (1., 2., 3.)
function extractMainTopicTitles(topicsFull) {
    const titles = [];
    const lines = topicsFull.split('\n');
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
        const original = extractOriginalSections(textoOriginal);
        const finalTitle = titulo || original.title;
        const topicTitles = extractMainTopicTitles(original.topicsFull);

        // Se não conseguiu extrair os tópicos, tenta um fallback
        let topicsFullFinal = original.topicsFull;
        if (!topicsFullFinal) {
            const topicsMatch = textoOriginal.match(/(\d+\.\s+[^\n]+(?:\n(?!\n\s*\d+\.\s+)[^\n]+)*)/g);
            if (topicsMatch) topicsFullFinal = topicsMatch.join('\n\n');
        }

        // Se a introdução não foi capturada, tenta extrair do texto bruto
        let introductionFinal = original.introduction;
        if (!introductionFinal) {
            const introMatch = textoOriginal.match(/INTRODUÇÃO\s*\n([\s\S]*?)(?=\n\d+\.\s+)/i);
            if (introMatch) introductionFinal = introMatch[1].trim();
        }

        // Se a conclusão não foi capturada, tenta extrair
        let conclusionFinal = original.conclusion;
        if (!conclusionFinal) {
            const concMatch = textoOriginal.match(/CONCLUSÃO\s*\n([\s\S]*?)$/i);
            if (concMatch) conclusionFinal = concMatch[1].trim();
        }

        // Preparar conteúdo para a IA (apenas para gerar os itens que faltam)
        const baseForAI = `
Título: ${finalTitle}
Texto Áureo: ${original.keyVerse}
Verdade Aplicada: ${original.appliedTruth}
Textos de Referência:
${original.referenceTexts || '(não fornecidos)'}

Introdução:
${introductionFinal || '(não fornecida)'}

Tópicos:
${topicsFullFinal || '(não fornecidos)'}

Conclusão:
${conclusionFinal || '(não fornecida)'}
        `;

        // Gerar os itens complementares
        let generated = '';
        try {
            const prompt = `Você é um professor de EBD. Com base no conteúdo da lição abaixo, gere APENAS os seguintes elementos:

1. UMA ANÁLISE GERAL (3-4 parágrafos)
2. PARA CADA UM DOS ${topicTitles.length} TÓPICOS PRINCIPAIS, gere:
   - APOIO PEDAGÓGICO (sugestões para o professor ensinar aquele tópico)
   - APLICAÇÃO PRÁTICA (sugestões de como os alunos podem aplicar)
3. APOIO PEDAGÓGICO FINAL (orientações para encerrar a aula)
4. APLICAÇÃO PRÁTICA FINAL (desafios para a semana)

Use o seguinte formato exato:

🔍 ANÁLISE GERAL
[texto]

📚 APOIO PEDAGÓGICO (${topicTitles[0] || 'Tópico 1'})
[texto]
⚡ APLICAÇÃO PRÁTICA (${topicTitles[0] || 'Tópico 1'})
[texto]

📚 APOIO PEDAGÓGICO (${topicTitles[1] || 'Tópico 2'})
[texto]
⚡ APLICAÇÃO PRÁTICA (${topicTitles[1] || 'Tópico 2'})
[texto]

📚 APOIO PEDAGÓGICO (${topicTitles[2] || 'Tópico 3'})
[texto]
⚡ APLICAÇÃO PRÁTICA (${topicTitles[2] || 'Tópico 3'})
[texto]

📚 APOIO PEDAGÓGICO FINAL
[texto]
⚡ APLICAÇÃO PRÁTICA FINAL
[texto]

Aqui está o conteúdo da lição:
${baseForAI}

IMPORTANTE: 
- Gere APENAS esses itens. 
- Não inclua título, texto áureo, verdade aplicada, textos de referência, introdução, tópicos ou conclusão. 
- Use os títulos exatos dos tópicos como estão listados acima.
- Se algum tópico não existir, pule-o.`;

            generated = await callDeepSeek(prompt);
            console.log('Conteúdo gerado pela IA (primeiros 500 chars):', generated.substring(0, 500));
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        // Montar a lição final preservando o conteúdo original
        let finalLesson = `${finalTitle}\n\n`;
        finalLesson += `📖 TEXTO ÁUREO\n${original.keyVerse}\n\n`;
        finalLesson += `🎯 VERDADE APLICADA\n${original.appliedTruth}\n\n`;
        finalLesson += `📚 TEXTOS DE REFERÊNCIA\n${original.referenceTexts || '(não especificados)'}\n\n`;

        // Inserir análise geral (gerada)
        if (generated) {
            const analysisMatch = generated.match(/🔍 ANÁLISE GERAL\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/);
            if (analysisMatch && analysisMatch[1].trim()) {
                finalLesson += `🔍 ANÁLISE GERAL\n${analysisMatch[1].trim()}\n\n`;
            }
        } else if (original.generalAnalysis) {
            finalLesson += `🔍 ANÁLISE GERAL\n${original.generalAnalysis}\n\n`;
        }

        // Introdução original
        finalLesson += `✍️ INTRODUÇÃO\n${introductionFinal || ''}\n\n`;

        // Tópicos completos (preservados)
        finalLesson += `${topicsFullFinal || ''}\n\n`;

        // Inserir APOIO PEDAGÓGICO e APLICAÇÃO PRÁTICA para cada tópico principal
        if (generated && topicTitles.length > 0) {
            for (let i = 0; i < topicTitles.length; i++) {
                const title = topicTitles[i];
                const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`📚 APOIO PEDAGÓGICO \\(${escapedTitle}\\)\\n([\\s\\S]*?)⚡ APLICAÇÃO PRÁTICA \\(${escapedTitle}\\)\\n([\\s\\S]*?)(?=📚 APOIO PEDAGÓGICO \\(|$)`);
                const match = generated.match(regex);
                if (match && match[1] && match[2]) {
                    finalLesson += `📚 APOIO PEDAGÓGICO\n${match[1].trim()}\n\n`;
                    finalLesson += `⚡ APLICAÇÃO PRÁTICA\n${match[2].trim()}\n\n`;
                } else {
                    // Fallback: tenta capturar na ordem sequencial
                    const fallbackMatches = generated.match(/📚 APOIO PEDAGÓGICO\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/g);
                    if (fallbackMatches && fallbackMatches[i]) {
                        const fallback = fallbackMatches[i];
                        const parts = fallback.match(/📚 APOIO PEDAGÓGICO\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA\n([\s\S]*?)$/);
                        if (parts && parts[1] && parts[2]) {
                            finalLesson += `📚 APOIO PEDAGÓGICO\n${parts[1].trim()}\n\n`;
                            finalLesson += `⚡ APLICAÇÃO PRÁTICA\n${parts[2].trim()}\n\n`;
                        }
                    }
                }
            }
        }

        // Conclusão original
        finalLesson += `🏁 CONCLUSÃO\n${conclusionFinal || ''}\n\n`;

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

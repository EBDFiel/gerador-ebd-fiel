const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração DeepSeek
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
            max_tokens: 4000
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Extrai as seções do texto colado, preservando o conteúdo original intacto
function extractOriginalSections(text) {
    const lines = text.split('\n');
    let sections = {
        title: '',
        keyVerse: '',
        appliedTruth: '',
        referenceTexts: '',
        introduction: '',
        topicsFull: '',      // todo o bloco de tópicos (1., 1.1., etc.) preservado
        conclusion: ''
    };

    let currentSection = '';
    let buffer = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const upper = line.toUpperCase();

        // Título
        if (!sections.title && (line.startsWith('LIÇÃO') || line.startsWith('Lição'))) {
            sections.title = line.trim();
        }
        // Texto Áureo
        else if (upper.includes('TEXTO ÁUREO')) {
            currentSection = 'keyVerse';
            let content = line.replace(/TEXTO ÁUREO/gi, '').replace(/:/g, '').trim();
            if (!content && i+1 < lines.length && !lines[i+1].toUpperCase().includes('VERDADE')) {
                content = lines[i+1].trim();
            }
            sections.keyVerse = content;
        }
        // Verdade Aplicada
        else if (upper.includes('VERDADE APLICADA')) {
            currentSection = 'appliedTruth';
            let content = line.replace(/VERDADE APLICADA/gi, '').replace(/:/g, '').trim();
            if (!content && i+1 < lines.length && !lines[i+1].toUpperCase().includes('TEXTOS')) {
                content = lines[i+1].trim();
            }
            sections.appliedTruth = content;
        }
        // Textos de Referência
        else if (upper.includes('TEXTOS DE REFERÊNCIA') || upper.includes('LEITURAS COMPLEMENTARES')) {
            currentSection = 'referenceTexts';
            buffer = [];
        }
        // Introdução
        else if (upper.includes('INTRODUÇÃO')) {
            currentSection = 'introduction';
            buffer = [];
        }
        // Conclusão
        else if (upper.includes('CONCLUSÃO')) {
            currentSection = 'conclusion';
            buffer = [];
        }
        // Tópicos – detecta início de tópico principal (1., 2., 3.)
        else if (line.match(/^\d+\.\s+[A-Za-zÀ-ú]/) && !line.includes('.')) {
            if (currentSection !== 'topics') {
                // Se estava coletando outra seção, finaliza
                if (currentSection === 'introduction') sections.introduction = buffer.join('\n').trim();
                if (currentSection === 'conclusion') sections.conclusion = buffer.join('\n').trim();
                if (currentSection === 'referenceTexts') sections.referenceTexts = buffer.join('\n').trim();
                currentSection = 'topics';
                buffer = [];
            }
            buffer.push(line);
        }
        // Captura conteúdo das seções
        else if (currentSection && line.trim()) {
            buffer.push(line);
        }
    }

    // Finaliza as seções que estavam sendo coletadas
    if (currentSection === 'introduction') sections.introduction = buffer.join('\n').trim();
    if (currentSection === 'conclusion') sections.conclusion = buffer.join('\n').trim();
    if (currentSection === 'referenceTexts') sections.referenceTexts = buffer.join('\n').trim();
    if (currentSection === 'topics') sections.topicsFull = buffer.join('\n').trim();

    // Se a introdução não foi capturada corretamente, tenta extrair de forma mais robusta
    if (!sections.introduction) {
        const introMatch = text.match(/INTRODUÇÃO\s*\n([\s\S]*?)(?=\n\d+\.\s+)/i);
        if (introMatch) sections.introduction = introMatch[1].trim();
    }

    // Se a conclusão não foi capturada corretamente
    if (!sections.conclusion) {
        const concMatch = text.match(/CONCLUSÃO\s*\n([\s\S]*?)$/i);
        if (concMatch) sections.conclusion = concMatch[1].trim();
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

        // Extrai o conteúdo original completo
        const original = extractOriginalSections(textoOriginal);
        const finalTitle = titulo || original.title;
        const topicTitles = extractMainTopicTitles(original.topicsFull);

        // Conteúdo que será enviado para a IA gerar apenas os itens que faltam
        const baseContentForAI = `
Título: ${finalTitle}
Texto Áureo: ${original.keyVerse}
Verdade Aplicada: ${original.appliedTruth}
Textos de Referência:
${original.referenceTexts}

Introdução:
${original.introduction}

Tópicos (preserve os títulos e subtópicos):
${original.topicsFull}

Conclusão:
${original.conclusion}
        `;

        // Gera os itens complementares
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
${baseContentForAI}

IMPORTANTE: 
- Gere APENAS esses itens. 
- Não inclua título, texto áureo, verdade aplicada, textos de referência, introdução, tópicos ou conclusão. 
- Use os títulos exatos dos tópicos como estão listados acima.`;

            generated = await callDeepSeek(prompt);
            console.log('Conteúdo gerado pela IA (primeiros 500 chars):', generated.substring(0, 500));
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        // Montar a lição final, preservando TODO o conteúdo original
        let finalLesson = `${finalTitle}\n\n`;
        finalLesson += `📖 TEXTO ÁUREO\n${original.keyVerse}\n\n`;
        finalLesson += `🎯 VERDADE APLICADA\n${original.appliedTruth}\n\n`;
        finalLesson += `📚 TEXTOS DE REFERÊNCIA\n${original.referenceTexts}\n\n`;

        // Inserir análise geral (gerada)
        if (generated) {
            const analysisMatch = generated.match(/🔍 ANÁLISE GERAL\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/);
            if (analysisMatch && analysisMatch[1].trim()) {
                finalLesson += `🔍 ANÁLISE GERAL\n${analysisMatch[1].trim()}\n\n`;
            }
        }

        // Introdução original
        finalLesson += `✍️ INTRODUÇÃO\n${original.introduction}\n\n`;

        // Tópicos completos (preservados integralmente)
        finalLesson += `${original.topicsFull}\n\n`;

        // Inserir APOIO PEDAGÓGICO e APLICAÇÃO PRÁTICA para cada tópico principal
        if (generated) {
            for (let i = 0; i < topicTitles.length; i++) {
                const title = topicTitles[i];
                const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`📚 APOIO PEDAGÓGICO \\(${escapedTitle}\\)\\n([\\s\\S]*?)⚡ APLICAÇÃO PRÁTICA \\(${escapedTitle}\\)\\n([\\s\\S]*?)(?=📚 APOIO PEDAGÓGICO \\(|$)`);
                const match = generated.match(regex);
                if (match && match[1] && match[2]) {
                    finalLesson += `📚 APOIO PEDAGÓGICO\n${match[1].trim()}\n\n`;
                    finalLesson += `⚡ APLICAÇÃO PRÁTICA\n${match[2].trim()}\n\n`;
                } else {
                    // Fallback: tenta capturar na ordem sequencial (sem título específico)
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
        finalLesson += `🏁 CONCLUSÃO\n${original.conclusion}\n\n`;

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

// Rota principal
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

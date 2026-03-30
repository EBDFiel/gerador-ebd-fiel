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

// Função para chamar a DeepSeek
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
            temperature: 0.7,
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

// Extrai as seções do texto colado
function extractSections(text) {
    const lines = text.split('\n');
    let sections = {
        title: '',
        keyVerse: '',
        appliedTruth: '',
        referenceTexts: '',
        introduction: '',
        topics: [],
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
        // Tópico principal (1., 2., 3.)
        else if (line.match(/^\d+\.\s+[A-Za-zÀ-ú]/) && !line.includes('.')) {
            if (currentSection === 'topics') {
                sections.topics.push(buffer.join('\n').trim());
                buffer = [];
            }
            currentSection = 'topics';
            buffer.push(line);
        }
        // Capturar conteúdo das seções
        else if (currentSection && line.trim()) {
            buffer.push(line);
        }
    }

    // Último tópico
    if (currentSection === 'topics' && buffer.length) {
        sections.topics.push(buffer.join('\n').trim());
    }

    // Atribuir buffers das outras seções
    if (sections.referenceTexts === '') sections.referenceTexts = buffer.join('\n').trim();
    if (sections.introduction === '') sections.introduction = buffer.join('\n').trim();
    if (sections.conclusion === '') sections.conclusion = buffer.join('\n').trim();

    return sections;
}

// Extrai os títulos dos tópicos principais (1., 2., 3.)
function extractTopicTitles(topicsArray) {
    const titles = [];
    for (const topic of topicsArray) {
        const firstLine = topic.split('\n')[0];
        if (firstLine.match(/^\d+\.\s+/)) {
            titles.push(firstLine.trim());
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
        const topicTitles = extractTopicTitles(sections.topics);
        const finalTitle = titulo || sections.title;

        // Preparar o conteúdo que será enviado para a IA
        const baseContent = `
Título: ${finalTitle}
Texto Áureo: ${sections.keyVerse}
Verdade Aplicada: ${sections.appliedTruth}
Textos de Referência:
${sections.referenceTexts}

Introdução:
${sections.introduction}

Tópicos:
${sections.topics.map((t, idx) => `${idx+1}. ${t.split('\n')[0]}`).join('\n')}

Conclusão:
${sections.conclusion}
        `;

        // Gerar apenas os itens que faltam
        let generated = '';
        try {
            const prompt = `Você é um professor de EBD. Com base no conteúdo abaixo, gere APENAS os seguintes elementos:

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
${baseContent}

IMPORTANTE: Gere APENAS esses itens. Use os títulos exatos dos tópicos como estão.`;

            generated = await callDeepSeek(prompt);
            console.log('Gerado com sucesso, tamanho:', generated.length);
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        // Montar a lição final
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

        finalLesson += `✍️ INTRODUÇÃO\n${sections.introduction}\n\n`;

        // Adicionar os tópicos originais completos (já contêm subtópicos e "EU ENSINEI QUE")
        for (let i = 0; i < sections.topics.length; i++) {
            finalLesson += `${sections.topics[i]}\n\n`;

            // Inserir apoio e aplicação para este tópico, se gerados
            if (generated) {
                const topicTitle = topicTitles[i] || `Tópico ${i+1}`;
                // Escapar caracteres especiais para regex
                const escapedTitle = topicTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const apoioMatch = generated.match(new RegExp(`📚 APOIO PEDAGÓGICO \\(${escapedTitle}\\)\\n([\\s\\S]*?)⚡ APLICAÇÃO PRÁTICA \\(${escapedTitle}\\)\\n([\\s\\S]*?)(?=📚 APOIO PEDAGÓGICO \\(|$)`));
                if (apoioMatch && apoioMatch[1] && apoioMatch[2]) {
                    finalLesson += `📚 APOIO PEDAGÓGICO\n${apoioMatch[1].trim()}\n\n`;
                    finalLesson += `⚡ APLICAÇÃO PRÁTICA\n${apoioMatch[2].trim()}\n\n`;
                } else {
                    // Tenta capturar sem os parênteses do título (caso a IA não use o título)
                    const fallbackMatch = generated.match(new RegExp(`📚 APOIO PEDAGÓGICO\\n([\\s\\S]*?)⚡ APLICAÇÃO PRÁTICA\\n([\\s\\S]*?)(?=📚 APOIO PEDAGÓGICO|$)`));
                    if (fallbackMatch && i < 3) {
                        finalLesson += `📚 APOIO PEDAGÓGICO\n${fallbackMatch[1].trim()}\n\n`;
                        finalLesson += `⚡ APLICAÇÃO PRÁTICA\n${fallbackMatch[2].trim()}\n\n`;
                    }
                }
            }
        }

        // Conclusão original
        finalLesson += `🏁 CONCLUSÃO\n${sections.conclusion}\n\n`;

        // Adicionar Apoio Pedagógico Final e Aplicação Prática Final
        if (generated) {
            const apoioFinalMatch = generated.match(/📚 APOIO PEDAGÓGICO FINAL\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA FINAL\n([\s\S]*?)$/);
            if (apoioFinalMatch && apoioFinalMatch[1] && apoioFinalMatch[2]) {
                finalLesson += `📚 APOIO PEDAGÓGICO FINAL\n${apoioFinalMatch[1].trim()}\n\n`;
                finalLesson += `⚡ APLICAÇÃO PRÁTICA FINAL\n${apoioFinalMatch[2].trim()}`;
            }
        }

        res.json({ licaoCompleta: finalLesson });

    } catch (error) {
        console.error("Erro no endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', deepseek_configured: !!DEEPSEEK_API_KEY });
});
// Rota principal - serve o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`DeepSeek: ${DEEPSEEK_API_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
});

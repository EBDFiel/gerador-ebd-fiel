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

// ==================================================
// 1. Extração limpa das seções do texto colado
// ==================================================
function extractSections(text) {
    const sections = {
        title: '',
        keyVerse: '',
        appliedTruth: '',
        referenceTexts: '',
        introduction: '',
        topics: [],           // cada tópico principal será um objeto { title, content }
        conclusion: ''
    };

    // Título (primeira linha que começa com LIÇÃO)
    const titleMatch = text.match(/^(LIÇÃO\s+\d+[:\s]+.*)$/im);
    if (titleMatch) sections.title = titleMatch[1].trim();

    // Texto Áureo – até "VERDADE APLICADA"
    const keyVerseMatch = text.match(/TEXTO\s*ÁUREO\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*VERDADE\s*APLICADA)/i);
    if (keyVerseMatch) sections.keyVerse = keyVerseMatch[1].trim();

    // Verdade Aplicada – até "TEXTOS DE REFERÊNCIA"
    const appliedMatch = text.match(/VERDADE\s*APLICADA\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*TEXTOS\s*DE\s*REFERÊNCIA)/i);
    if (appliedMatch) sections.appliedTruth = appliedMatch[1].trim();

    // Textos de Referência – desde o cabeçalho até o próximo cabeçalho (INTRODUÇÃO ou ESBOÇO)
    const refMatch = text.match(/TEXTOS\s*DE\s*REFERÊNCIA\s*\n([\s\S]*?)(?=\n\s*(INTRODUÇÃO|ESBOÇO|PONTO\s*DE\s*PARTIDA|$))/i);
    if (refMatch) sections.referenceTexts = refMatch[1].trim();

    // Introdução – desde o cabeçalho até o primeiro tópico principal (1-, 1., etc.)
    const introMatch = text.match(/INTRODUÇÃO\s*\n([\s\S]*?)(?=\n\s*\d+[-\.]\s+)/i);
    if (introMatch) sections.introduction = introMatch[1].trim();

    // Tópicos principais – cada bloco que começa com 1- / 2- / 3- e vai até o próximo tópico ou até CONCLUSÃO
    const topicBlocks = [];
    const topicPattern = /^(\d+[-\.]\s+[^\n]+)([\s\S]*?)(?=\n\d+[-\.]\s+|CONCLUSÃO|$)/gim;
    let match;
    while ((match = topicPattern.exec(text)) !== null) {
        const title = match[1].trim();
        const content = match[2].trim();
        topicBlocks.push({ title, content });
    }
    sections.topics = topicBlocks;

    // Conclusão – após o cabeçalho até o fim
    const conclusionMatch = text.match(/CONCLUSÃO\s*\n([\s\S]*?)$/i);
    if (conclusionMatch) sections.conclusion = conclusionMatch[1].trim();

    return sections;
}

// ==================================================
// 2. Geração dos complementos pela IA
// ==================================================
async function generateComplementos(titulo, sections, publico) {
    const topicTitles = sections.topics.map(t => t.title);
    const prompt = `Você é um professor de EBD. Com base no conteúdo da lição abaixo, gere APENAS os seguintes elementos:

1. UMA ANÁLISE GERAL (3-4 parágrafos)
2. PARA CADA UM DOS ${topicTitles.length} TÓPICOS PRINCIPAIS, gere:
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

Aqui está o conteúdo da lição (use apenas como referência):
Título: ${titulo}
Texto Áureo: ${sections.keyVerse}
Verdade Aplicada: ${sections.appliedTruth}
Textos de Referência: ${sections.referenceTexts?.substring(0, 1000)}
Introdução: ${sections.introduction?.substring(0, 1000)}
Tópicos: ${sections.topics.map(t => t.title).join(', ')}
Conclusão: ${sections.conclusion?.substring(0, 500)}

IMPORTANTE: Gere APENAS os itens solicitados. Use exatamente os títulos dos tópicos como listados.`;
    return await callDeepSeek(prompt);
}

// ==================================================
// 3. Montagem da lição final
// ==================================================
function buildFinalLesson(sections, generated, publico) {
    // Extrair análise geral
    const analysisMatch = generated.match(/🔍 ANÁLISE GERAL\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/);
    const analysis = analysisMatch ? analysisMatch[1].trim() : '';

    // Extrair apoio/aplicação para cada tópico
    const topicSupports = [];
    for (let topic of sections.topics) {
        const title = topic.title;
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`📚 APOIO PEDAGÓGICO \\(${escaped}\\)\\n([\\s\\S]*?)⚡ APLICAÇÃO PRÁTICA \\(${escaped}\\)\\n([\\s\\S]*?)(?=📚 APOIO PEDAGÓGICO \\(|$)`);
        const match = generated.match(regex);
        if (match && match[1] && match[2]) {
            topicSupports.push({ title, apoio: match[1].trim(), aplicacao: match[2].trim() });
        }
    }

    // Extrair apoios finais
    const finalMatch = generated.match(/📚 APOIO PEDAGÓGICO FINAL\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA FINAL\n([\s\S]*?)$/);
    const finalSupport = finalMatch ? finalMatch[1].trim() : '';
    const finalApplication = finalMatch ? finalMatch[2].trim() : '';

    // Construir a lição final
    let final = '';

    // Título
    final += `${sections.title}\n\n`;

    // Texto Áureo
    if (sections.keyVerse) final += `📖 TEXTO ÁUREO\n${sections.keyVerse}\n\n`;

    // Verdade Aplicada
    if (sections.appliedTruth) final += `🎯 VERDADE APLICADA\n${sections.appliedTruth}\n\n`;

    // Textos de Referência
    if (sections.referenceTexts) final += `📚 TEXTOS DE REFERÊNCIA\n${sections.referenceTexts}\n\n`;

    // Análise Geral (gerada)
    if (analysis) final += `🔍 ANÁLISE GERAL\n${analysis}\n\n`;

    // Introdução
    if (sections.introduction) final += `✍️ INTRODUÇÃO\n${sections.introduction}\n\n`;

    // Tópicos com seus conteúdos originais e os apoios inseridos após cada um
    for (let i = 0; i < sections.topics.length; i++) {
        const topic = sections.topics[i];
        final += `${topic.title}\n${topic.content}\n\n`;

        // Inserir apoio e aplicação correspondentes, se existirem
        const support = topicSupports.find(s => s.title === topic.title);
        if (support) {
            final += `📚 APOIO PEDAGÓGICO\n${support.apoio}\n\n`;
            final += `⚡ APLICAÇÃO PRÁTICA\n${support.aplicacao}\n\n`;
        }
    }

    // Conclusão
    if (sections.conclusion) final += `🏁 CONCLUSÃO\n${sections.conclusion}\n\n`;

    // Apoios finais
    if (finalSupport) final += `📚 APOIO PEDAGÓGICO FINAL\n${finalSupport}\n\n`;
    if (finalApplication) final += `⚡ APLICAÇÃO PRÁTICA FINAL\n${finalApplication}`;

    return final;
}

// ==================================================
// 4. Rota da API
// ==================================================
app.post('/api/gerar-licao-completa', async (req, res) => {
    try {
        const { titulo, textoOriginal, publico } = req.body;
        console.log('Requisição recebida:', { titulo, tamanho: textoOriginal?.length });

        // Extrair seções do texto colado
        const sections = extractSections(textoOriginal);
        if (!sections.title) sections.title = titulo || 'Lição';

        // Gerar complementos com IA
        let generated = '';
        try {
            generated = await generateComplementos(sections.title, sections, publico);
            console.log('Conteúdo gerado (primeiros 500):', generated.substring(0, 500));
        } catch (err) {
            console.error('Erro na IA:', err);
            generated = '';
        }

        // Montar lição final
        const finalLesson = buildFinalLesson(sections, generated, publico);
        res.json({ licaoCompleta: finalLesson });

    } catch (error) {
        console.error('Erro no endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================================================
// 5. Frontend
// ==================================================
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

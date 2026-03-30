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

// Função para extrair título, texto áureo e verdade aplicada simples
function extractBasics(text) {
    const titleMatch = text.match(/^(LIÇÃO\s+\d+[:\s]+.*)$/im);
    const keyVerseMatch = text.match(/TEXTO\s*ÁUREO\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*VERDADE\s*APLICADA)/i);
    const appliedMatch = text.match(/VERDADE\s*APLICADA\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*TEXTOS\s*DE\s*REFERÊNCIA)/i);
    return {
        title: titleMatch ? titleMatch[1].trim() : '',
        keyVerse: keyVerseMatch ? keyVerseMatch[1].trim() : '',
        appliedTruth: appliedMatch ? appliedMatch[1].trim() : ''
    };
}

// Função para extrair os títulos dos tópicos principais (1., 2., 3.)
function extractMainTopicTitles(text) {
    const titles = [];
    const regex = /^\d+[\.\-\s]+([A-Za-zÀ-ú][^\n]+)/gm;
    let match;
    while ((match = regex.exec(text)) !== null) {
        titles.push(match[0].trim());
    }
    return titles;
}

// Rota da API
app.post('/api/gerar-licao-completa', async (req, res) => {
    try {
        const { titulo, textoOriginal, publico } = req.body;
        console.log('Requisição recebida:', { titulo, tamanho: textoOriginal?.length });

        // Preserva o texto original completo
        let finalText = textoOriginal;

        // Extrai o título (se não foi fornecido)
        const basics = extractBasics(textoOriginal);
        const finalTitle = titulo || basics.title;

        // Se o título não estiver no início, ajusta
        if (!finalText.startsWith(finalTitle)) {
            finalText = finalTitle + '\n\n' + finalText;
        }

        // Extrai títulos dos tópicos principais
        const topicTitles = extractMainTopicTitles(textoOriginal);
        console.log('Tópicos principais encontrados:', topicTitles);

        // Gera os elementos que a IA deve fornecer
        const prompt = `Você é um professor de EBD. Com base no texto da lição abaixo, gere APENAS os seguintes elementos:

1. UMA ANÁLISE GERAL (3-4 parágrafos, começando com "🔍 ANÁLISE GERAL")
2. PARA CADA UM DOS ${topicTitles.length} TÓPICOS PRINCIPAIS, gere:
   - APOIO PEDAGÓGICO (começando com "📚 APOIO PEDAGÓGICO")
   - APLICAÇÃO PRÁTICA (começando com "⚡ APLICAÇÃO PRÁTICA")
   Coloque esses blocos imediatamente após o tópico correspondente, mas em ordem separada.
3. APOIO PEDAGÓGICO FINAL (começando com "📚 APOIO PEDAGÓGICO FINAL")
4. APLICAÇÃO PRÁTICA FINAL (começando com "⚡ APLICAÇÃO PRÁTICA FINAL")

Use EXATAMENTE os seguintes cabeçalhos para cada bloco:

🔍 ANÁLISE GERAL
[conteúdo]

📚 APOIO PEDAGÓGICO
[conteúdo]
⚡ APLICAÇÃO PRÁTICA
[conteúdo]

📚 APOIO PEDAGÓGICO
[conteúdo]
⚡ APLICAÇÃO PRÁTICA
[conteúdo]

📚 APOIO PEDAGÓGICO
[conteúdo]
⚡ APLICAÇÃO PRÁTICA
[conteúdo]

📚 APOIO PEDAGÓGICO FINAL
[conteúdo]
⚡ APLICAÇÃO PRÁTICA FINAL
[conteúdo]

Aqui está o texto da lição:
${textoOriginal.substring(0, 5000)}

IMPORTANTE:
- Não inclua o título, texto áureo, verdade aplicada, introdução, tópicos ou conclusão na sua resposta.
- Os blocos de apoio e aplicação devem ser gerados na ordem dos tópicos principais.
- Use conteúdo real, sem placeholders.
- A análise geral deve ser inserida antes da introdução.`;

        let generated = '';
        try {
            generated = await callDeepSeek(prompt);
            console.log('Conteúdo gerado pela IA (primeiros 500 chars):', generated.substring(0, 500));
        } catch (err) {
            console.error('Erro ao chamar DeepSeek:', err);
            generated = '';
        }

        if (!generated) {
            return res.json({ licaoCompleta: finalText });
        }

        // Extrair análise geral
        const analysisMatch = generated.match(/🔍 ANÁLISE GERAL\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|$)/);
        const analysis = analysisMatch ? analysisMatch[1].trim() : '';

        // Extrair os blocos de apoio e aplicação para cada tópico
        const supportBlocks = [];
        const blockRegex = /📚 APOIO PEDAGÓGICO\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA\n([\s\S]*?)(?=📚 APOIO PEDAGÓGICO|📚 APOIO PEDAGÓGICO FINAL|$)/g;
        let match;
        while ((match = blockRegex.exec(generated)) !== null) {
            supportBlocks.push({
                apoio: match[1].trim(),
                aplicacao: match[2].trim()
            });
        }

        // Extrair apoio final e aplicação final
        const finalSupportMatch = generated.match(/📚 APOIO PEDAGÓGICO FINAL\n([\s\S]*?)⚡ APLICAÇÃO PRÁTICA FINAL\n([\s\S]*?)$/);
        const finalSupport = finalSupportMatch ? finalSupportMatch[1].trim() : '';
        const finalApplication = finalSupportMatch ? finalSupportMatch[2].trim() : '';

        // Agora, vamos inserir esses blocos no texto original

        // 1. Inserir análise geral antes da introdução
        const introIndex = finalText.search(/\nINTRODUÇÃO/i);
        if (introIndex !== -1 && analysis) {
            const beforeIntro = finalText.substring(0, introIndex);
            const afterIntro = finalText.substring(introIndex);
            finalText = beforeIntro + '\n\n' + analysis + '\n\n' + afterIntro;
        } else if (analysis) {
            // Se não encontrou introdução, coloca no início após o título/texto áureo/verdade
            finalText = finalText.replace(/^(.*?)(?=\n\d+\.\s+|\nCONCLUSÃO)/s, (match) => match + '\n\n' + analysis);
        }

        // 2. Inserir blocos de apoio após cada tópico principal
        if (supportBlocks.length > 0) {
            let topicCounter = 0;
            // Encontrar cada tópico principal e inserir o bloco correspondente após ele
            finalText = finalText.replace(/(^\d+[\.\-\s]+[A-Za-zÀ-ú][^\n]+[\s\S]*?)(?=\n\d+[\.\-\s]+[A-Za-zÀ-ú]|\nCONCLUSÃO|$)/gm, (topicBlock) => {
                if (topicCounter < supportBlocks.length) {
                    const block = supportBlocks[topicCounter];
                    topicCounter++;
                    return topicBlock + '\n\n📚 APOIO PEDAGÓGICO\n' + block.apoio + '\n\n⚡ APLICAÇÃO PRÁTICA\n' + block.aplicacao;
                }
                return topicBlock;
            });
        }

        // 3. Inserir apoios finais antes da conclusão
        const conclusionIndex = finalText.search(/\nCONCLUSÃO/i);
        if (conclusionIndex !== -1 && (finalSupport || finalApplication)) {
            const beforeConclusion = finalText.substring(0, conclusionIndex);
            const conclusionPart = finalText.substring(conclusionIndex);
            finalText = beforeConclusion + '\n\n';
            if (finalSupport) finalText += '📚 APOIO PEDAGÓGICO FINAL\n' + finalSupport + '\n\n';
            if (finalApplication) finalText += '⚡ APLICAÇÃO PRÁTICA FINAL\n' + finalApplication;
            finalText += '\n\n' + conclusionPart;
        }

        // Se não encontrou conclusão, coloca no final
        if (conclusionIndex === -1 && (finalSupport || finalApplication)) {
            finalText += '\n\n';
            if (finalSupport) finalText += '📚 APOIO PEDAGÓGICO FINAL\n' + finalSupport + '\n\n';
            if (finalApplication) finalText += '⚡ APLICAÇÃO PRÁTICA FINAL\n' + finalApplication;
        }

        res.json({ licaoCompleta: finalText });

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

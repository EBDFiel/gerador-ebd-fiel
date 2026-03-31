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
        throw new Error(`DeepSeek error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

app.post('/api/gerar-licao-completa', async (req, res) => {
    try {
        const { titulo, textoOriginal, publico } = req.body;
        console.log('Requisição recebida, tamanho:', textoOriginal?.length);

        // Usar o título do formulário ou extrair do texto
        const tituloFinal = titulo || textoOriginal.match(/^(LIÇÃO\s+\d+[:\s]+.*)$/im)?.[1] || 'Lição';

        // Montar o prompt EXATAMENTE como funcionou no DeepSeek
        const prompt = `Preciso que você elabore uma lição bíblica completa seguindo rigorosamente o formato abaixo. Utilize o conteúdo da revista que enviarei e siga estas orientações: 
- Mantenha TODO o conteúdo original da revista na íntegra, sem cortes ou alterações. 
- A lição é voltada para adultos.

**Estrutura do documento:**

Cabeçalho com o número da lição
Título da lição
TEXTO ÁUREO (com versículo)
VERDADE APLICADA
TEXTOS DE REFERÊNCIA (com os versículos)

**ABERTURA OBRIGATÓRIA — ANÁLISE GERAL**
Antes de iniciar a lição, escreva uma ANÁLISE GERAL do que será estudado. Essa análise deve:
- Explicar com clareza o tema central da lição;
- Mostrar o fio condutor do estudo;
- Destacar as principais verdades bíblicas abordadas;
- Antecipar os impactos práticos na vida do adulto;
- Ser bem desenvolvida — nunca superficial. Evite comentários genéricos.

**INTRODUÇÃO** (conteúdo original da revista, em negrito)
**APOIO PEDAGÓGICO** (conteúdo complementar que você irá elaborar, com reflexões, contexto histórico, citações de autores, etc.)
**APLICAÇÃO PRÁTICA** (uma reflexão concreta do que praticamos no dia a dia e como aplicar o ensino no dia a dia)

Repetir o padrão para cada tópico e subtópico:
- **conteúdo original da revista** (em negrito)
- **APOIO PEDAGÓGICO**
- **APLICAÇÃO PRÁTICA**

**CONCLUSÃO** (conteúdo original da revista, seguido de APOIO PEDAGÓGICO e APLICAÇÃO PRÁTICA)

**Importante:**
- O conteúdo original da revista deve vir em **negrito** para facilitar a identificação.
- O APOIO PEDAGÓGICO deve ser um texto mais profundo, explicativo, com reflexões teológicas, contexto histórico, citações de autores e referências bíblicas.
- A APLICAÇÃO PRÁTICA deve ser curta, objetiva e trazer uma sugestão concreta de como viver o ensino na prática durante a semana.

Aqui está o conteúdo da revista:
"""
${textoOriginal}
"""

Agora, elabore a lição completa seguindo rigorosamente este formato.`;

        const resultado = await callDeepSeek(prompt);
        console.log('Lição gerada, tamanho:', resultado.length);

        // Retornar diretamente o resultado da IA, sem manipulação
        res.json({ licaoCompleta: resultado });

    } catch (error) {
        console.error("Erro:", error);
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

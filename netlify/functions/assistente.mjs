// netlify/functions/assistente.mjs
// Função serverless do assistente com Gemini e Supabase usando RLS

const SUPABASE_URL = "https://vqoisxmdnyhnphdibzhn.supabase.co/rest/v1/";
const SUPABASE_CHAVE_PUBLICA = "sb_publishable_jcgm5vtqmuA4HveoNra6uw_x16qUSmO";

const supabaseBase = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");

// Formata data ISO (AAAA-MM-DD) para DD/MM/AAAA
function formatarDataBR(dataStr) {
  if (!dataStr) return "";
  const partes = String(dataStr).split("-");
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataStr;
}

export default async (req) => {
  // Trata requisições OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ erro: "Método não permitido. Utilize POST para o assistente." }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // 1. Confere o login do usuário via token do cabeçalho Authorization
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "")?.trim();

  if (!token) {
    return new Response(
      JSON.stringify({ erro: "Sessão não informada (login vencido). Faça login novamente." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  let usuario;
  try {
    const resUser = await fetch(`${supabaseBase}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_CHAVE_PUBLICA
      }
    });

    if (!resUser.ok) {
      return new Response(
        JSON.stringify({ erro: "Sua sessão expirou (login vencido). Faça login novamente para continuar." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    usuario = await resUser.json();
  } catch (err) {
    return new Response(
      JSON.stringify({ erro: "Falha ao verificar autenticação com o banco de dados. Tente novamente." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Confere se a chave do Gemini está presente nas variáveis de ambiente
  const chaveGemini = process.env.CHAVE_GEMINI;
  if (!chaveGemini) {
    return new Response(
      JSON.stringify({ erro: "Chave do Gemini ausente no servidor (sem chave configurada em CHAVE_GEMINI). Configure a variável no painel da Netlify." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Lê o corpo da requisição { mensagem, imagem, mime, categorias }
  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ erro: "Corpo da requisição inválido. Envie um JSON válido." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { mensagem, imagem, mime, categorias } = payload || {};
  const listaCategorias = (Array.isArray(categorias) && categorias.length > 0)
    ? categorias
    : ["MERCADO", "FARMÁCIA", "TRANSPORTE", "RESTAURANTE", "CASA", "LAZER", "OUTROS"];

  if (!mensagem && !imagem) {
    return new Response(
      JSON.stringify({ erro: "Envie uma mensagem de texto ou uma foto de cupom fiscal." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Data atual em São Paulo
  const hojeSP = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const hojeFormatadoBR = formatarDataBR(hojeSP);

  // Prompt do sistema
  const promptSistema = `Você é o assistente financeiro pessoal do aplicativo MEU BOLSO.
A data de hoje em São Paulo (Brasil) é ${hojeFormatadoBR} (formato ISO: ${hojeSP}).
As categorias válidas para lançamento são: ${listaCategorias.join(", ")}.

Regras estritas:
1. Ao identificar um gasto a ser registrado (por texto ou pela foto de um cupom fiscal), chame SEMPRE a ferramenta registrar_gasto.
   - Quando vier uma foto de cupom fiscal, utilize OBRIGATORIAMENTE o VALOR TOTAL (não use parcelas ou subtotais), a data de emissão impressa no cupom (no formato AAAA-MM-DD, ou a data de hoje ${hojeSP} caso não esteja legível) e o nome da loja/estabelecimento para a descrição.
   - A categoria deve ser obrigatoriamente uma das categorias válidas listadas.
2. Ao identificar uma pergunta sobre gastos passados (ex: 'quanto gastei com mercado este mês?', 'qual foi o total desta semana?'), chame SEMPRE a ferramenta consultar_gastos, definindo as datas de início ('desde') e fim ('ate') no formato AAAA-MM-DD, e opcionalmente o nome da categoria se a pergunta for específica.
3. Se o usuário fizer apenas uma saudação ou faltar alguma informação essencial para registrar ou consultar, responda cordialmente em português sem inventar dados.`;

  // Declaração de ferramentas para o Gemini
  const tools = [
    {
      function_declarations: [
        {
          name: "registrar_gasto",
          description: "Registra um novo gasto financeiro do usuário.",
          parameters: {
            type: "OBJECT",
            properties: {
              data: {
                type: "STRING",
                description: "Data do gasto no formato AAAA-MM-DD (ex: 2026-10-09)."
              },
              descricao: {
                type: "STRING",
                description: "Onde ou com o quê foi o gasto (ex: Mercado Central, Farmácia Pague Menos)."
              },
              valor: {
                type: "NUMBER",
                description: "Valor numérico total do gasto em reais (ex: 45.90)."
              },
              categoria: {
                type: "STRING",
                description: `Categoria do gasto. Deve ser uma destas: ${listaCategorias.join(", ")}.`
              }
            },
            required: ["data", "descricao", "valor", "categoria"]
          }
        },
        {
          name: "consultar_gastos",
          description: "Consulta os gastos do usuário em um período de datas para calcular a soma exata.",
          parameters: {
            type: "OBJECT",
            properties: {
              desde: {
                type: "STRING",
                description: "Data de início do período no formato AAAA-MM-DD."
              },
              ate: {
                type: "STRING",
                description: "Data de fim do período no formato AAAA-MM-DD."
              },
              categoria: {
                type: "STRING",
                description: "Nome de uma categoria específica para filtrar, se solicitado (opcional)."
              }
            },
            required: ["desde", "ate"]
          }
        }
      ]
    }
  ];

  // Monta as partes da mensagem do usuário
  const userParts = [];
  if (imagem) {
    const limpaBase64 = String(imagem).replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    userParts.push({
      inline_data: {
        mime_type: mime || "image/jpeg",
        data: limpaBase64
      }
    });
  }

  if (mensagem && String(mensagem).trim()) {
    userParts.push({ text: String(mensagem).trim() });
  } else if (imagem) {
    userParts.push({
      text: "Analise este cupom fiscal e registre o gasto usando o valor total, a data de emissão e o nome do estabelecimento."
    });
  }

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: promptSistema }]
    },
    contents: [
      {
        role: "user",
        parts: userParts
      }
    ],
    tools: tools
  };

  // Chama a API do Gemini com o modelo gemini-3.5-flash-lite
  let resGemini;
  try {
    resGemini = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${chaveGemini}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload)
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ erro: "Erro de conexão ao contatar o assistente inteligente. Tente novamente em instantes." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!resGemini.ok) {
    const errBody = await resGemini.json().catch(() => ({}));
    const mensagemErro = errBody?.error?.message || "";
    if (resGemini.status === 429 || mensagemErro.includes("RESOURCE_EXHAUSTED") || mensagemErro.includes("quota")) {
      return new Response(
        JSON.stringify({ erro: "Limite atingido na API do assistente. Aguarde um momento antes de tentar novamente." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ erro: `Erro no processamento do assistente (${mensagemErro || resGemini.statusText}). Tente novamente.` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const geminiData = await resGemini.json();
  const candidate = geminiData?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Verifica se o modelo acionou alguma função
  const callPart = parts.find((p) => p.functionCall);

  if (callPart && callPart.functionCall) {
    const nomeFuncao = callPart.functionCall.name;
    const args = callPart.functionCall.args || {};

    // Ação: registrar_gasto
    if (nomeFuncao === "registrar_gasto") {
      const valor = Number(args.valor);
      const descricao = String(args.descricao || "Gasto").trim();
      const categoria = String(args.categoria || "OUTROS").toUpperCase();
      const data = String(args.data || hojeSP);
      const origem = imagem ? "foto" : "texto";

      const novoGasto = {
        valor: isNaN(valor) ? 0 : valor,
        descricao: descricao,
        categoria: categoria,
        data: data,
        origem: origem,
        dono: usuario.id
      };

      try {
        const resInsert = await fetch(`${supabaseBase}/rest/v1/gastos`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_CHAVE_PUBLICA,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify(novoGasto)
        });

        if (!resInsert.ok) {
          const textoErro = await resInsert.text();
          if (resInsert.status === 404 || textoErro.includes("relation") || textoErro.includes("does not exist")) {
            return new Response(
              JSON.stringify({ erro: "Tabela inexistente: a tabela 'gastos' não foi encontrada no banco de dados." }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ erro: `Não foi possível salvar o gasto no banco de dados: ${textoErro}` }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const valorFormatado = novoGasto.valor.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

        return new Response(
          JSON.stringify({
            resposta: `Lancei R$ ${valorFormatado} em ${novoGasto.categoria}: ${novoGasto.descricao}, ${novoGasto.data}.`,
            acao: "registrado",
            gasto: novoGasto
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ erro: `Falha ao gravar gasto no banco: ${err.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Ação: consultar_gastos
    if (nomeFuncao === "consultar_gastos") {
      const desde = String(args.desde || hojeSP);
      const ate = String(args.ate || hojeSP);
      const categoria = args.categoria ? String(args.categoria).toUpperCase() : null;

      let urlConsulta = `${supabaseBase}/rest/v1/gastos?select=valor,categoria,data&data=gte.${encodeURIComponent(desde)}&data=lte.${encodeURIComponent(ate)}`;
      if (categoria) {
        urlConsulta += `&categoria=eq.${encodeURIComponent(categoria)}`;
      }

      try {
        const resQuery = await fetch(urlConsulta, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_CHAVE_PUBLICA
          }
        });

        if (!resQuery.ok) {
          const textoErro = await resQuery.text();
          if (resQuery.status === 404 || textoErro.includes("relation") || textoErro.includes("does not exist")) {
            return new Response(
              JSON.stringify({ erro: "Tabela inexistente: a tabela 'gastos' não foi encontrada no banco de dados." }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ erro: `Erro ao consultar gastos no banco: ${textoErro}` }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const linhasGastos = await resQuery.json();
        // A soma vem exclusivamente dos dados do banco de dados, nunca de estimativa do modelo
        const total = (Array.isArray(linhasGastos) ? linhasGastos : []).reduce(
          (acc, g) => acc + (Number(g.valor) || 0),
          0
        );

        const totalFormatado = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL"
        }).format(total);

        const qtd = Array.isArray(linhasGastos) ? linhasGastos.length : 0;
        let respostaTexto = "";
        const periodoStr = `entre ${formatarDataBR(desde)} e ${formatarDataBR(ate)}`;

        if (categoria) {
          respostaTexto = `O total gasto em ${categoria} ${periodoStr} foi de ${totalFormatado} (${qtd} ${qtd === 1 ? "lançamento" : "lançamentos"}).`;
        } else {
          respostaTexto = `O total gasto ${periodoStr} foi de ${totalFormatado} (${qtd} ${qtd === 1 ? "lançamento" : "lançamentos"}).`;
        }

        return new Response(
          JSON.stringify({
            resposta: respostaTexto,
            acao: "consultado",
            total: total,
            quantidade: qtd
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ erro: `Falha na consulta ao banco: ${err.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // Se o modelo não acionou ferramenta, devolve o texto do modelo (ex: solicitando mais detalhes)
  const textoModelo = parts
    .map((p) => p.text || "")
    .join("")
    .trim();

  return new Response(
    JSON.stringify({
      resposta: textoModelo || "Não entendi o pedido. Você pode informar o valor e onde gastou, ou fazer uma pergunta sobre seus gastos.",
      acao: "conversa"
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/assistente"
};

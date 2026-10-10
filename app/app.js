// Inicialização e gerenciamento do aplicativo MEU BOLSO
(function () {
  "use strict";

  // Obter credenciais e parâmetros configurados
  const config = window.MEU_BOLSO || {};
  const rawUrl = config.SUPABASE_URL || "";
  // Higieniza a URL caso termine em /rest/v1/ para compatibilidade com o cliente oficial do Supabase
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const supabaseChave = config.SUPABASE_CHAVE_PUBLICA || "";

  if (!supabaseUrl || !supabaseChave) {
    console.error("Configurações do Supabase ausentes em app/configuracao.js");
  }

  // Inicializa o cliente Supabase via CDN
  const supabase = window.supabase
    ? window.supabase.createClient(supabaseUrl, supabaseChave)
    : null;

  // Estado da aplicação
  let usuarioAtual = null;

  // Elementos da interface - Autenticação
  const telaLogin = document.getElementById("tela-login");
  const telaPrincipal = document.getElementById("tela-principal");
  const formAuth = document.getElementById("form-auth");
  const inputEmail = document.getElementById("auth-email");
  const inputSenha = document.getElementById("auth-senha");
  const btnEntrar = document.getElementById("btn-entrar");
  const btnCriarConta = document.getElementById("btn-criar-conta");
  const mensagemAuth = document.getElementById("mensagem-auth");

  // Elementos da interface - Principal
  const btnSair = document.getElementById("btn-sair");
  const mensagemPrincipal = document.getElementById("mensagem-principal");
  const valorTotalMes = document.getElementById("valor-total-mes");
  const rotuloMesAtual = document.getElementById("rotulo-mes-atual");
  const cartaoResumo = document.getElementById("cartao-resumo");
  const textoResumo = document.getElementById("texto-resumo");
  const dataResumo = document.getElementById("data-resumo");
  const listaBarrasCategorias = document.getElementById("lista-barras-categorias");
  const formLancarGasto = document.getElementById("form-lancar-gasto");
  const gastoValor = document.getElementById("gasto-valor");
  const gastoData = document.getElementById("gasto-data");
  const gastoDescricao = document.getElementById("gasto-descricao");
  const gastoCategoria = document.getElementById("gasto-categoria");
  const listaGastosMes = document.getElementById("lista-gastos-mes");
  const contadorGastos = document.getElementById("contador-gastos");

  // Elementos da interface - Assistente
  const campoAssistente = document.getElementById("campo-assistente");
  const btnEnviarAssistente = document.getElementById("btn-enviar-assistente");
  const btnFotoCupom = document.getElementById("btn-foto-cupom");
  const inputFotoCupom = document.getElementById("input-foto-cupom");
  const mensagemAssistente = document.getElementById("mensagem-assistente");

  // Formata moeda brasileira (R$)
  function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(num);
  }

  // Formata data ISO (YYYY-MM-DD) para DD/MM/AAAA
  function formatarData(dataStr) {
    if (!dataStr) return "";
    const partes = dataStr.split("-");
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const d = new Date(dataStr);
    return isNaN(d.getTime()) ? dataStr : d.toLocaleDateString("pt-BR");
  }

  // Obtém a data de hoje no formato YYYY-MM-DD no fuso local
  function obterDataHoje() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  // Obtém início e fim do mês atual para consulta
  function obterLimitesMesAtual() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth(); // 0 a 11

    const inicioMes = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const fimMes = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

    const mesesNomes = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const rotuloMes = `${mesesNomes[mes]} de ${ano}`;

    return { inicioMes, fimMes, rotuloMes };
  }

  // Converte erros técnicos em instruções amigáveis em português dizendo o que fazer
  function traduzirErro(erro) {
    if (!erro) return "Ocorreu um imprevisto. Tente novamente em instantes.";
    const msg = (erro.message || erro.toString() || "").toLowerCase();

    if (msg.includes("invalid login credentials")) {
      return "E-mail ou senha incorretos. Confira seus dados e tente novamente.";
    }
    if (msg.includes("user already registered")) {
      return "Este e-mail já possui cadastro. Clique em 'Entrar' com sua senha ou utilize outro e-mail.";
    }
    if (msg.includes("password should be at least")) {
      return "A senha deve ter no mínimo 6 caracteres. Escolha uma senha mais longa e tente novamente.";
    }
    if (msg.includes("unable to validate email address") || msg.includes("invalid format")) {
      return "O e-mail digitado parece incompleto ou inválido. Digite um e-mail válido (ex: nome@email.com).";
    }
    if (msg.includes("email not confirmed")) {
      return "Este e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou contate o suporte.";
    }
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
    }
    if (msg.includes("failed to fetch") || msg.includes("network")) {
      return "Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.";
    }

    return `Não foi possível concluir a ação (${erro.message || "erro de comunicação"}). Tente novamente em instantes.`;
  }

  // Exibe mensagem de feedback visual
  function exibirMensagem(elemento, texto, tipo = "erro", tempoMs = 6000) {
    if (!elemento) return;
    elemento.textContent = texto;
    elemento.className = `mensagem-box mensagem-${tipo}`;
    elemento.classList.remove("oculto");

    if (tempoMs > 0) {
      setTimeout(() => {
        if (elemento.textContent === texto) {
          elemento.classList.add("oculto");
        }
      }, tempoMs);
    }
  }

  function esconderMensagem(elemento) {
    if (elemento) {
      elemento.classList.add("oculto");
      elemento.textContent = "";
    }
  }

  // Preenche opções de categorias no formulário
  function preencherCategorias() {
    const categorias = (window.MEU_BOLSO && window.MEU_BOLSO.CATEGORIAS) || [
      "MERCADO", "FARMÁCIA", "TRANSPORTE", "RESTAURANTE", "CASA", "LAZER", "OUTROS"
    ];

    gastoCategoria.innerHTML = "";
    categorias.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      gastoCategoria.appendChild(opt);
    });
  }

  // Autenticação: Entrar
  async function acaoEntrar() {
    esconderMensagem(mensagemAuth);
    const email = inputEmail.value.trim();
    const password = inputSenha.value;

    if (!email || !password) {
      exibirMensagem(
        mensagemAuth,
        "Preencha o e-mail e a senha para entrar.",
        "erro"
      );
      return;
    }

    if (!supabase) {
      exibirMensagem(
        mensagemAuth,
        "Configurações do Supabase não encontradas. Verifique app/configuracao.js.",
        "erro"
      );
      return;
    }

    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando...";

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        exibirMensagem(mensagemAuth, traduzirErro(error), "erro");
      } else if (data && data.user) {
        usuarioAtual = data.user;
        alternarParaTelaPrincipal();
      }
    } catch (err) {
      exibirMensagem(mensagemAuth, traduzirErro(err), "erro");
    } finally {
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
    }
  }

  // Autenticação: Criar conta
  async function acaoCriarConta() {
    esconderMensagem(mensagemAuth);
    const email = inputEmail.value.trim();
    const password = inputSenha.value;

    if (!email || !password) {
      exibirMensagem(
        mensagemAuth,
        "Preencha o e-mail e a senha que deseja cadastrar.",
        "erro"
      );
      return;
    }

    if (password.length < 6) {
      exibirMensagem(
        mensagemAuth,
        "A senha deve conter no mínimo 6 caracteres. Digite uma senha maior.",
        "erro"
      );
      return;
    }

    if (!supabase) {
      exibirMensagem(
        mensagemAuth,
        "Configurações do Supabase não encontradas. Verifique app/configuracao.js.",
        "erro"
      );
      return;
    }

    btnCriarConta.disabled = true;
    btnCriarConta.textContent = "Criando conta...";

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        exibirMensagem(mensagemAuth, traduzirErro(error), "erro");
      } else if (data && data.user) {
        // Se a sessão já veio pronta (sem confirmação de e-mail ativada)
        if (data.session) {
          usuarioAtual = data.user;
          alternarParaTelaPrincipal();
        } else {
          // Tenta entrar diretamente
          const loginTentativa = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (loginTentativa.data && loginTentativa.data.user) {
            usuarioAtual = loginTentativa.data.user;
            alternarParaTelaPrincipal();
          } else {
            exibirMensagem(
              mensagemAuth,
              "Conta criada com sucesso! Agora clique em 'Entrar'.",
              "sucesso",
              7000
            );
          }
        }
      }
    } catch (err) {
      exibirMensagem(mensagemAuth, traduzirErro(err), "erro");
    } finally {
      btnCriarConta.disabled = false;
      btnCriarConta.textContent = "Criar conta";
    }
  }

  // Autenticação: Sair
  async function acaoSair() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    usuarioAtual = null;
    alternarParaTelaLogin();
  }

  // Alternância de Telas
  function alternarParaTelaPrincipal() {
    telaLogin.classList.add("oculto");
    telaPrincipal.classList.remove("oculto");
    esconderMensagem(mensagemAuth);
    esconderMensagem(mensagemPrincipal);

    // Ajusta a data padrão do formulário
    gastoData.value = obterDataHoje();

    // Carrega dados da tela
    carregarDadosDoMes();
    carregarResumoSemana();
  }

  function alternarParaTelaLogin() {
    telaPrincipal.classList.add("oculto");
    telaLogin.classList.remove("oculto");
    inputSenha.value = "";
    esconderMensagem(mensagemPrincipal);
  }

  // Carrega e renderiza o Resumo da Semana (tabela resumos)
  async function carregarResumoSemana() {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("resumos")
        .select("texto, criado_em")
        .order("criado_em", { ascending: false })
        .limit(1);

      if (error) {
        console.warn("Não foi possível carregar o resumo:", error.message);
        cartaoResumo.classList.add("oculto");
        return;
      }

      if (data && data.length > 0 && data[0].texto && data[0].texto.trim() !== "") {
        textoResumo.textContent = data[0].texto.trim();
        if (data[0].criado_em) {
          const dt = new Date(data[0].criado_em);
          dataResumo.textContent = `Atualizado em: ${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        } else {
          dataResumo.textContent = "";
        }
        cartaoResumo.classList.remove("oculto");
      } else {
        cartaoResumo.classList.add("oculto");
      }
    } catch (err) {
      console.warn("Erro ao buscar resumos:", err);
      cartaoResumo.classList.add("oculto");
    }
  }

  // Carrega todos os gastos do mês atual
  async function carregarDadosDoMes() {
    if (!supabase) return;

    const { inicioMes, fimMes, rotuloMes } = obterLimitesMesAtual();
    rotuloMesAtual.textContent = rotuloMes;

    try {
      const { data, error } = await supabase
        .from("gastos")
        .select("id, dono, data, descricao, valor, categoria, origem, criado_em")
        .gte("data", inicioMes)
        .lte("data", fimMes)
        .order("data", { ascending: false })
        .order("criado_em", { ascending: false });

      if (error) {
        exibirMensagem(
          mensagemPrincipal,
          `Não foi possível carregar os gastos do mês: ${traduzirErro(error)}`,
          "erro"
        );
        return;
      }

      const gastos = data || [];
      renderizarPainel(gastos);
    } catch (err) {
      exibirMensagem(
        mensagemPrincipal,
        `Erro de conexão ao carregar gastos: ${traduzirErro(err)}`,
        "erro"
      );
    }
  }

  // Renderiza total, barras e lista de gastos
  function renderizarPainel(gastos) {
    // 1. Total do Mês (Destaque principal)
    const total = gastos.reduce((acum, g) => acum + (Number(g.valor) || 0), 0);
    valorTotalMes.textContent = formatarMoeda(total);

    // 2. Barras por Categoria
    const categorias = (window.MEU_BOLSO && window.MEU_BOLSO.CATEGORIAS) || [
      "MERCADO", "FARMÁCIA", "TRANSPORTE", "RESTAURANTE", "CASA", "LAZER", "OUTROS"
    ];

    // Calcula total por categoria
    const totaisPorCat = {};
    categorias.forEach((c) => {
      totaisPorCat[c] = 0;
    });

    gastos.forEach((g) => {
      const cat = (g.categoria || "OUTROS").toUpperCase();
      if (totaisPorCat[cat] !== undefined) {
        totaisPorCat[cat] += Number(g.valor) || 0;
      } else {
        totaisPorCat["OUTROS"] = (totaisPorCat["OUTROS"] || 0) + (Number(g.valor) || 0);
      }
    });

    listaBarrasCategorias.innerHTML = "";
    categorias.forEach((cat) => {
      const valorCat = totaisPorCat[cat] || 0;
      const porcentagem = total > 0 ? ((valorCat / total) * 100).toFixed(1) : 0;

      const itemBarra = document.createElement("div");
      itemBarra.className = "item-barra";
      itemBarra.innerHTML = `
        <div class="barra-info">
          <span class="barra-nome">${cat}</span>
          <span class="barra-valor">${formatarMoeda(valorCat)} (${porcentagem}%)</span>
        </div>
        <div class="barra-trilha">
          <div class="barra-preenchimento" style="width: ${porcentagem}%;"></div>
        </div>
      `;
      listaBarrasCategorias.appendChild(itemBarra);
    });

    // 3. Lista de Gastos do Mês
    listaGastosMes.innerHTML = "";
    contadorGastos.textContent = gastos.length === 1 ? "1 lançamento" : `${gastos.length} lançamentos`;

    if (gastos.length === 0) {
      listaGastosMes.innerHTML = `
        <div class="gasto-vazio">
          Nenhum gasto registrado neste mês.<br>
          Lance o primeiro valor no formulário abaixo!
        </div>
      `;
      return;
    }

    gastos.forEach((g) => {
      const cardGasto = document.createElement("div");
      cardGasto.className = "item-gasto";

      const detalhes = document.createElement("div");
      detalhes.className = "gasto-detalhes";

      const desc = document.createElement("span");
      desc.className = "gasto-descricao";
      desc.textContent = g.descricao || "Sem descrição";

      const meta = document.createElement("div");
      meta.className = "gasto-meta";
      meta.innerHTML = `
        <span class="badge-categoria">${g.categoria || "OUTROS"}</span>
        <span>${formatarData(g.data)}</span>
      `;

      detalhes.appendChild(desc);
      detalhes.appendChild(meta);

      const valoresArea = document.createElement("div");
      valoresArea.className = "gasto-valores";

      const valorTexto = document.createElement("span");
      valorTexto.className = "gasto-valor-texto";
      valorTexto.textContent = formatarMoeda(g.valor);

      const btnExcluir = document.createElement("button");
      btnExcluir.className = "btn-apagar";
      btnExcluir.setAttribute("title", "Apagar este gasto");
      btnExcluir.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;

      btnExcluir.addEventListener("click", () => {
        apagarGasto(g.id, g.descricao);
      });

      valoresArea.appendChild(valorTexto);
      valoresArea.appendChild(btnExcluir);

      cardGasto.appendChild(detalhes);
      cardGasto.appendChild(valoresArea);

      listaGastosMes.appendChild(cardGasto);
    });
  }

  // Apagar gasto por ID
  async function apagarGasto(idGasto, descricaoGasto) {
    if (!supabase || !idGasto) return;

    const confirmou = window.confirm(
      `Deseja realmente apagar o gasto "${descricaoGasto || "selecionado"}"?`
    );
    if (!confirmou) return;

    try {
      const { error } = await supabase
        .from("gastos")
        .delete()
        .eq("id", idGasto);

      if (error) {
        exibirMensagem(
          mensagemPrincipal,
          `Não foi possível apagar o gasto. ${traduzirErro(error)}`,
          "erro"
        );
      } else {
        exibirMensagem(
          mensagemPrincipal,
          "Gasto apagado com sucesso!",
          "sucesso",
          3500
        );
        carregarDadosDoMes();
      }
    } catch (err) {
      exibirMensagem(
        mensagemPrincipal,
        `Não foi possível apagar o gasto: ${traduzirErro(err)}`,
        "erro"
      );
    }
  }

  // Formulário: Lançar à Mão
  formLancarGasto.addEventListener("submit", async function (evt) {
    evt.preventDefault();
    esconderMensagem(mensagemPrincipal);

    const valorRaw = gastoValor.value;
    const valor = parseFloat(valorRaw);
    const data = gastoData.value;
    const descricao = gastoDescricao.value.trim();
    const categoria = gastoCategoria.value;

    if (isNaN(valor) || valor <= 0) {
      exibirMensagem(
        mensagemPrincipal,
        "Digite um valor numérico válido maior que zero (ex: 25.50).",
        "erro"
      );
      gastoValor.focus();
      return;
    }

    if (!data) {
      exibirMensagem(
        mensagemPrincipal,
        "Escolha uma data para o gasto.",
        "erro"
      );
      gastoData.focus();
      return;
    }

    if (!descricao) {
      exibirMensagem(
        mensagemPrincipal,
        "Preencha onde ou com o quê você gastou.",
        "erro"
      );
      gastoDescricao.focus();
      return;
    }

    if (!categoria) {
      exibirMensagem(
        mensagemPrincipal,
        "Selecione uma categoria para o gasto.",
        "erro"
      );
      gastoCategoria.focus();
      return;
    }

    const btnSubmit = formLancarGasto.querySelector("button[type='submit']");
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Salvando...";

    const novoGasto = {
      valor: valor,
      descricao: descricao,
      categoria: categoria,
      data: data,
      origem: "manual"
    };

    if (usuarioAtual && usuarioAtual.id) {
      novoGasto.dono = usuarioAtual.id;
    }

    try {
      const { error } = await supabase.from("gastos").insert([novoGasto]);

      if (error) {
        exibirMensagem(
          mensagemPrincipal,
          `Não foi possível registrar o gasto. ${traduzirErro(error)}`,
          "erro"
        );
      } else {
        exibirMensagem(
          mensagemPrincipal,
          "Gasto registrado com sucesso!",
          "sucesso",
          3500
        );
        // Limpa formulário mantendo data de hoje
        gastoValor.value = "";
        gastoDescricao.value = "";
        gastoData.value = obterDataHoje();
        // Recarrega lista e resumo do mês
        carregarDadosDoMes();
      }
    } catch (err) {
      exibirMensagem(
        mensagemPrincipal,
        `Não foi possível salvar o gasto: ${traduzirErro(err)}`,
        "erro"
      );
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Adicionar Gasto";
    }
  });

  // Espaço do Assistente

  // Redimensiona imagem no navegador para no máximo 1600 px em JPEG antes do envio
  function redimensionarImagem(arquivo, maxDimensao = 1600) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("O arquivo selecionado não é uma imagem válida."));
        img.onload = () => {
          let largura = img.width;
          let altura = img.height;

          if (largura > maxDimensao || altura > maxDimensao) {
            if (largura > altura) {
              altura = Math.round((altura * maxDimensao) / largura);
              largura = maxDimensao;
            } else {
              largura = Math.round((largura * maxDimensao) / altura);
              altura = maxDimensao;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = largura;
          canvas.height = altura;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, largura, altura);

          // Exporta JPEG com qualidade equilibrada (85%)
          const base64Jpeg = canvas.toDataURL("image/jpeg", 0.85);
          resolve(base64Jpeg);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(arquivo);
    });
  }

  function exibirMensagemAssistente(texto, tipo = "info") {
    mensagemAssistente.classList.remove("oculto");
    mensagemAssistente.textContent = texto;
    if (tipo === "erro") {
      mensagemAssistente.className = "aviso-assistente mensagem-erro";
    } else if (tipo === "sucesso") {
      mensagemAssistente.className = "aviso-assistente mensagem-sucesso";
    } else {
      mensagemAssistente.className = "aviso-assistente";
    }
  }

  async function enviarAoAssistente({ mensagem, imagem }) {
    if (!supabase) {
      exibirMensagemAssistente(
        "Configuração do Supabase ausente. Verifique app/configuracao.js.",
        "erro"
      );
      return;
    }

    // Obtém o token da sessão ativa do usuário
    const { data: sessaoData } = await supabase.auth.getSession();
    const token = sessaoData?.session?.access_token;

    if (!token) {
      exibirMensagemAssistente(
        "Sua sessão expirou (login vencido). Faça login novamente para usar o assistente.",
        "erro"
      );
      return;
    }

    btnEnviarAssistente.disabled = true;
    btnFotoCupom.disabled = true;
    campoAssistente.disabled = true;
    exibirMensagemAssistente("Consultando assistente...", "info");

    const categorias = (window.MEU_BOLSO && window.MEU_BOLSO.CATEGORIAS) || [];

    const bodyPayload = {
      mensagem: mensagem || null,
      imagem: imagem || null,
      mime: imagem ? "image/jpeg" : null,
      categorias: categorias
    };

    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(bodyPayload)
      });

      const dados = await res.json().catch(() => ({}));

      if (!res.ok) {
        const erroMsg = dados?.erro || "Não foi possível obter resposta do assistente.";
        exibirMensagemAssistente(erroMsg, "erro");
        return;
      }

      if (dados.resposta) {
        exibirMensagemAssistente(dados.resposta, "sucesso");
      }

      // Se o gasto foi registrado, atualiza a lista e o total imediatamente
      if (dados.acao === "registrado") {
        carregarDadosDoMes();
        campoAssistente.value = "";
      }
    } catch (err) {
      exibirMensagemAssistente(
        "Falha ao conectar ao assistente. Verifique a internet e tente novamente.",
        "erro"
      );
    } finally {
      btnEnviarAssistente.disabled = false;
      btnFotoCupom.disabled = false;
      campoAssistente.disabled = false;
    }
  }

  btnEnviarAssistente.addEventListener("click", function () {
    const texto = campoAssistente.value.trim();
    if (!texto) {
      exibirMensagemAssistente("Digite uma dúvida ou instrução para o assistente.", "info");
      campoAssistente.focus();
      return;
    }
    enviarAoAssistente({ mensagem: texto });
  });

  campoAssistente.addEventListener("keydown", function (evt) {
    if (evt.key === "Enter") {
      evt.preventDefault();
      btnEnviarAssistente.click();
    }
  });

  btnFotoCupom.addEventListener("click", function () {
    inputFotoCupom.click();
  });

  inputFotoCupom.addEventListener("change", async function (evt) {
    const arquivo = evt.target.files && evt.target.files[0];
    // Limpa o input de arquivo imediatamente (briefing: o app nunca guarda a foto)
    inputFotoCupom.value = "";

    if (!arquivo) return;

    exibirMensagemAssistente("Reduzindo foto para no máximo 1600 px...", "info");

    try {
      const base64Jpeg = await redimensionarImagem(arquivo, 1600);
      const texto = campoAssistente.value.trim();
      await enviarAoAssistente({
        imagem: base64Jpeg,
        mensagem: texto || null
      });
    } catch (err) {
      exibirMensagemAssistente(
        `Erro ao processar imagem: ${err.message || "Tente novamente com outra foto."}`,
        "erro"
      );
    }
  });

  // Event Listeners de Autenticação
  btnEntrar.addEventListener("click", acaoEntrar);
  btnCriarConta.addEventListener("click", acaoCriarConta);
  btnSair.addEventListener("click", acaoSair);

  inputSenha.addEventListener("keydown", function (evt) {
    if (evt.key === "Enter") {
      evt.preventDefault();
      acaoEntrar();
    }
  });

  // Inicialização Geral
  async function inicializar() {
    preencherCategorias();
    gastoData.value = obterDataHoje();

    if (!supabase) {
      exibirMensagem(
        mensagemAuth,
        "Não foi possível conectar ao Supabase. Verifique se o arquivo app/configuracao.js está correto.",
        "erro",
        0
      );
      return;
    }

    try {
      // Verifica se já existe sessão ativa
      const { data, error } = await supabase.auth.getSession();
      if (!error && data && data.session && data.session.user) {
        usuarioAtual = data.session.user;
        alternarParaTelaPrincipal();
      } else {
        alternarParaTelaLogin();
      }

      // Ouve alterações de autenticação
      supabase.auth.onAuthStateChange((evento, sessao) => {
        if (sessao && sessao.user) {
          usuarioAtual = sessao.user;
          if (telaPrincipal.classList.contains("oculto")) {
            alternarParaTelaPrincipal();
          }
        } else {
          usuarioAtual = null;
          if (!telaLogin.classList.contains("oculto")) {
            // já na tela de login
          } else {
            alternarParaTelaLogin();
          }
        }
      });
    } catch (err) {
      console.warn("Erro ao verificar sessão inicial:", err);
      alternarParaTelaLogin();
    }
  }

  // Executa inicialização quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
  } else {
    inicializar();
  }
})();

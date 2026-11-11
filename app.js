/*
 * app.js - tela, geracao do .txt e historico local.
 * Historico e lista em montagem ficam no localStorage deste aparelho;
 * nada e enviado a servidor.
 */
'use strict';

(() => {
  const VERSAO = '1.1.0';
  const CHAVE_HISTORICO = 'pix-para-txt.historico.v1';
  const CHAVE_LISTA = 'pix-para-txt.lista.v1';
  const MAX_HISTORICO = 300;
  const MAX_LISTA = 20;

  const $ = (id) => document.getElementById(id);
  const el = {
    abaNovo: $('aba-novo'), abaHistorico: $('aba-historico'),
    painelNovo: $('painel-novo'), painelHistorico: $('painel-historico'),
    codigo: $('codigo'), descricao: $('descricao'),
    btnColar: $('btn-colar'), btnLimpar: $('btn-limpar'),
    btnAdicionar: $('btn-adicionar'), btnEnviar: $('btn-enviar'),
    mensagem: $('mensagem'), resumo: $('resumo'), resumoCampos: $('resumo-campos'),
    avisoDuplicado: $('aviso-duplicado'),
    blocoLista: $('bloco-lista'), listaEnvio: $('lista-envio'), qtdLista: $('qtd-lista'),
    btnEsvaziar: $('btn-esvaziar'),
    filtro: $('filtro'), lista: $('lista-historico'), vazio: $('historico-vazio'),
    btnApagarTudo: $('btn-apagar-tudo'), qtd: $('qtd-historico'),
    toast: $('toast'), versao: $('versao')
  };

  let atual = null;     // Pix valido no campo, ainda fora da lista (ou null)
  let campoComErro = false;
  let enviando = false;

  // ---------- formatacao ----------

  const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function dataHora(iso) { return fmtData.format(new Date(iso)); }

  function valorTexto(p) {
    if (p.valor) {
      const n = Number(p.valor);
      return Number.isFinite(n) ? fmtMoeda.format(n) : p.valor;
    }
    return p.tipo === 'dinâmico' ? 'definido pelo banco ao pagar' : 'não informado (digitar ao pagar)';
  }

  function valorCurto(p) {
    if (!p.valor) return '';
    const n = Number(p.valor);
    return Number.isFinite(n) ? fmtMoeda.format(n) : '';
  }

  function tipoTexto(p) {
    let t = 'Pix ' + p.tipo + (p.tipo === 'dinâmico' ? ' (uso único)' : '');
    if (p.modalidade) t += ' - ' + p.modalidade;
    return t;
  }

  function semAcento(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function slug(s) {
    return semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function carimbo(d) {
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes());
  }

  // ---------- armazenamento local ----------

  function lerJSON(chave) {
    try {
      const bruto = localStorage.getItem(chave);
      const v = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function gravarJSON(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      avisar('Não foi possível gravar neste aparelho (armazenamento cheio ou bloqueado).');
      return false;
    }
  }

  const lerHistorico = () => lerJSON(CHAVE_HISTORICO);
  const gravarHistorico = (lista) => gravarJSON(CHAVE_HISTORICO, lista.slice(0, MAX_HISTORICO));

  // A lista em montagem fica gravada porque, ao voltar no app do banco e
  // compartilhar o proximo codigo, o Android reabre a pagina do zero.
  // Grava so codigo + descricao; o resto e recalculado ao abrir.
  function lerLista() {
    return lerJSON(CHAVE_LISTA)
      .map((x) => ({ descricao: String(x.descricao || ''), p: Pix.analisar(x.codigo) }))
      .filter((x) => x.p.ok && x.p.crcOk);
  }
  function gravarLista(lista) {
    gravarJSON(CHAVE_LISTA, lista.map((x) => ({ codigo: x.p.codigo, descricao: x.descricao })));
  }

  function buscarNoHistorico(codigo) {
    return lerHistorico().find((h) => h.codigo === codigo) || null;
  }

  function ultimoEnvio(h) {
    return h.envios.length ? h.envios[h.envios.length - 1].em : h.criadoEm;
  }

  // Cada codigo vira (ou atualiza) uma entrada propria, para o aviso de
  // "ja enviado" continuar funcionando mesmo quando foi junto com outros.
  function registrarEnvio(itens, via, arquivo) {
    const hist = lerHistorico();
    const agora = new Date().toISOString();
    for (const { p, descricao } of itens) {
      const envio = { em: agora, via, arquivo, junto: itens.length };
      let h = hist.find((x) => x.codigo === p.codigo);
      if (h) {
        h.envios.push(envio);
        if (descricao) h.descricao = descricao;
      } else {
        hist.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          codigo: p.codigo,
          descricao: descricao || '',
          recebedor: p.recebedor,
          cidade: p.cidade,
          valor: valorTexto(p),
          tipo: tipoTexto(p),
          criadoEm: agora,
          envios: [envio]
        });
      }
    }
    hist.sort((a, b) => ultimoEnvio(b).localeCompare(ultimoEnvio(a)));
    gravarHistorico(hist);
    // Pede ao navegador para nao apagar os dados sozinho quando faltar espaco.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    renderHistorico();
  }

  // ---------- arquivo .txt ----------

  function blocoPix(p, descricao) {
    const linhas = [
      'Descrição : ' + (descricao || '-'),
      'Recebedor : ' + (p.recebedor || '-'),
      'Cidade    : ' + (p.cidade || '-'),
      'Valor     : ' + valorTexto(p),
      'Tipo      : ' + tipoTexto(p)
    ];
    if (p.infoAdicional) linhas.push('Info      : ' + p.infoAdicional);
    return linhas;
  }

  function montarTxt(itens) {
    const gerado = 'Gerado em : ' + fmtData.format(new Date());
    let linhas;

    if (itens.length === 1) {
      const { p, descricao } = itens[0];
      linhas = ['PIX COPIA E COLA', '================', ...blocoPix(p, descricao), gerado, '',
        'Para pagar: clique 3 vezes sobre o código abaixo (ou clique antes do',
        '0 inicial e tecle Ctrl+Shift+End), copie com Ctrl+C e cole no banco',
        'em Pix > Pix Copia e Cola.',
        '',
        p.codigo]; // ultima linha, sem quebra depois, para nao copiar lixo junto
    } else {
      const n = itens.length;
      linhas = ['PIX COPIA E COLA - ' + n + ' códigos', gerado, '',
        'Pague um por vez: clique 3 vezes sobre o código (a linha que começa',
        'com 000201), copie com Ctrl+C e cole no banco em Pix > Pix Copia e Cola.'];
      itens.forEach(({ p, descricao }, i) => {
        linhas.push('', '========================================',
          'PIX ' + (i + 1) + ' DE ' + n,
          '========================================',
          ...blocoPix(p, descricao), '', p.codigo);
      });
      linhas.push('', '======================================== fim');
    }
    // BOM + CRLF: abre certo no Bloco de Notas do Windows.
    return '﻿' + linhas.join('\r\n');
  }

  function nomeArquivo(itens) {
    let base;
    if (itens.length === 1) {
      base = slug(itens[0].descricao) || slug(itens[0].p.recebedor) || 'pix';
    } else {
      base = itens.length + '-codigos';
    }
    return 'pix_' + base + '_' + carimbo(new Date()) + '.txt';
  }

  function baixar(arquivo) {
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Lista + o codigo valido que estiver no campo (sem precisar clicar em
  // Adicionar quando e um Pix so).
  function itensDoEnvio() {
    const itens = lerLista();
    if (atual) itens.push({ p: atual, descricao: el.descricao.value.trim() });
    return itens;
  }

  // Compartilha so o arquivo. O codigo NAO vai no texto da mensagem, senao o
  // WhatsApp volta a transformar em "mensagem Pix" e o Web nao exibe.
  async function compartilhar() {
    const itens = itensDoEnvio();
    if (!itens.length || campoComErro || enviando) return;
    const nome = nomeArquivo(itens);
    const arquivo = new File([montarTxt(itens)], nome, { type: 'text/plain' });
    const qtd = itens.length === 1 ? 'Arquivo' : 'Arquivo com ' + itens.length + ' Pix';

    let via = null;
    enviando = true;
    try {
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: nome });
          via = 'compartilhado';
          avisar(qtd + ' compartilhado e registrado no histórico.');
        } catch (e) {
          if (e && e.name === 'AbortError') {
            avisar('Compartilhamento cancelado. Nada foi registrado e a lista continua aqui.');
          } else {
            baixar(arquivo);
            via = 'baixado';
            avisar('O celular recusou o compartilhamento; o .txt foi baixado.');
          }
        }
      } else {
        baixar(arquivo);
        via = 'baixado';
        avisar('Este navegador não compartilha arquivos; o .txt foi baixado.');
      }
    } finally {
      enviando = false;
    }

    if (via) {
      registrarEnvio(itens, via, nome);
      gravarLista([]);
      el.codigo.value = '';
      el.descricao.value = '';
    }
    atualizarTudo();
  }

  // ---------- tela: novo ----------

  function mostrarMensagem(texto, tipo) {
    el.mensagem.textContent = texto;
    el.mensagem.className = 'mensagem ' + tipo;
    el.mensagem.hidden = !texto;
  }

  function linhaResumo(rotulo, valor) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = rotulo;
    dd.textContent = valor;
    div.append(dt, dd);
    return div;
  }

  function textoJaEnviado(h) {
    const n = h.envios.length;
    return 'já enviado ' + (n === 1 ? 'uma vez' : n + ' vezes') + ', a última em ' + dataHora(ultimoEnvio(h));
  }

  function analisarCampo() {
    const texto = el.codigo.value;
    el.resumo.hidden = true;
    el.avisoDuplicado.hidden = true;
    atual = null;
    campoComErro = false;

    if (!Pix.normalizar(texto)) { mostrarMensagem('', ''); return; }

    const p = Pix.analisar(texto);
    if (!p.ok) { campoComErro = true; mostrarMensagem(p.erro, 'erro'); return; }

    el.resumoCampos.replaceChildren(
      linhaResumo('Recebedor', p.recebedor || '-'),
      linhaResumo('Cidade', p.cidade || '-'),
      linhaResumo('Valor', valorTexto(p)),
      linhaResumo('Tipo', tipoTexto(p)),
      ...(p.chave ? [linhaResumo('Chave', p.chave)] : []),
      ...(p.infoAdicional ? [linhaResumo('Info', p.infoAdicional)] : [])
    );
    el.resumo.hidden = false;

    if (!p.crcOk) {
      campoComErro = true;
      mostrarMensagem('Código com erro: o dígito verificador não confere (informado ' + p.crcInformado +
        ', calculado ' + p.crcCalculado + '). Provavelmente foi copiado pela metade ou alterado. Copie de novo.', 'erro');
      return;
    }

    if (lerLista().some((x) => x.p.codigo === p.codigo)) {
      mostrarMensagem('Este código já está na lista deste arquivo.', 'alerta');
      return; // nao conta de novo
    }

    mostrarMensagem(p.sobrouTexto || Pix.normalizar(texto).indexOf('000201') > 0
      ? 'Código Pix válido. O texto em volta foi ignorado; só o código vai no arquivo.'
      : 'Código Pix válido.', 'ok');

    const anterior = buscarNoHistorico(p.codigo);
    if (anterior) {
      el.avisoDuplicado.textContent = 'Atenção: este código ' + textoJaEnviado(anterior) +
        (anterior.descricao ? ' (' + anterior.descricao + ')' : '') + '.';
      el.avisoDuplicado.hidden = false;
      if (!el.descricao.value && anterior.descricao) el.descricao.value = anterior.descricao;
    }

    atual = p;
  }

  function renderLista() {
    const lista = lerLista();
    el.blocoLista.hidden = lista.length === 0;
    el.qtdLista.textContent = String(lista.length);

    el.listaEnvio.replaceChildren(...lista.map((item, i) => {
      const { p, descricao } = item;
      const li = document.createElement('li');

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);

      const texto = document.createElement('div');
      texto.className = 'texto';
      const titulo = document.createElement('div');
      titulo.className = 'titulo';
      titulo.textContent = descricao || p.recebedor || 'Pix';
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = [descricao ? p.recebedor : '', valorCurto(p) || (p.tipo === 'dinâmico' ? 'valor no banco' : '')]
        .filter(Boolean).join(' · ');
      texto.append(titulo, sub);
      const h = buscarNoHistorico(p.codigo);
      if (h) {
        const ja = document.createElement('div');
        ja.className = 'ja';
        ja.textContent = 'Atenção: ' + textoJaEnviado(h);
        texto.append(ja);
      }

      const rem = document.createElement('button');
      rem.type = 'button';
      rem.className = 'remover';
      rem.textContent = '×';
      rem.setAttribute('aria-label', 'Remover ' + (descricao || p.recebedor || 'Pix') + ' da lista');
      rem.addEventListener('click', () => {
        gravarLista(lerLista().filter((x) => x.p.codigo !== p.codigo));
        atualizarTudo();
      });

      li.append(num, texto, rem);
      return li;
    }));
  }

  function atualizarBotoes() {
    const naLista = lerLista().length;
    const total = naLista + (atual ? 1 : 0);

    el.btnAdicionar.disabled = !atual || naLista >= MAX_LISTA;
    el.btnAdicionar.textContent = naLista >= MAX_LISTA
      ? 'Limite de ' + MAX_LISTA + ' Pix por arquivo'
      : '+ Adicionar à lista e colar outro';

    el.btnEnviar.disabled = total === 0 || campoComErro;
    if (campoComErro && naLista) {
      el.btnEnviar.textContent = 'Corrija ou limpe o código acima';
    } else if (total > 1) {
      el.btnEnviar.textContent = 'Gerar TXT com ' + total + ' Pix e compartilhar';
    } else if (atual && buscarNoHistorico(atual.codigo)) {
      el.btnEnviar.textContent = 'Enviar de novo';
    } else {
      el.btnEnviar.textContent = 'Gerar TXT e compartilhar';
    }
  }

  function atualizarTudo() {
    analisarCampo();
    renderLista();
    atualizarBotoes();
  }

  function adicionarALista() {
    if (!atual) return;
    const lista = lerLista();
    if (lista.length >= MAX_LISTA) return;
    lista.push({ p: atual, descricao: el.descricao.value.trim() });
    gravarLista(lista);
    el.codigo.value = '';
    el.descricao.value = '';
    atualizarTudo();
    avisar('Adicionado (' + lista.length + ' na lista). Cole ou compartilhe o próximo.');
    el.codigo.focus();
  }

  // ---------- tela: historico ----------

  function botao(texto, classe, acao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    if (classe) b.className = classe;
    b.addEventListener('click', acao);
    return b;
  }

  function renderHistorico() {
    const todos = lerHistorico();
    el.qtd.textContent = String(todos.length);
    el.btnApagarTudo.hidden = todos.length === 0;

    const termo = semAcento(el.filtro.value.trim().toLowerCase());
    const lista = termo
      ? todos.filter((h) => semAcento([h.descricao, h.recebedor, h.valor, h.cidade].join(' ').toLowerCase()).includes(termo))
      : todos;

    el.vazio.hidden = lista.length > 0;
    el.vazio.textContent = todos.length ? 'Nada encontrado para essa busca.' : 'Nenhum Pix enviado ainda.';

    el.lista.replaceChildren(...lista.map((h) => {
      const li = document.createElement('li');
      li.className = 'item';

      const topo = document.createElement('div');
      topo.className = 'item-topo';
      const titulo = document.createElement('span');
      titulo.className = 'item-titulo';
      titulo.textContent = h.descricao || h.recebedor || 'Pix';
      const valor = document.createElement('span');
      valor.className = 'item-valor';
      valor.textContent = /^R\$/.test(h.valor) ? h.valor : '';
      topo.append(titulo, valor);

      const info = document.createElement('div');
      info.className = 'item-info';
      info.textContent = [h.descricao ? h.recebedor : '', h.tipo].filter(Boolean).join(' · ');

      const envios = document.createElement('div');
      envios.className = 'item-envios';
      const n = h.envios.length;
      const ult = h.envios[n - 1] || {};
      envios.textContent = 'Enviado em ' + dataHora(ultimoEnvio(h)) +
        (ult.junto > 1 ? ' · junto com outros ' + (ult.junto - 1) : '') +
        (n > 1 ? ' · ' + n + ' envios' : '');

      const codigo = document.createElement('div');
      codigo.className = 'item-codigo';
      codigo.textContent = h.codigo + (ult.arquivo ? '\n\nArquivo: ' + ult.arquivo : '');
      codigo.style.whiteSpace = 'pre-wrap';
      codigo.hidden = true;

      const acoes = document.createElement('div');
      acoes.className = 'item-acoes';
      const btnVer = botao('Ver código', '', () => {
        codigo.hidden = !codigo.hidden;
        btnVer.textContent = codigo.hidden ? 'Ver código' : 'Ocultar';
      });
      acoes.append(
        btnVer,
        botao('Reenviar', '', () => reabrir(h)),
        botao('Excluir', 'excluir', () => excluir(h))
      );

      li.append(topo, info, envios, codigo, acoes);
      return li;
    }));
  }

  function reabrir(h) {
    el.codigo.value = h.codigo;
    el.descricao.value = h.descricao || '';
    trocarAba('novo');
    atualizarTudo();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function excluir(h) {
    const nome = h.descricao || h.recebedor || 'este Pix';
    if (!confirm('Excluir "' + nome + '" do histórico?')) return;
    gravarHistorico(lerHistorico().filter((x) => x.id !== h.id));
    renderHistorico();
    atualizarTudo();
  }

  // ---------- geral ----------

  let temporizador = null;
  function avisar(texto) {
    el.toast.textContent = texto;
    el.toast.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { el.toast.hidden = true; }, 3500);
  }

  function trocarAba(qual) {
    const novo = qual === 'novo';
    el.abaNovo.setAttribute('aria-selected', String(novo));
    el.abaHistorico.setAttribute('aria-selected', String(!novo));
    el.painelNovo.hidden = !novo;
    el.painelHistorico.hidden = novo;
    if (!novo) renderHistorico();
  }

  // Chegou pelo menu "Compartilhar" do Android (share_target do manifest).
  function lerCompartilhamento() {
    const q = new URLSearchParams(location.search);
    const recebido = ['title', 'text', 'url'].map((k) => q.get(k) || '').join(' ').trim();
    if (!recebido) return;
    el.codigo.value = recebido;
    history.replaceState(null, '', location.pathname); // tira o codigo da URL
  }

  el.abaNovo.addEventListener('click', () => trocarAba('novo'));
  el.abaHistorico.addEventListener('click', () => trocarAba('historico'));
  el.codigo.addEventListener('input', atualizarTudo);
  el.filtro.addEventListener('input', renderHistorico);

  el.btnColar.addEventListener('click', async () => {
    try {
      const texto = await navigator.clipboard.readText();
      if (!texto) { avisar('A área de transferência está vazia.'); return; }
      el.codigo.value = texto;
      atualizarTudo();
    } catch (e) {
      avisar('O navegador não liberou a leitura. Toque e segure no campo e escolha Colar.');
      el.codigo.focus();
    }
  });

  el.btnLimpar.addEventListener('click', () => {
    el.codigo.value = '';
    el.descricao.value = '';
    atualizarTudo();
    el.codigo.focus();
  });

  el.btnAdicionar.addEventListener('click', adicionarALista);
  el.btnEnviar.addEventListener('click', compartilhar);

  el.btnEsvaziar.addEventListener('click', () => {
    const n = lerLista().length;
    if (!confirm('Tirar ' + (n === 1 ? 'o Pix' : 'os ' + n + ' Pix') + ' da lista? O histórico não é alterado.')) return;
    gravarLista([]);
    atualizarTudo();
  });

  el.btnApagarTudo.addEventListener('click', () => {
    if (!confirm('Apagar todo o histórico deste celular? Não dá para desfazer.')) return;
    gravarHistorico([]);
    renderHistorico();
    atualizarTudo();
  });

  el.versao.textContent = 'Versão ' + VERSAO;
  lerCompartilhamento();
  renderHistorico();
  atualizarTudo();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

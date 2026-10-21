/* VitalPat Patrimônio · Gestão — navegação, menu e início. */
'use strict';
(function () {
  const VP = window.VP;
  const esc = VP.u.esc;

  // Menu em grupos (sempre abertos). Ícones desenhados para o VitalPat: traço simples, cor do texto.
  const GRUPOS = [
    ['Visão geral', [['painel', 'Painel', 'painel'], ['relatorios', 'Relatórios', 'relatorios']]],
    ['Bens', [['bens/moveis', 'Bens móveis', 'moveis'], ['bens/imoveis', 'Bens imóveis', 'imoveis'], ['frota', 'Frota', 'frota'], ['controle', 'Itens de controle', 'controle']]],
    ['Movimentações', [['entradas', 'Entradas', 'entradas'], ['transferencias', 'Transferências', 'transferencias'], ['baixa-lote', 'Baixa em lote', 'baixa'], ['termos', 'Termos', 'termos']]],
    ['Controle', [['inventario', 'Inventário', 'inventario'], ['manutencao', 'Manutenção', 'manutencao'], ['financeiro/fechamento', 'Financeiro', 'financeiro']]],
    ['Sistema', [['historico', 'Histórico', 'historico'], ['cadastros/unidades', 'Cadastros', 'cadastros'], ['configuracoes', 'Configurações', 'configuracoes'], ['planilhas', 'Exportar e importar', 'planilhas'], ['lixeira', 'Lixeira', 'lixeira']]]
  ];
  const ICONES = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    relatorios: '<path d="M3 21h18"/><rect x="4.5" y="12" width="3.5" height="9" rx="1"/><rect x="10.25" y="5" width="3.5" height="16" rx="1"/><rect x="16" y="9" width="3.5" height="12" rx="1"/>',
    moveis: '<path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    imoveis: '<path d="M3 21h18M5 21V4h9v17M14 9h5v12"/><path d="M8 8h3M8 12h3M8 16h3"/>',
    frota: '<path d="M5 17H3.5v-4.5L5.5 7h13l2 5.5V17H19"/><path d="M3.5 12.5h17M9.5 17h5"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
    controle: '<path d="M3 4h8l10 10-7 7L4 11z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    entradas: '<path d="M12 3v11M7.5 9.5 12 14l4.5-4.5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    transferencias: '<path d="M4 8h15M15 4l4 4-4 4"/><path d="M20 16H5M9 12l-4 4 4 4"/>',
    baixa: '<path d="M9.2 6.4 12.4 3.2l6.4 6.4-3.2 3.2z"/><path d="M12.4 9.6 4.5 17.5"/><path d="M12 21H3"/>',
    termos: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 11h6M8 14h8"/><path d="M8 18c1-1.5 2-1.5 2.3 0 .3 1.2 1.2 1 2.2-.3"/>',
    inventario: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2.5h6V6H9z"/><path d="m9 13 2 2 4-4"/>',
    manutencao: '<path d="M19.8 8.3A4.5 4.5 0 0 1 13.2 12.7L6.2 19.7A1.32 1.32 0 0 1 4.3 17.8L11.3 10.8A4.5 4.5 0 0 1 15.7 4.2L16.2 7.8z"/>',
    financeiro: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
    historico: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4.5l3 2"/>',
    cadastros: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.8" cy="6" r="1.2"/><circle cx="4.8" cy="12" r="1.2"/><circle cx="4.8" cy="18" r="1.2"/>',
    configuracoes: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6"/><path stroke-width="3" stroke-linecap="butt" d="M18 12h2.8M16.24 16.24l2 2M12 18v2.8M7.76 16.24l-2 2M6 12H3.2M7.76 7.76l-2-2M12 6V3.2M16.24 7.76l2-2"/>',
    planilhas: '<path d="M8 20V5M4 9l4-4 4 4"/><path d="M16 4v15M12 15l4 4 4-4"/>',
    pessoas: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14c2.7 0 4.5 2.1 4.5 5"/>',
    lixeira: '<path d="M4 7h16M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    esconder: '<path d="M15 6l-6 6 6 6"/>'
  };
  const icone = (nome) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome]}</svg>`;
  const rotaMenu = { relatorio: 'relatorios', unidade: 'cadastros/unidades', imoveis: 'bens/imoveis' };
  // Qual aba do menu acende: a ficha do bem e o "novo bem" acendem a aba do tipo do bem
  const abaDoTipo = (tipo) => (tipo === 'veiculo' ? 'frota' : ['imovel', 'infraestrutura'].includes(tipo) ? 'bens/imoveis' : 'bens/moveis');

  const lerRota = () => {
    const h = location.hash.replace(/^#/, '') || 'painel';
    const [caminho, qs] = h.split('?');
    const [tela, ...resto] = caminho.split('/');
    return { tela, param: resto.join('/') || undefined, query: Object.fromEntries(new URLSearchParams(qs || '')), caminho };
  };

  VP.app = {
    ir(hash) { if (location.hash === hash) this.render(); else location.hash = hash; },
    async render() {
      const r = lerRota();
      const fn = VP.telas[r.tela] || VP.telas.painel;
      let t;
      try { t = fn(r.param, r.query); }
      catch (e) { console.error(e); t = { titulo: 'Algo deu errado', html: `<p class="aviso-inline">Não foi possível abrir esta tela. Detalhe técnico para o suporte: ${esc(e.message)}</p>` }; }
      document.getElementById('titulo-tela').textContent = t.titulo;
      document.getElementById('acoes-tela').innerHTML = t.acoes || '';
      document.getElementById('conteudo').innerHTML = t.html;
      document.title = `${t.titulo} · VitalPat Patrimônio`;
      let ativo = rotaMenu[r.tela] || r.caminho;
      if (r.tela === 'bem') ativo = abaDoTipo(VP.db.pega('bens', r.param)?.tipo);
      if (r.tela === 'novo-bem') ativo = abaDoTipo(r.param);
      if (r.tela === 'bens' && !r.param) ativo = 'bens/moveis';
      const exato = [...document.querySelectorAll('#menu a')].some((a) => a.dataset.rota === ativo);
      document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('ativo', exato ? a.dataset.rota === ativo : a.dataset.rota.split('/')[0] === ativo.split('/')[0]));
      const n = VP.pendencias().length;
      const selo = document.getElementById('selo-pendencias');
      selo.textContent = n; selo.hidden = !n;
      document.body.classList.remove('menu-aberto');
      window.scrollTo(0, 0);
      if (t.ligar) t.ligar();
    }
  };

  const montarLayout = () => {
    const sv = VP.servidor;
    if (sv.ativo && sv.perfil?.papel === 'admin') { const sistema = GRUPOS[GRUPOS.length - 1][1]; sistema.splice(sistema.length - 1, 0, ['pessoas', 'Pessoas', 'pessoas']); }
    // Faixa que diz se é demonstração ou o sistema de verdade
    const faixa = document.querySelector('.rodape-demo');
    if (sv.ativo) faixa.textContent = `Conectado ao servidor${sv.municipio ? ' · ' + sv.municipio : ''} · ${sv.perfil.nome || sv.perfil.email}`;
    document.getElementById('modo-sistema').textContent = sv.ativo ? (sv.municipio || 'Conectado') : 'Demonstração';
    document.getElementById('menu').innerHTML = GRUPOS.map(([titulo, itens]) => `<div class="grupo-menu"><p class="titulo-grupo">${titulo}</p>${itens.map(([rota, nome, ic]) => `<a href="#${rota}" data-rota="${rota}" data-nome="${nome}"><span class="ic" aria-hidden="true">${icone(ic)}</span><span class="nome">${nome}</span>${rota === 'painel' ? '<b id="selo-pendencias" class="selo-menu" hidden></b>' : ''}</a>`).join('')}</div>`).join('')
      + `<button id="esconder-menu" class="esconder-menu" type="button"><span class="ic" aria-hidden="true">${icone('esconder')}</span><span class="nome">Esconder menu</span></button>`;
    // Menu escondido = só os ícones (o nome aparece ao parar o mouse). Guardado neste navegador.
    const aplicarMenu = (escondido) => {
      document.body.classList.toggle('menu-recolhido', escondido);
      document.querySelectorAll('#menu a').forEach((a) => { if (escondido) a.title = a.dataset.nome; else a.removeAttribute('title'); });
      const b = document.getElementById('esconder-menu');
      b.title = escondido ? 'Mostrar menu' : '';
      b.setAttribute('aria-label', escondido ? 'Mostrar menu' : 'Esconder menu');
      b.querySelector('.nome').textContent = escondido ? 'Mostrar menu' : 'Esconder menu';
    };
    const lerMenu = () => { try { return localStorage.getItem('vitalpat-menu') === 'escondido'; } catch (_) { return false; } };
    aplicarMenu(lerMenu());
    document.getElementById('esconder-menu').addEventListener('click', () => {
      const escondido = !document.body.classList.contains('menu-recolhido');
      try { localStorage.setItem('vitalpat-menu', escondido ? 'escondido' : 'aberto'); } catch (_) { /* vale só nesta visita */ }
      aplicarMenu(escondido);
    });
    document.getElementById('busca-global').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const t = e.target.value.trim();
      if (!t) return;
      VP.estado.filtrosBens = { busca: t };
      e.target.value = '';
      VP.app.ir('#bens');
    });
    // Tema: automático → claro → escuro (guardado neste navegador)
    const NOMES_TEMA = { auto: 'automático', claro: 'claro', escuro: 'escuro' };
    const lerTema = () => { try { return localStorage.getItem('vitalpat-tema') || 'auto'; } catch (_) { return 'auto'; } };
    const aplicarTema = (t) => {
      if (t === 'claro') document.documentElement.dataset.theme = 'light';
      else if (t === 'escuro') document.documentElement.dataset.theme = 'dark';
      else delete document.documentElement.dataset.theme;
      document.getElementById('tema').textContent = 'Tema: ' + NOMES_TEMA[t];
    };
    aplicarTema(lerTema());
    document.getElementById('tema').addEventListener('click', () => {
      const prox = { auto: 'claro', claro: 'escuro', escuro: 'auto' }[lerTema()];
      try { localStorage.setItem('vitalpat-tema', prox); } catch (_) { /* vale só nesta visita */ }
      aplicarTema(prox);
    });
    document.getElementById('abrir-menu').addEventListener('click', () => document.body.classList.toggle('menu-aberto'));
    document.getElementById('sair').addEventListener('click', async () => {
      if (VP.servidor.ativo) await VP.servidor.sair();
      try { localStorage.removeItem('vitalpat-sessao'); } catch (_) { /* nada a fazer */ }
      location.replace('../../index.html?motivo=saiu');
    });
    window.addEventListener('hashchange', () => VP.app.render());
    // Listas simples ganham "Baixar planilha" (também quando uma parte da tela é redesenhada)
    let pendente = false;
    new MutationObserver(() => { if (pendente) return; pendente = true; requestAnimationFrame(() => { pendente = false; VP.ui.planilhaNasTabelasSimples(document.getElementById('conteudo')); }); }).observe(document.getElementById('conteudo'), { childList: true, subtree: true });
  };

  const iniciar = async () => {
    const carregando = document.getElementById('carregando');
    try {
      const n = await VP.db.carregar();
      // Dados de exemplo só na demonstração; com servidor, o sistema começa vazio
      if (!VP.servidor.ativo && (!n || !VP.db.pega('meta', 'semente'))) {
        carregando.querySelector('span').textContent = 'Preparando os dados de exemplo (fictícios)…';
        await VP.db.limparTudo();
        await VP.criarDadosExemplo();
      }
      // Escala de estado de 6 para 8 níveis: converte uma vez só. Quem só consulta vê convertido sem gravar.
      const podeGravar = !VP.servidor.ativo || VP.servidor.podeAlterar();
      const qtd = await VP.converterEscalaEstados({ gravar: podeGravar });
      await VP.corrigirAClassificar({ gravar: podeGravar });
      await VP.classificador.garantirLista({ gravar: podeGravar });
      if (qtd && (qtd.bens || qtd.bensControle) && VP.db.pega('meta', 'escalaEstados')) setTimeout(() => VP.ui.aviso(`Estado de conservação passou para a escala nova (8 níveis): ${VP.u.inteiro(qtd.bens + qtd.bensControle)} registro(s) convertidos. O valor antigo ficou guardado.`), 800);
    } catch (e) {
      carregando.innerHTML = VP.servidor.ativo
        ? `<p>Não foi possível abrir os dados do servidor. Confira a internet e tente de novo.<br><small>${esc(e.message || e)}</small></p><p><a href="../../index.html?motivo=saiu">Voltar ao login</a></p>`
        : `<p>Não foi possível abrir os dados neste navegador. Saia do modo anônimo e tente de novo.<br><small>${esc(e.message || e)}</small></p>`;
      return;
    }
    if (VP.config().minhaResponsabilidadePadrao && !Object.keys(VP.estado.filtrosBens).length) VP.estado.filtrosBens.minha = true;
    carregando.remove();
    montarLayout();
    if (VP.config().depreciacaoAutomatica === 'abrir' && VP.mesesPendentes(VP.Plataforma.hoje().slice(0, 7)).length) {
      const feitos = await VP.fecharMesesPendentes(VP.Plataforma.hoje().slice(0, 7));
      VP.ui.aviso(`Depreciação lançada automaticamente: ${feitos.map((x) => VP.u.mesExtenso(x.mes)).join(', ')}.`);
    }
    // Manutenção preventiva: abre os chamados que chegaram na antecedência (tarefa, não decisão)
    if (VP.manutencao && (!VP.servidor.ativo || VP.servidor.podeAlterar())) {
      try { const n = await VP.manutencao.gerarPreventivas(); if (n.length) VP.ui.aviso(`${n.length} chamado(s) de manutenção preventiva aberto(s).`); } catch (_) { /* tenta de novo na próxima abertura */ }
    }
    await VP.app.render();
    window.VP_PRONTO = true;
  };

  VP.sessao = (() => { try { return JSON.parse(localStorage.getItem('vitalpat-sessao')); } catch (_) { return null; } })();
  if (!window.VP_SEM_ACESSO) iniciar();
})();

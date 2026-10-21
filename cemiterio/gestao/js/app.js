/* VitalPat Cemitério · Gestão — navegação, menu e início. */
'use strict';
(function () {
  const VP = window.VP;
  const esc = VP.u.esc;

  const MENU = [
    ['painel', 'Painel', '◧'], ['mapa', 'Mapa', '▦'], ['tumulos', 'Túmulos', '☰'], ['vistorias', 'Vistorias', '✓'], ['triagem', 'Triagem', '⚑'], ['processos', 'Processos', '⚖'], ['ordens', 'Ordens de serviço', '✎'], ['sepultamentos', 'Sepultamentos', '✝'], ['concessoes', 'Concessões', '§'], ['exumacoes', 'Exumações e ossário', '⌂'], ['vagas', 'Vagas', '▥'], ['importar', 'Importar planilha', '⇩'],
    ['levantamento', 'Localização', '⌖'], ['plaquetas', 'Plaquetas', '#'], ['relatorios', 'Relatórios', '▤'], ['cadastros', 'Cadastros', '☷'],
    ['configuracoes', 'Configurações', '⚙'], ['lixeira', 'Lixeira', '🗑']
  ];
  const rotaMenu = { tumulo: 'tumulos', relatorio: 'relatorios' };

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
      document.title = `${t.titulo} · VitalPat Cemitério`;
      const ativo = rotaMenu[r.tela] || r.tela;
      document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === ativo));
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
    if (sv.ativo && sv.perfil?.papel === 'admin') MENU.splice(MENU.length - 1, 0, ['pessoas', 'Pessoas', '☺']);
    if (sv.ativo && !sv.podeAlterar()) for (let i = MENU.length - 1; i >= 0; i--) if (MENU[i][0] === 'importar') MENU.splice(i, 1);
    // Faixa que diz se é demonstração ou o sistema de verdade
    const faixa = document.querySelector('.rodape-demo');
    if (sv.ativo) faixa.textContent = `Conectado ao servidor${sv.municipio ? ' · ' + sv.municipio : ''} · ${sv.perfil.nome || sv.perfil.email}`;
    document.getElementById('modo-sistema').textContent = sv.ativo ? (sv.municipio || 'Conectado') : 'Demonstração';
    document.getElementById('menu').innerHTML = MENU.map(([rota, nome, ic]) => `<a href="#${rota}" data-rota="${rota}"><span class="ic" aria-hidden="true">${ic}</span><span>${nome}</span>${rota === 'painel' ? '<b id="selo-pendencias" class="selo-menu" hidden></b>' : ''}</a>`).join('');
    document.getElementById('busca-global').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const t = e.target.value.trim();
      if (!t) return;
      e.target.value = '';
      VP.app.ir('#tumulos?busca=' + encodeURIComponent(t));
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
    } catch (e) {
      carregando.innerHTML = VP.servidor.ativo
        ? `<p>Não foi possível abrir os dados do servidor. Confira a internet e tente de novo.<br><small>${esc(e.message || e)}</small></p><p><a href="../../index.html?motivo=saiu">Voltar ao login</a></p>`
        : `<p>Não foi possível abrir os dados neste navegador. Saia do modo anônimo e tente de novo.<br><small>${esc(e.message || e)}</small></p>`;
      return;
    }
    carregando.remove();
    montarLayout();
    await VP.app.render();
    window.VP_PRONTO = true;
  };

  VP.sessao = (() => { try { return JSON.parse(localStorage.getItem('vitalpat-sessao')); } catch (_) { return null; } })();
  if (!window.VP_SEM_ACESSO) iniciar();
})();

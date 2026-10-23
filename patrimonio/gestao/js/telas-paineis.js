/* VitalPat Patrimônio · Gestão — Painel "Imóveis e matrículas" (23/10/2026; escolhas em patrimonio/analise-paineis.md).
   Pergunta que responde: o que temos (matrículas, área, tipos, bairros) e o que falta no cadastro (PDF, texto, coordenada…).
   Filtros no topo (situação, tipo de imóvel, bairro); cada barra leva à lista já filtrada em Cadastros → Matrículas. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, G = VP.graficos;
  const T = VP.telas;
  const qs = (o) => { const t = new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString(); return t ? '?' + t : ''; };
  const rotulo = (lista, v) => (lista.find(([k]) => k === v) || [, v || '(não informado)'])[1];
  const area = (m) => Number(m.areaCartorio ?? m.area) || 0;
  const contar = (lista, f) => { const c = new Map(); for (const x of lista) { const k = f(x) || ''; c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((a, b) => b[1] - a[1]); };
  const lista = (l) => l.filter((x) => !x.excluido);

  // Relatórios → Imóveis: uma entrada só, com abas (pedido do usuário, 23/10/2026)
  const ABAS = [['', 'Painel'], ['demonstrativo', 'Demonstrativo (TCE)'], ['fotos', 'Fotos e mapa']];
  const navImoveis = (aba) => `<nav class="abas" aria-label="Imóveis">${ABAS.map(([k, t]) => `<a href="#painel-imoveis${k ? '/' + k : ''}" class="${k === aba ? 'ativa' : ''}">${t}</a>`).join('')}</nav>
    <p class="ajuda">Documentos vencidos, cessões e pendências de regularização: em <a href="#imoveis">Bens imóveis → Situação</a>.</p>`;
  T['painel-imoveis'] = (aba = '', q = {}) => {
    if (aba === 'demonstrativo' || aba === 'fotos') {
      const t = aba === 'demonstrativo' ? T.relatorio('imoveis', q) : T['relatorio-fotos']('imoveis', q, { semAbas: true });
      return Object.assign({}, t, { titulo: 'Imóveis', html: navImoveis(aba) + t.html });
    }
    const todas = lista(VP.db.lista('matriculas'));
    const sit = q.situacao || '', tipo = q.tipoImovel || '', bairro = q.bairro || '';
    const filtro = { situacao: sit, tipoImovel: tipo, bairro };
    const igual = (v, alvo) => (alvo === '__vazio' ? !String(v || '').trim() : String(v || '').trim() === alvo);
    const ms = todas.filter((m) => (!sit || m.situacao === sit) && (!tipo || igual(m.tipoImovel, tipo)) && (!bairro || igual(m.bairro, bairro)));
    const painel = (mais) => '#painel-imoveis' + qs(Object.assign({}, filtro, mais));
    const cad = (mais) => '#cadastros/matriculas' + qs(Object.assign({}, filtro, mais));
    const bens = lista(VP.db.lista('bens')).filter((b) => b.status !== 'baixado' && (b.tipo === 'imovel' || b.imovel));
    const opc = (f) => [...new Set(todas.map((m) => String(f(m) || '').trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => (v ? [v, v] : ['__vazio', '(não informado)']));

    const filtros = `<div class="painel-filtros" id="filtros-imoveis">
      <label>Situação <select data-pf="situacao"><option value="">Todas</option>${VP.SITUACOES_MATRICULA.map(([k, n]) => `<option value="${k}" ${k === sit ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Tipo de imóvel <select data-pf="tipoImovel"><option value="">Todos</option>${opc((m) => m.tipoImovel).map(([k, n]) => `<option value="${esc(k)}" ${k === tipo ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Bairro <select data-pf="bairro"><option value="">Todos</option>${opc((m) => m.bairro).map(([k, n]) => `<option value="${esc(k)}" ${k === bairro ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      ${sit || tipo || bairro ? '<a class="botao pequeno" href="#painel-imoveis">Limpar filtros</a>' : ''}
      <a class="botao pequeno" href="${esc(cad({}))}">Ver a lista destas matrículas</a>
    </div>`;
    const ativas = ms.filter((m) => m.situacao === 'ativa');
    const areaAtiva = ativas.reduce((s, m) => s + area(m), 0);
    const comCartorio = ativas.filter((m) => m.areaCartorio != null).length;
    const numeros = `<div class="resumo-linha">
      ${G.numero('Matrículas', u.inteiro(ms.length), `${u.inteiro(ativas.length)} ativas`, cad({}))}
      ${G.numero('Área das ativas', `${u.inteiro(areaAtiva / 10000)} ha`, `${u.inteiro(areaAtiva)} m² · área do cartório em ${u.inteiro(comCartorio)} delas`)}
      ${G.numero('Bens imóveis', u.inteiro(bens.length), 'terrenos e prédios no patrimônio', '#bens/imoveis')}
      ${G.numero('Aguardando avaliação', u.inteiro(bens.filter((b) => VP.aguardandoAvaliacao?.(b)).length), 'valor R$ 0 até a avaliação', '#bens?aguardando=1')}
      ${G.numero('Importação a conferir', u.inteiro(bens.filter((b) => b.conferenciaImportacao?.pendente).length), 'ligação matrícula ↔ prédio', '#bens?conferir=1')}
      ${G.numero('Sem centro de custo', u.inteiro(bens.filter((b) => b.centroCustoPendente).length), 'bens sem unidade', '#centros-pendentes')}
    </div>`;
    const barras = (pares, rot, link) => pares.map(([k, n]) => ({ rotulo: rot(k), valor: n, link: link(k), extra: `${u.pct(ms.length ? n / ms.length : 0)} das matrículas do filtro` }));
    const porSit = barras(contar(ms, (m) => m.situacao), (k) => rotulo(VP.SITUACOES_MATRICULA, k), (k) => painel({ situacao: k }));
    const porTipo = barras(contar(ms, (m) => String(m.tipoImovel || '').trim()), (k) => k || '(não informado)', (k) => painel({ tipoImovel: k || '__vazio' }));
    const porBairro = barras(contar(ms, (m) => String(m.bairro || '').trim()), (k) => k || '(não informado)', (k) => painel({ bairro: k || '__vazio' }));
    const porReg = barras(contar(ms, (m) => m.tipoRegistro), (k) => rotulo(VP.TIPOS_REGISTRO_MATRICULA, k), (k) => cad({ tipoRegistro: k }));
    // qualidade do cadastro: quanto falta (cada linha leva à lista do que falta)
    const tem = (f) => ms.filter(f).length;
    const linhaQ = (nome, n, link, explica) => `<tr><td><a href="${esc(link)}">${esc(nome)}</a><br><span class="ajuda">${esc(explica)}</span></td><td style="min-width:160px">${G.medidor(ms.length ? n / ms.length : 0, `${u.inteiro(n)} de ${u.inteiro(ms.length)} (${u.pct(ms.length ? n / ms.length : 0)})`)}</td></tr>`;
    const qualidade = `<div class="tabela-rolagem"><table class="tabela tabela-painel"><thead><tr><th>Informação</th><th>Quantas têm</th></tr></thead><tbody>
      ${linhaQ('PDF da matrícula', tem((m) => m.pdfLinks), cad({ pdf: 'nao' }), 'Link do arquivo no Drive. Clique para ver as que faltam.')}
      ${linhaQ('Texto da matrícula', tem((m) => m.texto), cad({ texto: 'nao' }), 'Permite ler e procurar dentro do sistema.')}
      ${linhaQ('Localização no mapa', tem((m) => m.lat != null && m.lon != null), cad({}), 'Latitude e longitude.')}
      ${linhaQ('Cadastro imobiliário', tem((m) => m.cadastrosImobiliarios), cad({}), 'Número no sistema da prefeitura (IPTU).')}
      ${linhaQ('Área do cartório', tem((m) => m.areaCartorio != null), cad({}), 'A área oficial; sem ela vale a da planilha.')}
      ${linhaQ('Fotos', tem((m) => (m.documentos || []).some((d) => !d.removido && d.tipo === 'Foto')), cad({ fotos: 'nao' }), 'Fotos ligadas por link do Drive.')}
      ${linhaQ('Bem ligado no patrimônio', (() => { const com = new Set(bens.flatMap((b) => String(b.imovel?.matricula || '').split(/\s*;\s*/))); return tem((m) => com.has(String(m.matricula))); })(), cad({ bem: 'nao' }), 'Terreno ou prédio cadastrado como bem.')}
      </tbody></table></div>`;

    const html = navImoveis('') + filtros + numeros + `
      <div class="painel-grade">
        <section class="cartao" id="pi-situacao"><h3>Matrículas por situação</h3>${G.barrasH(porSit, { titulo: 'Matrículas por situação' })}<p class="painel-nota">Clique para filtrar o painel.</p></section>
        <section class="cartao" id="pi-registro"><h3>Tipo de registro no cartório</h3>${G.barrasH(porReg, { titulo: 'Tipo de registro' })}<p class="painel-nota">Transcrição = registro antigo (livro 3). Clique para ver a lista.</p></section>
      </div>
      <div class="painel-grade">
        <section class="cartao" id="pi-tipo"><h3>Por tipo de imóvel</h3>${G.barrasH(porTipo, { titulo: 'Matrículas por tipo de imóvel', limite: 15 })}</section>
        <section class="cartao" id="pi-bairro"><h3>Bairros com mais matrículas</h3>${G.barrasH(porBairro, { titulo: 'Matrículas por bairro', limite: 15 })}<p class="painel-nota">Os 15 primeiros. Escolha outro bairro no filtro acima.</p></section>
      </div>
      <section class="cartao" id="pi-qualidade"><h3>O que falta no cadastro</h3>${qualidade}</section>`;
    return {
      titulo: 'Imóveis', html,
      acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a>',
      ligar() {
        document.querySelectorAll('#filtros-imoveis [data-pf]').forEach((el) => el.addEventListener('change', () => VP.app.ir('#painel-imoveis' + qs(Object.assign({}, filtro, { [el.dataset.pf]: el.value })))));
      }
    };
  };
})();

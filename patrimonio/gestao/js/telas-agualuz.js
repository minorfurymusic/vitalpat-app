/* VitalPat Patrimônio · Gestão — Água e luz (23/10/2026; painel novo em 23/10/2026, ver patrimonio/analise-paineis.md).
   Contratos (matrícula CASAN / unidade CELESC) e faturas vêm do SisPu pela Planilha Unificada (abas "Contratos" e "Faturas").
   Secretarias, tipos de conta e relatórios são CALCULADOS aqui a partir deles (não são copiados da planilha, para não ficarem velhos).
   Cada ligação é ligada ao prédio pelo código (campo "Ligações de água e luz" do imóvel).
   Cores fixas: água = série 1 (azul), luz = série 2 (laranja), em todos os gráficos. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos;
  const T = VP.telas;
  const A = VP.aguaLuz = {};
  const digitos = (s) => String(s ?? '').replace(/\D/g, '');
  const ehLuz = (c) => /CELESC|ENERGIA|LUZ/i.test(`${c.concessionaria || ''} ${c.tipoConta || ''}`);
  const num = (v) => Number(v) || 0;
  // "02/2026" → "2026-02" (para ordenar e comparar meses)
  A.mesISO = (m) => { const x = String(m || '').match(/^(\d{1,2})\/(\d{4})$/); return x ? `${x[2]}-${x[1].padStart(2, '0')}` : String(m || ''); };
  const mesBR = (iso) => (/^\d{4}-\d{2}$/.test(iso) ? `${iso.slice(5)}/${iso.slice(0, 4)}` : iso);
  const mesCurto = (iso) => `${iso.slice(5)}/${iso.slice(2, 4)}`;
  const NOMES = ['Água', 'Luz'];
  // custos que dá para evitar (só os que vêm em R$ na fatura); o "mínimo sem uso" vem em kWh e entra só como contagem
  const EVITAVEIS = [
    ['ultrapassagem', 'Ultrapassagem de demanda', 'Usou mais potência do que a contratada: a CELESC cobra multa. Rever a demanda contratada.'],
    ['demandaSemUso', 'Demanda contratada sem uso', 'Paga por potência contratada que não usa. Dá para pedir a redução da demanda.'],
    ['reativo', 'Energia reativa', 'Equipamentos (motores, lâmpadas antigas) puxando energia que não vira trabalho. Correção com capacitores.']
  ];
  const evitavel = (f) => EVITAVEIS.reduce((t, [k]) => t + num(f[k]), 0);
  A.evitavel = evitavel;

  // prédio (bem) de cada código de ligação, pelo campo "Ligações de água e luz" do imóvel
  A.indicePredios = () => {
    const m = new Map();
    for (const b of VP.db.lista('bens')) {
      for (const parte of String(b.imovel?.ligacoes || '').split(/\s*;\s*/)) { const d = digitos(parte); if (d) m.set(d, b); }
      // bens móveis (ex.: semáforos) guardam a ligação no complemento: "Luz 1.202.585.011-87"
      for (const x of String(b.complemento || '').matchAll(/\b(?:Luz|Água|Agua)\s+([\d][\d.\-]{4,})/gi)) { const d = digitos(x[1]); if (d && !m.has(d)) m.set(d, b); }
    }
    return m;
  };
  A.contratos = () => VP.db.lista('contratosAguaLuz');
  A.faturas = () => VP.db.lista('faturasAguaLuz');
  A.doBem = (b) => { const cods = new Set(String(b.imovel?.ligacoes || '').split(/\s*;\s*/).map(digitos).filter(Boolean)); return A.contratos().filter((c) => cods.has(digitos(c.codigo))); };

  // base comum: tipo de cada fatura (pelo contrato), meses, prédio de cada ligação
  const base = () => {
    const con = A.contratos(), fat = A.faturas();
    const tipoCon = new Map(con.map((c) => [digitos(c.codigo), ehLuz(c) ? 'luz' : 'agua']));
    const tipoF = (f) => tipoCon.get(digitos(f.codigo)) || (ehLuz(f) ? 'luz' : 'agua');
    const meses = [...new Set(fat.map((f) => A.mesISO(f.mes)))].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
    const secretarias = [...new Set(con.map((c) => c.secretaria).concat(fat.map((f) => f.secretaria)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { con, fat, tipoF, meses, secretarias, idx: A.indicePredios() };
  };
  // ligações ativas sem fatura nos 3 últimos meses do período (mesma regra do SisPu)
  const semFaturaRecente = (bs) => {
    const ult3 = new Set(bs.meses.slice(-3));
    const com = new Set(bs.fat.filter((f) => ult3.has(A.mesISO(f.mes))).map((f) => digitos(f.codigo)));
    return bs.meses.length ? bs.con.filter((c) => /^ativ/i.test(c.situacao || '') && !com.has(digitos(c.codigo))) : [];
  };
  // resumo por ligação (nas faturas dadas)
  const porLigacao = (bs, fat) => {
    const m = new Map();
    for (const f of fat) {
      const k = digitos(f.codigo);
      const x = m.get(k) || { codigo: f.codigo, tipo: bs.tipoF(f), total: 0, n: 0, evitavel: 0, minimoSemUso: 0, consumo: 0, ultimo: '' };
      x.total += num(f.valor); x.n++; x.evitavel += evitavel(f); x.consumo += num(f.consumo); if (num(f.minimoSemUso) > 0) x.minimoSemUso++;
      if (A.mesISO(f.mes) > x.ultimo) x.ultimo = A.mesISO(f.mes);
      m.set(k, x);
    }
    return m;
  };
  const nomeLigacao = (bs, c) => { const b = bs.idx.get(digitos(c.codigo)); return b ? b.descricao : (c.edificio || c.unidadeGestora || c.nomeFatura || c.codigo); };
  const linkLigacao = (bs, c) => { const b = bs.idx.get(digitos(c.codigo)); return b ? `#bem/${b.id}` : `#agualuz/ligacoes?busca=${encodeURIComponent(c.codigo)}`; };

  const ABAS = [['painel', 'Painel'], ['ligacoes', 'Ligações (contratos)'], ['faturas', 'Faturas']];
  const navAbas = (aba) => `<nav class="abas" aria-label="Água e luz">${ABAS.map(([k, t]) => `<a href="#agualuz/${k}" class="${k === aba ? 'ativa' : ''}">${t}</a>`).join('')}</nav>`;
  const qs = (o) => { const t = new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString(); return t ? '?' + t : ''; };
  const pontoTipo = (t) => `<span class="legenda-ponto"><i class="serie-${t === 'luz' ? 2 : 1}"></i>${t === 'luz' ? 'Luz' : 'Água'}</span>`;

  // ------------------------------------------------------------------ painel
  const telaPainel = (bs, q) => {
    const de = bs.meses.includes(q.de) ? q.de : bs.meses[0], ate = bs.meses.includes(q.ate) ? q.ate : bs.meses.at(-1);
    const tipo = ['agua', 'luz'].includes(q.tipo) ? q.tipo : '', sec = q.sec || '';
    const filtro = { de, ate, tipo, sec };
    const enderecoPainel = (v) => '#agualuz/painel' + qs({ de: v.de === bs.meses[0] ? '' : v.de, ate: v.ate === bs.meses.at(-1) ? '' : v.ate, tipo: v.tipo, sec: v.sec });
    const fat = bs.fat.filter((f) => { const m = A.mesISO(f.mes); return m >= de && m <= ate && (!tipo || bs.tipoF(f) === tipo) && (!sec || f.secretaria === sec); });
    const mesesSel = bs.meses.filter((m) => m >= de && m <= ate);
    const soma = (l, t) => l.filter((f) => !t || bs.tipoF(f) === t).reduce((s, f) => s + num(f.valor), 0);
    const total = soma(fat), agua = soma(fat, 'agua'), luz = soma(fat, 'luz');
    const evit = fat.reduce((s, f) => s + evitavel(f), 0);
    const conSel = bs.con.filter((c) => (!tipo || (ehLuz(c) ? 'luz' : 'agua') === tipo) && (!sec || c.secretaria === sec));
    const ativos = conSel.filter((c) => /^ativ/i.test(c.situacao || '')).length;
    const lig = porLigacao(bs, fat);
    const conPorCod = new Map(bs.con.map((c) => [digitos(c.codigo), c]));
    const filtrado = tipo || sec || de !== bs.meses[0] || ate !== bs.meses.at(-1);

    const filtros = `<div class="painel-filtros" id="filtros-agualuz">
      <label>De <select data-pf="de">${bs.meses.map((m) => `<option value="${m}" ${m === de ? 'selected' : ''}>${mesBR(m)}</option>`).join('')}</select></label>
      <label>Até <select data-pf="ate">${bs.meses.map((m) => `<option value="${m}" ${m === ate ? 'selected' : ''}>${mesBR(m)}</option>`).join('')}</select></label>
      <label>Água ou luz <select data-pf="tipo"><option value="">Água e luz</option><option value="agua" ${tipo === 'agua' ? 'selected' : ''}>Só água</option><option value="luz" ${tipo === 'luz' ? 'selected' : ''}>Só luz</option></select></label>
      <label>Secretaria <select data-pf="sec"><option value="">Todas</option>${bs.secretarias.map((s) => `<option value="${esc(s)}" ${s === sec ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      ${filtrado ? '<a class="botao pequeno" href="#agualuz/painel">Limpar filtros</a>' : ''}
    </div>`;
    const numeros = `<div class="resumo-linha">
      ${G.numero('Gasto no período', u.moedaCurta(total), `${mesBR(de)} a ${mesBR(ate)} · ${u.moeda(total)}`)}
      ${!tipo || tipo === 'agua' ? G.numero('Água (CASAN)', u.moedaCurta(agua), u.moeda(agua)) : ''}
      ${!tipo || tipo === 'luz' ? G.numero('Luz (CELESC)', u.moedaCurta(luz), u.moeda(luz)) : ''}
      ${G.numero('Média por mês', u.moedaCurta(mesesSel.length ? total / mesesSel.length : 0), `${mesesSel.length} mês(es)`)}
      ${G.numero('Custo que dá para evitar', u.moedaCurta(evit), `${u.pct(total ? evit / total : 0)} do gasto · ver ligações`, '#agualuz/ligacoes?evitavel=1')}
      ${G.numero('Ligações ativas', u.inteiro(ativos), `${u.inteiro(conSel.length)} no total`, '#agualuz/ligacoes')}
    </div>`;
    // gasto por mês (água + luz empilhados); clicar no mês abre as faturas daquele mês
    const porMes = mesesSel.map((m) => { const fm = fat.filter((f) => A.mesISO(f.mes) === m); return { rotulo: mesCurto(m), partes: [soma(fm, 'agua'), soma(fm, 'luz')], link: '#agualuz/faturas' + qs({ mes: mesBR(m), sec }) }; });
    // por secretaria (clicar filtra o painel)
    const secs = new Map();
    for (const f of fat) { const s = f.secretaria || '(sem secretaria)'; const x = secs.get(s) || [0, 0]; x[bs.tipoF(f) === 'luz' ? 1 : 0] += num(f.valor); secs.set(s, x); }
    const porSec = [...secs].map(([s, p]) => ({ rotulo: s, partes: p, link: enderecoPainel(Object.assign({}, filtro, { sec: s === '(sem secretaria)' ? '' : s })) })).sort((a, b) => (b.partes[0] + b.partes[1]) - (a.partes[0] + a.partes[1]));
    // 10 ligações mais caras (cor = água ou luz)
    const maiores = [...lig.values()].sort((a, b) => b.total - a.total).slice(0, 10);
    const top = maiores.map((x) => { const c = conPorCod.get(digitos(x.codigo)) || { codigo: x.codigo }; return { rotulo: `${nomeLigacao(bs, c)} (${x.codigo})`, partes: x.tipo === 'luz' ? [0, x.total] : [x.total, 0], link: linkLigacao(bs, c) }; });
    const partTop = total ? maiores.reduce((s, x) => s + x.total, 0) / total : 0;
    // custos evitáveis
    const linhasEvit = EVITAVEIS.map(([k, nome, explica]) => { const fs = fat.filter((f) => num(f[k]) > 0); return { k, nome, explica, valor: fs.reduce((s, f) => s + num(f[k]), 0), n: fs.length, ligs: new Set(fs.map((f) => digitos(f.codigo))).size }; });
    const minimo = fat.filter((f) => num(f.minimoSemUso) > 0);
    // grupo da tarifa (só luz)
    const grupos = new Map();
    for (const f of fat.filter((x) => bs.tipoF(x) === 'luz')) { const g = f.grupo || '(sem grupo)'; const x = grupos.get(g) || { valor: 0, ligs: new Set() }; x.valor += num(f.valor); x.ligs.add(digitos(f.codigo)); grupos.set(g, x); }
    const explicaGrupo = { A4: 'alta tensão (prédio grande, paga demanda)', B3: 'baixa tensão (prédio comum)', B4A: 'iluminação pública' };
    // consumo (unidades diferentes → um gráfico para cada, nunca dois eixos)
    const consumoMes = (t) => mesesSel.map((m) => ({ rotulo: mesCurto(m), valor: fat.filter((f) => A.mesISO(f.mes) === m && bs.tipoF(f) === t).reduce((s, f) => s + num(f.consumo), 0) }));
    const semFat = semFaturaRecente(bs).filter((c) => (!tipo || (ehLuz(c) ? 'luz' : 'agua') === tipo) && (!sec || c.secretaria === sec));
    const semPredio = conSel.filter((c) => !bs.idx.has(digitos(c.codigo)));
    const soParte = (lista) => (tipo ? lista.map((x) => Object.assign({}, x, { partes: tipo === 'agua' ? [x.partes[0], 0] : [0, x.partes[1]] })) : lista);

    const html = navAbas('painel') + filtros + numeros + `
      <section class="cartao" id="al-graf-mes"><h3>Gasto por mês${sec ? ' · ' + esc(sec) : ''}</h3>${G.colunasEmpilhadas(soParte(porMes), NOMES, { formato: u.moeda, formatoEixo: u.moedaCurta, titulo: 'Gasto de água e luz por mês' })}
        <p class="painel-nota">Passe o mouse para ver os valores. Clique num mês para ver as faturas dele.</p></section>
      <div class="painel-grade">
        <section class="cartao" id="al-graf-sec"><h3>Por secretaria</h3>${G.barrasEmpilhadas(porSec, NOMES, { formato: u.moeda, titulo: 'Gasto por secretaria' })}<p class="painel-nota">Clique numa secretaria para ver o painel só dela.</p></section>
        <section class="cartao" id="al-graf-top"><h3>As 10 ligações mais caras</h3>${G.barrasEmpilhadas(top, NOMES, { formato: u.moeda, titulo: 'Ligações mais caras', limite: 10 })}<p class="painel-nota">Juntas, são ${esc(u.pct(partTop))} de todo o gasto do filtro. Clique para abrir o prédio.</p></section>
      </div>
      <div class="painel-grade">
        <section class="cartao" id="al-evitavel"><h3>Custo que dá para evitar (luz)</h3>
          <div class="tabela-rolagem"><table class="tabela tabela-painel"><thead><tr><th>O que é</th><th class="num">Valor</th><th class="num">Faturas</th><th class="num">Ligações</th></tr></thead><tbody>
          ${linhasEvit.map((x) => `<tr><td>${x.valor > 0 ? '<span class="selo-alerta">Rever</span> ' : ''}<a href="#agualuz/ligacoes?evitavel=${x.k}">${esc(x.nome)}</a><br><span class="ajuda">${esc(x.explica)}</span></td><td class="num">${u.moeda(x.valor)}</td><td class="num">${u.inteiro(x.n)}</td><td class="num">${u.inteiro(x.ligs)}</td></tr>`).join('')}
          <tr><td>${minimo.length ? '<span class="selo-atencao">Olhar</span> ' : ''}<a href="#agualuz/faturas?minimo=1">Mínimo cobrado sem uso</a><br><span class="ajuda">Ligação que pagou a taxa mínima sem consumir: pode estar desligada e ainda contratada.</span></td><td class="num">—</td><td class="num">${u.inteiro(minimo.length)}</td><td class="num">${u.inteiro(new Set(minimo.map((f) => digitos(f.codigo))).size)}</td></tr>
          </tbody></table></div></section>
        <section class="cartao"><h3>Luz por tipo de ligação (grupo da tarifa)</h3>${G.barrasH([...grupos].sort((a, b) => b[1].valor - a[1].valor).map(([g, x]) => ({ rotulo: `${g}${explicaGrupo[g] ? ' · ' + explicaGrupo[g] : ''}`, valor: x.valor, extra: `${x.ligs.size} ligação(ões) · ${u.pct(luz ? x.valor / luz : 0)} da luz`, cor: 'var(--serie-2)', link: '#agualuz/faturas' + qs({ grupo: g }) })), { formato: u.moeda, titulo: 'Luz por grupo da tarifa' })}
          <p class="painel-nota">Passe o mouse para ver quantas ligações e a parte de cada grupo na conta de luz.</p></section>
      </div>
      <div class="painel-grade">
        ${!tipo || tipo === 'luz' ? `<section class="cartao"><h3>Consumo de luz (kWh)</h3><div class="serie-luz">${G.colunas(consumoMes('luz'), { formato: (v) => u.inteiro(v) + ' kWh', formatoEixo: (v) => u.inteiro(v), titulo: 'Consumo de luz por mês' })}</div></section>` : ''}
        ${!tipo || tipo === 'agua' ? `<section class="cartao"><h3>Consumo de água (m³)</h3>${G.colunas(consumoMes('agua'), { formato: (v) => u.inteiro(v) + ' m³', formatoEixo: (v) => u.inteiro(v), titulo: 'Consumo de água por mês' })}</section>` : ''}
      </div>
      <section class="cartao"><h3>O que olhar</h3><ul class="lista-simples">
        <li><a href="#agualuz/ligacoes?semFatura=1">${u.inteiro(semFat.length)} ligação(ões) ativa(s) sem fatura nos 3 últimos meses</a> (pode ser ligação desligada que ainda consta como ativa)</li>
        <li><a href="#agualuz/ligacoes?semPredio=1">${u.inteiro(semPredio.length)} ligação(ões) sem bem ligado no patrimônio</a> (ligue o código no campo "Ligações de água e luz" do imóvel)</li></ul></section>`;
    return {
      titulo: 'Água e luz', html,
      ligar() {
        document.querySelectorAll('#filtros-agualuz [data-pf]').forEach((el) => el.addEventListener('change', () => {
          const v = Object.assign({}, filtro, { [el.dataset.pf]: el.value });
          if (v.de > v.ate) { if (el.dataset.pf === 'de') v.ate = v.de; else v.de = v.ate; }
          VP.app.ir(enderecoPainel(v));
        }));
      }
    };
  };

  // ------------------------------------------------------------------ ligações (contratos) e faturas: lista com busca e filtros
  const valoresLig = {}, valoresFat = {}; // ficam ao sair e voltar
  const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const lista = ({ id, linhas, defs, valores, colunas, placeholder, nomePlanilha, resumo, vazio }) => {
    const filtrar = () => {
      const f = ui.limparValores(valores);
      const termos = f.busca ? semAcento(f.busca).split(/\s+/).filter(Boolean) : [];
      return linhas.filter((x) => defs.every((d) => f[d.chave] === undefined || f[d.chave] === false || d.teste(x, f[d.chave]))
        && (!termos.length || ((t) => termos.every((p) => t.includes(p)))(semAcento(colunas.map((c) => (c.valor ? c.valor(x) : x[c.chave])).join(' ')))));
    };
    const desenhar = () => { const l = filtrar(); return `<div class="linha-filtros">${ui.filtros({ id, defs, valores, placeholder, aoMudar: (_v, origem) => atualizar(origem) })}</div>${resumo(l)}${ui.tabela({ id: id + '-tab', colunas, linhas: l, nomePlanilha, vazio })}`; };
    const atualizar = (origem) => {
      const area = document.getElementById('area-' + id); if (!area) return;
      const foco = origem === 'busca' ? document.activeElement?.selectionStart : null;
      area.innerHTML = desenhar(); ui.ligarTabela(id + '-tab');
      if (origem === 'busca') { const b = area.querySelector('.busca'); b.focus(); if (foco != null) b.setSelectionRange(foco, foco); }
    };
    return { html: `<div id="area-${id}">${desenhar()}</div>`, ligar: () => ui.ligarTabela(id + '-tab') };
  };
  const opcoesDe = (l, f) => [...new Set(l.map(f).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true })).map((v) => [v, v]);
  // filtro vindo de um link (Relatórios, painel) substitui os filtros anteriores daquela lista
  const doLink = (valores, q, mapa) => {
    const novos = Object.entries(mapa).filter(([k]) => q[k]).map(([k, f]) => f(q[k]));
    if (!novos.length) return;
    for (const k of Object.keys(valores)) delete valores[k];
    for (const n of novos) Object.assign(valores, n);
  };

  const telaLigacoes = (bs, q) => {
    const lig = porLigacao(bs, bs.fat);
    const semFat = new Set(semFaturaRecente(bs).map((c) => digitos(c.codigo)));
    const vazio = { total: 0, n: 0, evitavel: 0, minimoSemUso: 0, ultimo: '' };
    const evitPorTipo = new Map();
    for (const f of bs.fat) for (const [k] of EVITAVEIS) if (num(f[k]) > 0) { const d = digitos(f.codigo); const s = evitPorTipo.get(d) || new Set(); s.add(k); evitPorTipo.set(d, s); }
    const linhas = bs.con.map((c) => Object.assign({}, c, { _tipo: ehLuz(c) ? 'luz' : 'agua', _r: lig.get(digitos(c.codigo)) || vazio, _bem: bs.idx.get(digitos(c.codigo)), _semFat: semFat.has(digitos(c.codigo)), _evitTipos: evitPorTipo.get(digitos(c.codigo)) || new Set() }));
    doLink(valoresLig, q, { semPredio: () => ({ bem: 'nao' }), semFatura: () => ({ semFatura: true }), evitavel: (v) => ({ evitavel: v === '1' ? 'qualquer' : v }), sec: (v) => ({ secretaria: v }), busca: (v) => ({ busca: v }) });
    const defs = [
      { chave: 'tipo', rotulo: 'Água ou luz', tipo: 'select', opcoes: [['agua', 'Água'], ['luz', 'Luz']], teste: (x, v) => x._tipo === v },
      { chave: 'secretaria', rotulo: 'Secretaria', tipo: 'select', opcoes: opcoesDe(linhas, (x) => x.secretaria), teste: (x, v) => x.secretaria === v },
      { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: opcoesDe(linhas, (x) => x.situacao), teste: (x, v) => x.situacao === v },
      { chave: 'bem', rotulo: 'Prédio ligado', tipo: 'select', opcoes: [['sim', 'Com prédio ligado'], ['nao', 'Sem prédio ligado']], teste: (x, v) => !!x._bem === (v === 'sim') },
      { chave: 'evitavel', rotulo: 'Custo que dá para evitar', tipo: 'select', opcoes: [['qualquer', 'Qualquer um']].concat(EVITAVEIS.map(([k, n]) => [k, n])), teste: (x, v) => (v === 'qualquer' ? x._evitTipos.size > 0 : x._evitTipos.has(v)) },
      { chave: 'semFatura', rotulo: 'Ativa sem fatura nos 3 últimos meses', tipo: 'bool', teste: (x) => x._semFat }
    ];
    const l = lista({ id: 'al-lig', linhas, defs, valores: valoresLig, nomePlanilha: 'ligacoes-agua-luz', vazio: 'Nenhuma ligação com estes filtros.',
      placeholder: 'Buscar por código, prédio, endereço, secretaria…',
      resumo: (f) => `<p class="ajuda">${u.inteiro(f.length)} ligação(ões) · gasto nas faturas importadas: <b>${u.moeda(f.reduce((s, x) => s + x._r.total, 0))}</b> · custo que dá para evitar: <b>${u.moeda(f.reduce((s, x) => s + x._r.evitavel, 0))}</b></p>`,
      colunas: [
        { chave: '_tipo', titulo: 'Tipo', valor: (x) => (x._tipo === 'luz' ? 'Luz' : 'Água'), html: (x) => pontoTipo(x._tipo) },
        { chave: 'codigo', titulo: 'Matrícula / UC' },
        { chave: 'predio', titulo: 'Prédio ou local', valor: (x) => (x._bem ? x._bem.descricao : x.edificio || x.unidadeGestora || ''), html: (x) => (x._bem ? `<a href="#bem/${esc(x._bem.id)}">${esc(x._bem.descricao)}</a>` : `${esc(x.edificio || x.unidadeGestora || '')} <span class="ajuda">(sem bem ligado)</span>`) },
        { chave: 'secretaria', titulo: 'Secretaria' }, { chave: 'endereco', titulo: 'Endereço' },
        { chave: 'situacao', titulo: 'Situação', html: (x) => `${esc(x.situacao || '')}${x._semFat ? ' <span class="selo-atencao">sem fatura recente</span>' : ''}` },
        { chave: 'ultimo', titulo: 'Última fatura', valor: (x) => mesBR(x._r.ultimo), ordenar: (x) => x._r.ultimo },
        { chave: 'total', titulo: 'Gasto (faturas importadas)', num: true, valor: (x) => x._r.total, html: (x) => u.moeda(x._r.total) },
        { chave: 'evit', titulo: 'Dá para evitar', num: true, valor: (x) => x._r.evitavel, html: (x) => (x._r.evitavel ? `<b>${u.moeda(x._r.evitavel)}</b>` : '—') }] });
    return { titulo: 'Água e luz', html: navAbas('ligacoes') + l.html, ligar: l.ligar };
  };

  const telaFaturas = (bs, q) => {
    const linhas = bs.fat.map((f) => Object.assign({}, f, { _tipo: bs.tipoF(f), _mes: A.mesISO(f.mes), _evit: evitavel(f), _local: bs.idx.get(digitos(f.codigo))?.descricao || f.edificio || f.unidadeGestora || '' })).sort((a, b) => b._mes.localeCompare(a._mes) || num(b.valor) - num(a.valor));
    doLink(valoresFat, q, { mes: (v) => ({ mes: v }), sec: (v) => ({ secretaria: v }), minimo: () => ({ minimo: true }), grupo: (v) => ({ grupo: v }) });
    const defs = [
      { chave: 'mes', rotulo: 'Mês', tipo: 'select', opcoes: bs.meses.slice().reverse().map((m) => [mesBR(m), mesBR(m)]), teste: (x, v) => x._mes === A.mesISO(v) },
      { chave: 'tipo', rotulo: 'Água ou luz', tipo: 'select', opcoes: [['agua', 'Água'], ['luz', 'Luz']], teste: (x, v) => x._tipo === v },
      { chave: 'secretaria', rotulo: 'Secretaria', tipo: 'select', opcoes: opcoesDe(linhas, (x) => x.secretaria), teste: (x, v) => x.secretaria === v },
      { chave: 'grupo', rotulo: 'Grupo da tarifa (luz)', tipo: 'select', opcoes: opcoesDe(linhas, (x) => x.grupo), teste: (x, v) => x.grupo === v },
      { chave: 'evitavel', rotulo: 'Com custo que dá para evitar', tipo: 'bool', teste: (x) => x._evit > 0 },
      { chave: 'minimo', rotulo: 'Mínimo cobrado sem uso', tipo: 'bool', teste: (x) => num(x.minimoSemUso) > 0 }
    ];
    const l = lista({ id: 'al-fat', linhas, defs, valores: valoresFat, nomePlanilha: 'faturas-agua-luz', vazio: 'Nenhuma fatura com estes filtros.',
      placeholder: 'Buscar por código, prédio, secretaria…',
      resumo: (f) => { const s = (t) => f.filter((x) => x._tipo === t).reduce((a, x) => a + num(x.valor), 0); return `<p class="ajuda">${u.inteiro(f.length)} fatura(s) · água <b>${u.moeda(s('agua'))}</b> · luz <b>${u.moeda(s('luz'))}</b> · total <b>${u.moeda(s('agua') + s('luz'))}</b></p>`; },
      colunas: [
        { chave: 'mes', titulo: 'Mês', ordenar: (x) => x._mes },
        { chave: '_tipo', titulo: 'Tipo', valor: (x) => (x._tipo === 'luz' ? 'Luz' : 'Água'), html: (x) => pontoTipo(x._tipo) },
        { chave: 'codigo', titulo: 'Matrícula / UC' },
        { chave: '_local', titulo: 'Prédio ou local' },
        { chave: 'secretaria', titulo: 'Secretaria' },
        { chave: 'consumo', titulo: 'Consumo', num: true, valor: (x) => num(x.consumo), html: (x) => `${u.inteiro(num(x.consumo))} ${x._tipo === 'luz' ? 'kWh' : 'm³'}` },
        { chave: 'valor', titulo: 'Valor', num: true, valor: (x) => num(x.valor), html: (x) => u.moeda(num(x.valor)) },
        { chave: 'evit', titulo: 'Dá para evitar', num: true, valor: (x) => x._evit, html: (x) => (x._evit ? `<b>${u.moeda(x._evit)}</b>` : '—') }] });
    return { titulo: 'Água e luz', html: navAbas('faturas') + l.html, ligar: l.ligar };
  };

  T.agualuz = (aba = 'painel', query = {}) => {
    if (aba === 'resumo') aba = 'painel'; // endereços antigos
    if (aba === 'contratos') aba = 'ligacoes';
    if (!A.contratos().length && !A.faturas().length) {
      return { titulo: 'Água e luz', html: navAbas(aba) + '<p class="aviso-inline">Ainda não há contratos nem faturas. Em <a href="#cadastros/unidades">Cadastros</a>, use <b>Importar planilha unificada</b> com as abas <b>Contratos</b> e <b>Faturas</b> exportadas do SisPu.</p>' };
    }
    const bs = base();
    if (aba === 'ligacoes') return telaLigacoes(bs, query);
    if (aba === 'faturas') return telaFaturas(bs, query);
    return telaPainel(bs, query);
  };

  // cartão "Água e luz" na ficha do prédio: cada ligação, a última fatura e os valores mês a mês
  A.cartaoDoBem = (b) => {
    const cs = A.doBem(b);
    const cab = '<header><h3>Água e luz (CASAN e CELESC)</h3></header>';
    if (!cs.length) return b.tipo === 'imovel' ? `<section class="cartao secao" id="sec-agualuz">${cab}<p class="ajuda">Nenhuma ligação de água ou luz ligada a este bem. Para ligar, informe o código (matrícula CASAN ou unidade CELESC) em Editar → "Ligações de água e luz".</p></section>` : '';
    const fat = A.faturas();
    let totA = 0, totL = 0;
    const linhas = cs.map((c) => {
      const fs = fat.filter((f) => digitos(f.codigo) === digitos(c.codigo)).sort((x, y) => A.mesISO(y.mes).localeCompare(A.mesISO(x.mes)));
      const tot = fs.reduce((t, f) => t + num(f.valor), 0);
      if (ehLuz(c)) totL += tot; else totA += tot;
      const ult = fs[0];
      return `<tr><td>${ehLuz(c) ? 'Luz' : 'Água'}</td><td>${esc(c.codigo)}</td><td>${esc(c.concessionaria || '')}</td><td>${esc(c.situacao || '')}</td><td>${ult ? `${esc(ult.mes)}: ${u.moeda(num(ult.valor))}${ult.consumo != null && ult.consumo !== '' ? ` (${esc(ult.consumo)} ${ehLuz(c) ? 'kWh' : 'm³'})` : ''}` : '<span class="vazio">sem fatura</span>'}</td><td class="num">${u.moeda(tot)}</td><td class="num">${fs.length}</td></tr>
        ${fs.length ? `<tr><td colspan="7"><details><summary>Faturas mês a mês</summary><ul class="lista-simples">${fs.map((f) => `<li>${esc(f.mes)}: ${u.moeda(num(f.valor))}${f.consumo != null && f.consumo !== '' ? ` · ${esc(f.consumo)} ${ehLuz(c) ? 'kWh' : 'm³'}` : ''}${evitavel(f) ? ` · <b>dá para evitar ${u.moeda(evitavel(f))}</b>` : ''}</li>`).join('')}</ul></details></td></tr>` : ''}`;
    }).join('');
    return `<section class="cartao secao" id="sec-agualuz">${cab}
      <p>Água: <b>${u.moeda(totA)}</b> · Luz: <b>${u.moeda(totL)}</b> <span class="ajuda">(soma das faturas importadas)</span> · <a href="#agualuz/ligacoes">ver tudo em Água e luz</a></p>
      <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Tipo</th><th>Matrícula / UC</th><th>Concessionária</th><th>Situação</th><th>Última fatura</th><th class="num">Total</th><th class="num">Faturas</th></tr></thead><tbody>${linhas}</tbody></table></div></section>`;
  };
})();

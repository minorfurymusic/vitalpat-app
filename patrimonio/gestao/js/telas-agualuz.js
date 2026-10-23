/* VitalPat Patrimônio · Gestão — Água e luz (23/10/2026).
   Contratos (matrícula CASAN / unidade CELESC) e faturas vêm do SisPu pela Planilha Unificada (abas "Contratos" e "Faturas").
   Secretarias, tipos de conta e relatórios são CALCULADOS aqui a partir deles (não são copiados da planilha, para não ficarem velhos).
   Cada ligação é ligada ao prédio pelo código (campo "Ligações de água e luz" do imóvel). */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui;
  const T = VP.telas;
  const A = VP.aguaLuz = {};
  const digitos = (s) => String(s ?? '').replace(/\D/g, '');
  const ehLuz = (c) => /CELESC|ENERGIA|LUZ/i.test(`${c.concessionaria || ''} ${c.tipoConta || ''}`);
  // "02/2026" → "2026-02" (para ordenar e comparar meses)
  A.mesISO = (m) => { const x = String(m || '').match(/^(\d{1,2})\/(\d{4})$/); return x ? `${x[2]}-${x[1].padStart(2, '0')}` : String(m || ''); };
  const mesBR = (iso) => (/^\d{4}-\d{2}$/.test(iso) ? `${iso.slice(5)}/${iso.slice(0, 4)}` : iso);

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

  const resumo = () => {
    const fat = A.faturas(), con = A.contratos();
    const meses = [...new Set(fat.map((f) => A.mesISO(f.mes)))].sort();
    const tipo = new Map(con.map((c) => [digitos(c.codigo), ehLuz(c) ? 'luz' : 'agua']));
    const tipoF = (f) => tipo.get(digitos(f.codigo)) || (ehLuz(f) ? 'luz' : 'agua');
    const somar = (lista) => lista.reduce((t, f) => { t[tipoF(f)] += Number(f.valor) || 0; return t; }, { agua: 0, luz: 0 });
    const porSec = new Map();
    for (const f of fat) { const s = f.secretaria || '(sem secretaria)'; const x = porSec.get(s) || { secretaria: s, agua: 0, luz: 0, contratos: new Set() }; x[tipoF(f)] += Number(f.valor) || 0; x.contratos.add(digitos(f.codigo)); porSec.set(s, x); }
    const porMes = meses.map((m) => Object.assign({ id: m, mes: mesBR(m) }, somar(fat.filter((f) => A.mesISO(f.mes) === m))));
    const porTipo = new Map();
    for (const c of con) { const t = c.tipoConta || (ehLuz(c) ? 'Energia elétrica' : 'Água e esgoto'); const x = porTipo.get(t) || { id: t, tipo: t, ativos: 0, total: 0 }; x.total++; if (/^ativ/i.test(c.situacao || '')) x.ativos++; porTipo.set(t, x); }
    // contrato ativo sem fatura nos 3 últimos meses do período (mesma regra do SisPu)
    const ult3 = new Set(meses.slice(-3));
    const comFatura = new Set(fat.filter((f) => ult3.has(A.mesISO(f.mes))).map((f) => digitos(f.codigo)));
    const semFatura = meses.length ? con.filter((c) => /^ativ/i.test(c.situacao || '') && !comFatura.has(digitos(c.codigo))) : [];
    const idx = A.indicePredios();
    const semPredio = con.filter((c) => !idx.has(digitos(c.codigo)));
    return { meses, total: somar(fat), porSec: [...porSec.values()].map((x) => Object.assign(x, { id: x.secretaria, n: x.contratos.size, soma: x.agua + x.luz })).sort((a, b) => b.soma - a.soma), porMes, porTipo: [...porTipo.values()], semFatura, semPredio, idx };
  };

  const ABAS = [['resumo', 'Resumo e relatórios'], ['contratos', 'Contratos (ligações)'], ['faturas', 'Faturas']];
  T.agualuz = (aba = 'resumo', query = {}) => {
    const nav = `<nav class="abas" aria-label="Água e luz">${ABAS.map(([k, t]) => `<a href="#agualuz/${k}" class="${k === aba ? 'ativa' : ''}">${t}</a>`).join('')}</nav>`;
    const con = A.contratos();
    if (!con.length && !A.faturas().length) {
      return { titulo: 'Água e luz', html: nav + '<p class="aviso-inline">Ainda não há contratos nem faturas. Em <a href="#cadastros/unidades">Cadastros</a>, use <b>Importar planilha unificada</b> com as abas <b>Contratos</b> e <b>Faturas</b> exportadas do SisPu.</p>' };
    }
    const r = resumo();
    const predioHtml = (c) => { const b = r.idx.get(digitos(c.codigo)); return b ? `<a href="#bem/${esc(b.id)}">${esc(b.plaqueta || b.codigo)} · ${esc(b.descricao)}</a>` : '<span class="ajuda">sem bem ligado</span>'; };
    let html = nav, id = '';
    if (aba === 'contratos') {
      id = 'al-contratos';
      let linhas = con;
      if (query.semPredio) linhas = r.semPredio;
      if (query.semFatura) linhas = r.semFatura;
      html += `${query.semPredio || query.semFatura ? `<p class="ajuda">Filtro: ${query.semPredio ? 'ligações sem bem ligado no patrimônio' : 'contratos ativos sem fatura nos 3 últimos meses'}. <a href="#agualuz/contratos">Ver todos</a></p>` : ''}` + ui.tabela({ id, linhas, nomePlanilha: 'contratos-agua-luz', colunas: [
        { chave: 'codigo', titulo: 'Matrícula / UC' }, { chave: 'concessionaria', titulo: 'Concessionária' }, { chave: 'unidadeGestora', titulo: 'Unidade gestora' },
        { chave: 'secretaria', titulo: 'Secretaria' }, { chave: 'predio', titulo: 'Bem (prédio ou equipamento)', html: predioHtml, valor: (c) => r.idx.get(digitos(c.codigo))?.descricao || '' },
        { chave: 'situacao', titulo: 'Situação' }, { chave: 'ultimaFatura', titulo: 'Última fatura' }, { chave: 'valor12m', titulo: 'Valor 12 meses', num: true, valor: (c) => Number(c.valor12m) || 0, html: (c) => u.moeda(Number(c.valor12m) || 0) }] });
    } else if (aba === 'faturas') {
      id = 'al-faturas';
      const linhas = A.faturas().slice().sort((a, b) => A.mesISO(b.mes).localeCompare(A.mesISO(a.mes)));
      html += ui.tabela({ id, linhas, nomePlanilha: 'faturas-agua-luz', colunas: [
        { chave: 'mes', titulo: 'Mês' }, { chave: 'concessionaria', titulo: 'Concessionária' }, { chave: 'codigo', titulo: 'Matrícula / UC' },
        { chave: 'unidadeGestora', titulo: 'Unidade gestora' }, { chave: 'secretaria', titulo: 'Secretaria' },
        { chave: 'consumo', titulo: 'Consumo (kWh/m³)', num: true }, { chave: 'valor', titulo: 'Valor', num: true, valor: (f) => Number(f.valor) || 0, html: (f) => u.moeda(Number(f.valor) || 0) }] });
    } else {
      id = 'al-sec';
      html += `<div class="cartoes-resumo">
          <section class="cartao"><h3>Água (${esc(mesBR(r.meses[0] || ''))} a ${esc(mesBR(r.meses.at(-1) || ''))})</h3><p class="numero-grande">${u.moeda(r.total.agua)}</p></section>
          <section class="cartao"><h3>Luz (mesmo período)</h3><p class="numero-grande">${u.moeda(r.total.luz)}</p></section>
          <section class="cartao"><h3>Contratos</h3><p class="numero-grande">${u.inteiro(con.length)}</p><p class="ajuda">${u.inteiro(con.filter((c) => /^ativ/i.test(c.situacao || '')).length)} ativos</p></section>
        </div>
        <section class="cartao"><h3>O que olhar</h3><ul class="lista-simples">
          <li><a href="#agualuz/contratos?semFatura=1">${u.inteiro(r.semFatura.length)} contrato(s) ativo(s) sem fatura nos 3 últimos meses</a> (pode ser ligação desligada que ainda consta como ativa)</li>
          <li><a href="#agualuz/contratos?semPredio=1">${u.inteiro(r.semPredio.length)} ligação(ões) sem bem ligado no patrimônio</a> (ligue o código no campo "Ligações de água e luz" do imóvel)</li></ul></section>
        <section class="cartao"><h3>Por secretaria</h3>${ui.tabela({ id, linhas: r.porSec, nomePlanilha: 'agua-luz-por-secretaria', colunas: [
          { chave: 'secretaria', titulo: 'Secretaria' }, { chave: 'n', titulo: 'Ligações', num: true },
          { chave: 'agua', titulo: 'Água', num: true, html: (x) => u.moeda(x.agua) }, { chave: 'luz', titulo: 'Luz', num: true, html: (x) => u.moeda(x.luz) }, { chave: 'soma', titulo: 'Total', num: true, html: (x) => u.moeda(x.soma) }] })}</section>
        <section class="cartao"><h3>Por mês</h3>${ui.tabela({ id: 'al-mes', linhas: r.porMes, nomePlanilha: 'agua-luz-por-mes', colunas: [
          { chave: 'mes', titulo: 'Mês' }, { chave: 'agua', titulo: 'Água', num: true, html: (x) => u.moeda(x.agua) }, { chave: 'luz', titulo: 'Luz', num: true, html: (x) => u.moeda(x.luz) }] })}</section>
        <section class="cartao"><h3>Tipos de conta</h3>${ui.tabela({ id: 'al-tipo', linhas: r.porTipo, nomePlanilha: 'agua-luz-tipos', colunas: [
          { chave: 'tipo', titulo: 'Tipo de conta' }, { chave: 'ativos', titulo: 'Ativos', num: true }, { chave: 'total', titulo: 'Total', num: true }] })}</section>`;
    }
    return { titulo: 'Água e luz', html, ligar: () => { for (const t of ['al-contratos', 'al-faturas', 'al-sec', 'al-mes', 'al-tipo']) if (document.getElementById(t)) ui.ligarTabela(t); } };
  };

  // resumo para a ficha do prédio
  A.htmlDoBem = (b) => {
    const cs = A.doBem(b);
    if (!cs.length) return '';
    const fat = A.faturas();
    return `<p class="ajuda"><b>Água e luz:</b> ${cs.map((c) => { const fs = fat.filter((f) => digitos(f.codigo) === digitos(c.codigo)); const tot = fs.reduce((t, f) => t + (Number(f.valor) || 0), 0); return `${ehLuz(c) ? 'Luz' : 'Água'} ${esc(c.codigo)} (${esc(c.situacao || '')}, ${u.moeda(tot)} em ${fs.length} fatura(s))`; }).join('; ')} · <a href="#agualuz/contratos">ver em Água e luz</a></p>`;
  };
})();

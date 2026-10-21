/* VitalPat Cemitério · Gestão — peças de tela reutilizadas: janela, avisos, tabela, filtros, planilha, impressão. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;
  const esc = u.esc;
  const ui = VP.ui = {};

  // Preferências pequenas deste navegador (colunas escolhidas etc.). Pode falhar sem problema.
  ui.pref = {
    ler(k, padrao = null) { try { const v = localStorage.getItem('vitalpat-cemiterio-gestao-' + k); return v == null ? padrao : JSON.parse(v); } catch (_) { return padrao; } },
    gravar(k, v) { try { localStorage.setItem('vitalpat-cemiterio-gestao-' + k, JSON.stringify(v)); } catch (_) { /* sem problema */ } }
  };

  // ------------------------------------------------------------- aviso rápido
  ui.aviso = (texto, tipo = 'ok') => {
    let el = document.getElementById('aviso-rapido');
    if (!el) { el = document.createElement('div'); el.id = 'aviso-rapido'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'aviso-rapido ' + tipo;
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(ui.aviso._t);
    ui.aviso._t = setTimeout(() => { el.hidden = true; }, 4000);
  };

  // ------------------------------------------------------------- janela (modal)
  ui.modal = ({ titulo, corpo, botoes = [], largura = '' }) => {
    const d = document.createElement('dialog');
    d.className = 'janela ' + largura;
    d.innerHTML = `<form method="dialog" class="janela-caixa">
        <header><h2>${esc(titulo)}</h2><button type="button" class="botao-icone" data-fechar aria-label="Fechar">✕</button></header>
        <div class="janela-corpo">${corpo}</div>
        <footer>${botoes.map((b, i) => `<button type="button" class="botao ${b.classe || ''}" data-botao="${i}">${esc(b.texto)}</button>`).join('')}</footer>
      </form>`;
    document.body.appendChild(d);
    const fechar = () => { d.close(); d.remove(); };
    d.querySelector('[data-fechar]').addEventListener('click', fechar);
    d.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
    d.querySelectorAll('[data-botao]').forEach((el) => el.addEventListener('click', async () => {
      const b = botoes[+el.dataset.botao];
      if (!b.acao) return fechar();
      el.disabled = true;
      try { const r = await b.acao(d, fechar); if (r !== false && b.fecha !== false) fechar(); }
      finally { el.disabled = false; }
    }));
    d.showModal();
    return { el: d, fechar };
  };

  ui.confirmar = (texto, { titulo = 'Confirmar', sim = 'Confirmar', classe = 'primario' } = {}) => new Promise((ok) => {
    ui.modal({ titulo, corpo: `<p>${texto}</p>`, botoes: [{ texto: 'Cancelar', acao: () => ok(false) }, { texto: sim, classe, acao: () => ok(true) }] });
  });

  // Tela de resultado de operação em lote: quantos deram certo, quantos falharam e por quê
  ui.resultado = ({ titulo, sucesso = [], falhas = [], extra = '' }) => {
    const corpo = `
      <div class="resultado-numeros">
        <div class="numero-destaque ok"><span class="numero-rotulo">Deram certo</span><strong>${u.inteiro(sucesso.length)}</strong></div>
        <div class="numero-destaque ${falhas.length ? 'falha' : ''}"><span class="numero-rotulo">Não foram feitos</span><strong>${u.inteiro(falhas.length)}</strong></div>
      </div>
      ${extra}
      ${falhas.length ? `<h3>O que não foi feito e por quê</h3><ul class="lista-falhas">${falhas.map((f) => `<li><b>${esc(f.item)}</b> — ${esc(f.motivo)}</li>`).join('')}</ul>` : ''}
      ${sucesso.length ? `<details><summary>Ver os ${u.inteiro(sucesso.length)} itens feitos</summary><ul class="lista-ok">${sucesso.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}`;
    const botoes = [{ texto: 'Fechar', classe: 'primario' }];
    if (falhas.length) botoes.unshift({ texto: 'Baixar lista de falhas', fecha: false, acao: () => { ui.baixarCSV('falhas', ['Item', 'Motivo'], falhas.map((f) => [f.item, f.motivo])); return false; } });
    ui.modal({ titulo, corpo, botoes, largura: 'media' });
  };

  // ------------------------------------------------------------- formulários simples
  // campos: [{chave, rotulo, tipo:'texto'|'numero'|'moeda'|'data'|'select'|'area'|'bool'|'arquivo', opcoes:[[v,t]], obrigatorio, ajuda, largura:'meia'}]
  ui.campos = (campos, valores = {}) => `<div class="form-grade">${campos.map((c) => {
    const v = valores[c.chave] ?? c.padrao ?? '';
    const id = 'f-' + c.chave.replace(/\W/g, '-');
    const obrig = c.obrigatorio ? ' <span class="obrig" title="obrigatório">*</span>' : '';
    let ctl;
    if (c.tipo === 'select') ctl = `<select id="${id}" name="${esc(c.chave)}">${c.vazio !== false ? `<option value="">${esc(c.vazio || 'Escolha…')}</option>` : ''}${c.opcoes.map(([ov, ot]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ot)}</option>`).join('')}</select>`;
    else if (c.tipo === 'area') ctl = `<textarea id="${id}" name="${esc(c.chave)}" rows="3">${esc(v)}</textarea>`;
    else if (c.tipo === 'bool') ctl = `<label class="chave"><input type="checkbox" id="${id}" name="${esc(c.chave)}" ${v ? 'checked' : ''}><span></span></label>`;
    else if (c.tipo === 'arquivo') ctl = `<input type="file" id="${id}" name="${esc(c.chave)}" ${c.multiplo ? 'multiple' : ''} accept="${esc(c.aceita || '*/*')}">`;
    else {
      const tipo = c.tipo === 'data' ? 'date' : 'text';
      const modo = c.tipo === 'numero' || c.tipo === 'moeda' ? 'inputmode="decimal"' : '';
      const valor = c.tipo === 'moeda' && v !== '' && v != null ? String(v).replace('.', ',') : v;
      ctl = `<input type="${tipo}" id="${id}" name="${esc(c.chave)}" value="${esc(valor)}" ${modo} ${c.placeholder ? `placeholder="${esc(c.placeholder)}"` : ''}>`;
    }
    return `<div class="campo ${c.largura || ''} ${c.tipo === 'bool' ? 'campo-chave' : ''}"><label for="${id}">${esc(c.rotulo)}${obrig}</label>${ctl}${c.ajuda ? `<small class="ajuda">${esc(c.ajuda)}</small>` : ''}</div>`;
  }).join('')}</div>`;

  ui.lerCampos = (raiz, campos) => {
    const r = {}, faltando = [];
    for (const c of campos) {
      const el = raiz.querySelector(`[name="${CSS.escape(c.chave)}"]`);
      if (!el) continue;
      let v;
      if (c.tipo === 'bool') v = el.checked;
      else if (c.tipo === 'numero' || c.tipo === 'moeda') v = u.num(el.value);
      else if (c.tipo === 'arquivo') v = el.files;
      else v = el.value.trim();
      if (c.obrigatorio && (v === '' || v == null)) faltando.push(c.rotulo);
      // chaves com ponto viram objeto: "seguro.apolice"
      const partes = c.chave.split('.');
      let alvo = r;
      while (partes.length > 1) { const p = partes.shift(); alvo[p] = alvo[p] || {}; alvo = alvo[p]; }
      alvo[partes[0]] = v;
    }
    return { valores: r, faltando };
  };

  ui.formulario = ({ titulo, campos, valores = {}, salvar, textoSalvar = 'Salvar', largura = 'media', intro = '' }) => ui.modal({
    titulo, largura,
    corpo: intro + ui.campos(campos, valores) + '<p class="erro-form" role="alert"></p>',
    botoes: [{ texto: 'Cancelar' }, {
      texto: textoSalvar, classe: 'primario', acao: async (d) => {
        const { valores: v, faltando } = ui.lerCampos(d, campos);
        if (faltando.length) { d.querySelector('.erro-form').textContent = 'Preencha: ' + faltando.join(', '); return false; }
        const erro = await salvar(v, d);
        if (erro) { d.querySelector('.erro-form').textContent = erro; return false; }
        return true;
      }
    }]
  });

  // Lê arquivos escolhidos (fotos reduzidas para não pesar)
  ui.lerArquivos = async (files, { reduzirImagem = true } = {}) => {
    const r = [];
    for (const f of [...(files || [])]) {
      let dataURL = await new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => erro(fr.error); fr.readAsDataURL(f); });
      if (reduzirImagem && f.type.startsWith('image/')) {
        dataURL = await new Promise((ok) => {
          const img = new Image();
          img.onload = () => {
            const e = Math.min(1, 1280 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * e); c.height = Math.round(img.height * e);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            ok(c.toDataURL('image/jpeg', 0.75));
          };
          img.onerror = () => ok(dataURL);
          img.src = dataURL;
        });
      }
      r.push({ id: u.id(), nome: f.name, tipo: f.type, tamanho: f.size, dataURL, data: VP.Plataforma.hoje() });
    }
    return r;
  };

  // ------------------------------------------------------------- tabela
  // ui.tabela({ id, colunas, linhas, selecao, chave, aoClicar, porPagina, vazio })
  ui.tabelas = {};
  ui.tabela = (cfg) => {
    const salvas = ui.pref.ler('colunas-' + cfg.id);
    const estado = ui.tabelas[cfg.id] = Object.assign(ui.tabelas[cfg.id] || { selecionados: new Set(), pagina: 0, ordem: null }, { cfg });
    estado.visiveis = salvas || cfg.colunas.filter((c) => !c.oculta).map((c) => c.chave);
    estado.pagina = 0;
    // descarta seleção de linhas que sumiram do filtro
    const chaves = new Set(cfg.linhas.map((l) => l[cfg.chave || 'id']));
    for (const k of [...estado.selecionados]) if (!chaves.has(k)) estado.selecionados.delete(k);
    return `<div class="tabela-area" id="tab-${esc(cfg.id)}">${ui._corpoTabela(estado)}</div>`;
  };
  ui._corpoTabela = (st) => {
    const cfg = st.cfg;
    const k = cfg.chave || 'id';
    const cols = cfg.colunas.filter((c) => st.visiveis.includes(c.chave));
    let linhas = cfg.linhas.slice();
    if (st.ordem) {
      const c = cfg.colunas.find((x) => x.chave === st.ordem.chave);
      if (c) {
        const val = (l) => (c.ordenar ? c.ordenar(l) : c.valor ? c.valor(l) : l[c.chave]);
        linhas.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })) * st.ordem.dir; });
      }
    }
    const por = cfg.porPagina || 50;
    const paginas = Math.max(1, Math.ceil(linhas.length / por));
    st.pagina = Math.min(st.pagina, paginas - 1);
    const pagina = linhas.slice(st.pagina * por, st.pagina * por + por);
    const todasMarcadas = linhas.length && linhas.every((l) => st.selecionados.has(l[k]));
    const cab = cols.map((c) => `<th class="${c.num ? 'num' : ''}" data-ordenar="${esc(c.chave)}" aria-sort="${st.ordem?.chave === c.chave ? (st.ordem.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button">${esc(c.titulo)}${st.ordem?.chave === c.chave ? (st.ordem.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
    const corpo = pagina.map((l) => `<tr data-chave="${esc(l[k])}" class="${cfg.aoClicar ? 'clicavel' : ''} ${st.selecionados.has(l[k]) ? 'marcada' : ''}">
        ${cfg.selecao ? `<td class="sel"><input type="checkbox" aria-label="Marcar" ${st.selecionados.has(l[k]) ? 'checked' : ''}></td>` : ''}
        ${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(l) : esc(c.formato ? c.formato(c.valor ? c.valor(l) : l[c.chave]) : (c.valor ? c.valor(l) : l[c.chave]))}</td>`).join('')}
      </tr>`).join('');
    const somas = cols.some((c) => c.soma) ? `<tfoot><tr>${cfg.selecao ? '<td></td>' : ''}${cols.map((c, i) => {
      if (c.soma) { const t = linhas.reduce((s, l) => s + (Number(c.valor ? c.valor(l) : l[c.chave]) || 0), 0); return `<td class="num"><b>${esc(c.formato ? c.formato(t) : u.inteiro(t))}</b></td>`; }
      return i === 0 ? `<td><b>Total (${u.inteiro(linhas.length)})</b></td>` : '<td></td>';
    }).join('')}</tr></tfoot>` : '';
    return `
      <div class="tabela-barra">
        <span class="tabela-contagem">${u.inteiro(linhas.length)} ${linhas.length === 1 ? 'item' : 'itens'}${cfg.selecao && st.selecionados.size ? ` · <b>${u.inteiro(st.selecionados.size)} marcado(s)</b>` : ''}</span>
        <span class="tabela-acoes">
          ${cfg.selecao && linhas.length ? `<button type="button" class="botao pequeno" data-marcar-todos>${todasMarcadas ? 'Desmarcar todos' : `Marcar todos do filtro (${u.inteiro(linhas.length)})`}</button>` : ''}
          <button type="button" class="botao pequeno" data-colunas>Colunas</button>
          <button type="button" class="botao pequeno" data-planilha>Baixar planilha</button>
        </span>
      </div>
      <div class="tabela-rolagem"><table class="tabela">
        <thead><tr>${cfg.selecao ? `<th class="sel"><input type="checkbox" aria-label="Marcar a página" data-marcar-pagina ${pagina.length && pagina.every((l) => st.selecionados.has(l[k])) ? 'checked' : ''}></th>` : ''}${cab}</tr></thead>
        <tbody>${corpo || `<tr><td colspan="${cols.length + 1}" class="vazio">${esc(cfg.vazio || 'Nada encontrado.')}</td></tr>`}</tbody>${somas}
      </table></div>
      ${paginas > 1 ? `<div class="paginacao"><button type="button" class="botao pequeno" data-pag="-1" ${st.pagina === 0 ? 'disabled' : ''}>‹ Anterior</button><span>Página ${st.pagina + 1} de ${paginas}</span><button type="button" class="botao pequeno" data-pag="1" ${st.pagina >= paginas - 1 ? 'disabled' : ''}>Próxima ›</button></div>` : ''}`;
  };
  ui.ligarTabela = (id, aoMudarSelecao) => {
    const st = ui.tabelas[id];
    const area = document.getElementById('tab-' + id);
    if (!area || !st) return;
    const k = st.cfg.chave || 'id';
    const redesenhar = () => { area.innerHTML = ui._corpoTabela(st); if (aoMudarSelecao) aoMudarSelecao(st.selecionados); };
    area.addEventListener('click', (e) => {
      const th = e.target.closest('[data-ordenar]');
      if (th) { const c = th.dataset.ordenar; st.ordem = st.ordem?.chave === c ? { chave: c, dir: -st.ordem.dir } : { chave: c, dir: 1 }; return redesenhar(); }
      const pag = e.target.closest('[data-pag]');
      if (pag) { st.pagina += +pag.dataset.pag; return redesenhar(); }
      if (e.target.closest('[data-marcar-todos]')) {
        const todas = st.cfg.linhas.every((l) => st.selecionados.has(l[k]));
        st.cfg.linhas.forEach((l) => (todas ? st.selecionados.delete(l[k]) : st.selecionados.add(l[k])));
        return redesenhar();
      }
      if (e.target.closest('[data-colunas]')) return ui.escolherColunas(id, redesenhar);
      if (e.target.closest('[data-planilha]')) return ui.exportarTabela(id);
      const tr = e.target.closest('tr[data-chave]');
      if (!tr) return;
      if (e.target.matches('input[type=checkbox]') || e.target.closest('td.sel')) {
        const chave = tr.dataset.chave;
        st.selecionados.has(chave) ? st.selecionados.delete(chave) : st.selecionados.add(chave);
        return redesenhar();
      }
      if (e.target.closest('a,button')) return;
      if (st.cfg.aoClicar) st.cfg.aoClicar(st.cfg.linhas.find((l) => String(l[k]) === tr.dataset.chave));
    });
    area.addEventListener('change', (e) => {
      if (e.target.matches('[data-marcar-pagina]')) {
        const por = st.cfg.porPagina || 50;
        const linhas = st.cfg.linhas.slice(st.pagina * por, st.pagina * por + por);
        linhas.forEach((l) => (e.target.checked ? st.selecionados.add(l[k]) : st.selecionados.delete(l[k])));
        redesenhar();
      }
    });
  };
  ui.escolherColunas = (id, depois) => {
    const st = ui.tabelas[id];
    ui.modal({
      titulo: 'Colunas da lista', largura: 'pequena',
      corpo: `<div class="lista-marcar">${st.cfg.colunas.map((c) => `<label><input type="checkbox" value="${esc(c.chave)}" ${st.visiveis.includes(c.chave) ? 'checked' : ''}> ${esc(c.titulo)}</label>`).join('')}</div>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Aplicar', classe: 'primario', acao: (d) => {
        const v = [...d.querySelectorAll('input:checked')].map((i) => i.value);
        if (!v.length) return false;
        st.visiveis = v; ui.pref.gravar('colunas-' + id, v); depois();
      } }]
    });
  };
  ui.exportarTabela = (id) => {
    const st = ui.tabelas[id];
    const linhas = st.selecionados.size ? st.cfg.linhas.filter((l) => st.selecionados.has(l[st.cfg.chave || 'id'])) : st.cfg.linhas;
    ui.exportarPlanilha(st.cfg.nomePlanilha || id, st.cfg.colunas.map((c) => ({ chave: c.chave, titulo: c.titulo, valor: (l) => (c.exportar ? c.exportar(l) : c.valor ? c.valor(l) : l[c.chave]) })), linhas, st.selecionados.size ? `Só os ${st.selecionados.size} itens marcados.` : '');
  };

  // ------------------------------------------------------------- planilha simples com escolha de colunas (PB-19)
  ui.exportarPlanilha = (nome, colunas, linhas, aviso = '') => {
    const salvas = ui.pref.ler('planilha-' + nome);
    const modelos = ui.pref.ler('modelos-planilha', {});
    ui.modal({
      titulo: 'Baixar planilha', largura: 'media',
      corpo: `<p class="ajuda">Planilha simples (sem gráficos), para levar a outro sistema. Marque só as informações que o outro sistema aceita. ${esc(aviso)}</p>
        ${Object.keys(modelos).length ? `<label>Modelo salvo <select data-modelo><option value="">—</option>${Object.keys(modelos).map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>` : ''}
        <div class="linha-botoes"><button type="button" class="botao pequeno" data-todas>Marcar todas</button><button type="button" class="botao pequeno" data-nenhuma>Desmarcar todas</button></div>
        <div class="lista-marcar colunas">${colunas.map((c) => `<label><input type="checkbox" value="${esc(c.chave)}" ${!salvas || salvas.includes(c.chave) ? 'checked' : ''}> ${esc(c.titulo)}</label>`).join('')}</div>
        <label>Salvar esta escolha como modelo (opcional) <input data-nome-modelo placeholder="Ex.: Planilha para o sistema X"></label>
        <label>Formato <select data-formato><option value="csv">Planilha (CSV, abre no Excel)</option><option value="json">Arquivo de dados (JSON)</option></select></label>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Baixar', classe: 'primario', acao: (d) => {
        const marcadas = [...d.querySelectorAll('.colunas input:checked')].map((i) => i.value);
        if (!marcadas.length) { ui.aviso('Marque pelo menos uma informação.', 'erro'); return false; }
        ui.pref.gravar('planilha-' + nome, marcadas);
        const nm = d.querySelector('[data-nome-modelo]').value.trim();
        if (nm) { modelos[nm] = marcadas; ui.pref.gravar('modelos-planilha', modelos); }
        const cols = colunas.filter((c) => marcadas.includes(c.chave));
        const dados = linhas.map((l) => cols.map((c) => c.valor(l)));
        if (d.querySelector('[data-formato]').value === 'json') {
          ui.baixar(`${nome}.json`, JSON.stringify(dados.map((r) => Object.fromEntries(cols.map((c, i) => [c.titulo, r[i]]))), null, 2), 'application/json');
        } else ui.baixarCSV(nome, cols.map((c) => c.titulo), dados);
      } }]
    }).el.addEventListener('click', (e) => {
      const d = e.currentTarget;
      if (e.target.matches('[data-todas]')) d.querySelectorAll('.colunas input').forEach((i) => { i.checked = true; });
      if (e.target.matches('[data-nenhuma]')) d.querySelectorAll('.colunas input').forEach((i) => { i.checked = false; });
    });
    document.querySelector('dialog.janela:last-of-type [data-modelo]')?.addEventListener('change', (e) => {
      const m = modelos[e.target.value]; if (!m) return;
      e.target.closest('dialog').querySelectorAll('.colunas input').forEach((i) => { i.checked = m.includes(i.value); });
    });
  };
  ui.baixar = (nome, conteudo, tipo) => {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  ui.baixarCSV = (nome, cabecalho, linhas) => {
    const cel = (v) => {
      if (v === true) v = 'Sim';
      if (v === false) v = 'Não';
      if (v == null) return '';
      if (typeof v === 'number') return String(v).replace('.', ',');
      v = String(v);
      return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const texto = '﻿' + [cabecalho.map(cel).join(';'), ...linhas.map((l) => l.map(cel).join(';'))].join('\r\n');
    ui.baixar(`${nome}-${VP.Plataforma.hoje()}.csv`, texto, 'text/csv;charset=utf-8');
  };

  // ------------------------------------------------------------- filtros em etiquetas
  // defs: [{chave, rotulo, tipo:'select'|'texto'|'numero'|'bool'|'data', opcoes}]
  ui.filtros = ({ id, defs, valores, busca = true, placeholder = 'Buscar…', aoMudar }) => {
    const ativos = defs.filter((d) => valores[d.chave] !== undefined && valores[d.chave] !== '' && valores[d.chave] !== false && valores[d.chave] !== null);
    const disponiveis = defs.filter((d) => !ativos.includes(d));
    const ctl = (d) => {
      const v = valores[d.chave];
      if (d.tipo === 'select') return `<select data-filtro="${d.chave}">${d.opcoes.map(([ov, ot]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ot)}</option>`).join('')}</select>`;
      if (d.tipo === 'bool') return '';
      return `<input data-filtro="${d.chave}" type="${d.tipo === 'data' ? 'date' : 'text'}" value="${esc(v)}" size="${d.tamanho || 10}">`;
    };
    const html = `<div class="filtros" id="filtros-${esc(id)}">
        ${busca ? `<input type="search" class="busca" data-filtro="busca" value="${esc(valores.busca || '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">` : ''}
        ${ativos.map((d) => `<span class="etiqueta-filtro"><span>${esc(d.rotulo)}${d.tipo === 'bool' ? '' : ':'}</span>${ctl(d)}<button type="button" data-remover="${d.chave}" aria-label="Tirar filtro ${esc(d.rotulo)}">✕</button></span>`).join('')}
        ${disponiveis.length ? `<select class="adicionar-filtro" data-adicionar aria-label="Adicionar filtro"><option value="">+ Filtro</option>${disponiveis.map((d) => `<option value="${d.chave}">${esc(d.rotulo)}</option>`).join('')}</select>` : ''}
        ${ativos.length || valores.busca ? '<button type="button" class="botao pequeno" data-limpar>Limpar filtros</button>' : ''}
      </div>`;
    setTimeout(() => {
      const el = document.getElementById('filtros-' + id);
      if (!el) return;
      let t;
      el.addEventListener('input', (e) => {
        if (!e.target.dataset.filtro) return;
        clearTimeout(t);
        const k = e.target.dataset.filtro;
        t = setTimeout(() => { valores[k] = e.target.value; aoMudar(valores, k === 'busca' ? 'busca' : null); }, e.target.type === 'search' || e.target.type === 'text' ? 300 : 0);
      });
      el.addEventListener('change', (e) => {
        if (e.target.matches('[data-adicionar]')) {
          const d = defs.find((x) => x.chave === e.target.value);
          if (!d) return;
          valores[d.chave] = d.tipo === 'bool' ? true : d.tipo === 'select' ? d.opcoes[0][0] : '';
          if (valores[d.chave] === '') valores[d.chave] = ' ';
          aoMudar(valores);
        } else if (e.target.dataset.filtro && e.target.tagName === 'SELECT') { valores[e.target.dataset.filtro] = e.target.value; aoMudar(valores); }
      });
      el.addEventListener('click', (e) => {
        const r = e.target.closest('[data-remover]');
        if (r) { delete valores[r.dataset.remover]; aoMudar(valores); }
        if (e.target.closest('[data-limpar]')) { for (const k of Object.keys(valores)) delete valores[k]; aoMudar(valores); }
      });
    }, 0);
    return html;
  };
  // valor " " (filtro recém-criado e vazio) conta como vazio no filtro
  ui.limparValores = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.trim() : x]).filter(([, x]) => x !== '' && x != null));

  // ------------------------------------------------------------- impressão (relatórios e documentos)
  ui.imprimir = (html, titulo = 'VitalPat') => {
    let area = document.getElementById('area-impressao');
    if (!area) { area = document.createElement('div'); area.id = 'area-impressao'; document.body.appendChild(area); }
    area.innerHTML = `<div class="impressao-cabecalho"><img src="icones/logo-vitalpat.svg" alt="" onerror="this.remove()"><div><b>${esc(titulo)}</b><br><small>${esc(VP.nomeEntidade())} · emitido em ${u.data(VP.Plataforma.hoje())}</small></div></div>${html}`;
    document.body.classList.add('imprimindo');
    const fim = () => { document.body.classList.remove('imprimindo'); window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    setTimeout(() => { window.print(); setTimeout(fim, 500); }, 50);
  };
})();

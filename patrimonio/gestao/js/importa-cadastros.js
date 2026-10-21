/* VitalPat Patrimônio · Gestão — importar e exportar os CADASTROS por planilha (uma aba para cada).
   Entidades, contas, responsáveis, fornecedores, motivos, comissões, seguradoras, tipos de garantia, classificações,
   produtos e compras (itens a incorporar). Unidades continuam em importa-unidades.js (só código e nome).
   Usado junto com Exportar e importar → Importar: mesma prévia, mesmo "Salvar" e mesmo "Desfazer" dos bens.
   O que já existe (mesmo nome, código ou CNPJ) não é duplicado: aparece como "Igual" ou "Alterado".
   Um bem da mesma planilha pode usar um cadastro novo da planilha (ex.: unidade, classificação ou fornecedor novos). */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;
  const C = VP.importaCadastros = {};
  const norm = (t) => u.normalizar(t).replace(/\s+/g, ' ').trim();
  const limpo = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const digitos = (s) => String(s ?? '').replace(/\D/g, '');
  const caminho = (c) => VP.caminhoClassificacao(c);
  const TIPOS_CONTA = [['ativo', 'Ativo (bens)'], ['depreciacao', 'Depreciação acumulada'], ['resultado', 'Resultado (despesa)']];
  const TIPOS_MOTIVO = [['baixa', 'Baixa'], ['desuso', 'Desuso'], ['manutencao', 'Manutenção'], ['transferencia', 'Transferência']];

  // ------------------------------------------------------------------ definição de cada aba
  // campos: k (campo do cadastro), t (título da coluna), tipo, obrig, apelidos, ref (outro cadastro), opcoes [[valor, rótulo]]
  // chaves(x): textos que identificam o registro (para não duplicar e para outros cadastros acharem)
  C.DEF = {
    entidades: { aba: 'Entidades', titulo: 'Entidade', campos: [
      { k: 'nome', t: 'Nome', obrig: true }, { k: 'documento', t: 'CNPJ', apelidos: ['cnpj da entidade'] }],
      chaves: (x) => [digitos(x.documento).length >= 11 ? 'doc:' + digitos(x.documento) : '', norm(x.nome)] },
    contas: { aba: 'Contas contábeis', titulo: 'Conta', campos: [
      { k: 'codigo', t: 'Código', obrig: true }, { k: 'nome', t: 'Nome', obrig: true },
      { k: 'tipo', t: 'Tipo', tipo: 'opcao', opcoes: TIPOS_CONTA, padrao: 'ativo' }],
      chaves: (x) => [norm(x.codigo), norm(x.nome)] },
    responsaveis: { aba: 'Responsáveis', titulo: 'Responsável', campos: [
      { k: 'nome', t: 'Nome', obrig: true }, { k: 'matricula', t: 'Matrícula' }, { k: 'cargo', t: 'Cargo' },
      { k: 'documento', t: 'CPF', apelidos: ['cpf do responsavel'] }, { k: 'email', t: 'E-mail', apelidos: ['email'] }],
      chaves: (x) => [x.matricula ? 'mat:' + norm(x.matricula) : '', norm(x.nome)] },
    fornecedores: { aba: 'Fornecedores', titulo: 'Fornecedor', campos: [
      { k: 'nome', t: 'Nome', obrig: true, apelidos: ['razao social'] }, { k: 'documento', t: 'CNPJ/CPF', apelidos: ['cnpj', 'cpf'] }, { k: 'contato', t: 'Contato' }],
      chaves: (x) => [digitos(x.documento).length >= 11 ? 'doc:' + digitos(x.documento) : '', norm(x.nome)] },
    motivos: { aba: 'Motivos', titulo: 'Motivo', campos: [
      { k: 'tipo', t: 'Usado em', tipo: 'opcao', opcoes: TIPOS_MOTIVO, obrig: true }, { k: 'nome', t: 'Motivo', obrig: true }],
      chaves: (x) => [norm(x.tipo + ' ' + x.nome)] },
    comissoes: { aba: 'Comissões', titulo: 'Comissão', campos: [
      { k: 'nome', t: 'Nome', obrig: true }, { k: 'ato', t: 'Ato de designação' }, { k: 'membros', t: 'Membros' }],
      chaves: (x) => [norm(x.nome)] },
    seguradoras: { aba: 'Seguradoras', titulo: 'Seguradora', campos: [
      { k: 'nome', t: 'Nome', obrig: true }, { k: 'corretora', t: 'É corretora', tipo: 'bool' }],
      chaves: (x) => [norm(x.nome)] },
    tiposGarantia: { aba: 'Tipos de garantia', titulo: 'Tipo de garantia', campos: [{ k: 'nome', t: 'Nome', obrig: true }],
      chaves: (x) => [norm(x.nome)] },
    classificacoes: { aba: 'Classificações', titulo: 'Classificação', campos: [
      { k: 'nome', t: 'Nome', obrig: true }, { k: 'codigo', t: 'Código' },
      { k: 'paiId', t: 'Fica dentro de', tipo: 'ref', ref: 'classificacoes', apelidos: ['grupo', 'classe mae', 'pai'] },
      { k: 'tipoBem', t: 'Tipo de bem', tipo: 'opcao', opcoes: () => Object.entries(VP.LISTAS.tiposBem) },
      { k: 'contaId', t: 'Conta contábil', tipo: 'ref', ref: 'contas' }, { k: 'contaDepreciacaoId', t: 'Conta de depreciação', tipo: 'ref', ref: 'contas' },
      { k: 'vidaUtilMeses', t: 'Vida útil (meses)', tipo: 'numero' }, { k: 'residualPct', t: 'Valor residual (%)', tipo: 'numero' },
      { k: 'naoDeprecia', t: 'Não deprecia', tipo: 'bool' }],
      chaves: (x) => [norm(x._caminho || caminho(x))] },
    produtos: { aba: 'Produtos', titulo: 'Produto', campos: [
      { k: 'codigo', t: 'Código' }, { k: 'nome', t: 'Nome', obrig: true },
      { k: 'classificacaoId', t: 'Classificação', tipo: 'ref', ref: 'classificacoes', obrig: true }],
      chaves: (x) => [norm(x.nome)] },
    itensIncorporar: { aba: 'Compras', titulo: 'Compra', campos: [
      { k: 'entidadeId', t: 'Entidade', tipo: 'ref', ref: 'entidades', ajuda: 'Vazio = a única entidade cadastrada' },
      { k: 'oc', t: 'Ordem de compra', apelidos: ['ordem de compra numero ano', 'oc'] }, { k: 'empenho', t: 'Empenho', apelidos: ['empenho numero ano'] },
      { k: 'emissao', t: 'Emissão do empenho', tipo: 'data', apelidos: ['emissao'] },
      { k: 'fornecedorId', t: 'Fornecedor', tipo: 'ref', ref: 'fornecedores', obrig: true, auto: true }, { k: '_cnpjFornecedor', t: 'CNPJ do fornecedor' },
      { k: 'produtoId', t: 'Produto', tipo: 'ref', ref: 'produtos', obrig: true },
      { k: 'quantidade', t: 'Quantidade', tipo: 'numero', obrig: true }, { k: 'valorUnitario', t: 'Valor unitário', tipo: 'moeda', obrig: true, apelidos: ['valor unitario'] },
      { k: 'liquidado', t: 'Liquidado', tipo: 'bool' }],
      chaves: (x) => [norm([x.entidadeId, x.ordemCompra?.numero, x.ordemCompra?.ano, x.empenho?.numero, x.empenho?.ano, x.fornecedorId, x.produtoId].join('|'))] }
  };
  // ordem de gravação: quem é usado por outro vem antes
  C.ORDEM = ['entidades', 'contas', 'responsaveis', 'fornecedores', 'motivos', 'comissoes', 'seguradoras', 'tiposGarantia', 'classificacoes', 'produtos', 'itensIncorporar'];
  C.cj = (tabela) => 'cad:' + tabela;
  C.tabela = (cj) => String(cj).slice(4);
  C.ehCadastro = (cj) => String(cj).startsWith('cad:');
  C.campos = (cj) => (C.DEF[C.tabela(cj)] || { campos: [] }).campos;
  C.opcoesImportar = () => Object.fromEntries(C.ORDEM.map((t) => [C.cj(t), `${C.DEF[t].aba} (cadastro)`]));
  C.cjDaAba = (nome) => { const n = norm(nome); const t = C.ORDEM.find((k) => norm(C.DEF[k].aba) === n || (k === 'contas' && n === 'contas')); return t ? C.cj(t) : null; };

  // ------------------------------------------------------------------ achar um cadastro (existente ou novo nesta mesma planilha)
  // pend: { tabela: Map(chave → id provisório "__cad:tabela:n") }, preenchido pela prévia na ordem de C.ORDEM
  const achar = (tabela, texto, pend) => {
    const n = norm(texto), d = digitos(texto);
    const lista = VP.db.lista(tabela);
    let x = null;
    if (tabela === 'classificacoes') x = lista.find((c) => norm(caminho(c)) === n) || lista.find((c) => norm(c.nome) === n) || lista.find((c) => c.codigo && norm(c.codigo) === n);
    else if (tabela === 'contas') x = lista.find((c) => norm(c.codigo) === n) || lista.find((c) => norm(c.nome) === n);
    else if (tabela === 'unidades') x = lista.find((c) => norm(c.codigo) === n) || lista.find((c) => norm(c.nome) === n);
    else x = (d.length >= 11 && lista.find((c) => digitos(c.documento || c.cnpj) === d)) || lista.find((c) => norm(c.nome) === n);
    if (x) return x.id;
    const m = pend?.[tabela];
    if (!m) return null;
    return m.get(n) || (d.length >= 11 && m.get('doc:' + d)) || null;
  };
  C.achar = achar;

  const converter = (c, bruto, item, pend) => {
    if (bruto == null || String(bruto).trim() === '') return { vazio: true };
    const s = limpo(bruto);
    if (c.tipo === 'opcao') {
      const ops = typeof c.opcoes === 'function' ? c.opcoes() : c.opcoes;
      const o = ops.find(([v, r]) => norm(v) === norm(s) || norm(r) === norm(s) || norm(r).startsWith(norm(s)));
      return o ? { v: o[0] } : { erro: `"${s}" não está na lista (${ops.map((x) => x[1]).join(', ')})` };
    }
    if (c.tipo === 'ref') {
      const id = achar(c.ref, s, pend);
      if (id) return { v: id };
      if (c.auto) return { v: null, novo: s }; // fornecedor da compra: cadastrado automaticamente
      return { erro: `${C.DEF[c.ref]?.titulo || c.ref} "${s}" não existe no cadastro nem nesta planilha` };
    }
    if (['numero', 'moeda', 'data', 'bool'].includes(c.tipo)) return VP.planilhas.converter(c, bruto);
    return { v: s };
  };

  // ------------------------------------------------------------------ prévia
  // abas: as abas do arquivo ligadas a um cadastro (a.cj = 'cad:tabela'), com o De/Para em a.mapa
  C.previa = (abas, pend) => {
    const itens = [];
    let seq = 0;
    for (const tabela of C.ORDEM) {
      const def = C.DEF[tabela];
      pend[tabela] = pend[tabela] || new Map();
      const existentes = VP.db.lista(tabela, true);
      const porChave = new Map();
      for (const x of existentes) for (const k of def.chaves(x)) if (k && !porChave.has(k)) porChave.set(k, x);
      for (const a of abas.filter((y) => y.cj === C.cj(tabela))) {
        a.linhas.forEach((lin, i) => {
          if (!lin.some((v) => limpo(v))) return;
          const it = { aba: a.nome, cj: a.cj, tabela, linha: i + 2 + (a.titulos || 0), valores: {}, erros: [], avisos: [], mudancas: [] };
          a.mapa.forEach((k, col) => {
            if (!k) return;
            const c = def.campos.find((x) => x.k === k); if (!c) return;
            const r = converter(c, lin[col], it, pend);
            if (r.erro) it.erros.push(`${c.t}: ${r.erro}`);
            else if (!r.vazio) { it.valores[k] = r.v; if (r.novo) it.fornecedorNovo = r.novo; }
          });
          const v = it.valores;
          for (const c of def.campos) if (c.obrig && v[c.k] == null && !(c.auto && it.fornecedorNovo)) it.erros.push(`${c.t} é obrigatório`);
          if (/^exemplo/i.test(limpo(v.nome))) it.erros.unshift('Linha de EXEMPLO: apague-a da planilha');
          // regras de cada cadastro
          if (tabela === 'classificacoes') {
            const pai = v.paiId ? (VP.db.pega('classificacoes', v.paiId) || pendentes.get(v.paiId)) : null;
            v._caminho = (pai ? (pai._caminho || caminho(pai)) + ' › ' : '') + (v.nome || '');
            v.nivel = !pai ? 'grupo' : pai.paiId ? 'subclasse' : 'classe';
            // valor residual sempre informado (decisão do usuário, 14/10/2026): quem tem vida útil precisa do residual (próprio ou herdado do grupo)
            const herdado = (k) => { let c = pai; while (c) { if (c[k] != null && c[k] !== '') return c[k]; c = c.paiId ? (VP.db.pega('classificacoes', c.paiId) || pendentes.get(c.paiId)) : null; } return null; };
            if (!v.naoDeprecia && v.vidaUtilMeses != null && v.residualPct == null && herdado('residualPct') == null) it.erros.push('Informe o Valor residual (%): toda classificação que deprecia precisa dele');
            if (v.residualPct != null && (v.residualPct < 0 || v.residualPct >= 100)) it.erros.push('Valor residual (%) deve ser de 0 a 99');
            if (v.vidaUtilMeses != null && v.vidaUtilMeses <= 0) it.erros.push('Vida útil deve ser maior que zero');
          }
          if (tabela === 'itensIncorporar') {
            if (!v.entidadeId) { const ents = VP.db.lista('entidades'); const novas = [...pend.entidades.values()]; const todas = ents.map((e) => e.id).concat([...new Set(novas)]); if (todas.length === 1) v.entidadeId = todas[0]; else it.erros.push(todas.length ? 'Entidade é obrigatória (há mais de uma cadastrada)' : 'Entidade é obrigatória (nenhuma cadastrada)'); }
            if (v.quantidade != null && (v.quantidade <= 0 || !Number.isInteger(v.quantidade))) it.erros.push('Quantidade deve ser um número inteiro maior que zero');
            if (v.valorUnitario != null && v.valorUnitario < 0) it.erros.push('Valor unitário negativo');
            if (it.fornecedorNovo) { it.avisos.push(`Fornecedor novo, será cadastrado: ${it.fornecedorNovo}${v._cnpjFornecedor ? ' (' + v._cnpjFornecedor + ')' : ''}`); }
            if (!v.empenho) it.avisos.push('Sem empenho: informe depois, em Entradas');
            const [on, oa] = String(v.oc || '').split('/'); const [en, ea] = String(v.empenho || '').split('/');
            v.ordemCompra = { numero: on || '', ano: oa || '' }; v.empenho = { numero: en || '', ano: ea || String(v.emissao || '').slice(0, 4), sub: 1, emissao: v.emissao || '' };
          }
          const doc = Object.assign({}, v);
          const ex = def.chaves(doc).map((k) => k && porChave.get(k)).find(Boolean);
          it.plaqueta = limpo(v.codigo || v.matricula || (v.documento ? v.documento : '') || (tabela === 'itensIncorporar' ? (v.ordemCompra.numero ? `OC ${v.ordemCompra.numero}/${v.ordemCompra.ano}` : '') : ''));
          it.descricao = `${def.titulo}: ${tabela === 'itensIncorporar' ? `${VP.nome('produtos', v.produtoId) || pendNome(pend, 'produtos', v.produtoId) || ''} × ${v.quantidade ?? ''}` : tabela === 'classificacoes' ? v._caminho : limpo(v.nome)}`;
          if (ex && ex.excluido) it.erros.push('Já existe na Lixeira; restaure antes');
          else if (ex) {
            it.existenteId = ex.id;
            for (const c of def.campos) {
              if (c.k.startsWith('_') || ['oc', 'empenho', 'emissao'].includes(c.k) || v[c.k] == null) continue;
              const antes = ex[c.k];
              if (String(antes ?? '') !== String(v[c.k])) it.mudancas.push({ k: c.k, t: c.t, antes: antes ?? '', depois: v[c.k] });
            }
          }
          it.classe = it.erros.length ? 'erro' : !ex ? 'novo' : it.mudancas.length ? 'alterado' : 'igual';
          if (it.classe === 'novo') {
            // chave repetida no mesmo arquivo: a segunda linha é erro
            const ks = def.chaves(doc).filter(Boolean);
            if (ks.some((k) => pend[tabela].has(k))) { it.classe = 'erro'; it.erros.push('Repetido nesta planilha'); }
            else { it.tempId = `__cad:${tabela}:${++seq}`; for (const k of ks) pend[tabela].set(k, it.tempId); pendentes.set(it.tempId, Object.assign({ id: it.tempId }, doc)); }
          }
          it.marcado = it.classe === 'novo' || it.classe === 'alterado';
          itens.push(it);
        });
      }
    }
    return itens;
  };
  // registros novos ainda não gravados (para nomes e caminhos na prévia)
  const pendentes = new Map();
  const pendNome = (pend, tabela, id) => pendentes.get(id)?.nome || '';
  C.limparPendentes = () => pendentes.clear();

  // ------------------------------------------------------------------ gravar
  // mapa: id provisório → id de verdade (valores "__cad:" que sobrarem viram vazio: a linha do cadastro foi desmarcada)
  C.resolver = (v, mapa) => (typeof v === 'string' && v.startsWith('__cad:') ? mapa.get(v) || '' : v);
  C.aplicar = (itens, reg, mapa, sucesso, falhas) => {
    const grava = {};
    reg.cadastrosNovos = reg.cadastrosNovos || []; reg.cadastrosAlterados = reg.cadastrosAlterados || [];
    const fornAuto = new Map(); // fornecedores novos das compras (um por nome/CNPJ)
    for (const tabela of C.ORDEM) {
      for (const it of itens.filter((x) => x.tabela === tabela)) {
        try {
          const v = Object.assign({}, it.valores);
          for (const k of Object.keys(v)) v[k] = C.resolver(v[k], mapa);
          if (tabela === 'itensIncorporar' && !v.fornecedorId && it.fornecedorNovo) {
            const chave = digitos(v._cnpjFornecedor).length >= 11 ? 'doc:' + digitos(v._cnpjFornecedor) : norm(it.fornecedorNovo);
            let f = fornAuto.get(chave);
            if (!f) {
              f = { id: u.id(), nome: it.fornecedorNovo, documento: limpo(v._cnpjFornecedor || ''), contato: '', criadoPelaCompra: true };
              fornAuto.set(chave, f); (grava.fornecedores = grava.fornecedores || []).push(f);
              reg.cadastrosNovos.push({ tabela: 'fornecedores', id: f.id }); sucesso.push(`Fornecedor novo (da compra): ${f.nome}`);
            }
            v.fornecedorId = f.id;
          }
          for (const k of Object.keys(v)) if (k.startsWith('_') || (tabela === 'itensIncorporar' && ['oc', 'emissao'].includes(k))) delete v[k];
          if (it.classe === 'novo') {
            const x = Object.assign({ id: u.id() }, v);
            if (tabela === 'itensIncorporar') Object.assign(x, { ativo: true, incorporados: 0, unidadeMedida: 'UN', liquidado: !!v.liquidado, descricao: VP.nome('produtos', x.produtoId) || pendentes.get([...mapa.entries()].find(([, id]) => id === x.produtoId)?.[0])?.nome || '' });
            if (tabela === 'contas' && !x.tipo) x.tipo = 'ativo';
            if (tabela === 'classificacoes' && x.naoDeprecia == null) x.naoDeprecia = false;
            if (it.tempId) mapa.set(it.tempId, x.id);
            (grava[tabela] = grava[tabela] || []).push(x);
            reg.cadastrosNovos.push({ tabela, id: x.id });
            sucesso.push(`${C.DEF[tabela].titulo} novo: ${it.descricao.split(': ').slice(1).join(': ')}`);
          } else if (it.classe === 'alterado') {
            const x = VP.db.pega(tabela, it.existenteId);
            const antes = {};
            for (const m of it.mudancas) { antes[m.k] = x[m.k] ?? null; x[m.k] = C.resolver(m.depois, mapa); }
            if (tabela === 'classificacoes') x.nivel = v.nivel || x.nivel;
            (grava[tabela] = grava[tabela] || []).push(x);
            reg.cadastrosAlterados.push({ tabela, id: x.id, antes });
            sucesso.push(`${C.DEF[tabela].titulo} alterado: ${it.descricao.split(': ').slice(1).join(': ')} (${it.mudancas.map((m) => m.t).join(', ')})`);
          }
        } catch (e) { falhas.push({ item: `${it.aba}, linha ${it.linha}`, motivo: e.message }); }
      }
    }
    return grava;
  };

  // Desfazer: os novos vão para a Lixeira (se ninguém usa) e os alterados voltam ao valor anterior
  const emUso = (tabela, id) => {
    if (tabela === 'itensIncorporar') return (VP.db.pega(tabela, id)?.incorporados || 0) > 0;
    const campo = { entidades: 'entidadeId', responsaveis: 'responsavelId', fornecedores: 'fornecedorId', classificacoes: 'classificacaoId', produtos: 'produtoId', contas: 'contaId' }[tabela];
    return !!campo && VP.db.lista('bens').some((b) => b[campo] === id);
  };
  C.desfazer = (reg, grava, sucesso, falhas) => {
    for (const { tabela, id } of (reg.cadastrosNovos || []).slice().reverse()) {
      const x = VP.db.pega(tabela, id); if (!x) continue;
      const nome = x.nome || x.descricao || x.codigo || id;
      if (emUso(tabela, id)) { falhas.push({ item: `${C.DEF[tabela]?.titulo || tabela}: ${nome}`, motivo: 'Já está em uso: continua no cadastro' }); continue; }
      x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO();
      (grava[tabela] = grava[tabela] || []).push(x); sucesso.push(`Para a Lixeira: ${C.DEF[tabela]?.titulo || tabela} ${nome}`);
    }
    for (const r of reg.cadastrosAlterados || []) {
      const x = VP.db.pega(r.tabela, r.id); if (!x) continue;
      Object.assign(x, r.antes);
      (grava[r.tabela] = grava[r.tabela] || []).push(x); sucesso.push(`Restaurado: ${C.DEF[r.tabela]?.titulo || r.tabela} ${x.nome || x.codigo}`);
    }
  };

  // ------------------------------------------------------------------ exportar (mesmas colunas da importação: dá para importar de volta)
  const mostrar = (c, v, x) => {
    if (c.k === 'oc') return x.ordemCompra?.numero ? `${x.ordemCompra.numero}/${x.ordemCompra.ano}` : '';
    if (c.k === 'empenho') return x.empenho?.numero ? `${x.empenho.numero}/${x.empenho.ano}` : '';
    if (c.k === 'emissao') return x.empenho?.emissao ? u.data(x.empenho.emissao) : '';
    if (c.k === '_cnpjFornecedor') return VP.db.pega('fornecedores', x.fornecedorId)?.documento || '';
    if (v == null || v === '') return '';
    if (c.tipo === 'ref') { const r = VP.db.pega(c.ref, v); return !r ? '' : c.ref === 'classificacoes' ? caminho(r) : c.ref === 'contas' ? r.codigo : r.nome; }
    if (c.tipo === 'opcao') { const ops = typeof c.opcoes === 'function' ? c.opcoes() : c.opcoes; return (ops.find(([k]) => k === v) || [, v])[1]; }
    if (c.tipo === 'bool') return v ? 'Sim' : 'Não';
    if (c.tipo === 'data') return u.data(v);
    return v;
  };
  C.abasExportar = () => {
    const abas = [];
    if (VP.importaUnidades) abas.push({ nome: 'Unidades', cabecalho: ['Código', 'Nome'], linhas: VP.db.lista('unidades').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true })).map((x) => [x.codigo, x.nome]) });
    for (const t of C.ORDEM) {
      const def = C.DEF[t];
      let lista = VP.db.lista(t);
      if (t === 'classificacoes') { const r = []; const desce = (pai) => lista.filter((c) => (c.paiId || '') === pai).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach((c) => { r.push(c); desce(c.id); }); desce(''); lista = r; }
      if (t === 'itensIncorporar') lista = lista.filter((x) => x.ativo !== false);
      abas.push({ nome: def.aba, cabecalho: def.campos.map((c) => c.t), linhas: lista.map((x) => def.campos.map((c) => mostrar(c, x[c.k], x))) });
    }
    return abas;
  };
  C.exportar = () => { const abas = C.abasExportar(); VP.baixarXLSX('cadastros-vitalpat', abas); return abas.reduce((n, a) => n + a.linhas.length, 0); };
})();

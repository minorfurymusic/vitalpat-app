/* VitalPat Patrimônio · Gestão — importar NOMES de unidades / centros de custo (código + nome).
   Usado junto com Exportar e importar → Importar. Lê SÓ as colunas ligadas a "Código" e "Nome":
   as outras colunas do arquivo (por exemplo, nome e matrícula de servidores) não são lidas nem guardadas.
   O arquivo pode repetir o mesmo centro em várias linhas: a prévia junta por código.
   Renomear guarda o nome anterior no histórico da unidade; desfazer volta o nome e manda as unidades novas para a Lixeira. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;
  const U = VP.importaUnidades = {};
  U.NOME = 'Unidades / centros de custo';
  U.CAMPOS = [
    { k: 'codigo', t: 'Código do centro de custo', tipo: 'texto', apelidos: ['classificacao', 'codigo', 'codigo do centro de custo', 'codigo da unidade', 'centro de custo classificacao'] },
    { k: 'nome', t: 'Nome do centro de custo', tipo: 'texto', apelidos: ['descricao', 'nome', 'nome do centro', 'nome do centro de custo', 'nome da unidade', 'unidade', 'centro de custo descricao'] }
  ];
  const provisorio = (x) => /^Centro de custo /.test(x.nome || '');
  const limpo = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

  // Prévia de uma aba já com as colunas ligadas (a.mapa). Uma linha da prévia por código.
  U.previa = (a) => {
    const iCod = a.mapa.indexOf('codigo'), iNome = a.mapa.indexOf('nome');
    const porCodigo = new Map();
    const itens = [];
    a.linhas.forEach((lin, i) => {
      const nLinha = i + 2 + (a.titulos || 0);
      const codigo = iCod >= 0 ? limpo(lin[iCod]) : '';
      const nome = iNome >= 0 ? limpo(lin[iNome]) : '';
      if (!codigo && !nome) return;
      if (!codigo || !nome) { itens.push({ aba: a.nome, cj: 'unidades', linha: nLinha, valores: { codigo, nome }, descricao: nome, plaqueta: codigo, erros: [!codigo ? 'Linha sem código' : 'Linha sem nome'], avisos: [], mudancas: [], classe: 'erro' }); return; }
      const g = porCodigo.get(codigo) || { codigo, nomes: new Map(), linha: nLinha, repet: 0 };
      g.nomes.set(nome, (g.nomes.get(nome) || 0) + 1); g.repet++;
      porCodigo.set(codigo, g);
    });
    const existentes = new Map(VP.db.lista('unidades', true).map((x) => [String(x.codigo).trim(), x]));
    for (const g of porCodigo.values()) {
      const nomes = [...g.nomes.keys()];
      const it = { aba: a.nome, cj: 'unidades', linha: g.linha, valores: { codigo: g.codigo, nome: nomes[0] }, descricao: nomes[0], plaqueta: g.codigo, erros: [], avisos: [], mudancas: [] };
      if (g.repet > 1) it.avisos.push(`Aparece em ${g.repet} linhas do arquivo (juntadas numa só)`);
      const ex = existentes.get(g.codigo);
      if (nomes.length > 1) it.erros.push(`Conflito: o mesmo código com nomes diferentes no arquivo (${nomes.join(' / ')})`);
      else if (ex && ex.excluido) it.erros.push('Esta unidade está na Lixeira; restaure-a antes');
      else if (ex) {
        it.unidadeId = ex.id;
        if (limpo(ex.nome) !== nomes[0]) {
          it.mudancas.push({ k: 'nome', t: 'Nome', antes: ex.nome, depois: nomes[0] });
          if (provisorio(ex)) it.avisos.push('Troca o nome provisório (criado pela importação de bens) pelo nome real');
        }
      }
      it.classe = it.erros.length ? 'erro' : !ex ? 'novo' : it.mudancas.length ? 'alterado' : 'igual';
      it.marcado = it.classe === 'novo' || it.classe === 'alterado';
      itens.push(it);
    }
    return itens.sort((x, y) => x.plaqueta.localeCompare(y.plaqueta, 'pt-BR', { numeric: true }));
  };

  // Aplica o que está marcado. Nada é apagado: o nome anterior vai para o histórico da unidade.
  U.aplicar = (itens, reg, extra, sucesso, falhas) => {
    reg.unidadesNovasCC = reg.unidadesNovasCC || []; reg.unidadesRenomeadas = reg.unidadesRenomeadas || [];
    extra.unidades = extra.unidades || [];
    const hoje = VP.Plataforma.hoje();
    for (const it of itens) {
      try {
        if (it.classe === 'novo') {
          const x = { id: u.id(), codigo: it.valores.codigo, nome: it.valores.nome, tipo: '', cidade: '', bairro: '', logradouro: '', responsavelId: '', criadaPorImportacao: true, historicoNomes: [] };
          extra.unidades.push(x); reg.unidadesNovasCC.push(x.id); it.criadoId = x.id;
          sucesso.push(`Unidade nova: ${x.codigo} · ${x.nome}`);
        } else if (it.classe === 'alterado') {
          const x = VP.db.pega('unidades', it.unidadeId);
          const antes = x.nome;
          x.historicoNomes = (x.historicoNomes || []).concat([{ nome: antes, ate: hoje, motivo: `Importação de nomes (${reg.arquivo || ''})` }]);
          x.nome = it.valores.nome;
          extra.unidades.push(x); reg.unidadesRenomeadas.push({ id: x.id, antes });
          sucesso.push(`Renomeada: ${x.codigo} · ${antes} → ${x.nome}`);
        }
      } catch (e) { falhas.push({ item: `${it.aba}, linha ${it.linha}`, motivo: e.message }); }
    }
  };

  // ------------------------------------------------------------------ bens que ficaram sem centro de custo
  // A ligação código → unidade é sempre feita por uma pessoa, com confirmação. Fica no histórico de cada bem.
  U.pendentes = () => {
    const m = new Map();
    for (const b of VP.db.lista('bens').filter((x) => x.centroCustoPendente && x.status !== 'baixado')) { const g = m.get(b.centroCustoPendente) || { codigo: b.centroCustoPendente, bens: [], controle: [] }; g.bens.push(b); m.set(g.codigo, g); }
    for (const x of VP.db.lista('bensControle').filter((y) => y.centroCustoPendente && y.situacao !== 'baixado')) { const g = m.get(x.centroCustoPendente) || { codigo: x.centroCustoPendente, bens: [], controle: [] }; g.controle.push(x); m.set(g.codigo, g); }
    return [...m.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  };
  U.ligar = async (codigo, unidadeId) => {
    const g = U.pendentes().find((x) => x.codigo === codigo); const un = VP.db.pega('unidades', unidadeId);
    if (!g || !un) return 0;
    const evs = [];
    for (const b of g.bens) {
      b.unidadeId = un.id; if (!b.responsavelId) b.responsavelId = un.responsavelId || '';
      b.centroCustoImportado = codigo; delete b.centroCustoPendente;
      evs.push(VP.novoEvento(b.id, 'alteracao', { descricao: `Centro de custo ${codigo} (da importação) ligado à unidade ${un.codigo} · ${un.nome}`, extra: { mudancas: [{ campo: 'Unidade', antes: `sem centro de custo (código ${codigo})`, depois: `${un.codigo} · ${un.nome}` }] } }));
    }
    for (const x of g.controle) {
      x.unidadeId = un.id; x.centroCustoImportado = codigo; delete x.centroCustoPendente;
      x.historico = (x.historico || []).concat([{ data: VP.Plataforma.agoraISO(), descricao: `Centro de custo ${codigo} ligado à unidade ${un.codigo} · ${un.nome}`, usuario: VP.sessao?.usuario || 'demonstração' }]);
    }
    await VP.db.gravarVarias({ bens: g.bens, eventos: evs, bensControle: g.controle });
    return g.bens.length + g.controle.length;
  };
  VP.telas['centros-pendentes'] = () => {
    const ui = VP.ui, esc = u.esc;
    const pode = !VP.servidor?.ativo || VP.servidor.podeAlterar();
    const lista = U.pendentes();
    const unidades = VP.db.lista('unidades').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
    return {
      titulo: 'Centros de custo pendentes',
      html: `<p class="ajuda">Bens importados com um código de centro de custo que ainda não está cadastrado. Eles estão <b>sem centro de custo</b> (pendência grave). Para cada código, escolha a unidade certa e clique em <b>Ligar</b>, ou cadastre a unidade com esse código. Nada é ligado sozinho.</p>
        ${lista.length ? `<div class="tabela-rolagem"><table class="tabela" data-sem-planilha><thead><tr><th>Código</th><th class="num">Bens</th><th class="num">Itens de controle</th><th>Ligar à unidade</th><th></th></tr></thead><tbody>
        ${lista.map((g) => { const sug = unidades.find((x) => String(x.codigo) === g.codigo); return `<tr><td><b>${esc(g.codigo)}</b></td><td class="num">${u.inteiro(g.bens.length)}</td><td class="num">${u.inteiro(g.controle.length)}</td>
          <td>${pode ? `<select data-cc-un="${esc(g.codigo)}"><option value="">Escolha…</option>${unidades.map((x) => `<option value="${esc(x.id)}" ${sug && sug.id === x.id ? 'selected' : ''}>${esc(x.codigo)} · ${esc(x.nome)}</option>`).join('')}</select>${sug ? ' <small>(mesmo código)</small>' : ''}` : ''}</td>
          <td>${pode ? `<button class="botao pequeno primario" data-cc-ligar="${esc(g.codigo)}">Ligar</button> ${sug ? '' : `<button class="botao pequeno" data-cc-criar="${esc(g.codigo)}">Cadastrar unidade com este código</button>`}` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<p class="vazio">Nenhum bem sem centro de custo.</p>'}`,
      ligar() {
        document.querySelectorAll('[data-cc-ligar]').forEach((b) => b.addEventListener('click', async () => {
          const cod = b.dataset.ccLigar; const unId = document.querySelector(`[data-cc-un="${CSS.escape(cod)}"]`).value;
          if (!unId) return ui.aviso('Escolha a unidade.', 'erro');
          const un = VP.db.pega('unidades', unId); const g = U.pendentes().find((x) => x.codigo === cod);
          if (!await ui.confirmar(`Ligar <b>${g.bens.length + g.controle.length}</b> bem(ns) do código <b>${esc(cod)}</b> à unidade <b>${esc(un.codigo)} · ${esc(un.nome)}</b>?<br>Fica no histórico de cada bem. Se estiver errado, use Transferência depois.`, { sim: 'Ligar' })) return;
          const n = await U.ligar(cod, unId);
          ui.resultado({ titulo: 'Centro de custo ligado', sucesso: [`${u.inteiro(n)} bem(ns) do código ${cod} → ${un.codigo} · ${un.nome}`] });
          VP.app.render();
        }));
        document.querySelectorAll('[data-cc-criar]').forEach((b) => b.addEventListener('click', () => ui.formulario({
          titulo: `Cadastrar unidade ${b.dataset.ccCriar}`, largura: 'media', valores: { codigo: b.dataset.ccCriar },
          campos: [{ chave: 'codigo', rotulo: 'Código', obrigatorio: true }, { chave: 'nome', rotulo: 'Nome do centro de custo', obrigatorio: true }],
          salvar: async (v) => {
            if (VP.db.lista('unidades', true).some((x) => String(x.codigo) === v.codigo)) return 'Já existe unidade com este código (veja a Lixeira).';
            await VP.db.gravar('unidades', { id: u.id(), codigo: v.codigo, nome: v.nome, tipo: '', cidade: '', bairro: '', logradouro: '', responsavelId: '', historicoNomes: [] });
            ui.aviso('Unidade cadastrada. Agora clique em Ligar.'); VP.app.render();
          }
        })));
      }
    };
  };

  U.desfazer = (reg, grava, sucesso, falhas) => {
    const lista = [];
    for (const id of reg.unidadesNovasCC || []) {
      const x = VP.db.pega('unidades', id); if (!x) continue;
      if (VP.db.lista('bens').some((b) => b.unidadeId === id)) { falhas.push({ item: `${x.codigo} · ${x.nome}`, motivo: 'Já tem bens: a unidade continua (mova os bens antes, se quiser tirá-la)' }); continue; }
      x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO(); lista.push(x); sucesso.push(`Para a Lixeira: ${x.codigo} · ${x.nome}`);
    }
    for (const r of reg.unidadesRenomeadas || []) {
      const x = VP.db.pega('unidades', r.id); if (!x) continue;
      x.historicoNomes = (x.historicoNomes || []).concat([{ nome: x.nome, ate: VP.Plataforma.hoje(), motivo: 'Importação de nomes desfeita' }]);
      x.nome = r.antes; lista.push(x); sucesso.push(`Nome restaurado: ${x.codigo} · ${x.nome}`);
    }
    if (lista.length) grava.unidades = (grava.unidades || []).concat(lista);
  };
})();

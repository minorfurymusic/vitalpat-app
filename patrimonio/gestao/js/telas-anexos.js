/* VitalPat Patrimônio · Gestão — anexos dos bens: cadastro com tipo, renomear, tirar (Lixeira), exportar em .zip e importar em lote.
   Nome dos arquivos (exportar e importar): plaqueta_descricao_01.ext — ex.: 123_cadeira_presidente_01.jpg.
   Na importação, a plaqueta é o que vem antes do primeiro "_". Nada é gravado antes da prévia; dá para desfazer. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, L = VP.LISTAS;
  const X = VP.anexos = {};
  const pode = () => !VP.servidor?.ativo || VP.servidor.podeAlterar();
  X.TIPOS = ['Foto', 'Nota fiscal', 'Termo de responsabilidade assinado', 'Laudo', 'Contrato', 'Matrícula', 'Outro'];
  X.LIMITE_MB = 10;

  // ------------------------------------------------------------------ nomes
  X.simplificar = (t, max = 40) => u.normalizar(t).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max).replace(/_+$/, '') || 'bem';
  const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
  // Extensão pelo conteúdo real: a foto é reduzida e vira JPEG ao entrar no sistema, mesmo que o nome original seja .png
  X.extensao = (a) => {
    const dm = String(a.dataURL || '').match(/^data:([^;,]+)/);
    if (dm && MIME_EXT[dm[1]]) return MIME_EXT[dm[1]];
    const cm = String(a.caminho || '').match(/\.([a-z0-9]{1,5})$/i);
    if (cm && cm[1] !== 'bin') return cm[1].toLowerCase();
    const m = String(a.nome || '').match(/\.([a-z0-9]{1,5})$/i);
    return (m ? m[1] : MIME_EXT[a.tipo] || 'bin').toLowerCase();
  };
  X.nomeArquivo = (b, ordem, a) => `${String(b.plaqueta || b.codigo).trim()}_${X.simplificar(b.descricao)}_${String(ordem).padStart(2, '0')}.${X.extensao(a)}`;
  // tipo sugerido pelo nome/arquivo
  X.tipoSugerido = (nome, mime) => {
    const n = u.normalizar(nome);
    if (/(^|[_\W])(nf|nfe|nota)/.test(n)) return 'Nota fiscal';
    if (/termo/.test(n)) return 'Termo de responsabilidade assinado';
    if (/laudo/.test(n)) return 'Laudo';
    if (/contrato/.test(n)) return 'Contrato';
    if (/matricula/.test(n)) return 'Matrícula';
    if (/^image\//.test(mime || '') || /\.(jpe?g|png|webp|gif|heic)$/.test(n)) return 'Foto';
    return 'Outro';
  };
  const ehImagem = (a) => /^image\//.test(a.tipo || '') || /\.(jpe?g|png|webp|gif)$/i.test(a.nome || '');

  // Todos os arquivos de um bem, na ordem da numeração: fotos da ficha primeiro, depois os anexos (sem os retirados)
  X.arquivosDoBem = (b, tipos = null) => {
    const l = (b.fotos || []).filter((f) => f.dataURL || f.caminho).map((f) => ({ a: f, tipoAnexo: 'Foto', origem: 'foto' }))
      .concat((b.anexos || []).filter((a) => !a.excluido && (a.dataURL || a.caminho)).map((a) => ({ a, tipoAnexo: a.tipoAnexo || (ehImagem(a) ? 'Foto' : 'Outro'), origem: 'anexo' })));
    return tipos ? l.filter((x) => tipos.includes(x.tipoAnexo)) : l;
  };

  // ------------------------------------------------------------------ ficha do bem
  X.secaoFicha = (b) => {
    const ativos = (b.anexos || []).filter((a) => !a.excluido);
    const retirados = (b.anexos || []).filter((a) => a.excluido);
    const baixado = b.status === 'baixado';
    return `<section class="cartao secao" id="sec-anexos"><header><h3>Anexos (${ativos.length})</h3><span class="linha-botoes">
        ${!baixado && pode() ? '<button class="botao pequeno" data-anexo-novo>+ Anexar</button><button class="botao pequeno" data-anexo-novo="Termo de responsabilidade assinado">+ Termo assinado</button>' : ''}
        ${X.arquivosDoBem(b).length ? '<button class="botao pequeno" data-anexo-zip>Baixar todos (.zip)</button>' : ''}</span></header>
      <p class="ajuda">Fotos, nota fiscal (PDF), termo de responsabilidade assinado, laudos, contratos. Ao exportar, cada arquivo sai com o nome <code>${esc(X.nomeArquivo(b, 1, { nome: 'x.jpg' }).replace(/\.jpg$/, '.ext'))}</code>.</p>
      ${ativos.length ? `<ul class="anexos-lista">${ativos.map((a) => `<li>${ehImagem(a) && a.dataURL ? `<img src="${esc(a.dataURL)}" alt="">` : `<span class="anexo-icone">${esc(X.extensao(a).toUpperCase())}</span>`}
          <span class="anexo-nome"><a href="${esc(a.dataURL || '#')}" download="${esc(a.nome)}" target="_blank" rel="noopener">${esc(a.descricao || a.nome)}</a><br><small>${esc(a.tipoAnexo || (ehImagem(a) ? 'Foto' : 'Outro'))} · ${esc(a.nome)} · ${u.data(a.data)}${a.tamanho ? ` · ${(a.tamanho / 1024).toFixed(0)} KB` : ''}</small></span>
          ${!baixado && pode() ? `<button class="botao pequeno" data-anexo-editar="${esc(a.id)}">Renomear</button><button class="botao pequeno" data-anexo-tirar="${esc(a.id)}">Tirar</button>` : ''}</li>`).join('')}</ul>` : '<p class="vazio">Nenhum anexo.</p>'}
      ${retirados.length ? `<details><summary>${retirados.length} anexo(s) retirado(s) — ficam guardados</summary><ul class="anexos-lista">${retirados.map((a) => `<li><span class="anexo-nome">${esc(a.descricao || a.nome)} <small>(${esc(a.tipoAnexo || '')}, retirado em ${u.data((a.excluidoEm || '').slice(0, 10))})</small></span>${pode() ? `<button class="botao pequeno" data-anexo-restaurar="${esc(a.id)}">Restaurar</button>` : ''}</li>`).join('')}</ul></details>` : ''}
    </section>`;
  };
  X.ligarFicha = (b, re) => {
    const area = document.getElementById('conteudo');
    area.querySelectorAll('[data-anexo-novo]').forEach((el) => el.addEventListener('click', () => X.anexar(b, re, el.dataset.anexoNovo || '')));
    area.querySelector('[data-anexo-zip]')?.addEventListener('click', () => X.baixarZip([b], null, `anexos-${b.plaqueta}`));
    const acha = (id) => (b.anexos || []).find((a) => a.id === id);
    area.querySelectorAll('[data-anexo-editar]').forEach((el) => el.addEventListener('click', () => X.editar(b, acha(el.dataset.anexoEditar), re)));
    area.querySelectorAll('[data-anexo-tirar]').forEach((el) => el.addEventListener('click', () => X.tirar(b, acha(el.dataset.anexoTirar), re)));
    area.querySelectorAll('[data-anexo-restaurar]').forEach((el) => el.addEventListener('click', async () => {
      const a = acha(el.dataset.anexoRestaurar); delete a.excluido; delete a.excluidoEm;
      await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Anexo restaurado: ${a.nome}` })] });
      ui.aviso('Anexo restaurado.'); re();
    }));
  };
  X.anexar = (b, depois, tipo = '') => ui.formulario({
    titulo: 'Anexar arquivos — ' + b.descricao, largura: 'pequena', textoSalvar: 'Anexar',
    campos: [
      { chave: 'tipoAnexo', rotulo: 'Tipo', tipo: 'select', opcoes: X.TIPOS.map((t) => [t, t]), vazio: !tipo, padrao: tipo || '', ajuda: 'Vazio = o sistema escolhe pelo arquivo (imagem = Foto).' },
      { chave: 'descricao', rotulo: 'Descrição (opcional)', placeholder: 'Ex.: Termo assinado por Fulano em 10/10' },
      { chave: 'arquivos', rotulo: `Arquivos (fotos, PDF; até ${X.LIMITE_MB} MB cada)`, tipo: 'arquivo', multiplo: true, obrigatorio: true }],
    salvar: async (v) => {
      if (!v.arquivos?.length) return 'Escolha um arquivo.';
      const grandes = [...v.arquivos].filter((f) => f.size > X.LIMITE_MB * 1048576);
      if (grandes.length) return `Arquivo maior que ${X.LIMITE_MB} MB: ${grandes.map((f) => f.name).join(', ')}. Reduza antes de anexar.`;
      const arqs = await ui.lerArquivos(v.arquivos);
      for (const a of arqs) { a.tipoAnexo = v.tipoAnexo || X.tipoSugerido(a.nome, a.tipo); if (v.descricao) a.descricao = v.descricao; }
      b.anexos = (b.anexos || []).concat(arqs);
      await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Anexado (${arqs.map((a) => a.tipoAnexo).filter((x, i, l) => l.indexOf(x) === i).join(', ')}): ${arqs.map((a) => a.nome).join(', ')}` })] });
      ui.aviso(`${arqs.length} arquivo(s) anexado(s).`);
      depois && depois();
    }
  });
  X.editar = (b, a, depois) => ui.formulario({
    titulo: 'Renomear anexo', largura: 'pequena',
    campos: [{ chave: 'tipoAnexo', rotulo: 'Tipo', tipo: 'select', opcoes: X.TIPOS.map((t) => [t, t]), vazio: false }, { chave: 'descricao', rotulo: 'Descrição' }, { chave: 'nome', rotulo: 'Nome do arquivo', obrigatorio: true }],
    valores: { tipoAnexo: a.tipoAnexo || (ehImagem(a) ? 'Foto' : 'Outro'), descricao: a.descricao || '', nome: a.nome },
    salvar: async (v) => {
      const antes = `${a.tipoAnexo || ''} · ${a.descricao || ''} · ${a.nome}`;
      Object.assign(a, { tipoAnexo: v.tipoAnexo, descricao: v.descricao, nome: v.nome.trim() });
      await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: 'Anexo renomeado', extra: { mudancas: [{ campo: 'Anexo', antes, depois: `${a.tipoAnexo} · ${a.descricao || ''} · ${a.nome}` }] } })] });
      ui.aviso('Anexo atualizado.'); depois && depois();
    }
  });
  X.tirar = async (b, a, depois) => {
    if (!await ui.confirmar(`Tirar o anexo <b>${esc(a.descricao || a.nome)}</b>? Ele fica guardado em "anexos retirados" e pode ser restaurado.`, { titulo: 'Tirar anexo', sim: 'Tirar', classe: 'perigo' })) return;
    a.excluido = true; a.excluidoEm = VP.Plataforma.agoraISO();
    await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Anexo retirado: ${a.nome}` })] });
    ui.aviso('Anexo retirado.'); depois && depois();
  };

  // ------------------------------------------------------------------ exportar em .zip
  const bytesDe = async (a) => {
    if (!a.dataURL) throw new Error('arquivo sem conteúdo disponível');
    const r = await fetch(a.dataURL);
    if (!r.ok) throw new Error('não foi possível baixar (' + r.status + ')');
    return new Uint8Array(await r.arrayBuffer());
  };
  X.montarZip = async (bens, tipos) => {
    const arquivos = [], indice = [], falhas = [];
    for (const b of bens) {
      let ordem = 0;
      for (const x of X.arquivosDoBem(b, tipos)) {
        ordem++;
        const nome = X.nomeArquivo(b, ordem, x.a);
        try { arquivos.push({ nome, dados: await bytesDe(x.a) }); indice.push([nome, b.plaqueta, b.descricao, x.tipoAnexo, x.a.descricao || '', x.a.nome || '']); } catch (e) { falhas.push({ item: `${b.plaqueta} · ${x.a.nome}`, motivo: e.message }); }
      }
    }
    if (arquivos.length) arquivos.push({ nome: 'lista-dos-arquivos.xlsx', dados: new Uint8Array(await VP.gravarXLSX([{ nome: 'Arquivos', cabecalho: ['Arquivo', 'Plaqueta', 'Bem', 'Tipo', 'Descrição', 'Nome original'], linhas: indice }]).arrayBuffer()) });
    return { blob: arquivos.length ? VP.gravarZip(arquivos) : null, n: indice.length, falhas, nomes: indice.map((i) => i[0]) };
  };
  X.baixarZip = async (bens, tipos, nome = 'anexos') => {
    ui.aviso('Preparando o arquivo…');
    const r = await X.montarZip(bens, tipos);
    if (!r.n) return ui.aviso('Nenhum arquivo para exportar neste filtro.', 'erro');
    VP.baixarBlob(`${nome}-${VP.Plataforma.hoje()}.zip`, r.blob);
    if (r.falhas.length) ui.resultado({ titulo: 'Exportação de anexos', sucesso: r.nomes, falhas: r.falhas });
    else ui.aviso(`${r.n} arquivo(s) no .zip.`);
    return r;
  };

  // ------------------------------------------------------------------ importar em lote
  const st = () => (VP.estado.impAnexos = VP.estado.impAnexos || { itens: null });
  X.plaquetaDoNome = (nome) => { const base = String(nome).split(/[\\/]/).pop().replace(/\.[a-z0-9]{1,5}$/i, ''); return base.split('_')[0].trim(); };
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
  X.lerEntrada = async (lista) => {
    const arquivos = [];
    for (const f of lista) {
      if (/\.zip$/i.test(f.name)) {
        const z = await VP.abrirZip(await f.arrayBuffer());
        for (const n of z.nomes) {
          if (n.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(n) || /lista-dos-arquivos\.xlsx$/i.test(n)) continue;
          const nome = n.split('/').pop();
          const ext = (nome.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
          arquivos.push(new File([await z.bytes(n)], nome, { type: MIME[ext] || 'application/octet-stream' }));
        }
      } else arquivos.push(f);
    }
    return arquivos;
  };
  X.gerarPrevia = (arquivos) => {
    const bens = VP.db.lista('bens');
    const porPlaqueta = new Map(bens.map((b) => [String(b.plaqueta).trim(), b]));
    const itens = arquivos.map((f, i) => {
      const pl = X.plaquetaDoNome(f.name);
      const b = porPlaqueta.get(pl) || (/^\d+$/.test(pl) ? porPlaqueta.get(String(Number(pl))) : null);
      const it = { i, nome: f.name, tamanho: f.size, plaqueta: pl, bemId: b?.id || '', tipoAnexo: X.tipoSugerido(f.name, f.type), classe: 'ok', motivo: '' };
      if (!pl || !f.name.includes('_')) { it.classe = 'erro'; it.motivo = 'O nome não segue o padrão plaqueta_descricao_01 (falta o "_")'; }
      if (it.classe === 'ok' && !b) { it.classe = 'erro'; it.motivo = `Nenhum bem com a plaqueta ${pl}`; }
      else if (b && b.status === 'baixado') { it.classe = 'erro'; it.motivo = 'Bem baixado (só consulta)'; }
      else if (f.size > X.LIMITE_MB * 1048576) { it.classe = 'erro'; it.motivo = `Maior que ${X.LIMITE_MB} MB`; }
      else if (b && (b.anexos || []).some((a) => !a.excluido && a.nome === f.name)) { it.classe = 'repetido'; it.motivo = 'Este bem já tem um anexo com este nome (marque se quiser anexar de novo)'; }
      it.marcado = it.classe === 'ok';
      return it;
    });
    const s = st(); s.arquivos = arquivos; s.itens = itens;
    return itens;
  };
  X.aplicar = async () => {
    const s = st();
    const marcados = s.itens.filter((x) => x.marcado && x.classe !== 'erro');
    const porBem = new Map();
    for (const it of marcados) { if (!porBem.has(it.bemId)) porBem.set(it.bemId, []); porBem.get(it.bemId).push(it); }
    const reg = { id: u.id(), data: VP.Plataforma.agoraISO(), usuario: VP.sessao?.usuario || 'demonstração', itens: [] };
    const bens = [], eventos = [], sucesso = [], falhas = [];
    for (const [bemId, its] of porBem) {
      const b = VP.db.pega('bens', bemId);
      try {
        const lidos = await ui.lerArquivos(its.map((it) => s.arquivos[it.i]));
        lidos.forEach((a, k) => { a.tipoAnexo = its[k].tipoAnexo; a.origem = 'importação em lote'; reg.itens.push({ bemId, anexoId: a.id }); sucesso.push(`${b.plaqueta} · ${b.descricao}: ${a.nome} (${a.tipoAnexo})`); });
        b.anexos = (b.anexos || []).concat(lidos);
        bens.push(b);
        eventos.push(VP.novoEvento(b.id, 'alteracao', { descricao: `Anexos importados em lote: ${lidos.map((a) => a.nome).join(', ')}` }));
      } catch (e) { its.forEach((it) => falhas.push({ item: it.nome, motivo: e.message })); }
    }
    for (const it of s.itens.filter((x) => x.classe === 'erro' || (x.classe === 'repetido' && !x.marcado))) falhas.push({ item: it.nome, motivo: it.motivo });
    if (reg.itens.length) await VP.db.gravarVarias({ bens, eventos, importacoesAnexos: [reg] });
    s.itens = null; s.arquivos = null;
    ui.resultado({ titulo: 'Resultado da importação de anexos', sucesso, falhas });
    return { sucesso, falhas, reg };
  };
  X.desfazer = async (reg) => {
    const porBem = new Map();
    for (const x of reg.itens) { if (!porBem.has(x.bemId)) porBem.set(x.bemId, new Set()); porBem.get(x.bemId).add(x.anexoId); }
    const bens = [], eventos = [], sucesso = [], falhas = [];
    for (const [bemId, ids] of porBem) {
      const b = VP.db.pega('bens', bemId);
      if (!b) { falhas.push({ item: bemId, motivo: 'Bem não encontrado' }); continue; }
      for (const a of (b.anexos || []).filter((x) => ids.has(x.id) && !x.excluido)) { a.excluido = true; a.excluidoEm = VP.Plataforma.agoraISO(); sucesso.push(`${b.plaqueta}: ${a.nome}`); }
      bens.push(b); eventos.push(VP.novoEvento(b.id, 'alteracao', { descricao: 'Importação de anexos desfeita: anexos retirados (podem ser restaurados na ficha)' }));
    }
    reg.desfeitoEm = VP.Plataforma.agoraISO();
    await VP.db.gravarVarias({ bens, eventos, importacoesAnexos: [reg] });
    ui.resultado({ titulo: 'Importação de anexos desfeita', sucesso, falhas });
  };

  // ------------------------------------------------------------------ tela "Anexos em lote" (dentro de Exportar e importar)
  const CL = { ok: ['im-bom', 'Pronto'], repetido: ['im-regular', 'Já existe'], erro: ['im-ruim', 'Não entra'] };
  VP.anexosLote = {
    tela(nav) {
      const f = VP.estado.expAnexos = VP.estado.expAnexos || { cj: 'movel', unidadeId: '', tipos: X.TIPOS.slice() };
      const P = VP.planilhas;
      const bensFiltro = () => VP.db.lista('bens').filter((b) => P.CONJUNTOS[f.cj].tipos.includes(b.tipo) && (!f.unidadeId || b.unidadeId === f.unidadeId));
      const qtdArq = bensFiltro().reduce((t, b) => t + X.arquivosDoBem(b, f.tipos).length, 0);
      const s = st();
      const hist = VP.db.lista('importacoesAnexos').sort((a, b) => String(b.data).localeCompare(String(a.data)));
      return {
        titulo: 'Exportar e importar',
        html: `${nav}
          <section class="cartao"><h3>Exportar anexos (.zip)</h3>
            <p class="ajuda">Sai um arquivo .zip com as fotos e documentos dos bens do filtro. Cada arquivo recebe o nome <b>plaqueta_descricao_01</b> (ex.: <code>123_cadeira_presidente_01.jpg</code>), numerado na ordem dentro de cada bem. Vai junto uma planilha com a lista dos arquivos.</p>
            <div class="linha-filtros">
              <label>Bens <select data-xa="cj">${Object.entries(P.CONJUNTOS).map(([k, x]) => `<option value="${k}" ${k === f.cj ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
              <label>Unidade <select data-xa="unidadeId"><option value="">Todas</option>${VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => `<option value="${esc(x.id)}" ${x.id === f.unidadeId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
            </div>
            <div class="lista-marcar">${X.TIPOS.map((t) => `<label><input type="checkbox" data-xa-tipo value="${esc(t)}" ${f.tipos.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
            <p><b>${u.inteiro(qtdArq)}</b> arquivo(s) neste filtro. <button class="botao primario" data-xa-baixar ${qtdArq ? '' : 'disabled'}>Baixar .zip</button></p>
          </section>
          <section class="cartao"><h3>Importar anexos em lote</h3>
            <p class="ajuda">Escolha vários arquivos (ou um .zip). O nome de cada um deve começar pela <b>plaqueta</b>, depois <b>_</b>, uma descrição curta e a ordem: <code>123_cadeira_presidente_01.jpg</code>, <code>123_cadeira_presidente_02.jpg</code>, <code>123_nota_fiscal_01.pdf</code>. O sistema acha o bem pela plaqueta e sugere o tipo pelo nome (foto, nota, termo, laudo…). Nada é gravado antes da sua confirmação.</p>
            ${pode() ? '<label class="botao primario">Escolher arquivos<input type="file" multiple accept="image/*,.pdf,.zip,.doc,.docx,.xls,.xlsx,.odt,.txt" data-ia-arquivos hidden></label>' : '<p class="aviso-inline">Seu acesso é só de consulta.</p>'}
            ${s.itens ? `<div id="previa-anexos"><h4>Prévia (${u.inteiro(s.itens.length)} arquivo(s))</h4>
              <div class="resumo-linha">${VP.graficos.numero('Prontos', u.inteiro(s.itens.filter((x) => x.classe === 'ok').length))}${VP.graficos.numero('Já existem', u.inteiro(s.itens.filter((x) => x.classe === 'repetido').length))}${VP.graficos.numero('Não entram', u.inteiro(s.itens.filter((x) => x.classe === 'erro').length))}</div>
              <div class="tabela-rolagem"><table class="tabela" id="tab-previa-anexos"><thead><tr><th></th><th>Situação</th><th>Arquivo</th><th>Bem</th><th>Tipo</th><th>Motivo</th></tr></thead><tbody>
              ${s.itens.map((x) => { const b = x.bemId ? VP.db.pega('bens', x.bemId) : null; return `<tr><td>${x.classe !== 'erro' ? `<input type="checkbox" data-ia-item="${x.i}" ${x.marcado ? 'checked' : ''} aria-label="Importar este arquivo">` : ''}</td><td><span class="selo-status ${CL[x.classe][0]}">${CL[x.classe][1]}</span></td><td>${esc(x.nome)}</td><td>${b ? `<a href="#bem/${esc(b.id)}">${esc(b.plaqueta)} · ${esc(b.descricao)}</a>` : esc(x.plaqueta)}</td>
                <td>${x.classe !== 'erro' ? `<select data-ia-tipo="${x.i}">${X.TIPOS.map((t) => `<option ${t === x.tipoAnexo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}</td><td>${esc(x.motivo)}</td></tr>`; }).join('')}
              </tbody></table></div>
              <p class="linha-botoes"><button class="botao primario" data-ia-aplicar>Importar o que está marcado</button> <button class="botao" data-ia-descartar>Descartar</button></p></div>` : ''}
          </section>
          <section class="cartao"><h3>Importações de anexos feitas</h3>${hist.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Data</th><th>Quem</th><th class="num">Arquivos</th><th></th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(new Date(h.data).toLocaleString('pt-BR'))}</td><td>${esc(h.usuario || '')}</td><td class="num">${u.inteiro(h.itens.length)}</td><td>${h.desfeitoEm ? `Desfeita em ${u.data(h.desfeitoEm.slice(0, 10))}` : pode() ? `<button class="botao pequeno" data-ia-desfazer="${esc(h.id)}">Desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhuma ainda.</p>'}</section>`,
        ligar() {
          const re = () => VP.app.render();
          document.querySelectorAll('[data-xa]').forEach((el) => el.addEventListener('change', () => { f[el.dataset.xa] = el.value; re(); }));
          document.querySelectorAll('[data-xa-tipo]').forEach((el) => el.addEventListener('change', () => { f.tipos = [...document.querySelectorAll('[data-xa-tipo]:checked')].map((i) => i.value); re(); }));
          document.querySelector('[data-xa-baixar]')?.addEventListener('click', () => X.baixarZip(bensFiltro(), f.tipos, `anexos-${u.normalizar(P.CONJUNTOS[f.cj].nome).replace(/\s+/g, '-')}`));
          document.querySelector('[data-ia-arquivos]')?.addEventListener('change', async (e) => {
            const lista = [...e.target.files]; e.target.value = '';
            if (!lista.length) return;
            try { X.gerarPrevia(await X.lerEntrada(lista)); } catch (err) { return ui.aviso(err.message, 'erro'); }
            re();
          });
          document.querySelectorAll('[data-ia-item]').forEach((el) => el.addEventListener('change', () => { s.itens[el.dataset.iaItem].marcado = el.checked; }));
          document.querySelectorAll('[data-ia-tipo]').forEach((el) => el.addEventListener('change', () => { s.itens[el.dataset.iaTipo].tipoAnexo = el.value; }));
          document.querySelector('[data-ia-descartar]')?.addEventListener('click', () => { s.itens = null; s.arquivos = null; re(); });
          document.querySelector('[data-ia-aplicar]')?.addEventListener('click', async (e) => {
            const n = s.itens.filter((x) => x.marcado && x.classe !== 'erro').length;
            if (!n) return ui.aviso('Nada marcado para importar.', 'erro');
            if (!await ui.confirmar(`Anexar ${u.inteiro(n)} arquivo(s) aos bens?`, { titulo: 'Importar anexos', sim: 'Importar' })) return;
            e.target.disabled = true;
            try { await X.aplicar(); } catch (err) { ui.aviso('Não foi possível gravar: ' + err.message, 'erro'); }
            re();
          });
          document.querySelectorAll('[data-ia-desfazer]').forEach((b) => b.addEventListener('click', async () => {
            const reg = VP.db.pega('importacoesAnexos', b.dataset.iaDesfazer);
            if (!await ui.confirmar(`Desfazer esta importação? Os ${reg.itens.length} anexo(s) são retirados dos bens (ficam guardados e podem ser restaurados na ficha).`, { titulo: 'Desfazer importação de anexos', sim: 'Desfazer', classe: 'perigo' })) return;
            await X.desfazer(reg); re();
          }));
        }
      };
    }
  };
})();

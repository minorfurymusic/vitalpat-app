/* VitalPat Patrimônio · Gestão — leitura da matrícula do imóvel (PDF do cartório).
   Tira o texto do PDF com o pdf.js (Mozilla, Apache-2.0, vendor/pdfjs) e procura os dados por regras de texto.
   Nada entra sozinho: a pessoa confere campo a campo antes de gravar. O PDF fica anexado como "Matrícula".
   Limitação: matrícula escaneada (imagem) não tem texto; ler isso exige reconhecimento de texto (OCR) — pendência. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui;
  const M = VP.matricula = {};
  const pega = (o, c) => c.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const poe = (o, c, v) => { const ks = c.split('.'); let x = o; for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; } x[ks.at(-1)] = v; };

  // ------------------------------------------------------------------ texto do PDF
  let pdfjs = null;
  const carregar = async () => {
    if (pdfjs) return pdfjs;
    pdfjs = await import(new URL('vendor/pdfjs/pdf.min.js', document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;
    return pdfjs;
  };
  M.textoDoPDF = async (arquivo) => {
    const lib = await carregar();
    const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
    let texto = '';
    for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      texto += tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    return { texto: texto.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n'), paginas: doc.numPages };
  };

  // ------------------------------------------------------------------ regras de leitura (expressões)
  const numBR = (s) => u.num(String(s).replace(/\s/g, ''));
  const ultimo = (re, t) => { let m, r = null; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); while ((m = g.exec(t))) r = m; return r; };
  M.extrair = (texto) => {
    const t = texto.replace(/ /g, ' ');
    const r = {};
    let m = t.match(/MATR[ÍI]CULA\s*(?:N[º°o]\.?|N\.?\s*[º°o]|n[úu]mero)?\s*[:\-–]?\s*(\d[\d.]{0,12})/i);
    if (m) r.matricula = m[1].replace(/\.$/, '');
    m = t.match(/[^\n]*(?:Registro\s+de\s+Im[óo]veis|Of[íi]cio\s+de\s+Registro|Cart[óo]rio\s+de\s+Registro)[^\n]*/i);
    if (m) r.cartorio = m[0].trim().replace(/\s{2,}/g, ' ').slice(0, 120);
    m = t.match(/[áa]rea\s+(?:total\s+|superficial\s+|do\s+terreno\s+)?(?:de\s+|com\s+)?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*(?:m²|m2|metros\s+quadrados)/i);
    if (m) r.areaTerreno = numBR(m[1]);
    m = t.match(/[áa]rea\s+constru[íi]da\s+(?:de\s+)?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*(?:m²|m2|metros\s+quadrados)/i);
    if (m) r.areaConstruida = numBR(m[1]);
    m = t.match(/inscri[çc][ãa]o\s+(?:imobili[áa]ria|cadastral|municipal|no\s+cadastro\s+imobili[áa]rio)\s*(?:n[º°o]\.?)?\s*[:\-–]?\s*([\d][\d.\-/]{3,30}\d)/i);
    if (m) r.inscricaoIptu = m[1];
    m = t.match(/(?:situad[oa]|localizad[oa]|sito|sita)\s+(?:na|no|à|a|em)\s+((?:Rua|Avenida|Av\.|Rodovia|Travessa|Estrada|Alameda|Servid[ãa]o|Pra[çc]a)\s[^,;\n]{2,80}(?:,\s*(?:n[º°o]\.?\s*)?\d+)?)/i);
    if (m) r.logradouro = m[1].trim();
    m = t.match(/bairro\s+(?:de\s+|do\s+|da\s+)?([A-ZÀ-Ú][\wÀ-ú ]{1,40}?)(?=\s*[,.;\n]|\s+(?:no|na|em|munic|cidade|com))/i);
    if (m) r.bairro = m[1].trim();
    const pr = ultimo(/(?:PROPRIET[ÁA]RI[OA]S?|ADQUIRENTES?|OUTORGAD[OA]S?\s+COMPRADOR(?:A|ES|AS)?|TRANSMITENTE\s+PARA)\s*[:\-–]\s*([^\n;]{3,140})/i, t);
    if (pr) r.proprietario = pr[1].trim().replace(/[,.]$/, '');
    const dt = ultimo(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/, t);
    if (dt) r.ultimoRegistro = `${dt[3]}-${dt[2].padStart(2, '0')}-${dt[1].padStart(2, '0')}`;
    return r;
  };
  // campo lido → onde fica no bem
  M.CAMPOS = [
    { k: 'matricula', t: 'Matrícula', caminho: 'imovel.matricula' },
    { k: 'cartorio', t: 'Cartório', caminho: 'imovel.cartorio' },
    { k: 'areaTerreno', t: 'Área do terreno (m²)', caminho: 'imovel.areaTerreno', num: true },
    { k: 'areaConstruida', t: 'Área construída (m²)', caminho: 'imovel.areaConstruida', num: true },
    { k: 'inscricaoIptu', t: 'Inscrição imobiliária (IPTU)', caminho: 'imovel.inscricaoIptu' },
    { k: 'logradouro', t: 'Endereço', caminho: 'endereco.logradouro' },
    { k: 'bairro', t: 'Bairro', caminho: 'endereco.bairro' },
    { k: 'proprietario', t: 'Proprietário na matrícula', caminho: 'imovel.proprietarioMatricula' },
    { k: 'ultimoRegistro', t: 'Data do último registro', caminho: 'imovel.ultimoRegistroMatricula', data: true }
  ];
  const mostrar = (c, v) => (v == null || v === '' ? '' : c.data ? u.data(v) : c.num ? String(v).replace('.', ',') : String(v));

  // ------------------------------------------------------------------ ler e conferir
  M.ler = async (arquivo) => {
    if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== 'application/pdf') throw new Error('Escolha o PDF da matrícula.');
    const { texto, paginas } = await M.textoDoPDF(arquivo);
    if (texto.replace(/\s/g, '').length < 40) return { imagem: true, paginas, campos: {} };
    return { imagem: false, paginas, campos: M.extrair(texto), texto };
  };
  const escolherArquivo = () => new Promise((ok) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,application/pdf';
    i.addEventListener('change', () => ok(i.files[0] || null)); i.click();
  });
  // Formulário de conferência: lido × atual, a pessoa marca o que entra
  const conferencia = (lido, b) => `<div class="tabela-rolagem"><table class="tabela" id="tab-matricula"><thead><tr><th>Usar</th><th>Informação</th><th>Lido na matrícula (pode corrigir)</th><th>Hoje no sistema</th></tr></thead><tbody>
    ${M.CAMPOS.map((c) => { const v = lido.campos[c.k]; const atual = b ? pega(b, c.caminho) : ''; return `<tr><td><input type="checkbox" data-mat-usar="${c.k}" ${v != null && v !== '' && String(v) !== String(atual ?? '') ? 'checked' : ''} aria-label="Usar ${esc(c.t)}"></td><td>${esc(c.t)}</td><td><input data-mat-valor="${c.k}" value="${esc(mostrar(c, v))}" placeholder="não encontrado"></td><td>${esc(mostrar(c, atual)) || '—'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  const lerConferencia = (d) => {
    const r = {};
    for (const c of M.CAMPOS) {
      if (!d.querySelector(`[data-mat-usar="${c.k}"]`).checked) continue;
      const s = d.querySelector(`[data-mat-valor="${c.k}"]`).value.trim();
      if (!s) continue;
      r[c.caminho] = c.num ? u.num(s) : c.data ? (VP.planilhas?.lerData(s) || s) : s;
    }
    return r;
  };
  const avisoImagem = '<p class="aviso-inline">Este PDF é uma imagem (matrícula escaneada): não tem texto para ler. Digite os dados na ficha do imóvel. O PDF pode ser anexado mesmo assim.</p>';

  // Ler a matrícula de um imóvel que já existe
  M.lerParaBem = async (b, depois) => {
    const arq = await escolherArquivo(); if (!arq) return;
    let lido;
    try { ui.aviso('Lendo a matrícula…'); lido = await M.ler(arq); } catch (e) { return ui.aviso('Não foi possível ler o PDF: ' + e.message, 'erro'); }
    const achados = Object.keys(lido.campos).length;
    ui.modal({
      titulo: 'Conferir dados da matrícula', largura: 'grande',
      corpo: `<p class="ajuda">${esc(arq.name)} · ${lido.paginas} página(s). ${lido.imagem ? '' : `O sistema encontrou ${achados} informação(ões). Confira, corrija se precisar e marque o que deve entrar. O valor anterior fica no histórico do bem.`}</p>
        ${lido.imagem ? avisoImagem : conferencia(lido, b)}
        <label class="linha-check"><input type="checkbox" data-mat-anexar checked> Anexar o PDF ao imóvel (tipo "Matrícula")</label>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Gravar', classe: 'primario', acao: async (d) => {
        const novos = lido.imagem ? {} : lerConferencia(d);
        const anexar = d.querySelector('[data-mat-anexar]').checked;
        if (!Object.keys(novos).length && !anexar) { ui.aviso('Nada marcado.', 'erro'); return false; }
        const mud = [];
        for (const [cam, v] of Object.entries(novos)) { const c = M.CAMPOS.find((x) => x.caminho === cam); mud.push({ campo: c.t, antes: mostrar(c, pega(b, cam)) || '—', depois: mostrar(c, v) }); poe(b, cam, v); }
        if (anexar) { const [a] = await ui.lerArquivos([arq]); a.tipoAnexo = 'Matrícula'; a.descricao = `Matrícula ${novos['imovel.matricula'] || b.imovel?.matricula || ''}`.trim(); b.anexos = (b.anexos || []).concat([a]); }
        await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Dados lidos da matrícula (PDF)${anexar ? ' e PDF anexado' : ''}`, extra: { mudancas: mud } })] });
        ui.aviso(`${mud.length} informação(ões) gravada(s)${anexar ? ' e PDF anexado' : ''}.`);
        depois && depois();
      } }]
    });
  };

  // Cadastrar um imóvel novo a partir da matrícula
  M.cadastrarNovo = async () => {
    const arq = await escolherArquivo(); if (!arq) return;
    let lido;
    try { ui.aviso('Lendo a matrícula…'); lido = await M.ler(arq); } catch (e) { return ui.aviso('Não foi possível ler o PDF: ' + e.message, 'erro'); }
    const classes = VP.db.lista('classificacoes').filter((c) => ['imovel', 'infraestrutura'].includes(VP.dadosDaClassificacao(c.id).tipoBem) && c.nivel !== 'grupo').map((c) => [c.id, VP.caminhoClassificacao(c)]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    const uns = VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const end = lido.campos.logradouro ? ` — ${lido.campos.logradouro}` : '';
    ui.modal({
      titulo: 'Novo imóvel a partir da matrícula', largura: 'grande',
      corpo: `<p class="ajuda">${esc(arq.name)} · ${lido.paginas} página(s). Confira os dados lidos e complete o que o sistema precisa para incluir o imóvel. Nada é gravado antes de "Incluir imóvel".</p>
        ${lido.imagem ? avisoImagem : conferencia(lido, null)}
        <div class="form-grade">
          <div class="campo"><label>Descrição *<input data-mat-desc value="${esc(`Imóvel matrícula ${lido.campos.matricula || ''}${end}`.trim())}"></label></div>
          <div class="campo"><label>Classificação *<select data-mat-classe><option value="">—</option>${classes.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></label></div>
          <div class="campo meia"><label>Unidade *<select data-mat-unidade><option value="">—</option>${uns.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</select></label></div>
          <div class="campo meia"><label>Data de aquisição *<input type="date" data-mat-data value="${esc(lido.campos.ultimoRegistro || '')}"></label></div>
          <div class="campo meia"><label>Valor de aquisição (R$) *<input data-mat-valor-aq inputmode="decimal" placeholder="Ex.: 250000,00"></label></div>
          <div class="campo meia"><label>Situação do registro<select data-mat-sit><option>Registrado</option><option>Em regularização</option><option>Sem registro</option><option>Posse</option></select></label></div>
        </div>
        <p class="erro-form" role="alert"></p>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Incluir imóvel', classe: 'primario', acao: async (d) => {
        const erro = (t) => { d.querySelector('.erro-form').textContent = t; return false; };
        const desc = d.querySelector('[data-mat-desc]').value.trim(), cl = d.querySelector('[data-mat-classe]').value, un = d.querySelector('[data-mat-unidade]').value, data = d.querySelector('[data-mat-data]').value, valor = u.num(d.querySelector('[data-mat-valor-aq]').value);
        if (!desc || !cl || !un || !data || !(valor > 0)) return erro('Preencha descrição, classificação, unidade, data e valor.');
        const { bens, eventos } = VP.montarBens({ tipo: 'imovel', descricao: desc, complemento: desc, classificacaoId: cl, unidadeId: un, dataAquisicao: data, valor, estado: 5, quantidade: 1, situacaoAquisicao: 'Compra', origemTexto: 'cadastro pela matrícula (PDF)' });
        const b = bens[0];
        b.tipo = VP.dadosDaClassificacao(cl).tipoBem === 'infraestrutura' ? 'infraestrutura' : 'imovel';
        b.imovel = { situacaoRegistro: d.querySelector('[data-mat-sit]').value };
        for (const [cam, v] of Object.entries(lido.imagem ? {} : lerConferencia(d))) poe(b, cam, v);
        const [a] = await ui.lerArquivos([arq]); a.tipoAnexo = 'Matrícula'; a.descricao = `Matrícula ${b.imovel.matricula || ''}`.trim();
        b.anexos = [a];
        await VP.db.gravarVarias({ bens, eventos });
        ui.aviso(`Imóvel ${b.codigo} incluído com a matrícula anexada.`);
        VP.app.ir('#bem/' + b.id);
      } }]
    });
  };
})();

/* VitalPat Patrimônio · Gestão — leitura do PDF da nota fiscal (DANFE da NF-e, modelo 55).
   Tira o texto do PDF com o pdf.js (Mozilla, Apache-2.0, vendor/pdfjs), remonta as linhas pela posição na página
   e devolve a nota no mesmo formato da leitura do XML (VP.lerNFe), para usar a mesma tela de conferência.
   - Número, série e CNPJ do emitente saem da CHAVE DE ACESSO (44 dígitos, com o dígito conferido), que é igual em todo DANFE.
   - Itens: linhas da tabela "Dados dos produtos" com NCM, CST, CFOP, quantidade, valor unitário e total
     (quantidade × unitário tem que bater com o total). Descrição em mais de uma linha é juntada.
   Nada entra sozinho: a pessoa confere item a item. Nota escaneada (imagem) não tem texto: o sistema avisa. */
'use strict';
(function () {
  const VP = window.VP;
  const N = VP.notaPdf = {};

  let pdfjs = null;
  const carregar = async () => {
    if (pdfjs) return pdfjs;
    pdfjs = await import(new URL('vendor/pdfjs/pdf.min.js', document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;
    return pdfjs;
  };

  // Linhas do PDF: pedaços de texto com a mesma altura na página viram uma linha (ordem da esquerda para a direita)
  N.linhasDoPDF = async (arquivo) => {
    const lib = await carregar();
    const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
    const linhas = [];
    for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const pedacos = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, t: it.str }));
      pedacos.sort((a, b) => b.y - a.y || a.x - b.x);
      const daPagina = [];
      for (const pc of pedacos) {
        const l = daPagina.find((x) => Math.abs(x.y - pc.y) <= 2.5);
        if (l) l.pedacos.push(pc); else daPagina.push({ y: pc.y, pedacos: [pc] });
      }
      for (const l of daPagina.sort((a, b) => b.y - a.y)) {
        l.pedacos.sort((a, b) => a.x - b.x);
        linhas.push({ pagina: p, y: l.y, x: l.pedacos[0].x, pedacos: l.pedacos, texto: l.pedacos.map((x) => x.t).join(' ').replace(/\s+/g, ' ').trim() });
      }
    }
    return linhas;
  };

  // ------------------------------------------------------------------ chave de acesso
  // cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tipo de emissão(1) código(8) dígito(1)
  N.digitoChave = (c43) => { let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(c43[i]) * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  N.chaveValida = (c) => /^\d{44}$/.test(c) && N.digitoChave(c.slice(0, 43)) === Number(c[43]);
  N.acharChave = (texto) => {
    const corridos = texto.replace(/(\d)[ .\-]+(?=\d)/g, '$1');
    const achadas = corridos.match(/\d{44,}/g) || [];
    for (const a of achadas) for (let i = 0; i + 44 <= a.length; i++) { const c = a.slice(i, i + 44); if (N.chaveValida(c) && c.slice(20, 22) === '55') return c; }
    return '';
  };

  const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
  const NUMERO = /^\d{1,3}(?:\.\d{3})*,\d+$|^\d+,\d+$/;
  // Linha de item: código, descrição, NCM (8 dígitos), CST/CSOSN, CFOP, unidade e números (quantidade, unitário, total, impostos…)
  const ITEM = /^(\S+)\s+(.+?)\s+(\d{4}\.?\d{2}\.?\d{2})\s+(\d{3,4}|\d\/\d{2,3})\s+([1-7]\d{3})\s+(?:([A-Za-zÇç][A-Za-zÇç0-9./]{0,5})\s+)?((?:\d[\d.]*,\d+\s*){3,})/;
  const FIM_ITENS = /DADOS\s+ADICIONAIS|C[ÁA]LCULO\s+DO\s+ISSQN|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO/i;
  const INICIO_ITENS = /DADOS\s+DOS?\s+PRODUTOS|DESCRI[ÇC][ÃA]O\s+DO\s+PRODUTO|DESCRI[ÇC][ÃA]O\s+DOS?\s+PRODUTOS/i;

  const lerItem = (texto) => {
    const m = texto.match(ITEM);
    if (!m) return null;
    const nums = m[7].trim().split(/\s+/).filter((x) => NUMERO.test(x)).map(num);
    // quantidade × unitário = total: procura os 3 primeiros números que fecham a conta (alguns modelos têm colunas a mais)
    for (let i = 0; i + 2 < Math.min(nums.length, 5); i++) {
      const [q, vu, vt] = nums.slice(i, i + 3);
      if (q > 0 && vt > 0 && Math.abs(q * vu - vt) <= Math.max(0.02, vt * 0.005)) return { codigo: m[1], nome: m[2].trim(), ncm: m[3].replace(/\./g, ''), unidade: (m[6] || '').toUpperCase(), quantidade: q, valorUnitario: vu, valorTotal: vt };
    }
    return null;
  };

  // Lê as linhas (texto + posição) e devolve a nota no formato de VP.lerNFe, com "avisos" do que não foi achado
  N.extrair = (linhas) => {
    const texto = linhas.map((l) => l.texto).join('\n');
    const avisos = [];
    const chave = N.acharChave(texto);
    if (!chave) avisos.push('Chave de acesso não encontrada: confira número, série e fornecedor.');
    const aamm = chave ? chave.slice(2, 6) : '';
    // emissão: a data do mês e ano da chave (perto de "emissão"); sem chave, a primeira data depois de "emissão"
    const datas = [...texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((m) => ({ i: m.index, d: `${m[3]}-${m[2]}-${m[1]}`, aamm: m[3].slice(2) + m[2] }));
    const pEmis = texto.search(/EMISS[ÃA]O/i);
    const candidatas = datas.filter((d) => !aamm || d.aamm === aamm);
    const emissao = (candidatas.find((d) => pEmis >= 0 && d.i > pEmis) || candidatas[0] || {}).d || '';
    if (!emissao) avisos.push('Data de emissão não encontrada.');
    let numero = chave ? String(Number(chave.slice(25, 34))) : '', serie = chave ? String(Number(chave.slice(22, 25))) : '';
    if (!numero) { const m = texto.match(/N[º°o]\.?\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d{1,9})\b/i); if (m) numero = String(Number(m[1].replace(/\./g, ''))); }
    let cnpj = chave ? chave.slice(6, 20) : '';
    if (!cnpj) { const m = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/); if (m) cnpj = m[0].replace(/\D/g, ''); }
    // emitente: o canhoto de todo DANFE diz "RECEBEMOS DE <emitente> OS PRODUTOS"
    let nome = '';
    const mr = texto.replace(/\n/g, ' ').match(/RECEBEMOS\s+DE\s+(.+?)\s+OS\s+PRODUTOS/i);
    if (mr) nome = mr[1].trim();
    if (!nome) avisos.push('Nome do fornecedor não encontrado: confira em Cadastros → Fornecedores depois de incluir.');

    // itens: só dentro da tabela de produtos (em cada página), com a descrição que continua na linha de baixo
    const itens = [];
    let dentro = false, colDesc = null, colNcm = null, ultimo = null;
    for (const l of linhas) {
      if (INICIO_ITENS.test(l.texto)) { dentro = true; ultimo = null; }
      if (!dentro) continue;
      if (FIM_ITENS.test(l.texto)) { dentro = false; ultimo = null; continue; }
      const cab = l.pedacos.find((p) => /DESCRI/i.test(p.t)), cabNcm = l.pedacos.find((p) => /NCM/i.test(p.t));
      if (cab && cabNcm) { colDesc = cab.x; colNcm = cabNcm.x; ultimo = null; continue; }
      const it = lerItem(l.texto);
      if (it) { ultimo = Object.assign({ n: itens.length + 1 }, it); itens.push(ultimo); continue; }
      // continuação da descrição: texto que começa na coluna da descrição, antes da coluna do NCM
      if (ultimo && colDesc != null && l.x >= colDesc - 8 && l.x < colNcm - 2 && l.pedacos.every((p) => p.x < colNcm - 2)) ultimo.nome = `${ultimo.nome} ${l.texto}`.trim();
      else ultimo = null;
    }
    if (!itens.length) avisos.push(linhas.length ? 'Nenhum item encontrado na tabela de produtos.' : 'O PDF não tem texto (nota escaneada ou imagem).');
    // confere com o "valor total dos produtos" da nota: o valor fica na mesma linha do rótulo ou logo abaixo dele
    const totalProdutos = (() => {
      for (let k = 0; k < linhas.length; k++) {
        const r = linhas[k].pedacos.find((p) => /VALOR\s+TOTAL\s+DOS\s+PRODUTOS/i.test(p.t));
        if (!r) continue;
        const mesma = r.t.match(/PRODUTOS\s*(?:R\$)?\s*([\d.]+,\d{2})\s*$/i);
        if (mesma) return num(mesma[1]);
        const abaixo = linhas.slice(k + 1, k + 3).filter((l) => l.pagina === linhas[k].pagina && linhas[k].y - l.y < 25);
        const cands = abaixo.flatMap((l) => l.pedacos).filter((p) => NUMERO.test(p.t.trim()));
        // o valor que fica embaixo do rótulo (entre o começo e o fim dele); senão, o mais perto do fim do rótulo
        const fim = r.x + (r.w || 0);
        const embaixo = cands.filter((p) => p.x >= r.x - 10 && p.x <= fim + 5);
        const escolha = embaixo.length ? embaixo.sort((a, b) => b.x - a.x)[0] : cands.sort((a, b) => Math.abs(a.x - fim) - Math.abs(b.x - fim))[0];
        return num(escolha.t.trim());
      }
      return null;
    })();
    const soma = Math.round(itens.reduce((s, i) => s + i.valorTotal, 0) * 100) / 100;
    if (totalProdutos != null && itens.length && Math.abs(totalProdutos - soma) > 0.05) avisos.push(`A soma dos itens lidos (${VP.u.moeda(soma)}) não bate com o total dos produtos da nota (${VP.u.moeda(totalProdutos)}): pode faltar item. Confira com o PDF.`);
    // AF (autorização de fornecimento) e pedido, quando o fornecedor escreve na nota: ligam a nota à compra
    const af = (texto.match(/\bA\.?F\.?\s*(?:N[º°o]\.?)?\s*:?\s*(\d+\s*\/\s*\d{4})/) || [])[1]?.replace(/\s/g, '') || '';
    const pedido = (texto.match(/\bPEDIDO\s*(?:N[º°o]\.?)?\s*:?\s*(\d+)/i) || [])[1] || '';
    return { numero, serie, emissao, chave, emitente: { cnpj, nome }, itens, avisos, af, pedido, doPDF: true };
  };

  N.ler = async (arquivo) => N.extrair(await N.linhasDoPDF(arquivo));

  // ------------------------------------------------------------------ ordem de compra (PDF do sistema de compras)
  // Modelo lido: "ORDEM DE COMPRA 2231 / 2025" (IPM Atende.Net). Fornecedor, empenho, dotação e itens
  // (Item, Qtd, Unidade, Produto, Marca, Valor unitário, Valor total). Nada entra sozinho: a pessoa confere.
  N.extrairOC = (linhas) => {
    const T = linhas.map((l) => l.texto);
    const texto = T.join('\n');
    const avisos = [];
    const campo = (rotulo) => { const m = texto.match(new RegExp('(?:^|\\s)' + rotulo + '\\s*:\\s*([^\\n]*?)\\s*(?=\\s[A-ZÁÉÍÓÚÇ][\\wÀ-ú./ ]{1,30}:|$)', 'mi')); return m ? m[1].trim() : ''; };
    const mo = texto.match(/ORDEM\s+DE\s+COMPRA\s*N?[º°]?\s*(\d+)\s*\/\s*(\d{4})/i);
    if (!mo) return null;
    const data = (texto.match(/\bData\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/) || []).slice(1);
    const emp = campo('N[º°o]\\.? do Empenho').replace(/\s/g, '');
    // fornecedor: "Razão Social: 2587904 - NOME CPF/CNPJ: xx" (o nome pode continuar na linha de baixo)
    let fornNome = '', fornCnpj = '';
    const iRs = T.findIndex((l) => /Raz[ãa]o\s+Social\s*:/i.test(l));
    if (iRs >= 0) {
      const l = T[iRs].replace(/^.*?Raz[ãa]o\s+Social\s*:\s*/i, '');
      const mc = l.match(/CPF\s*\/\s*CNPJ\s*:\s*([\d./-]+)/i);
      if (mc) fornCnpj = mc[1].replace(/\D/g, '');
      fornNome = l.replace(/CPF\s*\/\s*CNPJ\s*:.*$/i, '').replace(/^\d+\s*-\s*/, '').trim();
      const prox = T[iRs + 1] || '';
      if (prox && !/^\s*[A-ZÀ-Úa-zà-ú. ]{2,25}:/.test(prox)) fornNome = `${fornNome} ${prox.trim()}`;
    }
    if (!fornNome) avisos.push('Fornecedor não encontrado na ordem de compra.');
    // entidade (comprador): primeira linha e o primeiro CNPJ do cabeçalho
    const entCnpj = ((texto.match(/CNPJ\s*:\s*([\d./-]{14,18})/i) || [])[1] || '').replace(/\D/g, '');
    const orcamento = { dotacao: campo('Dota[çc][ãa]o'), orgao: campo('[ÓO]rg[ãa]o'), unidade: campo('Unidade'), acao: campo('A[çc][ãa]o'), elemento: campo('Elemento'), vinculo: campo('V[íi]nculo') };
    // itens: depois do cabeçalho "Item Qtd Unidade Produto…", até "Valor Acrescimo" / "Total Geral"
    const itens = [];
    let dentro = false, ultimo = null;
    const ITEM_OC = /^(\d+)\s+(\d+(?:[.,]\d+)?)\s+(\S+)\s+(?:(\d+)\s*-\s*)?(.+?)\s+R?\$?\s*([\d.]+,\d+)\s+R?\$?\s*([\d.]+,\d+)\s*$/;
    for (const t of T) {
      if (/^Item\s+Qtd/i.test(t)) { dentro = true; continue; }
      if (!dentro) continue;
      if (/Valor\s+Acr[ée]scimo|Total\s+Geral|Dados\s+da\s+Entrega/i.test(t)) break;
      const m = t.match(ITEM_OC);
      if (m) {
        const q = num(m[2].includes(',') ? m[2] : m[2].replace('.', ',')), vu = num(m[6]), vt = num(m[7]);
        ultimo = { n: Number(m[1]), codigo: m[4] || '', nome: m[5].trim(), ncm: '', unidade: m[3].toUpperCase(), quantidade: q, valorUnitario: vu, valorTotal: vt };
        if (Math.abs(q * vu - vt) > Math.max(0.02, vt * 0.005)) avisos.push(`Item ${m[1]}: quantidade × valor unitário não bate com o total. Confira.`);
        itens.push(ultimo);
      } else if (ultimo) ultimo.nome = `${ultimo.nome} ${t}`.trim();
    }
    if (!itens.length) avisos.push('Nenhum item encontrado na ordem de compra.');
    const fin = texto.match(/Finalidade\s*\n([^\n]+)/i);
    return { doOC: true, numero: mo[1], ano: mo[2], data: data.length ? `${data[2]}-${data[1]}-${data[0]}` : '', empenho: emp.replace(/^\/|\/$/g, ''), fornecedor: { nome: fornNome, cnpj: fornCnpj }, entidadeCnpj: entCnpj, orcamento, finalidade: fin ? fin[1].trim() : '', itens, avisos };
  };
  N.lerOC = async (arquivo) => N.extrairOC(await N.linhasDoPDF(arquivo));
  // Um PDF só: se for ordem de compra, lê como ordem de compra; senão, como nota fiscal (DANFE)
  N.lerDocumento = async (arquivo) => { const l = await N.linhasDoPDF(arquivo); const oc = N.extrairOC(l); return oc ? { oc } : { nf: N.extrair(l) }; };
})();

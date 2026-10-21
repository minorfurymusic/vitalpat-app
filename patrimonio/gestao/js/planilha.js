/* VitalPat Patrimônio · Gestão — planilhas do Excel (.xlsx) e pacotes .zip, sem biblioteca externa.
   Ler: o .xlsx é um zip com XML dentro; é aberto com o descompactador do próprio navegador (cópia adaptada da do Cemitério).
   Gravar: monta o .xlsx mínimo (zip sem compressão + XML do Excel), com várias abas e cabeçalho em negrito. */
'use strict';
(function () {
  const VP = window.VP;

  // ------------------------------------------------------------------ zip: ler
  const descompactar = async (bytes, metodo) => {
    if (metodo === 0) return bytes;
    if (metodo !== 8) throw new Error('Formato de compactação não suportado');
    const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  };
  VP.abrirZip = async (buffer) => {
    const dv = new DataView(buffer);
    let fim = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error('Arquivo não é um .xlsx ou .zip válido');
    const qtd = dv.getUint16(fim + 10, true);
    let p = dv.getUint32(fim + 16, true);
    const arquivos = {};
    const dec = new TextDecoder();
    for (let k = 0; k < qtd; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Arquivo corrompido');
      const flags = dv.getUint16(p + 8, true);
      const metodo = dv.getUint16(p + 10, true);
      const tam = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const brutos = new Uint8Array(buffer, p + 46, nLen);
      let nome; // nomes com acento: UTF-8 (marcado) ou, em zip antigo do Windows, página de código ocidental
      try { nome = (flags & 0x800) ? dec.decode(brutos) : new TextDecoder('utf-8', { fatal: true }).decode(brutos); } catch (_) { nome = new TextDecoder('windows-1252').decode(brutos); }
      const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      arquivos[nome] = { metodo, ini, tam };
      p += 46 + nLen + xLen + cLen;
    }
    return {
      nomes: Object.keys(arquivos),
      async bytes(nome) { const a = arquivos[nome]; return a ? descompactar(new Uint8Array(buffer, a.ini, a.tam), a.metodo) : null; },
      async texto(nome) { const b = await this.bytes(nome); return b ? dec.decode(b) : null; }
    };
  };

  // ------------------------------------------------------------------ zip: gravar (sem compressão, nomes em UTF-8)
  const TAB_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TAB_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  // arquivos: [{ nome, dados: Uint8Array | string }] → Blob
  VP.gravarZip = (arquivos, tipo = 'application/zip') => {
    const enc = new TextEncoder();
    const agora = new Date();
    const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    const dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    const partes = [], central = [];
    let pos = 0;
    for (const a of arquivos) {
      const nome = enc.encode(a.nome);
      const dados = typeof a.dados === 'string' ? enc.encode(a.dados) : a.dados;
      const crc = crc32(dados);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x800, true); loc.setUint16(8, 0, true);
      loc.setUint16(10, hora, true); loc.setUint16(12, dia, true); loc.setUint32(14, crc, true);
      loc.setUint32(18, dados.length, true); loc.setUint32(22, dados.length, true); loc.setUint16(26, nome.length, true); loc.setUint16(28, 0, true);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, hora, true); cen.setUint16(14, dia, true); cen.setUint32(16, crc, true);
      cen.setUint32(20, dados.length, true); cen.setUint32(24, dados.length, true); cen.setUint16(28, nome.length, true);
      cen.setUint32(42, pos, true);
      partes.push(new Uint8Array(loc.buffer), nome, dados);
      central.push(new Uint8Array(cen.buffer), nome);
      pos += 30 + nome.length + dados.length;
    }
    const tamCentral = central.reduce((t, x) => t + x.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: tipo });
  };

  // ------------------------------------------------------------------ xlsx: ler
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const colNum = (ref) => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
  VP.lerXLSX = async (buffer) => {
    const z = await VP.abrirZip(buffer);
    const wbTxt = await z.texto('xl/workbook.xml');
    if (!wbTxt) throw new Error('Arquivo não é uma planilha .xlsx válida');
    const wb = xml(wbTxt);
    const rels = xml(await z.texto('xl/_rels/workbook.xml.rels') || '<Relationships/>');
    const alvo = {};
    for (const r of rels.getElementsByTagName('Relationship')) alvo[r.getAttribute('Id')] = r.getAttribute('Target');
    const ssTxt = await z.texto('xl/sharedStrings.xml');
    const comuns = ssTxt ? [...xml(ssTxt).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
    const abas = [];
    for (const s of wb.getElementsByTagName('sheet')) {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let caminho = alvo[rid] || '';
      caminho = caminho.startsWith('/') ? caminho.slice(1) : 'xl/' + caminho.replace(/^\.\//, '');
      const txt = await z.texto(caminho);
      if (!txt) continue;
      const linhas = [];
      for (const row of xml(txt).getElementsByTagName('row')) {
        const lin = [];
        for (const c of row.getElementsByTagName('c')) {
          const tipo = c.getAttribute('t');
          const v = c.getElementsByTagName('v')[0]?.textContent;
          let val;
          if (tipo === 's') val = comuns[Number(v)] ?? '';
          else if (tipo === 'inlineStr') val = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
          else if (tipo === 'b') val = v === '1';
          else if (tipo === 'str') val = v ?? '';
          else val = v == null || v === '' ? '' : Number(v);
          lin[colNum(c.getAttribute('r') || 'A1')] = typeof val === 'string' ? val.trim() : val;
        }
        linhas[Number(row.getAttribute('r')) - 1] = Array.from(lin, (x) => (x === undefined ? '' : x));
      }
      abas.push({ nome: s.getAttribute('name'), linhas: Array.from(linhas, (x) => x || []) });
    }
    return abas;
  };

  // CSV com ";" ou "," (detecta), aspas e marca BOM
  VP.lerCSV = (texto) => {
    texto = texto.replace(/^﻿/, '');
    // separador: tabulação (relatórios exportados de outros sistemas), senão ";" ou "," pela primeira linha
    const prim = texto.split('\n').slice(0, 15);
    const l0 = prim.find((l) => /[;,\t]/.test(l)) || '';
    const sep = prim.some((l) => (l.match(/\t/g) || []).length >= 2) ? '\t' : (l0.match(/;/g) || []).length >= (l0.match(/,/g) || []).length ? ';' : ',';
    const linhas = [];
    let lin = [], cel = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { cel += '"'; i++; } else if (c === '"') aspas = false; else cel += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { lin.push(cel.trim()); cel = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; lin.push(cel.trim()); linhas.push(lin); lin = []; cel = ''; }
      else cel += c;
    }
    if (cel || lin.length) { lin.push(cel.trim()); linhas.push(lin); }
    return [{ nome: 'Planilha', linhas: linhas.filter((l) => l.some((x) => x !== '')) }];
  };
  // Texto em UTF-8; se não for (relatórios de sistemas antigos), acentos do Windows (ISO-8859-1 / windows-1252)
  VP.decodificarTexto = (buffer) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (_) { return new TextDecoder('windows-1252').decode(buffer); } };
  VP.lerArquivoPlanilha = async (arquivo) => {
    const nome = arquivo.name.toLowerCase();
    if (nome.endsWith('.xlsx')) return VP.lerXLSX(await arquivo.arrayBuffer());
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) return VP.lerCSV(VP.decodificarTexto(await arquivo.arrayBuffer()));
    throw new Error('Use planilha do Excel (.xlsx) ou .csv. Arquivo .xls antigo: abra no Excel e salve como .xlsx.');
  };

  // ------------------------------------------------------------------ xlsx: gravar
  // abas: [{ nome, cabecalho: [..], linhas: [[..]], larguras?: [n..] }] → Blob .xlsx
  const escX = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const letra = (n) => { let s = ''; n++; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const nomeAba = (n, usados) => {
    let s = String(n || 'Planilha').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Planilha';
    let k = 2; const base = s;
    while (usados.has(s.toLowerCase())) s = (base.slice(0, 28) + ' ' + k++).slice(0, 31);
    usados.add(s.toLowerCase()); return s;
  };
  const celula = (v, ref, estilo = 0) => {
    if (v === true) v = 'Sim';
    if (v === false) v = 'Não';
    if (v == null || v === '') return '';
    const st = estilo ? ` s="${estilo}"` : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${escX(v)}</t></is></c>`;
  };
  VP.gravarXLSX = (abas) => {
    const usados = new Set();
    const nomes = abas.map((a) => nomeAba(a.nome, usados));
    const arquivos = [];
    arquivos.push({ nome: '[Content_Types].xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
    arquivos.push({ nome: '_rels/.rels', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    arquivos.push({ nome: 'xl/workbook.xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${escX(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
    arquivos.push({ nome: 'xl/_rels/workbook.xml.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    // estilo 1 = negrito com fundo (cabeçalho); 2 = texto quebrando linha (instruções)
    arquivos.push({ nome: 'xl/styles.xml', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });
    abas.forEach((a, i) => {
      const cab = a.cabecalho || [];
      const todas = [cab, ...(a.linhas || [])];
      const nCol = Math.max(1, ...todas.map((l) => l.length));
      const larg = Array.from({ length: nCol }, (_, c) => (a.larguras?.[c]) || Math.min(60, Math.max(8, ...todas.slice(0, 300).map((l) => String(l[c] ?? '').length + 2))));
      const linhasXml = todas.map((l, r) => {
        if (r === 0 && !cab.length) return '';
        const cel = l.map((v, c) => celula(v, letra(c) + (r + 1), r === 0 ? 1 : a.quebrar ? 2 : 0)).join('');
        return `<row r="${r + 1}">${cel}</row>`;
      }).join('');
      const congelar = cab.length ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
      arquivos.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${congelar}<cols>${larg.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${linhasXml}</sheetData>${cab.length && a.linhas?.length ? `<autoFilter ref="A1:${letra(nCol - 1)}${todas.length}"/>` : ''}</worksheet>` });
    });
    return VP.gravarZip(arquivos, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };
  VP.baixarBlob = (nome, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  VP.baixarXLSX = (nome, abas) => VP.baixarBlob(`${nome}-${VP.Plataforma.hoje()}.xlsx`, VP.gravarXLSX(abas));
})();

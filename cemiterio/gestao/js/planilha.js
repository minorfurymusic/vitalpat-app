/* VitalPat Cemitério · Gestão — leitura de planilhas (.xlsx e .csv) sem biblioteca externa.
   O .xlsx é um arquivo compactado com XML dentro; aqui ele é aberto com o descompactador do próprio navegador. */
'use strict';
(function () {
  const VP = window.VP;

  const descompactar = async (bytes, metodo) => {
    if (metodo === 0) return bytes;
    if (metodo !== 8) throw new Error('Formato de compactação não suportado');
    const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  };

  // Lista os arquivos de dentro do .xlsx (formato zip)
  const abrirZip = async (buffer) => {
    const dv = new DataView(buffer);
    let fim = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error('Arquivo não é uma planilha .xlsx válida');
    const qtd = dv.getUint16(fim + 10, true);
    let p = dv.getUint32(fim + 16, true);
    const arquivos = {};
    const dec = new TextDecoder();
    for (let k = 0; k < qtd; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Planilha corrompida');
      const metodo = dv.getUint16(p + 10, true);
      const tam = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const nome = dec.decode(new Uint8Array(buffer, p + 46, nLen));
      const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      arquivos[nome] = { metodo, ini, tam };
      p += 46 + nLen + xLen + cLen;
    }
    return {
      async texto(nome) {
        const a = arquivos[nome];
        if (!a) return null;
        return dec.decode(await descompactar(new Uint8Array(buffer, a.ini, a.tam), a.metodo));
      }
    };
  };

  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const colNum = (ref) => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

  VP.lerXLSX = async (buffer) => {
    const z = await abrirZip(buffer);
    const wb = xml(await z.texto('xl/workbook.xml'));
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
          else val = v ?? '';
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
    const sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
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

  VP.lerArquivoPlanilha = async (arquivo) => {
    const nome = arquivo.name.toLowerCase();
    if (nome.endsWith('.xlsx')) return VP.lerXLSX(await arquivo.arrayBuffer());
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) return VP.lerCSV(await arquivo.text());
    throw new Error('Use planilha .xlsx ou .csv');
  };
})();

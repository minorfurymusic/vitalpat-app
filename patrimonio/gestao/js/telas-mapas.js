/* VitalPat Patrimônio · Gestão — etapas 7 e 8: mapa dos imóveis (Leaflet) e relatórios com fotos e mapa.
   Fundo de ruas do OpenStreetMap (precisa de internet); sem internet, os pontos aparecem mesmo assim.
   As coordenadas dos imóveis ficam em "Imóvel: registro e uso" (latitude e longitude) ou vêm do GPS do aparelho. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const M = VP.mapas = {};
  const CORES_REG = { Registrado: '#1baf7a', 'Em regularização': '#fab219', 'Sem registro': '#d03b3b', Posse: '#7a1fa2' };
  M.corRegistro = (b) => CORES_REG[b.imovel?.situacaoRegistro] || '#888';
  M.temCoord = (b) => Number.isFinite(b.imovel?.lat) && Number.isFinite(b.imovel?.lon);
  M.validar = (lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Latitude ou longitude inválida.';
    if (lat < -34 || lat > 6 || lon < -74 || lon > -34) return 'Coordenada fora do Brasil (confira se latitude e longitude não estão trocadas).';
    return null;
  };
  M.linkGoogle = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  M.kml = (bens) => `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc('Imóveis · ' + VP.nome('entidades', 'E1'))}</name>${bens.filter(M.temCoord).map((b) => `<Placemark><name>${esc(b.codigo + ' · ' + b.descricao)}</name><description>${esc(`${b.imovel?.situacaoRegistro || ''} · ${b.imovel?.uso || ''} · ${u.moeda(VP.saldo(b).liquido)}`)}</description><Point><coordinates>${b.imovel.lon},${b.imovel.lat},0</coordinates></Point></Placemark>`).join('')}</Document></kml>`;
  M.informarLocal = (b, depois) => ui.formulario({
    titulo: 'Localização do imóvel — ' + b.descricao, largura: 'pequena',
    campos: [{ chave: 'lat', rotulo: 'Latitude (ex.: -27,2140)', obrigatorio: true, largura: 'meia' }, { chave: 'lon', rotulo: 'Longitude (ex.: -49,6430)', obrigatorio: true, largura: 'meia' }],
    valores: { lat: b.imovel?.lat ?? '', lon: b.imovel?.lon ?? '' },
    intro: '<p class="ajuda">Copie do Google Maps (clique com o botão direito no lugar e copie os números) ou use "GPS deste aparelho" estando no imóvel.</p><p><button type="button" class="botao pequeno" data-gps-imovel>Usar o GPS deste aparelho</button></p>',
    salvar: async (x) => {
      const lat = u.num(x.lat), lon = u.num(x.lon);
      const erro = M.validar(lat, lon); if (erro) return erro;
      const antes = { lat: b.imovel?.lat ?? null, lon: b.imovel?.lon ?? null };
      b.imovel = Object.assign(b.imovel || {}, { lat, lon });
      await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Localização do imóvel: ${lat}, ${lon}`, extra: { mudancas: [{ campo: 'Localização', antes: antes.lat != null ? `${antes.lat}, ${antes.lon}` : '', depois: `${lat}, ${lon}` }] } })] });
      ui.aviso('Localização salva.'); depois && depois();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.matches('[data-gps-imovel]')) return;
    const d = e.target.closest('dialog');
    if (!navigator.geolocation) return ui.aviso('Este aparelho não tem GPS disponível.', 'erro');
    navigator.geolocation.getCurrentPosition((p) => { d.querySelector('[name=lat]').value = String(p.coords.latitude.toFixed(7)).replace('.', ','); d.querySelector('[name=lon]').value = String(p.coords.longitude.toFixed(7)).replace('.', ','); ui.aviso(`Posição lida (erro de até ${Math.round(p.coords.accuracy)} m).`); }, () => ui.aviso('Não foi possível ler o GPS.', 'erro'), { enableHighAccuracy: true, timeout: 15000 });
  });

  // ------------------------------------------------------------------ mapa dos imóveis (aba em Situação dos imóveis)
  M.telaMapa = (abas) => {
    const v = VP.estado.mapaImo = VP.estado.mapaImo || { ruas: true, campo: false };
    const im = VP.imoveis.lista().filter((b) => b.tipo === 'imovel' || b.tipo === 'infraestrutura');
    const com = im.filter(M.temCoord);
    const regs = VP.db.lista('registrosCampo').filter((r) => r.gps && Number.isFinite(r.gps.lat));
    return {
      titulo: 'Bens imóveis',
      acoes: `<button class="botao" data-kml-imo ${com.length ? '' : 'disabled'}>Baixar para o Google Earth (KML)</button>`,
      html: `${abas}<div class="linha-filtros"><label class="linha-check"><input type="checkbox" data-ruas-imo ${v.ruas ? 'checked' : ''}> Mapa de ruas (precisa de internet)</label><label class="linha-check"><input type="checkbox" data-campo-imo ${v.campo ? 'checked' : ''}> Mostrar registros do aplicativo de campo com GPS (${u.inteiro(regs.length)})</label></div>
        <div class="legenda">${Object.entries(CORES_REG).map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)} (${im.filter((b) => b.imovel?.situacaoRegistro === n && M.temCoord(b)).length})</span>`).join('')}</div>
        <p class="ajuda">${u.inteiro(com.length)} de ${u.inteiro(im.length)} imóveis com localização. Para informar: ficha do imóvel → "Localização no mapa".</p>
        ${com.length || (v.campo && regs.length) ? '<div id="mapa-imoveis" class="mapa-leaflet" role="application" aria-label="Mapa dos imóveis"></div>' : '<section class="cartao"><p>Nenhum imóvel com localização ainda.</p></section>'}
        ${im.filter((b) => !M.temCoord(b)).length ? `<section class="cartao"><h3>Sem localização (${im.filter((b) => !M.temCoord(b)).length})</h3><ul class="lista-simples">${im.filter((b) => !M.temCoord(b)).map((b) => `<li><a href="#bem/${esc(b.id)}">${esc(b.codigo)} · ${esc(b.descricao)}</a></li>`).join('')}</ul></section>` : ''}`,
      ligar() {
        const re = () => VP.app.render();
        document.querySelector('[data-ruas-imo]').addEventListener('change', (e) => { v.ruas = e.target.checked; re(); });
        document.querySelector('[data-campo-imo]').addEventListener('change', (e) => { v.campo = e.target.checked; re(); });
        document.querySelector('[data-kml-imo]')?.addEventListener('click', () => ui.baixar(`imoveis-${VP.Plataforma.hoje()}.kml`, M.kml(im), 'application/vnd.google-earth.kml+xml'));
        const div = document.getElementById('mapa-imoveis');
        if (!div) return;
        if (!window.L) { div.innerHTML = '<p class="aviso-inline">A biblioteca do mapa não carregou.</p>'; return; }
        const mapa = window.L.map(div, { preferCanvas: true });
        M.ultimoMapa = mapa;
        if (v.ruas) window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 19, attribution: '© colaboradores do OpenStreetMap' }).addTo(mapa);
        const lim = [];
        M.marcas = new Map();
        for (const b of com) {
          const mk = window.L.circleMarker([b.imovel.lat, b.imovel.lon], { radius: 9, color: '#fff', weight: 2, fillColor: M.corRegistro(b), fillOpacity: 0.95 })
            .bindPopup(`<b>${esc(b.codigo)} · ${esc(b.descricao)}</b><br>${esc(b.imovel?.situacaoRegistro || '')} · ${esc(b.imovel?.uso || '')}<br>${esc(u.moeda(VP.saldo(b).liquido))}<br><a href="#bem/${esc(b.id)}">Abrir ficha</a> · <a target="_blank" rel="noopener" href="${esc(M.linkGoogle(b.imovel.lat, b.imovel.lon))}">Google Maps</a>`).addTo(mapa);
          M.marcas.set(b.id, mk); lim.push([b.imovel.lat, b.imovel.lon]);
        }
        if (v.campo) for (const r of regs) { window.L.circleMarker([r.gps.lat, r.gps.lon], { radius: 4, color: '#555', weight: 1, fillColor: '#bbb', fillOpacity: 0.9 }).bindPopup(`Registro do aplicativo de campo<br>${esc(r.tipo)} · ${esc(new Date(r.criadoEm).toLocaleString('pt-BR'))}`).addTo(mapa); lim.push([r.gps.lat, r.gps.lon]); }
        if (lim.length) mapa.fitBounds(lim, { padding: [30, 30], maxZoom: 18 }); else mapa.setView([-27.2, -49.6], 13);
      }
    };
  };

  // ------------------------------------------------------------------ relatórios com fotos e mapa (etapa 8)
  T['relatorio-fotos'] = (aba = 'bens') => {
    const abas = `<nav class="abas"><a href="#relatorio-fotos/bens" class="${aba !== 'imoveis' ? 'ativa' : ''}">Bens</a><a href="#relatorio-fotos/imoveis" class="${aba === 'imoveis' ? 'ativa' : ''}">Imóveis (com mapa)</a></nav>`;
    const v = VP.estado.relFotosPat = VP.estado.relFotosPat || { unidadeId: '', estado: '', soComFoto: true };
    const foto = (f) => `<figure><img src="${esc(f.dataURL)}" alt="Foto"><figcaption>${u.data(f.data)}</figcaption></figure>`;
    const desenhar = () => {
      if (aba === 'imoveis') {
        const im = VP.imoveis.lista().filter((b) => b.tipo === 'imovel');
        const pontos = im.filter(M.temCoord).map((b) => ({ lat: b.imovel.lat, lon: b.imovel.lon, cor: M.corRegistro(b), rotulo: `${b.codigo} · ${b.descricao}`, link: '#bem/' + b.id }));
        return `<div id="corpo-relatorio"><h2>Imóveis — fotos e mapa · ${esc(VP.nome('entidades', 'E1'))}</h2><p class="ajuda">${u.inteiro(im.length)} imóvel(is) · gerado em ${u.data(VP.Plataforma.hoje())}</p>
          <section class="cartao"><h3>Mapa</h3>${G.mapaPontos(pontos, { titulo: 'Imóveis' })}<div class="legenda">${Object.entries(CORES_REG).map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</div></section>
          <div class="fichas-fotos">${im.map((b) => { const docs = VP.imoveis.docsDe(b.id); const venc = docs.filter((d) => VP.imoveis.situacaoDoc(d) === 'vencido'); return `<article class="ficha-foto-rel"><header><b>${esc(b.codigo)}</b> · ${esc(b.descricao)}</header>
            <p>${esc([b.endereco?.logradouro, b.endereco?.bairro].filter(Boolean).join(', '))} · ${esc(b.imovel?.situacaoRegistro || '—')}${b.imovel?.motivoPendencia ? ' (' + esc(b.imovel.motivoPendencia) + ')' : ''} · ${esc(b.imovel?.uso || '')} · ${esc(u.moeda(VP.saldo(b).liquido))}${venc.length ? ` · <b>${venc.length} documento(s) vencido(s)</b>` : ''}${M.temCoord(b) ? ` · ${b.imovel.lat}, ${b.imovel.lon}` : ''}</p>
            <div class="fotos-rel">${(b.fotos || []).filter((f) => f.dataURL).slice(0, 4).map(foto).join('') || '<span class="vazio">Sem foto</span>'}</div></article>`; }).join('')}</div></div>`;
      }
      let l = VP.db.lista('bens').filter((b) => b.status !== 'baixado' && !['imovel', 'infraestrutura'].includes(b.tipo));
      if (v.unidadeId) l = l.filter((b) => b.unidadeId === v.unidadeId);
      if (v.estado) l = l.filter((b) => String(b.estado) === v.estado);
      if (v.soComFoto) l = l.filter((b) => (b.fotos || []).some((f) => f.dataURL));
      l.sort((a, b) => a.codigo - b.codigo);
      const max = 200;
      return `<div id="corpo-relatorio"><h2>Bens — relatório fotográfico · ${esc(VP.nome('entidades', 'E1'))}</h2><p class="ajuda">${u.inteiro(l.length)} bem(ns)${v.unidadeId ? ' · ' + esc(VP.nome('unidades', v.unidadeId)) : ''} · gerado em ${u.data(VP.Plataforma.hoje())}${l.length > max ? ` · mostrando os primeiros ${max}` : ''}</p>
        <div class="fichas-fotos">${l.slice(0, max).map((b) => `<article class="ficha-foto-rel"><header><b>${esc(b.codigo)}</b> · plaqueta ${esc(b.plaqueta)} · ${esc(b.descricao)}</header>
          <p>${esc(VP.nome('unidades', b.unidadeId))}${b.localizacao ? ' · ' + esc(b.localizacao) : ''} · ${esc(L.estados[b.estado] || '')} · ${esc(b.responsavelId ? VP.nome('responsaveis', b.responsavelId) : 'sem responsável')}</p>
          <div class="fotos-rel">${(b.fotos || []).filter((f) => f.dataURL).slice(0, 4).map(foto).join('') || '<span class="vazio">Sem foto</span>'}</div></article>`).join('') || '<p class="vazio">Nenhum bem neste filtro.</p>'}</div></div>`;
    };
    return {
      titulo: 'Relatório com fotos',
      acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a> <button class="botao primario" data-imprimir-rf>Imprimir / PDF</button>',
      html: `${abas}${aba === 'imoveis' ? '' : `<div class="linha-filtros"><label>Unidade <select data-rfp="unidadeId"><option value="">Todas</option>${VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => `<option value="${esc(x.id)}" ${x.id === v.unidadeId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
        <label>Estado <select data-rfp="estado"><option value="">Todos</option>${Object.entries(L.estados).reverse().map(([k, n]) => `<option value="${k}" ${k === v.estado ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="linha-check"><input type="checkbox" data-rfp="soComFoto" ${v.soComFoto ? 'checked' : ''}> Só bens com foto</label></div>`}
        <div id="area-rfp">${desenhar()}</div>`,
      ligar() {
        document.querySelectorAll('[data-rfp]').forEach((el) => el.addEventListener('change', () => { v[el.dataset.rfp] = el.type === 'checkbox' ? el.checked : el.value; document.getElementById('area-rfp').innerHTML = desenhar(); }));
        document.querySelector('[data-imprimir-rf]').addEventListener('click', () => ui.imprimir(document.getElementById('corpo-relatorio').innerHTML, 'Relatório com fotos'));
      }
    };
  };
})();

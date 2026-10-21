/* VitalPat Cemitério · Gestão — etapas 7 e 8: mapa sobre imagem (Leaflet) e relatório fotográfico com mapa.
   Fundo: foto aérea do levantamento (ortofoto, cadastro do cemitério) e/ou mapa de ruas do OpenStreetMap (precisa de internet;
   o servidor público do OpenStreetMap não pode ser usado sem internet — DOSSIE.md B7). Sem fundo, os pontos aparecem mesmo assim.
   Só aparecem túmulos com coordenada (levantamento da empresa ou GPS); o mapa por posição continua para todos. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const M = VP.mapaReal = {};
  // Cor de cada classe do mapa por posição (as mesmas cores, lidas do estilo)
  const corDaClasse = (classe) => {
    const s = document.createElement('span'); s.className = classe; s.style.display = 'none'; document.body.appendChild(s);
    const c = getComputedStyle(s).getPropertyValue('--cor').trim(); s.remove();
    return c || '#888';
  };
  M.abas = (qual) => `<nav class="abas"><a href="#mapa" class="${qual === 'posicao' ? 'ativa' : ''}">Por posição (quadra, aléia, número)</a><a href="#mapa/real" class="${qual === 'real' ? 'ativa' : ''}">Sobre a imagem (coordenadas)</a></nav>`;
  M.tela = () => {
    const modos = VP.MODOS_MAPA;
    const v = VP.estado.mapaReal = VP.estado.mapaReal || { modo: 'ocupacao', ruas: true };
    const comCoord = VP.db.lista('tumulos').filter(VP.temCoordenada);
    const cem = VP.db.lista('cemiterios')[0];
    const o0 = cem?.geo?.ortofoto; // no cadastro os números podem vir como texto, com vírgula
    const orto = o0 ? { url: o0.url, sul: u.num(o0.sul), norte: u.num(o0.norte), oeste: u.num(o0.oeste), leste: u.num(o0.leste) } : null;
    const temOrto = !!(orto?.url && [orto.sul, orto.norte, orto.oeste, orto.leste].every(Number.isFinite));
    const modo = modos[v.modo];
    const contagem = new Map(modo.legenda.map(([c]) => [c, 0]));
    for (const t of comCoord) { const c = modo.classe(t); contagem.set(c, (contagem.get(c) || 0) + 1); }
    return {
      titulo: 'Mapa do cemitério',
      acoes: '<a class="botao" href="#relatorio/fotografico">Relatório com fotos e mapa</a>',
      html: `${M.abas('real')}
        <div class="linha-filtros">
          <label>Colorir por <select data-modo-real>${Object.entries(modos).map(([k, m]) => `<option value="${k}" ${k === v.modo ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>
          <label class="linha-check"><input type="checkbox" data-ruas ${v.ruas ? 'checked' : ''}> Mapa de ruas (precisa de internet)</label>
          <label>Achar <input data-achar-real size="12" placeholder="Código ou plaqueta"></label>
        </div>
        <div class="legenda">${modo.legenda.map(([c, n]) => `<span><i class="${c}"></i>${esc(n)} (${u.inteiro(contagem.get(c) || 0)})</span>`).join('')}</div>
        <p class="ajuda">${u.inteiro(comCoord.length)} de ${u.inteiro(VP.db.lista('tumulos').length)} túmulos têm coordenada. ${temOrto ? 'Fundo: foto aérea do levantamento.' : 'Sem foto aérea cadastrada (Cadastros → Cemitérios).'} Clique num ponto para abrir a ficha.</p>
        ${comCoord.length || temOrto ? '<div id="mapa-leaflet" class="mapa-leaflet" role="application" aria-label="Mapa do cemitério"></div>' : '<section class="cartao"><p>Ainda não há túmulos com coordenada. A localização exata virá do levantamento da empresa especializada (menu Localização). Enquanto isso, use o mapa por posição.</p></section>'}`,
      ligar() {
        const re = () => VP.app.render();
        document.querySelector('[data-modo-real]').addEventListener('change', (e) => { v.modo = e.target.value; re(); });
        document.querySelector('[data-ruas]').addEventListener('change', (e) => { v.ruas = e.target.checked; re(); });
        const div = document.getElementById('mapa-leaflet');
        if (!div) return;
        if (!window.L) { div.innerHTML = '<p class="aviso-inline">A biblioteca do mapa não carregou.</p>'; return; }
        const mapa = window.L.map(div, { preferCanvas: true, maxZoom: 22 });
        M.ultimoMapa = mapa;
        if (v.ruas) window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 19, attribution: '© colaboradores do OpenStreetMap' }).addTo(mapa);
        const limites = [];
        if (temOrto) { const b = [[orto.sul, orto.oeste], [orto.norte, orto.leste]]; window.L.imageOverlay(orto.url, b, { opacity: 1 }).addTo(mapa); limites.push(...b); }
        for (const q of VP.db.lista('quadras').filter((x) => x.geo?.poligono?.length >= 3)) window.L.polygon(q.geo.poligono, { color: '#16365a', weight: 1, fillOpacity: 0.05 }).bindTooltip(q.nome).addTo(mapa);
        const cores = new Map(modo.legenda.map(([c]) => [c, corDaClasse(c)]));
        const marcas = new Map();
        for (const t of comCoord) {
          const cor = cores.get(modo.classe(t)) || '#888';
          const mk = window.L.circleMarker([t.geo.lat, t.geo.lon], { radius: 6, color: '#fff', weight: 1, fillColor: cor, fillOpacity: 0.95 })
            .bindPopup(`<b>${esc(VP.codigoQR(t))}</b><br>${esc(VP.rotuloTumulo(t))}<br>${esc(L.ocupacao[t.ocupacao])} · ${esc(L.situacoes[VP.situacaoAtual(t)])}<br><a href="#tumulo/${esc(t.id)}">Abrir ficha</a> · <a target="_blank" rel="noopener" href="${esc(VP.linkGoogleMaps(t.geo.lat, t.geo.lon))}">Google Maps</a>`)
            .addTo(mapa);
          mk.options.tumuloId = t.id;
          marcas.set(t.id, mk);
          limites.push([t.geo.lat, t.geo.lon]);
        }
        M.marcas = marcas;
        if (limites.length) mapa.fitBounds(limites, { padding: [20, 20], maxZoom: 20 });
        else mapa.setView([-27.2, -49.6], 15);
        document.querySelector('[data-achar-real]').addEventListener('change', (e) => {
          const t = VP.acharPorCodigo(e.target.value);
          if (!t || !marcas.has(t.id)) return ui.aviso(t ? 'Este túmulo ainda não tem coordenada.' : 'Túmulo não encontrado.', 'erro');
          mapa.setView([t.geo.lat, t.geo.lon], 20); marcas.get(t.id).openPopup();
        });
      }
    };
  };

  // ------------------------------------------------------------------ relatório fotográfico com mapa (etapa 8)
  M.relatorioFotos = () => {
    const v = VP.estado.relFotos = VP.estado.relFotos || { quadraId: '', situacao: '', soComFoto: true };
    const lista = () => {
      let l = VP.filtrarTumulos({ quadraId: v.quadraId || undefined, situacao: v.situacao || undefined });
      const fotosDe = (t) => (t.fotos || []).concat(VP.vistoriasDe(t.id).flatMap((x) => x.fotos || [])).filter((f) => f.dataURL);
      l = l.map((t) => ({ t, fotos: fotosDe(t) }));
      if (v.soComFoto) l = l.filter((x) => x.fotos.length);
      return l;
    };
    const desenhar = () => {
      const l = lista();
      const pontos = l.filter((x) => VP.temCoordenada(x.t)).map((x) => ({ lat: x.t.geo.lat, lon: x.t.geo.lon, cor: corDaClasse('c-s-' + VP.situacaoAtual(x.t)), rotulo: VP.codigoQR(x.t), link: '#tumulo/' + x.t.id }));
      const contornos = VP.db.lista('quadras').filter((q) => q.geo?.poligono?.length >= 3 && (!v.quadraId || q.id === v.quadraId)).map((q) => ({ pontos: q.geo.poligono, rotulo: q.nome }));
      const max = 150;
      return `<div id="corpo-relatorio"><h2>Relatório fotográfico — ${esc(VP.nomeEntidade())}</h2>
        <p class="ajuda">${u.inteiro(l.length)} túmulo(s)${v.quadraId ? ' · ' + esc(VP.nome('quadras', v.quadraId)) : ''}${v.situacao ? ' · ' + esc(L.situacoes[v.situacao]) : ''} · gerado em ${u.data(VP.Plataforma.hoje())}${l.length > max ? ` · mostrando os primeiros ${max}; filtre por quadra para ver os demais` : ''}</p>
        <section class="cartao"><h3>Mapa</h3>${G.mapaPontos(pontos, { contornos, titulo: 'Túmulos do relatório' })}${pontos.length ? `<div class="legenda">${Object.entries(L.situacoes).map(([k, n]) => `<span><i class="c-s-${k}"></i>${esc(n)}</span>`).join('')}</div>` : ''}</section>
        <div class="fichas-fotos">${l.slice(0, max).map(({ t, fotos }) => { const vs = VP.vistoriasDe(t.id)[0]; return `<article class="ficha-foto-rel"><header><b>${esc(VP.codigoQR(t))}</b> · ${esc(VP.rotuloTumulo(t))}</header>
          <p>${esc(L.tipos[t.tipo])} · ${esc(L.ocupacao[t.ocupacao])} · <b>${esc(L.situacoes[VP.situacaoAtual(t)])}</b>${vs ? ` · última vistoria ${u.data(vs.data)} (nota ${VP.notaVistoria(vs)} de 16)` : ''}${VP.temCoordenada(t) ? ` · ${t.geo.lat.toFixed(6)}, ${t.geo.lon.toFixed(6)}` : ''}</p>
          <div class="fotos-rel">${fotos.slice(0, 4).map((f) => `<figure><img src="${esc(f.dataURL)}" alt="Foto"><figcaption>${u.data(f.data)}</figcaption></figure>`).join('') || '<span class="vazio">Sem foto</span>'}</div></article>`; }).join('') || '<p class="vazio">Nenhum túmulo neste filtro.</p>'}</div></div>`;
    };
    return {
      titulo: 'Relatório fotográfico com mapa',
      acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a> <button class="botao primario" data-imprimir>Imprimir / PDF</button>',
      html: `<div class="linha-filtros"><label>Quadra <select data-rf="quadraId"><option value="">Todas</option>${VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem).map((q) => `<option value="${esc(q.id)}" ${q.id === v.quadraId ? 'selected' : ''}>${esc(q.nome)}</option>`).join('')}</select></label>
        <label>Situação <select data-rf="situacao"><option value="">Todas</option>${Object.entries(L.situacoes).map(([k, n]) => `<option value="${k}" ${k === v.situacao ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="linha-check"><input type="checkbox" data-rf="soComFoto" ${v.soComFoto ? 'checked' : ''}> Só túmulos com foto</label></div>
        <div id="area-rf">${desenhar()}</div>`,
      ligar() {
        document.querySelectorAll('[data-rf]').forEach((el) => el.addEventListener('change', () => { v[el.dataset.rf] = el.type === 'checkbox' ? el.checked : el.value; document.getElementById('area-rf').innerHTML = desenhar(); }));
        document.querySelector('[data-imprimir]').addEventListener('click', () => ui.imprimir(document.getElementById('corpo-relatorio').innerHTML, 'Relatório fotográfico'));
      }
    };
  };
})();

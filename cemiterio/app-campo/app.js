/* VitalPat Cemitério — aplicativo de campo, piloto (demonstração).
   Sistema independente: não usa nenhum arquivo de outro sistema.
   Tudo fica guardado no próprio aparelho (IndexedDB) até existir um servidor para envio. */
'use strict';

// ---------------------------------------------------------------------------
// Funções que dependem do aparelho. Ficam num objeto separado para poderem ser
// trocadas em testes (ex.: window.Plataforma.obterGPS = () => Promise.resolve(...)).
// ---------------------------------------------------------------------------
window.Plataforma = window.Plataforma || {
  agora: () => new Date(),
  online: () => navigator.onLine,
  temLeitorQR: () => 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  ehIPhone: () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream,
  obterGPS: () => new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: Math.round(p.coords.accuracy) }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  })
};
const P = () => window.Plataforma;
const D = window.DADOS_EXEMPLO;

// ---------------------------------------------------------------------------
// Armazenamento no aparelho
// ---------------------------------------------------------------------------
const Banco = {
  _db: null,
  abrir() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, erro) => {
      const req = indexedDB.open('vitalpat-cemiterio', 1); // nome próprio: os dois sistemas podem ficar no mesmo aparelho
      req.onupgradeneeded = () => req.result.createObjectStore('registros', { keyPath: 'id' });
      req.onsuccess = () => { this._db = req.result; ok(this._db); };
      req.onerror = () => erro(req.error);
    });
  },
  async salvar(reg) {
    const db = await this.abrir();
    return new Promise((ok, erro) => {
      const t = db.transaction('registros', 'readwrite');
      t.objectStore('registros').put(reg);
      t.oncomplete = () => ok(reg);
      t.onerror = () => erro(t.error);
    });
  },
  async todos() {
    const db = await this.abrir();
    return new Promise((ok, erro) => {
      const req = db.transaction('registros').objectStore('registros').getAll();
      req.onsuccess = () => ok(req.result.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)));
      req.onerror = () => erro(req.error);
    });
  }
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function avisar(texto) {
  const m = $('#mensagem');
  m.textContent = texto;
  m.classList.remove('oculto');
  clearTimeout(avisar._t);
  avisar._t = setTimeout(() => m.classList.add('oculto'), 3500);
}

const NOMES_TIPO = { tumulo: 'Vistoria de túmulo', ocorrencia: 'Aviso de problema', conclusaoOS: 'Ordem de serviço feita' };

// ---------------------------------------------------------------------------
// Lista de túmulos e ordens abertas guardada no aparelho (para trabalhar sem internet).
// Com servidor: baixada do servidor. Na demonstração: dados de exemplo fictícios.
// ---------------------------------------------------------------------------
const Catalogo = {
  chave: 'vitalpat-cemiterio-lista',
  ler() { try { return JSON.parse(localStorage.getItem(this.chave)); } catch (_) { return null; } },
  gravar(l) { try { localStorage.setItem(this.chave, JSON.stringify(l)); return true; } catch (_) { return false; } },
  servidor: () => !!window.Envio?.ativo,
  tumulos() { return this.servidor() ? (this.ler()?.tumulos || []) : D.tumulos; },
  ordens() { return this.servidor() ? (this.ler()?.ordens || []) : (D.ordens || []); },
  // Sem diferença de maiúsculas, espaços e zeros à esquerda (Q01-A01-002 = Q1-A1-2)
  norm: (c) => String(c || '').toUpperCase().replace(/\s+/g, '').replace(/(^|-)([A-Z]?)0*(\d)/g, '$1$2$3'),
  achar(cod) {
    const n = this.norm(cod);
    if (!n) return null;
    // Só números = número da plaqueta (000123 = 123)
    if (/^\d{1,6}$/.test(n)) return this.tumulos().find((t) => t.plaqueta && Number(t.plaqueta) === Number(n)) || null;
    return this.tumulos().find((t) => this.norm(t.codigo) === n) || null;
  }
};
async function atualizarLista() {
  if (!window.Envio?.ativo || !P().online()) return null;
  try {
    const r = await window.Envio.baixarLista();
    if (r.lista) { Catalogo.gravar(r.lista); return r.lista; }
  } catch (_) { /* fica a lista anterior */ }
  return null;
}

// ---------------------------------------------------------------------------
// Fotos: reduz o tamanho e grava data, hora e localização na própria imagem
// ---------------------------------------------------------------------------
function lerArquivo(arquivo) {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => erro(r.error);
    r.readAsDataURL(arquivo);
  });
}
function carregarImagem(src) {
  return new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
}
async function prepararFoto(arquivo, gps) {
  const img = await carregarImagem(await lerArquivo(arquivo));
  const max = 1280;
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala), h = Math.round(img.height * escala);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const local = gps ? `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)} (±${gps.precisao} m)` : 'localização indisponível';
  const texto = `${dataHora(P().agora().toISOString())} · ${local}`;
  const fs = Math.max(14, Math.round(w / 45));
  g.fillStyle = 'rgba(0,0,0,.6)';
  g.fillRect(0, h - fs * 1.8, w, fs * 1.8);
  g.fillStyle = '#fff';
  g.font = `${fs}px sans-serif`;
  g.fillText(texto, fs * 0.6, h - fs * 0.6);
  return c.toDataURL('image/jpeg', 0.72);
}

// Campo de fotos reutilizado em todos os formulários
function campoFotos(rotulo = 'Fotos') {
  return `
    <label for="fotos">${rotulo}</label>
    <input type="file" id="fotos" accept="image/*" capture="environment" multiple>
    <p class="ajuda">A data, a hora e a localização ficam gravadas na foto.</p>
    <div class="fotos" id="previa-fotos"></div>`;
}
function ligarFotos(estado) {
  $('#fotos').addEventListener('change', async (e) => {
    const gps = estado.gps || await P().obterGPS();
    estado.gps = gps;
    for (const arq of e.target.files) {
      try { estado.fotos.push(await prepararFoto(arq, gps)); } catch (_) { avisar('Não foi possível ler uma das fotos.'); }
    }
    $('#previa-fotos').innerHTML = estado.fotos.map((f) => `<img src="${f}" alt="Foto anexada">`).join('');
    e.target.value = '';
  });
}

// Escala de botões (ex.: estado de conservação 1 a 5)
function escala(id, valores, rotulos) {
  return `<div class="escala" id="${id}" role="group">` +
    valores.map((v, i) => `<button type="button" data-valor="${v}" aria-pressed="false" title="${esc(rotulos ? rotulos[i] : v)}">${esc(v)}</button>`).join('') +
    '</div>';
}
function ligarEscala(id) {
  const g = $('#' + id);
  g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    g.dataset.valor = b.dataset.valor;
  });
}
const valorEscala = (id) => $('#' + id).dataset.valor ?? null;

// Leitura de QR Code pela câmera (só onde o navegador oferece); senão, digitação.
function campoCodigo(rotulo, exemplo) {
  const temQR = P().temLeitorQR();
  return `
    <label for="codigo">${rotulo}</label>
    <div class="linha">
      <input id="codigo" inputmode="text" autocomplete="off" placeholder="${esc(exemplo)}">
      ${temQR ? '<button type="button" class="botao secundario" id="ler-qr">Ler QR Code</button>' : ''}
    </div>
    ${temQR ? '' : '<p class="ajuda">Este aparelho não lê QR Code por aqui. Digite o número da plaqueta.</p>'}
    <video class="leitor oculto" id="video" playsinline muted></video>`;
}
function ligarLeitorQR(aoLer) {
  const b = $('#ler-qr'); if (!b) return;
  b.addEventListener('click', async () => {
    const video = $('#video');
    let fluxo;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (_) { avisar('Não foi possível abrir a câmera. Digite o número.'); return; }
    video.srcObject = fluxo; video.classList.remove('oculto'); await video.play();
    const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
    const parar = () => { fluxo.getTracks().forEach((t) => t.stop()); video.classList.add('oculto'); };
    const fim = Date.now() + 30000;
    (async function procurar() {
      if (Date.now() > fim) { parar(); avisar('Nenhum código encontrado. Digite o número.'); return; }
      try {
        const achados = await detector.detect(video);
        if (achados.length) { parar(); $('#codigo').value = achados[0].rawValue; aoLer(achados[0].rawValue); return; }
      } catch (_) { /* tenta de novo */ }
      requestAnimationFrame(procurar);
    })();
  });
}

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------
const Telas = {};

Telas.inicio = async () => {
  const regs = await Banco.todos();
  const aguardando = regs.filter((r) => r.situacao === 'aguardando').length;
  const lixeira = regs.filter((r) => r.situacao === 'lixeira').length;
  const lista = Catalogo.ler();
  const nOrdens = Catalogo.ordens().length;
  return {
    titulo: 'VitalPat Cemitério',
    html: `
      ${window.Envio?.ativo ? `<p class="aviso-demo">Conectado ao servidor${window.Envio.municipio ? ' · ' + esc(window.Envio.municipio) : ''}. ${regs.filter((r) => r.situacao === 'enviado').length} registro(s) já enviado(s) deste aparelho.</p>` : '<p class="aviso-demo">Versão de demonstração. Os dados de exemplo são fictícios.</p>'}
      <div class="grade tres">
        <button class="cartao" data-ir="tumulo"><strong>Vistoria de túmulo</strong><span>Estrutura, limpeza, identificação, tampa e sinais de visita</span></button>
        <button class="cartao" data-ir="ordens"><strong>Ordens de serviço</strong><span><span class="contador">${nOrdens}</span> aberta(s) para a equipe</span></button>
        <button class="cartao" data-ir="ocorrencia"><strong>Aviso de problema</strong><span>Limpeza, conserto, acidente ou risco encontrado no túmulo</span></button>
        <button class="cartao" data-ir="registros"><strong>Registros</strong><span><span class="contador" id="qtd-aguardando">${aguardando}</span> aguardando envio</span></button>
        <button class="cartao" data-ir="lixeira"><strong>Lixeira</strong><span>${lixeira} registro(s) excluído(s), que podem ser restaurados</span></button>
      </div>
      ${window.Envio?.ativo ? `<div class="cartao" style="margin-top:12px">
        <h3 style="margin-top:0">Lista de túmulos no aparelho</h3>
        <p class="ajuda" id="situacao-lista">${lista ? `${lista.tumulos.length} túmulos e ${lista.ordens.length} ordem(ns) aberta(s), atualizada em ${esc(dataHora(lista.quando))}.` : 'Ainda não baixada. Com internet, toque em “Atualizar lista” para conferir os códigos mesmo sem internet depois.'}</p>
        <button class="botao secundario" id="atualizar-lista">Atualizar lista</button>
      </div>` : ''}
      <div class="cartao" style="margin-top:12px">
        <h3 style="margin-top:0">Instalar no aparelho</h3>
        <button class="botao oculto" id="instalar">Instalar aplicativo</button>
        <p class="ajuda" id="instrucao-instalar">${P().ehIPhone()
          ? 'No iPhone ou iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
          : 'No Android: abra o menu do navegador (⋮) e toque em “Instalar aplicativo” ou “Adicionar à tela inicial”.'}</p>
      </div>`,
    ligar() {
      document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));
      $('#atualizar-lista')?.addEventListener('click', async () => {
        const b = $('#atualizar-lista');
        if (!P().online()) { avisar('Sem internet. A lista anterior continua no aparelho.'); return; }
        b.disabled = true; b.textContent = 'Baixando…';
        const l = await atualizarLista();
        avisar(l ? `Lista atualizada: ${l.tumulos.length} túmulos.` : 'Não foi possível baixar a lista agora. Tente de novo.');
        render();
      });
      if (Instalacao.evento) {
        $('#instalar').classList.remove('oculto');
        $('#instalar').addEventListener('click', async () => {
          Instalacao.evento.prompt();
          await Instalacao.evento.userChoice;
          Instalacao.evento = null;
          $('#instalar').classList.add('oculto');
        });
      }
    }
  };
};

// --- Vistoria de túmulo -------------------------------------------------------
Telas.tumulo = async () => {
  const estado = { fotos: [], gps: null };
  const rot = ['0 — sem problema', '1', '2', '3', '4 — muito grave'];
  return {
    titulo: 'Vistoria de túmulo',
    html: `
      ${campoCodigo('Número da plaqueta ou código do túmulo', 'Ex.: 000123 ou Q01-A1-2')}
      <div id="achado"></div>
      <p class="ajuda">Notas de 0 (sem problema) a 4 (muito grave).</p>
      <label>Estrutura (rachaduras, desabamento, risco)</label>${escala('v1', ['0', '1', '2', '3', '4'], rot)}
      <label>Limpeza e mato</label>${escala('v2', ['0', '1', '2', '3', '4'], rot)}
      <label>Identificação (lápide ou placa legível)</label>${escala('v3', ['0', '1', '2', '3', '4'], rot)}
      <label>Tampa e vedação</label>${escala('v4', ['0', '1', '2', '3', '4'], rot)}
      <label>Há sinais de visita recente (flores, velas, limpeza)?</label>${escala('v5', ['Sim', 'Não'])}
      <label for="obs">Observação</label>
      <textarea id="obs" placeholder="Opcional"></textarea>
      ${campoFotos('Fotos do túmulo')}
      <div class="alerta"><strong>Importante:</strong> esta vistoria só registra o que foi visto. Nenhuma medida sobre o túmulo é tomada pelo aplicativo.</div>
      <button class="botao largo" id="salvar">Salvar vistoria</button>`,
    ligar() {
      ['v1', 'v2', 'v3', 'v4', 'v5'].forEach(ligarEscala);
      ligarFotos(estado);
      const mostrar = (cod) => {
        $('#achado').innerHTML = mensagemTumulo(cod);
      };
      $('#codigo').addEventListener('change', (e) => mostrar(e.target.value));
      ligarLeitorQR(mostrar);
      $('#salvar').addEventListener('click', async () => {
        const codigo = $('#codigo').value.trim().toUpperCase();
        if (!codigo) { avisar('Informe o código do túmulo.'); return; }
        const notas = ['v1', 'v2', 'v3', 'v4', 'v5'].map(valorEscala);
        if (notas.some((n) => n === null)) { avisar('Responda todos os itens da vistoria.'); return; }
        await salvarRegistro('tumulo', estado, {
          codigo, cadastrado: !!Catalogo.achar(codigo),
          estrutura: notas[0], limpeza: notas[1], identificacao: notas[2], tampa: notas[3],
          sinaisDeVisita: notas[4], observacao: $('#obs').value.trim()
        });
        ir('tumulo');
      });
    }
  };
};

function mensagemTumulo(cod) {
  if (!cod) return '';
  const t = Catalogo.achar(cod);
  if (t) return `<div class="sucesso">${esc(t.descricao)}</div>`;
  if (Catalogo.servidor() && !Catalogo.ler()) return '<div class="alerta">A lista de túmulos ainda não foi baixada neste aparelho. O registro será conferido no escritório.</div>';
  return '<div class="alerta"><strong>Túmulo sem cadastro.</strong> Será registrado para conferência.</div>';
}

// --- Aviso de problema (vira ordem de serviço depois que o escritório confere) ---
Telas.ocorrencia = async () => {
  const estado = { fotos: [], gps: null };
  return {
    titulo: 'Aviso de problema',
    html: `
      ${campoCodigo('Número da plaqueta ou código do túmulo', 'Ex.: 000123 ou Q01-A1-2')}
      <div id="achado"></div>
      <label>O que precisa</label>
      ${escala('tipo-oc', ['Limpeza', 'Conserto', 'Acidente ou risco', 'Outro'])}
      <label for="desc">Descrição</label>
      <textarea id="desc" placeholder="Ex.: lápide caída, mato alto, tampa quebrada"></textarea>
      ${campoFotos('Fotos do problema')}
      <div class="alerta">O aviso vai para o escritório, que confere e abre a ordem de serviço.</div>
      <button class="botao largo" id="salvar">Salvar aviso</button>`,
    ligar() {
      ligarEscala('tipo-oc');
      ligarFotos(estado);
      $('#codigo').addEventListener('change', (e) => { $('#achado').innerHTML = mensagemTumulo(e.target.value); });
      ligarLeitorQR((c) => { $('#achado').innerHTML = mensagemTumulo(c); });
      $('#salvar').addEventListener('click', async () => {
        const codigo = $('#codigo').value.trim().toUpperCase();
        const tipo = { Limpeza: 'limpeza', Conserto: 'reparo', 'Acidente ou risco': 'acidente', Outro: 'outro' }[valorEscala('tipo-oc')];
        const descricao = $('#desc').value.trim();
        if (!codigo) { avisar('Informe o código do túmulo.'); return; }
        if (!tipo) { avisar('Escolha o que precisa.'); return; }
        if (!descricao) { avisar('Descreva o problema.'); return; }
        await salvarRegistro('ocorrencia', estado, { codigo, cadastrado: !!Catalogo.achar(codigo), tipoOrdem: tipo, descricao });
        ir('inicio');
      });
    }
  };
};

// --- Ordens de serviço abertas (marcar como feita, com foto) -------------------
const Selecao = { ordemId: null };
Telas.ordens = async () => {
  const feitas = new Set((await Banco.todos()).filter((r) => r.tipo === 'conclusaoOS' && r.situacao !== 'lixeira').map((r) => r.dados.ordemId));
  const ordens = Catalogo.ordens();
  const o = ordens.find((x) => x.id === Selecao.ordemId);
  if (o) {
    const estado = { fotos: [], gps: null };
    return {
      titulo: 'Ordem ' + o.numero,
      html: `
        <div class="cartao"><strong>${esc(o.tipoNome)}${o.prioridade === 'urgente' ? ' · URGENTE' : ''}</strong><p>${esc(o.oQueFazer)}</p><p class="ajuda">${esc(o.codigo)} · ${esc(o.descricao)} · prazo ${esc(o.prazo ? o.prazo.split('-').reverse().join('/') : '—')}</p></div>
        <label for="nota">O que foi feito</label>
        <textarea id="nota" placeholder="Ex.: mato cortado e lápide limpa"></textarea>
        ${campoFotos('Fotos do serviço feito')}
        <button class="botao largo" id="salvar">Marcar como feita</button>
        <button class="botao secundario largo" id="cancelar" style="margin-top:8px">Voltar à lista</button>`,
      ligar() {
        ligarFotos(estado);
        $('#cancelar').addEventListener('click', () => { Selecao.ordemId = null; render(); });
        $('#salvar').addEventListener('click', async () => {
          const nota = $('#nota').value.trim();
          if (!nota) { avisar('Conte o que foi feito.'); return; }
          if (!estado.fotos.length) { avisar('Tire pelo menos uma foto do serviço feito.'); return; }
          await salvarRegistro('conclusaoOS', estado, { ordemId: o.id, numeroOrdem: o.numero, codigo: o.codigo, nota });
          Selecao.ordemId = null;
          render();
        });
      }
    };
  }
  return {
    titulo: 'Ordens de serviço',
    html: `
      <p class="ajuda">${Catalogo.servidor() ? (Catalogo.ler() ? `Lista baixada em ${esc(dataHora(Catalogo.ler().quando))}. Para ver ordens novas, use “Atualizar lista” na tela inicial.` : 'Lista ainda não baixada. Use “Atualizar lista” na tela inicial, com internet.') : 'Exemplos fictícios da demonstração.'}</p>
      ${ordens.length ? `<ul class="lista">${ordens.map((x) => `
        <li><div class="topo"><strong>${esc(x.numero)} · ${esc(x.tipoNome)}${x.prioridade === 'urgente' ? ' · URGENTE' : ''}</strong><span class="data">prazo ${esc(x.prazo ? x.prazo.split('-').reverse().join('/') : '—')}</span></div>
          <div>${esc(x.oQueFazer)}</div><div class="ajuda">${esc(x.codigo)} · ${esc(x.descricao)}</div>
          <div class="topo" style="margin-top:8px">${feitas.has(x.id) ? '<span class="etiqueta">Marcada como feita neste aparelho</span>' : `<button class="botao" data-ordem="${esc(x.id)}">Marcar como feita</button>`}</div></li>`).join('')}</ul>` : '<p class="ajuda">Nenhuma ordem de serviço aberta.</p>'}`,
    ligar() {
      document.querySelectorAll('[data-ordem]').forEach((b) => b.addEventListener('click', () => { Selecao.ordemId = b.dataset.ordem; render(); }));
    }
  };
};

// --- Registros e Lixeira -------------------------------------------------------
function resumo(r) {
  const d = r.dados;
  switch (r.tipo) {
    case 'tumulo': return `${d.codigo} · estrutura ${d.estrutura}, limpeza ${d.limpeza}, identificação ${d.identificacao}, tampa ${d.tampa} · visita recente: ${d.sinaisDeVisita}`;
    case 'ocorrencia': return `${d.codigo} · ${d.descricao}`;
    case 'conclusaoOS': return `Ordem ${d.numeroOrdem} (${d.codigo}) · ${d.nota}`;
    default: return '';
  }
}
function listaHtml(regs, acao) {
  if (!regs.length) return '<p class="ajuda">Nenhum registro.</p>';
  return '<ul class="lista">' + regs.map((r) => `
    <li data-id="${r.id}">
      <div class="topo"><strong>${esc(NOMES_TIPO[r.tipo])}</strong><span class="data">${esc(dataHora(r.criadoEm))}</span></div>
      <div>${esc(resumo(r))}</div>
      <div class="topo" style="margin-top:8px">
        <span class="etiqueta">${r.situacao === 'lixeira' ? 'Na Lixeira desde ' + esc(dataHora(r.excluidoEm)) : r.ultimoErro ? 'Não enviado: ' + esc(r.ultimoErro) : 'Aguardando envio'} · ${r.fotos.length} foto(s) · ${r.gps ? 'com localização' : 'sem localização'}</span>
        ${acao === 'excluir' ? '<button class="botao perigo" data-acao="excluir">Excluir</button>' : '<button class="botao secundario" data-acao="restaurar">Restaurar</button>'}
      </div>
    </li>`).join('') + '</ul>';
}

Telas.registros = async () => {
  const regs = (await Banco.todos()).filter((r) => r.situacao === 'aguardando');
  return {
    titulo: 'Registros',
    html: `
      <div class="cartao">
        <p style="margin-top:0"><span class="contador">${regs.length}</span> registro(s) guardado(s) neste aparelho, aguardando envio.</p>
        ${window.Envio?.ativo
          ? `<button class="botao" id="enviar" ${regs.length ? '' : 'disabled'}>Enviar para o servidor</button>
        <p class="ajuda">Com internet, o envio também acontece sozinho. Sem internet, os registros ficam guardados aqui até a internet voltar.</p>
        <div id="resultado-envio"></div>`
          : `<button class="botao" disabled title="Ainda não disponível">Enviar</button>
        <p class="ajuda">Nesta versão de demonstração não há servidor. Para tirar os dados do aparelho, use “Baixar planilha” ou “Baixar cópia completa”.</p>`}
        <button class="botao secundario" id="json" style="margin-top:8px">Baixar cópia completa (com fotos)</button>
      </div>
      <div class="cartao" style="margin-top:12px">
        <h3 style="margin-top:0">Baixar planilha</h3>
        <p class="ajuda">Escolha o tipo de registro e marque só as informações que o outro sistema aceita.</p>
        <label for="tipo-planilha">Tipo de registro</label>
        <select id="tipo-planilha">
          <option value="">Todos</option>
          ${Object.entries(NOMES_TIPO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
        </select>
        <label>Informações (colunas)</label>
        <div class="linha">
          <button type="button" class="botao secundario" id="marcar-todas">Marcar todas</button>
          <button type="button" class="botao secundario" id="desmarcar-todas">Desmarcar todas</button>
        </div>
        <div id="colunas" class="colunas"></div>
        <button class="botao largo" id="csv">Baixar planilha</button>
      </div>
      <h2>Lista</h2>
      ${listaHtml(regs, 'excluir')}`,
    ligar() {
      const desenhar = () => {
        const tipo = $('#tipo-planilha').value;
        const filtrados = regs.filter((r) => !tipo || r.tipo === tipo);
        const salvas = Preferencias.ler('colunas-' + (tipo || 'todos'));
        $('#colunas').innerHTML = colunasDisponiveis(filtrados).map((c) => `
          <label class="opcao"><input type="checkbox" value="${esc(c.chave)}" ${!salvas || salvas.includes(c.chave) ? 'checked' : ''}> ${esc(c.rotulo)}</label>`).join('')
          || '<p class="ajuda">Nenhum registro deste tipo.</p>';
      };
      $('#enviar')?.addEventListener('click', async () => {
        const b = $('#enviar');
        b.disabled = true; b.textContent = 'Enviando…';
        const r = await window.Envio.enviar(Banco, (n, total) => { b.textContent = `Enviando… ${n} de ${total}`; });
        if (r.semLogin) { $('#resultado-envio').innerHTML = '<p class="erro">Sua sessão terminou. Saia e entre de novo (com internet) para enviar. Os registros continuam guardados.</p>'; b.disabled = false; b.textContent = 'Enviar para o servidor'; return; }
        sessionStorage.setItem('vitalpat-cemiterio-ultimo-envio', JSON.stringify({ enviados: r.enviados.length, falhas: r.falhas }));
        render();
      });
      const ultimo = (() => { try { return JSON.parse(sessionStorage.getItem('vitalpat-cemiterio-ultimo-envio')); } catch (_) { return null; } })();
      if (ultimo && $('#resultado-envio')) {
        sessionStorage.removeItem('vitalpat-cemiterio-ultimo-envio');
        $('#resultado-envio').innerHTML = `<div class="resultado-envio"><p><strong>${ultimo.enviados}</strong> registro(s) enviado(s).</p>${ultimo.falhas.length ? `<p class="erro">${ultimo.falhas.length} não enviado(s):</p><ul>${ultimo.falhas.map((f) => `<li>${esc(f.motivo)}</li>`).join('')}</ul>` : ''}</div>`;
      }
      $('#tipo-planilha').addEventListener('change', desenhar);
      $('#marcar-todas').addEventListener('click', () => document.querySelectorAll('#colunas input').forEach((i) => { i.checked = true; }));
      $('#desmarcar-todas').addEventListener('click', () => document.querySelectorAll('#colunas input').forEach((i) => { i.checked = false; }));
      desenhar();
      $('#csv').addEventListener('click', () => {
        const tipo = $('#tipo-planilha').value;
        const escolhidas = [...document.querySelectorAll('#colunas input:checked')].map((i) => i.value);
        const filtrados = regs.filter((r) => !tipo || r.tipo === tipo);
        if (!filtrados.length) { avisar('Não há registros deste tipo.'); return; }
        if (!escolhidas.length) { avisar('Marque pelo menos uma informação.'); return; }
        Preferencias.gravar('colunas-' + (tipo || 'todos'), escolhidas);
        exportarCSV(filtrados, escolhidas);
      });
      $('#json').addEventListener('click', () => baixar(`vitalpat-cemiterio-registros-${carimbo()}.json`, JSON.stringify(regs, null, 2), 'application/json'));
      ligarAcoesLista();
    }
  };
};

Telas.lixeira = async () => {
  const regs = (await Banco.todos()).filter((r) => r.situacao === 'lixeira');
  return {
    titulo: 'Lixeira',
    html: `<p class="ajuda">Registros excluídos ficam aqui e podem ser restaurados. Nada é apagado de verdade.</p>${listaHtml(regs, 'restaurar')}`,
    ligar: ligarAcoesLista
  };
};

function ligarAcoesLista() {
  document.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('li').dataset.id;
    const reg = (await Banco.todos()).find((r) => r.id === id);
    if (b.dataset.acao === 'excluir') {
      reg.situacao = 'lixeira'; reg.excluidoEm = P().agora().toISOString();
      reg.historico.push({ quando: reg.excluidoEm, acao: 'movido para a Lixeira' });
      avisar('Registro movido para a Lixeira.');
    } else {
      reg.situacao = 'aguardando';
      reg.historico.push({ quando: P().agora().toISOString(), acao: 'restaurado da Lixeira' });
      delete reg.excluidoEm;
      avisar('Registro restaurado.');
    }
    await Banco.salvar(reg);
    render();
  }));
}

// ---------------------------------------------------------------------------
// Salvar e exportar
// ---------------------------------------------------------------------------
async function salvarRegistro(tipo, estado, dados) {
  const gps = estado.gps || await P().obterGPS();
  const agora = P().agora().toISOString();
  const reg = {
    id: novoId(), tipo, criadoEm: agora, gps, fotos: estado.fotos, dados,
    situacao: 'aguardando', historico: [{ quando: agora, acao: 'criado' }]
  };
  await Banco.salvar(reg);
  avisar(`${NOMES_TIPO[tipo]} salvo no aparelho.` + (gps ? '' : ' (sem localização)'));
  return reg;
}
const carimbo = () => P().agora().toISOString().slice(0, 16).replace(/[-:T]/g, '');
function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Nomes das informações como aparecem na escolha de colunas e no cabeçalho da planilha
const ROTULOS = {
  codigo: 'Código do túmulo', cadastrado: 'Túmulo cadastrado', estrutura: 'Estrutura', limpeza: 'Limpeza',
  identificacao: 'Identificação', tampa: 'Tampa', sinaisDeVisita: 'Sinais de visita', observacao: 'Observação',
  tipoOrdem: 'O que precisa', descricao: 'Descrição', ordemId: 'Identificação da ordem', numeroOrdem: 'Número da ordem', nota: 'O que foi feito'
};
const COLUNAS_FIXAS = [
  { chave: '_id', rotulo: 'Número do registro', valor: (r) => r.id },
  { chave: '_tipo', rotulo: 'Tipo de registro', valor: (r) => NOMES_TIPO[r.tipo] },
  { chave: '_data', rotulo: 'Data e hora', valor: (r) => dataHora(r.criadoEm) },
  { chave: '_lat', rotulo: 'Latitude', valor: (r) => r.gps?.lat },
  { chave: '_lon', rotulo: 'Longitude', valor: (r) => r.gps?.lon },
  { chave: '_precisao', rotulo: 'Precisão da localização (m)', valor: (r) => r.gps?.precisao },
  { chave: '_fotos', rotulo: 'Quantidade de fotos', valor: (r) => r.fotos.length }
];
function colunasDisponiveis(regs) {
  if (!regs.length) return [];
  const chaves = [...new Set(regs.flatMap((r) => Object.keys(r.dados)))];
  return [...COLUNAS_FIXAS, ...chaves.map((k) => ({ chave: k, rotulo: ROTULOS[k] || k, valor: (r) => r.dados[k] }))];
}

// Lembra a última escolha de colunas neste aparelho (só conveniência; pode faltar)
const Preferencias = {
  ler(k) { try { return JSON.parse(localStorage.getItem('vitalpat-cemiterio-' + k)); } catch (_) { return null; } },
  gravar(k, v) { try { localStorage.setItem('vitalpat-cemiterio-' + k, JSON.stringify(v)); } catch (_) { /* sem problema */ } }
};

// Planilha simples: só texto, ";" como separador e marca BOM para abrir certo no Excel em português
function exportarCSV(regs, escolhidas) {
  const cols = colunasDisponiveis(regs).filter((c) => !escolhidas || escolhidas.includes(c.chave));
  const cel = (v) => {
    if (v === true) v = 'Sim';
    if (v === false) v = 'Não';
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const linhas = regs.map((r) => cols.map((c) => cel(c.valor(r))).join(';'));
  baixar(`vitalpat-cemiterio-registros-${carimbo()}.csv`, '\ufeff' + [cols.map((c) => cel(c.rotulo)).join(';'), ...linhas].join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------
const Instalacao = { evento: null };
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); Instalacao.evento = e; if (telaAtual() === 'inicio') render(); });

const telaAtual = () => (location.hash.slice(1) || 'inicio');
function ir(nome) { if (telaAtual() === nome) render(); else location.hash = nome; }

async function render() {
  const nome = Telas[telaAtual()] ? telaAtual() : 'inicio';
  const t = await Telas[nome]();
  $('#titulo').textContent = t.titulo;
  $('#voltar').classList.toggle('oculto', nome === 'inicio');
  $('#tela').innerHTML = t.html;
  window.scrollTo(0, 0);
  if (t.ligar) await t.ligar();
}
function atualizarConexao() {
  const on = P().online();
  $('#conexao').textContent = on ? 'Com internet' : 'Sem internet';
}

$('#voltar').addEventListener('click', () => { Selecao.ordemId = null; location.hash = 'inicio'; });
// Sair: volta para a tela de login. Os registros continuam guardados no aparelho.
$('#sair').addEventListener('click', async () => {
  if (window.Envio?.ativo) await window.Envio.sair();
  try { localStorage.removeItem('vitalpat-sessao'); } catch (_) { /* nada a fazer */ }
  location.replace('../../index.html?motivo=saiu');
});
window.addEventListener('hashchange', render);
window.addEventListener('online', atualizarConexao);
// Envio automático: ao abrir com internet e quando a internet volta
async function envioAutomatico() {
  if (!window.Envio?.ativo || !P().online()) return;
  // Ao abrir com internet, a lista do aparelho também é atualizada
  if (await atualizarLista() && telaAtual() === 'inicio') render();
  const r = await window.Envio.enviar(Banco);
  if (r.enviados?.length) { avisar(`${r.enviados.length} registro(s) enviado(s) ao servidor.`); if (['inicio', 'registros'].includes(telaAtual())) render(); }
}
window.addEventListener('online', envioAutomatico);
window.addEventListener('offline', atualizarConexao);
if (!window.VP_SEM_ACESSO) {
  atualizarConexao();
  render();
  envioAutomatico();
}

if (!window.VP_SEM_ACESSO && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem modo offline neste navegador */ });
}

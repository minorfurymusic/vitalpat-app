/* VitalPat Patrimônio — aplicativo de campo, piloto (demonstração).
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
      const req = indexedDB.open('vitalpat-patrimonio', 1); // nome próprio: os dois sistemas podem ficar no mesmo aparelho
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
const numero = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const nomeUnidade = (id) => (D.unidades.find((u) => u.id === id) || {}).nome || id || '—';
const opcoesUnidades = (sel) => D.unidades.map((u) => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');

function avisar(texto) {
  const m = $('#mensagem');
  m.textContent = texto;
  m.classList.remove('oculto');
  clearTimeout(avisar._t);
  avisar._t = setTimeout(() => m.classList.add('oculto'), 3500);
}

const NOMES_TIPO = { bem: 'Bem conferido', abastecimento: 'Abastecimento', viagem: 'Saída / retorno de veículo' };

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

// Estado de conservação: escala do livro de controle patrimonial + "Novo" (8 Novo … 1 Imprestável)
const ESTADOS_NOMES = ['Novo', 'Ótimo', 'Muito bom', 'Bom', 'Regular', 'Ruim', 'Péssimo', 'Imprestável'];
const ESTADOS = { 8: 'Novo', 7: 'Ótimo', 6: 'Muito bom', 5: 'Bom', 4: 'Regular', 3: 'Ruim', 2: 'Péssimo', 1: 'Imprestável' };
const ESCALA_ANTIGA = { 6: 'Novo', 5: 'Ótimo', 4: 'Bom', 3: 'Regular', 2: 'Ruim', 1: 'Péssimo' }; // registros feitos antes de 08/10/2026
const nomeEstado = (d) => (Number(d.escala) === 8 ? ESTADOS : ESCALA_ANTIGA)[d.estado] || `estado ${d.estado}`;

// Escala de botões (ex.: estado de conservação 1 a 5)
function escala(id, valores, rotulos, comNome = false) {
  return `<div class="escala${comNome ? ' com-nome' : ''}" id="${id}" role="group">` +
    valores.map((v, i) => `<button type="button" data-valor="${v}" aria-pressed="false" title="${esc(rotulos ? rotulos[i] : v)}">${comNome ? esc(rotulos[i]) : esc(v)}</button>`).join('') +
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
  return {
    titulo: 'VitalPat Patrimônio',
    html: `
      ${window.Envio?.ativo ? `<p class="aviso-demo">Conectado ao servidor${window.Envio.municipio ? ' · ' + esc(window.Envio.municipio) : ''}. ${regs.filter((r) => r.situacao === 'enviado').length} registro(s) já enviado(s) deste aparelho.</p>` : '<p class="aviso-demo">Versão de demonstração. Os dados de exemplo são fictícios.</p>'}
      <div class="grade tres">
        <button class="cartao" data-ir="bens"><strong>Conferir bem</strong><span>Inventário e vistoria de bens: plaqueta, local, estado e fotos</span></button>
        <button class="cartao" data-ir="abastecimento"><strong>Abastecimento</strong><span>Litros, valor, quilometragem e foto do cupom</span></button>
        <button class="cartao" data-ir="viagem"><strong>Saída / retorno de veículo</strong><span>Quilometragem, destino e checklist do veículo</span></button>
        <button class="cartao" data-ir="registros"><strong>Registros</strong><span><span class="contador" id="qtd-aguardando">${aguardando}</span> aguardando envio</span></button>
        <button class="cartao" data-ir="lixeira"><strong>Lixeira</strong><span>${lixeira} registro(s) excluído(s), que podem ser restaurados</span></button>
      </div>
      <div class="cartao" style="margin-top:12px">
        <h3 style="margin-top:0">Instalar no aparelho</h3>
        <button class="botao oculto" id="instalar">Instalar aplicativo</button>
        <p class="ajuda" id="instrucao-instalar">${P().ehIPhone()
          ? 'No iPhone ou iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
          : 'No Android: abra o menu do navegador (⋮) e toque em “Instalar aplicativo” ou “Adicionar à tela inicial”.'}</p>
      </div>`,
    ligar() {
      document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));
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

// --- Conferir bem (inventário / vistoria) ----------------------------------
Telas.bens = async () => {
  const estado = { fotos: [], gps: null, bem: null, movido: false };
  return {
    titulo: 'Conferir bem',
    html: `
      ${campoCodigo('Número da plaqueta', 'Ex.: 1001')}
      <button type="button" class="botao secundario largo" id="buscar">Buscar bem</button>
      <div id="resultado"></div>
      <form id="form" class="oculto">
        <label for="unidade">Onde o bem está agora</label>
        <select id="unidade">${opcoesUnidades()}</select>
        <label>Estado de conservação</label>
        ${escala('estado', ['8', '7', '6', '5', '4', '3', '2', '1'], ESTADOS_NOMES, true)}
        <p class="ajuda">1 = péssimo · 2 = ruim · 3 = regular · 4 = bom · 5 = ótimo · 6 = novo (sem uso)</p>
        <label for="obs">Observação</label>
        <textarea id="obs" placeholder="Opcional"></textarea>
        ${campoFotos()}
        <button class="botao largo" type="submit">Salvar conferência</button>
      </form>`,
    ligar() {
      ligarEscala('estado');
      ligarFotos(estado);
      const buscar = async (cod) => {
        cod = String(cod || '').trim();
        if (!cod) { avisar('Digite o número da plaqueta.'); return; }
        const bem = D.bens.find((b) => b.plaqueta === cod);
        estado.bem = bem ? { ...bem } : { plaqueta: cod, descricao: '', unidade: '', semCadastro: true };
        estado.movido = false;
        const regs = (await Banco.todos()).filter((r) => r.tipo === 'bem' && r.situacao !== 'lixeira' && r.dados.plaqueta === cod);
        const anterior = regs[0];
        let html = bem
          ? `<div class="sucesso"><strong>${esc(bem.descricao)}</strong><br>Plaqueta ${esc(bem.plaqueta)} · cadastrado em: ${esc(nomeUnidade(bem.unidade))}</div>`
          : `<div class="alerta"><strong>Bem sem cadastro.</strong> A plaqueta ${esc(cod)} não está na lista. Ele será registrado como “bem encontrado sem cadastro” para conferência do setor de patrimônio.
               <label for="descricao">O que é o bem?</label><input id="descricao" placeholder="Ex.: Cadeira azul"></div>`;
        if (anterior) {
          html += `<div class="alerta" id="ja-conferido"><strong>Este bem já foi conferido</strong> em ${esc(nomeUnidade(anterior.dados.unidade))} no dia ${esc(dataHora(anterior.criadoEm))}.
            <div class="linha" style="margin-top:10px">
              <button type="button" class="botao" id="foi-movido">Foi levado para outro local</button>
              <button type="button" class="botao secundario" id="leitura-repetida">Foi leitura repetida</button>
            </div></div>`;
        }
        $('#resultado').innerHTML = html;
        $('#unidade').value = bem ? bem.unidade : D.unidades[0].id;
        $('#form').classList.toggle('oculto', !!anterior);
        if (anterior) {
          $('#foi-movido').addEventListener('click', () => {
            estado.movido = true;
            $('#ja-conferido').innerHTML = '<strong>Mudança de local.</strong> Escolha abaixo onde o bem está agora. A transferência ficará registrada.';
            $('#form').classList.remove('oculto');
          });
          $('#leitura-repetida').addEventListener('click', () => { avisar('Nada foi registrado. O bem não foi contado duas vezes.'); ir('bens'); });
        }
      };
      $('#buscar').addEventListener('click', () => buscar($('#codigo').value));
      $('#codigo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar($('#codigo').value); } });
      ligarLeitorQR(buscar);
      $('#form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!valorEscala('estado')) { avisar('Escolha o estado de conservação.'); return; }
        const b = estado.bem;
        const descricao = b.semCadastro ? ($('#descricao') ? $('#descricao').value.trim() : '') : b.descricao;
        if (b.semCadastro && !descricao) { avisar('Escreva o que é o bem.'); return; }
        const unidade = $('#unidade').value;
        await salvarRegistro('bem', estado, {
          plaqueta: b.plaqueta, descricao, semCadastro: !!b.semCadastro,
          unidadeCadastro: b.unidade || '', unidade,
          foraDoLocal: !!b.unidade && b.unidade !== unidade,
          movidoDuranteInventario: estado.movido,
          estado: valorEscala('estado'), escala: 8, observacao: $('#obs').value.trim()
        });
        ir('bens');
      });
    }
  };
};

// --- Frota: abastecimento -----------------------------------------------------
async function ultimoKm(placa) {
  const v = D.veiculos.find((x) => x.placa === placa);
  let km = v ? v.ultimoKm : 0;
  (await Banco.todos()).filter((r) => r.situacao !== 'lixeira' && r.dados.placa === placa).forEach((r) => {
    const k = Math.max(r.dados.km || 0, r.dados.kmRetorno || 0, r.dados.kmSaida || 0);
    if (k > km) km = k;
  });
  return km;
}

// Regras de alerta do abastecimento. Não bloqueiam: pedem confirmação e explicação.
function conferirAbastecimento(v, d, kmAnterior) {
  const alertas = [];
  if (d.km !== null && d.km <= kmAnterior) alertas.push(`A quilometragem (${d.km}) não é maior que a última registrada (${kmAnterior}).`);
  if (d.litros !== null && d.litros > v.tanque) alertas.push(`Foram ${d.litros} litros, mas o tanque deste veículo comporta ${v.tanque} litros.`);
  if (d.combustivel && d.combustivel !== v.combustivel) alertas.push(`O combustível informado (${d.combustivel}) é diferente do combustível do veículo (${v.combustivel}).`);
  return alertas;
}
window.conferirAbastecimento = conferirAbastecimento; // exposto para teste

Telas.abastecimento = async () => {
  const estado = { fotos: [], gps: null };
  const opcoes = D.veiculos.map((v) => `<option value="${v.placa}">${esc(v.placa)} — ${esc(v.modelo)} (${esc(v.tipo)})</option>`).join('');
  return {
    titulo: 'Abastecimento',
    html: `
      <label for="placa">Veículo</label><select id="placa">${opcoes}</select>
      <p class="ajuda" id="info-veiculo"></p>
      <label for="motorista">Motorista</label><input id="motorista" autocomplete="name">
      <div class="linha">
        <div><label for="km">Quilometragem no painel</label><input id="km" inputmode="numeric"></div>
        <div><label for="litros">Litros</label><input id="litros" inputmode="decimal"></div>
      </div>
      <div class="linha">
        <div><label for="valor">Valor total (R$)</label><input id="valor" inputmode="decimal"></div>
        <div><label for="combustivel">Combustível</label>
          <select id="combustivel"><option>Gasolina</option><option>Etanol</option><option>Diesel</option><option>Diesel S10</option><option>GNV</option></select></div>
      </div>
      <label for="posto">Posto</label><input id="posto">
      <label>Encheu o tanque?</label>${escala('cheio', ['Sim', 'Não'])}
      ${campoFotos('Foto do cupom e do painel')}
      <div id="alertas"></div>
      <button class="botao largo" id="salvar">Salvar abastecimento</button>`,
    async ligar() {
      ligarEscala('cheio');
      ligarFotos(estado);
      const atualizar = async () => {
        const v = D.veiculos.find((x) => x.placa === $('#placa').value);
        $('#info-veiculo').textContent = `Última quilometragem: ${await ultimoKm(v.placa)} · tanque de ${v.tanque} litros · ${v.combustivel}`;
        $('#combustivel').value = v.combustivel;
        $('#alertas').innerHTML = '';
        delete $('#alertas').dataset.confirmado;
        $('#salvar').textContent = 'Salvar abastecimento';
      };
      $('#placa').addEventListener('change', atualizar);
      await atualizar();
      $('#salvar').addEventListener('click', async () => {
        const v = D.veiculos.find((x) => x.placa === $('#placa').value);
        const d = {
          placa: v.placa, tipoVeiculo: v.tipo, motorista: $('#motorista').value.trim(),
          km: numero($('#km').value), litros: numero($('#litros').value), valor: numero($('#valor').value),
          combustivel: $('#combustivel').value, posto: $('#posto').value.trim(), tanqueCheio: valorEscala('cheio')
        };
        if (d.km === null || d.litros === null || d.valor === null) { avisar('Preencha quilometragem, litros e valor.'); return; }
        if (!d.motorista) { avisar('Informe o motorista.'); return; }
        const kmAnterior = await ultimoKm(v.placa);
        const alertas = conferirAbastecimento(v, d, kmAnterior);
        const caixa = $('#alertas');
        // Mostra os avisos de novo se mudaram desde a última vez
        if (alertas.length && caixa.dataset.confirmado !== alertas.join('|')) {
          caixa.innerHTML = `<div class="alerta"><strong>Confira antes de salvar:</strong><ul>${alertas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
            <label for="explicacao">Explique o motivo para salvar assim</label><textarea id="explicacao"></textarea>
            <p class="ajuda">O registro será salvo com este aviso para o gestor da frota conferir.</p></div>`;
          caixa.dataset.confirmado = alertas.join('|');
          $('#salvar').textContent = 'Salvar mesmo assim';
          return;
        }
        if (alertas.length) {
          d.explicacao = ($('#explicacao') || {}).value?.trim() || '';
          if (!d.explicacao) { avisar('Escreva a explicação.'); return; }
          d.alertas = alertas;
        }
        d.kmAnterior = kmAnterior;
        d.kmRodado = d.km > kmAnterior ? d.km - kmAnterior : null;
        d.kmPorLitro = d.kmRodado && d.litros ? +(d.kmRodado / d.litros).toFixed(2) : null;
        d.precoLitro = d.litros ? +(d.valor / d.litros).toFixed(3) : null;
        await salvarRegistro('abastecimento', estado, d);
        ir('abastecimento');
      });
    }
  };
};

// --- Frota: saída e retorno ----------------------------------------------------
Telas.viagem = async () => {
  const estado = { fotos: [], gps: null };
  const opcoes = D.veiculos.map((v) => `<option value="${v.placa}">${esc(v.placa)} — ${esc(v.modelo)}</option>`).join('');
  const itens = [['pneus', 'Pneus'], ['luzes', 'Luzes e setas'], ['lataria', 'Lataria (amassados, riscos)'], ['documentos', 'Documento do veículo a bordo']];
  return {
    titulo: 'Saída / retorno',
    html: `
      <label for="placa">Veículo</label><select id="placa">${opcoes}</select>
      <label>O que está registrando?</label>${escala('mov', ['Saída', 'Retorno'])}
      <label for="motorista">Motorista</label><input id="motorista" autocomplete="name">
      <label for="km">Quilometragem no painel</label><input id="km" inputmode="numeric">
      <p class="ajuda" id="info-km"></p>
      <label for="destino">Destino</label><input id="destino">
      <label for="motivo">Motivo</label><input id="motivo">
      <h3>Checklist do veículo</h3>
      ${itens.map(([id, nome]) => `<label>${nome}</label>${escala('c-' + id, ['OK', 'Problema'])}`).join('')}
      <label for="obs">Observação</label><textarea id="obs" placeholder="Descreva qualquer problema"></textarea>
      ${campoFotos('Fotos (painel e avarias)')}
      <button class="botao largo" id="salvar">Salvar</button>`,
    async ligar() {
      ['mov', ...itens.map(([id]) => 'c-' + id)].forEach(ligarEscala);
      ligarFotos(estado);
      const info = async () => { $('#info-km').textContent = `Última quilometragem registrada: ${await ultimoKm($('#placa').value)}`; };
      $('#placa').addEventListener('change', info);
      await info();
      $('#salvar').addEventListener('click', async () => {
        const mov = valorEscala('mov');
        const km = numero($('#km').value);
        const placa = $('#placa').value;
        if (!mov) { avisar('Escolha se é saída ou retorno.'); return; }
        if (km === null) { avisar('Informe a quilometragem.'); return; }
        if (!$('#motorista').value.trim()) { avisar('Informe o motorista.'); return; }
        const anterior = await ultimoKm(placa);
        if (km < anterior) { avisar(`A quilometragem não pode ser menor que a última registrada (${anterior}).`); return; }
        const checklist = {};
        for (const [id] of itens) {
          const v = valorEscala('c-' + id);
          if (!v) { avisar('Responda todo o checklist.'); return; }
          checklist[id] = v;
        }
        const temProblema = Object.values(checklist).includes('Problema');
        if (temProblema && !$('#obs').value.trim()) { avisar('Descreva o problema na observação.'); return; }
        await salvarRegistro('viagem', estado, {
          placa, movimento: mov, motorista: $('#motorista').value.trim(),
          km, kmAnterior: anterior, destino: $('#destino').value.trim(), motivo: $('#motivo').value.trim(),
          checklist, temProblema, observacao: $('#obs').value.trim()
        });
        ir('viagem');
      });
    }
  };
};

// --- Registros e Lixeira -------------------------------------------------------
function resumo(r) {
  const d = r.dados;
  switch (r.tipo) {
    case 'bem': return `Plaqueta ${d.plaqueta}${d.descricao ? ' — ' + d.descricao : ''} · ${nomeUnidade(d.unidade)} · ${esc(nomeEstado(d))}` +
      (d.semCadastro ? ' · sem cadastro' : '') + (d.foraDoLocal ? ` · fora do local (cadastro: ${nomeUnidade(d.unidadeCadastro)})` : '');
    case 'abastecimento': return `${d.placa} · ${d.litros} L de ${d.combustivel} · R$ ${d.valor.toFixed(2).replace('.', ',')} · km ${d.km}` +
      (d.kmPorLitro ? ` · ${String(d.kmPorLitro).replace('.', ',')} km/L` : '') + (d.alertas ? ' · COM AVISO' : '');
    case 'viagem': return `${d.placa} · ${d.movimento} · km ${d.km} · ${d.destino || 'sem destino'}` + (d.temProblema ? ' · COM PROBLEMA' : '');
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
        sessionStorage.setItem('vitalpat-patrimonio-ultimo-envio', JSON.stringify({ enviados: r.enviados.length, falhas: r.falhas }));
        render();
      });
      const ultimo = (() => { try { return JSON.parse(sessionStorage.getItem('vitalpat-patrimonio-ultimo-envio')); } catch (_) { return null; } })();
      if (ultimo && $('#resultado-envio')) {
        sessionStorage.removeItem('vitalpat-patrimonio-ultimo-envio');
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
      $('#json').addEventListener('click', () => baixar(`vitalpat-patrimonio-registros-${carimbo()}.json`, JSON.stringify(regs, null, 2), 'application/json'));
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
  plaqueta: 'Plaqueta', descricao: 'Descrição', semCadastro: 'Sem cadastro', unidadeCadastro: 'Unidade no cadastro',
  unidade: 'Unidade onde foi encontrado', foraDoLocal: 'Fora do local', movidoDuranteInventario: 'Movido durante o inventário',
  estado: 'Estado de conservação', escala: 'Escala do estado (8 níveis)', observacao: 'Observação',
  placa: 'Placa', tipoVeiculo: 'Tipo do veículo', motorista: 'Motorista', km: 'Quilometragem', litros: 'Litros', valor: 'Valor (R$)',
  combustivel: 'Combustível', posto: 'Posto', tanqueCheio: 'Tanque cheio', explicacao: 'Explicação do aviso', alertas: 'Avisos',
  kmAnterior: 'Quilometragem anterior', kmRodado: 'Km rodados', kmPorLitro: 'Km por litro', precoLitro: 'Preço do litro',
  movimento: 'Saída ou retorno', destino: 'Destino', motivo: 'Motivo', checklist: 'Checklist', temProblema: 'Com problema'
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
  ler(k) { try { return JSON.parse(localStorage.getItem('vitalpat-patrimonio-' + k)); } catch (_) { return null; } },
  gravar(k, v) { try { localStorage.setItem('vitalpat-patrimonio-' + k, JSON.stringify(v)); } catch (_) { /* sem problema */ } }
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
  baixar(`vitalpat-patrimonio-registros-${carimbo()}.csv`, '\ufeff' + [cols.map((c) => cel(c.rotulo)).join(';'), ...linhas].join('\r\n'), 'text/csv;charset=utf-8');
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

$('#voltar').addEventListener('click', () => { location.hash = 'inicio'; });
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

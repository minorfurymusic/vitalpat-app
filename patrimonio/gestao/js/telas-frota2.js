/* VitalPat Patrimônio · Gestão — Frota, segunda parte (DOSSIE.md A1.14):
   FR-12 pneus (posição, rodízio, recapagem, km por pneu), FR-13 reservas de veículos por secretaria,
   FR-15 arquivo do cartão-combustível (importação com prévia e desfazer) e FR-03 dias parados na conferência da locação. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos;
  const F = VP.frota;
  const X = VP.frotaExtra = { abas: {} };
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const re = () => VP.app.render();
  const nomeV = (ref) => { const v = F.veiculo(ref); return v ? `${v.placa} · ${v.modelo}` : '—'; };
  const opcV = () => F.veiculos().map((v) => [v.ref, `${v.placa} · ${v.modelo}${v.origem === 'locado' ? ' (alugado)' : ''}`]);
  const opcMot = () => VP.db.lista('motoristas').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((m) => [m.id, m.nome]);
  const selo = (classe, t) => `<span class="selo-status ${classe}">${esc(t)}</span>`;

  // ================================================================== PNEUS (FR-12)
  X.POSICOES = { DE: 'Dianteiro esquerdo', DD: 'Dianteiro direito', TE: 'Traseiro esquerdo', TD: 'Traseiro direito', TEI: 'Traseiro esquerdo interno', TDI: 'Traseiro direito interno', EST: 'Estepe' };
  X.SIT_PNEU = { rodando: 'No veículo', estoque: 'No estoque', recapagem: 'Na recapagem', descartado: 'Descartado' };
  X.kmPneu = (p) => (Number(p.kmAcumulado) || 0) + (p.situacao === 'rodando' && p.ref ? Math.max(0, F.kmAtual(p.ref) - (Number(p.kmInstalacao) || 0)) : 0);
  const histPneu = (p, acao, extra = {}) => { p.historico = (p.historico || []).concat(Object.assign({ quando: agora(), data: hoje(), acao, usuario: usuario() }, extra)); };
  const ocupada = (ref, pos, excetoId) => VP.db.lista('pneus').find((x) => x.situacao === 'rodando' && x.ref === ref && x.posicao === pos && x.id !== excetoId);
  X.novoPneu = () => ui.formulario({
    titulo: 'Novo pneu', largura: 'media',
    campos: [{ chave: 'codigo', rotulo: 'Marcação (número de fogo)', obrigatorio: true, largura: 'meia' }, { chave: 'marca', rotulo: 'Marca e modelo', largura: 'meia' }, { chave: 'medida', rotulo: 'Medida (ex.: 175/70 R14)', largura: 'meia' }, { chave: 'valor', rotulo: 'Valor de compra', tipo: 'moeda', largura: 'meia' }, { chave: 'kmAcumulado', rotulo: 'Km já rodados (se usado)', tipo: 'numero', largura: 'meia' }],
    salvar: async (x) => {
      if (VP.db.lista('pneus').some((p) => u.normalizar(p.codigo) === u.normalizar(x.codigo))) return 'Já existe pneu com esta marcação.';
      const p = Object.assign({ id: u.id(), situacao: 'estoque', recapagens: 0, ref: '', posicao: '', kmInstalacao: null, historico: [] }, x, { kmAcumulado: x.kmAcumulado || 0 });
      histPneu(p, 'cadastrado no estoque');
      await VP.db.gravar('pneus', p); ui.aviso('Pneu cadastrado.'); re();
    }
  });
  X.instalar = (p) => ui.formulario({
    titulo: `Instalar o pneu ${p.codigo}`, largura: 'pequena',
    campos: [{ chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: opcV(), obrigatorio: true }, { chave: 'posicao', rotulo: 'Posição', tipo: 'select', opcoes: Object.entries(X.POSICOES), obrigatorio: true }, { chave: 'km', rotulo: 'Km no painel', tipo: 'numero', obrigatorio: true }],
    salvar: async (x) => {
      const o = ocupada(x.ref, x.posicao);
      if (o) return `A posição já tem o pneu ${o.codigo}. Retire ou faça o rodízio antes.`;
      if (x.km < F.kmAtual(x.ref)) return `Km menor que o último registrado do veículo (${u.inteiro(F.kmAtual(x.ref))}).`;
      Object.assign(p, { situacao: 'rodando', ref: x.ref, posicao: x.posicao, kmInstalacao: x.km });
      histPneu(p, `instalado em ${nomeV(x.ref)} (${X.POSICOES[x.posicao]})`, { ref: x.ref, posicao: x.posicao, km: x.km });
      await VP.db.gravar('pneus', p); ui.aviso('Pneu instalado.'); re();
    }
  });
  X.rodizio = (p) => ui.formulario({
    titulo: `Rodízio do pneu ${p.codigo}`, largura: 'pequena',
    intro: `<p>${esc(nomeV(p.ref))} · hoje em ${esc(X.POSICOES[p.posicao])}. Se a nova posição tiver outro pneu, os dois trocam de lugar.</p>`,
    campos: [{ chave: 'posicao', rotulo: 'Nova posição', tipo: 'select', opcoes: Object.entries(X.POSICOES).filter(([k]) => k !== p.posicao), obrigatorio: true }],
    salvar: async (x) => {
      const outro = ocupada(p.ref, x.posicao, p.id);
      const antes = p.posicao;
      p.posicao = x.posicao; histPneu(p, `rodízio: ${X.POSICOES[antes]} → ${X.POSICOES[x.posicao]}`);
      const docs = [p];
      if (outro) { outro.posicao = antes; histPneu(outro, `rodízio: ${X.POSICOES[x.posicao]} → ${X.POSICOES[antes]}`); docs.push(outro); }
      await VP.db.gravarVarias({ pneus: docs }); ui.aviso('Rodízio registrado.'); re();
    }
  });
  X.retirar = (p) => ui.formulario({
    titulo: `Retirar o pneu ${p.codigo}`, largura: 'pequena',
    campos: [{ chave: 'km', rotulo: 'Km no painel', tipo: 'numero', obrigatorio: true, padrao: F.kmAtual(p.ref) }, { chave: 'destino', rotulo: 'Para onde vai', tipo: 'select', opcoes: [['estoque', 'Estoque'], ['recapagem', 'Recapagem'], ['descartado', 'Descarte']], obrigatorio: true }, { chave: 'motivo', rotulo: 'Motivo', obrigatorio: true }],
    salvar: async (x) => {
      if (x.km < (Number(p.kmInstalacao) || 0)) return 'Km menor que o da instalação.';
      const rodou = x.km - (Number(p.kmInstalacao) || 0);
      p.kmAcumulado = (Number(p.kmAcumulado) || 0) + rodou;
      histPneu(p, `retirado de ${nomeV(p.ref)} (${X.POSICOES[p.posicao]}) → ${X.SIT_PNEU[x.destino].toLowerCase()}: ${x.motivo}`, { km: x.km, rodou });
      Object.assign(p, { situacao: x.destino, ref: '', posicao: '', kmInstalacao: null });
      await VP.db.gravar('pneus', p); ui.aviso('Pneu retirado.'); re();
    }
  });
  X.voltaRecapagem = (p) => ui.formulario({
    titulo: `Volta da recapagem — ${p.codigo}`, largura: 'pequena',
    campos: [{ chave: 'valor', rotulo: 'Valor da recapagem', tipo: 'moeda', largura: 'meia' }, { chave: 'empresa', rotulo: 'Empresa', largura: 'meia' }],
    salvar: async (x) => {
      p.recapagens = (Number(p.recapagens) || 0) + 1; p.situacao = 'estoque';
      p.custoRecapagens = (Number(p.custoRecapagens) || 0) + (x.valor || 0);
      histPneu(p, `voltou da recapagem nº ${p.recapagens}${x.empresa ? ' (' + x.empresa + ')' : ''}`, { valor: x.valor || 0 });
      await VP.db.gravar('pneus', p); ui.aviso('Recapagem registrada.'); re();
    }
  });
  X.abas.pneus = () => {
    const l = VP.db.lista('pneus').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
    const rodando = l.filter((p) => p.situacao === 'rodando');
    const custoKm = (p) => { const km = X.kmPneu(p); const c = (Number(p.valor) || 0) + (Number(p.custoRecapagens) || 0); return km ? c / km : 0; };
    return {
      acoes: '<button class="botao primario" data-novo-pneu>+ Pneu</button>',
      html: `<div class="resumo-linha">${G.numero('Pneus no veículo', u.inteiro(rodando.length))}${G.numero('No estoque', u.inteiro(l.filter((p) => p.situacao === 'estoque').length))}${G.numero('Na recapagem', u.inteiro(l.filter((p) => p.situacao === 'recapagem').length))}${G.numero('Km médio por pneu', u.inteiro(l.length ? Math.round(l.reduce((t, p) => t + X.kmPneu(p), 0) / l.length) : 0))}</div>
        <p class="ajuda">Controle por posição, rodízio, recapagem e km rodados por pneu (km do veículo desde a instalação, somado ao que já tinha rodado).</p>
        ${ui.tabela({ id: 'frota-pneus', linhas: l, nomePlanilha: 'pneus', vazio: 'Nenhum pneu cadastrado.', colunas: [
          { chave: 'codigo', titulo: 'Marcação' }, { chave: 'marca', titulo: 'Marca e modelo' }, { chave: 'medida', titulo: 'Medida', oculta: true },
          { chave: 'situacao', titulo: 'Onde está', html: (p) => selo(p.situacao === 'rodando' ? 's-ativo' : p.situacao === 'descartado' ? 's-baixado' : 's-cedido', X.SIT_PNEU[p.situacao]), valor: (p) => X.SIT_PNEU[p.situacao] },
          { chave: 'veiculo', titulo: 'Veículo e posição', valor: (p) => (p.situacao === 'rodando' ? `${nomeV(p.ref)} · ${X.POSICOES[p.posicao]}` : '') },
          { chave: 'km', titulo: 'Km rodados', num: true, valor: X.kmPneu, formato: u.inteiro },
          { chave: 'recap', titulo: 'Recapagens', num: true, valor: (p) => Number(p.recapagens) || 0 },
          { chave: 'custoKm', titulo: 'Custo por km', num: true, valor: custoKm, formato: (v) => (v ? 'R$ ' + v.toFixed(3).replace('.', ',') : '—'), oculta: true },
          { chave: 'a', titulo: '', html: (p) => (p.situacao === 'rodando' ? `<button class="botao pequeno" data-pneu-rodizio="${esc(p.id)}">Rodízio</button> <button class="botao pequeno" data-pneu-retirar="${esc(p.id)}">Retirar</button>` : p.situacao === 'estoque' ? `<button class="botao pequeno" data-pneu-instalar="${esc(p.id)}">Instalar</button>` : p.situacao === 'recapagem' ? `<button class="botao pequeno" data-pneu-recap="${esc(p.id)}">Voltou da recapagem</button>` : '') + ` <button class="botao pequeno" data-pneu-hist="${esc(p.id)}">Histórico</button>` }] })}`,
      ligar() {
        document.querySelector('[data-novo-pneu]')?.addEventListener('click', X.novoPneu);
        document.getElementById('tab-frota-pneus').onclick = (e) => {
          const b = e.target.closest('button'); if (!b) return;
          const id = b.dataset.pneuRodizio || b.dataset.pneuRetirar || b.dataset.pneuInstalar || b.dataset.pneuRecap || b.dataset.pneuHist;
          const p = id && VP.db.pega('pneus', id); if (!p) return;
          if (b.dataset.pneuRodizio) return X.rodizio(p);
          if (b.dataset.pneuRetirar) return X.retirar(p);
          if (b.dataset.pneuInstalar) return X.instalar(p);
          if (b.dataset.pneuRecap) return X.voltaRecapagem(p);
          ui.modal({ titulo: 'Histórico do pneu ' + p.codigo, corpo: `<ol class="lista-simples">${(p.historico || []).map((h) => `<li>${u.data(h.data)} — ${esc(h.acao)}${h.rodou ? ` (${u.inteiro(h.rodou)} km)` : ''} <small>(${esc(h.usuario || '')})</small></li>`).join('')}</ol>`, botoes: [{ texto: 'Fechar' }] });
        };
      }
    };
  };

  // ================================================================== RESERVAS (FR-13)
  X.SIT_RES = { pedida: 'Pedida', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada', concluida: 'Concluída' };
  const ini = (r) => `${r.data}T${r.horaInicio || '00:00'}`;
  const fim = (r) => `${r.dataFim || r.data}T${r.horaFim || '23:59'}`;
  X.conflitos = (r) => VP.db.lista('reservasVeiculo').filter((o) => o.id !== r.id && o.ref === r.ref && o.situacao === 'aprovada' && ini(o) < fim(r) && ini(r) < fim(o));
  X.novaReserva = () => ui.formulario({
    titulo: 'Pedir veículo', largura: 'media',
    campos: [{ chave: 'unidadeId', rotulo: 'Secretaria / unidade', tipo: 'select', opcoes: VP.opc('unidades'), obrigatorio: true, largura: 'meia' }, { chave: 'solicitante', rotulo: 'Quem pede', obrigatorio: true, largura: 'meia' },
      { chave: 'ref', rotulo: 'Veículo (opcional: o setor da frota pode escolher)', tipo: 'select', opcoes: opcV() }, { chave: 'motoristaId', rotulo: 'Motorista', tipo: 'select', opcoes: opcMot() },
      { chave: 'data', rotulo: 'Data de saída', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'horaInicio', rotulo: 'Hora de saída (ex.: 08:00)', obrigatorio: true, largura: 'meia' },
      { chave: 'dataFim', rotulo: 'Data de volta', tipo: 'data', largura: 'meia' }, { chave: 'horaFim', rotulo: 'Hora de volta', obrigatorio: true, largura: 'meia' },
      { chave: 'destino', rotulo: 'Destino', obrigatorio: true }, { chave: 'motivo', rotulo: 'Motivo', tipo: 'area' }],
    salvar: async (x) => {
      if (![x.horaInicio, x.horaFim].every((h) => /^\d{1,2}:\d{2}$/.test(h))) return 'Horas no formato 08:00.';
      x.horaInicio = x.horaInicio.padStart(5, '0'); x.horaFim = x.horaFim.padStart(5, '0');
      const r = Object.assign({ id: u.id(), situacao: 'pedida', historico: [{ quando: agora(), acao: 'pedida', usuario: usuario() }], criadoEm: agora() }, x);
      if (fim(r) <= ini(r)) return 'A volta precisa ser depois da saída.';
      if (r.data < hoje()) return 'A saída não pode ser no passado.';
      await VP.db.gravar('reservasVeiculo', r); ui.aviso('Pedido registrado.'); re();
    }
  });
  X.decidirReserva = (r, acao) => {
    const aprovar = acao === 'aprovada';
    ui.formulario({
      titulo: `${aprovar ? 'Aprovar' : X.SIT_RES[acao]} — ${VP.nome('unidades', r.unidadeId)}, ${u.data(r.data)} ${r.horaInicio}`, largura: 'pequena',
      campos: (aprovar ? [{ chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: opcV(), obrigatorio: true }, { chave: 'motoristaId', rotulo: 'Motorista', tipo: 'select', opcoes: opcMot() }] : []).concat([{ chave: 'nota', rotulo: 'Observação', tipo: 'area', obrigatorio: !aprovar }]),
      valores: { ref: r.ref, motoristaId: r.motoristaId },
      textoSalvar: aprovar ? 'Aprovar' : X.SIT_RES[acao],
      salvar: async (x) => {
        if (aprovar) {
          const prov = Object.assign({}, r, { ref: x.ref });
          const c = X.conflitos(prov);
          if (c.length) return `O veículo já está reservado nesse horário (${c.map((o) => `${VP.nome('unidades', o.unidadeId)} ${u.data(o.data)} ${o.horaInicio}–${o.horaFim}`).join('; ')}).`;
          const v = F.veiculo(x.ref);
          if (v && v.situacao !== 'ativo') return `O veículo está ${v.situacao === 'manutencao' ? 'em manutenção' : 'parado'}.`;
          const m = VP.db.pega('motoristas', x.motoristaId);
          if (m?.validade && m.validade < r.data) return `A CNH de ${m.nome} estará vencida na data.`;
          r.ref = x.ref; r.motoristaId = x.motoristaId || r.motoristaId;
        }
        r.situacao = acao;
        r.historico = (r.historico || []).concat({ quando: agora(), acao: X.SIT_RES[acao].toLowerCase(), nota: x.nota || '', usuario: usuario() });
        await VP.db.gravar('reservasVeiculo', r); ui.aviso(`Reserva ${X.SIT_RES[acao].toLowerCase()}.`); re();
      }
    });
  };
  X.abas.reservas = () => {
    const l = VP.db.lista('reservasVeiculo').sort((a, b) => ini(a).localeCompare(ini(b)));
    const futuras = l.filter((r) => fim(r) >= `${hoje()}T00:00`);
    const dias = [...new Set(futuras.filter((r) => r.situacao === 'aprovada').map((r) => r.data))].slice(0, 14);
    return {
      acoes: '<button class="botao primario" data-nova-reserva>+ Pedir veículo</button>',
      html: `<div class="resumo-linha">${G.numero('Pedidos aguardando', u.inteiro(l.filter((r) => r.situacao === 'pedida').length))}${G.numero('Reservas aprovadas a partir de hoje', u.inteiro(futuras.filter((r) => r.situacao === 'aprovada').length))}</div>
        <p class="ajuda">A secretaria pede; o setor da frota aprova escolhendo o veículo. O sistema não aprova reserva com horário em conflito, veículo parado ou motorista com CNH vencida.</p>
        ${dias.length ? `<section class="cartao"><h3>Agenda dos veículos</h3>${dias.map((d) => `<h4>${u.data(d)}</h4><ul class="lista-simples">${futuras.filter((r) => r.situacao === 'aprovada' && r.data === d).map((r) => `<li><b>${esc(r.horaInicio)}–${esc(r.horaFim)}</b> · ${esc(nomeV(r.ref))} · ${esc(VP.nome('unidades', r.unidadeId))} · ${esc(r.destino)}${r.motoristaId ? ' · ' + esc(VP.nome('motoristas', r.motoristaId)) : ''}</li>`).join('')}</ul>`).join('')}</section>` : ''}
        ${ui.tabela({ id: 'frota-reservas', linhas: l.slice().reverse(), nomePlanilha: 'reservas-veiculos', vazio: 'Nenhum pedido.', colunas: [
          { chave: 'quando', titulo: 'Saída', valor: (r) => `${u.data(r.data)} ${r.horaInicio}`, ordenar: ini }, { chave: 'volta', titulo: 'Volta', valor: (r) => `${u.data(r.dataFim || r.data)} ${r.horaFim}` },
          { chave: 'unidade', titulo: 'Secretaria / unidade', valor: (r) => VP.nome('unidades', r.unidadeId) }, { chave: 'solicitante', titulo: 'Quem pede' },
          { chave: 'veiculo', titulo: 'Veículo', valor: (r) => (r.ref ? nomeV(r.ref) : 'a definir') }, { chave: 'destino', titulo: 'Destino' },
          { chave: 'situacao', titulo: 'Situação', html: (r) => selo({ pedida: 'v-vencendo', aprovada: 'v-vigente', recusada: 'v-vencido', cancelada: 's-baixado', concluida: 's-ativo' }[r.situacao], X.SIT_RES[r.situacao]), valor: (r) => X.SIT_RES[r.situacao] },
          { chave: 'a', titulo: '', html: (r) => (r.situacao === 'pedida' ? `<button class="botao pequeno primario" data-res="aprovada|${esc(r.id)}">Aprovar</button> <button class="botao pequeno perigo" data-res="recusada|${esc(r.id)}">Recusar</button>` : r.situacao === 'aprovada' ? `<button class="botao pequeno" data-res="concluida|${esc(r.id)}">Concluída</button> <button class="botao pequeno perigo" data-res="cancelada|${esc(r.id)}">Cancelar</button>` : '') }] })}`,
      ligar() {
        document.querySelector('[data-nova-reserva]')?.addEventListener('click', X.novaReserva);
        document.getElementById('tab-frota-reservas').onclick = (e) => { const b = e.target.closest('[data-res]'); if (!b) return; const [acao, id] = b.dataset.res.split('|'); X.decidirReserva(VP.db.pega('reservasVeiculo', id), acao); };
      }
    };
  };

  // ================================================================== CARTÃO-COMBUSTÍVEL (FR-15)
  // Arquivo da administradora (CSV): data;hora;placa;litros;valor;km;combustivel;posto;motorista (nomes de coluna parecidos também servem)
  const COLS = { data: /^data/, hora: /^hora/, placa: /placa/, litros: /litro|quant/, valor: /valor|total/, km: /^km|hodometro|odometro/, combustivel: /combust|produto/, posto: /posto|estabelec/, motorista: /motorista|condutor/ };
  const dataISO = (t) => { const s = String(t || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  X.lerArquivoCartao = (texto) => {
    const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!linhas.length) return { erro: 'Arquivo vazio.' };
    const sep = linhas[0].includes(';') ? ';' : ',';
    const cab = linhas[0].split(sep).map((c) => u.normalizar(c));
    const idx = Object.fromEntries(Object.entries(COLS).map(([k, re2]) => [k, cab.findIndex((c) => re2.test(c))]));
    if (idx.data < 0 || idx.placa < 0 || idx.litros < 0 || idx.valor < 0) return { erro: 'O arquivo precisa ter as colunas data, placa, litros e valor.' };
    const veics = F.veiculos();
    const existentes = F.abastecimentos();
    const vistos = new Map(); // mesma placa, dia, hora e litros repetidos dentro do arquivo
    return {
      itens: linhas.slice(1).map((l, i) => {
        const c = l.split(sep);
        const pega = (k) => (idx[k] >= 0 ? String(c[idx[k]] ?? '').trim() : '');
        const it = { linha: i + 2, data: dataISO(pega('data')), hora: pega('hora').slice(0, 5), placa: pega('placa').toUpperCase().replace(/[^A-Z0-9]/g, ''), litros: u.num(pega('litros')), valor: u.num(pega('valor')), km: u.num(pega('km')), combustivel: pega('combustivel'), posto: pega('posto'), motorista: pega('motorista') };
        const v = veics.find((x) => x.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === it.placa);
        if (!it.data) it.classe = 'erro', it.detalhe = 'Data inválida';
        else if (!v) it.classe = 'erro', it.detalhe = `Placa ${it.placa || '(vazia)'} não cadastrada na frota`;
        else if (!(it.litros > 0) || !(it.valor > 0)) it.classe = 'erro', it.detalhe = 'Litros ou valor inválido';
        else {
          it.ref = v.ref; it.veiculo = `${v.placa} · ${v.modelo}`;
          const chave = [v.ref, it.data, it.hora, it.litros].join('|');
          if (vistos.has(chave)) { it.classe = 'conflito'; it.detalhe = `Repetido no arquivo (igual à linha ${vistos.get(chave)}): confira com a administradora`; return it; }
          vistos.set(chave, it.linha);
          const igual = existentes.find((a) => a.ref === v.ref && a.data === it.data && Math.abs((a.litros || 0) - it.litros) < 0.01 && (!it.hora || !a.hora || a.hora === it.hora));
          it.classe = igual ? 'igual' : 'novo'; it.detalhe = igual ? 'Já registrado (mesmo veículo, dia e litros)' : '';
        }
        return it;
      })
    };
  };
  X.abas.cartao = () => {
    const st = VP.estado.cartao = VP.estado.cartao || {};
    const imps = VP.db.lista('importacoesCartao').sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const p = st.previa;
    return {
      html: `<section class="cartao"><h3>Importar o arquivo da administradora do cartão</h3>
          <p class="ajuda">Para prefeituras com contrato de cartão-combustível: baixe no site da administradora o extrato em planilha (CSV) com <b>data, hora, placa, litros, valor, km, combustível, posto e motorista</b>. O sistema mostra a prévia, grava só o que você confirmar e evita repetir o que já foi lançado. Depois dá para desfazer.</p>
          <label class="botao primario">Escolher arquivo<input type="file" accept=".csv,.txt" data-arquivo-cartao hidden></label></section>
        ${p ? `<section class="cartao" id="previa-cartao"><h3>Prévia: ${esc(p.arquivo)} (nada gravado ainda)</h3>
          <div class="resumo-linha">${G.numero('Novos', u.inteiro(p.itens.filter((i) => i.classe === 'novo').length))}${G.numero('Já registrados (ignorados)', u.inteiro(p.itens.filter((i) => i.classe === 'igual').length))}${G.numero('Repetidos no arquivo', u.inteiro(p.itens.filter((i) => i.classe === 'conflito').length))}${G.numero('Com erro', u.inteiro(p.itens.filter((i) => i.classe === 'erro').length))}${G.numero('Valor dos novos', u.moeda(p.itens.filter((i) => i.classe === 'novo').reduce((t, i) => t + i.valor, 0)))}</div>
          ${ui.tabela({ id: 'frota-previa-cartao', linhas: p.itens, chave: 'linha', porPagina: 100, nomePlanilha: 'previa-cartao', colunas: [{ chave: 'classe', titulo: 'Resultado', valor: (i) => ({ novo: 'Novo', igual: 'Já registrado', conflito: 'Repetido', erro: 'Erro' }[i.classe]) }, { chave: 'linha', titulo: 'Linha', num: true }, { chave: 'data', titulo: 'Data', valor: (i) => `${u.data(i.data)} ${i.hora || ''}` }, { chave: 'veiculo', titulo: 'Veículo', valor: (i) => i.veiculo || i.placa }, { chave: 'litros', titulo: 'Litros', num: true }, { chave: 'valor', titulo: 'Valor', num: true, formato: u.moeda }, { chave: 'km', titulo: 'Km', num: true }, { chave: 'detalhe', titulo: 'Detalhe' }] })}
          <button class="botao primario" data-aplicar-cartao>Gravar os ${p.itens.filter((i) => i.classe === 'novo').length} novos</button> <button class="botao" data-descartar-cartao>Descartar</button></section>` : ''}
        <section class="cartao"><h3>Arquivos importados</h3>${imps.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Arquivo</th><th class="num">Lançados</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${imps.map((i) => `<tr><td>${u.data(i.criadoEm)}</td><td>${esc(i.arquivo)}</td><td class="num">${u.inteiro(i.lancados.length)}</td><td class="num">${u.moeda(i.valor)}</td><td>${i.desfeitaEm ? 'Desfeita' : 'Aplicada'}</td><td>${i.desfeitaEm ? '' : `<button class="botao pequeno perigo" data-desfazer-cartao="${esc(i.id)}">Desfazer</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhum.</p>'}</section>`,
      ligar() {
        document.querySelector('[data-arquivo-cartao]').addEventListener('change', async (e) => {
          const f = e.target.files[0]; if (!f) return;
          const r = X.lerArquivoCartao(await f.text());
          if (r.erro) return ui.aviso(r.erro, 'erro');
          st.previa = { arquivo: f.name, itens: r.itens }; re();
        });
        document.querySelector('[data-descartar-cartao]')?.addEventListener('click', () => { st.previa = null; re(); });
        document.querySelector('[data-aplicar-cartao]')?.addEventListener('click', async () => {
          const novos = st.previa.itens.filter((i) => i.classe === 'novo');
          const lote = 'cartao-' + u.id();
          const eventos = [], abastecimentos = [], lancados = [];
          for (const i of novos) {
            const dados = { data: i.data, hora: i.hora, litros: i.litros, valor: i.valor, km: i.km, combustivel: i.combustivel, posto: i.posto, motoristaNome: i.motorista, origem: 'cartão-combustível', loteCartao: lote };
            if (i.ref.startsWith('B:')) { const ev = VP.novoEvento(i.ref.slice(2), 'abastecimento', { data: i.data, valor: i.valor, descricao: `${i.litros} L${i.combustivel ? ' de ' + i.combustivel : ''}${i.km ? ' · km ' + i.km : ''} (cartão-combustível)`, extra: dados }); eventos.push(ev); lancados.push({ col: 'eventos', id: ev.id }); }
            else { const a = Object.assign({ id: u.id(), ref: i.ref }, dados); abastecimentos.push(a); lancados.push({ col: 'abastecimentos', id: a.id }); }
          }
          const imp = { id: lote, arquivo: st.previa.arquivo, criadoEm: agora(), usuario: usuario(), lancados, valor: novos.reduce((t, i) => t + i.valor, 0) };
          await VP.db.gravarVarias({ eventos, abastecimentos, importacoesCartao: [imp] });
          const { resultado } = F.analisar();
          const alertas = lancados.map((l) => ({ l, al: resultado.get(l.id)?.alertas || [] })).filter((x) => x.al.length);
          ui.resultado({ titulo: 'Arquivo do cartão importado', sucesso: novos.map((i) => `${i.veiculo} · ${u.data(i.data)} · ${i.litros} L · ${u.moeda(i.valor)}`), falhas: st.previa.itens.filter((i) => i.classe === 'erro' || i.classe === 'conflito').map((i) => ({ item: `Linha ${i.linha}`, motivo: i.detalhe })).concat(alertas.map((x) => ({ item: 'Conferir abastecimento', motivo: x.al.join('; ') }))) });
          st.previa = null; re();
        });
        document.querySelectorAll('[data-desfazer-cartao]').forEach((b) => b.addEventListener('click', async () => {
          const imp = VP.db.pega('importacoesCartao', b.dataset.desfazerCartao);
          if (!await ui.confirmar(`Desfazer a importação de <b>${esc(imp.arquivo)}</b>? Os ${imp.lancados.length} abastecimentos lançados saem dos custos (ficam no histórico como cancelados).`, { sim: 'Desfazer', classe: 'perigo' })) return;
          const eventos = [], abastecimentos = [];
          for (const l of imp.lancados) { const x = VP.db.pega(l.col, l.id); if (!x) continue; if (l.col === 'eventos') { x.cancelado = true; x.canceladoEm = agora(); eventos.push(x); } else { x.excluido = true; x.excluidoEm = agora(); abastecimentos.push(x); } }
          imp.desfeitaEm = agora();
          await VP.db.gravarVarias({ eventos, abastecimentos, importacoesCartao: [imp] });
          ui.aviso('Importação desfeita.'); re();
        }));
      }
    };
  };

  // ================================================================== DIAS PARADOS (FR-03)
  F.diasParados = (ref, ym) => {
    const ini = `${ym}-01`; const fimMes = `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
    const dias = new Set();
    for (const p of VP.db.lista('paradasVeiculo').filter((x) => x.ref === ref && x.contaDesconto !== false)) {
      const a = p.inicio > ini ? p.inicio : ini, b = (p.fim || fimMes) < fimMes ? (p.fim || fimMes) : fimMes;
      for (let d = a; d <= b; d = u.somaDias(d, 1)) dias.add(d);
    }
    return dias.size;
  };
  X.novaParada = () => ui.formulario({
    titulo: 'Parada do veículo', largura: 'pequena',
    intro: '<p class="ajuda">Registre quando um veículo alugado ficou parado (oficina da locadora, sinistro) para conferir a fatura.</p>',
    campos: [{ chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: F.veiculos().filter((v) => v.origem === 'locado').map((v) => [v.ref, `${v.placa} · ${v.modelo}`]), obrigatorio: true }, { chave: 'inicio', rotulo: 'Parado desde', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'fim', rotulo: 'Até (vazio se continua parado)', tipo: 'data', largura: 'meia' }, { chave: 'motivo', rotulo: 'Motivo', obrigatorio: true }, { chave: 'substituto', rotulo: 'A locadora mandou carro reserva (não conta para desconto)', tipo: 'bool' }],
    salvar: async (x) => {
      if (x.fim && x.fim < x.inicio) return 'O fim é antes do início.';
      await VP.db.gravar('paradasVeiculo', { id: u.id(), ref: x.ref, inicio: x.inicio, fim: x.fim, motivo: x.motivo, substituto: !!x.substituto, contaDesconto: !x.substituto, usuario: usuario(), criadoEm: agora() });
      ui.aviso('Parada registrada.'); re();
    }
  });
  X.listaParadas = (ym, refs) => {
    const l = VP.db.lista('paradasVeiculo').filter((p) => refs.includes(p.ref) && p.inicio <= `${ym}-31` && (!p.fim || p.fim >= `${ym}-01`));
    return l.length ? `<h4>Paradas no mês</h4><ul class="lista-simples">${l.map((p) => `<li>${esc(nomeV(p.ref))} · ${u.data(p.inicio)} a ${p.fim ? u.data(p.fim) : 'continua'} · ${esc(p.motivo)}${p.substituto ? ' · com carro reserva (sem desconto)' : ''}</li>`).join('')}</ul>` : '';
  };
})();

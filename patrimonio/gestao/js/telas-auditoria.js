/* VitalPat Patrimônio · Gestão — Auditoria patrimonial (26/10/2026). Base: patrimonio/auditoria-patrimonial.md.
   - Testes automáticos sobre 100% dos registros, cada um com o critério (lei ou regra) e a lista dos casos.
   - Auditorias (processos): plano, papéis de trabalho numerados, amostra reproduzível (semente), questionários,
     achados (situação × critério × causa × efeito), recomendações com prazo e acompanhamento, parecer e relatório.
   - Pacote para órgãos de controle (.zip) com índice e impressão digital (SHA-256) de cada arquivo.
   - Conciliação patrimônio × balancete da contabilidade (arquivo do SIAFIC).
   Regras: o sistema aponta, a pessoa decide; quem fez um papel não o revisa; nada se apaga. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const AU = VP.auditoria = {};
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const usuario = () => VP.sessao?.usuario || '';
  const norm = (t) => (u.normalizar ? u.normalizar(t) : String(t || '').toLowerCase()).trim();
  AU.pode = () => !VP.servidor?.ativo || VP.servidor.podeAuditar();
  const ativos = () => VP.db.lista('bens').filter((b) => b.status !== 'baixado');
  const liquido = (b) => { try { return VP.saldo(b).liquido || 0; } catch (_) { return 0; } };
  const bemCaso = (b, detalhe = '', valor) => ({ id: b.id, rotulo: `${b.plaqueta || b.codigo || ''} · ${b.descricao || ''}`, link: '#bem/' + b.id, detalhe, valor: valor ?? liquido(b) });
  const diasAtras = (n) => u.somaDias(hoje(), -n);

  // ------------------------------------------------------------------ testes automáticos (cada pergunta que o sistema responde sozinho)
  const GRAV = { alta: ['Rever', 'selo-alerta'], media: ['Atenção', 'selo-atencao'], baixa: ['Informação', 'selo-info'] };
  const AREAS = ['Especificação (7.8.1)', 'Aquisição (7.8.3)', 'Bens móveis (7.8.5.1)', 'Depreciação', 'Imóveis (7.8.5.2)', 'Intangível (7.8.6)', 'Semoventes (7.8.5.3)', 'Controle formal (7.6)', 'Conciliação contábil', 'Segurança (8)'];
  const TESTES = [
    { cod: 'ESP-01', area: AREAS[0], grav: 'media', pergunta: 'Produtos do catálogo sem classificação', criterio: 'Catálogo padronizado (Lei 14.133/2021, padronização e catálogo); classificação define conta, vida útil e residual (MCASP).',
      rodar: () => VP.db.lista('produtos').filter((p) => !p.classificacaoId).map((p) => ({ id: p.id, rotulo: p.nome, link: '#cadastros/produtos' })) },
    { cod: 'ESP-02', area: AREAS[0], grav: 'baixa', pergunta: 'Produtos com o mesmo nome (possível duplicidade no catálogo)', criterio: 'Catálogo sem itens repetidos evita compra e registro duplicados.',
      rodar: () => { const m = new Map(); for (const p of VP.db.lista('produtos')) { const k = norm(p.nome); if (!k) continue; m.set(k, (m.get(k) || []).concat(p)); } return [...m.values()].filter((l) => l.length > 1).flat().map((p) => ({ id: p.id, rotulo: p.nome, link: '#cadastros/produtos?busca=' + encodeURIComponent(p.nome) })); } },
    { cod: 'ESP-03', area: AREAS[0], grav: 'alta', pergunta: 'Classificações que depreciam sem vida útil ou sem valor residual', criterio: 'NBC TSP 07: depreciação pela vida útil, descontado o residual. Regra do sistema: residual sempre informado.',
      rodar: () => VP.db.lista('classificacoes').filter((c) => !c.naoDeprecia && !c.aClassificar).filter((c) => { const d = VP.dadosDaClassificacao(c.id); return d.vidaUtilMeses == null || d.vidaUtilMeses === '' || d.residualPct == null || d.residualPct === ''; }).filter((c) => !VP.db.lista('classificacoes').some((f) => f.paiId === c.id)).map((c) => ({ id: c.id, rotulo: c.nome, link: '#cadastros/classificacoes' })) },
    { cod: 'AQU-01', area: AREAS[1], grav: 'alta', pergunta: 'Itens comprados há mais de 30 dias e ainda não incorporados', criterio: 'Lei 4.320/1964, art. 94 (registro de todo bem permanente); todo material permanente comprado vira bem com plaqueta.',
      rodar: () => VP.db.lista('itensIncorporar').filter((i) => i.ativo !== false && (Number(i.quantidade) || 0) - (Number(i.incorporados) || 0) > 0).filter((i) => { const d = i.empenho?.emissao || i.emissao || String(i.criadoEm || '').slice(0, 10); return d && d < diasAtras(30); }).map((i) => ({ id: i.id, rotulo: `${i.descricao || VP.nome('produtos', i.produtoId) || 'Item'} · faltam ${(Number(i.quantidade) || 0) - (Number(i.incorporados) || 0)}`, link: '#entradas', valor: ((Number(i.quantidade) || 0) - (Number(i.incorporados) || 0)) * (Number(i.valorUnitario) || 0) })) },
    { cod: 'AQU-02', area: AREAS[1], grav: 'media', pergunta: 'Bens comprados sem nota fiscal, empenho nem ordem de compra', criterio: 'Lei 4.320/1964, arts. 62 e 63 (liquidação com documento) [A conferir]; rastreabilidade da entrada.',
      rodar: () => ativos().filter((b) => b.situacaoAquisicao === 'Compra' && !b.nf?.numero && !b.origem?.empenho && !b.origem?.ordemCompra).map((b) => bemCaso(b, 'sem documento de compra')) },
    { cod: 'AQU-03', area: AREAS[1], grav: 'baixa', pergunta: 'Fornecedores sem CNPJ ou CPF', criterio: 'Identificação do fornecedor no documento fiscal.',
      rodar: () => VP.db.lista('fornecedores').filter((f) => !String(f.documento || '').replace(/\D/g, '')).map((f) => ({ id: f.id, rotulo: f.nome, link: '#cadastros/fornecedores' })) },
    { cod: 'AQU-04', area: AREAS[1], grav: 'media', pergunta: 'Itens liquidados (pagos) sem nenhum bem incorporado', criterio: 'O que foi pago precisa estar registrado no patrimônio (Lei 4.320/1964, art. 94).',
      rodar: () => VP.db.lista('itensIncorporar').filter((i) => i.liquidado && !(Number(i.incorporados) > 0)).map((i) => ({ id: i.id, rotulo: i.descricao || VP.nome('produtos', i.produtoId) || 'Item', link: '#entradas', valor: (Number(i.quantidade) || 0) * (Number(i.valorUnitario) || 0) })) },
    { cod: 'MOV-01', area: AREAS[2], grav: 'alta', pergunta: 'Plaquetas repetidas', criterio: 'Plaqueta única por bem (registro analítico individualizado, Lei 4.320/1964, art. 94).',
      rodar: () => { const m = new Map(); for (const b of VP.db.lista('bens')) { const k = norm(b.plaqueta); if (!k) continue; m.set(k, (m.get(k) || []).concat(b)); } return [...m.values()].filter((l) => l.length > 1).flat().map((b) => bemCaso(b, 'plaqueta ' + b.plaqueta)); } },
    { cod: 'MOV-02', area: AREAS[2], grav: 'alta', pergunta: 'Plaqueta reaproveitada (já foi de outro bem)', criterio: 'Plaqueta nunca reaproveitada (decisão de 08/10/2026; rastreabilidade).',
      rodar: () => { const ant = new Map(); for (const b of VP.db.lista('bens')) for (const a of (b.plaquetasAnteriores || [])) ant.set(norm(a.plaqueta), b.id); return VP.db.lista('bens').filter((b) => b.plaqueta && ant.has(norm(b.plaqueta)) && ant.get(norm(b.plaqueta)) !== b.id).map((b) => bemCaso(b, 'plaqueta já usada por outro bem')); } },
    { cod: 'MOV-03', area: AREAS[2], grav: 'alta', pergunta: 'Bens sem unidade (centro de custo)', criterio: 'Lei 4.320/1964, art. 96: inventário analítico por unidade administrativa.',
      rodar: () => ativos().filter((b) => !b.unidadeId || b.centroCustoPendente).map((b) => bemCaso(b, 'sem unidade')) },
    { cod: 'MOV-04', area: AREAS[2], grav: 'alta', pergunta: 'Bens sem responsável pela guarda', criterio: 'Lei 4.320/1964, art. 94: registro dos agentes responsáveis pela guarda e administração.',
      rodar: () => ativos().filter((b) => !b.responsavelId).map((b) => bemCaso(b, 'sem responsável')) },
    { cod: 'MOV-05', area: AREAS[2], grav: 'alta', pergunta: 'Termos de responsabilidade vencidos (não voltaram assinados no prazo)', criterio: 'Prazo de 15 dias para devolver o termo assinado (regra do sistema, 08/10/2026).',
      rodar: () => (VP.termos ? VP.termos.lista().filter(VP.termos.vencido) : []).map((t) => ({ id: t.id, rotulo: `Termo ${t.numero} · ${VP.nome('responsaveis', t.responsavelId)}`, link: '#termos?situacao=vencidos', detalhe: 'prazo ' + u.data(t.prazo) })) },
    { cod: 'MOV-06', area: AREAS[2], grav: 'alta', pergunta: 'Unidades com bens e sem inventário nos últimos 12 meses', criterio: 'Lei 4.320/1964, art. 96 (levantamento geral pelo inventário de cada unidade); inventário anual.',
      rodar: () => { const desde = u.somaDias(hoje(), -365); const cobertas = new Set(); for (const i of VP.db.lista('inventarios').filter((x) => String(x.dataCorte || '') >= desde)) for (const un of Object.values(i.esperados || {})) cobertas.add(un); const com = new Set(ativos().filter((b) => b.tipo !== 'imovel' && b.tipo !== 'infraestrutura').map((b) => b.unidadeId).filter(Boolean)); return [...com].filter((id) => !cobertas.has(id)).map((id) => ({ id, rotulo: VP.nome('unidades', id), link: '#unidade/' + id })); } },
    { cod: 'MOV-07', area: AREAS[2], grav: 'alta', pergunta: 'Bens não encontrados no último inventário encerrado', criterio: 'Diferenças do inventário precisam de apuração (NBC TA 501; Lei 4.320/1964, art. 96).',
      rodar: () => { const inv = VP.db.lista('inventarios').filter((i) => i.situacao !== 'aberto').sort((a, b) => String(b.dataCorte).localeCompare(String(a.dataCorte)))[0]; if (!inv) return []; return Object.keys(inv.esperados || {}).filter((id) => !(inv.leituras || {})[id]).map((id) => VP.db.pega('bens', id)).filter((b) => b && b.status !== 'baixado').map((b) => bemCaso(b, 'não encontrado em ' + (inv.nome || 'inventário'))); } },
    { cod: 'MOV-08', area: AREAS[3], grav: 'alta', pergunta: 'Bens com valor abaixo do residual ou negativo', criterio: 'NBC TSP 07: o valor contábil não fica abaixo do residual; regra do sistema (14/10/2026).',
      rodar: () => ativos().filter((b) => { try { const s = VP.saldo(b); return s.liquido < 0 || s.liquido + 0.01 < Math.min(s.residual, s.base); } catch (_) { return false; } }).map((b) => bemCaso(b, 'valor abaixo do residual')) },
    { cod: 'MOV-09', area: AREAS[7], grav: 'alta', pergunta: 'Baixas sem o documento exigido (BO, avaliação prévia ou justificativa)', criterio: 'Lei 14.133/2021, art. 76 (venda, doação e permuta com avaliação e interesse público); furto e extravio com boletim ou processo.',
      rodar: () => VP.db.lista('eventos').filter((e) => e.tipo === 'baixa' && !e.cancelado).filter((e) => { const d = e.dados || {}; if (d.loteId) return false; const precisa = ['Alienação (leilão)', 'Doação', 'Permuta'].includes(d.tipoBaixa); return !d.motivo || (precisa && (!d.avaliacao || !d.justificativa)) || (['Furto / roubo', 'Extravio'].includes(d.tipoBaixa) && !d.documento); }).map((e) => { const b = VP.db.pega('bens', e.bemId); return b ? bemCaso(b, `baixa de ${u.data(e.data)} sem documento`, e.valor || 0) : null; }).filter(Boolean) },
    { cod: 'MOV-10', area: AREAS[2], grav: 'media', pergunta: 'Inservíveis parados há mais de 180 dias (sem destino)', criterio: 'Bem inservível deve ter destino (leilão, doação, reaproveitamento); boa gestão e Lei 14.133/2021, art. 76.',
      rodar: () => ativos().filter((b) => b.status === 'inservivel').filter((b) => { const ult = VP.eventosDoBem(b.id).map((e) => e.data).sort().pop() || b.dataIncorporacao; return ult && ult < diasAtras(180); }).map((b) => bemCaso(b, 'inservível sem destino')) },
    { cod: 'MOV-11', area: AREAS[2], grav: 'alta', pergunta: 'Bens imprestáveis aguardando baixa', criterio: 'Estado "Imprestável" leva à baixa (livro de controle patrimonial, DOSSIE A6).',
      rodar: () => ativos().filter((b) => Number(b.estado) === 1).map((b) => bemCaso(b, 'imprestável')) },
    { cod: 'MOV-12', area: AREAS[2], grav: 'alta', pergunta: 'Seguros vencidos', criterio: 'Proteção do patrimônio (seguro em dia); Lei 14.133/2021 para a contratação.',
      rodar: () => ativos().filter((b) => b.seguro?.termino && b.seguro.termino < hoje()).map((b) => bemCaso(b, 'seguro venceu em ' + u.data(b.seguro.termino))) },
    { cod: 'MOV-13', area: AREAS[2], grav: 'baixa', pergunta: 'Bens de valor e vida útil de item de controle registrados como patrimônio', criterio: 'Itens de controle (até o limite de valor E de vida útil) ficam fora do balancete (regra de Rio do Sul, 08/10/2026). O sistema sugere; a pessoa decide.',
      rodar: () => { const cfg = VP.config(); return ativos().filter((b) => ['movel'].includes(b.tipo)).filter((b) => { try { const s = VP.saldo(b); const d = VP.dadosDaClassificacao(b.classificacaoId); return s.base > 0 && s.base <= (cfg.limiteControle ?? 300) && d.vidaUtilMeses && d.vidaUtilMeses <= (cfg.limiteControleMeses ?? 24); } catch (_) { return false; } }).map((b) => bemCaso(b, 'pode ser item de controle')); } },
    { cod: 'MOV-14', area: AREAS[3], grav: 'media', pergunta: 'Bens aguardando avaliação (R$ 0) há mais de 90 dias', criterio: 'NBC TSP 07 e MCASP: o bem precisa de valor (avaliação ou reavaliação com laudo).',
      rodar: () => ativos().filter((b) => VP.aguardandoAvaliacao && VP.aguardandoAvaliacao(b) && (b.dataIncorporacao || '9') < diasAtras(90)).map((b) => bemCaso(b, 'aguardando avaliação', 0)) },
    { cod: 'DEP-01', area: AREAS[3], grav: 'alta', pergunta: 'Meses sem fechamento da depreciação', criterio: 'NBC TSP 07: depreciação reconhecida mês a mês; MCASP.',
      rodar: () => { const ult = VP.ultimoFechamento(); const atual = hoje().slice(0, 7); if (!ultimoComBens()) return []; let m = ult ? u.somaMeses(ult.mes, 1) : u.somaMeses(atual, -1); const l = []; while (m < atual && l.length < 36) { l.push({ id: m, rotulo: u.mesExtenso(m), link: '#financeiro/fechamento' }); m = u.somaMeses(m, 1); } return l; } },
    { cod: 'DEP-02', area: AREAS[3], grav: 'alta', pergunta: 'Bens que deveriam depreciar e estão sem vida útil', criterio: 'NBC TSP 07: todo bem depreciável tem vida útil definida.',
      rodar: () => ativos().filter((b) => b.tipo !== 'imovel' && !VP.naoDeprecia(b)).filter((b) => { try { return !VP.saldo(b).vidaUtilMeses; } catch (_) { return false; } }).map((b) => bemCaso(b, 'sem vida útil')) },
    { cod: 'DEP-03', area: AREAS[3], grav: 'media', pergunta: 'Bens sem reavaliação há mais tempo que o previsto', criterio: 'NBC TSP 07 e MCASP (reavaliação periódica); prazo nas Configurações.',
      rodar: () => { const cfg = VP.config(); const h = hoje(); const lim = `${Number(h.slice(0, 4)) - (cfg.reavaliacaoAnos || 5)}${h.slice(4)}`; return ativos().filter((b) => { try { const s = VP.saldo(b); return b.tipo !== 'intangivel' && s.marco && s.marco.data < lim; } catch (_) { return false; } }).map((b) => bemCaso(b, 'sem reavaliação')); } },
    { cod: 'IMO-01', area: AREAS[4], grav: 'alta', pergunta: 'Imóveis sem matrícula e sem o motivo informado', criterio: 'IN TC-20/2015 do TCE-SC (demonstrativo dos imóveis: o que impede a regularização).',
      rodar: () => ativos().filter((b) => b.tipo === 'imovel' && !b.imovel?.matricula && !b.imovel?.motivoPendencia).map((b) => bemCaso(b, 'sem matrícula e sem motivo')) },
    { cod: 'IMO-02', area: AREAS[4], grav: 'alta', pergunta: 'Matrículas ativas em nome de outro dono no cartório', criterio: 'Direitos: o imóvel deve estar registrado em nome do Município (Lei 6.015/1973) [A conferir].',
      rodar: () => VP.db.lista('matriculas').filter((m) => m.situacao === 'ativa' && m.proprietario && !/munic/i.test(m.proprietario)).map((m) => ({ id: m.id, rotulo: `Matrícula ${m.matricula}`, link: '#matricula/' + m.id, detalhe: 'dono: ' + m.proprietario })) },
    { cod: 'IMO-03', area: AREAS[4], grav: 'media', pergunta: 'Matrículas ativas sem PDF', criterio: 'Evidência documental do registro (papel de trabalho).',
      rodar: () => VP.db.lista('matriculas').filter((m) => m.situacao === 'ativa' && !m.pdfLinks).map((m) => ({ id: m.id, rotulo: `Matrícula ${m.matricula}`, link: '#matricula/' + m.id })) },
    { cod: 'IMO-04', area: AREAS[4], grav: 'media', pergunta: 'Cessões e comodatos vencidos', criterio: 'Uso por terceiros só com termo vigente.',
      rodar: () => (VP.imoveis ? VP.imoveis.alertas().cessoesVencidas : []).map((c) => { const b = VP.db.pega('bens', c.bemId); return b ? bemCaso(b, 'cessão vencida: ' + (c.parte || '')) : null; }).filter(Boolean) },
    { cod: 'IMO-05', area: AREAS[4], grav: 'media', pergunta: 'Documentos de imóveis vencidos (habite-se, AVCB, alvarás)', criterio: 'Segurança e regularidade do imóvel (normas de bombeiros e posturas municipais) [A conferir].',
      rodar: () => (VP.imoveis ? VP.imoveis.alertas().docsVencidos : []).map((d) => { const b = VP.db.pega('bens', d.bemId); return b ? bemCaso(b, `${d.tipo} vencido`) : null; }).filter(Boolean) },
    { cod: 'IMO-06', area: AREAS[4], grav: 'alta', pergunta: 'Matrículas baixadas que continuam em nome do Município', criterio: 'Imóvel que saiu do patrimônio deve sair do nome do Município no cartório.',
      rodar: () => VP.db.lista('matriculas').filter((m) => m.situacao === 'baixada' && /munic/i.test(m.proprietario || '')).map((m) => ({ id: m.id, rotulo: `Matrícula ${m.matricula}`, link: '#matricula/' + m.id })) },
    { cod: 'IMO-07', area: AREAS[4], grav: 'baixa', pergunta: 'Ligações de água e luz sem prédio ligado', criterio: 'Gasto público ligado ao bem que o gera (controle de custos).',
      rodar: () => { if (!VP.aguaLuz) return []; const idx = VP.aguaLuz.indicePredios(); return VP.aguaLuz.contratos().filter((c) => !idx.has(String(c.codigo || '').replace(/\D/g, ''))).map((c) => ({ id: c.id, rotulo: `${c.concessionaria || ''} ${c.codigo}`, link: '#agualuz/ligacoes?busca=' + encodeURIComponent(c.codigo) })); } },
    { cod: 'IMO-08', area: AREAS[4], grav: 'media', pergunta: 'Bens com importação aguardando conferência', criterio: 'O que veio de outro sistema precisa de conferência por pessoa (decisão de 23/10/2026).',
      rodar: () => ativos().filter((b) => b.conferenciaImportacao?.pendente).map((b) => bemCaso(b, 'importação a conferir')) },
    { cod: 'INT-01', area: AREAS[5], grav: 'media', pergunta: 'Intangíveis sem vida útil e sem indicação de vida útil indefinida', criterio: 'NBC TSP 08: amortização pela vida útil, ou nenhuma se a vida útil for indefinida.',
      rodar: () => ativos().filter((b) => b.tipo === 'intangivel' && !VP.naoDeprecia(b)).filter((b) => { try { return !VP.saldo(b).vidaUtilMeses; } catch (_) { return false; } }).map((b) => bemCaso(b, 'sem vida útil')) },
    { cod: 'INT-02', area: AREAS[5], grav: 'media', pergunta: 'Licenças e direitos com vigência vencida', criterio: 'NBC TSP 08 (direito vencido não gera benefício); revisar baixa ou renovação.',
      rodar: () => ativos().filter((b) => b.tipo === 'intangivel' && b.detalhes?.vigenciaFim && b.detalhes.vigenciaFim < hoje()).map((b) => bemCaso(b, 'vigência terminou em ' + u.data(b.detalhes.vigenciaFim))) },
    { cod: 'SEM-01', area: AREAS[6], grav: 'alta', pergunta: 'Semoventes (animais) sem identificação única (chip, brinco)', criterio: 'Registro analítico individualizado (Lei 4.320/1964, art. 94); NBC TSP de ativo biológico [A conferir].',
      rodar: () => ativos().filter((b) => b.tipo === 'semovente' && !b.detalhes?.identificacao).map((b) => bemCaso(b, 'sem identificação')) },
    { cod: 'FOR-01', area: AREAS[7], grav: 'media', pergunta: 'Comissões com menos de 3 membros', criterio: 'Comissão de inventário e avaliação com pelo menos 3 servidores (regra do cadastro de comissões).',
      rodar: () => VP.db.lista('comissoes').filter((c) => String(c.membros || '').split(/\n|;|,/).map((x) => x.trim()).filter(Boolean).length < 3).map((c) => ({ id: c.id, rotulo: c.nome, link: '#cadastros/comissoes' })) },
    { cod: 'FOR-02', area: AREAS[7], grav: 'media', pergunta: 'Inventários sem comissão designada', criterio: 'Inventário feito por comissão designada por ato (portaria).',
      rodar: () => VP.db.lista('inventarios').filter((i) => !i.comissaoId).map((i) => ({ id: i.id, rotulo: i.nome || 'Inventário', link: '#inventario' })) },
    { cod: 'FOR-03', area: AREAS[7], grav: 'alta', pergunta: 'Lotes de baixa confirmados sem ata', criterio: 'Baixa em lote só com ata (decisão de 08/10/2026).',
      rodar: () => VP.db.lista('lotesBaixa').filter((l) => l.situacao === 'confirmado' && !(l.ata || []).length).map((l) => ({ id: l.id, rotulo: 'Lote ' + l.numero, link: '#baixa-lote/' + l.id })) },
    { cod: 'FOR-04', area: AREAS[7], grav: 'baixa', pergunta: 'Termos de responsabilidade aguardando assinatura (ainda no prazo)', criterio: 'Controle formal do termo (prazo de 15 dias).',
      rodar: () => (VP.termos ? VP.termos.lista().filter((t) => t.situacao === 'aguardando' && !VP.termos.vencido(t)) : []).map((t) => ({ id: t.id, rotulo: `Termo ${t.numero}`, link: '#termos' })) },
    { cod: 'CON-01', area: AREAS[8], grav: 'alta', pergunta: 'Diferenças na última conciliação com a contabilidade', criterio: 'Lei 4.320/1964, arts. 95 e 96 (registro sintético na contabilidade × inventário analítico); MCASP.',
      rodar: () => { const c = VP.db.lista('conciliacoesSiafic').sort((a, b) => String(b.mes).localeCompare(String(a.mes)))[0]; return c ? (c.linhas || []).filter((l) => Math.abs(l.diferenca || 0) >= 0.01).map((l) => ({ id: c.id + l.conta, rotulo: `${l.conta} · ${l.nome || ''}`, link: '#auditoria/conciliacao', detalhe: `${u.mesExtenso(c.mes)}: diferença ${u.moeda(l.diferenca)}`, valor: Math.abs(l.diferenca) })) : []; } },
    { cod: 'CON-02', area: AREAS[8], grav: 'media', pergunta: 'Mais de 2 meses sem conciliar com a contabilidade', criterio: 'Conciliação mensal entre o controle patrimonial e a contabilidade (MCASP).',
      rodar: () => { if (!ativos().length) return []; const c = VP.db.lista('conciliacoesSiafic').map((x) => x.mes).sort().pop(); const lim = u.somaMeses(hoje().slice(0, 7), -2); return !c || c < lim ? [{ id: 'conc', rotulo: c ? 'Última conciliação: ' + u.mesExtenso(c) : 'Nenhuma conciliação feita', link: '#auditoria/conciliacao' }] : []; } },
    { cod: 'SEG-01', area: AREAS[9], grav: 'alta', pergunta: 'Ocorrências de furto, roubo, dano ou sinistro sem boletim ou laudo', criterio: 'Segurança patrimonial: toda ocorrência registrada com documento (BO, laudo) e apuração.',
      rodar: () => VP.db.lista('ocorrenciasSeguranca').filter((o) => !o.documento).map((o) => ({ id: o.id, rotulo: `${o.tipo} · ${u.data(o.data)}`, link: '#auditoria/ocorrencias' })) },
    { cod: 'SEG-02', area: AREAS[9], grav: 'media', pergunta: 'Ocorrências abertas há mais de 30 dias', criterio: 'Apuração em prazo razoável (sindicância ou processo).',
      rodar: () => VP.db.lista('ocorrenciasSeguranca').filter((o) => o.situacao !== 'encerrada' && (o.data || '9') < diasAtras(30)).map((o) => ({ id: o.id, rotulo: `${o.tipo} · ${u.data(o.data)}`, link: '#auditoria/ocorrencias' })) }
  ];
  const ultimoComBens = () => VP.db.lista('bens').some((b) => !VP.naoDeprecia(b));
  AU.TESTES = TESTES;

  AU.rodar = () => {
    const resultados = TESTES.map((t) => {
      let casos = [], erro = '';
      try { casos = t.rodar() || []; } catch (e) { erro = e.message; }
      return { cod: t.cod, area: t.area, grav: t.grav, pergunta: t.pergunta, criterio: t.criterio, casos, valor: casos.reduce((s, c) => s + (Number(c.valor) || 0), 0), erro };
    });
    AU.ultimo = { em: agora(), por: usuario(), resultados };
    return AU.ultimo;
  };
  const resultadoDe = (cod) => AU.ultimo?.resultados.find((r) => r.cod === cod);

  // ------------------------------------------------------------------ questionários (7.8.x) — a coluna "teste" liga a pergunta ao teste automático
  const QUESTIONARIOS = [
    { cod: '7.8.1.1', titulo: 'Especificação de materiais e bens', perguntas: [['Existe catálogo de produtos padronizado?', 'ESP-01'], ['A especificação define se o item é permanente, consumo ou controle?', 'MOV-13'], ['Há itens iguais com nomes diferentes?', 'ESP-02'], ['A vida útil e o residual de cada classe estão definidos?', 'ESP-03'], ['A especificação passou pelo setor de patrimônio antes da compra?', '']] },
    { cod: '7.8.2.1', titulo: 'Planejamento e controle de estoque', perguntas: [['Há estoque mínimo e máximo definidos?', ''], ['Há itens parados há mais de 12 meses?', ''], ['O planejamento de compras usa o consumo histórico?', ''], ['Há compras de emergência repetidas do mesmo item?', '']] },
    { cod: '7.8.3.1', titulo: 'Aquisição de materiais e bens', perguntas: [['Toda nota de material permanente virou bem incorporado?', 'AQU-01'], ['O valor do bem bate com a nota?', ''], ['Há bem comprado sem nota, empenho ou ordem de compra?', 'AQU-02'], ['Fornecedores cadastrados com CNPJ?', 'AQU-03'], ['Quem recebeu é diferente de quem incorporou?', ''], ['Há entrada liquidada sem incorporação?', 'AQU-04']] },
    { cod: '7.8.4.1', titulo: 'Almoxarifado (estoques)', perguntas: [['O almoxarifado tem acesso restrito e responsável designado?', ''], ['Toda saída tem requisição assinada?', ''], ['Há inventário de estoque ao menos anual, com comissão?', ''], ['As diferenças do inventário são apuradas e ajustadas com autorização?', ''], ['O saldo do almoxarifado bate com a conta contábil de estoques?', '']] },
    { cod: '7.8.5.1.1', titulo: 'Ativo imobilizado — bens móveis', perguntas: [['Todo bem tem plaqueta única e nunca reaproveitada?', 'MOV-01'], ['Todo bem tem unidade (centro de custo) e responsável?', 'MOV-04'], ['Termos de responsabilidade assinados no prazo (15 dias)?', 'MOV-05'], ['Inventário anual (últimos 12 meses) feito em todas as unidades?', 'MOV-06'], ['Diferenças do inventário (não encontrados, sobras) tratadas?', 'MOV-07'], ['Depreciação calculada e lançada todo mês?', 'DEP-01'], ['O valor do bem nunca fica abaixo do residual nem negativo?', 'MOV-08'], ['O total do patrimônio bate com o balancete por conta?', 'CON-01'], ['Baixas com motivo, ata e autorização?', 'MOV-09'], ['Bens inservíveis ou imprestáveis com destino em prazo razoável?', 'MOV-10'], ['Veículos com documentação e seguro em dia?', 'MOV-12'], ['Itens de controle fora do balancete?', 'MOV-13'], ['Bens aguardando avaliação com prazo para avaliar?', 'MOV-14']] },
    { cod: '7.8.5.2.1', titulo: 'Ativo imobilizado — imóveis', perguntas: [['Todo imóvel tem matrícula ou o motivo de não ter?', 'IMO-01'], ['A matrícula está em nome do Município?', 'IMO-02'], ['Há PDF e texto da matrícula atualizados?', 'IMO-03'], ['Imóveis cedidos a terceiros têm termo vigente?', 'IMO-04'], ['Documentos (habite-se, AVCB, alvarás) em dia?', 'IMO-05'], ['O imóvel está avaliado e reavaliado no prazo?', 'DEP-03'], ['Imóveis baixados ainda em nome do Município?', 'IMO-06'], ['Gasto de água e luz compatível com o uso do imóvel?', 'IMO-07'], ['Ligações conferidas (importação a conferir)?', 'IMO-08']] },
    { cod: '7.8.5.3.1', titulo: 'Ativo imobilizado — semoventes', perguntas: [['Cada animal tem identificação única (chip, brinco)?', 'SEM-01'], ['Nascimentos, mortes e doações registrados com laudo?', ''], ['Há responsável pela guarda e alimentação?', ''], ['O valor é revisto (ativo biológico)?', '']] },
    { cod: '7.8.6.1', titulo: 'Ativo intangível', perguntas: [['Licenças de software registradas, com vigência e quantidade?', 'INT-02'], ['Amortização pela vida útil (ou nenhuma, se indefinida)?', 'INT-01'], ['Licenças vencidas ou sem uso?', 'INT-02'], ['Sistemas desenvolvidos pela prefeitura estão registrados?', '']] },
    { cod: '8', titulo: 'Segurança patrimonial', perguntas: [['Ocorrências de furto, dano e sinistro registradas com BO ou laudo?', 'SEG-01'], ['Ocorrências apuradas em prazo razoável?', 'SEG-02'], ['Os prédios têm vigilância, alarme ou câmera onde o risco pede?', ''], ['Os prédios têm AVCB (bombeiros) em dia?', 'IMO-05'], ['Os acessos ao sistema são revistos (quem saiu perde o acesso)?', '']] }
  ];
  AU.QUESTIONARIOS = QUESTIONARIOS;

  // ------------------------------------------------------------------ apoio
  const pegaAud = (id) => VP.db.pega('auditorias', id);
  const papeisDe = (audId) => VP.db.lista('papeisTrabalho').filter((p) => p.auditoriaId === audId).sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'pt-BR', { numeric: true }));
  const achadosDe = (audId) => VP.db.lista('achadosAuditoria').filter((a) => a.auditoriaId === audId);
  const recsDe = (audId) => VP.db.lista('recomendacoesAuditoria').filter((r) => r.auditoriaId === audId);
  const SITUACOES_AUD = { planejamento: 'Planejamento', execucao: 'Execução', relatorio: 'Relatório', concluida: 'Concluída' };
  const SITUACOES_REC = { aberta: 'Aberta', andamento: 'Em andamento', implementada: 'Implementada', nao_implementada: 'Não implementada' };
  const PARECERES = {
    sem_ressalva: ['Sem ressalva', 'Com base nos exames realizados, conforme o escopo e a metodologia descritos neste relatório, o controle e o registro dos bens patrimoniais de {entidade}, no período de {de} a {ate}, estão adequados, em todos os aspectos relevantes, aos critérios aplicáveis.'],
    com_ressalva: ['Com ressalva', 'Com base nos exames realizados, exceto pelos efeitos dos assuntos descritos nos achados {achados}, o controle e o registro dos bens patrimoniais de {entidade}, no período de {de} a {ate}, estão adequados, em todos os aspectos relevantes, aos critérios aplicáveis.'],
    adverso: ['Adverso', 'Em razão da relevância dos assuntos descritos nos achados {achados}, o controle e o registro dos bens patrimoniais de {entidade}, no período de {de} a {ate}, NÃO estão adequados aos critérios aplicáveis.'],
    abstencao: ['Abstenção de opinião', 'Não foi possível obter evidência suficiente e apropriada para fundamentar uma opinião sobre o controle e o registro dos bens patrimoniais de {entidade}, no período de {de} a {ate}, pelos motivos descritos em {achados}. Por isso, não expressamos opinião.']
  };
  const proxRef = (audId, letra) => `${letra}-${papeisDe(audId).filter((p) => String(p.ref).startsWith(letra + '-')).length + 1}`;
  const novoPapel = (aud, letra, dados) => Object.assign({ id: u.id(), auditoriaId: aud.id, ref: proxRef(aud.id, letra), feitoPor: usuario(), feitoEm: agora() }, dados);
  // amostra reproduzível: mesmo número (semente) = mesmo sorteio
  const sorteador = (semente) => { let a = semente >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  AU.sortear = (lista, n, semente) => { const r = sorteador(semente); const l = lista.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l.slice(0, n); };
  const sha256 = async (dados) => { const b = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados; const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join(''); };
  AU.sha256 = sha256;
  const selo = (g) => `<span class="${GRAV[g][1]}">${GRAV[g][0]}</span>`;
  // "Excluir" = Lixeira (nada se apaga): auditoria, papel ainda não revisado, achado, recomendação e ocorrência (26/10/2026)
  AU.LIXEIRA = { auditorias: 'Auditoria', papeisTrabalho: 'Papel de trabalho', achadosAuditoria: 'Achado de auditoria', recomendacoesAuditoria: 'Recomendação de auditoria', ocorrenciasSeguranca: 'Ocorrência de segurança' };
  AU.nomeNaLixeira = (col, x) => (col === 'auditorias' ? `${x.codigo} · ${x.titulo}` : col === 'papeisTrabalho' ? `${x.ref} · ${x.titulo}` : col === 'achadosAuditoria' ? `Achado ${x.numero} · ${x.titulo}` : col === 'recomendacoesAuditoria' ? x.texto : `${x.tipo} · ${u.data(x.data)}`);
  const lixeira = (col, x) => ui.formulario({ titulo: 'Mover para a Lixeira', largura: 'pequena', intro: `<p>Mover <b>${esc(AU.nomeNaLixeira(col, x))}</b> para a Lixeira? Nada é apagado: pode voltar pela Lixeira, e o histórico continua.</p>`,
    campos: [{ chave: 'motivo', rotulo: 'Motivo (ex.: criado por engano)', obrigatorio: true }], textoSalvar: 'Mover para a Lixeira',
    salvar: async (v) => { x.excluido = true; x.excluidoEm = agora(); x.excluidoPor = usuario(); x.excluidoMotivo = v.motivo; await VP.db.gravar(col, x); ui.aviso('Na Lixeira.'); VP.app.render(); } });
  const botaoLixeira = (col, x) => `<button type="button" class="botao pequeno perigo" data-lixeira-aud="${col}|${esc(x.id)}">Excluir</button>`;
  const ligarLixeira = () => document.querySelectorAll('[data-lixeira-aud]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const [col, id] = b.dataset.lixeiraAud.split('|'); lixeira(col, VP.db.pega(col, id)); }));
  const somenteLink = (t) => (/^https?:\/\//i.test(String(t || '').trim()) ? String(t).trim() : '');

  // ------------------------------------------------------------------ tela Auditoria
  const ABAS = [['painel', 'Painel'], ['testes', 'Testes automáticos'], ['auditorias', 'Auditorias'], ['recomendacoes', 'Recomendações'], ['conciliacao', 'Conciliação contábil'], ['ocorrencias', 'Ocorrências de segurança'], ['orgaos', 'Para órgãos de controle']];
  const nav = (aba) => `<nav class="abas abas-rolagem" aria-label="Auditoria">${ABAS.map(([k, t]) => `<a href="#auditoria/${k}" class="${k === aba ? 'ativa' : ''}">${t}</a>`).join('')}</nav>`;
  const caixaRodar = () => `<div class="gerar-relatorio"><button type="button" class="botao primario" data-rodar-testes>Rodar testes</button><span class="ajuda">Confere <b>todos</b> os registros contra ${TESTES.length} critérios (leis e regras). Nada é alterado: os testes só leem.</span></div>`;
  const avisoUltimo = () => (AU.ultimo ? `<p class="ajuda">Testes rodados em ${esc(new Date(AU.ultimo.em).toLocaleString('pt-BR'))} por ${esc(AU.ultimo.por)}. <button type="button" class="botao pequeno" data-rodar-testes>Rodar de novo</button></p>` : '');

  T.auditoria = (aba = 'painel', q = {}) => {
    if (!ABAS.some(([k]) => k === aba)) aba = 'painel';
    if (q.rodar && !AU.ultimo) AU.rodar();
    const tela = { painel: telaPainel, testes: telaTestes, auditorias: telaAuditorias, recomendacoes: telaRecomendacoes, conciliacao: telaConciliacao, ocorrencias: telaOcorrencias, orgaos: telaOrgaos }[aba](q);
    const ligar0 = tela.ligar;
    return {
      titulo: 'Auditoria', html: nav(aba) + tela.html, acoes: tela.acoes,
      ligar() {
        document.querySelectorAll('[data-rodar-testes]').forEach((b) => b.addEventListener('click', () => { AU.rodar(); VP.app.render(); }));
        if (ligar0) ligar0();
      }
    };
  };

  // ---- painel
  const telaPainel = () => {
    const recs = VP.db.lista('recomendacoesAuditoria');
    const abertas = recs.filter((r) => ['aberta', 'andamento'].includes(r.situacao));
    const vencidas = abertas.filter((r) => r.prazo && r.prazo < hoje());
    const auds = VP.db.lista('auditorias');
    const fixo = `<div class="resumo-linha">
      ${G.numero('Auditorias em andamento', u.inteiro(auds.filter((a) => a.situacao !== 'concluida').length), `${u.inteiro(auds.length)} no total`, '#auditoria/auditorias')}
      ${G.numero('Recomendações abertas', u.inteiro(abertas.length), `${u.inteiro(vencidas.length)} com prazo vencido`, '#auditoria/recomendacoes')}
    </div>`;
    if (!AU.ultimo) return { html: `<p class="ajuda">A auditoria confere se os bens existem, estão bem registrados, guardados e usados, e se os controles funcionam. O sistema <b>aponta</b>; a pessoa <b>decide</b>. Base legal e teoria: documento "Auditoria patrimonial".</p>${fixo}${caixaRodar()}` };
    const r = AU.ultimo.resultados;
    const comCasos = r.filter((x) => x.casos.length);
    const valor = r.reduce((s, x) => s + x.valor, 0);
    const porArea = AREAS.map((a) => { const l = r.filter((x) => x.area === a); return { a, ok: l.filter((x) => !x.casos.length).length, total: l.length }; }).filter((x) => x.total);
    const ordem = { alta: 0, media: 1, baixa: 2 };
    const top = comCasos.slice().sort((a, b) => ordem[a.grav] - ordem[b.grav] || b.casos.length - a.casos.length).slice(0, 10);
    return { html: `${fixo}${avisoUltimo()}
      <div class="resumo-linha">
        ${G.numero('Testes sem problema', `${u.inteiro(r.length - comCasos.length)} de ${u.inteiro(r.length)}`, u.pct(r.length ? (r.length - comCasos.length) / r.length : 0))}
        ${G.numero('Casos encontrados', u.inteiro(comCasos.reduce((s, x) => s + x.casos.length, 0)), `em ${u.inteiro(comCasos.length)} teste(s)`)}
        ${G.numero('Valor envolvido', u.moedaCurta(valor), u.moeda(valor))}
      </div>
      <div class="painel-grade">
        <section class="cartao" id="aud-saude"><h3>Saúde por área</h3><div class="tabela-rolagem"><table class="tabela tabela-painel"><thead><tr><th>Área</th><th>Testes sem problema</th></tr></thead><tbody>
          ${porArea.map((x) => `<tr><td><a href="#auditoria/testes?area=${encodeURIComponent(x.a)}">${esc(x.a)}</a></td><td style="min-width:160px">${G.medidor(x.ok / x.total, `${x.ok} de ${x.total}`)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="cartao" id="aud-top"><h3>Os problemas mais importantes</h3>${top.length ? `<ul class="lista-simples">${top.map((x) => `<li>${selo(x.grav)} <a href="#auditoria/testes?t=${x.cod}">${esc(x.cod)} · ${esc(x.pergunta)}</a>: <b>${u.inteiro(x.casos.length)}</b>${x.valor ? ' · ' + u.moeda(x.valor) : ''}</li>`).join('')}</ul>` : '<p class="ajuda">Nenhum problema encontrado pelos testes.</p>'}</section>
      </div>` };
  };

  // ---- testes
  const telaTestes = (q) => {
    if (!AU.ultimo) return { html: caixaRodar() };
    let r = AU.ultimo.resultados;
    if (q.area) r = r.filter((x) => x.area === q.area);
    if (q.t) r = r.filter((x) => x.cod === q.t);
    const pode = AU.pode();
    const linha = (x) => `<section class="cartao teste-aud ${x.casos.length ? 'com-casos' : ''}" id="teste-${x.cod}">
        <header><h3>${x.casos.length ? selo(x.grav) : '<span class="selo-ok">OK</span>'} ${esc(x.cod)} · ${esc(x.pergunta)}</h3>${pode && x.casos.length ? `<button type="button" class="botao pequeno" data-achado-teste="${x.cod}">Virar achado</button>` : ''}</header>
        <p class="ajuda"><b>Critério:</b> ${esc(x.criterio)}</p>
        ${x.erro ? `<p class="aviso-inline">O teste não rodou: ${esc(x.erro)}</p>` : x.casos.length ? `<p><b>${u.inteiro(x.casos.length)}</b> caso(s)${x.valor ? ` · ${u.moeda(x.valor)}` : ''}</p>
          <details><summary>Ver os casos</summary><ul class="lista-simples">${x.casos.slice(0, 300).map((c) => `<li><a href="${esc(c.link || '#')}">${esc(c.rotulo)}</a>${c.detalhe ? ` <span class="ajuda">(${esc(c.detalhe)})</span>` : ''}</li>`).join('')}${x.casos.length > 300 ? `<li class="ajuda">… e mais ${u.inteiro(x.casos.length - 300)} (todos vão no pacote para órgãos de controle)</li>` : ''}</ul></details>` : '<p class="ajuda">Nenhum caso.</p>'}
      </section>`;
    return {
      html: `${avisoUltimo()}<div class="painel-filtros"><label>Área <select data-area-testes><option value="">Todas</option>${AREAS.map((a) => `<option ${a === q.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>${q.t ? '<a class="botao pequeno" href="#auditoria/testes">Ver todos os testes</a>' : ''}</div>${r.map(linha).join('')}`,
      ligar() {
        document.querySelector('[data-area-testes]')?.addEventListener('change', (e) => VP.app.ir('#auditoria/testes' + (e.target.value ? '?area=' + encodeURIComponent(e.target.value) : '')));
        document.querySelectorAll('[data-achado-teste]').forEach((b) => b.addEventListener('click', () => novoAchado({ teste: resultadoDe(b.dataset.achadoTeste) })));
      }
    };
  };

  // ---- achado (a partir de um teste ou em branco, dentro de uma auditoria)
  const novoAchado = ({ teste, auditoriaId } = {}) => {
    const abertas = VP.db.lista('auditorias').filter((a) => a.situacao !== 'concluida');
    if (!abertas.length) return ui.aviso('Abra uma auditoria primeiro (aba Auditorias → Nova auditoria). O achado fica dentro dela.', 'erro');
    ui.formulario({
      titulo: 'Novo achado', largura: 'media',
      intro: '<p class="ajuda">Achado = <b>situação</b> encontrada × <b>critério</b> (lei ou regra) × <b>causa</b> × <b>efeito</b>. O sistema sugere; o texto final é seu.</p>',
      valores: { auditoriaId: auditoriaId || (abertas.length === 1 ? abertas[0].id : ''), titulo: teste ? teste.pergunta : '', situacao: teste ? `${teste.casos.length} caso(s) encontrados pelo teste ${teste.cod}${teste.valor ? `, somando ${u.moeda(teste.valor)}` : ''}. Exemplos: ${teste.casos.slice(0, 5).map((c) => c.rotulo).join('; ')}.` : '', criterio: teste ? teste.criterio : '', valor: teste ? Math.round(teste.valor * 100) / 100 : '', gravidade: teste ? teste.grav : 'media' },
      campos: [{ chave: 'auditoriaId', rotulo: 'Auditoria', tipo: 'select', opcoes: abertas.map((a) => [a.id, `${a.codigo} · ${a.titulo}`]), obrigatorio: true },
        { chave: 'titulo', rotulo: 'Título do achado', obrigatorio: true }, { chave: 'situacao', rotulo: 'Situação encontrada', tipo: 'area', obrigatorio: true },
        { chave: 'criterio', rotulo: 'Critério (lei, norma ou regra)', tipo: 'area', obrigatorio: true }, { chave: 'causa', rotulo: 'Causa (por que aconteceu)', tipo: 'area' },
        { chave: 'efeito', rotulo: 'Efeito (risco ou prejuízo)', tipo: 'area' }, { chave: 'valor', rotulo: 'Valor envolvido (R$)', tipo: 'moeda', largura: 'meia' },
        { chave: 'gravidade', rotulo: 'Gravidade', tipo: 'select', vazio: false, opcoes: [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], largura: 'meia' }],
      salvar: async (v) => {
        const aud = pegaAud(v.auditoriaId);
        const n = achadosDe(aud.id).length + 1;
        await VP.db.gravar('achadosAuditoria', { id: u.id(), auditoriaId: aud.id, numero: n, titulo: v.titulo, situacao: v.situacao, criterio: v.criterio, causa: v.causa || '', efeito: v.efeito || '', valor: Number(v.valor) || 0, gravidade: v.gravidade, testeCod: teste?.cod || '', casosIds: teste ? teste.casos.slice(0, 500).map((c) => c.id) : [], manifestacao: '', criadoPor: usuario(), criadoEm: agora() });
        ui.aviso(`Achado ${n} registrado em ${aud.codigo}.`);
        VP.app.ir(`#auditoria-processo/${aud.id}?aba=achados`);
      }
    });
  };
  AU.novoAchado = novoAchado;

  // ---- auditorias (lista e nova)
  const telaAuditorias = () => {
    const l = VP.db.lista('auditorias').sort((a, b) => String(b.codigo).localeCompare(String(a.codigo)));
    return {
      html: `${AU.pode() ? '<div class="linha-botoes"><button type="button" class="botao primario" data-nova-auditoria>Nova auditoria</button></div>' : ''}
        ${ui.tabela({ id: 'aud-lista', linhas: l, nomePlanilha: 'auditorias', vazio: 'Nenhuma auditoria ainda. Clique em "Nova auditoria" para planejar a primeira.', colunas: [
          { chave: 'codigo', titulo: 'Código', html: (a) => `<a href="#auditoria-processo/${esc(a.id)}">${esc(a.codigo)}</a>`, valor: (a) => a.codigo },
          { chave: 'titulo', titulo: 'Título' }, { chave: 'tipo', titulo: 'Tipo' },
          { chave: 'periodo', titulo: 'Período', valor: (a) => `${u.data(a.periodoDe)} a ${u.data(a.periodoAte)}` },
          { chave: 'situacao', titulo: 'Situação', valor: (a) => SITUACOES_AUD[a.situacao] || a.situacao },
          { chave: 'achados', titulo: 'Achados', num: true, valor: (a) => achadosDe(a.id).length },
          { chave: 'parecer', titulo: 'Parecer', valor: (a) => (a.parecer ? PARECERES[a.parecer.tipo]?.[0] : '') },
          { chave: 'x', titulo: '', html: (a) => (AU.pode() && a.situacao !== 'concluida' ? botaoLixeira('auditorias', a) : '') }] })}`,
      ligar() { ui.ligarTabela('aud-lista'); ligarLixeira(); document.querySelector('[data-nova-auditoria]')?.addEventListener('click', () => editarAuditoria()); }
    };
  };
  const TIPOS_AUD = ['Anual do patrimônio', 'Bens móveis', 'Bens imóveis', 'Almoxarifado', 'Aquisições', 'Frota', 'Específica'];
  const editarAuditoria = (aud) => ui.formulario({
    titulo: aud ? `Plano: ${aud.codigo}` : 'Nova auditoria (planejamento)', largura: 'media',
    intro: '<p class="ajuda">Planejamento (NBC TA 300; NBASP): objetivo, escopo, critérios, equipe e materialidade. O plano pode ser revisto durante o trabalho.</p>',
    valores: aud || { tipo: TIPOS_AUD[0], periodoDe: `${hoje().slice(0, 4)}-01-01`, periodoAte: hoje(), materialidadePct: 1, criterios: 'Lei 4.320/1964 (arts. 94 a 96); NBC TSP 07 e 08; MCASP; Lei 14.133/2021; IN TC-20/2015 (TCE-SC); regras do livro de controle patrimonial.' },
    campos: [{ chave: 'titulo', rotulo: 'Título', obrigatorio: true }, { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', vazio: false, opcoes: TIPOS_AUD.map((t) => [t, t]), largura: 'meia' },
      { chave: 'linha', rotulo: 'Quem audita', tipo: 'select', vazio: false, opcoes: [['interna', 'Controle interno / auditoria interna'], ['autoavaliacao', 'Autoavaliação do setor de patrimônio (não é independente)'], ['externa', 'Auditoria externa / Tribunal de Contas']], largura: 'meia' },
      { chave: 'periodoDe', rotulo: 'Período de', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'periodoAte', rotulo: 'até', tipo: 'data', obrigatorio: true, largura: 'meia' },
      { chave: 'objetivo', rotulo: 'Objetivo', tipo: 'area' }, { chave: 'escopo', rotulo: 'Escopo (unidades, contas, o que entra e o que fica fora)', tipo: 'area' },
      { chave: 'criterios', rotulo: 'Critérios (leis, normas, regras)', tipo: 'area' }, { chave: 'equipe', rotulo: 'Equipe (nomes e funções)', tipo: 'area' },
      { chave: 'materialidadePct', rotulo: 'Materialidade (% do valor do imobilizado)', tipo: 'numero', largura: 'meia', ajuda: 'Valor a partir do qual uma diferença é relevante. Sugestão: 1%.' },
      { chave: 'revisor', rotulo: 'Revisor (quem revisa os papéis)', largura: 'meia' }],
    salvar: async (v) => {
      if (v.periodoAte < v.periodoDe) return 'O fim do período é antes do início.';
      if (aud) { Object.assign(aud, v, { materialidadePct: Number(v.materialidadePct) || 0 }); await VP.db.gravar('auditorias', aud); ui.aviso('Plano atualizado.'); VP.app.render(); return; }
      const ano = hoje().slice(0, 4);
      const n = VP.db.lista('auditorias').filter((a) => String(a.codigo).startsWith(`AUD-${ano}-`)).length + 1;
      const nova = Object.assign({ id: u.id(), codigo: `AUD-${ano}-${String(n).padStart(2, '0')}`, situacao: 'planejamento', criadoPor: usuario(), criadoEm: agora() }, v, { materialidadePct: Number(v.materialidadePct) || 0 });
      await VP.db.gravarVarias({ auditorias: [nova], papeisTrabalho: [novoPapel(nova, 'A', { tipo: 'plano', titulo: 'Plano da auditoria', conteudo: Object.assign({}, v) })] });
      ui.aviso(`Auditoria ${nova.codigo} criada.`);
      VP.app.ir('#auditoria-processo/' + nova.id);
    }
  });

  // ------------------------------------------------------------------ processo de uma auditoria
  const ABAS_PROC = [['plano', 'Plano'], ['papeis', 'Papéis de trabalho'], ['amostra', 'Amostra'], ['questionarios', 'Questionários'], ['achados', 'Achados e recomendações'], ['parecer', 'Parecer e relatório']];
  T['auditoria-processo'] = (id, q = {}) => {
    const aud = pegaAud(id);
    if (!aud) return { titulo: 'Auditoria', html: '<p class="aviso-inline">Auditoria não encontrada.</p>' };
    const aba = ABAS_PROC.some(([k]) => k === q.aba) ? q.aba : 'plano';
    const pode = AU.pode() && aud.situacao !== 'concluida';
    const navp = `<p><a href="#auditoria/auditorias">← Todas as auditorias</a></p><nav class="abas abas-rolagem" aria-label="Auditoria ${esc(aud.codigo)}">${ABAS_PROC.map(([k, t]) => `<a href="#auditoria-processo/${esc(aud.id)}?aba=${k}" class="${k === aba ? 'ativa' : ''}">${t}</a>`).join('')}</nav>`;
    const corpo = { plano: procPlano, papeis: procPapeis, amostra: procAmostra, questionarios: procQuestionarios, achados: procAchados, parecer: procParecer }[aba](aud, pode, q);
    return {
      titulo: `${aud.codigo} · ${aud.titulo}`, html: navp + (aud.situacao === 'concluida' ? '<p class="aviso-inline">Auditoria concluída: os papéis ficam como estão (só leitura).</p>' : '') + corpo.html,
      acoes: '<a class="botao" href="#auditoria/auditorias">‹ Auditorias</a>',
      ligar: corpo.ligar
    };
  };
  const totalImobilizado = () => ativos().reduce((s, b) => s + liquido(b), 0);

  const procPlano = (aud, pode) => {
    const mat = totalImobilizado() * (Number(aud.materialidadePct) || 0) / 100;
    const linhaTxt = { interna: 'Controle interno / auditoria interna', autoavaliacao: 'Autoavaliação do setor de patrimônio (não é auditoria independente)', externa: 'Auditoria externa / Tribunal de Contas' }[aud.linha] || '';
    const dados = [['Tipo', aud.tipo], ['Quem audita', linhaTxt], ['Período', `${u.data(aud.periodoDe)} a ${u.data(aud.periodoAte)}`], ['Situação', SITUACOES_AUD[aud.situacao]], ['Objetivo', aud.objetivo], ['Escopo', aud.escopo], ['Critérios', aud.criterios], ['Equipe', aud.equipe], ['Revisor', aud.revisor], ['Materialidade', `${aud.materialidadePct || 0}% do imobilizado ≈ ${u.moeda(mat)}`], ['Criada por', `${aud.criadoPor} em ${new Date(aud.criadoEm).toLocaleString('pt-BR')}`]];
    const prox = { planejamento: ['execucao', 'Começar a execução'], execucao: ['relatorio', 'Passar para o relatório'], relatorio: ['concluida', 'Concluir a auditoria'] }[aud.situacao];
    return {
      html: `${aud.linha === 'autoavaliacao' ? '<p class="aviso-inline">Autoavaliação: feita por quem executa o controle. Não substitui auditoria independente.</p>' : ''}
        <section class="cartao secao"><header><h3>Plano</h3>${pode ? '<button class="botao pequeno" data-editar-plano>Editar plano</button>' : ''}</header>
        <dl class="dados">${dados.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="vazio">—</span>'}</dd>`).join('')}</dl>
        ${pode && prox ? `<div class="linha-botoes"><button class="botao primario" data-avancar="${prox[0]}">${prox[1]}</button></div>` : ''}</section>`,
      ligar() {
        document.querySelector('[data-editar-plano]')?.addEventListener('click', () => editarAuditoria(aud));
        document.querySelector('[data-avancar]')?.addEventListener('click', async (e) => {
          const para = e.target.dataset.avancar;
          if (para === 'concluida') {
            const faltam = [];
            if (!aud.parecer) faltam.push('emitir o parecer (aba Parecer e relatório)');
            const semRev = papeisDe(aud.id).filter((p) => !p.revisadoEm);
            if (semRev.length) faltam.push(`${semRev.length} papel(éis) de trabalho sem revisão`);
            if (faltam.length) return ui.resultado({ titulo: 'Ainda não dá para concluir', falhas: faltam.map((f) => ({ item: 'Falta', motivo: f })) });
            if (!await ui.confirmar(`Concluir <b>${esc(aud.codigo)}</b>? Depois de concluída, nada mais muda nos papéis (só as recomendações continuam sendo acompanhadas).`, { sim: 'Concluir' })) return;
          }
          aud.situacao = para; aud.historicoSituacao = (aud.historicoSituacao || []).concat({ em: agora(), por: usuario(), situacao: para });
          await VP.db.gravar('auditorias', aud); ui.aviso('Situação: ' + SITUACOES_AUD[para]); VP.app.render();
        });
      }
    };
  };

  const procPapeis = (aud, pode) => {
    const ps = papeisDe(aud.id);
    const TIPOS = { plano: 'Plano', testes: 'Testes automáticos', amostra: 'Amostra', questionario: 'Questionário', documento: 'Documento / anotação' };
    return {
      html: `<p class="ajuda">Papéis de trabalho: tudo o que foi feito, para outro auditor entender e chegar à mesma conclusão (NBC TA 230; NBASP). Quem fez <b>não</b> revisa o próprio papel. Nada é apagado.</p>
        ${pode ? '<div class="linha-botoes"><button class="botao primario" data-registrar-testes>Registrar os testes automáticos</button> <button class="botao" data-novo-documento>Novo documento / anotação</button></div>' : ''}
        ${ui.tabela({ id: 'aud-papeis', linhas: ps, nomePlanilha: 'papeis-de-trabalho', vazio: 'Nenhum papel ainda.', colunas: [
          { chave: 'ref', titulo: 'Ref.' }, { chave: 'titulo', titulo: 'Papel', html: (p) => `<a href="#" data-ver-papel="${esc(p.id)}">${esc(p.titulo)}</a>`, valor: (p) => p.titulo }, { chave: 'tipo', titulo: 'Tipo', valor: (p) => TIPOS[p.tipo] || p.tipo },
          { chave: 'feito', titulo: 'Feito por', valor: (p) => `${p.feitoPor} · ${u.data(String(p.feitoEm).slice(0, 10))}` },
          { chave: 'revisao', titulo: 'Revisão', html: (p) => (p.revisadoEm ? `${esc(p.revisadoPor)} · ${u.data(String(p.revisadoEm).slice(0, 10))}` : pode ? `<button class="botao pequeno" data-revisar="${esc(p.id)}">Revisar</button>` : '<span class="ajuda">sem revisão</span>'), valor: (p) => (p.revisadoEm ? p.revisadoPor : '') },
          { chave: 'x', titulo: '', html: (p) => (pode && !p.revisadoEm && p.tipo !== 'plano' ? botaoLixeira('papeisTrabalho', p) : '') }] })}`,
      ligar() {
        ui.ligarTabela('aud-papeis'); ligarLixeira();
        document.querySelector('[data-registrar-testes]')?.addEventListener('click', async () => {
          const r = AU.rodar();
          const p = novoPapel(aud, 'B', { tipo: 'testes', titulo: `Testes automáticos (${r.resultados.length} critérios)`, conteudo: { em: r.em, resultados: r.resultados.map((x) => ({ cod: x.cod, area: x.area, pergunta: x.pergunta, criterio: x.criterio, casos: x.casos.length, valor: x.valor, ids: x.casos.slice(0, 500).map((c) => c.id), exemplos: x.casos.slice(0, 20).map((c) => c.rotulo) })) } });
          await VP.db.gravar('papeisTrabalho', p); ui.aviso(`Papel ${p.ref} registrado.`); VP.app.render();
        });
        document.querySelector('[data-novo-documento]')?.addEventListener('click', () => ui.formulario({
          titulo: 'Novo documento / anotação', largura: 'media',
          campos: [{ chave: 'titulo', rotulo: 'Título', obrigatorio: true }, { chave: 'texto', rotulo: 'Anotação (o que foi feito, onde, com quem)', tipo: 'area' },
            { chave: 'link', rotulo: 'Evidência: link do arquivo (Drive, começa com https://)' }, { chave: 'arquivo', rotulo: 'Ou escolha o mesmo arquivo para guardar a impressão digital (não é enviado)', tipo: 'arquivo' }],
          salvar: async (v, d) => {
            const link = somenteLink(v.link);
            if (v.link && !link) return 'O link precisa começar com https://';
            let hash = '';
            const f = document.querySelector('dialog[open] input[type=file]')?.files?.[0];
            if (f) hash = await sha256(new Uint8Array(await f.arrayBuffer()));
            const p = novoPapel(aud, 'E', { tipo: 'documento', titulo: v.titulo, conteudo: { texto: v.texto || '' }, evidencias: link || hash ? [{ titulo: f?.name || v.titulo, link, sha256: hash }] : [] });
            await VP.db.gravar('papeisTrabalho', p); ui.aviso(`Papel ${p.ref} registrado${hash ? ' com a impressão digital do arquivo' : ''}.`); VP.app.render();
          }
        }));
        document.querySelectorAll('[data-revisar]').forEach((b) => b.addEventListener('click', async () => {
          const p = VP.db.pega('papeisTrabalho', b.dataset.revisar);
          if (p.feitoPor === usuario()) return ui.aviso('Quem fez o papel não pode revisá-lo (segregação de funções). Peça ao revisor.', 'erro');
          if (!await ui.confirmar(`Revisar o papel <b>${esc(p.ref)} · ${esc(p.titulo)}</b>? Seu nome e a data ficam registrados.`, { sim: 'Revisado' })) return;
          p.revisadoPor = usuario(); p.revisadoEm = agora(); await VP.db.gravar('papeisTrabalho', p); ui.aviso('Revisado.'); VP.app.render();
        }));
        document.querySelectorAll('[data-ver-papel]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); verPapel(VP.db.pega('papeisTrabalho', a.dataset.verPapel)); }));
      }
    };
  };
  const htmlPapel = (p) => {
    const c = p.conteudo || {};
    let corpo = '';
    if (p.tipo === 'testes') corpo = `<table class="tabela tabela-painel"><thead><tr><th>Teste</th><th class="num">Casos</th><th class="num">Valor</th></tr></thead><tbody>${(c.resultados || []).map((x) => `<tr><td>${esc(x.cod)} · ${esc(x.pergunta)}</td><td class="num">${u.inteiro(x.casos)}</td><td class="num">${x.valor ? u.moeda(x.valor) : '—'}</td></tr>`).join('')}</tbody></table>`;
    else if (p.tipo === 'amostra') corpo = `<p>Universo: ${u.inteiro(c.universo)} bens · amostra: ${u.inteiro((c.itens || []).length)} · semente: <b>${esc(c.semente)}</b> · método: ${esc(c.metodo)}</p><ul class="lista-simples">${(c.itens || []).map((i) => { const b = VP.db.pega('bens', i.bemId); return `<li>${esc(b ? `${b.plaqueta || b.codigo} · ${b.descricao}` : i.bemId)}: <b>${esc(RES_AMOSTRA[i.resultado] || 'não conferido')}</b>${i.obs ? ' · ' + esc(i.obs) : ''}</li>`; }).join('')}</ul>`;
    else if (p.tipo === 'questionario') corpo = `<ol>${(c.respostas || []).map((r) => `<li>${esc(r.pergunta)} <b>${esc({ sim: 'Sim', nao: 'Não', na: 'Não se aplica' }[r.resposta] || '—')}</b>${r.comentario ? ' · ' + esc(r.comentario) : ''}${r.evidencia ? ` · <a href="${esc(r.evidencia)}" target="_blank" rel="noopener">evidência</a>` : ''}</li>`).join('')}</ol>`;
    else if (p.tipo === 'plano') corpo = `<dl class="dados">${Object.entries(c).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    else corpo = `<p style="white-space:pre-wrap">${esc(c.texto || '')}</p>`;
    const ev = (p.evidencias || []).map((e) => `<li>${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.titulo)}</a>` : esc(e.titulo)}${e.sha256 ? ` <span class="ajuda">SHA-256 ${esc(e.sha256)}</span>` : ''}</li>`).join('');
    return `<p class="ajuda">${esc(p.ref)} · feito por ${esc(p.feitoPor)} em ${new Date(p.feitoEm).toLocaleString('pt-BR')}${p.revisadoEm ? ` · revisado por ${esc(p.revisadoPor)} em ${new Date(p.revisadoEm).toLocaleString('pt-BR')}` : ' · sem revisão'}</p>${corpo}${ev ? `<h4>Evidências</h4><ul class="lista-simples">${ev}</ul>` : ''}`;
  };
  const verPapel = (p) => ui.modal({ titulo: `${p.ref} · ${p.titulo}`, largura: 'grande', corpo: htmlPapel(p), botoes: [{ texto: 'Fechar' }] });

  // ---- amostra
  const RES_AMOSTRA = { ok: 'Encontrado, confere', divergencia: 'Encontrado com divergência', nao: 'Não encontrado' };
  const procAmostra = (aud, pode) => {
    const amostras = papeisDe(aud.id).filter((p) => p.tipo === 'amostra');
    const unidades = VP.db.lista('unidades').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return {
      html: `<p class="ajuda">Amostragem (NBC TA 530): sorteio dos bens a conferir no local. O número da <b>semente</b> fica guardado: com a mesma semente, qualquer auditor refaz exatamente o mesmo sorteio.</p>
        ${pode ? '<div class="linha-botoes"><button class="botao primario" data-nova-amostra>Sortear amostra</button></div>' : ''}
        ${amostras.map((p) => { const c = p.conteudo; const conf = c.itens.filter((i) => i.resultado).length; return `<section class="cartao secao"><header><h3>${esc(p.ref)} · ${esc(p.titulo)}</h3></header>
          <p>Semente <b>${esc(c.semente)}</b> · ${esc(c.metodo)} · universo ${u.inteiro(c.universo)} · conferidos ${u.inteiro(conf)} de ${u.inteiro(c.itens.length)} · não encontrados <b>${u.inteiro(c.itens.filter((i) => i.resultado === 'nao').length)}</b></p>
          <div class="tabela-rolagem"><table class="tabela tabela-painel"><thead><tr><th>Bem</th><th>Unidade</th><th>Resultado</th><th>Observação</th></tr></thead><tbody>
          ${c.itens.map((i, k) => { const b = VP.db.pega('bens', i.bemId); return `<tr><td>${b ? `<a href="#bem/${esc(b.id)}">${esc(b.plaqueta || b.codigo)} · ${esc(b.descricao)}</a>` : esc(i.bemId)}</td><td>${esc(VP.nome('unidades', b?.unidadeId))}</td>
            <td>${pode && !p.revisadoEm ? `<select data-amostra="${esc(p.id)}" data-item="${k}"><option value="">—</option>${Object.entries(RES_AMOSTRA).map(([kk, t]) => `<option value="${kk}" ${i.resultado === kk ? 'selected' : ''}>${t}</option>`).join('')}</select>` : esc(RES_AMOSTRA[i.resultado] || '—')}</td>
            <td>${pode && !p.revisadoEm ? `<input data-amostra-obs="${esc(p.id)}" data-item="${k}" value="${esc(i.obs || '')}" size="18">` : esc(i.obs || '')}</td></tr>`; }).join('')}</tbody></table></div>
          ${pode && !p.revisadoEm ? `<div class="linha-botoes"><button class="botao" data-salvar-amostra="${esc(p.id)}">Salvar conferência</button></div>` : ''}</section>`; }).join('') || '<p class="ajuda">Nenhuma amostra ainda.</p>'}`,
      ligar() {
        document.querySelector('[data-nova-amostra]')?.addEventListener('click', () => ui.formulario({
          titulo: 'Sortear amostra', largura: 'media',
          valores: { tamanho: 30, metodo: 'simples', semente: String(Math.floor(Math.random() * 900000) + 100000) },
          campos: [{ chave: 'unidadeId', rotulo: 'Só bens da unidade (vazio = todas)', tipo: 'select', opcoes: unidades.map((x) => [x.id, x.nome]), vazio: 'Todas' },
            { chave: 'tipo', rotulo: 'Tipo de bem', tipo: 'select', opcoes: Object.entries(L.tiposBem), vazio: 'Todos' },
            { chave: 'tamanho', rotulo: 'Quantos bens', tipo: 'numero', obrigatorio: true, largura: 'meia' },
            { chave: 'metodo', rotulo: 'Método', tipo: 'select', vazio: false, opcoes: [['simples', 'Aleatória simples'], ['valor', 'Os de maior valor (metade) + aleatória (metade)']], largura: 'meia' },
            { chave: 'semente', rotulo: 'Semente (número do sorteio)', obrigatorio: true, largura: 'meia', ajuda: 'Guarde este número: com ele o sorteio se repete igual.' }],
          salvar: async (v) => {
            let uni = ativos().filter((b) => (!v.unidadeId || b.unidadeId === v.unidadeId) && (!v.tipo || b.tipo === v.tipo));
            const n = Math.max(1, Math.min(Number(v.tamanho) || 0, uni.length));
            if (!uni.length) return 'Nenhum bem neste filtro.';
            const sem = Number(String(v.semente).replace(/\D/g, '')) || 1;
            let escolhidos;
            if (v.metodo === 'valor') { const maiores = uni.slice().sort((a, b) => liquido(b) - liquido(a)).slice(0, Math.ceil(n / 2)); const resto = uni.filter((b) => !maiores.includes(b)); escolhidos = maiores.concat(AU.sortear(resto, n - maiores.length, sem)); }
            else escolhidos = AU.sortear(uni, n, sem);
            const p = novoPapel(aud, 'C', { tipo: 'amostra', titulo: `Amostra de ${escolhidos.length} bem(ns)${v.unidadeId ? ' · ' + VP.nome('unidades', v.unidadeId) : ''}`, conteudo: { semente: String(sem), metodo: v.metodo === 'valor' ? 'maiores valores + aleatória' : 'aleatória simples', universo: uni.length, filtro: { unidadeId: v.unidadeId || '', tipo: v.tipo || '' }, itens: escolhidos.map((b) => ({ bemId: b.id, resultado: '', obs: '' })) } });
            await VP.db.gravar('papeisTrabalho', p); ui.aviso(`Amostra ${p.ref} sorteada (semente ${sem}).`); VP.app.render();
          }
        }));
        document.querySelectorAll('[data-salvar-amostra]').forEach((b) => b.addEventListener('click', async () => {
          const p = VP.db.pega('papeisTrabalho', b.dataset.salvarAmostra);
          document.querySelectorAll(`[data-amostra="${p.id}"]`).forEach((s) => { p.conteudo.itens[+s.dataset.item].resultado = s.value; });
          document.querySelectorAll(`[data-amostra-obs="${p.id}"]`).forEach((s) => { p.conteudo.itens[+s.dataset.item].obs = s.value; });
          p.alteradoPor = usuario(); p.alteradoEm = agora();
          await VP.db.gravar('papeisTrabalho', p); ui.aviso('Conferência salva.'); VP.app.render();
        }));
      }
    };
  };

  // ---- questionários
  const procQuestionarios = (aud, pode) => {
    const ps = papeisDe(aud.id).filter((p) => p.tipo === 'questionario');
    return {
      html: `<p class="ajuda">Questionários dos programas de auditoria (itens 7.8 e 8). Onde o sistema tem um teste ligado, a resposta vem sugerida com o número encontrado; a pessoa confirma e anexa a evidência.</p>
        <div class="tabela-rolagem"><table class="tabela tabela-painel"><thead><tr><th>Questionário</th><th>Perguntas</th><th>Respondido</th><th></th></tr></thead><tbody>
        ${QUESTIONARIOS.map((qq) => { const p = ps.find((x) => x.conteudo?.cod === qq.cod); return `<tr><td>${esc(qq.cod)} · ${esc(qq.titulo)}</td><td>${qq.perguntas.length}</td><td>${p ? `${esc(p.ref)} · ${esc(p.feitoPor)}${p.revisadoEm ? ' · revisado' : ''}` : '<span class="ajuda">não</span>'}</td><td>${pode && !(p && p.revisadoEm) ? `<button class="botao pequeno" data-questionario="${esc(qq.cod)}">${p ? 'Continuar' : 'Responder'}</button>` : p ? `<a href="#" data-ver-q="${esc(p.id)}">Ver</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`,
      ligar() {
        document.querySelectorAll('[data-ver-q]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); verPapel(VP.db.pega('papeisTrabalho', a.dataset.verQ)); }));
        document.querySelectorAll('[data-questionario]').forEach((b) => b.addEventListener('click', () => {
          const qq = QUESTIONARIOS.find((x) => x.cod === b.dataset.questionario);
          const existente = ps.find((x) => x.conteudo?.cod === qq.cod);
          if (!AU.ultimo) AU.rodar();
          const ant = existente?.conteudo?.respostas || [];
          const campos = []; const valores = {};
          qq.perguntas.forEach(([perg, cod], i) => {
            const r = cod ? resultadoDe(cod) : null;
            const dica = r ? `Sistema (${cod}): ${r.casos.length ? `${u.inteiro(r.casos.length)} caso(s) encontrado(s)` : 'nenhum caso encontrado'}.` : 'Sem teste automático: responda com base na verificação.';
            campos.push({ chave: `r${i}`, rotulo: `${i + 1}. ${perg}`, tipo: 'select', opcoes: [['sim', 'Sim'], ['nao', 'Não'], ['na', 'Não se aplica']], vazio: '—', ajuda: dica, largura: 'meia' });
            campos.push({ chave: `c${i}`, rotulo: 'Comentário / evidência (link https://)', largura: 'meia' });
            valores[`r${i}`] = ant[i]?.resposta || ''; valores[`c${i}`] = [ant[i]?.comentario, ant[i]?.evidencia].filter(Boolean).join(' ');
          });
          ui.formulario({ titulo: `${qq.cod} · ${qq.titulo}`, largura: 'grande', campos, valores,
            salvar: async (v) => {
              const respostas = qq.perguntas.map(([perg, cod], i) => { const txt = v[`c${i}`] || ''; const lk = (txt.match(/https?:\/\/\S+/) || [''])[0]; return { pergunta: perg, teste: cod, resposta: v[`r${i}`] || '', comentario: txt.replace(lk, '').trim(), evidencia: lk, casos: cod ? resultadoDe(cod)?.casos.length ?? null : null }; });
              const p = existente || novoPapel(aud, 'D', { tipo: 'questionario', titulo: `Questionário ${qq.cod} · ${qq.titulo}` });
              p.conteudo = { cod: qq.cod, respostas }; if (existente) { p.alteradoPor = usuario(); p.alteradoEm = agora(); }
              await VP.db.gravar('papeisTrabalho', p); ui.aviso(`Questionário salvo (${p.ref}).`); VP.app.render();
            } });
        }));
      }
    };
  };

  // ---- achados e recomendações
  const procAchados = (aud, pode) => {
    const as = achadosDe(aud.id).sort((a, b) => a.numero - b.numero);
    const rs = recsDe(aud.id);
    return {
      html: `${pode ? '<div class="linha-botoes"><button class="botao primario" data-novo-achado>Novo achado</button> <a class="botao" href="#auditoria/testes">Achado a partir de um teste</a></div>' : ''}
        ${as.map((a) => `<section class="cartao secao"><header><h3>Achado ${a.numero} · ${esc(a.titulo)} ${selo(a.gravidade)}</h3>${pode ? `<span class="linha-botoes"><button class="botao pequeno" data-manifestacao="${esc(a.id)}">Resposta do gestor</button> <button class="botao pequeno" data-nova-rec="${esc(a.id)}">+ Recomendação</button> ${botaoLixeira('achadosAuditoria', a)}</span>` : ''}</header>
          <dl class="dados"><dt>Situação</dt><dd>${esc(a.situacao)}</dd><dt>Critério</dt><dd>${esc(a.criterio)}</dd><dt>Causa</dt><dd>${esc(a.causa) || '—'}</dd><dt>Efeito</dt><dd>${esc(a.efeito) || '—'}</dd><dt>Valor</dt><dd>${a.valor ? u.moeda(a.valor) : '—'}</dd>${a.testeCod ? `<dt>Teste</dt><dd><a href="#auditoria/testes?t=${esc(a.testeCod)}">${esc(a.testeCod)}</a> · ${u.inteiro((a.casosIds || []).length)} caso(s) guardados</dd>` : ''}<dt>Resposta do gestor</dt><dd>${esc(a.manifestacao) || '<span class="vazio">aguardando</span>'}</dd></dl>
          <h4>Recomendações</h4>${rs.filter((r) => r.achadoId === a.id).map((r) => `<p>• ${esc(r.texto)} — <b>${esc(r.responsavel)}</b>, prazo ${u.data(r.prazo)} · ${esc(SITUACOES_REC[r.situacao])} ${pode && r.situacao === 'aberta' ? botaoLixeira('recomendacoesAuditoria', r) : ''}</p>`).join('') || '<p class="ajuda">Nenhuma.</p>'}</section>`).join('') || '<p class="ajuda">Nenhum achado. Crie a partir de um teste automático ou em branco.</p>'}`,
      ligar() {
        document.querySelector('[data-novo-achado]')?.addEventListener('click', () => novoAchado({ auditoriaId: aud.id }));
        ligarLixeira();
        document.querySelectorAll('[data-manifestacao]').forEach((b) => b.addEventListener('click', () => { const a = VP.db.pega('achadosAuditoria', b.dataset.manifestacao); ui.formulario({ titulo: `Resposta do gestor · Achado ${a.numero}`, largura: 'media', valores: a, campos: [{ chave: 'manifestacao', rotulo: 'O que o gestor responsável disse (contraditório)', tipo: 'area', obrigatorio: true }], salvar: async (v) => { a.manifestacao = v.manifestacao; a.manifestacaoEm = agora(); a.manifestacaoRegistradaPor = usuario(); await VP.db.gravar('achadosAuditoria', a); ui.aviso('Resposta registrada.'); VP.app.render(); } }); }));
        document.querySelectorAll('[data-nova-rec]').forEach((b) => b.addEventListener('click', () => { const a = VP.db.pega('achadosAuditoria', b.dataset.novaRec); ui.formulario({ titulo: `Recomendação · Achado ${a.numero}`, largura: 'media', valores: { prazo: u.somaDias(hoje(), 90) }, campos: [{ chave: 'texto', rotulo: 'Recomendação (o que fazer)', tipo: 'area', obrigatorio: true }, { chave: 'responsavel', rotulo: 'Responsável (setor ou cargo)', obrigatorio: true, largura: 'meia' }, { chave: 'prazo', rotulo: 'Prazo', tipo: 'data', obrigatorio: true, largura: 'meia' }], salvar: async (v) => { await VP.db.gravar('recomendacoesAuditoria', { id: u.id(), auditoriaId: aud.id, achadoId: a.id, texto: v.texto, responsavel: v.responsavel, prazo: v.prazo, situacao: 'aberta', historico: [{ em: agora(), por: usuario(), situacao: 'aberta', nota: 'Recomendação emitida' }], criadoPor: usuario(), criadoEm: agora() }); ui.aviso('Recomendação registrada.'); VP.app.render(); } }); }));
      }
    };
  };

  // ---- parecer e relatório
  const preencher = (txt, aud) => txt.replace('{entidade}', VP.config().entidade || VP.nome('entidades', VP.db.lista('entidades')[0]?.id) || 'o Município').replace('{de}', u.data(aud.periodoDe)).replace('{ate}', u.data(aud.periodoAte)).replace('{achados}', achadosDe(aud.id).map((a) => a.numero).join(', ') || '(informar)');
  const procParecer = (aud, pode) => ({
    html: `<p class="ajuda">Tipos de parecer: sem ressalva, com ressalva, adverso ou abstenção. O texto vem de um modelo; o texto final e a decisão são de quem assina.</p>
      ${aud.parecer ? `<section class="cartao secao"><header><h3>Parecer: ${esc(PARECERES[aud.parecer.tipo][0])}</h3></header><p style="white-space:pre-wrap">${esc(aud.parecer.texto)}</p><p class="ajuda">Emitido por ${esc(aud.parecer.por)} em ${new Date(aud.parecer.em).toLocaleString('pt-BR')}</p></section>` : ''}
      <div class="linha-botoes">${pode ? `<button class="botao primario" data-parecer>${aud.parecer ? 'Alterar parecer' : 'Emitir parecer'}</button> ` : ''}<button class="botao" data-relatorio>Imprimir relatório / PDF</button></div>`,
    ligar() {
      document.querySelector('[data-parecer]')?.addEventListener('click', () => {
        const tipo0 = aud.parecer?.tipo || (achadosDe(aud.id).some((a) => a.gravidade === 'alta') ? 'com_ressalva' : 'sem_ressalva');
        ui.formulario({ titulo: 'Parecer', largura: 'media', valores: { tipo: tipo0, texto: aud.parecer?.texto || preencher(PARECERES[tipo0][1], aud) },
          campos: [{ chave: 'tipo', rotulo: 'Tipo de parecer', tipo: 'select', vazio: false, opcoes: Object.entries(PARECERES).map(([k, x]) => [k, x[0]]), ajuda: 'Ao trocar o tipo, o texto modelo muda (se você ainda não escreveu outro).' }, { chave: 'texto', rotulo: 'Texto do parecer', tipo: 'area', obrigatorio: true }],
          salvar: async (v) => { aud.parecer = { tipo: v.tipo, texto: v.texto, por: usuario(), em: agora() }; await VP.db.gravar('auditorias', aud); ui.aviso('Parecer registrado.'); VP.app.render(); } });
        const sel = document.querySelector('dialog[open] select'), area = document.querySelector('dialog[open] textarea');
        sel?.addEventListener('change', () => { if (Object.values(PARECERES).some(([, t]) => preencher(t, aud) === area.value)) area.value = preencher(PARECERES[sel.value][1], aud); });
      });
      document.querySelector('[data-relatorio]').addEventListener('click', () => ui.imprimir(AU.relatorioHtml(aud), `Relatório ${aud.codigo}`));
    }
  });
  AU.relatorioHtml = (aud) => {
    const as = achadosDe(aud.id).sort((a, b) => a.numero - b.numero), rs = recsDe(aud.id), ps = papeisDe(aud.id);
    const testes = ps.filter((p) => p.tipo === 'testes').pop();
    const amostras = ps.filter((p) => p.tipo === 'amostra');
    return `<h1>Relatório de auditoria ${esc(aud.codigo)}</h1><h2>${esc(aud.titulo)}</h2>
      <p>Período: ${u.data(aud.periodoDe)} a ${u.data(aud.periodoAte)} · Tipo: ${esc(aud.tipo)} · Emitido em ${u.data(hoje())}</p>
      <h3>1. Introdução</h3><p><b>Objetivo:</b> ${esc(aud.objetivo || '—')}</p><p><b>Escopo:</b> ${esc(aud.escopo || '—')}</p><p><b>Critérios:</b> ${esc(aud.criterios || '—')}</p><p><b>Equipe:</b> ${esc(aud.equipe || '—')}</p>
      <p><b>Metodologia:</b> testes automáticos sobre 100% dos registros do sistema${amostras.length ? `, inspeção física por amostra (${amostras.map((p) => `${p.ref}: ${p.conteudo.itens.length} bens, semente ${p.conteudo.semente}`).join('; ')})` : ''}, questionários de controle interno e exame documental. Materialidade: ${aud.materialidadePct || 0}% do imobilizado.</p>
      ${aud.linha === 'autoavaliacao' ? '<p><b>Limitação:</b> autoavaliação feita pelo setor que executa o controle; não é auditoria independente.</p>' : ''}
      ${testes ? `<h3>2. Resultado dos testes automáticos (${esc(testes.ref)})</h3><table border="1" cellspacing="0" cellpadding="4"><tr><th>Teste</th><th>Casos</th><th>Valor</th></tr>${testes.conteudo.resultados.filter((x) => x.casos).map((x) => `<tr><td>${esc(x.cod)} · ${esc(x.pergunta)}</td><td>${u.inteiro(x.casos)}</td><td>${x.valor ? u.moeda(x.valor) : '—'}</td></tr>`).join('') || '<tr><td colspan="3">Nenhum caso.</td></tr>'}</table>` : ''}
      <h3>3. Achados</h3>${as.map((a) => `<h4>Achado ${a.numero} · ${esc(a.titulo)} (gravidade ${esc(a.gravidade)})</h4><p><b>Situação:</b> ${esc(a.situacao)}</p><p><b>Critério:</b> ${esc(a.criterio)}</p><p><b>Causa:</b> ${esc(a.causa || '—')}</p><p><b>Efeito:</b> ${esc(a.efeito || '—')}</p><p><b>Resposta do gestor:</b> ${esc(a.manifestacao || 'não apresentada')}</p><p><b>Recomendações:</b></p><ul>${rs.filter((r) => r.achadoId === a.id).map((r) => `<li>${esc(r.texto)} — ${esc(r.responsavel)}, prazo ${u.data(r.prazo)}</li>`).join('') || '<li>—</li>'}</ul>`).join('') || '<p>Nenhum achado.</p>'}
      <h3>4. Parecer</h3>${aud.parecer ? `<p><b>${esc(PARECERES[aud.parecer.tipo][0])}.</b> ${esc(aud.parecer.texto)}</p>` : '<p>(parecer ainda não emitido)</p>'}
      <h3>5. Papéis de trabalho</h3><ul>${ps.map((p) => `<li>${esc(p.ref)} · ${esc(p.titulo)} — feito por ${esc(p.feitoPor)}${p.revisadoEm ? `, revisado por ${esc(p.revisadoPor)}` : ', sem revisão'}</li>`).join('')}</ul>
      <p style="margin-top:40px">______________________________<br>${esc(aud.parecer?.por || '')}</p>`;
  };

  // ------------------------------------------------------------------ recomendações (acompanhamento)
  const telaRecomendacoes = (q) => {
    let l = VP.db.lista('recomendacoesAuditoria');
    if (q.vencidas) l = l.filter((r) => ['aberta', 'andamento'].includes(r.situacao) && r.prazo < hoje());
    const pode = AU.pode();
    return {
      html: `<p class="ajuda">Monitoramento: cada recomendação fica aberta até ser implementada; o histórico de andamento não se apaga. ${q.vencidas ? '<a href="#auditoria/recomendacoes">Ver todas</a>' : '<a href="#auditoria/recomendacoes?vencidas=1">Só as vencidas</a>'}</p>
        ${ui.tabela({ id: 'aud-recs', linhas: l, nomePlanilha: 'recomendacoes-auditoria', vazio: 'Nenhuma recomendação.', colunas: [
          { chave: 'aud', titulo: 'Auditoria', html: (r) => { const a = pegaAud(r.auditoriaId); return a ? `<a href="#auditoria-processo/${esc(a.id)}?aba=achados">${esc(a.codigo)}</a>` : ''; }, valor: (r) => pegaAud(r.auditoriaId)?.codigo },
          { chave: 'texto', titulo: 'Recomendação' }, { chave: 'responsavel', titulo: 'Responsável' },
          { chave: 'prazo', titulo: 'Prazo', valor: (r) => u.data(r.prazo), ordenar: (r) => r.prazo, html: (r) => `${u.data(r.prazo)}${['aberta', 'andamento'].includes(r.situacao) && r.prazo < hoje() ? ' <span class="selo-alerta">vencida</span>' : ''}` },
          { chave: 'situacao', titulo: 'Situação', valor: (r) => SITUACOES_REC[r.situacao] },
          { chave: 'a', titulo: '', html: (r) => (pode && ['aberta', 'andamento'].includes(r.situacao) ? `<button class="botao pequeno" data-andamento="${esc(r.id)}">Andamento</button>` : '') }] })}`,
      ligar() {
        ui.ligarTabela('aud-recs');
        document.getElementById('conteudo').addEventListener('click', (e) => {
          const b = e.target.closest('[data-andamento]'); if (!b) return;
          const r = VP.db.pega('recomendacoesAuditoria', b.dataset.andamento);
          ui.formulario({ titulo: 'Andamento da recomendação', largura: 'media', valores: { situacao: r.situacao },
            campos: [{ chave: 'situacao', rotulo: 'Situação', tipo: 'select', vazio: false, opcoes: Object.entries(SITUACOES_REC) }, { chave: 'nota', rotulo: 'O que foi feito (evidência)', tipo: 'area', obrigatorio: true }, { chave: 'prazo', rotulo: 'Novo prazo (se mudou)', tipo: 'data' }],
            salvar: async (v) => { r.situacao = v.situacao; if (v.prazo) r.prazo = v.prazo; r.historico = (r.historico || []).concat({ em: agora(), por: usuario(), situacao: v.situacao, nota: v.nota, prazo: v.prazo || '' }); await VP.db.gravar('recomendacoesAuditoria', r); ui.aviso('Andamento registrado.'); VP.app.render(); } });
        });
      }
    };
  };

  // ------------------------------------------------------------------ conciliação patrimônio × contabilidade (balancete do SIAFIC)
  const fimDoMes = (mes) => u.somaDias(`${u.somaMeses(mes, 1)}-01`, -1);
  AU.saldoPorConta = (mes) => {
    const fim = fimDoMes(mes);
    const m = new Map();
    const soma = (contaId, k, v) => { if (!contaId) return; const c = VP.db.pega('contas', contaId); const cod = c?.codigo || contaId; const x = m.get(cod) || { conta: cod, nome: c?.nome || '', bruto: 0, depreciacao: 0 }; x[k] += v; m.set(cod, x); };
    for (const b of VP.db.lista('bens')) {
      if (VP.eventosDoBem(b.id).some((e) => e.tipo === 'baixa' && !e.cancelado && e.data <= fim)) continue;
      if ((b.dataIncorporacao || '') > fim) continue;
      let s; try { s = VP.saldo(b, fim); } catch (_) { continue; }
      soma(b.contaId, 'bruto', s.base || 0);
      const dc = VP.dadosDaClassificacao(b.classificacaoId)?.contaDepreciacaoId;
      if (dc && s.acumulada) soma(dc, 'depreciacao', s.acumulada);
    }
    return m;
  };
  const telaConciliacao = () => {
    const cs = VP.db.lista('conciliacoesSiafic').sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
    const c = cs[0];
    return {
      html: `<p class="ajuda">Compara o patrimônio com o balancete da contabilidade (SIAFIC), conta a conta, no fim do mês (Lei 4.320/1964, arts. 95 e 96). Envie a planilha do balancete com as colunas <b>Conta</b> e <b>Saldo</b> (pode ter <b>Descrição</b>). Contas de bens comparam o valor bruto; contas de depreciação acumulada comparam a depreciação. O sistema não faz lançamento contábil: a diferença vira apontamento para a contabilidade.</p>
        ${AU.pode() ? `<div class="painel-filtros"><label>Mês <input type="month" data-mes-conc value="${u.somaMeses(hoje().slice(0, 7), -1)}"></label><label class="botao">Enviar balancete (.xlsx ou .csv)<input type="file" accept=".xlsx,.csv" data-arquivo-conc hidden></label></div>` : ''}
        ${c ? `<section class="cartao" id="conc-ultima"><h3>${esc(u.mesExtenso(c.mes))} · ${esc(c.arquivo)}</h3><p class="ajuda">Feita por ${esc(c.por)} em ${new Date(c.em).toLocaleString('pt-BR')} · ${u.inteiro(c.linhas.filter((l) => Math.abs(l.diferenca) >= 0.01).length)} conta(s) com diferença</p>
          ${ui.tabela({ id: 'conc-tab', linhas: c.linhas.map((l) => Object.assign({ id: l.conta }, l)), nomePlanilha: 'conciliacao-' + c.mes, colunas: [
            { chave: 'conta', titulo: 'Conta' }, { chave: 'nome', titulo: 'Descrição' }, { chave: 'tipo', titulo: 'Compara', valor: (l) => (l.tipo === 'depreciacao' ? 'Depreciação acumulada' : 'Valor bruto dos bens') },
            { chave: 'patrimonio', titulo: 'Patrimônio', num: true, html: (l) => u.moeda(l.patrimonio) }, { chave: 'contabilidade', titulo: 'Contabilidade', num: true, html: (l) => u.moeda(l.contabilidade) },
            { chave: 'diferenca', titulo: 'Diferença', num: true, html: (l) => (Math.abs(l.diferenca) >= 0.01 ? `<b>${u.moeda(l.diferenca)}</b>` : '<span class="selo-ok">confere</span>') }] })}</section>` : '<p class="ajuda">Nenhuma conciliação feita ainda.</p>'}
        ${cs.length > 1 ? `<h3>Anteriores</h3><ul class="lista-simples">${cs.slice(1).map((x) => `<li>${esc(u.mesExtenso(x.mes))} · ${esc(x.arquivo)} · ${u.inteiro(x.linhas.filter((l) => Math.abs(l.diferenca) >= 0.01).length)} diferença(s)</li>`).join('')}</ul>` : ''}`,
      ligar() {
        if (document.getElementById('tab-conc-tab')) ui.ligarTabela('conc-tab');
        document.querySelector('[data-arquivo-conc]')?.addEventListener('change', async (e) => {
          const f = e.target.files[0]; e.target.value = ''; if (!f) return;
          const mes = document.querySelector('[data-mes-conc]').value;
          if (!/^\d{4}-\d{2}$/.test(mes)) return ui.aviso('Escolha o mês.', 'erro');
          try { await AU.conciliar(f, mes); ui.aviso('Conciliação feita.'); VP.app.render(); } catch (err) { ui.aviso(err.message, 'erro'); }
        });
      }
    };
  };
  const numeroBR = (v) => { if (typeof v === 'number') return v; let t = String(v ?? '').trim().replace(/\s|R\$/g, '').replace(/[()]/g, '').replace(/[DC]$/i, ''); if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); const n = Number(t); return Number.isFinite(n) ? n : NaN; };
  AU.conciliar = async (arquivo, mes) => {
    const abas = await VP.lerArquivoPlanilha(arquivo);
    const aba = (abas || []).find((a) => (a.linhas || []).length) || abas?.[0];
    if (!aba) throw new Error('Arquivo vazio.');
    const linhas = [aba.cabecalho || aba.titulos].concat(aba.linhas || []).filter(Boolean);
    const iCab = linhas.findIndex((l) => l.some((c) => /^conta/i.test(String(c || '').trim())) && l.some((c) => /saldo/i.test(String(c || ''))));
    if (iCab < 0) throw new Error('Não achei as colunas "Conta" e "Saldo" no arquivo.');
    const cab = linhas[iCab].map((c) => String(c || '').trim().toLowerCase());
    const iConta = cab.findIndex((c) => /^conta/.test(c)), iSaldo = cab.findIndex((c) => /saldo/.test(c)), iNome = cab.findIndex((c) => /descri|nome|t[ií]tulo/.test(c));
    const cont = new Map();
    for (const l of linhas.slice(iCab + 1)) { const conta = String(l[iConta] ?? '').trim(); const v = numeroBR(l[iSaldo]); if (!conta || !Number.isFinite(v)) continue; cont.set(conta, { saldo: Math.abs(v), nome: iNome >= 0 ? String(l[iNome] || '') : '' }); }
    const pat = AU.saldoPorConta(mes);
    const contasDep = new Set(VP.db.lista('classificacoes').map((c) => VP.db.pega('contas', c.contaDepreciacaoId)?.codigo).filter(Boolean));
    const todas = new Set([...pat.keys()].concat([...cont.keys()].filter((k) => [...pat.keys()].some((p) => p === k))));
    const res = [...todas].map((conta) => { const p = pat.get(conta) || { bruto: 0, depreciacao: 0, nome: '' }; const ehDep = contasDep.has(conta); const vp = Math.round((ehDep ? p.depreciacao : p.bruto) * 100) / 100; const vc = Math.round((cont.get(conta)?.saldo || 0) * 100) / 100; return { conta, nome: p.nome || cont.get(conta)?.nome || '', tipo: ehDep ? 'depreciacao' : 'bruto', patrimonio: vp, contabilidade: vc, diferenca: Math.round((vp - vc) * 100) / 100, naoAchouNaContabilidade: !cont.has(conta) }; }).sort((a, b) => a.conta.localeCompare(b.conta, 'pt-BR', { numeric: true }));
    const doc = { id: u.id(), mes, arquivo: arquivo.name, em: agora(), por: usuario(), linhas: res, sha256: await sha256(new Uint8Array(await arquivo.arrayBuffer())) };
    await VP.db.gravar('conciliacoesSiafic', doc);
    return doc;
  };

  // ------------------------------------------------------------------ ocorrências de segurança patrimonial (item 8)
  const TIPOS_OCOR = ['Furto', 'Roubo', 'Dano / vandalismo', 'Incêndio', 'Alagamento / sinistro', 'Invasão de imóvel', 'Extravio', 'Outro'];
  const telaOcorrencias = () => {
    const l = VP.db.lista('ocorrenciasSeguranca').sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const pode = !VP.servidor?.ativo || VP.servidor.podeAlterar();
    return {
      html: `<p class="ajuda">Segurança patrimonial: registre furtos, danos, sinistros e invasões, com o boletim de ocorrência ou o laudo. Se o bem se perdeu, a baixa é feita na ficha do bem (tipo "Furto / roubo" ou "Sinistro"), com o mesmo documento.</p>
        ${pode ? '<div class="linha-botoes"><button class="botao primario" data-nova-ocor>Registrar ocorrência</button></div>' : ''}
        ${ui.tabela({ id: 'aud-ocor', linhas: l, nomePlanilha: 'ocorrencias-seguranca', vazio: 'Nenhuma ocorrência registrada.', colunas: [
          { chave: 'data', titulo: 'Data', valor: (o) => u.data(o.data), ordenar: (o) => o.data }, { chave: 'tipo', titulo: 'Tipo' },
          { chave: 'local', titulo: 'Unidade / local', valor: (o) => VP.nome('unidades', o.unidadeId) || o.local },
          { chave: 'bens', titulo: 'Bens', valor: (o) => (o.bens || []).length },
          { chave: 'documento', titulo: 'BO / laudo', html: (o) => (o.documento ? esc(o.documento) : '<span class="selo-alerta">falta</span>'), valor: (o) => o.documento },
          { chave: 'situacao', titulo: 'Situação', valor: (o) => (o.situacao === 'encerrada' ? 'Encerrada' : 'Em apuração') },
          { chave: 'a', titulo: '', html: (o) => (pode && o.situacao !== 'encerrada' ? `<button class="botao pequeno" data-editar-ocor="${esc(o.id)}">Atualizar</button> ${botaoLixeira('ocorrenciasSeguranca', o)}` : '') }] })}`,
      ligar() {
        ui.ligarTabela('aud-ocor'); ligarLixeira();
        const form = (o) => ui.formulario({ titulo: o ? 'Atualizar ocorrência' : 'Registrar ocorrência', largura: 'media', valores: o ? Object.assign({}, o, { plaquetas: (o.bens || []).map((id) => VP.db.pega('bens', id)?.plaqueta).filter(Boolean).join(', ') }) : { data: hoje() },
          campos: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'select', vazio: false, opcoes: TIPOS_OCOR.map((t) => [t, t]), largura: 'meia' }, { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, largura: 'meia' },
            { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: VP.db.lista('unidades').map((x) => [x.id, x.nome]), largura: 'meia' }, { chave: 'local', rotulo: 'Local (se não for uma unidade)', largura: 'meia' },
            { chave: 'plaquetas', rotulo: 'Bens envolvidos (plaquetas, separadas por vírgula)' }, { chave: 'descricao', rotulo: 'O que aconteceu', tipo: 'area', obrigatorio: true },
            { chave: 'documento', rotulo: 'Boletim de ocorrência / laudo (número)', largura: 'meia' }, { chave: 'link', rotulo: 'Link do documento (https://)', largura: 'meia' },
            { chave: 'providencia', rotulo: 'Providências (sindicância, conserto, baixa, seguro)', tipo: 'area' }, { chave: 'encerrar', rotulo: 'Encerrar a ocorrência (apuração concluída)', tipo: 'bool' }],
          salvar: async (v) => {
            if (v.link && !somenteLink(v.link)) return 'O link precisa começar com https://';
            const pls = String(v.plaquetas || '').split(/[,;\s]+/).filter(Boolean);
            const bens = pls.map((pl) => VP.db.lista('bens').find((b) => norm(b.plaqueta) === norm(pl))?.id).filter(Boolean);
            if (pls.length !== bens.length) return 'Alguma plaqueta não foi encontrada.';
            const doc = Object.assign(o || { id: u.id(), criadoPor: usuario(), criadoEm: agora(), historico: [] }, { tipo: v.tipo, data: v.data, unidadeId: v.unidadeId || '', local: v.local || '', bens, descricao: v.descricao, documento: v.documento || '', link: somenteLink(v.link), providencia: v.providencia || '', situacao: v.encerrar ? 'encerrada' : 'apuracao' });
            doc.historico = (doc.historico || []).concat({ em: agora(), por: usuario(), situacao: doc.situacao });
            await VP.db.gravar('ocorrenciasSeguranca', doc); ui.aviso('Ocorrência salva.'); VP.app.render();
          } });
        document.querySelector('[data-nova-ocor]')?.addEventListener('click', () => form());
        document.querySelectorAll('[data-editar-ocor]').forEach((b) => b.addEventListener('click', () => form(VP.db.pega('ocorrenciasSeguranca', b.dataset.editarOcor))));
      }
    };
  };

  // ------------------------------------------------------------------ pacote para órgãos de controle (.zip com índice SHA-256)
  const csv = (cab, linhas) => '﻿' + [cab].concat(linhas).map((l) => l.map((x) => { const t = String(x ?? ''); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(';')).join('\r\n');
  AU.montarPacote = async (aud) => {
    const r = AU.rodar();
    const ent = VP.config().entidade || VP.nome('entidades', VP.db.lista('entidades')[0]?.id) || '';
    const arq = [];
    const bens = VP.db.lista('bens');
    arq.push({ nome: 'bens.csv', dados: csv(['Código', 'Plaqueta', 'Descrição', 'Tipo', 'Situação', 'Estado', 'Unidade', 'Responsável', 'Conta', 'Como entrou', 'Data de incorporação', 'Valor base', 'Depreciação acumulada', 'Valor líquido', 'Matrícula'],
      bens.map((b) => { let s = {}; try { s = VP.saldo(b); } catch (_) { /* sem saldo */ } return [b.codigo, b.plaqueta, b.descricao, L.tiposBem[b.tipo] || b.tipo, L.status[b.status] || b.status, L.estados[b.estado] || '', VP.nome('unidades', b.unidadeId), VP.nome('responsaveis', b.responsavelId), VP.db.pega('contas', b.contaId)?.codigo || '', b.situacaoAquisicao || '', b.dataIncorporacao || '', s.base ?? '', s.acumulada ?? '', s.liquido ?? '', b.imovel?.matricula || '']; })) });
    const evs = VP.db.lista('eventos').filter((e) => !aud || (e.data >= aud.periodoDe && e.data <= aud.periodoAte));
    arq.push({ nome: 'movimentacoes.csv', dados: csv(['Data', 'Plaqueta', 'Tipo', 'Descrição', 'Valor', 'Cancelado', 'Usuário'], evs.map((e) => [e.data, VP.db.pega('bens', e.bemId)?.plaqueta || e.bemId, L.eventos[e.tipo]?.nome || e.tipo, e.descricao || '', e.valor ?? '', e.cancelado ? 'sim' : '', e.usuario || ''])) });
    arq.push({ nome: 'inventarios.csv', dados: csv(['Inventário', 'Data de corte', 'Situação', 'Bens esperados', 'Bens lidos', 'Comissão'], VP.db.lista('inventarios').map((i) => [i.nome, i.dataCorte, i.situacao, Object.keys(i.esperados || {}).length, Object.keys(i.leituras || {}).length, VP.nome('comissoes', i.comissaoId)])) });
    arq.push({ nome: 'testes-automaticos.csv', dados: csv(['Código', 'Área', 'Pergunta', 'Critério', 'Casos', 'Valor'], r.resultados.map((x) => [x.cod, x.area, x.pergunta, x.criterio, x.casos.length, x.valor])) });
    arq.push({ nome: 'casos-dos-testes.csv', dados: csv(['Teste', 'Caso', 'Detalhe', 'Valor'], r.resultados.flatMap((x) => x.casos.map((c) => [x.cod, c.rotulo, c.detalhe || '', c.valor ?? '']))) });
    arq.push({ nome: 'conciliacoes.csv', dados: csv(['Mês', 'Arquivo', 'Conta', 'Patrimônio', 'Contabilidade', 'Diferença'], VP.db.lista('conciliacoesSiafic').flatMap((c) => c.linhas.map((l) => [c.mes, c.arquivo, l.conta, l.patrimonio, l.contabilidade, l.diferenca]))) });
    arq.push({ nome: 'ocorrencias-seguranca.csv', dados: csv(['Data', 'Tipo', 'Local', 'Bens', 'Documento', 'Situação'], VP.db.lista('ocorrenciasSeguranca').map((o) => [o.data, o.tipo, VP.nome('unidades', o.unidadeId) || o.local, (o.bens || []).map((id) => VP.db.pega('bens', id)?.plaqueta).join(' '), o.documento, o.situacao])) });
    if (aud) {
      arq.push({ nome: 'achados.csv', dados: csv(['Nº', 'Título', 'Gravidade', 'Situação', 'Critério', 'Causa', 'Efeito', 'Valor', 'Resposta do gestor'], achadosDe(aud.id).map((a) => [a.numero, a.titulo, a.gravidade, a.situacao, a.criterio, a.causa, a.efeito, a.valor, a.manifestacao])) });
      arq.push({ nome: 'recomendacoes.csv', dados: csv(['Recomendação', 'Responsável', 'Prazo', 'Situação', 'Histórico'], recsDe(aud.id).map((x) => [x.texto, x.responsavel, x.prazo, SITUACOES_REC[x.situacao], (x.historico || []).map((h) => `${h.em} ${h.por}: ${h.situacao} ${h.nota || ''}`).join(' | ')])) });
      arq.push({ nome: 'papeis-de-trabalho.json', dados: JSON.stringify({ auditoria: aud, papeis: papeisDe(aud.id) }, null, 2) });
      arq.push({ nome: 'relatorio.html', dados: `<!doctype html><meta charset="utf-8"><title>Relatório ${esc(aud.codigo)}</title>${AU.relatorioHtml(aud)}` });
    }
    if (VP.servidor?.ativo && VP.servidor.trilhaPeriodo) {
      try { const t = await VP.servidor.trilhaPeriodo(aud?.periodoDe, aud?.periodoAte); arq.push({ nome: 'trilha-de-alteracoes.csv', dados: csv(['Seq', 'Coleção', 'Registro', 'Versão', 'Quando', 'Quem'], t.map((x) => [x.seq, x.colecao, x.id, x.versao, x.alterado_em, x.alterado_por])) }); } catch (_) { /* sem permissão: segue sem a trilha */ }
    }
    arq.unshift({ nome: 'LEIA-ME.txt', dados: `Pacote de auditoria patrimonial — VitalPat\r\nEntidade: ${ent}\r\nGerado em: ${new Date().toLocaleString('pt-BR')} por ${usuario()}\r\n${aud ? `Auditoria: ${aud.codigo} · ${aud.titulo} (${aud.periodoDe} a ${aud.periodoAte})\r\n` : 'Situação atual (sem auditoria escolhida)\r\n'}\r\nPlanilhas em CSV (separador ponto e vírgula, UTF-8). O arquivo indice-sha256.txt traz a impressão digital (SHA-256) de cada arquivo: se qualquer arquivo for alterado depois, a impressão digital não bate.\r\n` });
    const linhasIdx = [];
    for (const a of arq) linhasIdx.push(`${await sha256(a.dados)}  ${a.nome}`);
    const indice = linhasIdx.join('\r\n') + '\r\n';
    arq.push({ nome: 'indice-sha256.txt', dados: indice });
    return { arquivos: arq, hashIndice: await sha256(indice) };
  };
  const telaOrgaos = () => {
    const auds = VP.db.lista('auditorias').sort((a, b) => String(b.codigo).localeCompare(String(a.codigo)));
    return {
      html: `<p class="ajuda">Pacote para Tribunal de Contas, controle interno, Câmara ou auditor externo: um arquivo .zip com as planilhas (bens, movimentações, inventários, testes e casos, conciliações, ocorrências), os papéis de trabalho e o relatório da auditoria escolhida${VP.servidor?.ativo ? ' e a trilha de alterações do período' : ''}. O arquivo <b>indice-sha256.txt</b> guarda a impressão digital de cada arquivo; a impressão digital do índice fica registrada no sistema, para provar depois que nada foi mexido.</p>
        <div class="painel-filtros"><label>Auditoria <select data-pacote-aud><option value="">Situação atual (sem auditoria)</option>${auds.map((a) => `<option value="${esc(a.id)}">${esc(a.codigo)} · ${esc(a.titulo)}</option>`).join('')}</select></label>
        <button type="button" class="botao primario" data-gerar-pacote>Gerar pacote (.zip)</button></div>
        <div id="area-pacote"></div>
        ${VP.db.lista('auditorias').some((a) => (a.entregas || []).length) ? `<h3>Pacotes entregues</h3><ul class="lista-simples">${auds.flatMap((a) => (a.entregas || []).map((e) => `<li>${esc(a.codigo)} · ${new Date(e.em).toLocaleString('pt-BR')} · ${esc(e.por)} · índice SHA-256 <code>${esc(e.hashIndice)}</code></li>`)).join('')}</ul>` : ''}`,
      ligar() {
        document.querySelector('[data-gerar-pacote]').addEventListener('click', async (e) => {
          e.target.disabled = true;
          try {
            const aud = pegaAud(document.querySelector('[data-pacote-aud]').value);
            const p = await AU.montarPacote(aud);
            const nome = `pacote-auditoria-${aud ? aud.codigo : 'situacao-atual'}-${hoje()}.zip`;
            VP.baixarBlob(nome, VP.gravarZip(p.arquivos));
            if (aud && AU.pode()) { aud.entregas = (aud.entregas || []).concat({ em: agora(), por: usuario(), arquivo: nome, hashIndice: p.hashIndice, arquivos: p.arquivos.length }); await VP.db.gravar('auditorias', aud); }
            document.getElementById('area-pacote').innerHTML = `<section class="cartao"><h3>Pacote gerado: ${esc(nome)}</h3><p>${u.inteiro(p.arquivos.length)} arquivos. Impressão digital do índice (SHA-256):</p><p><code id="hash-indice">${esc(p.hashIndice)}</code></p><p class="ajuda">Anote ou envie este número junto com o pacote: quem receber confere o índice e, por ele, cada arquivo.</p><ul class="lista-simples">${p.arquivos.map((a) => `<li>${esc(a.nome)}</li>`).join('')}</ul></section>`;
          } catch (err) { ui.aviso('Não foi possível gerar o pacote: ' + err.message, 'erro'); } finally { e.target.disabled = false; }
        });
      }
    };
  };

  // ------------------------------------------------------------------ trilha de alterações na ficha do bem
  const ROTULOS = { descricao: 'Descrição', plaqueta: 'Plaqueta', unidadeId: 'Unidade', responsavelId: 'Responsável', status: 'Situação', estado: 'Estado', contaId: 'Conta', classificacaoId: 'Classificação', localizacao: 'Localização', complemento: 'Complemento', imovel: 'Dados do imóvel', endereco: 'Endereço', seguro: 'Seguro', garantia: 'Garantia', fotos: 'Fotos', anexos: 'Anexos', detalhes: 'Detalhes', depreciacao: 'Depreciação', conferenciaImportacao: 'Conferência da importação', aguardandoAvaliacao: 'Aguardando avaliação', excluido: 'Lixeira' };
  const mostrar = (k, v) => { if (v == null || v === '') return '—'; if (k === 'unidadeId') return VP.nome('unidades', v) || v; if (k === 'responsavelId') return VP.nome('responsaveis', v) || v; if (k === 'status') return L.status[v] || v; if (k === 'estado') return L.estados[v] || v; const t = typeof v === 'object' ? JSON.stringify(v) : String(v); return t.length > 120 ? t.slice(0, 117) + '…' : t; };
  AU.diferencas = (antes, depois) => { const a = antes || {}, d = depois || {}; return [...new Set(Object.keys(a).concat(Object.keys(d)))].filter((k) => !k.startsWith('_') && JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null)).map((k) => ({ campo: ROTULOS[k] || k, antes: mostrar(k, a[k]), depois: mostrar(k, d[k]) })); };
  AU.secaoTrilha = () => `<section class="cartao secao" id="sec-trilha"><header><h3>Trilha de alterações (auditoria)</h3><button class="botao pequeno" data-ver-trilha>Ver todas as versões</button></header><p class="ajuda">Cada gravação deste bem fica guardada com quem fez, quando e o que mudou. Ninguém consegue apagar nem alterar essa trilha.</p></section>`;
  AU.ligarTrilha = (b) => document.querySelector('[data-ver-trilha]')?.addEventListener('click', async () => {
    let corpo;
    if (VP.servidor?.ativo) {
      try {
        const [vs, nomes] = await Promise.all([VP.servidor.historico('bens', b.id), VP.servidor.nomesPessoas().catch(() => ({}))]);
        corpo = vs.length ? vs.slice().reverse().map((x) => { const d = AU.diferencas(x.dados_anteriores, x.dados_novos); return `<section class="versao"><h4>Versão ${x.versao} · ${esc(new Date(x.alterado_em).toLocaleString('pt-BR'))} · ${esc(nomes[x.alterado_por] || x.alterado_por || 'sistema')}</h4>${x.dados_anteriores ? `<table class="tabela tabela-painel"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${d.map((c) => `<tr><td>${esc(c.campo)}</td><td>${esc(c.antes)}</td><td>${esc(c.depois)}</td></tr>`).join('') || '<tr><td colspan="3">sem diferença visível</td></tr>'}</tbody></table>` : '<p class="ajuda">Primeira gravação (cadastro).</p>'}</section>`; }).join('') : '<p class="ajuda">Nenhuma versão.</p>';
      } catch (e) { corpo = `<p class="aviso-inline">Seu papel não permite ler a trilha (${esc(e.message)}). Administrador, gestor e auditor podem.</p>`; }
    } else {
      const evs = VP.eventosDoBem(b.id);
      corpo = `<p class="aviso-inline">No modo demonstração (dados só no navegador) não há trilha de versões; ela existe quando o sistema está ligado ao servidor. Abaixo, as movimentações registradas.</p><ul class="lista-simples">${evs.map((e) => `<li>${u.data(e.data)} · ${esc(L.eventos[e.tipo]?.nome || e.tipo)} · ${esc(e.descricao || '')}${e.usuario ? ' · ' + esc(e.usuario) : ''}</li>`).join('')}</ul>`;
    }
    ui.modal({ titulo: `Trilha: ${b.plaqueta || b.codigo} · ${b.descricao}`, largura: 'grande', corpo, botoes: [{ texto: 'Fechar' }] });
  });
})();

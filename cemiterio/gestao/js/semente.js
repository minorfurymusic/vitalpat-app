/* VitalPat Cemitério · Gestão — dados de exemplo FICTÍCIOS (cemitério inventado, sem dados reais). */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;

  VP.criarDadosExemplo = async () => {
    const rnd = u.prng(20261008);
    const entre = (a, b) => Math.floor(a + rnd() * (b - a + 1));
    const cem = { id: 'C1', nome: 'Cemitério Municipal Exemplo', endereco: 'Rua Exemplo, 500', bairro: 'Centro', cidade: 'Cidade Exemplo', geo: null };
    const quadras = [];
    const tumulos = [];
    const defs = [];
    for (let i = 1; i <= 10; i++) defs.push({ nome: `Quadra ${String(i).padStart(2, '0')}`, codigo: String(i).padStart(2, '0'), tipo: 'comum' });
    defs.splice(10, 0, { nome: 'Quadra 10 A', codigo: '10A', tipo: 'comum' });
    defs.push({ nome: 'Quadra 11 Infantil', codigo: '11', tipo: 'infantil' }, { nome: 'Quadra 12 Jazigos', codigo: '12', tipo: 'jazigos' }, { nome: 'Gaveteiro 13', codigo: '13', tipo: 'gaveteiro' }, { nome: 'Ossário 14', codigo: '14', tipo: 'ossario' });
    defs.forEach((d, k) => {
      const q = { id: 'Q' + (k + 1), cemiterioId: 'C1', nome: d.nome, codigo: d.codigo, tipo: d.tipo, ordem: k + 1, geo: null };
      quadras.push(q);
      const nAleias = d.tipo === 'gaveteiro' ? 4 : d.tipo === 'ossario' ? 2 : entre(4, 8);
      for (let a = 1; a <= nAleias; a++) {
        const aleia = d.tipo === 'gaveteiro' || d.tipo === 'ossario' ? 'Bloco ' + 'ABCD'[a - 1] : String(a).padStart(2, '0');
        const nCovas = d.tipo === 'gaveteiro' ? 40 : d.tipo === 'ossario' ? 30 : entre(14, 30);
        for (let n = 1; n <= nCovas; n++) {
          const letra = d.tipo !== 'gaveteiro' && d.tipo !== 'ossario' && rnd() < 0.05 ? ' A' : '';
          const sorte = rnd();
          tumulos.push({
            id: u.id(), cemiterioId: 'C1', quadraId: q.id, aleia, numero: String(n).padStart(3, '0') + letra,
            tipo: d.tipo === 'gaveteiro' ? 'gaveta' : d.tipo === 'jazigos' ? 'jazigo' : d.tipo === 'ossario' ? 'ossario' : (rnd() < 0.06 ? 'jazigo' : 'sepultura'),
            ocupacao: d.tipo === 'ossario' ? 'vago' : sorte < 0.80 ? 'ocupado' : sorte < 0.92 ? 'vago' : sorte < 0.97 ? 'reservado' : 'nao-informado',
            comprimento: d.tipo === 'ossario' ? 0.6 : d.tipo === 'gaveteiro' ? 2.2 : d.tipo === 'infantil' ? 1.6 : 2.8,
            largura: d.tipo === 'ossario' ? 0.4 : d.tipo === 'gaveteiro' ? 0.8 : d.tipo === 'infantil' ? 1.0 : 1.4,
            observacao: '', fotos: [], anexos: [], qrAfixado: false, geo: null, criadoEm: VP.Plataforma.agoraISO()
          });
        }
      }
    });
    // Vistorias e ordens de serviço fictícias (etapa 2): ~8% dos túmulos ocupados vistoriados
    const hoje = VP.Plataforma.hoje();
    const diasAntes = (n) => { const d = new Date(hoje + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const vistorias = [], ordensServico = [];
    const nota = (ruim) => String(Math.min(4, Math.max(0, Math.round(ruim * 4 + (rnd() - 0.5) * 1.5))));
    const vistoria = (t, data, ruim) => ({ id: u.id(), tumuloId: t.id, data, v1: nota(ruim * 0.8), v2: nota(ruim), v3: nota(ruim * 0.9), v4: nota(ruim * 0.7), v5: ruim > 0.6 ? 'nao' : rnd() < 0.5 ? 'sim' : 'nao', observacao: '', fotos: [], origem: 'gestao', usuario: 'demonstração', criadoEm: VP.Plataforma.agoraISO() });
    let nOrdem = 0;
    for (const t of tumulos) {
      if (t.ocupacao !== 'ocupado' || rnd() > 0.08) continue;
      const ruim = rnd();
      vistorias.push(vistoria(t, diasAntes(entre(150, 300)), ruim));
      if (ruim > 0.55 && rnd() < 0.7) vistorias.push(vistoria(t, diasAntes(entre(5, 40)), Math.min(1, ruim + 0.1)));
      if (ruim > 0.7 && rnd() < 0.6) t.indicadores = [['D1', 'D2', 'D3', 'D4'][entre(0, 3)]];
      if (ruim > 0.8 && rnd() < 0.5) ordensServico.push({ id: u.id(), numero: `${++nOrdem}/${hoje.slice(0, 4)}`, tumuloId: t.id, tipo: rnd() < 0.5 ? 'limpeza' : 'reparo', origem: rnd() < 0.5 ? 'funcionario' : 'familia', prioridade: 'normal', descricao: 'Exemplo fictício', solicitante: '', situacao: 'aberta', abertaEm: diasAntes(entre(1, 30)), prazo: diasAntes(entre(-10, 10)), historico: [], usuario: 'demonstração', criadoEm: VP.Plataforma.agoraISO() });
    }
    // Etapa 3: funerárias, concessões e sepultados FICTÍCIOS (nomes inventados; sem CPF)
    const nomes = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Isabel', 'João', 'Lúcia', 'Marcos', 'Neusa', 'Otávio', 'Paula', 'Rafael', 'Sônia', 'Tiago', 'Vera', 'Walter'];
    const sobrenomes = ['Sabiá', 'Jacarandá', 'Ipê', 'Quaresmeira', 'Araucária', 'Bromélia', 'Canela', 'Manacá', 'Pitanga', 'Guabiroba'];
    const nome = () => `${nomes[entre(0, nomes.length - 1)]} ${sobrenomes[entre(0, sobrenomes.length - 1)]} ${sobrenomes[entre(0, sobrenomes.length - 1)]}`;
    const funerarias = [{ id: 'F1', nome: 'Funerária Exemplo Central', telefone: '(00) 0000-0001' }, { id: 'F2', nome: 'Funerária Exemplo Bairro', telefone: '(00) 0000-0002' }];
    const concessoes = [], sepultamentos = [];
    const novo = (x) => Object.assign({ id: u.id(), historico: [], usuario: 'demonstração', criadoEm: VP.Plataforma.agoraISO() }, x);
    let nc = 0, ns = 0;
    for (const t of tumulos) {
      if (t.ocupacao !== 'ocupado') continue;
      const gaveta = t.tipo === 'gaveta';
      const dias = gaveta ? entre(30, 365 * 8) : entre(60, 365 * 40);
      const data = diasAntes(dias);
      const crianca = gaveta && rnd() < 0.1;
      sepultamentos.push(novo({ numero: `${++ns}/${data.slice(0, 4)}`, tumuloId: t.id, falecido: nome(), data, falecimento: diasAntes(dias + 1), crianca, funerariaId: rnd() < 0.5 ? 'F1' : 'F2', situacao: 'sepultado' }));
      if (gaveta) concessoes.push(novo({ numero: `${++nc}/${data.slice(0, 4)}`, tumuloId: t.id, tipo: 'temporaria', inicio: data, fim: VP.somaAnos(data, crianca ? 3 : 5), titular: nome(), cpf: '', situacao: 'vigente', titulares: [] }));
      else if (rnd() < 0.7) {
        const perpetua = t.tipo === 'jazigo' || rnd() < 0.6;
        concessoes.push(novo({ numero: `${++nc}/${data.slice(0, 4)}`, tumuloId: t.id, tipo: perpetua ? 'perpetua' : 'temporaria', inicio: data, fim: perpetua ? '' : VP.somaAnos(data, entre(10, 40)), titular: nome(), cpf: '', situacao: 'vigente', titulares: [] }));
      }
    }
    // 2 sepultamentos agendados para amanhã em sepulturas vagas
    tumulos.filter((t) => t.ocupacao === 'vago' && t.tipo === 'sepultura').slice(0, 2).forEach((t, i) => sepultamentos.push(novo({ numero: `${++ns}/${hoje.slice(0, 4)}`, tumuloId: t.id, falecido: nome(), data: diasAntes(-1), hora: ['10:00', '15:30'][i], funerariaId: 'F1', declarante: 'Familiar (exemplo)', situacao: 'agendado' })));
    // Etapa 4: um processo de abandono de exemplo (fictício), já com uma notificação sem sucesso
    const contagem = new Map(); for (const v of vistorias) contagem.set(v.tumuloId, (contagem.get(v.tumuloId) || 0) + 1);
    const alvo = tumulos.find((t) => contagem.get(t.id) >= 2 && t.tipo !== 'jazigo');
    const processos = [];
    if (alvo) {
      const numero = `1/${hoje.slice(0, 4)}`;
      alvo.indicadores = ['D3']; alvo.situacao = 'apuracao'; alvo.processo = numero;
      alvo.situacaoHist = [{ de: 'indicio', para: 'apuracao', data: diasAntes(20), motivo: 'Exemplo fictício', processo: numero, revisor: 'Comissão de exemplo', ato: '', dataAto: '', usuario: 'demonstração', quando: VP.Plataforma.agoraISO() }];
      processos.push({ id: u.id(), numero, tumuloId: alvo.id, abertoEm: diasAntes(20), revisor: 'Comissão de exemplo', motivoAbertura: 'Exemplo fictício: duas vistorias com nota alta e titular sem contato', situacao: 'andamento', notificacoes: [{ id: u.id(), meio: 'whatsapp', data: diasAntes(15), destinatario: 'Titular (exemplo)', contato: '(00) 00000-0000', resultado: 'naoLocalizado', comprovante: [], nota: 'Número não existe (exemplo)', usuario: 'demonstração' }], manifestacoes: [], aviso: null, edital: null, decisao: null, historico: [{ quando: VP.Plataforma.agoraISO(), acao: 'Processo aberto (exemplo)', usuario: 'demonstração' }], usuario: 'demonstração', criadoEm: VP.Plataforma.agoraISO() });
    }
    await VP.db.gravarVarias({ cemiterios: [cem], quadras, tumulos, vistorias, ordensServico, funerarias, concessoes, sepultamentos, processos, meta:[{ id: 'config', valores: Object.assign({}, VP.CONFIG_PADRAO) }, { id: 'semente', ficticio: true, criadoEm: VP.Plataforma.agoraISO() }] });
  };
})();

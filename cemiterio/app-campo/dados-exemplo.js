// Dados FICTÍCIOS só para a demonstração. Não representam nenhuma prefeitura real.
// Os códigos seguem o mesmo formato da Gestão do Cemitério (quadra, aléia, número) e existem no cemitério de exemplo dela.
// Com servidor, o aplicativo usa a lista baixada do servidor no lugar desta.
window.DADOS_EXEMPLO = {
  tumulos: [
    { codigo: 'Q01-A1-1A', descricao: 'Quadra 01 · Aléia 01 · Nº 001 A' },
    { codigo: 'Q01-A1-2', descricao: 'Quadra 01 · Aléia 01 · Nº 002' },
    { codigo: 'Q01-A2-19', descricao: 'Quadra 01 · Aléia 02 · Nº 019' },
    { codigo: 'Q03-A2-7', descricao: 'Quadra 03 · Aléia 02 · Nº 007' }
  ],
  ordens: [
    { id: 'demo-os-1', numero: '1/2026', codigo: 'Q01-A1-2', descricao: 'Quadra 01 · Aléia 01 · Nº 002', tipo: 'limpeza', tipoNome: 'Limpeza', prioridade: 'normal', oQueFazer: 'Cortar o mato e limpar a lápide (exemplo fictício)', prazo: '2026-10-20' },
    { id: 'demo-os-2', numero: '2/2026', codigo: 'Q03-A2-7', descricao: 'Quadra 03 · Aléia 02 · Nº 007', tipo: 'reparo', tipoNome: 'Conserto', prioridade: 'urgente', oQueFazer: 'Tampa quebrada: isolar e consertar (exemplo fictício)', prazo: '2026-10-10' }
  ]
};

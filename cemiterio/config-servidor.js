/* VitalPat Cemitério — endereço do banco (Supabase) desta cidade.
   Vazio = modo demonstração (dados fictícios, só no navegador).
   Preenchido = sistema de verdade, gravando no servidor.
   Use só a chave "anon / public" (Supabase → Project Settings → API). NUNCA a chave service_role. */
window.VP_SERVIDOR_CEMITERIO = {
  // Projeto de TESTE (07/10/2026), dividido com o outro sistema; cada um na sua área do banco.
  // Para voltar à demonstração (dados fictícios no navegador), deixe url e chavePublica vazios.
  url: 'https://scmrceuxzsukxwsusygk.supabase.co',
  chavePublica: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjbXJjZXV4enN1a3h3c3VzeWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTI0MTYsImV4cCI6MjEwNjk2ODQxNn0.9LWeapDlVRxdfoV9maeFzMRA9HaQZR5FVccAiRRsb5E', // chave anon / public (pode ficar pública; os dados são protegidos pelas regras do banco)
  municipio: 'Teste/SC'
};

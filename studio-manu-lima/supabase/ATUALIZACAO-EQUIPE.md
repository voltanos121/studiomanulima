# Atualização do schema anterior para equipe multi-profissional

Se o banco ainda não foi criado, execute somente `schema.sql` atualizado.

Se você já executou a versão anterior do schema, não execute o `schema.sql` inteiro novamente. A atualização exige: criar `profissionais` e `convites_funcionarios`, adicionar `profissional_id` em `agendamentos`, atualizar as funções RPC para receber `p_staff_id`, substituir a constraint de sobreposição para ser por profissional e adicionar as políticas RLS e grants. Como o banco anterior não possui um perfil de atendimento para atribuir reservas antigas, faça backup e atribua os agendamentos históricos a um profissional antes de tornar `profissional_id` obrigatório. O arquivo `schema.sql` contém o modelo final de referência; solicite uma migração incremental específica se já houver reservas reais no banco.

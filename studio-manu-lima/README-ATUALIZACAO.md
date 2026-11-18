# Atualização — Gerenciador de administradores | Studio Manu Lima

Esta atualização acrescenta ao painel a seção **Administradores**, com listagem, criação, edição e exclusão de contas administrativas.

## Arquivos incluídos
- `admin.html` — navegação e interface da nova seção.
- `admin.js` — chamadas à função segura e atualização da tela.
- `admin-users.css` — estilos responsivos do gerenciador.
- `supabase/functions/manage-admins/index.ts` — função de servidor que administra contas Auth e permissões na tabela `public.admins`.

## Instalação

1. Faça uma cópia de segurança dos arquivos atuais.
2. Substitua `admin.html` e `admin.js` pelos arquivos desta atualização.
3. Adicione `admin-users.css` junto aos outros CSS do site.
4. No Supabase, abra **Edge Functions → Deploy a new function → Via Editor**.
5. Crie a função com o nome exato `manage-admins`.
6. Cole o conteúdo de `supabase/functions/manage-admins/index.ts` e publique.
7. Mantenha a verificação JWT ativada. O painel envia a sessão autenticada do administrador.
8. Não crie secrets extras para `SUPABASE_URL`, `SUPABASE_ANON_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`: o Supabase fornece essas variáveis no ambiente das Edge Functions.
9. Publique os três arquivos do site na hospedagem e faça recarga forçada no navegador (`Ctrl + Shift + R`).

## Segurança incluída
- Toda operação verifica o token da sessão e confirma o UUID do solicitante em `public.admins`.
- A chave `service_role` existe somente no ambiente da Edge Function.
- A função impede que o administrador conectado exclua a própria conta.
- A função impede excluir o último administrador.
- Criar uma conta cria o usuário no Supabase Auth e adiciona seu UUID à tabela `public.admins`.
- Excluir remove o acesso administrativo e a conta Auth correspondente.
- Editar permite alterar nome, e-mail e, opcionalmente, senha.

## Observações
- O nome é armazenado em `user_metadata.full_name`.
- Ao alterar o e-mail via Admin API, a função o marca como confirmado (`email_confirm: true`). Use somente para contas que você tem autorização para administrar.
- A exclusão de uma conta Auth é definitiva; confirme cuidadosamente antes de remover alguém.
- Esta atualização não altera o banco de dados nem mexe nos funcionários, agendamentos ou convites existentes.
- Depois de publicar, teste primeiro a listagem e depois crie um administrador de teste com um e-mail controlado por você. Teste o login desse usuário antes de usar a função em produção.

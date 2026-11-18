# Studio Manu Lima — Site e painel administrativo

Projeto frontend responsivo com integração Supabase preparada para agendamento real.

## Arquivos
- `index.html`: site público.
- `styles.css`: identidade visual e responsividade.
- `app.js`: catálogo, galeria, consulta de horários e reserva.
- `admin.html`, `admin.css`, `admin.js`: painel administrativo.
- `config.js`: URL e chave pública do Supabase.
- `supabase/schema.sql`: tabelas, políticas RLS e funções de disponibilidade/reserva.

## 1. Configurar o banco de dados
1. Crie um projeto em https://supabase.com.
2. Abra **SQL Editor** e execute todo o conteúdo de `supabase/schema.sql`.
3. Em **Project Settings > API**, copie Project URL e anon/public key.
4. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` no arquivo `config.js`.
5. Não use a chave `service_role` no frontend.

## 2. Criar o primeiro administrador
1. No Supabase, abra **Authentication > Users** e crie um usuário com e-mail e senha fortes.
2. Copie o UUID desse usuário.
3. No SQL Editor execute, substituindo o UUID:

```sql
insert into public.admins(user_id)
values ('UUID-DO-USUARIO-AUTORIZADO');
```

O usuário então poderá entrar em `admin.html`. Não existe senha padrão no código.

## 3. Executar localmente
Não abra os arquivos diretamente por `file://`. Sirva a pasta por um servidor HTTP local, por exemplo:
- VS Code: extensão Live Server.
- Python: `python -m http.server 8000` dentro da pasta.
- Hospedagem estática: Netlify, Vercel ou hospedagem compatível.

Acesse `/` para o site e `/admin.html` para a administração.

## 4. Dados comerciais iniciais
O projeto preserva os dados identificados no HTML enviado:
- Nome: Studio Manu Lima
- WhatsApp/telefone: +55 22 99207-2123
- Endereço informado: Av. Gladstone de Oliveira - Araruama, RJ, 28980-680
- Link de mapa: configurável no painel

Os serviços/preços que estavam no HTML original podem ser cadastrados no painel, mas devem ser conferidos pela proprietária antes da publicação.

## 5. Agendamentos e intervalos de 30 minutos
A função `get_available_slots` consulta o expediente, os bloqueios e as reservas pendentes/confirmadas. Cada início possível avança 30 minutos. A duração do serviço determina o horário final e quantos intervalos são ocupados.

A função `create_booking` valida novamente a disponibilidade no servidor e usa trava por data, além de uma restrição de exclusão no PostgreSQL para impedir sobreposição. Assim, não depende apenas do JavaScript do navegador.

O status inicial é `pendente`. Reservas pendentes e confirmadas bloqueiam o horário. Ao cancelar, o intervalo volta a ficar disponível.

## 6. WhatsApp
Depois de registrar a reserva no banco, o site abre o WhatsApp com uma mensagem preenchida. A cliente ainda precisa tocar em **Enviar**. Para disparo automático sem ação da cliente, é necessária a WhatsApp Business Platform/API, com configuração e autorização próprias.

## 7. Galeria e imagens
O painel permite cadastrar imagens por URL pública ou enviar JPG, PNG e WEBP de até 8 MB diretamente do dispositivo. O SQL cria o bucket `studio-gallery`: leitura pública das imagens e upload/alteração/exclusão restritos a administradores. O bucket é público somente para leitura, nunca para escrita anônima.

## 8. Antes de publicar
- Confira preços, duração dos serviços, telefone, endereço e link exato do Maps.
- Crie e teste a conta administrativa.
- Teste reservas concorrentes em duas janelas/dispositivos.
- Configure política de privacidade e aviso LGPD.
- Configure backups e monitore erros.
- Publique com HTTPS.
- Revise políticas RLS de acordo com o ambiente e a necessidade operacional.

**Importante:** este pacote entrega a aplicação e o esquema de backend prontos para configuração. A persistência online só estará ativa depois de criar o projeto Supabase, executar o SQL e inserir as credenciais em `config.js`.


## 9. Equipe, profissionais e QR Code (novo)

- O formulário público exige a escolha de uma profissional (incluindo a Administradora) antes de consultar os horários.
- Cada profissional tem agenda independente: um horário ocupado por Luiza continua disponível para Maria, se Maria estiver livre.
- A administradora é criada automaticamente como profissional quando seu UUID é inserido em `public.admins`. O nome inicial exibido é “Administradora”; ele pode ser ajustado diretamente na tabela `profissionais` no Supabase ou por uma futura opção de edição no painel.
- Em **Painel administrativo > Equipe**, somente uma conta presente em `public.admins` consegue criar profissionais, ativar/desativar perfis e gerar QR Codes.
- O QR Code autoriza o cadastro naquele fluxo, é de uso único e válido por 30 minutos. O funcionário abre `cadastro-funcionario.html`, escolhe um nome de usuário e uma senha com no mínimo 8 caracteres. O sistema cria a conta de autenticação por uma Edge Function; a chave `service_role` fica exclusivamente no servidor.
- O funcionário acessa `funcionario.html` com nome de usuário e senha e visualiza apenas os próprios próximos atendimentos. Não recebe permissões administrativas.

### Publicar as Edge Functions de convite

O fluxo de QR Code precisa das duas Edge Functions do diretório `supabase/functions`:

1. Instale e autentique a Supabase CLI.
2. Faça o deploy de `create-staff-invite` e `complete-staff-invite` no projeto.
3. Configure os secrets `SITE_URL` (URL pública do site) e os secrets padrão `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente das funções. A service role nunca deve ser colocada em `config.js` ou em arquivos públicos.
4. Deixe a verificação JWT habilitada para `create-staff-invite`. A função `complete-staff-invite` é pública por desenho, mas só aceita token aleatório com hash no banco, não expirado e ainda não usado.
5. O projeto precisa estar servido por HTTPS para que a câmera do celular leia o QR Code com segurança.

Exemplo de comandos (substitua o identificador do projeto):

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set SITE_URL=https://seu-dominio.com
supabase functions deploy create-staff-invite
supabase functions deploy complete-staff-invite --no-verify-jwt
```

**Atenção:** como o banco ainda não foi configurado, execute o `supabase/schema.sql` atualizado em um projeto novo. Se você já tiver executado a versão anterior do SQL, não execute o arquivo completo por cima: será necessário aplicar uma migração incremental adequada para preservar os dados existentes.


## 10. Mural individual, WhatsApp, rendimentos e avaliações

### Mural individual
- `funcionario.html` mostra próximos atendimentos e histórico individual. A funcionária vê somente seus agendamentos, incluindo nome e telefone do cliente, serviço, data, horário, observações, status e código. O isolamento é garantido por RLS.

### WhatsApp automático da equipe
O cadastro exige número de WhatsApp e consentimento do funcionário. O envio automático requer WhatsApp Business Platform / Cloud API da Meta; link `wa.me` não dispara mensagens automaticamente. Crie e aprove um modelo `novo_agendamento_studio` em `pt_BR` com sete variáveis: `Novo agendamento no Studio Manu Lima. Cliente: {{1}} ({{2}}). Serviço: {{3}}. Data: {{4}}. Horário: {{5}}. Observações: {{6}}. Código: {{7}}. Consulte seu mural para ver os detalhes.` Configure os secrets `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` e `WHATSAPP_GRAPH_VERSION`. Publique com `supabase functions deploy notify-staff-booking --no-verify-jwt`. A reserva é mantida mesmo se a notificação falhar. Respeite opt-in e políticas da Meta.

### Rendimentos
A área Rendimentos classifica pelo número de atendimentos concluídos. O faturamento bruto estimado soma os preços cadastrados atualmente para esses serviços; não é lucro líquido e não desconta custos, comissões, taxas ou descontos históricos. A média e a quantidade de avaliações também são exibidas.

### Avaliações
A cliente informa código da reserva, mesmo WhatsApp, nota de 1 a 5 e comentário opcional. Só são aceitas reservas marcadas como `concluido`, e cada reserva só pode ser avaliada uma vez. A média aparece na lista pública de profissionais.

### Migração SQL
Instalação nova: execute `supabase/schema.sql` completo. Projeto que já executou o schema anterior: faça backup e execute somente `supabase/migration-equipe-whatsapp-avaliacoes.sql`.

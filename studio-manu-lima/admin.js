(() => {
 const cfg=window.STUDIO_CONFIG||{},configured=cfg.SUPABASE_URL&&!cfg.SUPABASE_URL.includes("COLE_AQUI")&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");
 const db=configured&&window.supabase?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
 const $=s=>document.querySelector(s), esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let currentView="dashboard",services=[],appointments=[],staffRows=[];
 const days=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
 const today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
 function feedback(el,msg,error=true){el.textContent=msg;el.className="form-feedback "+(error?"error":"success")}
 function requireDb(){if(!db){feedback($("#loginFeedback"),"Configure a URL e a chave anon do Supabase no arquivo config.js.");return false}return true}
 function showView(name){currentView=name;document.querySelectorAll(".admin-view").forEach(x=>x.classList.add("hidden"));$("#view-"+name)?.classList.remove("hidden");document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===name));$("#viewTitle").textContent=({dashboard:"Visão geral",appointments:"Agendamentos",staff:"Equipe",earnings:"Rendimentos",services:"Serviços",gallery:"Galeria",hours:"Disponibilidade",settings:"Configurações",administrators:"Administradores"})[name];loadView(name)}
 document.querySelectorAll("[data-view]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();showView(a.dataset.view)}));
 document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
 async function checkSession(){if(!requireDb())return;const {data}=await db.auth.getSession();if(data.session){const {data:admin}=await db.from("admins").select("user_id").eq("user_id",data.session.user.id).maybeSingle();if(admin)enter(data.session.user);else{await db.auth.signOut();$("#loginView").classList.remove("hidden");feedback($("#loginFeedback"),"Esta conta não possui permissão administrativa. Funcionários devem usar a área individual.");}}else{$("#loginView").classList.remove("hidden");$("#adminContent").classList.add("hidden")}}
 function enter(user){currentUserId=user.id;$("#loginView").classList.add("hidden");$("#adminContent").classList.remove("hidden");$("#logoutButton").classList.remove("hidden");$("#adminEmail").textContent=user.email||"";showView("dashboard")}
 $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();if(!requireDb())return;let f=new FormData(e.currentTarget);const {data,error}=await db.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});if(error)feedback($("#loginFeedback"),"Não foi possível entrar. Confira e-mail e senha.");else{const {data:admin}=await db.from("admins").select("user_id").eq("user_id",data.user.id).maybeSingle();if(!admin){await db.auth.signOut();feedback($("#loginFeedback"),"Esta conta não é administradora. Funcionários devem usar funcionario.html.");}else enter(data.user)}});
 $("#logoutButton").addEventListener("click",async()=>{await db.auth.signOut();location.reload()});
 async function loadView(v){if(v==="dashboard"||v==="appointments")await loadAppointments();if(v==="staff")await loadStaff();if(v==="earnings")await loadEarnings();if(v==="dashboard"||v==="services")await loadServices();if(v==="gallery")await loadGallery();if(v==="hours")await loadHours();if(v==="settings")await loadSettings();if(v==="administrators")await loadAdministrators()}
 async function loadAppointments(){let {data,error}=await db.from("agendamentos").select("*,clientes(nome,telefone),servicos(nome),profissionais(nome)").order("data").order("horario_inicio");if(error){$("#appointmentsTable").textContent=error.message;return}appointments=data||[];let todayRows=appointments.filter(a=>a.data===today()&&!["cancelado","concluido"].includes(a.status));$("#statToday").textContent=todayRows.length;$("#statPending").textContent=appointments.filter(a=>a.status==="pendente").length;$("#statConfirmed").textContent=appointments.filter(a=>a.status==="confirmado").length;const html=tableAppointments(appointments);$("#appointmentsTable").innerHTML=html;$("#dashboardAppointments").innerHTML=tableAppointments(appointments.filter(a=>a.data>=today()&&!["cancelado","concluido"].includes(a.status)).slice(0,8));}

 // Rendimentos: os dados são calculados somente com os serviços marcados como concluídos.
 // O total é faturamento bruto estimado, com base no preço atual do serviço no banco.
 async function loadEarnings(){
   const box=$("#earningsTable");
   const refresh=$("#refreshEarnings");
   if(!box||!db)return;
   box.textContent="Carregando rendimentos...";
   if(refresh){refresh.disabled=true;refresh.textContent="Atualizando...";}
   const currency=n=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
   const integer=n=>Number(n||0).toLocaleString("pt-BR");
   const setStat=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
   try{
     const {data,error}=await db.rpc("get_staff_performance");
     if(error)throw error;
     const rows=Array.isArray(data)?data:[];
     const completed=rows.reduce((acc,row)=>acc+Number(row.atendimentos_concluidos||0),0);
     const gross=rows.reduce((acc,row)=>acc+Number(row.rendimento_bruto||0),0);
     const active=rows.filter(row=>Number(row.atendimentos_concluidos||0)>0).length;
     setStat("#earningsGross",currency(gross));
     setStat("#earningsCompleted",integer(completed));
     setStat("#earningsProfessionals",integer(active));
     if(!rows.length){
       box.innerHTML="<p class='hint'>Ainda não há profissionais cadastrados para apresentar.</p>";
       return;
     }
     // Ranking ordenado por número de atendimentos e, em caso de empate, por rendimento.
     rows.sort((a,b)=>Number(b.atendimentos_concluidos||0)-Number(a.atendimentos_concluidos||0)
       ||Number(b.rendimento_bruto||0)-Number(a.rendimento_bruto||0)
       ||String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));
     box.innerHTML=`<table><thead><tr><th>Ranking</th><th>Profissional</th><th>Perfil</th><th>Atendimentos concluídos</th><th>Rendimento bruto</th><th>Avaliação média</th><th>Avaliações</th></tr></thead><tbody>${rows.map((row,i)=>{
       const count=Number(row.total_avaliacoes||0);
       const rating=count>0?Number(row.media_avaliacoes||0).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1}):"—";
       return `<tr><td><strong>${i+1}º</strong></td><td>${esc(row.nome||"—")}</td><td>${row.tipo==="admin"?"Administradora":"Funcionária"}</td><td>${integer(row.atendimentos_concluidos)}</td><td><strong>${currency(row.rendimento_bruto)}</strong></td><td>${rating}</td><td>${integer(count)}</td></tr>`;
     }).join("")}</tbody></table>`;
   }catch(error){
     console.error("Erro ao carregar rendimentos:",error);
     setStat("#earningsGross","—");
     setStat("#earningsCompleted","—");
     setStat("#earningsProfessionals","—");
     const details=error?.message||"Erro desconhecido";
     const tip=(error?.code==="PGRST202"||/could not find the function/i.test(details))
       ?" A função get_staff_performance não foi localizada. Execute o SQL de rendimentos incluído no pacote, no mesmo projeto Supabase do site."
       :(/acesso restrito|permission denied|permiss[aã]o/i.test(details)
         ?" Verifique se você está conectada com uma conta cadastrada em public.admins."
         :" Confira o Supabase e tente novamente.");
     box.innerHTML=`<p class="form-feedback error" role="alert">Não foi possível carregar os rendimentos: ${esc(details)}.${esc(tip)}</p>`;
   }finally{
     if(refresh){refresh.disabled=false;refresh.textContent="Atualizar";}
   }
 }
 $("#refreshEarnings")?.addEventListener("click",loadEarnings);

 function tableAppointments(rows){if(!rows.length)return"<p class='hint'>Nenhum agendamento encontrado.</p>";return `<table><thead><tr><th>Cliente</th><th>Serviço</th><th>Profissional</th><th>Data</th><th>Horário</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.clientes?.nome||"Cliente")}<br>${esc(a.clientes?.telefone||"")}</td><td>${esc(a.servicos?.nome||"—")}</td><td>${esc(a.profissionais?.nome||"—")}</td><td>${new Date(a.data+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>${String(a.horario_inicio).slice(0,5)}–${String(a.horario_fim).slice(0,5)}</td><td><span class="status ${a.status}">${esc(a.status)}</span></td><td>${a.status==="pendente"?`<button data-status="${a.id}" data-value="confirmado">Confirmar</button>`:""}${!["cancelado","concluido"].includes(a.status)?`<button data-status="${a.id}" data-value="cancelado">Cancelar</button><button data-status="${a.id}" data-value="concluido">Concluir</button>`:""}</td></tr>`).join("")}</tbody></table>`}
 document.addEventListener("click",async e=>{let b=e.target.closest("[data-status]");if(!b)return;const {error}=await db.from("agendamentos").update({status:b.dataset.value}).eq("id",b.dataset.status);if(error)alert("Não foi possível atualizar: "+error.message);else loadAppointments()});
 $("#appointmentSearch").addEventListener("input",e=>{let q=e.target.value.toLowerCase();$("#appointmentsTable").innerHTML=tableAppointments(appointments.filter(a=>(a.clientes?.nome||"").toLowerCase().includes(q)||(a.servicos?.nome||"").toLowerCase().includes(q)))});
 async function loadServices(){let {data,error}=await db.from("servicos").select("*").order("ordem").order("nome");if(error)return;services=data||[];$("#statServices").textContent=services.filter(s=>s.ativo).length;$("#servicesTable").innerHTML=services.length?`<table><thead><tr><th>Serviço</th><th>Preço</th><th>Duração</th><th>Status</th><th>Ações</th></tr></thead><tbody>${services.map(s=>`<tr><td>${esc(s.nome)}</td><td>${Number(s.preco).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td>${s.duracao_minutos} min</td><td>${s.ativo?"Ativo":"Inativo"}</td><td><button data-edit-service="${s.id}">Editar</button><button data-delete-service="${s.id}">Excluir</button></td></tr>`).join("")}</tbody></table>`:"Nenhum serviço cadastrado."}
 $("#newService").addEventListener("click",()=>{const f=$("#serviceForm");f.reset();f.classList.remove("hidden");f.elements.id.value="";$("#serviceFormTitle").textContent="Novo serviço"});
 $("#cancelService").addEventListener("click",()=>$("#serviceForm").classList.add("hidden"));
 document.addEventListener("click",e=>{let b=e.target.closest("[data-edit-service]");if(b){let s=services.find(x=>x.id===b.dataset.editService),f=$("#serviceForm");f.classList.remove("hidden");$("#serviceFormTitle").textContent="Editar serviço";Object.entries(s).forEach(([k,v])=>{if(f.elements[k]){if(f.elements[k].type==="checkbox")f.elements[k].checked=!!v;else f.elements[k].value=v??""}})}});
 document.addEventListener("click",async e=>{let b=e.target.closest("[data-delete-service]");if(b&&confirm("Excluir este serviço?")){let {error}=await db.from("servicos").delete().eq("id",b.dataset.deleteService);if(error)alert(error.message);loadServices()}});
 $("#serviceForm").addEventListener("submit",async e=>{e.preventDefault();let f=e.currentTarget,d=Object.fromEntries(new FormData(f));d.preco=Number(d.preco);d.duracao_minutos=Number(d.duracao_minutos);d.ordem=Number(d.ordem||0);d.ativo=f.elements.ativo.checked;let id=d.id;delete d.id;let q=id?db.from("servicos").update(d).eq("id",id):db.from("servicos").insert(d);let {error}=await q;if(error)alert(error.message);else{f.classList.add("hidden");loadServices()}});
 async function loadGallery(){let {data,error}=await db.from("galeria").select("*").order("ordem");if(error)return;$("#galleryAdminGrid").innerHTML=(data||[]).map(x=>`<article><img src="${esc(x.imagem_url)}" alt=""><p><b>${esc(x.titulo)}</b><br>${esc(x.categoria||"")}</p><button data-gallery-delete="${x.id}">Excluir</button><button data-gallery-toggle="${x.id}" data-active="${x.ativo}">${x.ativo?"Ocultar":"Publicar"}</button></article>`).join("")||"Galeria vazia."}
 $("#galleryForm").addEventListener("submit",async e=>{e.preventDefault();let f=e.currentTarget,d=Object.fromEntries(new FormData(f));const file=f.elements.image_file.files[0];if(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){alert("Escolha uma imagem JPG, PNG ou WEBP de até 8 MB.");return}const safe=file.name.toLowerCase().replace(/[^a-z0-9.-]/g,"-");const path=`${Date.now()}-${safe}`;const {data:up,error:upError}=await db.storage.from("studio-gallery").upload(path,file,{upsert:false,contentType:file.type});if(upError){alert("Falha no upload. Confira se o bucket studio-gallery e suas políticas foram criados: "+upError.message);return}d.imagem_url=db.storage.from("studio-gallery").getPublicUrl(up.path).data.publicUrl;}if(!d.imagem_url){alert("Selecione uma imagem ou informe uma URL.");return}delete d.image_file;d.ordem=Number(d.ordem||0);d.ativo=true;let {error}=await db.from("galeria").insert(d);if(error)alert(error.message);else{f.reset();loadGallery()}});
 document.addEventListener("click",async e=>{let del=e.target.closest("[data-gallery-delete]"),tog=e.target.closest("[data-gallery-toggle]");if(del&&confirm("Excluir imagem?")){let {error}=await db.from("galeria").delete().eq("id",del.dataset.galleryDelete);if(error)alert(error.message);loadGallery()}if(tog){let {error}=await db.from("galeria").update({ativo:tog.dataset.active!=="true"}).eq("id",tog.dataset.galleryToggle);if(error)alert(error.message);loadGallery()}});
 async function loadStaff(){
   const {data,error}=await db.from("profissionais").select("*").order("ordem").order("nome");
   if(error){$("#staffTable").textContent=error.message;return;}
   staffRows=data||[];
   $("#staffTable").innerHTML=staffRows.length?`<table><thead><tr><th>Profissional</th><th>Perfil</th><th>WhatsApp</th><th>Status</th><th>Login</th><th>Ações</th></tr></thead><tbody>${staffRows.map(x=>`<tr><td>${esc(x.nome)}</td><td>${x.tipo==="admin"?"Administradora":"Funcionária"}</td><td>${x.tipo==="admin"?"Geral (Configurações)":x.whatsapp?`${esc(x.whatsapp)}${x.whatsapp_opt_in?"":" · Sem autorização"}`:"<strong>Não cadastrado</strong>"}</td><td>${x.ativo?"Ativo":"Inativo"}</td><td>${x.auth_user_id?"Cadastro concluído":(x.tipo==="admin"?"Conta administrativa":"Convite pendente")}</td><td>${x.tipo!=="admin"?`<button data-staff-edit="${x.id}">Editar contato</button>`+(!x.auth_user_id?`<button data-staff-invite="${x.id}">Gerar QR Code</button>`:"")+`<button data-staff-toggle="${x.id}" data-active="${x.ativo}">${x.ativo?"Desativar":"Ativar"}</button><button data-staff-delete="${x.id}">Excluir</button>`:"<span class='hint'>Perfil fixo</span>"}</td></tr>`).join("")}</tbody></table>`:"Nenhum profissional cadastrado.";
 }
 let staffEditingId=null;
 function openStaffForm(row=null){
   const form=$("#staffForm");
   form.reset();staffEditingId=row?.id||null;
   form.elements.nome.value=row?.nome||"";
   form.elements.whatsapp.value=row?.whatsapp||"";
   form.elements.whatsapp_opt_in.checked=Boolean(row?.whatsapp_opt_in);
   $("#staffFormTitle").textContent=row?"Editar profissional e WhatsApp":"Novo profissional";
   $("#saveStaffButton").textContent=row?"Salvar alterações":"Salvar profissional";
   form.classList.remove("hidden");
   form.scrollIntoView({behavior:"smooth",block:"start"});
 }
 $("#newStaff").addEventListener("click",()=>openStaffForm());
 $("#cancelStaff").addEventListener("click",()=>{staffEditingId=null;$("#staffForm").classList.add("hidden")});
 $("#staffForm").addEventListener("submit",async e=>{
   e.preventDefault();
   const form=e.currentTarget;
   const number=String(form.elements.whatsapp.value||"").replace(/\D/g,"");
   if(!/^[0-9]{10,15}$/.test(number)){
     alert("Informe WhatsApp com DDI e DDD, usando de 10 a 15 dígitos. Exemplo: 5522999999999.");return;
   }
   if(!form.elements.whatsapp_opt_in.checked){alert("Confirme a autorização da profissional para receber mensagens e avisos de agendamento.");return;}
   const payload={nome:form.elements.nome.value.trim(),whatsapp:number,whatsapp_opt_in:true};
   const saving=staffEditingId
     ? db.from("profissionais").update(payload).eq("id",staffEditingId)
     : db.from("profissionais").insert({...payload,tipo:"funcionario",ativo:true,ordem:staffRows.length});
   const {error}=await saving;
   if(error){alert("Não foi possível salvar a profissional: "+error.message);return;}
   staffEditingId=null;form.reset();form.classList.add("hidden");await loadStaff();
 });
 document.addEventListener("click",async e=>{
   const edit=e.target.closest("[data-staff-edit]");
   if(edit){const row=staffRows.find(x=>x.id===edit.dataset.staffEdit);if(row&&row.tipo!=="admin")openStaffForm(row);return;}
   const invite=e.target.closest("[data-staff-invite]");
   if(invite){invite.disabled=true;const {data,error}=await db.functions.invoke("create-staff-invite",{body:{staff_id:invite.dataset.staffInvite}});invite.disabled=false;if(error||!data?.url){alert("Não foi possível gerar o convite. Confira se a Edge Function create-staff-invite foi publicada. "+(error?.message||""));return;}$("#invitePanel").classList.remove("hidden");$("#inviteDescription").textContent="Convite para "+(staffRows.find(x=>x.id===invite.dataset.staffInvite)?.nome||"funcionário");$("#inviteQr").innerHTML="";new QRCode($("#inviteQr"),{text:data.url,width:220,height:220});$("#inviteUrl").textContent=data.url;$("#invitePanel").scrollIntoView({behavior:"smooth"});}
   const toggle=e.target.closest("[data-staff-toggle]");if(toggle){const {error}=await db.from("profissionais").update({ativo:toggle.dataset.active!=="true"}).eq("id",toggle.dataset.staffToggle);if(error)alert(error.message);loadStaff();}
   const del=e.target.closest("[data-staff-delete]");if(del&&confirm("Excluir este profissional? Agendamentos antigos serão preservados, mas não será possível apagar o perfil se houver reservas vinculadas.")){const {error}=await db.from("profissionais").delete().eq("id",del.dataset.staffDelete);if(error)alert(error.message);loadStaff();}
 });
 $("#closeInvite").addEventListener("click",()=>$("#invitePanel").classList.add("hidden"));
 async function loadHours(){let {data,error}=await db.from("disponibilidade_semanal").select("*").order("dia_semana");if(error)return;let map=new Map((data||[]).map(x=>[x.dia_semana,x]));$("#weeklyHours").innerHTML=days.map((name,i)=>{let x=map.get(i)||{};return `<div class="day-row"><b>${name}</b><input type="checkbox" name="active_${i}" ${x.ativo?"checked":""} aria-label="Ativar ${name}"><input type="time" name="start_${i}" value="${x.horario_inicio||"09:00"}" title="Início"><input type="time" name="end_${i}" value="${x.horario_fim||"18:00"}" title="Fim"><input type="time" name="break_start_${i}" value="${x.intervalo_inicio||""}" title="Início do intervalo"><input type="time" name="break_end_${i}" value="${x.intervalo_fim||""}" title="Fim do intervalo"></div>`}).join("");let {data:blocks}=await db.from("bloqueios").select("*").gte("data",today()).order("data");$("#blocksList").innerHTML=(blocks||[]).map(x=>`<p class="hint">${new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR")} · ${esc(x.descricao)} <button data-block-delete="${x.id}">Remover</button></p>`).join("")}
 $("#hoursForm").addEventListener("submit",async e=>{e.preventDefault();let f=e.currentTarget;for(let i=0;i<7;i++){let row={dia_semana:i,ativo:f.elements["active_"+i].checked,horario_inicio:f.elements["start_"+i].value,horario_fim:f.elements["end_"+i].value,intervalo_inicio:f.elements["break_start_"+i].value||null,intervalo_fim:f.elements["break_end_"+i].value||null};if(row.ativo&&row.horario_inicio>=row.horario_fim){alert("Confira os horários de "+days[i]);return}if((row.intervalo_inicio&&!row.intervalo_fim)||(!row.intervalo_inicio&&row.intervalo_fim)||(row.intervalo_inicio&&row.intervalo_fim&&row.intervalo_inicio>=row.intervalo_fim)){alert("Confira o intervalo de "+days[i]);return}let {error}=await db.from("disponibilidade_semanal").upsert(row,{onConflict:"dia_semana"});if(error){alert(error.message);return}}alert("Disponibilidade salva.");loadHours()});
 $("#blockForm").addEventListener("submit",async e=>{e.preventDefault();let f=e.currentTarget,d=Object.fromEntries(new FormData(f));d.dia_inteiro=f.elements.dia_inteiro.checked;if(d.dia_inteiro){d.horario_inicio=null;d.horario_fim=null}else if(!d.horario_inicio||!d.horario_fim||d.horario_inicio>=d.horario_fim){alert("Informe um intervalo válido.");return}let {error}=await db.from("bloqueios").insert(d);if(error)alert(error.message);else{f.reset();loadHours()}});
 document.addEventListener("click",async e=>{let b=e.target.closest("[data-block-delete]");if(b&&confirm("Remover bloqueio?")){let {error}=await db.from("bloqueios").delete().eq("id",b.dataset.blockDelete);if(error)alert(error.message);loadHours()}});
 async function loadSettings(){let {data,error}=await db.from("configuracoes").select("*").limit(1).maybeSingle();if(error)return;let f=$("#settingsForm");if(data)Object.entries(data).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v??""})}
 $("#settingsForm").addEventListener("submit",async e=>{e.preventDefault();let d=Object.fromEntries(new FormData(e.currentTarget));let {data:old}=await db.from("configuracoes").select("id").limit(1).maybeSingle();let q=old?db.from("configuracoes").update(d).eq("id",old.id):db.from("configuracoes").insert(d);let {error}=await q;if(error)alert(error.message);else alert("Configurações atualizadas com sucesso.")});

 // Gerenciamento seguro de administradores via Edge Function (SERVICE_ROLE_KEY somente no servidor).
 let administratorRows=[];
 async function callAdminManager(payload){
   const {data,error}=await db.functions.invoke("manage-admins",{body:payload});
   if(error)throw new Error(error.message||"Falha ao comunicar com o servidor.");
   if(data?.error)throw new Error(data.error);
   return data;
 }
 async function loadAdministrators(){
   const box=$("#administratorsTable");
   box.textContent="Carregando administradores...";
   try{
     const data=await callAdminManager({action:"list"});
     administratorRows=data.users||[];
     box.innerHTML=administratorRows.length?`<table><thead><tr><th>Nome</th><th>E-mail</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>${administratorRows.map(a=>`<tr><td>${esc(a.name||"—")}</td><td>${esc(a.email||"—")}</td><td>${a.created_at?new Date(a.created_at).toLocaleDateString("pt-BR"):"—"}</td><td><button type="button" data-edit-admin="${esc(a.id)}">Editar</button><button type="button" class="danger-button" data-delete-admin="${esc(a.id)}" ${a.id===currentUserId?"disabled title='Não é possível excluir a própria conta'":""}>Excluir</button></td></tr>`).join("")}</tbody></table>`:"Nenhum administrador cadastrado.";
   }catch(err){box.textContent="Não foi possível carregar os administradores: "+err.message;}
 }
 let currentUserId=null;
 const adminForm=$("#administratorForm");
 function openAdministratorForm(row=null){
   adminForm.reset();adminForm.classList.remove("hidden");
   adminForm.elements.id.value=row?.id||"";
   adminForm.elements.name.value=row?.name||"";
   adminForm.elements.email.value=row?.email||"";
   adminForm.elements.password.value="";
   adminForm.elements.password.required=!row;
   $("#administratorFormTitle").textContent=row?"Editar administrador":"Adicionar administrador";
   $("#administratorPasswordHint").textContent=row?"Deixe a senha em branco para mantê-la. Se preencher, a senha será atualizada.":"A senha é obrigatória e deve ter pelo menos 8 caracteres.";
   $("#administratorFormFeedback").textContent="";
   adminForm.scrollIntoView({behavior:"smooth",block:"start"});
 }
 $("#newAdministrator").addEventListener("click",()=>openAdministratorForm());
 $("#cancelAdministrator").addEventListener("click",()=>adminForm.classList.add("hidden"));
 adminForm.addEventListener("submit",async e=>{
   e.preventDefault();
   const f=e.currentTarget,id=f.elements.id.value;
   const payload={action:id?"update":"create",id,name:f.elements.name.value.trim(),email:f.elements.email.value.trim(),password:f.elements.password.value};
   if(!payload.password)delete payload.password;
   const submit=$("#saveAdministrator");submit.disabled=true;
   try{
     await callAdminManager(payload);
     feedback($("#administratorFormFeedback"),id?"Administrador atualizado.":"Administrador criado com sucesso.",false);
     f.classList.add("hidden");await loadAdministrators();
   }catch(err){feedback($("#administratorFormFeedback"),err.message,true);}
   finally{submit.disabled=false;}
 });
 document.addEventListener("click",async e=>{
   const edit=e.target.closest("[data-edit-admin]");
   if(edit){const row=administratorRows.find(x=>x.id===edit.dataset.editAdmin);if(row)openAdministratorForm(row);return;}
   const del=e.target.closest("[data-delete-admin]");
   if(del){
     const row=administratorRows.find(x=>x.id===del.dataset.deleteAdmin);
     if(!row||del.disabled)return;
     if(!confirm(`Remover o acesso administrativo de ${row.email}? A conta de autenticação também será excluída e essa pessoa não poderá mais entrar.`))return;
     del.disabled=true;
     try{await callAdminManager({action:"delete",id:row.id});await loadAdministrators();}
     catch(err){alert("Não foi possível excluir o administrador: "+err.message);}
     finally{del.disabled=false;}
   }
 });

 checkSession();
})();
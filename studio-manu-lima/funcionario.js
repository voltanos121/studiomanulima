(()=>{
 const cfg=window.STUDIO_CONFIG||{},db=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY),$=s=>document.querySelector(s);
 const synthetic=u=>`${String(u).trim().toLowerCase()}@staff.studiomanulima.com`;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
 function msg(t){$("#employeeFeedback").textContent=t;$("#employeeFeedback").className="form-feedback error";}
 function table(rows,empty){if(!rows.length)return `<p class="hint">${empty}</p>`;return `<table><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Serviço</th><th>Data</th><th>Horário</th><th>Status</th><th>Observações</th><th>Código</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.clientes?.nome||"Cliente")}</td><td>${esc(a.clientes?.telefone||"—")}</td><td>${esc(a.servicos?.nome||"—")}</td><td>${new Date(a.data+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>${String(a.horario_inicio).slice(0,5)}–${String(a.horario_fim).slice(0,5)}</td><td><span class="status ${esc(a.status)}">${esc(a.status)}</span></td><td>${esc(a.observacoes||"—")}</td><td>${esc(a.codigo||"—")}</td></tr>`).join("")}</tbody></table>`}
 async function show(user){
  const {data:profile,error}=await db.from("profissionais").select("id,nome").eq("auth_user_id",user.id).eq("ativo",true).maybeSingle();
  if(error||!profile){await db.auth.signOut();msg("Este acesso não está vinculado a um funcionário ativo. Fale com a administradora.");return;}
  $("#employeeLogin").classList.add("hidden");$("#employeeArea").classList.remove("hidden");$("#employeeLogout").classList.remove("hidden");$("#employeeName").textContent=`Olá, ${profile.nome}`;
  const {data,error:e}=await db.from("agendamentos").select("id,codigo,data,horario_inicio,horario_fim,status,observacoes,clientes(nome,telefone),servicos(nome,preco)").eq("profissional_id",profile.id).order("data",{ascending:true}).order("horario_inicio",{ascending:true});
  if(e){$("#myUpcoming").textContent="Não foi possível carregar sua agenda. Confira as permissões RLS.";return;}
  const rows=data||[],upcoming=rows.filter(a=>a.data>=today()&&!["cancelado","concluido"].includes(a.status)),history=rows.filter(a=>a.data<today()||["cancelado","concluido"].includes(a.status));
  $("#myUpcomingCount").textContent=upcoming.length;$("#myCompletedCount").textContent=rows.filter(a=>a.status==="concluido").length;
  $("#myUpcoming").innerHTML=table(upcoming,"Você não possui próximos atendimentos.");$("#myHistory").innerHTML=table(history.slice().reverse(),"Seu histórico aparecerá aqui após os primeiros atendimentos.");
 }
 $("#employeeLoginForm").addEventListener("submit",async e=>{e.preventDefault();if(!db){msg("Configure o Supabase primeiro.");return;}const f=new FormData(e.currentTarget);const {data,error}=await db.auth.signInWithPassword({email:synthetic(f.get("username")),password:f.get("password")});if(error){msg("Usuário ou senha incorretos.");return;}await show(data.user);});
 $("#employeeLogout").addEventListener("click",async()=>{await db.auth.signOut();location.reload();});
 if(db)db.auth.getSession().then(({data})=>{if(data.session)show(data.session.user)});
})();
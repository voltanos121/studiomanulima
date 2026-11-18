(() => {
  const cfg = window.STUDIO_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("COLE_AQUI") && !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = s => document.querySelector(s);
  const money = v => Number(v || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const phoneDigits = v => String(v || "").replace(/\D/g,"");
  let services = [], staffMembers = [], selectedSlot = null, settings = {};

  $("#year").textContent = new Date().getFullYear();
  $("#menuToggle").addEventListener("click", () => {
    const nav = $("#mainNav"); const open = nav.classList.toggle("open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
  });
  $("#mainNav").querySelectorAll("a").forEach(a => a.addEventListener("click",()=>$("#mainNav").classList.remove("open")));
  $("#modalClose").addEventListener("click",()=>$("#successModal").classList.remove("open"));
  $("#successModal").addEventListener("click",e=>{if(e.target.id==="successModal")e.currentTarget.classList.remove("open")});

  function setWhatsApp(number) {
    const n = phoneDigits(number || cfg.WHATSAPP || "5522992072123");
    const url = `https://wa.me/${n}`;
    $("#whatsappFloat").href = url;
    return n;
  }
  function mapsUrl(address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || "Av. Gladstone de Oliveira, Araruama, RJ, Brasil")}`;
  }
  function applySettings(s) {
    settings = s || {};
    const wa = setWhatsApp(settings.whatsapp || cfg.WHATSAPP);
    const tel = settings.telefone || "+55 22 99207-2123";
    const address = settings.endereco || "Av. Gladstone de Oliveira - Araruama, RJ, 28980-680";
    $("#contactPhone").textContent = tel; $("#contactPhone").href = `tel:${phoneDigits(tel)}`;
    $("#contactAddress").textContent = address; $("#mapAddress").textContent = address;
    const m = settings.link_maps || mapsUrl(address);
    $("#mapsButton").href = m; $("#mapOpen").href = m;
    $("#mapFrame").src = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
    if(settings.descricao) $("#aboutText").textContent = settings.descricao;
    $("#contactHours").textContent = "Consulte os dias e horários disponíveis diretamente no agendamento online.";
    if(settings.nome_estudio) document.title = `${settings.nome_estudio} | Nail Designer`;
    return wa;
  }
  async function loadSettings() {
    if(!db) return applySettings({});
    const {data,error}=await db.from("configuracoes").select("*").limit(1).maybeSingle();
    if(error) console.warn(error); return applySettings(data || {});
  }
  function serviceCard(s) {
    const image = s.imagem_url || "https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=700&q=80";
    return `<article class="service-card"><div class="service-image" style="background-image:url('${escapeAttr(image)}')"></div><h3>${escapeHtml(s.nome)}</h3><p>${escapeHtml(s.descricao || "Um cuidado especial pensado para você.")}</p><div class="service-meta"><span class="service-price">${money(s.preco)}</span><span class="service-duration">${Number(s.duracao_minutos || 30)} min</span></div><button class="button button-dark" data-book-service="${s.id}">Agendar este serviço ↗</button></article>`;
  }
  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function escapeAttr(v){return escapeHtml(v).replace(/`/g,"&#96;");}
  async function loadServices() {
    if(!db){ $("#servicesGrid").innerHTML='<div class="loading-card">Configure o Supabase para carregar os serviços cadastrados. Os serviços poderão ser gerenciados pelo painel administrativo.</div>'; $("#serviceSelect").innerHTML='<option value="">Banco de dados não configurado</option>'; return; }
    const {data,error}=await db.from("servicos").select("*").eq("ativo",true).order("ordem").order("nome");
    if(error){$("#servicesGrid").innerHTML='<div class="loading-card">Não foi possível carregar os serviços. Verifique a configuração do banco de dados.</div>';return;}
    services=data||[];
    $("#servicesGrid").innerHTML=services.length?services.map(serviceCard).join(""):'<div class="loading-card">Nenhum serviço disponível no momento.</div>';
    $("#serviceSelect").innerHTML='<option value="">Selecione um procedimento</option>'+services.map(s=>`<option value="${s.id}">${escapeHtml(s.nome)} · ${money(s.preco)} · ${s.duracao_minutos} min</option>`).join("");
    document.querySelectorAll("[data-book-service]").forEach(b=>b.addEventListener("click",()=>{ $("#serviceSelect").value=b.dataset.bookService; $("#agenda").scrollIntoView({behavior:"smooth"}); loadSlots();}));
  }
  async function loadStaff() {
    const select = $("#staffSelect");
    if (!db) { select.innerHTML='<option value="">Configure o banco de dados</option>'; return; }
    const {data,error}=await db.rpc("get_public_staff");
    if(error){console.warn(error);select.innerHTML='<option value="">Não foi possível carregar</option>';return;}
    staffMembers=data||[];
    select.innerHTML='<option value="">Selecione quem fará seu atendimento</option>'+staffMembers.map(x=>{
      const score=Number(x.media_avaliacoes||0), count=Number(x.total_avaliacoes||0);
      const rating=count?` · ★ ${score.toFixed(1).replace(".",",")} (${count})`:"";
      return `<option value="${x.id}">${escapeHtml(x.nome)}${x.tipo==="admin"?" · Administradora":""}${rating}</option>`;
    }).join("");
  }
  async function loadGallery() {
    if(!db){$("#galleryGrid").innerHTML='<div class="loading-card">A galeria será carregada após configurar o banco de dados.</div>';return;}
    const {data,error}=await db.from("galeria").select("*").eq("ativo",true).order("ordem");
    if(error){$("#galleryGrid").innerHTML='<div class="loading-card">Não foi possível carregar a galeria.</div>';return;}
    const rows=data||[], categories=[...new Set(rows.map(x=>x.categoria).filter(Boolean))];
    $("#galleryFilters").innerHTML='<button class="filter active" data-filter="all">Todas</button>'+categories.map(c=>`<button class="filter" data-filter="${escapeAttr(c)}">${escapeHtml(c)}</button>`).join("");
    $("#galleryGrid").innerHTML=rows.length?rows.map(x=>`<figure class="gallery-item" data-category="${escapeAttr(x.categoria||"")}"><img loading="lazy" src="${escapeAttr(x.imagem_url)}" alt="${escapeAttr(x.titulo||"Trabalho do Studio Manu Lima")}"><figcaption class="gallery-caption">${escapeHtml(x.titulo||x.categoria||"Studio Manu Lima")}</figcaption></figure>`).join(""):'<div class="loading-card">As novidades da galeria aparecerão aqui em breve.</div>';
    $("#galleryFilters").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{ $("#galleryFilters").querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#galleryGrid").querySelectorAll(".gallery-item").forEach(item=>item.hidden=b.dataset.filter!=="all"&&item.dataset.category!==b.dataset.filter);}));
  }
  function todayLocal(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  $("#bookingDate").min=todayLocal();
  $("#bookingDate").addEventListener("change",loadSlots);
  $("#serviceSelect").addEventListener("change",loadSlots);
  $("#staffSelect").addEventListener("change",loadSlots);
  async function loadSlots(){
    selectedSlot=null;$("#selectedTime").value="";
    const date=$("#bookingDate").value, service=$("#serviceSelect").value, staff=$("#staffSelect").value, holder=$("#slots");
    if(!date||!service||!staff){holder.innerHTML='<p class="muted">Selecione um serviço e uma data para consultar os horários.</p>';return;}
    if(date<todayLocal()){holder.innerHTML='<p class="muted">Escolha uma data futura.</p>';return;}
    if(!db){holder.innerHTML='<p class="muted">Configure o banco de dados para consultar a disponibilidade real.</p>';return;}
    holder.innerHTML='<p class="muted">Consultando disponibilidade...</p>';
    const {data,error}=await db.rpc("get_available_slots",{p_date:date,p_service_id:service,p_staff_id:staff});
    if(error){console.error(error);holder.innerHTML='<p class="muted">Não foi possível consultar os horários. Tente novamente.</p>';return;}
    if(!data?.length){holder.innerHTML='<p class="muted">Não há horários disponíveis nesta data. Escolha outro dia.</p>';return;}
    holder.innerHTML=data.map(x=>`<button type="button" class="slot" data-time="${x.start_time}">${String(x.start_time).slice(0,5)}–${String(x.end_time).slice(0,5)}</button>`).join("");
    holder.querySelectorAll(".slot").forEach(b=>b.addEventListener("click",()=>{holder.querySelectorAll(".slot").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");selectedSlot=b.dataset.time;$("#selectedTime").value=selectedSlot;}));
  }
  $("#bookingForm").addEventListener("submit",async e=>{
    e.preventDefault();const feedback=$("#bookingFeedback"),btn=$("#bookingSubmit");
    feedback.className="form-feedback";feedback.textContent="";
    if(!db){feedback.classList.add("error");feedback.textContent="O agendamento online ainda não está conectado ao banco de dados. Entre em contato pelo WhatsApp.";return;}
    if(!fStaffSelected()){feedback.classList.add("error");feedback.textContent="Selecione a profissional que fará seu atendimento.";return;}
    if(!selectedSlot){feedback.classList.add("error");feedback.textContent="Selecione um horário disponível.";return;}
    const f=new FormData(e.currentTarget), service=services.find(s=>s.id===f.get("service")), professional=staffMembers.find(x=>x.id===f.get("staff"));
    if(!service){feedback.classList.add("error");feedback.textContent="Selecione um serviço válido.";return;}
    if(!professional){feedback.classList.add("error");feedback.textContent="Selecione uma profissional válida.";return;}
    btn.disabled=true;btn.textContent="Registrando solicitação...";
    const payload={p_name:String(f.get("name")).trim(),p_phone:String(f.get("phone")).trim(),p_service_id:f.get("service"),p_staff_id:f.get("staff"),p_date:f.get("date"),p_start_time:selectedSlot,p_notes:String(f.get("notes")||"").trim()};
    const {data,error}=await db.rpc("create_booking",payload);
    btn.disabled=false;btn.innerHTML='Solicitar agendamento <span>↗</span>';
    if(error||!data?.success){feedback.classList.add("error");feedback.textContent=data?.message||"Este horário acabou de ficar indisponível. Atualizamos a agenda; escolha outro horário.";await loadSlots();return;}
    // A notificação automática à profissional é enviada no servidor pela WhatsApp Cloud API.
    // Falhas na notificação não desfazem a reserva já gravada.
    db.functions.invoke("notify-staff-booking",{body:{booking_code:data.code,booking_phone:payload.p_phone}})
      .then(({error:notifyError})=>{if(notifyError)console.warn("Reserva salva, mas a notificação WhatsApp da profissional falhou:",notifyError);})
      .catch(err=>console.warn("Falha ao chamar notificação WhatsApp:",err));
    const start=String(data.start_time).slice(0,5),end=String(data.end_time).slice(0,5);
    const dateLabel=new Date(`${payload.p_date}T12:00:00`).toLocaleDateString("pt-BR");
    const wa=settings.whatsapp||cfg.WHATSAPP||"5522992072123";
    const message=`Olá! Acabei de solicitar um agendamento pelo site do Studio Manu Lima.\n\nNome: ${payload.p_name}\nProfissional: ${professional.nome}\nServiço: ${service.nome}\nData: ${dateLabel}\nHorário: ${start} às ${end}\nCódigo: ${data.code}\n\nGostaria de confirmar meu atendimento.`;
    $("#successDetails").textContent=`${service.nome} com ${professional.nome} · ${dateLabel} · ${start} às ${end}. Código: ${data.code}.`;
    $("#successWhatsApp").href=`https://wa.me/${phoneDigits(wa)}?text=${encodeURIComponent(message)}`;
    $("#successModal").classList.add("open");e.currentTarget.reset();$("#bookingDate").min=todayLocal();$("#slots").innerHTML='<p class="muted">Selecione um serviço e uma data para consultar os horários.</p>';selectedSlot=null;
  });
  function fStaffSelected(){return Boolean($("#staffSelect").value);}
  $("#reviewForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget, feedback=$("#reviewFeedback"), button=$("#reviewSubmit");
    feedback.className="form-feedback";feedback.textContent="";
    if(!db){feedback.classList.add("error");feedback.textContent="O sistema de avaliações estará disponível após configurar o banco de dados.";return;}
    const f=new FormData(form);
    const payload={p_code:String(f.get("code")||"").trim().toUpperCase(),p_phone:String(f.get("phone")||"").trim(),p_rating:Number(f.get("rating")),p_comment:String(f.get("comment")||"").trim()};
    if(!payload.p_code||!payload.p_phone||payload.p_rating<1||payload.p_rating>5){feedback.classList.add("error");feedback.textContent="Preencha o código, WhatsApp e uma nota de 1 a 5.";return;}
    button.disabled=true;button.textContent="Enviando avaliação...";
    const {data,error}=await db.rpc("submit_staff_review",payload);
    button.disabled=false;button.textContent="Enviar avaliação ↗";
    if(error||!data?.success){feedback.classList.add("error");feedback.textContent=data?.message||"Não foi possível registrar. Confira o código, o WhatsApp e se o atendimento já foi concluído.";return;}
    feedback.classList.add("success");feedback.textContent=`Obrigada! Sua avaliação de ${data.profissional} foi registrada.`;
    form.reset();await loadStaff();
  });
  async function init(){await loadSettings();await Promise.all([loadServices(),loadStaff(),loadGallery()]);}
  init();
})();
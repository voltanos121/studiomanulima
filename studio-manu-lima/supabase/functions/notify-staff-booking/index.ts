import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("WHATSAPP_ACCESS_TOKEN"),phoneId=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const template=Deno.env.get("WHATSAPP_TEMPLATE_NAME")||"novo_agendamento_studio",lang=Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE")||"pt_BR",version=Deno.env.get("WHATSAPP_GRAPH_VERSION")||"v23.0";
  if(!url||!key)throw new Error("Configuração do Supabase ausente.");
  const {booking_code,booking_phone}=await req.json(),code=String(booking_code||"").trim().toUpperCase();
  if(!/^[A-F0-9]{8,16}$/.test(code))return reply({success:false,message:"Código de reserva inválido."},400);
  const db=createClient(url,key);
  const {data:b,error}=await db.from("agendamentos").select("id,codigo,data,horario_inicio,horario_fim,observacoes,clientes(nome,telefone),servicos(nome),profissionais(nome,whatsapp,whatsapp_opt_in)").eq("codigo",code).maybeSingle();
  if(error||!b)return reply({success:false,message:"Reserva não encontrada."},404);
  const staff=Array.isArray(b.profissionais)?b.profissionais[0]:b.profissionais,client=Array.isArray(b.clientes)?b.clientes[0]:b.clientes,service=Array.isArray(b.servicos)?b.servicos[0]:b.servicos;
  const submittedPhone=String(booking_phone||"").replace(/\D/g,"");
  if(!submittedPhone||submittedPhone!==String(client?.telefone||"").replace(/\D/g,""))return reply({success:false,message:"Dados da reserva não conferem."},403);
  if(!staff?.whatsapp||!staff.whatsapp_opt_in){await db.from("whatsapp_notificacoes").upsert({agendamento_id:b.id,status:"ignorado",mensagem_erro:"Sem WhatsApp ou sem consentimento."},{onConflict:"agendamento_id"});return reply({success:true,skipped:true});}
  if(!token||!phoneId)throw new Error("Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.");
  const {data:old}=await db.from("whatsapp_notificacoes").select("status").eq("agendamento_id",b.id).maybeSingle();
  if(old?.status==="enviado")return reply({success:true,already_sent:true});
  await db.from("whatsapp_notificacoes").upsert({agendamento_id:b.id,status:"pendente",mensagem_erro:null,enviado_em:null},{onConflict:"agendamento_id"});
  const date=new Date(`${b.data}T12:00:00`).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"}),time=`${String(b.horario_inicio).slice(0,5)} às ${String(b.horario_fim).slice(0,5)}`;
  const params=[client?.nome||"Cliente",client?.telefone||"Não informado",service?.nome||"Serviço",date,time,b.observacoes||"Sem observações",b.codigo].map(v=>({type:"text",text:String(v)}));
  const resp=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:String(staff.whatsapp).replace(/\D/g,""),type:"template",template:{name:template,language:{code:lang},components:[{type:"body",parameters:params}]}})});
  const result=await resp.json();if(!resp.ok){const message=result?.error?.message||"Falha na API do WhatsApp.";await db.from("whatsapp_notificacoes").update({status:"falhou",mensagem_erro:message}).eq("agendamento_id",b.id);throw new Error(message);}
  await db.from("whatsapp_notificacoes").update({status:"enviado",enviado_em:new Date().toISOString(),mensagem_erro:null}).eq("agendamento_id",b.id);
  return reply({success:true});
 }catch(e){return reply({success:false,message:e instanceof Error?e.message:"Erro ao enviar WhatsApp."},400);}
});
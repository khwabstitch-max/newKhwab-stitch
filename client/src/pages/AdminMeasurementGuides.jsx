import { useState } from "react";
import { useResource } from "../lib/hooks";
import { api } from "../lib/api";
import { t, localize } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { CatalogueImages } from "../components/CatalogueImages";
import { OptionPreview } from "../components/VisualOptions";
import { ListPager } from "../components/ListPager";
import { Button, ErrorMessage, Field, PageHeading } from "../components/ui";
const blank={code:"",name:"",nameHi:"",garment:"kurti",method:"garment",language:"und",instructions:"",instructionsHi:"",measurementFields:[],imageMediaIds:[],status:"draft",displayOrder:0};
export function AdminMeasurementGuides(){
  useLanguage();const[page,setPage]=useState(1),resource=useResource(`/admin/measurement-guides?page=${page}&limit=20`);
  const[editing,setEditing]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
  const patch=(key,value)=>setEditing(previous=>({...previous,[key]:value}));
  return <><PageHeading title={t("Measurement guides")} action={<button className="button" onClick={()=>setEditing({...blank})}>{t("New measurement guide")}</button>}/><p>{t("Publish each guide only for the garment, method and language it actually explains. A garment illustration is not a body guide.")}</p><ErrorMessage message={error||resource.error} retry={resource.reload}/>
    {editing && <form className="panel" onSubmit={async event=>{event.preventDefault();setBusy(true);try{const body=Object.fromEntries(Object.keys(blank).map(key=>[key,editing[key]??blank[key]]));body.displayOrder=Number(body.displayOrder);if(editing._id)body.revision=editing.revision;await api(`/admin/measurement-guides${editing._id?"/"+editing._id:""}`,{method:editing._id?"PATCH":"POST",body});setEditing(null);resource.reload();setError("");}catch(error){setError(error);}finally{setBusy(false);}}}>
      <div className="form-grid">{[["code","Stable guide code"],["name","Guide name"],["nameHi","Hindi guide name"]].map(([key,label])=><Field key={key} label={t(label)} name={`guide-${key}`} required={key!=="nameHi"} value={editing[key]||""} onChange={event=>patch(key,event.target.value)}/>)}
      {[["garment",["kurti","blouse","suit","alteration"]],["method",["body","garment"]],["language",["en","hi","und"]],["status",["draft","published","archived"]]].map(([key,values])=><Field key={key} label={t(`Guide ${key}`)} name={`guide-${key}`}><select id={`guide-${key}`} value={editing[key]} onChange={event=>patch(key,event.target.value)}>{values.map(value=><option key={value} value={value}>{value}</option>)}</select></Field>)}
      <Field label={t("Display order")} name="guide-order" type="number" value={editing.displayOrder} onChange={event=>patch("displayOrder",event.target.value)}/></div>
      {["instructions","instructionsHi"].map(key=><Field key={key} label={t(key==="instructions"?"Guide instructions":"Hindi instructions")} name={`guide-${key}`}><textarea id={`guide-${key}`} value={editing[key]||""} maxLength={2500} onChange={event=>patch(key,event.target.value)}/></Field>)}
      <Field label={t("Explained measurement keys (comma separated)")} name="guide-fields" value={(editing.measurementFields||[]).join(",")} onChange={event=>patch("measurementFields",event.target.value.split(",").map(value=>value.trim()).filter(Boolean))}/>
      <CatalogueImages ids={editing.imageMediaIds||[]} onChange={ids=>patch("imageMediaIds",ids)}/><div className="stack-actions"><Button className="button" busy={busy}>{t("Save guide")}</Button><button type="button" className="button secondary" onClick={()=>setEditing(null)}>{t("Cancel")}</button></div>
    </form>}
    {resource.loading && <p role="status">{t("Loading guides…")}</p>}
    {resource.data?.map(guide=><article className="panel" key={guide._id}><p className="eyebrow">{guide.code} · {guide.status}</p><h2>{localize(guide,"name")}</h2><p>{guide.garment} · {guide.method} · {guide.language}</p><p>{localize(guide,"instructions")}</p><div className="stack-actions"><button className="button secondary small" onClick={()=>setEditing({...blank,...guide})}>{t("Edit guide")}</button>{guide.images?.length>0 && <button className="text-button" onClick={event=>setPreview({ ...guide, imageUrl:guide.images[0].url, description:guide.instructions, descriptionHi:guide.instructionsHi, returnFocus:event.currentTarget, guide:true })}>{t("Preview")}</button>}{[false,true].map(permanent=><button className="text-button danger" key={String(permanent)} onClick={async()=>{if(!window.confirm(t(permanent?"Permanently delete this unused guide?":"Archive this guide?")))return;try{await api(`/admin/measurement-guides/${guide._id}`,{method:"DELETE",body:{revision:guide.revision,permanent}});resource.reload();}catch(error){setError(error);}}}>{t(permanent?"Delete unused guide permanently":"Archive guide")}</button>)}</div></article>)}
    {!resource.loading&&!resource.data?.length&&<p>{t("No measurement guides yet")}</p>}<ListPager label="Guide pagination" resource={resource} page={page} onChange={setPage}/>
    {preview&&<OptionPreview option={preview} returnFocus={preview.returnFocus} onClose={()=>setPreview(null)}/>}
  </>;
}

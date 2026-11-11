import { useState } from "react";
import { usePagedCollection } from "../lib/usePagedCollection";
import { uploadMedia } from "../lib/media";
import { t } from "../i18n/core";
import { ErrorMessage, UploadButton } from "./ui";
export function CatalogueImages({ ids = [], onChange }) {
  const resource = usePagedCollection("/media?purpose=catalogue&limit=20");
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  return <fieldset><legend>{t("Public catalogue images")}</legend>
    <ErrorMessage message={error || resource.error} retry={resource.reload} />
    <UploadButton label={busy ? t("Uploading…") : t("Upload catalogue image")} disabled={busy || ids.length >= 8} onChange={async event=>{
      const file=event.target.files?.[0];event.target.value="";if(!file)return;setBusy(true);
      try{const {data}=await uploadMedia(file,"catalogue");onChange([...new Set([...ids,data._id])]);resource.refresh();setError("");}catch(error){setError(error);}finally{setBusy(false);}
    }} />
    <div className="media-choice-grid">{resource.data.filter(image=>!image.private && image.purpose==="catalogue").map(image=><label className={`media-choice ${ids.includes(image._id)?"selected":""}`} key={image._id}><input type="checkbox" checked={ids.includes(image._id)} disabled={!ids.includes(image._id)&&ids.length>=8} onChange={event=>onChange(event.target.checked?[...ids,image._id]:ids.filter(id=>id!==image._id))}/>{image.url && <img src={image.url} alt={t("Catalogue image")} loading="lazy"/>}</label>)}</div>
    {ids.map((id,index)=><button type="button" className="text-button" key={id} onClick={()=>onChange(ids.filter(value=>value!==id))}>{t("Remove image")} {index+1}</button>)}
    {resource.hasMore && <button className="text-button" type="button" disabled={resource.loading} onClick={resource.loadMore}>{t("Load more images")}</button>}
  </fieldset>;
}

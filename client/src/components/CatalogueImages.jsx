import { useEffect, useRef, useState } from "react";
import { usePagedCollection } from "../lib/usePagedCollection";
import { useResource } from "../lib/hooks";
import { uploadMedia } from "../lib/media";
import { t } from "../i18n/core";
import { ErrorMessage, UploadButton } from "./ui";

function CatalogueImageChoice({ image, index, selected, disabled, onChange }) {
  const resource = useResource(`/media/${image._id}/access`);
  const [failedUrl, setFailedUrl] = useState("");
  const url = resource.data?.url;
  const failed = Boolean(resource.error || (url && failedUrl === url));
  return <div className={`media-choice ${selected ? "selected" : ""}`}>
    <label><input type="checkbox" checked={selected} disabled={disabled} onChange={onChange} />
      {url && !failed ? <img src={url} width={image.width} height={image.height} alt="" loading="lazy" onError={() => setFailedUrl(url)} /> : <span className="media-choice-fallback">{t(resource.loading ? "Loading images…" : "Photo not yet available")}</span>}
      <span>{t("admin.photos.number", { 0: index + 1 })}</span>
    </label>
    {failed && <button type="button" className="text-button" disabled={disabled} onClick={() => { setFailedUrl(""); resource.reload(); }}>{t("Try again")}</button>}
  </div>;
}
export function CatalogueImages({ ids = [], onChange, max = 8, scope = "library", onBusyChange }) {
  const resource = usePagedCollection("/media?purpose=catalogue&limit=50");
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const current = useRef({ ids, onChange, scope });
  current.current = { ids, onChange, scope };
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const available = resource.data.filter(image => !image.private && image.purpose === "catalogue");
  return <fieldset disabled={busy}><legend>{t("Public catalogue images")}</legend>
    <p className="small-print">{t("admin.form.photosHelp")}</p>
    <ErrorMessage message={error || resource.error} retry={resource.reload} />
    <UploadButton label={busy ? t("Uploading…") : t("Upload catalogue image")} disabled={busy || (ids.length >= max && max > 1)} onChange={async event=>{
      const file=event.target.files?.[0];event.target.value="";if(!file)return;const uploadScope=scope;setBusy(true);onBusyChange?.(true);
      try{const {data}=await uploadMedia(file,"catalogue");if(active.current && current.current.scope === uploadScope){current.current.onChange([...new Set([...current.current.ids,data._id])].slice(-max));resource.refresh();setError("");}}catch(error){if(active.current && current.current.scope === uploadScope)setError(error);}finally{if(active.current){setBusy(false);onBusyChange?.(false);}}
    }} />
    {resource.loading && <p role="status">{t("admin.form.loadingPhotos")}</p>}
    {!resource.loading && !resource.error && !available.length && <p className="admin-image-library-empty">{t("admin.form.noPhotos")}</p>}
    <div className="media-choice-grid">{available.map((image,index)=><CatalogueImageChoice key={image._id} image={image} index={index} selected={ids.includes(image._id)} disabled={busy || (max > 1 && !ids.includes(image._id)&&ids.length>=max)} onChange={event=>onChange(event.target.checked?(max === 1 ? [image._id] : [...ids,image._id]):ids.filter(id=>id!==image._id))}/>)}</div>
    {ids.map((id,index)=><button type="button" className="text-button" key={id} onClick={()=>onChange(ids.filter(value=>value!==id))}>{t("Remove image")} {index+1}</button>)}
    {resource.hasMore && <button className="text-button" type="button" disabled={resource.loading} onClick={resource.loadMore}>{t("Load more images")}</button>}
  </fieldset>;
}

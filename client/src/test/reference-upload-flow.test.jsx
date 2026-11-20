import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async original => ({ ...(await original()), api: boundary.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { RequestWizard } from "../pages/Request";
import { createDraft, saveDraft, loadDraft } from "../lib/drafts";
import { setLanguage, t } from "../i18n/core";
const id = n => String(n).padStart(24, "0");
const list = data => ({ data, pagination: { page: 1, pages: 1, total: data.length } });
const png = name => {
 const bytes=new Uint8Array(64);bytes.set([137,80,78,71,13,10,26,10]);bytes.set([73,72,68,82],12);const v=new DataView(bytes.buffer);v.setUint32(16,80);v.setUint32(20,100);
 return new File([bytes],name,{type:"image/png"});
};
const pdf = name => new File(["%PDF-1.7\nreference board\n%%EOF"],name,{type:"application/pdf"});
let files, next;
beforeEach(() => {
 localStorage.clear();sessionStorage.clear();setLanguage("en",false);files=new Map();next=100;
 boundary.auth={profile:{_id:id(50),name:"Meera",phone:"919876543210"}};
 vi.spyOn(window,"scrollTo").mockImplementation(()=>{});
 boundary.api.mockReset().mockImplementation(async (path,request={})=>{
  if(path.startsWith("/designs")||path.startsWith("/options"))return list([]);
  if(path.startsWith("/services"))return list([{itemTypes:["kurti","suit","blouse","alteration"]}]);
  if(path==="/pricing/estimate")return {data:{knownSubtotalPaise:0,knownTransportSubtotalPaise:0,uploadedDesignReviewRequired:true,hasPending:true,lineItems:[],pendingItems:[],components:{},configurationVersion:"a".repeat(64)}};
  if(path==="/media"){
    const file=request.body.get("file"),mediaId=id(next++);
    files.set(mediaId,{filename:file.name,mimeType:file.type,bytes:file.size,url:"/private/"+file.name,...(file.type==="application/pdf"?{pageCount:3}:{})});
    return {data:{_id:mediaId,...files.get(mediaId)}};
  }
  if(path.includes("/access"))return {data:files.get(path.split("/")[2])||{url:"/private/existing.png",mimeType:"image/png",filename:"existing.png"}};
  return list([]);
 });
});
afterEach(()=>vi.restoreAllMocks());
function mount(initial={}){
 const draft=createDraft({configuration:{source:"reference",mode:"custom",components:{},changedParts:[],addonIds:[]},...initial});saveDraft(draft);
 render(<MemoryRouter initialEntries={["/request?draft="+draft.id+"&step="+(draft.step||"design")]}><RequestWizard/></MemoryRouter>);
 return draft;
}
it("accepts multiple JPEG/PNG/PDF references, preserves successful uploads when one fails and shows every reference in review",async()=>{
 const draft=mount(),user=userEvent.setup();
 const input=await screen.findByLabelText(t("request.references.add"));
 expect(input).toHaveAttribute("multiple");expect(input.accept).toContain("application/pdf");expect(input.accept).toContain("image/jpeg");expect(input.accept).toContain("image/png");
 expect(screen.getByText(t("request.references.views"))).toBeInTheDocument();
 await user.upload(input,[png("front.png"),new File(["invalid"],"bad.pdf",{type:"application/pdf"}),png("back.png"),pdf("all-views.pdf")]);
 await waitFor(()=>expect(loadDraft(draft.id).referenceMediaIds).toEqual([id(100),id(101),id(102)]));
 expect(screen.getByText("bad.pdf")).toBeInTheDocument();
 expect(await screen.findByRole("link",{name:/Open PDF/})).toHaveAttribute("href","/private/all-views.pdf");
 expect(boundary.api.mock.calls.filter(([path])=>path==="/media")).toHaveLength(3);
 await user.click(screen.getByRole("button",{name:"Continue"}));
 await user.click(screen.getByRole("button",{name:"Continue"}));
 await user.type(screen.getByLabelText(/^Your name/),"Meera");
 await user.type(screen.getByLabelText(/^WhatsApp/),"9876543210");
 await user.click(screen.getByRole("button",{name:"Continue"}));
 const region=await screen.findByRole("region",{name:t("request.references.review")});
 await within(region).findByText("front.png");await within(region).findByText("back.png");await within(region).findByText("all-views.pdf");
 expect(within(region).getAllByRole("link",{name:/Open PDF/})).toHaveLength(1);
 expect(screen.queryByRole("heading",{name:"₹300"})).not.toBeInTheDocument();
});
it("allows one combined PDF with three views instead of requiring three separate files",async()=>{
 const draft=mount(),user=userEvent.setup();
 await user.upload(await screen.findByLabelText(t("request.references.add")),pdf("front-side-back.pdf"));
 await waitFor(()=>expect(loadDraft(draft.id).referenceMediaIds).toHaveLength(1));
 await user.click(screen.getByRole("button",{name:"Continue"}));
 expect(screen.getByRole("heading",{name:"Your fit",level:2})).toBeInTheDocument();
});
it("rejects a batch beyond five total files before upload and retains the saved reference",async()=>{
 const draft=mount({referenceMediaIds:[id(80)]}),user=userEvent.setup();
 await user.upload(await screen.findByLabelText(t("request.references.add")),Array.from({length:5},(_,i)=>png("view-"+i+".png")));
 expect(await screen.findByRole("alert")).toHaveTextContent("Choose at most 4 more files");
 expect(boundary.api.mock.calls.filter(([path])=>path==="/media")).toHaveLength(0);
 expect(loadDraft(draft.id).referenceMediaIds).toEqual([id(80)]);
});
it("removing a reference clears only matching component associations",async()=>{
 const draft=mount({referenceMediaIds:[id(80),id(81)],configuration:{source:"reference",mode:"custom",changedParts:["neck","back"],components:{neck:{source:"reference",referenceMediaId:id(80),notes:"Keep neckline note"},back:{source:"reference",referenceMediaId:id(81)}},addonIds:[]}}),user=userEvent.setup();
 const remove=await screen.findAllByRole("button",{name:/Remove/});
 await user.click(remove[0]);
 await waitFor(()=>expect(loadDraft(draft.id).referenceMediaIds).toEqual([id(81)]));
 expect(loadDraft(draft.id).configuration.components.neck).toMatchObject({source:"reference",referenceMediaId:"",notes:"Keep neckline note"});
 expect(loadDraft(draft.id).configuration.components.back.referenceMediaId).toBe(id(81));
});
it("shows three-view upload guidance to guests and keeps private uploads behind sign-in",async()=>{
 boundary.auth={};mount();
 expect(await screen.findByText(t("request.references.views"))).toBeInTheDocument();
 expect(screen.getByRole("link",{name:"Sign in for private uploads"})).toBeInTheDocument();
 expect(document.querySelector('input[type="file"]')).toBeNull();
});

it("blocks continuation during a batch and preserves edits made while files upload",async()=>{
 const base=boundary.api.getMockImplementation();let release,waiting;
 boundary.api.mockImplementation((path,request={})=>{
  if(path==="/media"&&!waiting){waiting=request;return new Promise(resolve=>{release=resolve;});}
  return base(path,request);
 });
 const draft=mount({referenceMediaIds:[id(80)]}),user=userEvent.setup();
 await user.upload(await screen.findByLabelText(t("request.references.add")),png("front.png"));
 expect(screen.getByRole("button",{name:"Continue"})).toBeDisabled();
 await user.clear(screen.getByRole("spinbutton",{name:/Quantity/}));
 await user.type(screen.getByRole("spinbutton",{name:/Quantity/}),"2");
 await act(async()=>release(await base("/media",waiting)));
 await waitFor(()=>expect(loadDraft(draft.id).referenceMediaIds).toEqual([id(80),id(100)]));
 expect(loadDraft(draft.id).quantity).toBe("2");
 expect(screen.getByRole("button",{name:"Continue"})).toBeEnabled();
});
it("retries a failed file without discarding successfully uploaded files",async()=>{
 const base=boundary.api.getMockImplementation();let uploads=0;
 boundary.api.mockImplementation((path,request={})=>{
  if(path==="/media"&&++uploads===1)throw new Error("Temporary upload failure");
  return base(path,request);
 });
 const draft=mount(),user=userEvent.setup(),front=png("front.png");
 await user.upload(await screen.findByLabelText(t("request.references.add")),[front,png("back.png")]);
 await waitFor(()=>expect(loadDraft(draft.id).referenceMediaIds).toEqual([id(100)]));
 expect(screen.getByText("Temporary upload failure")).toBeInTheDocument();
 await user.upload(screen.getByLabelText(t("request.references.add")),front);
 await waitFor(()=>expect(loadDraft(draft.id).referenceMediaIds).toEqual([id(100),id(101)]));
 expect(screen.queryByText("Temporary upload failure")).not.toBeInTheDocument();
 expect(boundary.api.mock.calls.filter(([path])=>path==="/media")).toHaveLength(3);
});

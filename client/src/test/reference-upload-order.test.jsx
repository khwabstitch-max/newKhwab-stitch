import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const boundary=vi.hoisted(()=>({api:vi.fn()}));
vi.mock("../lib/api",async original=>({...await original(),api:boundary.api}));
vi.mock("../lib/auth",()=>({useAuth:()=>({profile:{_id:"a".repeat(24),role:"customer"}})}));
import { OrderDetails } from "../pages/Orders";
import { SiteProvider } from "../lib/hooks";
import { setLanguage } from "../i18n/core";
beforeEach(()=>{localStorage.clear();sessionStorage.clear();setLanguage("en",false);});
afterEach(()=>vi.restoreAllMocks());
it("opens an uploaded-reference order with configured WhatsApp support and a PDF attachment",async()=>{
 const orderId="b".repeat(24),mediaId="c".repeat(24);
 boundary.api.mockImplementation(async path=>{
  if(path==="/settings")return{data:{whatsapp:"919368136683",policies:{},support:{}}};
  if(path==="/orders/"+orderId)return{data:{_id:orderId,orderNumber:"KS-REFERENCE-TEST",garment:"kurti",quantity:1,status:"request_received",revision:0,createdAt:"2026-11-20T00:00:00Z",customer:{name:"Meera",phone:"9876543210"},measurements:{takenBy:"assistance",method:"assistance",unit:"in",values:{}},configuration:{source:"reference",mode:"custom",components:{}},logistics:{inbound:{method:"dropoff"},outbound:{method:"collect"}},referenceMediaIds:[mediaId],referenceSnapshots:[{mediaId,filename:"front-side-back.pdf",mimeType:"application/pdf",pageCount:1}],designSnapshot:null,quotes:[],timeline:[],estimate:{knownSubtotalPaise:0,uploadedDesignReviewRequired:true,lineItems:[],pendingItems:[{code:"stitching",label:"Stitching quote",reason:"Your uploaded design will be reviewed before we confirm stitching and customization prices."}],components:{},addons:[]}}};
  if(path==="/orders/"+orderId+"/media/"+mediaId)return{data:{url:"/private/front-side-back.pdf",filename:"front-side-back.pdf",mimeType:"application/pdf",pageCount:1}};
  return{data:[]};
 });
 render(<MemoryRouter initialEntries={["/orders/"+orderId]}><SiteProvider><Routes><Route path="/orders/:id" element={<OrderDetails/>}/></Routes></SiteProvider></MemoryRouter>);
 const contact=await screen.findByRole("link",{name:/Ask on WhatsApp/});
 expect(contact.href).toContain("https://wa.me/919368136683");
 expect(contact.href).toContain("KS-REFERENCE-TEST");
 expect(await screen.findByRole("link",{name:/Open PDF/})).toHaveAttribute("href","/private/front-side-back.pdf");
 expect(screen.getByRole("heading",{name:"Your design and reference files"})).toBeInTheDocument();
});

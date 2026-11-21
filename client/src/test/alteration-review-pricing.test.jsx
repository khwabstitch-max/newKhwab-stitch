import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const boundary=vi.hoisted(()=>({api:vi.fn(),site:{}}));
vi.mock("../lib/api",async original=>({...await original(),api:boundary.api}));
vi.mock("../lib/auth",()=>({useAuth:()=>({profile:{_id:"b".repeat(24),role:"customer"}})}));
vi.mock("../lib/hooks",async original=>({...await original(),useSite:()=>boundary.site}));
import { Home, DesignCard } from "../pages/Public";
import { OrderDetails } from "../pages/Orders";
import { setLanguage, t } from "../i18n/core";
const design={_id:"a".repeat(24),garment:"alteration",code:"A-0",slug:"garment-alteration",title:"Garment alterations",startingPricePaise:15000,defaultComponents:{},images:[]};
const list=data=>({data,pagination:{page:1,pages:1,total:data.length}});
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();setLanguage("en",false);
 boundary.site={garmentBasePrices:{alteration:15000},policies:{},homepage:{},faqs:[]};
 boundary.api.mockReset().mockImplementation(async path=>path.startsWith("/designs")?list([design]):path.startsWith("/services")?list([{itemTypes:["alteration"]}]):list([]));
});
afterEach(()=>vi.restoreAllMocks());
it("does not advertise an alteration rate in a catalogue card even when legacy data contains one",()=>{
 const {container}=render(<MemoryRouter><DesignCard design={design}/></MemoryRouter>);
 expect(screen.getByText(t("public.design.alterationPrice"))).toBeInTheDocument();
 expect(container.textContent).not.toMatch(/₹\s*150/);
});
it("ignores the configured legacy alteration starting price on the home page",async()=>{
 const {container}=render(<MemoryRouter><Home/></MemoryRouter>);
 await screen.findAllByText(t("public.design.alterationPrice"));
 expect(container.textContent).not.toMatch(/₹\s*150/);
});
it("shows only known transport in an alteration estimate and preserves the reviewed quote amount",async()=>{
 const orderId="c".repeat(24),order={_id:orderId,orderNumber:"ALT-REVIEW",garment:"alteration",quantity:1,status:"quote_sent",revision:0,createdAt:"2026-11-20T00:00:00Z",customer:{name:"Meera",phone:"9876543210"},measurements:{method:"assistance",takenBy:"assistance",unit:"in",values:{},notes:"Shorten the hem"},configuration:{source:"catalogue",mode:"exact",components:{}},referenceMediaIds:[],timeline:[],quotes:[{version:1,amountPaise:95000,currency:"INR",deliveryDate:"2027-01-20",notes:"Confirmed after garment review"}],estimate:{knownSubtotalPaise:23000,hasPending:true,lineItems:[{code:"stitching",scope:"garment",label:"Alteration service",amountPaise:15000},{code:"transport:inbound",scope:"shipment",label:"Fabric pickup",amountPaise:8000}],pendingItems:[{code:"alteration:assessment",label:"Garment assessment"}],components:{},addons:[]}};
 boundary.api.mockImplementation(async path=>path==="/orders/"+orderId?{data:order}:path.startsWith("/commerce/quote-benefits/")?{data:{revision:0,quoteVersion:1,preview:null}}:list([]));
 render(<MemoryRouter initialEntries={["/orders/"+orderId]}><Routes><Route path="/orders/:id" element={<OrderDetails/>}/></Routes></MemoryRouter>);
 await screen.findByRole("heading",{name:t("public.design.alterationPrice")});
 expect(screen.queryByText("₹150")).not.toBeInTheDocument();
 expect(screen.queryByRole("heading",{name:"₹230"})).not.toBeInTheDocument();
 expect(screen.getByText("₹80")).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"₹950"})).toBeInTheDocument();
});

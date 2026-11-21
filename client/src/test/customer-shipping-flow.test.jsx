import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { calculateEstimate, estimateInput } from "../../../server/src/pricing.js";
import { orderInput } from "../../../server/src/domain.js";
const boundary=vi.hoisted(()=>({api:vi.fn(),settings:{},quotesAvailable:true,estimates:[],now:0}));
vi.mock("../lib/api",async original=>({...await original(),api:boundary.api}));
vi.mock("../lib/auth",()=>({useAuth:()=>({profile:{_id:"f".repeat(24),name:"Meera",phone:"919876543210"}})}));
vi.mock("../lib/hooks",async original=>({...await original(),useSite:()=>boundary.settings}));
import { RequestWizard } from "../pages/Request";
import { createDraft, saveDraft, loadDraft } from "../lib/drafts";
import { requestParcel, requestLogistics } from "../lib/shipping";
import { setLanguage, t } from "../i18n/core";

const id=n=>n.toString(16).padStart(24,"0");
const design={_id:id(1),garment:"kurti",code:"K-0",title:"Shipping test kurti",startingPricePaise:30000,defaultComponents:{},coverImageUrl:"/design-library/teal-kurti-board.png"};
const address={line1:"12 Customer road",city:"Bengaluru",state:"Karnataka",pin:"560001"};
const own={inbound:{method:"dropoff"},outbound:{method:"collect"}};
const business={inbound:{method:"business",address},outbound:{method:"business",address}};
const knownParcel={weightGrams:750,lengthCm:25,widthCm:18,heightCm:8,declaredValuePaise:120050};
const list=data=>({data,pagination:{page:1,pages:1,total:data.length}});
const fill=(id,value)=>fireEvent.change(document.getElementById(id),{target:{value:String(value)}});
function trustQuotes(input){
  if(!boundary.quotesAvailable)return {};
  return Object.fromEntries(["inbound","outbound"].filter(leg=>input.logistics?.[leg]?.parcel).map(leg=>{
    const transport=input.logistics[leg];
    return [leg,{provider:"shiprocket",currency:"INR",originPin:leg==="inbound"?transport.address.pin:"110001",destinationPin:leg==="inbound"?"110001":transport.address.pin,parcel:transport.parcel,totalPaise:leg==="inbound"?7000:9000,chargeableWeightGrams:Math.max(1000,transport.parcel.weightGrams),courierId:"fixture-service",courierName:"Verified fixture carrier",service:"Surface",quotedAt:new Date(boundary.now-1000).toISOString(),validUntil:new Date(boundary.now+600000).toISOString(),source:"isolated-test"}];
  }));
}
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();setLanguage("en",false);boundary.now=Date.now();boundary.quotesAvailable=true;boundary.estimates=[];
  boundary.settings={policies:{},deliveryPricing:{mode:"courier",courierProvider:"shiprocket",originPin:"110001",inbound:{minimumChargePaise:10000},outbound:{minimumChargePaise:12000}}};
  vi.spyOn(window,"scrollTo").mockImplementation(()=>{});
  boundary.api.mockReset().mockImplementation(async(path,request={})=>{
    if(path.startsWith("/designs/id/"))return {data:design};
    if(path.startsWith("/designs"))return list([design]);
    if(path.startsWith("/options"))return list([]);
    if(path.startsWith("/services"))return list([{itemTypes:["kurti"]}]);
    if(path==="/pricing/estimate"){
      const input=estimateInput.parse(request.body);
      const distances=Object.fromEntries(["inbound","outbound"].map(leg=>[leg,{distanceMeters:4201,basis:"pin_area",originPin:"110001",destinationPin:input.logistics?.[leg]?.address?.pin,source:"GeoNames",sourceVersion:"fixture"}]));
      const result=calculateEstimate(input,{design,settings:boundary.settings,transportQuotes:trustQuotes(input),transportDistances:distances,now:boundary.now});
      boundary.estimates.push({input,result});return {data:result};
    }
    if(path==="/drafts")return {data:{_id:id(60),revision:0,data:request.body.data}};
    if(path==="/orders")return {data:{_id:id(70)}};
    return list([]);
  });
});
afterEach(()=>{vi.restoreAllMocks();setLanguage("en",false);});
function mount(initial={}){
  const draft=createDraft({designId:design._id,step:"logistics",customer:{name:"Meera",phone:"919876543210"},measurements:{method:"assistance",takenBy:"assistance",values:{}},logistics:business,...initial});
  saveDraft(draft);
  render(<MemoryRouter initialEntries={["/request?draft="+draft.id+"&step="+draft.step]}><Routes><Route path="/request" element={<RequestWizard/>}/><Route path="*" element={<p>Submitted shipping request</p>}/></Routes></MemoryRouter>);
  return draft;
}
const pricingRequests=()=>boundary.api.mock.calls.filter(([path,request])=>path==="/pricing/estimate"&&request.body.logistics);
const latestEstimate=()=>boundary.estimates.filter(entry=>entry.input.logistics).at(-1)?.result;
const continueForm=async()=>userEvent.click(screen.getByRole("button",{name:t("Continue")}));
async function fillParcel(direction,{declared=true}={}){
  const group=screen.getByRole("group",{name:t("shipping.parcel."+direction)});
  await userEvent.click(within(group).getByRole("checkbox",{name:t("shipping.parcel.known")}));
  fill(direction+"-parcel-weightGrams","750");fill(direction+"-parcel-lengthCm","25");fill(direction+"-parcel-widthCm","18");fill(direction+"-parcel-heightCm","8");
  if(declared)fill(direction+"-parcel-value","1200.50");
}
it("submits numeric courier parcel details and declared value, with the actual carrier quote and minimum adjustment separately visible",async()=>{
  mount();
  await screen.findByRole("group",{name:t("shipping.parcel.inbound")});
  await fillParcel("inbound");await fillParcel("outbound");
  expect(screen.queryByText("YOUR STITCHING ESTIMATE")).not.toBeInTheDocument();
  await continueForm();
  await screen.findByRole("heading",{name:"₹520"});
  expect(screen.getAllByText("Minimum-charge adjustment")).toHaveLength(2);
  expect(screen.getAllByText("+₹30")).toHaveLength(2);
  expect(screen.getByText("From PIN 560001 to PIN 110001")).toBeInTheDocument();
  expect(screen.getByText("From PIN 110001 to PIN 560001")).toBeInTheDocument();
  expect(screen.getAllByText("Parcel 0.75 kg · Courier chargeable weight 1 kg")).toHaveLength(2);
  await waitFor(()=>expect(pricingRequests().at(-1)[1].body.logistics.inbound.parcel).toEqual(knownParcel));
  expect(pricingRequests().at(-1)[1].body.logistics.outbound.parcel).toEqual(knownParcel);
  await userEvent.click(screen.getByRole("checkbox",{name:/I provide the fabric/}));
  await userEvent.click(screen.getByRole("button",{name:"Submit Stitching Request"}));
  await waitFor(()=>expect(boundary.api.mock.calls.some(([path])=>path==="/orders")).toBe(true));
  const body=boundary.api.mock.calls.find(([path])=>path==="/orders")[1].body;
  expect(body.logistics.inbound.parcel).toEqual(knownParcel);
  expect(body.logistics.outbound.parcel).toEqual(knownParcel);
  expect(orderInput.safeParse(body).success).toBe(true);
});
it("keeps incomplete parcel entry for later editing but omits it from estimates and leaves the carrier charge pending",async()=>{
  const draft=mount({logistics:{inbound:{method:"business",address},outbound:{method:"collect"}}});
  const group=await screen.findByRole("group",{name:t("shipping.parcel.inbound")});
  await userEvent.click(within(group).getByRole("checkbox",{name:t("shipping.parcel.known")}));
  fill("inbound-parcel-weightGrams","750");
  await continueForm();
  await screen.findByRole("heading",{name:"₹300"});
  await waitFor(()=>expect(latestEstimate()?.pendingItems.some(item=>item.code==="transport:inbound")).toBe(true));
  expect(latestEstimate().lineItems.some(item=>item.code==="transport:inbound")).toBe(false);
  expect(pricingRequests().at(-1)[1].body.logistics.inbound).not.toHaveProperty("parcel");
  await waitFor(()=>expect(loadDraft(draft.id).logistics.inbound.parcel?.weightGrams).toBe("750"));
  expect(screen.queryByText("Minimum-charge adjustment")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button",{name:"Edit Fabric and transport"}));
  expect(document.getElementById("inbound-parcel-weightGrams")).toHaveValue(750);
});
it("keeps a complete parcel and declared value when a connected courier cannot supply a live quote, without substituting a free shipment",async()=>{
  boundary.quotesAvailable=false;
  mount({logistics:{inbound:{method:"business",address,parcel:knownParcel},outbound:{method:"collect"}}});
  await screen.findByRole("group",{name:t("shipping.parcel.inbound")});
  await continueForm();
  await screen.findByRole("heading",{name:"₹300"});
  await waitFor(()=>expect(latestEstimate()?.pendingItems.some(item=>item.code==="transport:inbound")).toBe(true));
  expect(latestEstimate().lineItems.some(item=>item.code==="transport:inbound")).toBe(false);
  expect(pricingRequests().at(-1)[1].body.logistics.inbound.parcel.declaredValuePaise).toBe(120050);
  expect(screen.getByText(t("The connected courier's shipping rate is not available yet. We will confirm the transport charge before stitching."))).toBeInTheDocument();
});
it("prices the atelier's own per-km method without requiring parcel measurements and shows rounded distance plus both formula totals",async()=>{
  boundary.settings={policies:{},deliveryPricing:{mode:"distance",distanceBasis:"pin_area",formula:"base_plus_distance",originPin:"110001",inbound:{minimumChargePaise:4000,perKmPaise:800},outbound:{minimumChargePaise:5000,perKmPaise:1000}}};
  mount();
  await screen.findAllByText(t("request.transport.paidHint"));
  expect(screen.queryByRole("group",{name:t("shipping.parcel.inbound")})).not.toBeInTheDocument();
  await continueForm();
  await screen.findByRole("heading",{name:"₹480"});
  expect(screen.getAllByText("Approx. 4.201 km between PIN areas · Billed for 5 km")).toHaveLength(2);
  expect(screen.getByText("Minimum ₹40 + 5 km × ₹8 per km")).toBeInTheDocument();
  expect(screen.getByText("Minimum ₹50 + 5 km × ₹10 per km")).toBeInTheDocument();
  expect(screen.getAllByRole("link",{name:"GeoNames"})).toHaveLength(2);
  expect(pricingRequests().at(-1)[1].body.logistics.inbound).not.toHaveProperty("parcel");
});
it("keeps the customer parcel and pending quote flow readable in Hindi",async()=>{
  act(()=>setLanguage("hi",false));
  mount({logistics:{inbound:{method:"business",address},outbound:{method:"collect"}}});
  expect(await screen.findByRole("group",{name:t("shipping.parcel.inbound")})).toBeInTheDocument();
  expect(screen.getByText(t("shipping.parcel.hint"))).toBeInTheDocument();
  await continueForm();
  await screen.findByRole("heading",{name:"₹300"});
  expect(screen.getByText(t("Enter parcel weight and dimensions to check the connected courier's pickup or delivery charge."))).toBeInTheDocument();
});
it("normalizes parcel numeric strings without inventing missing dimensions and strips parcel data from self-arranged transport",()=>{
  expect(requestParcel({weightGrams:"750",lengthCm:"25",widthCm:"18",heightCm:"8",declaredValuePaise:"120050"})).toEqual(knownParcel);
  expect(requestParcel({weightGrams:"750",lengthCm:"25",widthCm:"18",heightCm:""})).toBeUndefined();
  expect(requestParcel({...knownParcel,weightGrams:"750.5"})).toBeUndefined();
  const selected=requestLogistics({inbound:{method:"business",address,parcel:{weightGrams:"750"}},outbound:{method:"customer_courier",parcel:knownParcel}});
  expect(selected.inbound).not.toHaveProperty("parcel");
  expect(selected.outbound).toEqual({method:"customer_courier"});
  expect(requestLogistics(own)).toEqual(own);
});

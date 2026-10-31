import { describe,it,expect,beforeEach } from "vitest";
import { clearMockData,setMockUser,setMockRpcResult,setMockData,getRpcCalls,getInsertCalls,getUpdateCalls } from "./setup";
beforeEach(()=>{clearMockData();setMockUser({id:"challenge-owner"});});
describe("Challenge RPC integration",()=>{
 it("settles historical weeks before getting the current challenge and exposes old unclaimed rewards",async()=>{
   setMockRpcResult("resolve_paper_challenges",{data:{settled:2}});
   setMockRpcResult("execute_paper_action",{data:{id:2,status:"active",picks:[]}});
   setMockData("paper_challenges",[{id:1,user_id:"challenge-owner",status:"completed",reward_claimed:false,reward_usd:600}]);
   const {GET}=await import("@/app/api/paper/challenge/route");const res=await GET();
   expect(res.status).toBe(200);expect((await res.json()).unclaimedRewards).toHaveLength(1);
   expect(getRpcCalls().map(c=>c.name)).toEqual(["resolve_paper_challenges","execute_paper_action"]);
   expect(getInsertCalls()).toHaveLength(0);expect(getUpdateCalls()).toHaveLength(0);
 });
 it("does not generate new picks if settlement fails",async()=>{
   setMockRpcResult("resolve_paper_challenges",{data:null,error:{message:"unavailable"}});
   const {GET}=await import("@/app/api/paper/challenge/route");expect((await GET()).status).toBe(503);
   expect(getRpcCalls()).toHaveLength(1);
 });
 it("claims a specific past challenge through the session owner",async()=>{
   setMockRpcResult("execute_paper_action",{data:{ok:true,reward:600}});
   const {POST}=await import("@/app/api/paper/challenge/route");const res=await POST(new Request("http://localhost",{method:"POST",body:JSON.stringify({action:"claim",challenge_id:1})}));
   expect(res.status).toBe(200);expect(getRpcCalls()[0].args).toMatchObject({p_user_id:"challenge-owner",p_action:"claim_reward",p_payload:{challenge_id:1}});
 });
 for(const [code,status] of [["P0400",400],["P0403",403],["P0404",404],["P0409",409],["P0429",429],["P0503",503]] as const){
   it(`preserves ${code} business rejection`,async()=>{
     setMockRpcResult("execute_paper_action",{data:null,error:{code,message:"Business rejection"}});
     const {POST}=await import("@/app/api/paper/challenge/route");
     expect((await POST(new Request("http://localhost",{method:"POST",body:JSON.stringify({picks:[]})}))).status).toBe(status);
   });
 }
 it("rejects arrays, null bodies and invalid idempotency keys",async()=>{
   const {POST}=await import("@/app/api/paper/challenge/route");
   for(const body of ["null","[]","{"])expect((await POST(new Request("http://localhost",{method:"POST",body}))).status).toBe(400);
   expect((await POST(new Request("http://localhost",{method:"POST",headers:{"Idempotency-Key":"bad"},body:"{}"}))).status).toBe(400);
   expect(getRpcCalls()).toHaveLength(0);
 });
});

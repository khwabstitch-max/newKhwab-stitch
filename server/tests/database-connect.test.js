import { test } from "node:test";
import assert from "node:assert/strict";
import { configureMongoDns, connectDatabase, isTransientMongoDnsError, mongoDnsServers } from "../src/database-connect.js";
import { loadConfig, ConfigurationError } from "../src/config.js";
const fixtureUri = new URL("mongodb+srv://cluster.example.test/database");
fixtureUri.username = "user";
fixtureUri.password = "private-password";
const uri = fixtureUri.toString();
const config = { MONGODB_URI: uri, MONGODB_DNS_SERVERS: "" };
const fakeResolver = () => ({ values: ["192.0.2.53"], calls: [], getServers() { return this.values; }, setServers(servers) { this.calls.push([...servers]); } });
const dnsError = (code = "ECONNREFUSED", syscall = "querySrv") => Object.assign(new Error("private-password"), { code, syscall });

test("DNS override accepts only IP addresses and keeps an empty override on system DNS", () => {
  assert.deepEqual(mongoDnsServers(), []);
  assert.deepEqual(mongoDnsServers(" 1.1.1.1, 8.8.8.8 2001:4860:4860::8888 1.1.1.1 "), ["1.1.1.1","8.8.8.8","2001:4860:4860::8888"]);
  for (const value of ["https://dns.example.test","dns.example.test","1.1.1.1:53","1.2.3.999", "1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4,9.9.9.9", null]) assert.throws(() => mongoDnsServers(value));
});
test("Windows SRV startup refreshes the current DNS servers without introducing public resolvers", () => {
  const resolver = fakeResolver();
  configureMongoDns(config, { resolver, platform: "win32" });
  assert.deepEqual(resolver.calls, [["192.0.2.53"]]);
});
test("explicit DNS override takes precedence on any platform and logs no connection string", () => {
  for (const platform of ["win32","linux"]) {
    const resolver = fakeResolver(), logs = [];
    configureMongoDns({ ...config, MONGODB_DNS_SERVERS:"1.1.1.1,8.8.8.8" }, { resolver, platform, logger:{ info(...args) { logs.push(args); } } });
    assert.deepEqual(resolver.calls, [["1.1.1.1","8.8.8.8"]]);
    assert.ok(!JSON.stringify(logs).includes("private-password"));
  }
});
test("standard local MongoDB connections and non-Windows system DNS remain unchanged", () => {
  for (const item of [{ ...config, MONGODB_URI:"mongodb://127.0.0.1/test" }, config]) {
    const resolver = fakeResolver();
    configureMongoDns(item, { resolver, platform: item === config ? "linux" : "win32" });
    assert.deepEqual(resolver.calls, []);
  }
});
test("empty system DNS does not install an invalid empty resolver", () => {
  const resolver = fakeResolver(); resolver.values = [];
  configureMongoDns(config, { resolver, platform:"win32" });
  assert.deepEqual(resolver.calls, []);
});
test("configuration validates the optional DNS override without weakening mandatory settings", () => {
  const base = { MONGODB_URI:uri, CORS_ORIGINS:"http://localhost:5173", JWT_SECRET:Buffer.alloc(48,7).toString("base64url") };
  assert.equal(loadConfig(base).MONGODB_DNS_SERVERS, "");
  assert.equal(loadConfig({ ...base, MONGODB_DNS_SERVERS:"1.1.1.1,8.8.8.8" }).MONGODB_DNS_SERVERS,"1.1.1.1,8.8.8.8");
  assert.throws(() => loadConfig({ ...base, MONGODB_DNS_SERVERS:"invalid" }), error => error instanceof ConfigurationError && error.fields.includes("MONGODB_DNS_SERVERS"));
});
test("only transient SRV/TXT failures are eligible for startup retry", () => {
  for (const syscall of ["querySrv","queryTxt"]) for (const code of ["ECONNREFUSED","ETIMEOUT","ESERVFAIL","ECONNRESET","EAI_AGAIN"]) assert.equal(isTransientMongoDnsError(dnsError(code,syscall)),true);
  assert.equal(isTransientMongoDnsError(new Error("wrapped",{cause:dnsError()})),true);
  for (const error of [dnsError("ENOTFOUND"), dnsError("ECONNREFUSED","connect"), Object.assign(new Error("auth"),{code:18}), new Error("querySrv ECONNREFUSED private-password")]) assert.equal(isTransientMongoDnsError(error),false);
});
test("successful connection preserves all driver options including TLS and does not wait", async () => {
  const resolver = fakeResolver(), calls = [], options = { tls:true, serverSelectionTimeoutMS:10000 };
  const result = await connectDatabase({ async connect(...args) { calls.push(args); return "connected"; } },config,options,{resolver,platform:"win32",delay(){ throw Error("Unexpected retry"); }});
  assert.equal(result,"connected"); assert.deepEqual(calls,[[uri,options]]);
});
test("temporary SRV failures recover with bounded backoff without resetting concurrent DNS queries", async () => {
  const resolver = fakeResolver(), waits = [], logs = []; let calls = 0;
  const result = await connectDatabase({ async connect() { if (++calls < 3) throw dnsError(); return "connected"; } },config,{},{
    resolver,platform:"win32",delay:async ms => waits.push(ms),logger:{warn(...args){logs.push(args);}},
  });
  assert.equal(result,"connected"); assert.equal(calls,3); assert.deepEqual(waits,[250,750]); assert.equal(resolver.calls.length,1);
  assert.ok(!JSON.stringify(logs).includes("private-password"));
});
test("persistent DNS failures stop after three attempts instead of looping forever", async () => {
  let calls = 0; const error = dnsError("ETIMEOUT","queryTxt"), waits = [];
  await assert.rejects(connectDatabase({ async connect(){ calls++; throw error; } },config,{},{
    resolver:fakeResolver(),platform:"linux",delay:async ms => waits.push(ms),
  }), failure => failure === error);
  assert.equal(calls,3); assert.deepEqual(waits,[250,750]);
});
test("authentication, missing DNS names and TLS failures are not retried", async () => {
  for (const error of [dnsError("ENOTFOUND"), Object.assign(new Error("auth"),{code:18}), Object.assign(new Error("TLS"),{code:"CERT_HAS_EXPIRED"})]) {
    let calls = 0;
    await assert.rejects(connectDatabase({ async connect(){ calls++; throw error; } },config,{},{
      resolver:fakeResolver(),platform:"linux",delay(){throw Error("Must not retry");},
    }), failure => failure === error);
    assert.equal(calls,1);
  }
});
test("non-SRV connections never activate DNS retry", async () => {
  let calls = 0;
  await assert.rejects(connectDatabase({async connect(){calls++;throw dnsError();}},{...config,MONGODB_URI:"mongodb://127.0.0.1/test"},{},{resolver:fakeResolver(),platform:"win32"}));
  assert.equal(calls,1);
});

test("repeated application loading does not reset DNS while older queries may still be in flight", () => {
  const resolver = fakeResolver();
  configureMongoDns(config, { resolver, platform: "win32" });
  configureMongoDns(config, { resolver, platform: "win32" });
  assert.equal(resolver.calls.length, 1);
});

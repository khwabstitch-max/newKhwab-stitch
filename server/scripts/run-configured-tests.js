import { spawn } from "node:child_process";
import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { parseArgs } from "node:util";
const { values } = parseArgs({ options: { pattern: { type: "string" }, suite: { type: "string" } } });
const config=loadConfig();
if(config.NODE_ENV==="production")throw Error("Configured integration tests are disabled in production mode. Use an explicitly separate development environment.");
const suites=["credentials","domain","enhancement-indexes","google","imagekit","pricing","reference-integrity","separate-customization","support-domain","visual-catalogue","api","account-extensions"];
if(values.suite && !suites.includes(values.suite))throw Error("Unknown test suite.");
const files=(values.suite?[values.suite]:suites).map(name=>`tests/${name}.test.js`);
// Both database suites force random khwab-tests / khwab-extensions database
// names and drop only those exact test names. Never use the configured app DB.
const child=spawn(process.execPath,["--test","--test-concurrency=1",...(values.pattern?["--test-name-pattern",values.pattern]:[]),...files],{windowsHide:true,stdio:"inherit",env:{...process.env,NODE_ENV:"test",TEST_MONGODB_URI:config.MONGODB_URI,ALLOW_EXTERNAL_TEST_DATABASE:"true"}});
child.on("error",()=>{process.stderr.write("Configured test process could not start.\n");process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});

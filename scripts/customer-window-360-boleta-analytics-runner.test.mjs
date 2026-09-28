import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const wrapper = readFileSync(new URL("./customer-window-360-boleta-analytics-runner.ps1", import.meta.url), "utf8");
const operational = readFileSync(new URL("./customer-window-360-boleta-analytics-provision-operational.ps1", import.meta.url), "utf8");
const secrets = readFileSync(new URL("./customer-window-360-boleta-analytics-provision-secrets.ps1", import.meta.url), "utf8");

test("wrapper has mutually exclusive run and read-only validation modes", () => {
  assert.match(wrapper, /DefaultParameterSetName = 'Run'/);
  assert.match(wrapper, /ValidateSet\('Canary', 'Auto', 'Bootstrap', 'AsOf'\)/);
  assert.match(wrapper, /ParameterSetName = 'Config'/);
  assert.match(wrapper, /ParameterSetName = 'Connection'/);
  assert.match(wrapper, /Customer UUIDs are only valid in Canary mode/);
});

test("wrapper uses a separate DPAPI/TLS configuration and never HMAC", () => {
  assert.match(wrapper, /Customer360BoletaAnalytics/);
  assert.match(wrapper, /runner-password\.dpapi/);
  assert.match(wrapper, /ConvertTo-SecureString/);
  assert.match(wrapper, /sslmode=verify-full&sslrootcert=/);
  assert.match(wrapper, /aws-1-us-east-1\.pooler\.supabase\.com/);
  assert.match(wrapper, /caSha256/);
  assert.match(wrapper, /configUserSid/);
  assert.doesNotMatch(wrapper, /RelatedReview|HMAC|hmac-v1/i);
});

test("wrapper sanitizes child output and publishes atomic latest state", () => {
  assert.match(wrapper, /function Select-SafeRecord/);
  assert.match(wrapper, /function Write-AtomicJson/);
  assert.match(wrapper, /\[IO\.File\]::Replace\(\$temporary, \$Path, \$backup\)/);
  assert.match(wrapper, /ReadToEndAsync\(\)/);
  assert.match(wrapper, /WaitForExit\(\)/);
  assert.match(wrapper, /\$process\.Dispose\(\)/);
  for (const forbidden of ["DATABASE_URL", "password", "stack", "sourceRowId", "customerId"]) {
    assert.doesNotMatch(wrapper.slice(wrapper.indexOf("$allowed = @("), wrapper.indexOf("return [pscustomobject]$safe")), new RegExp(`'${forbidden}'`, "i"));
  }
});

test("operational provisioning creates least-privilege separated paths", () => {
  assert.match(operational, /root\/config\/certs: ReadAndExecute; logs\/state: Modify/);
  assert.match(operational, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(operational, /S-1-5-18/);
  assert.match(operational, /S-1-5-32-544/);
  assert.match(operational, /Get-FileHash/);
});

test("secret provisioning validates before atomically publishing a DPAPI bundle", () => {
  assert.match(secrets, /if \(-not \$Apply\) \{ exit 0 \}/);
  assert.match(secrets, /--check-connection/);
  assert.match(secrets, /privilegeContractValid/);
  assert.match(secrets, /ConvertFrom-SecureString \$secure/);
  assert.match(secrets, /function Publish-Bundle/);
  assert.match(secrets, /WriteAllText\(\$item\.Temp/);
  assert.match(secrets, /\[IO\.File\]::Replace/);
  assert.doesNotMatch(secrets, /password\s*=\s*['\"][^'\"]+['\"]/i);
});

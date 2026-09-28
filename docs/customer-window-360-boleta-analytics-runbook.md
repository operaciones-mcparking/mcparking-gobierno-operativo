# Customer 360 BOLETA Analytics V1 runner

## Security model

The versioned migration creates the `customer_360_boleta_analytics_runner` NOLOGIN capability. It receives only database `CONNECT`, schema `public` `USAGE`, and `EXECUTE` on the refresh and cheap status RPCs. It owns no function and has no direct table privileges, schema `CREATE`, explicit database `TEMP`, calculator access, `BYPASSRLS`, or `service_role` membership.

PostgreSQL grants database `TEMPORARY` through `PUBLIC` by default unless the database ACL revokes it. PostgreSQL has no per-role deny that overrides `PUBLIC`. The runner therefore distinguishes an explicit `TEMPORARY` grant to the capability/LOGIN (fatal) from an environmental grant inherited solely from `PUBLIC` (allowed and reported as `public_database_acl`). This does not permit persistent schema objects: schema `CREATE`, persistent table DML, role creation, database creation, and role escalation remain denied. The rollout must not revoke `TEMPORARY` globally from `PUBLIC` as part of this feature.

The dedicated `customer_360_boleta_analytics_runner_login` LOGIN is provisioned separately. Its password is assigned privately with `psql` `\password`; no credential belongs in SQL, documentation, command-line arguments, environment persistence, logs, or Git. PostgreSQL 16+ membership uses `INHERIT TRUE, SET FALSE, ADMIN FALSE`.

Advisory locks require no additional grant. The runner holds a session lock over the whole drain. The refresh RPC uses the same key transactionally; acquisition by the same session is reentrant and does not self-deadlock.

## Filesystem and secrets

Operational state is isolated under `C:\ProgramData\McParking\Customer360BoletaAnalytics`:

- `config` and `certs`: task user `ReadAndExecute`.
- `logs` and `state`: task user `Modify`.
- `SYSTEM` and local Administrators: `FullControl`.
- Inheritance is disabled.

The password blob uses DPAPI `CurrentUser`. The task must run as the same Windows user that provisioned the secret. `settings.json` is non-secret and pins the database user, host, port, database, CA path/hash, and Windows SID. TLS is `verify-full`.

## Future authorized rollout

Do not perform these steps until separately approved:

1. Apply migration `20260925160000_add_customer_360_boleta_analytics_v1.sql` and run its reversible/catalog checks first in an appropriate environment.
2. Run `customer_window_360_boleta_analytics_runner_login_create.sql` as an administrative role, then set the LOGIN password privately with `psql` `\password`.
3. Run the administrative login postcheck and the dedicated-login `psql` probe. Stop if `TEMPORARY` is explicitly granted to the capability/LOGIN or if any direct table/calculator access is present. `TEMPORARY` inherited solely from `PUBLIC` is reported and accepted.
4. Run operational provisioning in plan mode, review it, and only then run elevated `-Apply`.
5. Run secret provisioning in plan mode. With the password on the clipboard, use `-Apply -UsePasswordFromClipboard`; it validates TLS, identity, and privileges before atomically publishing the DPAPI bundle.
6. Run `-DryRunConfigCheck`, then `-TestDatabaseConnection` on the wrapper.
7. Run a small explicit `Canary`. Customer UUIDs are never logged.
8. Drain `Bootstrap` manually in bounded runs. Use status with counts only for certification.
9. Run and measure `AsOf` manually. Choose its daily window from observed runtime and operational load.
10. Review the task installer plan. `-Apply` requires an explicit `-AsOfTime`. Enable scheduling only after manual certification.

Example commands intentionally contain no credential:

```powershell
powershell.exe -NoProfile -File .\scripts\customer-window-360-boleta-analytics-runner.ps1 -DryRunConfigCheck
powershell.exe -NoProfile -File .\scripts\customer-window-360-boleta-analytics-runner.ps1 -TestDatabaseConnection
powershell.exe -NoProfile -File .\scripts\customer-window-360-boleta-analytics-runner.ps1 -Mode Canary -CustomerId <approved-uuid>
powershell.exe -NoProfile -File .\scripts\customer-window-360-boleta-analytics-runner.ps1 -Mode Bootstrap
powershell.exe -NoProfile -File .\scripts\install-customer-window-360-boleta-analytics-tasks.ps1
```

## Operation and recovery

`auto`, `bootstrap`, and `as_of` stop immediately on SQL failure and do not retry timeouts. Each run is bounded by iterations and wall time. `success_partial` is healthy bounded progress; a later run continues from database watermarks. `skipped_locked` is a successful no-op.

PostgreSQL is the only checkpoint. A failure before commit rolls back that call; a failure after commit is safe to replay because the refresh and watermarks are idempotent. NDJSON and `latest.json` are observational only. No local checkpoint is used.

Expected tasks are interactive, limited, `IgnoreNew`, and require the `McParking` session to be logged on. Auto runs every 30 minutes with `StartWhenAvailable`; daily as-of does not. Bootstrap remains manual.

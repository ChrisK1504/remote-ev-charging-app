# BACKEND PROGRESS NOTES

## 2026-10-21 — Charger command authentication regression coverage

- Added ten HTTP tests covering both charger start and stop: missing cookie, deleted user with a saved cookie, failed user lookup, authenticated dispatch, and command rejection after logout.
- Tests use the real controllers, AuthService, UserService, Argon2 login verification, and express-session with an isolated MemoryStore. The user repository, charger state, and OCPP service are mocked. Rejected requests assert no charger-state lookup, active-session lookup, or command dispatch.
- Corrected the charger controller's AuthService import to a relative path after Jest exposed unresolved `src/auth/auth.service` resolution. Existing developer authentication changes were otherwise preserved.
- Verified under Node 24.21.0: all 48 tests across six suites pass; TypeScript --noEmit and git diff --check pass. HTTP tests required permission to bind temporary local ports.
- Limits: this does not verify PostgreSQL session storage, AppModule wiring, real charger commands, session expiry, browser CORS, or resource ownership authorization. Authenticated drivers can still request commands without a session-ownership policy.
- Concept practiced: a rejected HTTP response alone does not prove absence of side effects; tests must also assert that downstream command services were never called.
- Commit checkpoint: review and commit this bounded authentication increment on feature/driver-auth. Credentialed browser requests and CORS remain the next planned integration work.

## 2026-10-20 — Logout and session invalidation coverage

- Developer implemented POST /auth/logout: awaits session destruction, clears connect.sid at path /, and returns 204. Store failures propagate before cookie clearing.
- HTTP regression covers login, authenticated identity lookup, empty logout response, subsequent 401, and replay of the original cookie receiving 401. This uses the test MemoryStore; PostgreSQL logout deletion and unauthenticated logout remain unverified.
- Added a controlled callback test proving logout stays pending until destruction completes and rejects with the original store error without clearing the cookie when destruction fails.
- Verified under Node 24.21.0: all 38 tests across five suites pass and TypeScript --noEmit passes. Removed a trailing whitespace line identified by git diff --check.
- Next increment: credentialed browser CORS and frontend requests, including handling logout's empty 204 response before adding login UI.

## 2026-10-20 — Current-user endpoint and cookie reuse

- Added GET /auth/me: reads userId from the server-side session, looks up the current user, and returns only id/email. Missing identity or a deleted user yields 401; database errors propagate.
- Added four service tests covering missing identity without lookup, successful lookup, deleted user, and database failure. Added HTTP tests for login-cookie reuse through a Supertest agent and unauthenticated rejection without a user query.
- Verified under Node 24.21.0: all 36 tests across five suites pass; TypeScript --noEmit and git diff --check pass. HTTP tests use an isolated MemoryStore, not PostgreSQL.
- Developer-reported manual evidence: local login persisted two independent sessions in PostgreSQL; GET /auth/me returned the expected user with the saved cookie and 401 without it. These database checks were not independently rerun by the assistant.
- Concepts practiced: a lookup resolving to null differs from a rejected Promise; HTTP tests must assert the real status, not just statusCode in the body; a cookie-preserving test agent verifies continuity across requests.
- Remaining work: logout, credentialed frontend requests/CORS, browser login UI, and charger-route authentication. Session ownership authorization remains separate and unfinished.

## 2026-10-20 — Authentication session concepts and migration review

- A login session and a charging session represent different lifecycles. The authentication store's `session` table maps a session ID (`sid`) to session data (`sess`, including `userId`) and an expiration time (`expire`).
- The server generates the session ID and sends a signed representation in a cookie. The browser stores the cookie and automatically sends it on requests matching its scope, subject to browser cookie and request-credentials rules. The cookie signature protects integrity; it is not encryption. Endpoint authorization remains a separate backend responsibility.
- Tabs in the same browser profile normally share cookie storage and therefore the same login session. Independent browsers or profiles normally have separate cookie storage: two successful independent logins create distinct session IDs that can reference the same user. Logging out one session does not automatically log out the other.
- Cookies can survive closing the browser until expiration; the current configuration gives the cookie an eight-hour lifetime. Sharing a cookie does not synchronize React state between tabs. A new tab or page refresh needs a backend identity lookup (planned `GET /auth/me`) to recover the authenticated user.
- A primary key automatically creates an index for session-ID lookups. The separate expiration index helps the store find expired sessions for cleanup. Indexes cost storage and write maintenance; PostgreSQL may choose a table scan when it is cheaper.
- Reviewed developer-written `003_create_auth_sessions.sql`: columns, primary key, and expiration index match the installed connect-pg-simple store's schema requirements, without its legacy OIDS clause. Applying the migration and real PostgreSQL login persistence remain unverified in this session.

## 2026-10-19 — Login session sequencing regression coverage

- Added real express-session middleware with an isolated in-memory store to the HTTP test application. Successful login issues an HttpOnly session cookie; production continues to use its configured PostgreSQL store.
- Added controlled callback tests proving that login waits for regeneration before assigning userId to the replacement session, waits for save before returning, propagates regeneration/save failures, and never starts session mutation when credentials are rejected.
- Verified under Node 24.21.0: all 30 tests across five suites pass; TypeScript --noEmit passes. No production implementation was changed by this test increment.
- Limits: these tests do not prove PostgreSQL session storage, authenticated subsequent requests, logout, CSRF protection, or authorization. The configured PostgreSQL store still needs its session-table migration; credentialed frontend CORS is also outstanding.

## 2026-10-19 — Login HTTP validation coverage

- Extended the existing auth.controller.spec.ts scaffold with parameterized invalid-input cases and wrong-password/unknown-email response equivalence. The tests use the real controller, ValidationPipe, AuthService, UserService, and Argon2 verification; only the TypeORM user repository is replaced.
- Verified: null/numeric input, missing fields, invalid email, empty password, and unexpected properties return 400 without querying users. Correct credentials return 200 with only id/email; wrong passwords and unknown emails return identical 401 bodies.
- Verification under installed Node 24.21.0: all 26 tests across five suites pass; TypeScript --noEmit and git diff --check pass. HTTP tests require permission to bind a temporary local port in the restricted execution environment.
- Limits: the focused test module does not verify AppModule wiring, PostgreSQL queries, persistent login sessions, or charger authorization. Validation options are repeated from main.ts and must stay consistent. No production implementation was changed in this increment.

## 2026-10-14 — Reproducible backend test runtime

- Pinned Node 24.19.0 in backend/.nvmrc and package.json engines; synchronized lockfile metadata without changing dependencies.
- Jest disables Watchman discovery. Watch and coverage commands reuse the unit-test command; e2e and debug commands also use the VM-modules flag.
- Backend README documents nvm setup, lockfile installation, tests, and TypeScript checking. Runtime selection remains explicit in each shell.
- Baseline evidence: Node 22.23.3 failed both suites during ESM loading (zero tests executed); Node 24.19.0 ran all six tests successfully. The prior note about a missing VM-modules flag was stale: that flag was already present in npm test.
- Verified after changes: npm test -- --runInBand passes all six tests across two suites using Node 24.19.0; TypeScript --noEmit and git diff --check pass. Fresh nvm installation/npm ci was documented but not rerun.
- Scope: development tooling only. Real PostgreSQL writes, start persistence ordering, restart recovery, and the stale e2e test remain unverified or unfinished.

## 2026-10-14 — PostgreSQL session persistence increment

- Local setup: Postgres.app, database ocpp_csms; Docker deferred to avoid unnecessary downloads. Credentials live in ignored backend/.env.
- Implemented: TypeORM entity and SessionModule/SessionService; SQL schema includes UUID session identity, unique integer transaction identity, and lifecycle constraints. synchronize and automatic migration execution are disabled. The SQL migration was manually applied; TypeORM migration history is not configured.
- StartTransaction awaits session creation before returning the database-generated transaction ID. StopTransaction conditionally completes only an Active session matching transaction ID and sending charger ID, preserving completion history. Remote-stop lookup now reads PostgreSQL; the old transaction Map and process-local counter were removed.
- Verified: all six unit tests across two suites pass under Node 24.21.0 with --experimental-vm-modules; backend TypeScript checking passes. Tests cover repository completion criteria/results and OCPP stop delegation, acknowledgment, repeated acknowledgments, and failure propagation.
- Coverage change: the former in-memory ownership tests were replaced. Current mocks verify component contracts, not actual database ownership, duplicate-stop effects, or restart recovery. Start persistence ordering has no regression test yet.
- Unverified: real inserts/updates through TypeORM and start-stop-restart behavior. Database schema inspection was reported by the developer; manual insert checks were deferred.
- Open gaps: multiple Active sessions can exist for a connector; duplicate StartTransaction handling, charger authentication, runtime payload validation, session-ID endpoints, reconciliation, and database-failure protocol responses remain unfinished. The existing end-to-end starter test is stale.
- Test tooling: the saved npm test script still lacks the VM modules flag; persist a reproducible Node/test setup before treating the branch as complete.
- Concepts practiced: entity/schema mapping, dependency injection, generated identity, conditional updates, and awaited Jest rejection assertions. A resolved Error object is not a rejected Promise; asynchronous assertions must be awaited.

## 2026-10-13 — StopTransaction ownership regression

- Invariant: an inbound StopTransaction may remove an active transaction only when the sending chargePointId matches the recorded owner.
- Verified: four handler-level Jest tests cover foreign charger, owner, unknown transaction ID, and repeated owner stop. Backend TypeScript checking passes.
- Regression evidence: running the same tests against the original HEAD service in a temporary copy produces one failure (foreign stop deletes the owner's transaction); the other three pass. Working source files were not altered for this check.
- Existing empty CALLRESULT acknowledgment is preserved. Unknown/mismatched ID acknowledgment is the current implementation policy, not a newly verified OCPP requirement.
- Limits: these tests use fake sockets and invoke the private handler; they do not verify network identity, schema validation, persistence, or hardware behavior. The existing end-to-end starter test remains broken.
- Review cleanup pending: remove unused json import and expectedTransaction variable in the repeated-stop test. Unknown transaction IDs currently receive no dedicated diagnostic log.

## QUESTIONS
- What simulator can I use to mock the EV Charging Station?

A websocket connection must be established between the backend, acting as a websocket server, and the charge point, acting as a websocket client. 
Options to pick as a simulator for the charge point:
- OCPPLab (https://ocpplab.com/): Free, looks well built (needed organization)
- Ozgur Bayram OCPP Simulator (https://github.com/ozgurbayram/OCPPSimulator): Open source, fairly new and still updated.
- SAP Charging stations simulator (https://github.com/SAP/e-mobility-charging-stations-simulator): Open source, seems more reliable and trusted than the previous github repo.
- ocpp-ws-simulator (https://github.com/rohittiwari-dev/ocpp-ws-simulator?utm_source=chatgpt.com): Open source, visual debugging seems valuable. Not really known, only 5 stars, might be unreliable. 
- OCPP Virtual Charge Point (https://github.com/solidstudiosh/ocpp-virtual-charge-point)
- charger-simulator (https://github.com/vasyas/charger-simulator): Seems to fit my project's goals better.

- How to create a websocket connection in NestJS? 
Refering to the official nestjs docs (https://docs.nestjs.com/websockets/gateways), two websocket platforms are support *socket.io* (https://github.com/socketio/socket.io) and *ws* (https://github.com/websockets/ws).

```
onModuleInit() {
    this.wss = new WebSocketServer({
      port: 9000,
      handleProtocols: (protocols) => {
        if (protocols.has('ocpp1.6')) {
          return 'ocpp1.6';
        }

        return false;
      },
    });
```

### DECISIONS
- Decided on using *Ozgur Bayram OCPP Simulator (https://github.com/ozgurbayram/OCPPSimulator)* as the Charging Point simulator.
- Decided on using platform-ws as my websocket platform (since that's what was used in the nestjs docs.) OCPP uses standard Websocket, so platform-ws should be used.
- OCPP specificies a lot of actions. I chose the smallest subset to demonstrate remote charging:
1. BootNotification [DONE]
2. Heartbeat [DONE]
3. StatusNotification [DONE]
4. RemoteStartTransaction  [DONE]   
5. StartTransaction [DONE]
6. MeterValues [DONE]
7. RemoteStopTransaction [TODO]  
8. StopTransaction [TODO]
9. Authorize [DONE]

### STEPS
#### Client Request
As per the OCPP 1.6-J specifications, a connection URL will be given to the simulator to start a connection. The url path must have appended a string uniquely identifying the Charge Point

EXAMPLE: for a charge point with identity “CP001” connecting to this backend system with OCPP-J endpoint URL "ws://localhost:9000/ocpp" this would give the following connection URL:

ws://localhost:9000/ocpp/CP001

The OCPP version must be specified in the Sec-Websocket-Protocol Field. In my case 'ocpp1.6'

#### Server Response [TODO]

##### Message Types
- CALL ; 2 ; Client-to-Server 
- CALLRESULT ; 3 ; Server-to-Client
- CALLERROR ; 4 ; Server-to-Client

##### Message structure
CALL:
[<MessageTypeId>, "<UniqueId>", "<Action>", {<Payload>}]
CALLRESULT:
[<MessageTypeId>, "<UniqueId>", {<Payload>}]
CALLERROR:
[<MessageTypeId>, "<UniqueId>", "<errorCode>", "<errorDescription>", {<errorDetails>}]

##### Unsatisfied Connection 
As per ocpp1.6-j specification
- If the Central system does not recognize the charge point identifier in the URL path, it SHOULD return a 404 and abort the websocket connection.
- If the Central System does not agree to using one of the subprotocols offered by the client, it MUST complete the websocket handshake with a response without a 'Sec-WebSocket-Protocol' header and immediately close the websocket connection.

##### Core Messages

- BootNotification [CP->CS] [TODO 'Pending' and 'Rejected']
Sent on boot. Contains vendor, model, serial, firmware version. CS responds with Accepted, Pending, or Rejected and a heartbeat interval.

- Heartbeat [CP->CS] [DONE]
Periodic keepalive. CS responds with current time for clock sync.

- StatusNotification [CP->CS] [DONE]
Charge Point reports a connector status or error change.

- RemoteStartTransaction [CMS->CP]

- Authorize
![alt text](images/authorize_transaction.png)

- StartTransaction [CP->CMS]
![alt text](images/startTransaction_metervalues.png)






### ISSUES
- Standard WS should be used to use OCPP .
- Module wiring caused the websocketservice to be initialized twice, throwing an error by occupying the same port twice.
- Cannot just make calls to the CP, but have to wait for them to be resolved. Promise API must be used.
- Unhandled CALL messages can disrupt the communication flow. Every CALL message must be responded to.


## 2026-10-21 — One active transaction per connector

- Migration 004 adds a partial unique index on (charge_point_id, connector_id) for Active sessions, preserving completed history. Corrected the migration filename typo; SQL is unchanged and an already applied migration does not need reapplication.
- Developer reports local migration application and duplicate-active rejection succeeded. Database checks were not independently rerun by the assistant.
- SessionService translates only PostgreSQL 23505 for idx_active_session_per_connector into ActiveSessionConflictError. Other constraints, connection errors, and unexpected errors retain their original identity.
- StartTransaction responds to this domain conflict with a correlated CALLERROR GenericError and empty error details; no transaction ID or successful CALLRESULT is fabricated. A warning identifies charger, connector, and message. Other persistence errors still propagate to the existing message error logger.
- GenericError is a local fallback policy, not a protocol-defined connector-occupancy response. Beckhoff's OCPP error reference describes GenericError as the fallback (https://infosys.beckhoff.com/content/1033/tf6771_tc3_iot_ocpp/16225485707.html). Direct specification PDF retrieval failed; exact policy conformance and physical charger retry behavior remain unverified.
- Verified by assistant under Node 24.21.0: all 20 tests across three suites pass, TypeScript --noEmit passes, and git diff --check passes. Tests cover error translation/preservation, correlated conflict CALLERROR, successful persistence ordering, and unchanged generic persistence-failure behavior. Mocks do not prove real concurrent database enforcement.
- Deferred: duplicate StartTransaction replay/idempotency, stale active sessions after restart, reconciliation, and protocol responses for other database failures. CALLERROR does not establish that the physical charger stopped.

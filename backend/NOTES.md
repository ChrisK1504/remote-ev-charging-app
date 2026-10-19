# BACKEND PROGRESS NOTES

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

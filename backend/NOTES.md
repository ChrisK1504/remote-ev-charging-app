# BACKEND PROGRESS NOTES

## 2026-10-25 — Authorization test dependency wiring

- Updated existing OCPP test constructors to supply a mocked UserService after the authorization handler gained that dependency. The existing successful Authorize dispatch fixture retains its explicit user repository result.
- Verified: 230 tests across eleven suites pass; TypeScript --noEmit and git diff --check pass. HTTP tests required execution outside the sandbox to bind temporary local ports. These checks do not verify real PostgreSQL authorization or hardware behavior.

## 2026-10-25 — Charger connection replacement

- ConnectionManagerService registers the replacement socket before asking the previous socket for the same charge point ID to close. Socket identity remains scoped to the charge point; connectors share that connection.
- OcppServerService checks the current registered socket before parsing incoming messages. Messages arriving through a replaced socket are ignored. The existing close-handler identity check preserves the replacement connection and its connected state when the old socket closes.
- Regression coverage uses EventEmitter socket doubles and a mocked WebSocketServer constructor to exercise the actual connection/message/close callbacks without opening a network port. It verifies replacement closes A, B can report Charging, A cannot overwrite the same connector with Available, and A's later close leaves B registered and connected. The old-socket message now correctly uses CALL type 2; type 1 would have been ignored independently and produced misleading passing evidence.
- Assistant verified under Node 24.21.0: 227 tests across ten suites pass; backend TypeScript --noEmit passes. The assistant did not independently rerun the test with the socket guard removed. No live network, PostgreSQL, or hardware verification was performed.
- Limits: closing a socket is asynchronous. The guard prevents newly arriving messages from entering processing; it does not cancel handlers or database work already in progress. Pending requests stay attached to their original socket and are rejected by its close handler, not transferred or automatically resent. Replacement is not charger authentication or transaction reconciliation.
- Concepts practiced: replacing a Map entry versus closing a connection; socket identity versus connector identity; checking current state rather than an earlier string snapshot; constructing a regression test whose valid input reaches the behavior under test.
- Commit checkpoint: commit the message guard, corrected regression, and this note on fix/connection-replacement after review. No commit or merge was performed by the assistant. Next recommended investigation: reproduce a repeated StartTransaction after a lost acknowledgment, distinguish an active-session uniqueness constraint from replay safety, and agree on duplicate-request identity before changing persistence.

## 2026-10-24 — Pending-request cleanup regression coverage

- Replaced the unfinished server-test sketch with five focused PendingRequestService lifecycle tests: disconnect rejects multiple requests on one socket while preserving another; resolution before disconnect and explicit rejection clear timers; foreign-socket responses/cleanup preserve the original timeout; late responses and repeated cleanup preserve the disconnect rejection.
- Verified: 225 tests across nine suites pass; backend TypeScript --noEmit passes. Tests use fake timers and socket identity doubles; they do not exercise the WebSocket close-event wiring or real hardware.
- Production cleanup was implemented by the developer; this increment changes tests and notes only. Review the close-event wiring separately before declaring the full disconnect task complete. Commit the bounded cleanup increment after that review and verification.

## 2026-10-24 — Extracted inbound CALL handlers and dispatch cleanup

- Moved all seven inbound action implementations into OcppCallHandlersService (ocpp-call-handlers.service.ts), registered in OcppModule. Named handlers accept charger identity and typed requests and return response payloads; they have no sockets, message IDs, or send operations. Its small exhaustive switch uses IncomingOcppCall, a discriminated union preserving each action's request type.
- OcppServerService owns parsing, envelope checks, action/payload validation, response correlation, one successful CALLRESULT send path, and existing StartTransaction conflict-to-CALLERROR translation. Persistence still completes before success is sent; other failures continue to propagate into the transport logger. Existing Authorize acceptance policy is unchanged.
- Removed repeated envelope-guard passes and the separate unknown-type precheck: the message-type switch selects one guard and ignores unknown types in its default branch. Invalid envelopes still receive the existing correlated rejection policy.
- Replaced separate schema-membership and direction-membership checks with isIncomingOcppAction, backed by a typed inbound-action list. Replaced per-case request casts with one documented assertion after envelope, action, and payload validation. Removed the redundant ConnectionManagerService import alias, getActiveSession debug logging/temporary variable, obsolete dispatch imports, and the unused pre-persistence ActiveTransaction interface (no references found under backend/src).
- Retained inbound/outbound payload validation and response schema validation: these guard different data and are not redundant with envelope shape checks or TypeScript types. Retained pending-request socket checks because they enforce request ownership. No timeout/disconnect cleanup or protocol error-policy changes were bundled into this extraction.
- Verified under Node 24.21.0: 220 tests across eight suites pass, TypeScript --noEmit passes, and git diff --check passes. Existing server/validation tests now construct the real extracted service. Added four focused handler-dispatch tests for BootNotification, Heartbeat, Authorize, and StatusNotification, each asserting exactly one correlated reply; transaction ordering/conflict/failure and MeterValues regressions remain green. Tests use fake sockets/mocked persistence; live hardware and PostgreSQL were not exercised.
- Review concept: handlers perform application work; the protocol boundary decides when and how to reply. A valid envelope, a valid action payload, a completed database operation, and a physical charging outcome remain distinct guarantees. Review the new handler file first, then handleCall in the server; no schema-definition reread is needed for this refactor.
- Commit checkpoint: review and commit this bounded extraction on the current branch. No commit or merge was performed. Next reliability task remains pending-request timeout/disconnect cleanup, with failure-focused tests.

## 2026-10-24 — Typed OCPP envelopes

- Source: developer-provided OCPP excerpt, sections 4.1.3–4.2.3. The third message is CALLERROR (4). Added OcppCallMessage, defaulted OcppCallResult, OcppCallError, and their discriminated union OcppMessage; preserved action-specific OcppCall typing for outbound requests. Named tuple fields make the wire order visible.
- Added isOcppCall/isOcppCallResult/isOcppCallError runtime type guards in ocpp-message.ts. They check exact tuple lengths, discriminators, string IDs of at most 36 Unicode characters, action/description types, payload shapes, and the allowed error-code set. CALL/CALLRESULT envelopes permit null per the supplied excerpt; action schema validation still rejects null for current actions. ErrorDetails must be an object, including {} when empty.
- Centralized error codes with the excerpt's exact wire spelling OccurenceConstraintViolation, correcting the prior Occurrence spelling. The supplied ID rule specifies no minimum length, so the envelope guard does not invent one. Unknown message type numbers are now ignored before inspecting their payload, as required by section 4.1.3.
- OcppServerService narrows incoming frames through the guards before dispatch. Outbound CALLRESULT and CALLERROR arrays now have explicit types; error construction is centralized in sendCallError. Payload validation and socket-scoped response correlation remain separate checks. A valid envelope does not prove a valid payload or a matching outstanding request.
- Verified under Node 24.21.0: 216 tests across eight suites pass; TypeScript --noEmit passes. Added six focused envelope tests and one service-level unknown-type regression; replaced one old unknown-type rejection case. No hardware or live WebSocket verification was performed.
- Limits: this increment does not track inbound CALL ID reuse across a connection or add replay/idempotency policy. Existing invalid-ID handling still logs/throws rather than sending a response with an invalid correlation ID. Timer/disconnect lifecycle work remains deferred.
- Review path: read the tuple definitions, then the three guards, then the dispatch in handleMessage. Explain why a valid CALLRESULT envelope cannot establish its action or the success of physical charging. Commit this bounded refactor after review; no merge was performed.

## 2026-10-24 — OCPP runtime validation

- Added local JSON Schema definitions for request/response payloads of all nine actions in OcppActionMap, transcribed from https://ocpp.md/ocpp-1.6j/schemas/core/ (OCPP 1.6J edition 2 Core reference). They are maintained definitions, not downloaded official schema artifacts; direct schema download was denied. Review against the company's chosen OCA schema release remains desirable before claiming conformance.
- Ajv is now a direct production dependency, promoted from the existing locked dependency tree without changing resolved versions. Validators compile once, check full date-time formats, nested objects, required fields, integer types, enums, lengths, decimal charging rates, and additional properties. No coercion, defaults, or property removal. Schema checks deliberately do not impose business constraints such as positive connector IDs or numeric sampled-value strings.
- Inbound CALL validation precedes state/persistence access. Invalid correlated CALLs return FormationViolation with empty details; unsupported inbound actions return NotImplemented. FormationViolation is the current broad validation-error policy; keyword-specific OCPP error classification is not implemented. Invalid JSON, invalid IDs, non-array frames, and unknown message types throw into the existing transport error logger without a fabricated correlation ID.
- Outbound CALL requests and generated CALLRESULT payloads are checked before sending. PendingRequestService retains action alongside socket and ID so incoming CALLRESULT is checked against its originating action. Invalid correlated CALLRESULT/CALLERROR rejects only that socket's pending request as BadGatewayException; no reply is sent to a response. Unknown/foreign-socket replies do not settle commands.
- Expanded TypeScript protocol types to include supported schema fields/enums; corrected StopTransaction response to optional idTagInfo instead of remote-command status. Optional charging-profile validation does not establish smart-charging business support.
- Verified under Node 24.21.0: 210 tests in seven suites pass; TypeScript --noEmit and git diff --check pass. Added schema cases for all request/response pairs, missing required properties, wrong objects, nested readings, enums, dates, tag limits, charging profiles, malformed envelopes, pre-side-effect rejection, generated responses, and socket isolation. Tests use fake sockets/mocked persistence; hardware interoperability and direct official-schema differential tests remain unverified.
- Concept: TypeScript types disappear at runtime; successful JSON parsing establishes syntax only. Be able to explain why response validation requires the original action and why invalid CALLRESULT must reject the waiting command rather than receive another response.
- Commit checkpoint: review this bounded validation change, then commit on the current refactor/ocpp-service branch. Do not merge solely on mocked tests; manually exercise a valid start-meter-stop simulator cycle and a malformed MeterValues rejection first. Pending timer/disconnect cleanup remains deferred.

## 2026-10-24 — Outbound pending-request extraction

- Extracted the pending-request map, Promise registration, ten-second timeout, and socket-scoped resolution/rejection into PendingRequestService, registered in OcppModule. OcppServerService retains socket lookup, message construction/sending, and CALLERROR-to-BadGatewayException translation.
- Regression coverage exercises wrong-socket responses, reverse-order responses on one socket, CALLERROR rejection, and timeout rejection. Tests construct the real PendingRequestService. Assistant verified 62 tests across six suites, backend TypeScript --noEmit, and git diff --check.
- Synchronous send exceptions now reject through the new service and remove the pending entry; this cleanup differs from the old implementation and lacks a dedicated regression. Asynchronous send callback errors remain unhandled. Timers remain scheduled after settlement; disconnect/shutdown cleanup and runtime payload validation are deferred.
- Concepts practiced: Promise creation versus awaiting, message identity versus station/connector identity, dependency injection, and preserving observable behavior during extraction. Be able to explain why registration precedes sending and why both message ID and socket must match.
- Commit checkpoint: review and commit this bounded extraction on refactor/ocpp-service; keep the branch open. Next increment should target pending-request lifecycle cleanup with failure-focused regression coverage.

## 2026-10-23 — Session ownership integration evidence and merge checkpoint

- Assistant-verified automated baseline in this session: 58 tests across six suites pass under Node 24.21.0; backend TypeScript --noEmit and working-tree git diff --check pass. The different-owner and null-owner stop regressions now exist and assert HTTP 403 with zero remote-stop calls, superseding the missing-test checkpoint below. These checks preceded the current developer edits to scripts/seed-user.ts; those edits have not been reviewed or reverified here.
- Developer-provided PostgreSQL output confirms transaction 22 for CP_001, connector 1 is Completed, with its user_id and starting id_tag retained, populated start/end timestamps, meter_start 1547 Wh, and meter_stop 1569 Wh (22 Wh difference). This is manual evidence of a persisted simulator lifecycle; the assistant did not independently query PostgreSQL or operate the simulator.
- Developer reports logging in as a different user in another browser: the charger was visible, but that user could not stop the active session. Exact HTTP status, absence of an outgoing command, and the database state immediately after that rejected attempt were not supplied as manual evidence. Automated regressions separately cover 403 and zero command dispatch.
- Charger visibility is separate from session ownership: GET /chargers and GET /chargers/:id currently expose global in-memory charger state without authentication or user filtering. Whether drivers may see all stations and their live readings requires company confirmation; no charger-access ownership model has been established.
- External simulator limitation observed in the supplied transaction-20 logs: remote start and meter reports used connector 2, and remote stop targeted transaction 20 correctly, but the simulator subsequently reported connector 1 as Finishing, DEMO1234 as the stop tag, and meterStop 0. Treat the simulator as a black box; do not compensate by rewriting incoming connector IDs or session ownership. The later connector-1 run produced a plausible final meter reading; multi-connector behavior and energy-accounting robustness remain unverified.
- Remaining limits: restart recovery/reconciliation, real hardware behavior, duplicate-start handling, unknown-tag behavior, and migration/foreign-key failure cases are not established by this evidence. A completed session row does not validate every migration constraint or prove physical charging behavior.
- Git history verified after fetching origin: session-ownership contains all session-persistence commits plus three ownership commits; session-persistence contains local main, including its one commit ahead of origin/main. Developer will perform ownership -> persistence -> main merges. Review the diff and rerun tests/TypeScript on the combined result; review and commit the current seed-script edits separately from this documentation if they are ready. No merge was performed by the assistant.
- Next atomic task after merging: on a dedicated refactor branch from updated main, add outbound OCPP request-correlation characterization coverage before extracting the pending-request lifecycle. Keep extraction and behavioral fixes in separate increments.
- Concepts practiced: authentication versus resource authorization, transaction identity versus connector status, reported device state versus persisted business state, and the limits of simulator/manual evidence. Be able to explain why a different stop idTag must not overwrite the session owner and why a correct transaction ID does not guarantee a consistent connector-status report.

## 2026-10-22 — End-of-day session ownership checkpoint

- Implemented backend-generated unique user tags and internal tag lookup; HTTP remote start derives the tag from the authenticated user. Client-supplied tags are ignored, with regression coverage proving they cannot override the stored tag.
- ChargingSession now maps nullable userId. Session creation resolves the reported tag to a user; unknown tags produce a null owner and an Invalid authorization outcome, while known tags return Accepted. The handler uses the returned transaction ID and authorization outcome. Unknown-tag behavior, authorization audit persistence, and real charger behavior are not fully verified.
- Added HTTP stop ownership enforcement: a session owner must match the authenticated user; another owner or a null owner receives ForbiddenException before command dispatch. Updated the successful stop fixture to include user-1 ownership.
- Independently verified at this checkpoint: all 56 tests across six suites pass under Node 24.21.0; backend TypeScript --noEmit and git diff --check pass. Working tree was clean before this journal entry.
- Coverage gaps: explicit HTTP tests for a different owner and null owner are still missing. PostgreSQL migration 006 application/foreign-key behavior and a full simulator start-meter-stop cycle with persisted ownership remain unverified. Pending-start correlation is deferred; app-initiated charging is the confirmed current scope.
- Learning: distinguish authentication from resource authorization, server-side login sessions from charging sessions, mocked input from expected protocol output, and business rejection from protocol errors. Practice tracing identities across HTTP, OCPP, and persistence; avoid assuming a reported tag proves which remote command caused an event.
- Next atomic task: add stop authorization regressions for another user and an unowned session, asserting HTTP 403 and zero remote-stop calls. Then verify the full lifecycle with PostgreSQL and the simulator before declaring ownership complete or merging feature/session-ownership.
- Reflection prompts for next session: explain why a valid cookie alone does not permit stopping a session; why a test fixture needs userId; why unknown tags and failed database lookups differ; and what the current mock tests cannot establish about physical charging.
- Commit checkpoint: commit this progress note; keep the ownership branch open until rejection regressions and database/simulator verification are complete.

## 2026-10-22 — Test contract repairs

- Replaced the misleading client-tag rejection case with an assertion that the supplied tag is ignored and the stored user tag is sent. Updated SessionService test construction for its UserService dependency and the OCPP persistence mock for the new authorization outcome return contract.
- TypeScript exposed a null dereference on unknown tags; session creation now assigns a null owner when lookup returns null, matching the existing nullable entity.
- Verified: 56 tests across six suites pass under Node 24.21.0; TypeScript --noEmit and git diff --check pass. This does not establish database migration correctness, unknown-tag behavior on hardware, or driver ownership enforcement. Pending-start design is deferred at the developer's request.

## 2026-10-22 — Backend-assigned tag HTTP regression tests

- Updated charger command tests to send only connectorId and expect the stored user tag in the outgoing OCPP command. Removed the duplicate UserService mock provider, retaining real AuthService/UserService with a mocked repository and isolated session MemoryStore.
- Added cases for client-tag rejection, a missing user during the second lookup, and database failure during that lookup. Lookup failures assert no command dispatch.
- Verification: 54 tests pass and two fail across six suites. The new rejection case exposes the missing controller check (expected 400, actual 200); the existing user-creation assertion lacks the newly generated idTag. TypeScript --noEmit and git diff --check pass. Production code was not changed in this test increment.
- Database migration/application, real charger behavior, and session ownership enforcement remain unverified or unfinished. Resolve both failures before committing this increment.

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

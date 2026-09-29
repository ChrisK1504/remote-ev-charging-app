# BACKEND PROGRESS NOTES

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
2. Heartbeat [TODO]
3. StatusNotification
4. RemoteStartTransaction    
5. StartTransaction
6. MeterValues
7. RemoteStopTransaction     
8. StopTransaction

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
![alt text](image.png)

- StartTransaction






### ISSUES
- Standard WS should be used to use OCPP .
- Module wiring caused the websocketservice to be initialized twice, throwing an error by occupying the same port twice.


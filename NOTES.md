
# DEVELOPMENT NOTES

## DAY 1 - OCPP Research, Barebones OCPP communication in NestJS API

### GOAL - Understand how an application communicates via with an EV charger via OCPP. Implement a simple
### communication pipeline between backend and a simulated EV charger that uses OCPP protocol.


#### LEARNED
- Open Charge Point Protocol is the communication Standard between EV chargers and a CMS.
- OCPP 1.6, 2.0.1 and 2.1 exist. 1.6 being the most widely used, 2.0.1 which added advanced security, device management, but is not backwards compatible with 1.6, 2.1 being the newest with bidirectional power transfer being its main selling point it seems (also backwards compatible with 2.1).
- OCPP 1.6 has two main implementations, SOAP and JSON.
- Connection between Charge Point and Central System is achieved via WebSockets. Charge Point functions as a Websocket client, while Central System acts as a Websocket server.

#### DECISIONS
- For the project i will use OCPP 1.6-J, seeing as its the most popular commercialy, with its JSON implementation for a more modern and compact approach.
- Tech stack will be NestJS backend, React frontend (Mobile app in React Native would be desirable for the end user but out of scope). 





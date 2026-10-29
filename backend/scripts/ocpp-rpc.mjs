
import assert from 'node:assert';
import ocppRpc, { createRPCError } from 'ocpp-rpc';

const { RPCServer, RPCClient } = ocppRpc;

const server = new RPCServer({
    protocols: ['ocpp1.6'],
    strictMode: true,
})

server.auth((accept, reject, handshake) => {
    accept({
        sessionId: 'TEST123'
    })
})

server.on('client', async (client) => {
    console.log(`${client.session.sessionId} connected!`);
    

    client.handle('BootNotification', ({ params }) => {
        console.log(`Server got BootNotification from ${client.identity}`, params);
        
        return {
            status: 'Accepted',
            interval: 300,
            currentTime: new Date().toISOString()
        }
    })

    client.handle(({ method, params }) => {
        throw createRPCError("NotImplemented");
    })
})



const cli = new RPCClient({
    endpoint: 'ws://localhost:9001',
    identity: 'EXAMPLE',
    protocols: ['ocpp1.6'],
    strictMode: true,
})


try {
    await server.listen(9001),
    await cli.connect();
    
    const bootResponse = await cli.call('BootNotification', {
        chargePointVendor: "ocpp-rpc",
        chargePointModel: "ocpp-rpc",
    })
    
    assert.equal(bootResponse.status, 'Accepted');
} catch (err) {
    console.error(err);
    process.exitCode = 1;
} finally {
    try {
        cli.close();

    } finally {
        server.close();

    }
}


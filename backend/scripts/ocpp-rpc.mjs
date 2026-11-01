
import assert from 'node:assert';
import ocppRpc, { createRPCError } from 'ocpp-rpc';

const { RPCClient } = ocppRpc;




const cli = new RPCClient({
    endpoint: 'ws://localhost:9001',
    identity: 'EXAMPLE',
    protocols: ['ocpp1.6'],
    strictMode: true,
})

try {
    await cli.connect();
    
    const bootResponse = await cli.call('BootNotification', {
        chargePointVendor: "ocpp-rpc-test",
        chargePointModel: "ocpp-rpc-test",
    })

    assert.equal(bootResponse.status, 'Accepted');
} catch (err) {
    console.error(err);
    process.exitCode = 1;
} finally {
    try {
        cli.close();

    } finally {

    }
}


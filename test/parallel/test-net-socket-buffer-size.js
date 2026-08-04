'use strict';
const common = require('../common');
const assert = require('node:assert');
const net = require('node:net');
const { once } = require('node:events');
const { describe, test } = require('node:test');
const tmpdir = require('../common/tmpdir');

tmpdir.refresh();

const badBufferSizes = [-1, 0, Infinity, NaN, 'Doh!', null, 1.5, 2 ** 31];
const badBufferSizeError = {
  code: 'ERR_SOCKET_BAD_BUFFER_SIZE',
  name: 'TypeError',
  message: /^Buffer size must be a positive integer$/,
};

describe('net.Socket buffer sizes', () => {
  test('getters return undefined and setters cache before a handle exists', () => {
    const socket = new net.Socket();
    assert.strictEqual(socket.getRecvBufferSize(), undefined);
    assert.strictEqual(socket.getSendBufferSize(), undefined);
    assert.strictEqual(socket.setRecvBufferSize(10000), socket);
    assert.strictEqual(socket.setSendBufferSize(10000), socket);
    assert.strictEqual(socket.getRecvBufferSize(), 10000);
    assert.strictEqual(socket.getSendBufferSize(), 10000);
  });

  test('invalid buffer sizes throw ERR_SOCKET_BAD_BUFFER_SIZE without a handle', () => {
    const socket = new net.Socket();
    for (const badBufferSize of badBufferSizes) {
      assert.throws(() => {
        socket.setRecvBufferSize(badBufferSize);
      }, badBufferSizeError);
      assert.throws(() => {
        socket.setSendBufferSize(badBufferSize);
      }, badBufferSizeError);
    }
  });

  test('can get and set buffer sizes on a connected socket', async () => {
    const server = net.createServer();
    server.listen(0);
    await once(server, 'listening');

    const client = net.connect(server.address().port);
    const [conn] = await once(server, 'connection');
    await once(client, 'connect');

    // Server-accepted socket.
    assert(Number.isInteger(conn.getRecvBufferSize()));
    assert(conn.getRecvBufferSize() > 0);
    assert(Number.isInteger(conn.getSendBufferSize()));
    assert(conn.getSendBufferSize() > 0);

    assert.strictEqual(conn.setRecvBufferSize(10000), conn);
    assert.strictEqual(conn.setSendBufferSize(10000), conn);

    // Note: some platforms (e.g. Linux) double the requested value.
    assert(conn.getRecvBufferSize() >= 10000);
    assert(conn.getSendBufferSize() >= 10000);

    // Client socket.
    assert(Number.isInteger(client.getRecvBufferSize()));
    assert(client.getRecvBufferSize() > 0);
    assert(Number.isInteger(client.getSendBufferSize()));
    assert(client.getSendBufferSize() > 0);

    assert.strictEqual(client.setRecvBufferSize(10000), client);
    assert.strictEqual(client.setSendBufferSize(10000), client);

    assert(client.getRecvBufferSize() >= 10000);
    assert(client.getSendBufferSize() >= 10000);

    for (const badBufferSize of badBufferSizes) {
      assert.throws(() => {
        client.setRecvBufferSize(badBufferSize);
      }, badBufferSizeError);
      assert.throws(() => {
        client.setSendBufferSize(badBufferSize);
      }, badBufferSizeError);
    }

    conn.end();
    await once(client, 'close');
    server.close();
    await once(server, 'close');
  });

  test('buffer sizes set before connect() are applied on connection', async () => {
    const server = net.createServer((conn) => {
      conn.end();
    });
    server.listen(0);
    await once(server, 'listening');

    const socket = new net.Socket();
    socket.setRecvBufferSize(10000);
    socket.setSendBufferSize(10000);

    socket.connect(server.address().port);
    await once(socket, 'connect');

    assert(socket.getRecvBufferSize() >= 10000);
    assert(socket.getSendBufferSize() >= 10000);

    await once(socket, 'close');
    server.close();
    await once(server, 'close');
  });

  test('IPC sockets do not support buffer sizes', async () => {
    const server = net.createServer((conn) => {
      conn.end();
    });
    server.listen(common.PIPE);
    await once(server, 'listening');

    const client = net.connect(common.PIPE);
    await once(client, 'connect');

    assert.throws(() => {
      client.getRecvBufferSize();
    }, { code: 'ERR_INVALID_HANDLE_TYPE' });
    assert.throws(() => {
      client.getSendBufferSize();
    }, { code: 'ERR_INVALID_HANDLE_TYPE' });
    assert.throws(() => {
      client.setRecvBufferSize(10000);
    }, { code: 'ERR_INVALID_HANDLE_TYPE' });
    assert.throws(() => {
      client.setSendBufferSize(10000);
    }, { code: 'ERR_INVALID_HANDLE_TYPE' });

    await once(client, 'close');
    server.close();
    await once(server, 'close');
  });
});

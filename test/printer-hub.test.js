const test = require('node:test');
const assert = require('node:assert/strict');
const { PrinterHub } = require('../src/core/printer-hub');

class FakeSource {
  constructor(onStart) {
    this.onStart = onStart;
    this.stateCb = null;
    this.authCb = null;
    this.stopped = false;
  }
  onState(cb) { this.stateCb = cb; }
  onAuthFailure(cb) { this.authCb = cb; }
  start() { if (this.onStart) this.onStart(this); }
  stop() { this.stopped = true; this.stateCb = null; }
}

const both = { serial: 'A', host: '192.168.2.150', hasLan: true, hasCloud: true };

test('PrinterHub：LAN 静默无首帧时按期限强制回退云端', async () => {
  const made = [];
  const changes = [];
  const reports = [];
  const hub = new PrinterHub({
    fallbackDelayMs: 15,
    pickTransport: () => 'lan',
    makeSource: (_entry, transport) => {
      const source = new FakeSource(transport === 'cloud'
        ? (s) => queueMicrotask(() => s.stateCb({ connected: true, mc_percent: 37 }))
        : null);
      made.push({ transport, source });
      return source;
    },
    onReport: (_serial, report) => reports.push(report),
    onTransportChange: (_serial, event) => changes.push(event),
  });

  hub.sync([both]);
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.deepEqual(made.map((x) => x.transport), ['lan', 'cloud']);
  assert.equal(made[0].source.stopped, true);
  assert.equal(reports.at(-1).mc_percent, 37);
  assert.equal(hub.transportFor('A'), 'cloud');
  assert.deepEqual(changes, [{ from: 'lan', to: 'cloud', reason: 'timeout' }]);
  hub.stopAll();
});

test('PrinterHub：LAN 在期限内收到首帧时不回退', async () => {
  const made = [];
  const hub = new PrinterHub({
    fallbackDelayMs: 20,
    pickTransport: () => 'lan',
    makeSource: (_entry, transport) => {
      const source = new FakeSource((s) => queueMicrotask(() => s.stateCb({ connected: true })));
      made.push(transport);
      return source;
    },
    onReport: () => {},
  });

  hub.sync([both]);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(made, ['lan']);
  assert.equal(hub.transportFor('A'), 'lan');
  hub.stopAll();
});

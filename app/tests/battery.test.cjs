const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const battery = createLoader()('src/shared/utils/battery.ts');
const reading = over => ({
  percent: 63.4, voltage: 11.432, estimationMode: 'VOLTAGE_ONLY', confidence: 'LOW', chargingState: 'UNKNOWN',
  updatedAt: '2026-11-06T09:00:00Z', isStale: false, dispatchStatus: 'ELIGIBLE', dispatchAllowed: true, ...over,
});

test('unknown battery is shown as Unknown, never 0 %', () => {
  assert.equal(battery.formatBatteryPercent(null), 'Unknown');
  assert.equal(battery.formatBatteryPercent(undefined), 'Unknown');
  assert.equal(battery.formatBatteryPercent(Number.NaN), 'Unknown');
  assert.equal(battery.isBatteryLow(null), false);
});

test('known battery is rounded and a real 0 % stays 0 %', () => {
  assert.equal(battery.formatBatteryPercent(63.4), '63%');
  assert.equal(battery.formatBatteryPercent(0), '0%');
  assert.equal(battery.isBatteryLow(0), true);
  assert.equal(battery.isBatteryLow(21), false);
  assert.equal(battery.isBatteryLow(25, 30), true);
});

test('battery detail names voltage, mode, confidence and staleness; charging only when confirmed', () => {
  assert.equal(battery.batteryDetail(reading()), '11.43 V · Voltage estimate · Low confidence');
  assert.equal(battery.batteryDetail(reading({ isStale: true })), '11.43 V · Voltage estimate · Low confidence · Stale');
  assert.equal(battery.batteryDetail(reading({ chargingState: 'CHARGING' })).includes('Charging'), true);
  assert.equal(battery.batteryDetail(reading({ percent: null, voltage: null, estimationMode: 'UNAVAILABLE', confidence: 'NONE' })), 'No sensor reading');
  assert.equal(battery.batteryDetail(null), '');
});

// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  stationKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStationDevice,
  buildStationStates,
  buildLineDevice,
  buildLineStates,
  lineStatusText,
  DEVICE_TYPES,
} from '../src/device.js';
import { parseTraffic, lineTraffic } from '../src/traffic.js';
import { findStation } from '../src/stations.js';
import { lineById } from '../src/lines.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, NOW, STATIONS, passage, rawAlert } from './helpers/fixtures.js';

const TIMES_A = {
  station: findStation(STATIONS, 'Times Sq-42 St'),
  line: lineById('A'),
  direction: 'Downtown',
};
TIMES_A.key = stationKey(TIMES_A.station, TIMES_A.line, TIMES_A.direction);
TIMES_A.name = followedName(TIMES_A);
const ST86 = { station: findStation(STATIONS, '86 St (Q)'), line: null, direction: '' };
ST86.key = stationKey(ST86.station, null, '');
ST86.name = followedName(ST86);
const PASSAGES = [passage({ minutes: 14.5 }), passage({ minutes: 28.2 })];
const traffic = parseTraffic({
  alerts: [
    rawAlert(),
    rawAlert({
      id: 'notice',
      routeIds: ['A'],
      header: 'Some uptown [A] trains board on the downtown platform at 42 St.',
      alertType: 'Boarding Change',
    }),
  ],
});

const devices = (language) => [
  buildStationDevice(fakeGladys, TIMES_A, language),
  buildStationDevice(fakeGladys, ST86, language),
  buildLineDevice(fakeGladys, lineById('L'), language),
  buildLineDevice(fakeGladys, lineById('GS'), language),
  buildLineDevice(fakeGladys, lineById('SI'), language),
];

// Pairs with an icon and a label in the Gladys front (front/src/utils/consts.js).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, undefined],
  [
    DEVICE_FEATURE_CATEGORIES.DURATION,
    DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    DEVICE_FEATURE_UNITS.MINUTES,
  ],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, undefined],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(feature.read_only, true, feature.external_id);
        assert.equal(feature.has_feedback, false, feature.external_id);
        assert.ok(feature.name.length > 0 && feature.name.length <= 255);
      }
      const names = new Set(device.features.map((feature) => feature.name));
      assert.equal(names.size, device.features.length, 'every feature has its own name');
    }
  }
});

test('category / type / unit pairs known to the Gladys front, from the SDK constants', () => {
  for (const feature of devices('en').flatMap((device) => device.features)) {
    assert.ok(
      PAIRS.some(
        ([category, type, unit]) =>
          feature.category === category && feature.type === type && feature.unit === unit,
      ),
      `${feature.external_id}: ${feature.category}/${feature.type}/${feature.unit}`,
    );
  }
});

test('ids from the complex id, the route id and the direction; read back', () => {
  const [times, st86, l, gs, si] = devices('fr');
  assert.equal(times.external_id, 'ext:mta-new-york:station:611_a_downtown');
  assert.equal(times.name, 'MTA Times Sq-42 St (A → Downtown)');
  assert.equal(st86.external_id, 'ext:mta-new-york:station:476');
  assert.equal(st86.name, 'MTA 86 St (Q)');
  assert.deepEqual([l.external_id, l.name], ['ext:mta-new-york:line:l', 'MTA Ligne L']);
  assert.deepEqual([gs.external_id, gs.name], ['ext:mta-new-york:line:gs', 'MTA 42 St Shuttle']);
  assert.equal(si.name, 'MTA Staten Island Railway');
  assert.equal(devices('en')[2].name, 'MTA L train');
  assert.deepEqual(parseExternalId('ext:mta-new-york:station:611_a_downtown:wait'), {
    type: 'station',
    key: '611_a_downtown',
  });
  assert.deepEqual(parseExternalId('ext:mta-new-york:line:gs'), { type: 'line', key: 'gs' });
  assert.equal(parseExternalId('something'), null);
  // Other case or spaces in the direction: the same device.
  assert.equal(stationKey(TIMES_A.station, TIMES_A.line, ' DOWNTOWN '), TIMES_A.key);
  assert.deepEqual(
    times.params.map((param) => [param.name, param.value]),
    [
      ['MTA_STATION', 'Times Sq-42 St'],
      ['MTA_LINE', 'A'],
      ['MTA_DIRECTION', 'Downtown'],
    ],
  );
});

test('station states: the next train and the two waits', () => {
  const states = buildStationStates(fakeGladys, TIMES_A, PASSAGES, { language: 'fr', now: NOW });
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
  );
  assert.equal(byKey.wait, 14);
  assert.equal(byKey.following, 28);
  assert.equal(byKey.next, 'A → Far Rockaway-Mott Av · 14 min');
  // A trip no train is put on yet: the text says it.
  const scheduled = buildStationStates(fakeGladys, TIMES_A, [passage({ assigned: false })], {
    language: 'en',
    now: NOW,
  });
  assert.deepEqual(
    scheduled.map((s) => s.device_feature_external_id.split(':').pop()),
    ['next', 'wait'],
  );
  assert.equal(scheduled[0].text, 'A → Far Rockaway-Mott Av · 5 min (scheduled)');
  // Nothing announced: the waits are left untouched.
  const empty = buildStationStates(fakeGladys, ST86, [], { language: 'es', now: NOW });
  assert.deepEqual(
    empty.map((s) => s.text),
    ['Ningún tren anunciado'],
  );
});

test('line states: the state with the title of the heaviest alert, the count', () => {
  const L = lineById('L');
  assert.deepEqual(
    buildLineStates(fakeGladys, L, lineTraffic(traffic, 'L', NOW), 'en').map(
      (s) => s.text ?? s.state,
    ),
    [
      'Delays and changes: L trains are running with delays in both directions after we addressed a signal problem at Bedford Av.',
      1,
    ],
  );
  assert.deepEqual(
    buildLineStates(fakeGladys, lineById('7'), lineTraffic(traffic, '7', NOW), 'fr').map(
      (s) => s.text ?? s.state,
    ),
    ['Service normal', 0],
  );
  const [status] = buildLineStates(fakeGladys, lineById('A'), lineTraffic(traffic, 'A', NOW), 'de');
  assert.equal(
    status.text,
    'Hinweis: Some uptown A trains board on the downtown platform at 42 St.',
  );
  assert.equal(lineStatusText({ state: 'suspended', messages: [] }, 'es'), 'Servicio suspendido');
});

test('the discovery batch and the states pass the checks of the fake host API', async (t) => {
  const gladys = createFakeGladys({});
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  const L = lineById('L');
  for (const language of LANGUAGES) {
    await gladys.publishDiscoveredDevices([
      buildStationDevice(gladys, TIMES_A, language),
      buildLineDevice(gladys, L, language),
    ]);
  }
  const [station, line] = gladys.fake.discoveredDevices;
  await gladys.fake.deviceCreated(station);
  await gladys.fake.deviceCreated(line);
  await gladys.publishStates(
    buildStationStates(gladys, TIMES_A, PASSAGES, { language: 'en', now: NOW }),
  );
  await gladys.publishStates(buildLineStates(gladys, L, lineTraffic(traffic, 'L', NOW), 'en'));
  assert.equal(idsOf(gladys, DEVICE_TYPES.STATION, TIMES_A.key).device, station.external_id);
  assert.equal(idsOf(gladys, DEVICE_TYPES.LINE, 'L').device, line.external_id);
  assert.equal(gladys.fake.lastState(`${station.external_id}:wait`), 14);
  assert.equal(gladys.fake.lastState(`${line.external_id}:messages`), 1);
});

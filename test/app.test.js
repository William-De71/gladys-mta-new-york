// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a
// fake MTA serving real (reduced) open data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, IDLE_INTERVAL_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { formatTime } from '../src/time.js';
import {
  fakeMta,
  storePath,
  silent,
  encodeFeed,
  alertL,
  NOW,
  FEEDS_URL,
  STATIONS_URL,
} from './helpers/fixtures.js';

const CONFIG = {
  station_1: 'Times Sq-42 St',
  station_1_line: 'the A train',
  station_1_direction: 'Downtown',
  station_2: 'bedford av',
  station_3: 'Nowhere',
  lines: 'A, L, 7, K',
  interval: '60',
  language: 'fr',
};
const PREFIX = 'ext:test-integration';
const TIMES_A = `${PREFIX}:station:611_a_downtown`;
const BEDFORD = `${PREFIX}:station:120`;
const LINE_A = `${PREFIX}:line:a`;
const LINE_L = `${PREFIX}:line:l`;
const LINE_7 = `${PREFIX}:line:7`;
const MINUTE = 60 * 1000;
const TRIP_UPDATES = 'trip_updates';

/**
 * @description The integration, connected to a fake Gladys and a fake MTA.
 * @param {object} [options] - `{ config, path, api, logger }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({ config = CONFIG, path = storePath(), api = fakeMta() } = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: api,
    feedsUrl: FEEDS_URL,
    stationsUrl: STATIONS_URL,
    storePath: path,
    now: () => clock.now,
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const feedReads = (app) => app.api.requests.byEndpoint[TRIP_UPDATES] ?? 0;

test('two stations and three lines become five devices; unknown names are reported', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [TIMES_A, 'MTA Times Sq-42 St (A → Downtown)'],
      [BEDFORD, 'MTA Bedford Av'],
      [LINE_A, 'MTA Ligne A'],
      [LINE_L, 'MTA Ligne L'],
      [LINE_7, 'MTA Ligne 7'],
    ],
  );
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.fr,
    'Connecté à la MTA : 2 station(s), 3 ligne(s), temps réel lu toutes les 60 s. Inconnu ou ambigu : Nowhere, K.',
  );
  // The list of the stations, the feed of each group of lines once, the alerts.
  assert.deepEqual(api.calls, [
    '/stations.csv',
    'nyct/gtfs-ace',
    'nyct/gtfs-l',
    'camsys/subway-alerts',
  ]);
  // The first readings are a baseline: nothing fires.
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('created devices get their states, sent again after the creation', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, TIMES_A);
  await created(gladys, BEDFORD);
  await created(gladys, LINE_L);
  const [next, following] = app.getSnapshot('611_a_downtown').passages;
  assert.equal(next.destination, 'Ozone Park-Lefferts Blvd');
  assert.ok(app.getSnapshot('611_a_downtown').passages.every((p) => p.side === 'S'));
  assert.equal(gladys.fake.lastState(`${TIMES_A}:wait`), Math.floor((next.at - NOW) / MINUTE));
  assert.equal(
    gladys.fake.lastState(`${TIMES_A}:following`),
    Math.floor((following.at - NOW) / MINUTE),
  );
  assert.match(gladys.fake.lastState(`${TIMES_A}:next`), /^A → Ozone Park-Lefferts Blvd · /);
  assert.equal(gladys.fake.lastState(`${BEDFORD}:next`), 'L → 8 Av · À l’approche');
  assert.equal(gladys.fake.lastState(`${LINE_L}:status`), 'Service normal');
  assert.equal(gladys.fake.lastState(`${LINE_L}:messages`), 0);
  // A new reading: the next L comes in 3 minutes; the line not created gets nothing.
  api.state.feeds['nyct/gtfs-l'] = encodeFeed({
    timestamp: (NOW + MINUTE) / 1000,
    tripUpdates: [
      {
        tripId: 'NEW',
        routeId: 'L',
        stops: [
          { stopId: 'L08N', time: (NOW + 4 * MINUTE) / 1000 },
          { stopId: 'L01N', time: (NOW + 15 * MINUTE) / 1000 },
        ],
      },
    ],
  });
  clock.now += MINUTE;
  await app.readStations();
  assert.equal(gladys.fake.lastState(`${BEDFORD}:next`), 'L → 8 Av · 3 min');
  assert.equal(gladys.fake.lastState(`${BEDFORD}:wait`), 3);
  assert.equal(gladys.fake.lastState(`${LINE_7}:status`), undefined);
});

test('train soon: fired close to its mark, once, between two readings too', async (t) => {
  const { gladys, app, api, clock } = await startApp({
    config: { station_1: 'Bedford Av', station_1_direction: 'Manhattan', language: 'en' },
  });
  t.after(() => gladys.fake.shutdown());
  clock.now += MINUTE;
  const at = clock.now + 12 * MINUTE;
  api.state.feeds['nyct/gtfs-l'] = encodeFeed({
    timestamp: clock.now / 1000,
    tripUpdates: [
      {
        tripId: 'SOON',
        routeId: 'L',
        stops: [
          { stopId: 'L08N', time: at / 1000 },
          { stopId: 'L01N', time: (at + 10 * MINUTE) / 1000 },
        ],
      },
    ],
  });
  await app.readStations({ force: true });
  const ours = () =>
    eventsOf(gladys, TRIGGERS.DEPARTURE_SOON).filter((event) => event.data.time === formatTime(at));
  assert.deepEqual(ours(), []);
  // Seven minutes later, without a reading: the 5-minute mark (between readings).
  clock.now += 7 * MINUTE + 10000;
  await app.checkReminders();
  assert.deepEqual(
    ours().map((event) => [
      event.data.minutes,
      event.data.line,
      event.data.destination,
      event.data.direction,
    ]),
    [['5', 'L', '8 Av', 'Manhattan']],
  );
  assert.equal(ours()[0].data.station, `${PREFIX}:station:120_manhattan`);
  assert.equal(
    ours()[0].data.summary,
    `L train to 8 Av leaves Bedford Av in 5 min (${formatTime(at)}).`,
  );
  await app.checkReminders();
  await app.readStations({ force: true });
  assert.equal(ours().length, 1);
});

test('delays, then good service: fired once each, never again after a restart', async (t) => {
  const path = storePath();
  const config = { station_1: 'Bedford Av', lines: 'L', language: 'fr' };
  const { gladys, app, api, clock } = await startApp({ config, path });
  t.after(() => gladys.fake.shutdown());
  api.state.alerts = encodeFeed({ alerts: [alertL()] });
  await app.trafficTick();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => [event.key, event.data.line_name, event.data.kind]),
    [
      [TRIGGERS.LINE_DISRUPTED, 'Ligne L', undefined],
      [TRIGGERS.SERVICE_ALERT, 'Ligne L', 'disrupted'],
    ],
  );
  const [disrupted] = gladys.fake.sceneEvents;
  assert.equal(disrupted.data.line, LINE_L);
  assert.deepEqual(
    [disrupted.data.state, disrupted.data.alert_type, disrupted.data.start],
    ['disrupted', 'Delays', '10/28 09:38'],
  );
  assert.match(disrupted.data.summary, /^Ligne L : Service perturbé \(L trains are running/);
  // The same reading again: nothing new.
  await app.trafficTick();
  assert.equal(gladys.fake.sceneEvents.length, 2);
  // A restart on the same /data: nothing replayed, the list of the stations
  // not downloaded again.
  const second = createFakeGladys({ config });
  t.after(() => second.fake.shutdown());
  const calls = api.calls.length;
  const restarted = createApp(second, {
    fetch: api,
    feedsUrl: FEEDS_URL,
    stationsUrl: STATIONS_URL,
    storePath: path,
    now: () => clock.now,
    timers: false,
    logger: silent,
  });
  await second.connect();
  await restarted.whenReady();
  assert.deepEqual(second.fake.sceneEvents, []);
  assert.ok(!api.calls.slice(calls).includes('/stations.csv'));
  // The delays over; planned work only.
  clock.now += 30 * MINUTE;
  api.state.alerts = encodeFeed({
    alerts: [alertL({ alertType: 'Planned - Stops Skipped', header: 'Some L trains skip 1 Av.' })],
  });
  await restarted.trafficTick();
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => [event.key, event.data.state]),
    [[TRIGGERS.LINE_RESTORED, 'planned']],
  );
});

test('one request per feed for every station; quiet stations every 10 minutes', async (t) => {
  const { gladys, app, api, clock } = await startApp({
    config: {
      station_1: 'Times Sq-42 St',
      station_1_line: 'A',
      station_2: 'Times Sq-42 St',
      station_2_line: 'C',
      interval: '30',
      added_stations: [
        { station: 'complex:120', line: '', direction: '' },
        { station: '1 Av', line: '', direction: 'Brooklyn' },
      ],
    },
  });
  t.after(() => gladys.fake.shutdown());
  assert.equal(app.getStations().length, 4);
  const before = api.calls.length;
  clock.now += 31 * 1000;
  await app.readStations();
  assert.deepEqual(api.calls.slice(before), ['nyct/gtfs-ace', 'nyct/gtfs-l']);
  // The Z runs on weekday rush hours only: read every 10 minutes.
  const quiet = await startApp({
    config: { station_1: 'Broad St', station_1_line: 'Z' },
  });
  t.after(() => quiet.gladys.fake.shutdown());
  const reads = feedReads(quiet.app);
  quiet.clock.now += 2 * MINUTE;
  await quiet.app.readStations();
  assert.equal(feedReads(quiet.app), reads);
  quiet.clock.now += IDLE_INTERVAL_MS;
  await quiet.app.readStations();
  assert.equal(feedReads(quiet.app), reads + 1);
});

test('the open data down: a clear status; a feed failing gives its last reading', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, BEDFORD);
  // One feed failing a short while: its last reading stands, still connected.
  api.state.failFeeds = 502;
  clock.now += 2 * MINUTE;
  await app.readStations();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.ok(app.getSnapshot('120').passages.length > 0);
  // Everything down: a clear status.
  api.state.fail = 503;
  await app.trafficTick();
  clock.now += 2 * MINUTE;
  await app.readStations();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /do not answer \(alerts: HTTP 503\)/);
  api.state.fail = null;
  api.state.failFeeds = null;
  await app.trafficTick();
  await app.readStations();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('widgets: followed stations, a typed station, lines; valid in every language', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const answers = [
      await gladys.fake.widgetGet(WIDGETS.DEPARTURES, { settings: {}, language }),
      await gladys.fake.widgetGet(WIDGETS.DEPARTURES, {
        settings: { stations: [TIMES_A, BEDFORD] },
        language,
      }),
      await gladys.fake.widgetGet(WIDGETS.DEPARTURES, {
        settings: { station_name: '42 St-Port Authority Bus Terminal', line: 'E' },
        language,
      }),
      await gladys.fake.widgetGet(WIDGETS.TRAFFIC, { settings: {}, language }),
      await gladys.fake.widgetGet(WIDGETS.TRAFFIC, { settings: { lines: 'F, Q' }, language }),
    ];
    for (const answer of answers) {
      assert.equal(answer.success, true);
      assert.deepEqual(validateWidgetContent(answer.data.content), [], language);
    }
  }
  const typed = await gladys.fake.widgetGet(WIDGETS.DEPARTURES, {
    settings: { station_name: 'R16', line: 'N' },
    language: 'fr',
  });
  const [heading, , status] = typed.data.content.components;
  assert.equal(heading.text, 'Times Sq-42 St (N)');
  assert.deepEqual(
    status.items.map((item) => item.label),
    ['N → Coney Island-Stillwell Av', 'N → Astoria-Ditmars Blvd'],
  );
  const unknown = await gladys.fake.widgetGet(WIDGETS.TRAFFIC, {
    settings: { lines: 'K' },
    language: 'en',
  });
  assert.equal(unknown.data.content.components[0].text, 'Unknown or ambiguous: K.');
});

test('the status widget shows the lines of the followed stations when no line is followed', async (t) => {
  const { gladys, api } = await startApp({ config: { station_1: 'Bedford Av' } });
  t.after(() => gladys.fake.shutdown());
  // No line followed: the alerts are not read on the timer…
  assert.ok(!api.calls.includes('camsys/subway-alerts'));
  const traffic = await gladys.fake.widgetGet(WIDGETS.TRAFFIC, { settings: {}, language: 'en' });
  assert.deepEqual(
    traffic.data.content.components[1].items.map((item) => [item.label, item.value]),
    [['L train', 'Good service']],
  );
  // …until the widget is shown.
  assert.ok(api.calls.includes('camsys/subway-alerts'));
});

test('scene actions: next trains of a station, status of a line', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const next = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_NEXT_DEPARTURES, {
    station: BEDFORD,
  });
  assert.equal(next.success, true);
  const { outputs } = next.data;
  assert.deepEqual(
    [outputs.found, outputs.line, outputs.destination, outputs.minutes, outputs.scheduled],
    [true, 'L', '8 Av', 0, false],
  );
  assert.equal(outputs.following_minutes, 1);
  assert.equal(
    outputs.summary,
    'Prochain train à Bedford Av : L vers 8 Av à l’approche. Le suivant dans 1 min.',
  );
  api.state.alerts = encodeFeed({ alerts: [alertL()] });
  const status = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_LINE_STATUS, { line: LINE_L });
  // A reading of less than 90 s is reused: the alert is not seen yet.
  assert.equal(status.data.outputs.state, 'normal');
  const first = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_LINE_STATUS, {});
  assert.deepEqual(
    [first.data.outputs.line_name, first.data.outputs.state],
    ['Ligne A', 'disrupted'],
  );
});

test('configuration actions: test, find a station, diagnostic', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.state.alerts = encodeFeed({ alerts: [alertL()] });
  const tested = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(tested.success, true);
  const fr = tested.data.message.fr;
  assert.match(fr, /^Open data MTA joint : 445 stations/);
  assert.match(fr, /Bedford Av : \d+ train\(s\), prochain L à l’approche/);
  assert.match(
    fr,
    /Ligne A : Service normal · Ligne L : Service perturbé · Ligne 7 : Service normal/,
  );
  assert.match(fr, /inconnu ou ambigu : Nowhere · inconnu ou ambigu : K/);
  // The list of the stations asked again.
  assert.equal(api.calls.filter((call) => call === '/stations.csv').length, 2);
  const found = await gladys.fake.action(ACTIONS.SEARCH_STATION, { query: '86 st' });
  const text = found.data.message.fr;
  assert.match(text, /^Saisissez le nom/);
  assert.match(text, /\n• 86 St \(Q\) · Manhattan \[Q04\] → Q(\n|$)/);
  assert.match(text, /\n• 86 St \(4 5 6\) · Manhattan \[626\] → 4 5 6(\n|$)/);
  const short = await gladys.fake.action(ACTIONS.SEARCH_STATION, { query: 'r' });
  assert.match(short.data.message.en, /at least two letters/);
  const none = await gladys.fake.action(ACTIONS.SEARCH_STATION, { query: 'zzz' });
  assert.equal(none.data.message.en, 'No station matches "zzz".');
  const diagnostic = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(diagnostic.data.message.en, /MTA diagnostic/);
});

test('add, list and remove stations with the buttons, beyond the three of the form', async (t) => {
  const { gladys, app } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const added = await gladys.fake.action(ACTIONS.ADD_STATION, {
    station: 'Times Sq-42 St',
    line: '7',
    direction: 'Queens',
  });
  assert.match(
    added.data.message.en,
    /^Station added: Times Sq-42 St \(7 → Queens\)\. 3 station\(s\)/,
  );
  assert.deepEqual(gladys.fake.config.added_stations, [
    { station: 'complex:611', line: '7', direction: 'Queens' },
  ]);
  assert.ok(
    gladys.fake.discoveredDevices.some(
      (device) => device.external_id === `${PREFIX}:station:611_7_queens`,
    ),
  );
  // The 7 feed was not read before: it is now.
  const snapshot = app.getSnapshot('611_7_queens');
  assert.ok(snapshot.passages.length > 0);
  assert.ok(snapshot.passages.every((p) => p.lineId === '7' && p.side === 'N'));
  const again = await gladys.fake.action(ACTIONS.ADD_STATION, {
    station: 'times sq',
    line: '7',
    direction: 'queens',
  });
  assert.match(again.data.message.en, /already followed/);
  const unknown = await gladys.fake.action(ACTIONS.ADD_STATION, { station: '86 St' });
  assert.equal(unknown.data.message.en, 'Unknown or ambiguous: 86 St.');
  const list = await gladys.fake.action(ACTIONS.LIST_STATIONS);
  assert.equal(
    list.data.message.fr,
    '4 station(s) suivie(s) :\n' +
      '1. Times Sq-42 St (A → Downtown) (formulaire, station 1)\n' +
      '2. Bedford Av (formulaire, station 2)\n' +
      '3. Nowhere (formulaire, station 3, inconnue ou ambiguë)\n' +
      '4. Times Sq-42 St (7 → Queens)',
  );
  const inForm = await gladys.fake.action(ACTIONS.REMOVE_STATION, { station: '2' });
  assert.match(inForm.data.message.en, /is station 2 of the form/);
  const removed = await gladys.fake.action(ACTIONS.REMOVE_STATION, { station: '4' });
  assert.match(removed.data.message.en, /^Station removed: Times Sq-42 St \(7 → Queens\)/);
  assert.deepEqual(gladys.fake.config.added_stations, []);
  assert.equal(app.getStations().length, 2);
});

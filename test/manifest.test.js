// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS, REMINDER_MINUTES } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, BOARD_COUNT } from '../src/widgets.js';
import {
  MAX_STATIONS,
  AUTO_LANGUAGE,
  INTERVALS,
  DEFAULT_INTERVAL,
  INTERNAL_KEYS,
} from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { STATES } from '../src/traffic.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'MTA New York');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-mta-new-york:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-mta-new-york/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-mta-new-york');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the cloud transport only: the open data of the MTA', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  const api = source('../src/mta-api.js');
  assert.match(api, /https:\/\/api-endpoint\.mta\.info\/Dataservice\/mtagtfsfeeds/);
  assert.match(api, /https:\/\/data\.ny\.gov\/api\/views\/39hk-dx4f/);
});

test('requires the Gladys of widgets and scenes; no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['transport']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // A widget button form would need 5.2.0.
  assert.doesNotMatch(source('../src/widgets.js'), /type: 'button'/);
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('the configuration of the code: no key, three stations, lines, interval', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('api_key'), undefined);
  assert.ok(manifest.config_schema.every((field) => field.type !== 'secret'));
  for (let slot = 1; slot <= MAX_STATIONS; slot += 1) {
    for (const key of [`station_${slot}`, `station_${slot}_line`, `station_${slot}_direction`]) {
      assert.equal(config.get(key).type, 'string', key);
    }
  }
  assert.equal(config.get(`station_${MAX_STATIONS + 1}`), undefined);
  assert.equal(config.get('lines').type, 'string');
  const interval = config.get('interval');
  assert.deepEqual(values(interval), INTERVALS.map(String));
  assert.equal(interval.default, String(DEFAULT_INTERVAL));
  assert.equal(config.get(INTERNAL_KEYS.language), undefined, 'internal key, never shown');
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password', 'number'].includes(field.type), `${field.key}: ${field.type}`);
    assert.equal(field.display_if, undefined, field.key);
  }
});

test('the trigger filters are the values the events carry', () => {
  const triggers = byKey(manifest.scene_triggers);
  const soon = byKey(triggers.get(TRIGGERS.DEPARTURE_SOON).fields);
  assert.deepEqual(values(soon.get('minutes')), REMINDER_MINUTES.map(String));
  assert.equal(soon.get('station').source, 'devices');
  for (const key of [TRIGGERS.LINE_DISRUPTED, TRIGGERS.LINE_RESTORED, TRIGGERS.SERVICE_ALERT]) {
    assert.equal(byKey(triggers.get(key).fields).get('line').source, 'devices', key);
  }
  // The kinds of an alert: every state but the two of a line without one.
  const alert = byKey(triggers.get(TRIGGERS.SERVICE_ALERT).fields);
  assert.deepEqual(
    values(alert.get('kind')),
    STATES.filter((state) => !['unknown', 'normal'].includes(state)),
  );
  const count = byKey(byKey(manifest.widgets).get(WIDGETS.DEPARTURES).settings).get('count');
  assert.deepEqual(
    [count.min, count.max, count.default],
    [BOARD_COUNT.min, BOARD_COUNT.max, BOARD_COUNT.default],
  );
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog keywords and countries of Gladys 5.3.0', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  const keywords = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(keywords.length >= 1 && keywords.length <= 10, 'one to ten keywords');
  keywords.forEach((keyword) => assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword));
  assert.equal(new Set(keywords).size, keywords.length, 'unique once trimmed and lowercased');
  // Usable in the US only: hidden from the browse views of the catalog elsewhere.
  assert.deepEqual(manifest.countries, ['US']);
});

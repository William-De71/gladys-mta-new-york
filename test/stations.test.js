import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import {
  parseCsv,
  buildStations,
  findStation,
  searchStations,
  sideLabel,
  createStations,
  REFRESH_MS,
} from '../src/stations.js';
import { createStore } from '../src/store.js';
import { STATIONS, STATIONS_CSV, NOW, silent, storePath } from './helpers/fixtures.js';

test('CSV: quoted fields, commas, quotes and line breaks', () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x, ""y""",\n2,"multi\nline",z\n');
  assert.deepEqual(rows, [
    { a: '1', b: 'x, "y"', c: '' },
    { a: '2', b: 'multi\nline', c: 'z' },
  ]);
});

test('the official list: 445 stations, complexes gathered', () => {
  assert.equal(STATIONS.length, 445);
  const times = STATIONS.find((station) => station.id === '611');
  assert.equal(times.name, 'Times Sq-42 St');
  assert.deepEqual(times.ids.sort(), ['127', '725', '902', 'A27', 'R16']);
  assert.ok(times.names.includes('42 St-Port Authority Bus Terminal'));
  assert.deepEqual(times.lines, ['1', '2', '3', '7', 'A', 'C', 'E', 'N', 'Q', 'R', 'W', 'GS']);
  assert.equal(times.borough, 'Manhattan');
  // The shuttles by their line, the railway.
  assert.ok(STATIONS.find((s) => s.name === 'Franklin Av').lines.includes('FS'));
  assert.ok(STATIONS.find((s) => s.name === 'St George').lines.includes('SI'));
  // A shared name is told apart by its lines.
  const labels = STATIONS.filter((s) => s.name === '86 St').map((s) => s.label);
  assert.equal(labels.length, 6);
  assert.ok(labels.includes('86 St (Q)'));
  assert.equal(new Set(STATIONS.map((s) => s.label)).size, STATIONS.length);
});

test('stations as typed: name, label, line, stop id, complex id', () => {
  const id = (typed, line) => findStation(STATIONS, typed, line)?.id ?? null;
  assert.equal(id('Times Sq-42 St'), '611');
  assert.equal(id('times sq'), '611');
  assert.equal(id('42 St-Port Authority Bus Terminal'), '611');
  assert.equal(id('86 St'), null);
  assert.equal(id('86 St', 'Q'), '476');
  assert.equal(id('86 St (Q)'), '476');
  assert.equal(id('bedford av'), '120');
  // Bedford Av, Bedford Park Blvd, Bedford-Nostrand Avs.
  assert.equal(id('bedford'), null);
  assert.equal(id('R16'), '611');
  assert.equal(id('127n'), '611');
  // "611" is the stop id of Elder Av; the complex id is written apart.
  assert.notEqual(id('611'), '611');
  assert.equal(id('complex:611'), '611');
  assert.equal(id('complex:99999'), null);
  assert.equal(id('nowhere'), null);
});

test('search: exact names first, then names starting so', () => {
  const found = searchStations(STATIONS, '86 st');
  assert.equal(found.length, 6);
  assert.ok(found.every((station) => station.name === '86 St'));
  assert.deepEqual(searchStations(STATIONS, ''), []);
  assert.equal(searchStations(STATIONS, 'av', 3).length, 3);
});

test('the words of each side of a platform', () => {
  const times = STATIONS.find((station) => station.id === '611');
  assert.equal(sideLabel(times, '127N'), 'Uptown');
  assert.equal(sideLabel(times, '725S'), 'Hudson Yards');
  assert.equal(sideLabel(times, 'L08N'), '');
});

test('the list: the copy of the image, then a fresh one weekly kept in /data', async () => {
  const path = storePath();
  const store = createStore({ path, logger: silent });
  let now = NOW;
  let calls = 0;
  let answer = STATIONS_CSV;
  const api = {
    stations: async () => {
      calls += 1;
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  };
  const csvPath = join(dirname(path), 'mta-stations.csv');
  const stations = createStations({ api, store, path: csvPath, now: () => now, logger: silent });
  assert.equal((await stations.load()).length, 445);
  assert.equal(calls, 1);
  assert.equal(await readFile(csvPath, 'utf8'), STATIONS_CSV);
  assert.equal(stations.byStopId('127N').id, '611');
  assert.equal(stations.describe().source, 'download');
  await stations.load();
  assert.equal(calls, 1);
  // A week later, a failure keeps the list known; a broken answer too.
  now += REFRESH_MS;
  answer = Object.assign(new Error('down'), { kind: 'unreachable' });
  assert.equal((await stations.load()).length, 445);
  answer = 'GTFS Stop ID,Stop Name\n1,X\n';
  assert.equal((await stations.load()).length, 445);
  assert.equal(calls, 3);
  // A new start without network reads the copy kept in /data.
  const again = createStations({
    api: { stations: async () => Promise.reject(new Error('down')) },
    store: createStore({ path, logger: silent }),
    path: csvPath,
    now: () => now,
    logger: silent,
  });
  assert.equal((await again.load()).length, 445);
  assert.equal(again.describe().source, 'data');
  // Nothing in /data and no network: the copy of the image.
  const bare = createStations({
    api: { stations: async () => Promise.reject(new Error('down')) },
    store: createStore({ path: storePath(), logger: silent }),
    path: join(dirname(storePath()), 'mta-stations.csv'),
    now: () => now,
    logger: silent,
  });
  assert.equal((await bare.load()).length, 445);
  assert.equal(bare.describe().source, 'image');
  assert.equal(buildStations([]).length, 0);
});

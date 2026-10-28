import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  readLanguage,
  readInterval,
  parseLines,
  parseAddedStations,
  DEFAULT_INTERVAL,
  MAX_ADDED_STATIONS,
} from '../src/config.js';

test('stations, lines, interval and language from the raw config', () => {
  const config = normalizeConfig({
    station_1: ' Times Sq-42 St ',
    station_1_line: 'A',
    station_1_direction: 'Uptown',
    station_2: '',
    station_3: 'bedford av',
    lines: 'A, F ; l, a',
    interval: '30',
    language: 'de',
  });
  assert.deepEqual(config, {
    stations: [
      { slot: 1, station: 'Times Sq-42 St', line: 'A', direction: 'Uptown' },
      { slot: 3, station: 'bedford av', line: '', direction: '' },
    ],
    addedStations: [],
    lines: ['A', 'F', 'l'],
    interval: 30,
    language: 'de',
  });
  assert.deepEqual(normalizeConfig(null), {
    stations: [],
    addedStations: [],
    lines: [],
    interval: DEFAULT_INTERVAL,
    language: 'auto',
  });
});

test('bounds: six lines, the intervals offered, the stored language', () => {
  assert.equal(parseLines('1,2,3,4,5,6,7,8').length, 6);
  assert.deepEqual(parseLines(undefined), []);
  assert.equal(readInterval(45), DEFAULT_INTERVAL);
  assert.equal(readInterval(300), 300);
  assert.equal(readLanguage({ last_language: 'es' }, 'fr'), 'es');
  assert.equal(readLanguage({ last_language: 'español' }, 'fr'), 'fr');
  assert.equal(readLanguage(undefined, 'en'), 'en');
});

test('the stations added with the buttons follow the three of the form', () => {
  const added = [
    { station: 'complex:611', line: 'A', direction: '' },
    { station: ' complex:120 ', line: '', direction: 'Manhattan' },
    { station: '', line: 'B' },
    'Bedford Av',
  ];
  const config = normalizeConfig({ station_2: '1 Av', added_stations: added });
  assert.deepEqual(config.stations, [
    { slot: 2, station: '1 Av', line: '', direction: '' },
    { slot: null, added: 1, station: 'complex:611', line: 'A', direction: '' },
    { slot: null, added: 2, station: 'complex:120', line: '', direction: 'Manhattan' },
  ]);
  assert.equal(config.addedStations.length, 2);
  // Stored as JSON text by an older core: read the same.
  assert.deepEqual(parseAddedStations(JSON.stringify(added)), config.addedStations);
  assert.deepEqual(parseAddedStations('not json'), []);
  assert.deepEqual(parseAddedStations(undefined), []);
  const many = Array.from({ length: 20 }, (_, n) => ({ station: `S${n}` }));
  assert.equal(parseAddedStations(many).length, MAX_ADDED_STATIONS);
});

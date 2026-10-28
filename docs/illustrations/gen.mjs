// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a real Wednesday morning in New York: the feeds of the
// MTA read on 2026-10-28 at 10:38 and kept in test/fixtures (the trains of
// Times Sq-42 St and the alerts of that minute) go through the real code
// (src/gtfs-rt.js, src/departures.js, src/traffic.js) and the real widget
// builders (src/widgets.js). Nothing is added.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildDeparturesWidget, buildTrafficWidget } = await load('src/widgets.js');
const { parseTraffic, lineTraffic } = await load('src/traffic.js');
const { decodeFeed } = await load('src/gtfs-rt.js');
const { lineById } = await load('src/lines.js');
const { LANGUAGES } = await load('src/i18n.js');
const { NOW, ALERTS, fixturePassages } = await load('test/helpers/fixtures.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// A minute and a half after the reading, as a dashboard shows it between two
// readings: the trains standing in the station at the reading are gone.
const now = NOW + 90 * 1000;
const passages = fixturePassages('Times Sq-42 St');
const traffic = parseTraffic(decodeFeed(ALERTS));
const lines = ['A', 'F', 'L', '7', 'GS'].map((id) => ({
  line: lineById(id),
  traffic: lineTraffic(traffic, id, now),
}));

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    departures: buildDeparturesWidget({
      title: 'Times Sq-42 St',
      passages,
      readAt: NOW,
      count: 6,
      language,
      now,
    }),
    traffic: buildTrafficWidget({ lines, readAt: NOW, language, now }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now, widgets, contents }));

# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the New York City subway of
the MTA (and the Staten Island Railway): a Node.js service (Node 22+, ESM, no
build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the official open data of the MTA, no
key: the GTFS-RT trip updates of the subway, one feed per group of lines
(`https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace`…),
the GTFS-RT service alerts (`camsys%2Fsubway-alerts`) and the official list
of the stations (`https://data.ny.gov/d/39hk-dx4f`, a copy in
`src/data/stations.csv`, read again weekly). The departures of the followed
stations — three in the form, up to 10 more added with the "Add a station"
button — come from the real time alone.
Transport: cloud only.
Terms: https://www.mta.info/developers/terms-and-conditions

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timers
src/mta-api.js          HTTP client of the open data of the MTA: feeds, stations, errors
src/gtfs-rt.js          a GTFS Realtime (Protocol Buffers) decoder, NYCT and Mercury extensions
src/lines.js            the 29 routes of the MTA and the feed of each
src/stations.js         the list of the stations: complexes, labels, search, weekly reading
src/departures.js       trip updates -> departures of a station (side, destination, assigned)
src/traffic.js          alerts -> messages (Mercury type, title, periods, hours), line state
src/events.js           scene trigger transitions, payloads, scene action outputs
src/device.js           the station and line devices and their states
src/widgets.js          departures and service status dashboard widgets
src/store.js            /data/mta-new-york.json: `network`, `seen` (the list: /data/mta-stations.csv)
src/time.js             times of day in New York
src/text.js             names folded for comparisons, slugs
src/config.js           configuration (three stations + `added_stations`, lines, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real feeds of the MTA, reduced: four trip update feeds, alerts
test/helpers/           the fake MTA: a GTFS-RT encoder (with the extensions), fetch
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`station:<complex id>_<route id>_<direction>`, e.g.
  `station:611_a_uptown`, `line:<route id>`, e.g. `line:a`; the complex id is
  the official one of the MTA list, never a name), feature `category` /
  `type` / `unit` / `min` / `max` / `step`, the keys of `config_schema`,
  `actions`, the widgets and their settings, scene triggers (fields, options,
  variables) and scene actions (fields, outputs), and the internal config
  keys `added_stations` (`[{ station, line, direction }]`, stored as
  `complex:<id>` and route ids) and `last_language`.
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make
  a test pass without a documented migration.
- **Category / type pairs.** The next train and the line status are `text` /
  `text`, the waits `duration` / `integer` in minutes (0-180), the count of
  alerts `counter-sensor` / `integer` (0-20). Without a train the waits are
  not published (a 0 would announce a train now).
- **`should_poll` stays false**: the integration reads on its own timer — the
  feeds of the lines of the followed stations, each feed once whatever the
  number of stations, every `interval` (30 s to 5 min, 1 min by default; 10
  min while no station announces a train in the next half hour); the alerts
  (430 KB) every 5 min, only when a line is followed or the service status
  widget was shown; the list of the stations weekly. A widget or a scene
  action reuses a reading of less than 90 s. A feed that fails gives its last
  reading while it is less than 3 minutes old.
- **Stations.** A station is a complex of the MTA list (Times Sq-42 St holds
  the 1 2 3, 7, N Q R W, S and A C E of 42 St-Port Authority). A name of
  several stations ("86 St") is labelled with its lines ("86 St (Q)") and
  needs a line or a GTFS stop id. "611" is the GTFS stop id of Elder Av and
  the complex id of Times Sq: user input is a name or a stop id, the stored
  form is `complex:611`.
- **Departures.** From the trip updates only: the feeds list every stop to
  the terminus, the last one is the destination; a train ending at the
  station is no departure. A trip without a train ("is_assigned" absent or
  false, proto2) is shown as "(scheduled)". No delay (only the L sends one,
  against a timetable the integration does not read) and no cancellation
  (the feeds mark none): never invent either.
- **Traffic.** The state of a line is its heaviest alert under way, by its
  Mercury type: "Planned - …" -> `planned`, a suspension -> `suspended`,
  delays, reduced service, reroutes -> `disrupted`, notices -> `info`;
  `normal` without one. `disrupted` and `suspended` (unplanned) drive
  `line_disrupted` / `line_restored`. An alert counts during one of its
  periods; one starting in the next three days is "coming". The pictograms
  of the texts ("[accessibility icon]") are dropped, line symbols spelled out.
- **Times.** Unix times from the feeds, written in New York time
  (`America/New_York`) whatever the timezone of the instance.
- **Events once.** `seen` (in /data) remembers the reminders fired per
  station, the state and alerts of each followed line. The first reading of
  a station or a line is a baseline: nothing fires. A scene action or a
  widget never fires an event.
- **Terms of the MTA.** Say the data come from the MTA, never that they are
  accurate or that the integration is licensed by the MTA, and that what is
  shown may not be real time (README, docs, NOTICE); keep "MTA" and the time
  of the reading visible in the widgets.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Names of stations, destinations and
  the alerts stay in English.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.3.0` (widgets, scene triggers, catalog
  `keywords` and `countries`). Transport: `["cloud"]`. Countries: `["US"]`.
  No permission, no secret.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake MTA of
  `test/helpers/fixtures.js`).

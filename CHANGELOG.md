# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- One device per followed station of the New York City subway and the Staten Island Railway (three in the form and up to 10 more with the "Add a station" button, typed by name or by stop id, filtered by line and direction — Uptown, Downtown or the words of the platform): the next train as text and the wait of the next two trains, from the real-time feeds of the MTA; trips no train is put on yet are marked as scheduled.
- Stations as complexes of the official list of the MTA (Times Sq-42 St gathers the 1 2 3, 7, N Q R W, S and A C E), shared names told apart by their lines ("86 St (Q)").
- One device per followed line (up to six), shuttles and the railway included: its service status worked out from the type of the alerts of the MTA (good service, notice, planned work, delays and changes, suspended) and the number of alerts under way.
- Scene triggers: train soon (2 to 20 minutes before), line disrupted (unplanned delays, changes or suspension), back to good service, and a new service alert about a followed line.
- Scene actions: read the next trains of a station, and read the service status of a line, each with a ready-made sentence.
- Dashboard widgets: the next trains of one or several stations, like the countdown clocks (any station can be typed in the widget); the service status of lines with the full alerts and the hours the MTA writes, the lines of the followed stations by default.
- Configuration actions: test the connection, find a station by name (with its borough, stop ids and lines), add, list and remove stations, and a diagnostic written to the Logs tab.
- Cloud transport: the official open data of the MTA, no account and no key; one request per group of lines for every followed station, every 30 seconds to 5 minutes, the alerts every 5 minutes, the list of the stations weekly (a copy ships in the image).
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

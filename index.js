// -----------------------------------------------------------------------------
// Entry point of the MTA external integration.
//
// Brings the New York City subway (MTA) into Gladys, through the official
// open data of the MTA (GTFS-RT, no key):
//   - devices: one per followed station, with the next train and the waits,
//     and one per followed line, with its service status (src/device.js);
//   - scene triggers: train soon, line disrupted, back to good service, new
//     service alert;
//   - scene actions: read the next trains of a station, read the service
//     status of a line;
//   - dashboard widgets: departures, service status.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the MTA integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});

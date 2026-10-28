// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, line states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface (appareil / Gerät / dispositivo, scène / Szene / escena) and of
// the MTA (station, train, service status, planned work). The names of the
// stations and lines, the destinations and the alerts stay as the MTA writes
// them, in English.
// -----------------------------------------------------------------------------

import { minutesLeft } from './departures.js';
import { formatTime } from './time.js';
import { KINDS } from './lines.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];
// The brand of the network, in device names and summaries.
const BRAND = 'MTA';

const TEXTS = {
  // devices
  stationDeviceName: {
    en: 'MTA {station}',
    fr: 'MTA {station}',
    de: 'MTA {station}',
    es: 'MTA {station}',
  },
  featureNext: {
    en: 'Next train',
    fr: 'Prochain train',
    de: 'Nächster Zug',
    es: 'Próximo tren',
  },
  featureWait: {
    en: 'Wait',
    fr: 'Attente',
    de: 'Wartezeit',
    es: 'Espera',
  },
  featureFollowing: {
    en: 'Wait for the following one',
    fr: 'Attente du suivant',
    de: 'Wartezeit des folgenden',
    es: 'Espera del siguiente',
  },
  featureStatus: {
    en: 'Service status',
    fr: 'État du service',
    de: 'Betriebslage',
    es: 'Estado del servicio',
  },
  featureMessages: {
    en: 'Alerts under way',
    fr: 'Alertes en cours',
    de: 'Aktuelle Meldungen',
    es: 'Alertas en curso',
  },

  // departures
  noPassage: {
    en: 'No train announced',
    fr: 'Aucun train annoncé',
    de: 'Kein Zug angekündigt',
    es: 'Ningún tren anunciado',
  },
  minutesValue: {
    en: '{n} min',
    fr: '{n} min',
    de: '{n} Min.',
    es: '{n} min',
  },
  approaching: {
    en: 'Arriving',
    fr: 'À l’approche',
    de: 'Fährt ein',
    es: 'Llegando',
  },
  inMinutes: {
    en: 'in {n} min',
    fr: 'dans {n} min',
    de: 'in {n} Min.',
    es: 'dentro de {n} min',
  },
  atTime: {
    en: 'at {time}',
    fr: 'à {time}',
    de: 'um {time}',
    es: 'a las {time}',
  },
  scheduledMark: {
    en: '(scheduled)',
    fr: '(prévu)',
    de: '(geplant)',
    es: '(previsto)',
  },

  // lines
  subwayLineLabel: {
    en: '{line} train',
    fr: 'Ligne {line}',
    de: 'Linie {line}',
    es: 'Línea {line}',
  },

  // line states
  state_unknown: {
    en: 'No information',
    fr: 'Pas d’information',
    de: 'Keine Information',
    es: 'Sin información',
  },
  state_normal: {
    en: 'Good service',
    fr: 'Service normal',
    de: 'Normaler Betrieb',
    es: 'Servicio normal',
  },
  state_info: {
    en: 'Service notice',
    fr: 'Information',
    de: 'Hinweis',
    es: 'Aviso',
  },
  state_planned: {
    en: 'Planned work',
    fr: 'Travaux programmés',
    de: 'Geplante Bauarbeiten',
    es: 'Obras programadas',
  },
  state_disrupted: {
    en: 'Delays and changes',
    fr: 'Service perturbé',
    de: 'Gestörter Betrieb',
    es: 'Servicio alterado',
  },
  state_suspended: {
    en: 'Service suspended',
    fr: 'Service suspendu',
    de: 'Betrieb eingestellt',
    es: 'Servicio suspendido',
  },
  stateWithTitle: {
    en: '{state}: {title}',
    fr: '{state} : {title}',
    de: '{state}: {title}',
    es: '{state}: {title}',
  },
  kind_info: {
    en: 'Notice',
    fr: 'Information',
    de: 'Hinweis',
    es: 'Aviso',
  },
  kind_planned: {
    en: 'Planned work',
    fr: 'Travaux',
    de: 'Bauarbeiten',
    es: 'Obras',
  },
  kind_disrupted: {
    en: 'Delays',
    fr: 'Perturbation',
    de: 'Störung',
    es: 'Incidencia',
  },
  kind_suspended: {
    en: 'Suspension',
    fr: 'Suspension',
    de: 'Einstellung',
    es: 'Suspensión',
  },
  upcomingState: {
    en: 'Coming',
    fr: 'À venir',
    de: 'Demnächst',
    es: 'Próximamente',
  },

  // scene summaries
  summarySoon: {
    en: '{line} train to {destination} leaves {station} in {minutes} min ({time}).',
    fr: 'Le train {line} vers {destination} part de {station} dans {minutes} min ({time}).',
    de: 'Der Zug {line} Richtung {destination} fährt in {station} in {minutes} Min. ab ({time}).',
    es: 'El tren {line} hacia {destination} sale de {station} dentro de {minutes} min ({time}).',
  },
  summaryDisrupted: {
    en: '{line}: {state}.',
    fr: '{line} : {state}.',
    de: '{line}: {state}.',
    es: '{line}: {state}.',
  },
  summaryDisruptedTitle: {
    en: '{line}: {state} ({title})',
    fr: '{line} : {state} ({title})',
    de: '{line}: {state} ({title})',
    es: '{line}: {state} ({title})',
  },
  summaryRestored: {
    en: '{line}: no more delays nor suspension ({state}).',
    fr: '{line} : fin de perturbation ({state}).',
    de: '{line}: keine Störung mehr ({state}).',
    es: '{line}: fin de la incidencia ({state}).',
  },
  summaryMessage: {
    en: '{line}, {kind}: {title}',
    fr: '{line}, {kind} : {title}',
    de: '{line}, {kind}: {title}',
    es: '{line}, {kind}: {title}',
  },
  summaryLineState: {
    en: '{line}: {state} ({title})',
    fr: '{line} : {state} ({title})',
    de: '{line}: {state} ({title})',
    es: '{line}: {state} ({title})',
  },
  summaryLineStateOnly: {
    en: '{line}: {state}.',
    fr: '{line} : {state}.',
    de: '{line}: {state}.',
    es: '{line}: {state}.',
  },
  outputNext: {
    en: 'Next train at {station}: {line} to {destination} {when}.',
    fr: 'Prochain train à {station} : {line} vers {destination} {when}.',
    de: 'Nächster Zug in {station}: {line} Richtung {destination} {when}.',
    es: 'Próximo tren en {station}: {line} hacia {destination} {when}.',
  },
  outputFollowing: {
    en: 'The following one {when}.',
    fr: 'Le suivant {when}.',
    de: 'Der folgende {when}.',
    es: 'El siguiente {when}.',
  },
  outputNone: {
    en: 'No train announced at {station}.',
    fr: 'Aucun train annoncé à {station}.',
    de: 'Kein Zug in {station} angekündigt.',
    es: 'Ningún tren anunciado en {station}.',
  },

  // widgets
  readAt: {
    en: 'read at {time}',
    fr: 'lu à {time}',
    de: 'gelesen um {time}',
    es: 'leído a las {time}',
  },
  updatedAt: {
    en: 'MTA · updated at {time}',
    fr: 'MTA · mis à jour à {time}',
    de: 'MTA · aktualisiert um {time}',
    es: 'MTA · actualizado a las {time}',
  },
  minutesShort: {
    en: 'min',
    fr: 'min',
    de: 'Min.',
    es: 'min',
  },
  moreInfo: {
    en: 'More information',
    fr: 'En savoir plus',
    de: 'Mehr erfahren',
    es: 'Más información',
  },
  trafficTitle: {
    en: 'Subway service',
    fr: 'Trafic du métro',
    de: 'U-Bahn-Betrieb',
    es: 'Servicio del metro',
  },
  periodFromTo: {
    en: '{start} → {end}',
    fr: '{start} → {end}',
    de: '{start} → {end}',
    es: '{start} → {end}',
  },
  periodFrom: {
    en: 'from {start}',
    fr: 'depuis {start}',
    de: 'seit {start}',
    es: 'desde {start}',
  },
  noMessage: {
    en: 'No alert for these lines.',
    fr: 'Aucune alerte pour ces lignes.',
    de: 'Keine Meldung für diese Linien.',
    es: 'Ninguna alerta para estas líneas.',
  },
  widgetNoStation: {
    en: 'No station is followed: add one on the Configuration screen of the integration, or type one in the widget settings.',
    fr: 'Aucune station n’est suivie : ajoutez-en une dans l’écran Configuration de l’intégration, ou saisissez-en une dans les réglages du widget.',
    de: 'Keine Station wird verfolgt: Füge eine im Konfigurationsbildschirm der Integration hinzu oder gib eine in den Widget-Einstellungen ein.',
    es: 'No se sigue ninguna estación: añade una en la pantalla Configuración de la integración, o escribe una en los ajustes del widget.',
  },

  // configuration and status
  statusUnreachable: {
    en: 'The open data of the MTA do not answer ({detail}). Next try in {minutes} min.',
    fr: 'L’open data de la MTA ne répond pas ({detail}). Nouvel essai dans {minutes} min.',
    de: 'Die Open Data der MTA antworten nicht ({detail}). Neuer Versuch in {minutes} Min.',
    es: 'Los datos abiertos de la MTA no responden ({detail}). Nuevo intento dentro de {minutes} min.',
  },
  statusConnected: {
    en: 'Connected to the MTA: {stations} station(s), {lines} line(s), real time read every {interval} s.',
    fr: 'Connecté à la MTA : {stations} station(s), {lines} ligne(s), temps réel lu toutes les {interval} s.',
    de: 'Mit der MTA verbunden: {stations} Station(en), {lines} Linie(n), Echtzeit alle {interval} s gelesen.',
    es: 'Conectado a la MTA: {stations} estación(es), {lines} línea(s), tiempo real leído cada {interval} s.',
  },
  statusNotFound: {
    en: 'Unknown or ambiguous: {names}.',
    fr: 'Inconnu ou ambigu : {names}.',
    de: 'Unbekannt oder mehrdeutig: {names}.',
    es: 'Desconocido o ambiguo: {names}.',
  },
  statusNothing: {
    en: 'Connected to the MTA. Add a station or a line on the Configuration screen.',
    fr: 'Connecté à la MTA. Ajoutez une station ou une ligne dans l’écran Configuration.',
    de: 'Mit der MTA verbunden. Füge im Konfigurationsbildschirm eine Station oder Linie hinzu.',
    es: 'Conectado a la MTA. Añade una estación o una línea en la pantalla Configuración.',
  },
  testNetworkOk: {
    en: 'MTA open data reached: {stations} stations',
    fr: 'Open data MTA joint : {stations} stations',
    de: 'MTA Open Data erreicht: {stations} Stationen',
    es: 'Datos abiertos de la MTA alcanzados: {stations} estaciones',
  },
  testStation: {
    en: '{station}: {count} train(s), next {next}',
    fr: '{station} : {count} train(s), prochain {next}',
    de: '{station}: {count} Zug/Züge, nächster {next}',
    es: '{station}: {count} tren(es), próximo {next}',
  },
  testStationError: {
    en: '{station}: {error}',
    fr: '{station} : {error}',
    de: '{station}: {error}',
    es: '{station}: {error}',
  },
  testLine: {
    en: '{line}: {state}',
    fr: '{line} : {state}',
    de: '{line}: {state}',
    es: '{line}: {state}',
  },
  testTrafficError: {
    en: 'Service status: {error}',
    fr: 'État du service : {error}',
    de: 'Betriebslage: {error}',
    es: 'Estado del servicio: {error}',
  },
  unknownEntry: {
    en: 'unknown or ambiguous: {name}',
    fr: 'inconnu ou ambigu : {name}',
    de: 'unbekannt oder mehrdeutig: {name}',
    es: 'desconocido o ambiguo: {name}',
  },
  errorUnreachable: {
    en: 'the open data of the MTA do not answer',
    fr: 'l’open data de la MTA ne répond pas',
    de: 'die Open Data der MTA antworten nicht',
    es: 'los datos abiertos de la MTA no responden',
  },
  errorBusy: {
    en: 'the open data server of the MTA is busy, try again in a moment',
    fr: 'le serveur open data de la MTA est occupé, réessayez dans un instant',
    de: 'der Open-Data-Server der MTA ist ausgelastet, versuche es gleich noch einmal',
    es: 'el servidor de datos abiertos de la MTA está ocupado, inténtalo de nuevo en un momento',
  },
  searchTooShort: {
    en: 'Type at least two letters of the station name.',
    fr: 'Saisissez au moins deux lettres du nom de la station.',
    de: 'Gib mindestens zwei Buchstaben des Stationsnamens ein.',
    es: 'Escribe al menos dos letras del nombre de la estación.',
  },
  searchNone: {
    en: 'No station matches "{query}".',
    fr: 'Aucune station ne correspond à « {query} ».',
    de: 'Keine Station passt zu „{query}“.',
    es: 'Ninguna estación coincide con «{query}».',
  },
  searchFound: {
    en: 'Type the name as written (its stop ids in brackets, its lines after the arrow):\n{list}',
    fr: 'Saisissez le nom tel qu’écrit (ses codes d’arrêt entre crochets, ses lignes après la flèche) :\n{list}',
    de: 'Gib den Namen so ein, wie er geschrieben ist (Haltestellen-IDs in Klammern, Linien nach dem Pfeil):\n{list}',
    es: 'Escribe el nombre tal como aparece (sus códigos de parada entre corchetes, sus líneas tras la flecha):\n{list}',
  },

  // stations added with the configuration buttons
  stationAdded: {
    en: 'Station added: {name}. {count} station(s) followed. Its device is offered in the Discover tab.',
    fr: 'Station ajoutée : {name}. {count} station(s) suivie(s). Son appareil est proposé dans l’onglet Découvrir.',
    de: 'Station hinzugefügt: {name}. {count} Station(en) verfolgt. Ihr Gerät wird im Tab Entdecken angeboten.',
    es: 'Estación añadida: {name}. {count} estación(es) seguida(s). Su dispositivo se ofrece en la pestaña Descubrir.',
  },
  stationAlreadyFollowed: {
    en: '{name} is already followed.',
    fr: '{name} est déjà suivie.',
    de: '{name} wird bereits verfolgt.',
    es: '{name} ya se sigue.',
  },
  stationsFull: {
    en: 'Already {max} stations added: remove one first.',
    fr: 'Déjà {max} stations ajoutées : retirez-en une d’abord.',
    de: 'Bereits {max} Stationen hinzugefügt: entferne zuerst eine.',
    es: 'Ya hay {max} estaciones añadidas: quita una primero.',
  },
  stationRemoved: {
    en: 'Station removed: {name}. Delete its device in Gladys if you no longer want it.',
    fr: 'Station retirée : {name}. Supprimez son appareil dans Gladys si vous n’en voulez plus.',
    de: 'Station entfernt: {name}. Lösche ihr Gerät in Gladys, wenn du es nicht mehr brauchst.',
    es: 'Estación quitada: {name}. Borra su dispositivo en Gladys si ya no lo quieres.',
  },
  stationRemoveUnknown: {
    en: 'No added station matches "{query}": type its number given by "List the stations".',
    fr: 'Aucune station ajoutée ne correspond à « {query} » : saisissez son numéro donné par « Lister les stations ».',
    de: 'Keine hinzugefügte Station passt zu „{query}“: gib ihre Nummer aus „Stationen auflisten“ ein.',
    es: 'Ninguna estación añadida coincide con «{query}»: escribe su número dado por «Listar las estaciones».',
  },
  stationRemoveAmbiguous: {
    en: 'Several added stations match "{query}": type the number given by "List the stations".',
    fr: 'Plusieurs stations ajoutées correspondent à « {query} » : saisissez le numéro donné par « Lister les stations ».',
    de: 'Mehrere hinzugefügte Stationen passen zu „{query}“: gib die Nummer aus „Stationen auflisten“ ein.',
    es: 'Varias estaciones añadidas coinciden con «{query}»: escribe el número dado por «Listar las estaciones».',
  },
  stationInForm: {
    en: '{name} is station {slot} of the form: empty its field, then save the configuration.',
    fr: '{name} est la station {slot} du formulaire : videz son champ, puis enregistrez la configuration.',
    de: '{name} ist Station {slot} des Formulars: leere ihr Feld und speichere dann die Konfiguration.',
    es: '{name} es la estación {slot} del formulario: vacía su campo y guarda la configuración.',
  },
  stationsNone: {
    en: 'No station followed yet: fill in a station of the form or press "Add a station".',
    fr: 'Aucune station suivie pour l’instant : remplissez une station du formulaire ou appuyez sur « Ajouter une station ».',
    de: 'Noch keine Station verfolgt: fülle eine Station im Formular aus oder drücke „Station hinzufügen“.',
    es: 'Aún no se sigue ninguna estación: rellena una estación del formulario o pulsa «Añadir una estación».',
  },
  stationsList: {
    en: '{count} station(s) followed:\n{list}',
    fr: '{count} station(s) suivie(s) :\n{list}',
    de: '{count} Station(en) verfolgt:\n{list}',
    es: '{count} estación(es) seguida(s):\n{list}',
  },
  stationFromForm: {
    en: 'form, station {slot}',
    fr: 'formulaire, station {slot}',
    de: 'Formular, Station {slot}',
    es: 'formulario, estación {slot}',
  },
  stationUnknownMark: {
    en: 'unknown or ambiguous',
    fr: 'inconnue ou ambiguë',
    de: 'unbekannt oder mehrdeutig',
    es: 'desconocida o ambigua',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the Logs tab ({count} line(s) starting with "MTA diagnostic").',
    fr: 'Diagnostic écrit dans l’onglet Journaux ({count} ligne(s) commençant par « MTA diagnostic »).',
    de: 'Diagnose in den Tab Protokolle geschrieben ({count} Zeile(n), beginnend mit „MTA diagnostic“).',
    es: 'Diagnóstico escrito en la pestaña Registros ({count} línea(s) que empiezan por «MTA diagnostic»).',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('inMinutes', 'fr', { n: 3 }); // -> 'dans 3 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The label of a line state.
 * @param {string} state - A state name (traffic.js).
 * @param {string} language - The language.
 * @returns {string} The label.
 */
const lineStateText = (state, language) =>
  t(TEXTS[`state_${state}`] ? `state_${state}` : 'state_unknown', language);

/**
 * @description How a line reads in a sentence or a list: "A train", "Ligne
 * A", "42 St Shuttle", "Staten Island Railway".
 * @param {{ name: string, longName: string, kind: string }} line - The line.
 * @param {string} language - The language.
 * @returns {string} The label.
 */
function lineLabel(line, language) {
  return line.kind === KINDS.SUBWAY
    ? t('subwayLineLabel', language, { line: line.name })
    : line.longName;
}

/**
 * @description The name of the device of a line: "MTA A train".
 * @param {object} line - The line.
 * @param {string} language - The language.
 * @returns {string} The name.
 */
const lineDeviceName = (line, language) => `${BRAND} ${lineLabel(line, language)}`;

/**
 * @description When a departure comes, in a sentence: "in 3 min", "at 10:32".
 * @param {object} passage - The departure.
 * @param {object} options - `{ language, now }`.
 * @returns {string} The words.
 */
function passageWhen(passage, { language, now }) {
  const minutes = minutesLeft(passage, now);
  if (minutes >= 60) {
    return t('atTime', language, { time: formatTime(passage.at) });
  }
  return minutes === 0
    ? t('approaching', language).toLowerCase()
    : t('inMinutes', language, { n: minutes });
}

/**
 * @description The short time of a departure, as on the countdown clocks:
 * "3 min", "10:32", "Arriving".
 * @param {object} passage - The departure.
 * @param {object} options - `{ language, now }`.
 * @returns {string} The time.
 */
function passageShort(passage, { language, now }) {
  const minutes = minutesLeft(passage, now);
  if (minutes >= 60) {
    return formatTime(passage.at);
  }
  return minutes === 0 ? t('approaching', language) : t('minutesValue', language, { n: minutes });
}

/**
 * @description One line for a departure: "A → Far Rockaway-Mott Av · 3 min".
 * @param {object|null} passage - The departure, null when none.
 * @param {object} options - `{ language, now }`.
 * @returns {string} The text.
 */
function passageText(passage, options) {
  if (!passage) {
    return t('noPassage', options.language);
  }
  const head = passage.destination ? `${passage.line} → ${passage.destination}` : passage.line;
  const mark = passage.assigned ? '' : ` ${t('scheduledMark', options.language)}`;
  return `${head} · ${passageShort(passage, options)}${mark}`;
}

export {
  LANGUAGES,
  BRAND,
  TEXTS,
  isLanguage,
  t,
  all,
  lineStateText,
  lineLabel,
  lineDeviceName,
  passageWhen,
  passageShort,
  passageText,
};

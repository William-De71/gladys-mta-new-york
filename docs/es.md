# MTA New York

## Presentación

Esta integración trae el **metro de Nueva York** de la MTA, y el Staten Island Railway, a Gladys. Da los **próximos trenes en tiempo real** en las estaciones que elijas (tres en el formulario, hasta 10 más con un botón), filtrados por línea y dirección, como los relojes de cuenta atrás de los andenes. También sigue el **estado del servicio** de hasta seis líneas (servicio normal, aviso, obras programadas, servicio alterado, servicio suspendido), con las alertas de la MTA. Cada estación y cada línea se convierte en un dispositivo para mostrar en un panel y usar en escenas.

Los datos proceden de los **datos abiertos oficiales de la MTA**, sin cuenta ni clave: los flujos en tiempo real del metro (GTFS-RT), sus alertas de servicio y la lista oficial de estaciones (data.ny.gov). Los trenes de las estaciones seguidas se leen con **una petición por grupo de líneas** (A C E, B D F M, L…), cada minuto por defecto (cada 10 minutos mientras ninguna estación anuncie un tren en la próxima media hora). Las alertas se leen cada 5 minutos, cuando se sigue una línea.

La MTA lista cada tren de más o menos la próxima hora con sus paradas hasta la terminal. Un trayecto al que aún no se ha asignado tren se muestra, como en los relojes, pero marcado «(previsto)»: podría no circular. La MTA no da **ningún retraso** ni marca **ningún tren suprimido**: la integración no los inventa.

Es una integración **en la nube**: contacta con `api-endpoint.mta.info` y `data.ny.gov`. Nada más sale de tu red. Los datos se obtienen de los servidores de la MTA y se muestran **tal cual**: pueden ser inexactos o incompletos, y lo que ves **puede no ser en tiempo real** (se lee cada 30 segundos a 10 minutos). Esta integración comunitaria no está afiliada a la MTA, ni respaldada ni autorizada por ella.

## Requisitos

- Gladys Assistant 5.3.0 o posterior.
- Nada más: los datos abiertos de la MTA no necesitan cuenta ni clave.

## Configuración

| Campo                   | Qué escribir                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Estación 1, 2, 3        | El nombre de la estación tal como aparece en ella («Times Sq-42 St», «Bedford Av») o uno de sus códigos de parada («R16»). |
| Línea                   | Solo esta línea: «A», «7», «Q», «S 42 St», «SIR». Vacío: todas las líneas de la estación.                                  |
| Dirección               | Un lado («Uptown», «Downtown», «Manhattan»: las palabras del andén) o palabras del destino. Vacío: ambos sentidos.         |
| Líneas seguidas         | Las líneas cuyo estado de servicio sigues, seis como máximo: «A, F, L, 7».                                                 |
| Lectura del tiempo real | Cada 30 segundos, minuto, 2 minutos o 5 minutos.                                                                           |
| Idioma de los textos    | Nombres de los dispositivos, resúmenes y salidas de las escenas. Los nombres de estaciones y las alertas quedan en inglés. |

Una estación reúne todas las líneas de su complejo: «Times Sq-42 St» da los 1 2 3, el 7, los N Q R W, el shuttle y los A C E de 42 St-Port Authority. Algunos nombres sirven a varias estaciones («86 St» está en seis líneas): indica también la línea, el nombre tal como lo escribe **Buscar una estación** («86 St (Q)») o un código de parada. **Buscar una estación** da las estaciones que contienen unas palabras, con su distrito, sus códigos de parada y sus líneas («86 St (Q) · Manhattan [Q04] → Q»). **Probar la conexión** vuelve a leer la lista de estaciones y lee al momento cada estación y cada línea.

Una dirección conserva un lado de la estación: «Uptown» / «Downtown», «N» / «S», o las palabras que la MTA escribe en el andén («Manhattan», «Queens», «Coney Island»). Otras palabras conservan los destinos que las contienen («Far Rockaway | Lefferts»).

Más estaciones que las tres del formulario (casa, trabajo, colegio…): **Añadir una estación** toma los mismos tres campos — estación, línea, dirección — y sigue hasta 10 más. **Listar las estaciones** muestra todas las estaciones seguidas, numeradas; **Quitar una estación** toma ese número (o el nombre). Las estaciones añadidas se guardan en la configuración de Gladys y siguen así sus copias de seguridad.

## Uso

### Dispositivos

En la pestaña **Descubrir**, crea los dispositivos que quieras:

- **MTA \<estación\>**: el próximo tren en texto («A → Far Rockaway-Mott Av · 3 min»), la espera del próximo tren y del siguiente (minutos);
- **MTA Línea A**, **MTA 42 St Shuttle**…: el estado del servicio en texto («Servicio alterado: Downtown F/M trains are running with delays…») y el número de alertas en curso.

### Estado del servicio

La MTA publica **alertas**: un texto, las líneas afectadas, sus periodos y un tipo. El estado de una línea viene de su alerta en curso más grave: **servicio suspendido**, **servicio alterado** (retrasos, servicio reducido, desvíos imprevistos), **obras programadas** (las alertas «Planned - …», cada fin de semana en muchas líneas), **aviso**; **servicio normal** sin alerta. Una alerta que empieza en los próximos tres días se muestra como próxima.

### Widgets del panel

![El widget Salidas MTA en Times Sq-42 St y el widget Estado del servicio MTA de cinco líneas (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-mta-new-york/main/docs/assets/widgets.es.png)

- **Salidas MTA**: los próximos trenes de una estación, compactos. Una fila por línea y destino, con sus próximos trenes seguidos («2 · 9 · 17 min»); en gris cuando el próximo tren solo está previsto. El ajuste **Trayectos mostrados** fija el número de filas. Elige una estación seguida, o escribe cualquier estación (y una línea) en los ajustes del widget. Con **Varias estaciones**, un widget muestra varios dispositivos de estación: los de una misma estación se reúnen bajo su nombre; para estaciones distintas, cada una empieza con una fila propia.
- **Estado del servicio MTA**: el estado de cada línea, luego las alertas en curso y las de los próximos tres días, con su horario. Toca una tarjeta para ver el texto completo. Las líneas seguidas, las escritas en los ajustes, o las líneas de tus estaciones si no sigues ninguna.

### Escenas

Disparadores, una vez por cambio (la primera lectura solo sirve de referencia):

- **MTA: tren en breve**: un tren en una estación seguida sale dentro de 2, 3, 5, 10, 15 o 20 minutos.
- **MTA: línea alterada**: una línea seguida sufre retrasos, cambios o una suspensión imprevistos. Las obras programadas no lo activan.
- **MTA: fin de la incidencia**: ya no hay problemas imprevistos en la línea.
- **MTA: nueva alerta**: la MTA publica una alerta sobre una línea seguida, en curso o próxima (filtro: aviso, obras programadas, retrasos y cambios, suspensión).

Cada uno da una frase lista, `{{triggerEvent.data.summary}}`, y sus valores (línea, destino, lado, hora, título, texto, tipo, horario…). Las acciones **MTA: próximos trenes** y **MTA: estado de una línea** devuelven el mismo tipo de valores, para ponerlos en un mensaje o probarlos en una condición.

Ejemplos:

- Cuando el L hacia 8 Av sale de Bedford Av dentro de 5 minutos → poner en verde la lámpara de la entrada.
- Cuando la línea A está alterada → enviar el resumen a tu teléfono antes de salir.
- Cada día laborable a las 7:30 → leer los próximos trenes de tu estación y que los anuncie el altavoz de la cocina.

### Transporte

Solo en la nube: los datos vienen de internet. Los flujos de las líneas de tus estaciones en cada lectura, las alertas cada 5 minutos, la lista de estaciones una vez por semana.

## Solución de problemas

- **«Desconocido o ambiguo»**: usa **Buscar una estación** y copia el nombre tal como aparece («86 St (Q)») o un código de parada; para una línea, su letra o número («A», «7X»), «S 42 St», «Franklin shuttle», «Rockaway shuttle» o «SIR» (una «S» sola es uno de los tres shuttles).
- **«(previsto)» tras un tren**: aún no hay tren asignado a ese trayecto; podría no circular.
- **Ningún tren en la dirección escrita**: vacía la dirección para ver todos los trenes y copia las palabras del lado o del destino.
- **Ningún tren en absoluto**: algunas líneas no circulan a todas horas (el B los fines de semana, el Z fuera de las horas punta); el dispositivo se lee entonces cada 10 minutos.
- **«Los datos abiertos de la MTA no responden»**: la integración lo vuelve a intentar en cada lectura; un flujo caído un momento da su última lectura mientras tanto.
- **Para avisar de un problema**: pulsa **Diagnóstico** y copia las líneas que empiezan por «MTA diagnostic» de la pestaña Registros en un issue de GitHub o una respuesta en el foro, con las versiones de Gladys y de la integración.

# MTA New York

## Présentation

Cette intégration amène le **métro de New York** de la MTA, et le Staten Island Railway, dans Gladys. Elle donne les **prochains trains, en temps réel**, aux stations de votre choix (trois dans le formulaire, jusqu’à 10 de plus avec un bouton), filtrés par ligne et par direction, comme les afficheurs des quais. Elle suit aussi l’**état du service** de six lignes au plus (service normal, information, travaux programmés, service perturbé, service suspendu), avec les alertes de la MTA. Chaque station et chaque ligne devient un appareil à afficher sur un tableau de bord et à utiliser dans les scènes.

Les données viennent de l’**open data officiel de la MTA**, sans compte ni clé : les flux temps réel du métro (GTFS-RT), ses alertes de service et la liste officielle des stations (data.ny.gov). Les trains des stations suivies sont lus en **une requête par groupe de lignes** (A C E, B D F M, L…), toutes les minutes par défaut (toutes les 10 minutes tant qu’aucune station n’annonce de train dans la demi-heure). Les alertes sont lues toutes les 5 minutes, quand une ligne est suivie.

La MTA liste chaque train de l’heure à venir environ, avec ses arrêts jusqu’au terminus. Un trajet sur lequel aucun train n’est encore affecté est montré, comme sur les afficheurs, mais marqué « (prévu) » : il pourrait ne pas circuler. La MTA ne donne **aucun retard** et ne marque **aucun train supprimé** : l’intégration ne les invente pas.

C’est une intégration **cloud** : elle contacte `api-endpoint.mta.info` et `data.ny.gov`. Rien d’autre ne quitte votre réseau. Les données sont obtenues des serveurs de la MTA et montrées **telles quelles** : elles peuvent être inexactes ou incomplètes, et ce que vous voyez **peut ne pas être en temps réel** (lu toutes les 30 secondes à 10 minutes). Cette intégration communautaire n’est ni affiliée à la MTA, ni approuvée ou agréée par elle.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Rien d’autre : l’open data de la MTA ne demande ni compte ni clé.

## Configuration

| Champ                 | Quoi saisir                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Station 1, 2, 3       | Le nom de la station tel qu’écrit dans la station (« Times Sq-42 St », « Bedford Av ») ou un de ses codes d’arrêt (« R16 »). |
| Ligne                 | Seulement cette ligne : « A », « 7 », « Q », « S 42 St », « SIR ». Vide : toutes les lignes de la station.                   |
| Direction             | Un côté (« Uptown », « Downtown », « Manhattan » : les mots du quai) ou des mots de la destination. Vide : les deux sens.    |
| Lignes suivies        | Les lignes dont vous suivez l’état du service, six au plus : « A, F, L, 7 ».                                                 |
| Lecture du temps réel | Toutes les 30 secondes, minutes, 2 minutes ou 5 minutes.                                                                     |
| Langue des textes     | Noms des appareils, résumés et sorties des scènes. Les noms de stations et les alertes restent en anglais.                   |

Une station réunit toutes les lignes de son complexe : « Times Sq-42 St » donne les 1 2 3, le 7, les N Q R W, la navette et les A C E de 42 St-Port Authority. Certains noms servent à plusieurs stations (« 86 St » est sur six lignes) : précisez la ligne, ou le nom tel que l’écrit **Chercher une station** (« 86 St (Q) »), ou un code d’arrêt. **Chercher une station** donne les stations qui contiennent quelques mots, avec leur arrondissement, leurs codes d’arrêt et leurs lignes (« 86 St (Q) · Manhattan [Q04] → Q »). **Tester la connexion** relit la liste des stations, puis lit aussitôt chaque station et chaque ligne.

Une direction garde un côté de la station : « Uptown » / « Downtown », « N » / « S », ou les mots que la MTA écrit sur le quai (« Manhattan », « Queens », « Coney Island »). D’autres mots gardent les destinations qui les contiennent (« Far Rockaway | Lefferts »).

Plus de stations que les trois du formulaire (domicile, travail, école…) : **Ajouter une station** prend les trois mêmes champs — station, ligne, direction — et en suit jusqu’à 10 de plus. **Lister les stations** montre toutes les stations suivies, numérotées ; **Retirer une station** prend ce numéro (ou le nom). Les stations ajoutées sont gardées dans la configuration de Gladys et suivent donc ses sauvegardes.

## Utilisation

### Appareils

Dans l’onglet **Découvrir**, créez les appareils voulus :

- **MTA \<station\>** : le prochain train en texte (« A → Far Rockaway-Mott Av · 3 min »), l’attente du prochain train et du suivant (minutes) ;
- **MTA Ligne A**, **MTA 42 St Shuttle**… : l’état du service en texte (« Service perturbé : Downtown F/M trains are running with delays… ») et le nombre d’alertes en cours.

### État du service

La MTA publie des **alertes** : un texte, les lignes concernées, leurs périodes et un type. L’état d’une ligne vient de son alerte en cours la plus lourde : **service suspendu**, **service perturbé** (retards, service réduit, déviations imprévues), **travaux programmés** (les alertes « Planned - … », chaque week-end sur beaucoup de lignes), **information** ; **service normal** sans alerte. Une alerte qui commence dans les trois jours est montrée « à venir ».

### Widgets du tableau de bord

![Le widget Départs MTA à Times Sq-42 St et le widget État du service MTA de cinq lignes (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-mta-new-york/main/docs/assets/widgets.fr.png)

- **Départs MTA** : les prochains trains d’une station, en compact. Une rangée par ligne et destination, avec ses prochains trains à la suite (« 2 · 9 · 17 min ») ; en gris quand le prochain train n’est que prévu. Le réglage **Trajets affichés** fixe le nombre de rangées. Choisissez une station suivie, ou saisissez n’importe quelle station (et une ligne) dans les réglages du widget. Avec **Plusieurs stations**, un widget montre plusieurs appareils stations : ceux d’une même station sont réunis sous son nom ; pour des stations différentes, chacune s’ouvre sur une rangée à son nom.
- **État du service MTA** : l’état de chaque ligne, puis les alertes en cours et celles des trois jours à venir, avec leurs horaires. Touchez une carte pour le texte complet. Les lignes suivies, celles saisies dans les réglages, ou les lignes de vos stations si vous n’en suivez aucune.

### Scènes

Déclencheurs, une fois par changement (la première lecture sert seulement de référence) :

- **MTA : train bientôt** : un train à une station suivie part dans 2, 3, 5, 10, 15 ou 20 minutes.
- **MTA : ligne perturbée** : une ligne suivie subit des retards, des changements ou une suspension imprévus. Les travaux programmés ne le déclenchent pas.
- **MTA : fin de perturbation** : plus de souci imprévu sur la ligne.
- **MTA : nouvelle alerte** : la MTA publie une alerte sur une ligne suivie, en cours ou à venir (filtre : information, travaux programmés, retards et changements, suspension).

Chacun donne une phrase toute prête, `{{triggerEvent.data.summary}}`, et ses valeurs (ligne, destination, côté, heure, titre, texte, type, horaires…). Les actions **MTA : prochains trains** et **MTA : état d’une ligne** renvoient le même genre de valeurs, à mettre dans un message ou à tester dans une condition.

Exemples :

- Quand le L vers 8 Av part de Bedford Av dans 5 minutes → passer la lampe de l’entrée au vert.
- Quand la ligne A est perturbée → envoyer le résumé sur votre téléphone avant de partir.
- Chaque jour de semaine à 7 h 30 → lire les prochains trains de votre station et les faire annoncer par l’enceinte de la cuisine.

### Transport

Cloud uniquement : les données viennent d’internet. Les flux des lignes de vos stations à chaque lecture, les alertes toutes les 5 minutes, la liste des stations une fois par semaine.

## Dépannage

- **« Inconnu ou ambigu »** : utilisez **Chercher une station**, puis copiez le nom tel qu’écrit (« 86 St (Q) ») ou un code d’arrêt ; pour une ligne, sa lettre ou son chiffre (« A », « 7X »), « S 42 St », « Franklin shuttle », « Rockaway shuttle » ou « SIR » (un « S » seul désigne l’une des trois navettes).
- **« (prévu) » après un train** : aucun train n’est encore affecté à ce trajet ; il pourrait ne pas circuler.
- **Aucun train dans la direction saisie** : videz la direction pour voir tous les trains, puis copiez les mots du côté ou de la destination.
- **Aucun train du tout** : certaines lignes ne roulent pas à toute heure (le B le week-end, le Z hors heures de pointe) ; l’appareil est alors lu toutes les 10 minutes.
- **« L’open data de la MTA ne répond pas »** : l’intégration réessaie à chaque lecture ; un flux en panne un court moment donne sa dernière lecture en attendant.
- **Pour signaler un problème** : appuyez sur **Diagnostic**, puis copiez les lignes commençant par « MTA diagnostic » de l’onglet Journaux dans une issue GitHub ou une réponse sur le forum, avec les versions de Gladys et de l’intégration.

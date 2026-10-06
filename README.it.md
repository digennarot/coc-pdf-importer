# Call of Cthulhu PDF Importer

[English](README.md) · **Italiano**

## Novità

- **Mappe come scene**: nella finestra di importazione si può scegliere una
  cartella di mappe; ogni immagine diventa una scena delle dimensioni
  dell'immagine, in cartelle di scene che rispecchiano quella scelta (i livelli
  che indicano solo il formato, come `01-MAPS` o `WEBP-lower file size`,
  vengono saltati, così come token e handout). Schermate del titolo e landing
  page vengono importate senza griglia. Se la cartella contiene il manuale del
  pacchetto di mappe (il pacchetto Lovemaps di Horror on the Orient Express
  riporta per ogni mappa `8400 x 8400 … M 140 px`), la dimensione delle celle di
  ogni mappa viene letta da lì e la griglia è in metri; altrimenti viene dedotta
  dalle dimensioni dell'immagine. Gli handout inglesi di ogni capitolo
  (`03-HANDOUTS-ADJ/ENG-WEBP`) diventano un diario con il nome del capitolo,
  una pagina immagine per handout, e ogni token delle creature
  (`02-CREATURES TOKENS`) diventa ritratto e immagine del token degli attori
  importati che nomina (importa prima i volumi).
- **Incantesimi e tomi di Horror on the Orient Express**: gli incantesimi
  (`DRAIN THE FEZ Cost : … Casting time : …`) e i tomi dei Miti stampati nel
  testo dei volumi II–IV vengono importati come oggetti insieme agli attori.
- **Horror on the Orient Express** (edizione inglese, cofanetto Chaosium):
  vengono importati i PNG, le creature e gli investigatori pregenerati
  dei volumi II–V. Il volume I non contiene schede. L'impaginazione di questi
  volumi ha richiesto una gestione dedicata: nomi in MAIUSCOLO con soprannomi
  e alias (`"THE CRAWLING ONE (AKA …)"`), cognomi in maiuscoletto (`LaVERGE`),
  intestazioni dei pregenerati con la descrizione prima del nome, tabelle a
  colonne per i gruppi (Sarnathiani, Magri Notturni, Shantak), valori aperti
  (`EDU 99+`) e testo descrittivo di armi e incantesimi tenuto fuori dai nomi
  degli attacchi.
- **Parole spezzate a fine riga** (`de- flects`, `Sur- geon`) vengono
  ricomposte in tutti i campi importati: nomi, occupazioni, note degli
  attacchi, armatura, perdita di Sanità, incantesimi, equipaggiamento e
  background.
- Il modulo ora vive nel [fork di digennarot](https://github.com/digennarot/coc-pdf-importer),
  con CI a ogni push e una release GitHub automatica a ogni push su `main`
  (vedi [Release](#release)).

## Panoramica

Importa nel [sistema CoC7](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT)
i contenuti dei documenti impaginati secondo lo standard Chaosium. Richiede
Foundry VTT v13 o successivo.

Testato sui seguenti documenti:

- Masks of Nyarlathotep (volume della campagna e Keeper Reference Booklet)
- Escape from Innsmouth
- The Two-Headed Serpent (volume della campagna e Keeper Reference Booklet)
- Down Darker Trails (manuale dell'ambientazione e Keeper Reference Booklet)
- Pulp Cthulhu
- CoC7 Quick Start
- CoC7 Keeper Rulebook (parte 3: scenari)
- Gateways to Terror
- Doors to Darkness
- Dead Light and Other Dark Turns
- Does Love Forgive
- Mansions of Madness
- The Lightless Beacon
- Horror on the Orient Express (edizione inglese, volumi II–V)

Sono supportate solo le edizioni inglesi: il parser legge le etichette
inglesi delle caratteristiche (STR, CON, SIZ…), quindi i volumi tradotti, come
l'edizione italiana "Orrore sull'Orient Express", non vengono ancora importati.

Un'importazione legge il documento una sola volta e crea sia gli **attori** sia,
quando il documento li contiene, gli **oggetti** (talenti e archetipi di Pulp
Cthulhu, incantesimi / tomi / artefatti delle appendici Chaosium, e occupazioni,
abilità, armi e incantesimi del Vecchio West di Down Darker Trails). Tutto viene
messo in cartelle con il nome del file di origine; una nuova importazione
aggiorna le voci con lo stesso nome invece di duplicarle.

### Attori

Importa gli attori dalle varie forme della scheda standard: blocchi "Nome, età
N, descrizione", schede degli investigatori pregenerati, tabelle "media / tiro"
dei mostri, tabelle a più colonne per i gruppi di PNG e le impaginazioni a due
colonne dei volumi più recenti (Innsmouth). Da ogni blocco si ricavano
caratteristiche, valori derivati, combattimento, abilità, lingue, incantesimi,
perdita di Sanità, armatura e, per i pregenerati, le sezioni di background e
l'equipaggiamento. I nomi stampati in MAIUSCOLO vengono riportati in maiuscole
e minuscole, e una scheda non assorbe mai testo oltre le proprie pagine, così la
prosa dello scenario resta fuori.

Quando il sistema CoC7 ha un oggetto corrispondente nel compendio, l'importatore
lo usa, così il contenuto importato mantiene il CoCID, l'icona e le proprietà
originali:

- **Armi**: vengono abbinate al compendio delle armi del sistema (preferendo il
  contenuto core al fallback della wiki), con gestione di taglie e alias per i
  nomi comuni di armi da mischia e da fuoco, e i profili corretti per le armi da
  lancio. Il danno stampato nel libro ha sempre la precedenza, mentre impalamento,
  gittata e abilità vengono dall'oggetto abbinato.
- **Abilità**: vengono create con la specializzazione già compilata, così le
  abilità specializzate e quelle "(Any)" non chiedono un nome all'importazione.

L'importatore tralascia buona parte della prosa descrittiva (meccaniche delle
manovre, descrizioni delle creature e simili): durante la partita consulta i
documenti originali.

### Varianti Pulp

Alcuni volumi (Masks of Nyarlathotep, Escape from Innsmouth, The Two-Headed
Serpent) stampano dentro la scheda le sezioni opzionali **Pulp Combat** e **Pulp
Talents**. Un attore di questo tipo viene importato due volte: la versione
standard nella cartella del documento e una variante Pulp in una cartella
attori parallela `<nome file> (Pulp)`, creata solo se il documento ne contiene
almeno una. La variante usa i profili di combattimento pulp al posto di quelli
standard (e, se stampati, i PF e la Fortuna pulp) e porta i suoi talenti come
oggetti `talent`. Se nel mondo esiste già un talento con lo stesso nome viene
usato quello (icona, categoria e CoCID inclusi) ma con la descrizione del
libro; altrimenti viene creato un talento con quella descrizione.

### Talenti e archetipi Pulp

I 40 talenti per giocatori e i 22 archetipi del manuale di Pulp Cthulhu vengono
importati come oggetti CoC7 `talent` e `archetype`. Gli archetipi riportano le
caratteristiche principali, i punti bonus, le occupazioni e i tratti suggeriti,
il numero di talenti e la lista delle abilità (ognuna collegata al proprio
CoCID).

Gli oggetti vanno in una cartella **Oggetti** `<nome file>` con una
sottocartella per tipo (`Talents`, `Archetypes`, `Spells`, `Tomes`,
`Artefacts`, …); gli attori stanno al primo livello di una cartella **Attori**
con lo stesso nome. (Foundry tiene separati gli alberi delle cartelle di attori
e oggetti, quindi sono due cartelle parallele con lo stesso nome.)

### Down Darker Trails

I capitoli di riferimento del manuale sul Vecchio West vengono importati come
oggetti: le 26 occupazioni, le abilità modificate e nuove, le tabelle delle armi
da fuoco e da mischia e gli incantesimi sciamanici e di magia popolare.

### Incantesimi, tomi e artefatti

I volumi con le appendici Chaosium (per esempio le appendici B–D di Masks of
Nyarlathotep), o che stampano voci simili nei capitoli (Escape from Innsmouth),
producono oggetti del mondo:

- **Incantesimi**: nome, tempo di lancio, costi (PM / SAN / POT / PF) e testo
  descrittivo. I passaggi automatici `costList` non vengono generati.
- **Tomi**: dati bibliografici, Sanità e Miti di Cthulhu, tempo di studio;
  collegamenti, pertinenza ed elenchi di incantesimi finiscono nelle note del
  Custode (senza collegamento agli oggetti incantesimo).
- **Artefatti**: testo completo nelle note del Custode; `weapon` di Foundry se
  il testo descrive un uso in combattimento, altrimenti `item` generico.
  Vengono annidati in cartelle per regione quando l'appendice stampa le
  intestazioni dei capitoli (`Artefacts/Peru/…`).
- Anche i **tomi** vengono annidati in cartelle per regione quando è presente
  l'intestazione (`Tomes/Egypt/…`).

### Mappe

Il secondo campo della finestra di importazione accetta una cartella. Ogni
immagine diventa una scena (fuori dalla barra di navigazione, senza margini):
l'immagine viene caricata in `worlds/<mondo>/coc-pdf-importer/…` e la scena va
in cartelle con i nomi delle sottocartelle (Foundry ne annida al massimo
quattro). I file che iniziano con `TOK-` e le cartelle di token o handout
vengono saltati. La griglia è, nell'ordine: la dimensione delle celle che il
manuale del pacchetto indica per quella mappa, quella delle mappe documentate
della stessa cartella e delle stesse dimensioni, o la più grande tra 210 / 140 /
70 / 100 px che divide esattamente l'immagine; un'immagine che nessuna divide,
e le schermate del titolo e le landing page, restano senza griglia. Una nuova
importazione sostituisce le scene con lo stesso nome nella loro cartella.

## Utilizzo

1. Installa il modulo da

   ```console
   https://github.com/digennarot/coc-pdf-importer/releases/latest/download/module.json
   ```

   (Setup → Add-on Modules → Install Module → incolla il link in **Manifest
   URL**). Serve anche il sistema CoC7, installabile allo stesso modo da
   `https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/releases/latest/download/system.json`.

2. Nel mondo vai su Impostazioni → Impostazioni di gioco → Call of Cthulhu PDF
   Importer → pulsante Import
3. Carica il documento o i documenti e attendi la fine dell'importazione
4. Apri la barra laterale Attori o Oggetti. Le voci si trovano in cartelle con
   il nome del file di origine (gli oggetti in sottocartelle per tipo come
   `Talents` / `Spells` / `Tomes` / `Artefacts`).

## Sviluppo

La documentazione per gli sviluppatori (prerequisiti, funzionamento interno,
script npm, test e build) è in inglese nel [README principale](README.md#development).
In breve:

- copia `fvtt.config.example.js` in `fvtt.config.js` e imposta `userDataPath`
  sulla cartella dati di Foundry (su Windows di solito
  `C:/Users/<utente>/AppData/Local/FoundryVTT`); `npm run build` e
  `npm run dev` installano il modulo direttamente in `Data/modules/`;
- `npm test` esegue i test unitari, `npm run test:integration` quelli sui PDF
  reali (i PDF sono protetti da copyright e non sono nel repository: vedi
  `fixtures/README.md`; quelli di Horror on the Orient Express vanno in
  `test/integration/Horror on the Orient Express/`).

### Release

Ogni push su `main` produce una release. Un push che non aggiorna già la
versione riceve in automatico la patch successiva: `[minor]` o `[major]`
nell'oggetto di un commit scelgono la minor o la major successiva, `[skip
release]` salta la release. I marcatori nel corpo del messaggio vengono
ignorati. Per scegliere la versione a mano, fai push di un tuo commit
`Release <versione>` (vedi `npm run release`). Il workflow crea il tag,
compila il modulo e pubblica la release GitHub con `module.zip` e
`module.json`. La pubblicazione nell'elenco pacchetti di Foundry richiede il
segreto `FOUNDRY_RELEASE_TOKEN`; senza, quel passaggio viene saltato e la
release GitHub esce comunque.

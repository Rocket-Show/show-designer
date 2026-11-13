# The fixture library, AI profiles and devices

The online designer searches its fixture profiles in its database, filled from the Open Fixture Library (OFL). The
devices download a zip of the library instead and never see the database. This document plans one library for both,
which grows with fixture profiles the AI generates from a manual, keeps every version of them and ranks them by usage and
votes. Devices register themselves with each sync, which tells which versions of Rocket Show are still in use, and can be
logged in to an account of the online designer, so that the AI features work on a device as well.

Status: plan, 13 November 2026. Nothing of it is implemented. It touches four repositories: `Rocket-Show/show-designer`
(this one), `Rocket-Show/spark` (the API and the database of the online designer, the image of the Spark),
`Rocket-Show/rocketshow` (the backend and the web app of the devices) and `Rocket-Show/show-designer-ofl-import`.

## 1. Decisions

| Topic                  | Decision                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The library            | **One library**, the database of the online designer, for the online designer and the devices                     |
| The zip                | **`fixtures.zip` goes.** Devices take the profiles directly from the database, by a sync; no zip is built         |
| Registration           | **A device registers with each sync**: its version, its hardware, a few counts. Usage statistics, active versions |
| Unconfirmed profiles   | **Shown online and on the devices alike**, clearly marked, with a popover which explains what that means          |
| An account on a device | **A login in the settings of Rocket Show.** A device which is online and logged in has the AI features            |
| Devices and accounts   | **Remembered online** by a hardware identifier: account, name, last online, version, counts. No personal data     |
| AI profiles            | **The AI generates fixture profiles** from a manual (PDF), a link to one, or a manufacturer and a model           |
| Versions               | **Every profile is kept** as a version of its fixture, ranked by usage and stars                                  |
| Votes                  | **Users mark a version good or bad**                                                                              |

Questions which are still open are in section 14.

## 2. Today

- **The online library** is the table `fixture` (uuid `<manufacturer>/<fixture-key>`, name, manufacturer, main
  category, the OFL JSON in `object`) and `manufacturer` of `spark/show-designer-database/model.sql`.
  `spark/show-designer-api/fixtures.php` searches it, `fixture.php` returns one profile.
- **The OFL import** (`show-designer-ofl-import/index.js`, unchanged since 2019) writes an SQL file which starts with
  `DELETE FROM fixture; DELETE FROM manufacturer;`, then inserts all of OFL again. It would delete every generated
  profile, and it breaks on a name with a `'` (only the JSON is escaped).
- **The devices** download `https://www.rocketshow.net/designer/downloads/fixtures.zip` once a week and on "Update
  profiles" (`rocketshow/.../lighting/designer/DefaultFixtureService.java`), unzipped into `<manufacturer>/<fixture>.json`.
  The check runs at boot and holds it up until the download ends (`RocketShowApplication.java`). The image of the Spark
  downloads it while it is built (`spark/raspbian-spark.sh`).
- **A show plays from its project:** the designer copies every profile a project uses into `project.fixtureProfiles`,
  and the engine of Rocket Show reads them from there, not from the library. A project keeps working when the library
  changes.
- **Profiles from a file:** the designer already adds an OFL JSON file to a project ("Create fixture from profile file",
  `fixture-pool-create-from-file`).
- **The identity of a device:** a Spark has a serial in `/provision/device-information.conf`
  (`DefaultDeviceInformationService`). A community installation has no identifier.
- **The login of a device** is a local admin password and API keys. `GET /api/system/settings` returns all of
  `Settings`.
- **The AI looks** are online only (`configService.aiLooks`, `spark/show-designer-api/ai-looks.php`): the designer
  talks to the backend `restUrl` points to, which is the Java backend on a device, and that one has no AI.
- **Limits on the way:** nginx of the Spark ends a request after 60 seconds (the default `proxy_read_timeout`) and takes
  12 MB (`client_max_body_size`), Spring 10 MB (`application.yaml`). An AI request takes up to 4 minutes, a manual up to
  32 MB.

## 3. The picture

```
designer (browser) ──► backend of the device (Java) ──► API of the online designer (PHP, MySQL) ──► Claude
                        a copy of the library             fixtures and their versions, votes,
                        the token of the account          devices, AI requests
                        └──────────── one call: sync of the library + registration ──────────┘
```

The designer online talks to the API directly, as today. On a device, everything which needs the internet goes through
the backend of the device: the browser may be connected to the access point of the device without internet of its own,
and the token of the account stays on the device.

## 4. The database

One upgrade script in `spark/show-designer-database`, which moves the rows of today into the new tables.

| Table                 | Holds                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixture`             | One row per real fixture: manufacturer, fixture key, name, main category, its best version                                                                                                                                                                                                                              |
| `fixture_version`     | Every profile: uuid, the OFL JSON and its hash, the source (`ofl`, `ai`), how it was generated (PDF hash, URL, manufacturer and model, the DMX mode asked for), parent version, created by (user, device), AI request, good and bad votes, usage, stars, hidden, retired (gone from OFL), a change counter for the sync |
| `fixture_vote`        | One vote per account and version: good or bad, an optional comment, can be changed                                                                                                                                                                                                                                      |
| `fixture_usage`       | Which version an online project or a device uses, and when that was last seen                                                                                                                                                                                                                                           |
| `device`              | The hashed hardware identifier, what the device reports (section 7), first and last seen, the linked account, the hash of its token                                                                                                                                                                                     |
| `ai_request` (exists) | Two more columns: `feature` (`looks`, `fixture`) and `device_id`                                                                                                                                                                                                                                                        |

**The uuids of the profiles.** The current OFL version of a fixture keeps `<manufacturer>/<fixture-key>`, as today: the
projects and the files of the devices which use it keep working, and a new version of OFL updates it, as the import does
today. Every other version gets `<manufacturer>/<fixture-key>~<version id>`, also an OFL version which a newer one
replaced. OFL keys are made of lowercase letters, digits and dashes, so `~` never clashes with one. A new manufacturer (one
OFL doesn't know) gets a row in `manufacturer` the same way.

## 5. The OFL import

- **It updates instead of replacing:** a fixture new in OFL gets a fixture and a version, a fixture whose JSON changed
  gets a new version (compared by hash), a fixture gone from OFL is marked retired. It never deletes, and never touches a
  version which doesn't come from OFL.
- **It escapes everything** it writes, or uses prepared statements.
- **Where it lives** (open question 1): as a command line script in `spark/show-designer-api`, it uses the same code for
  the database as the API and can run on a schedule on the server. `show-designer-ofl-import` is then archived, with a
  pointer in its README. Otherwise the Node script is rewritten in place.

## 6. The sync of the library (instead of `fixtures.zip`)

**The API.** `POST library-sync.php`. The device sends its registration (section 7) and its cursor, the value of the
change counter it got last (0 the first time). The answer:

- `cursor`: the new one, and `more`, when there is another page.
- `manufacturers` changed since the cursor.
- `versions`: what changed since the cursor about any version (name, category, source, stars, votes, usage, best version
  of its fixture, hidden, retired). Votes and usage change often, so this part is small and frequent.
- `profiles`: the JSON of the versions new since the cursor only, and of a current OFL version which a new version of
  OFL updated. Any other profile never changes: a change is a new version.

Pages of a few hundred versions, gzipped. The first sync is about as large as the zip of today, the next ones a few KB.
A change counter, not a time, so that the clocks of the devices don't matter.

**The device** (`DefaultFixtureService`):

- Syncs in the background: once after boot, then daily while it is online, and on "Update profiles". Boot doesn't wait
  for it anymore.
- Keeps the files as today (`<manufacturer>/<fixture-key>.json`, `<manufacturer>/<fixture-key>~<id>.json` for the
  other versions) and a `library.json` with what the search needs (source, stars, votes, usage, hidden). `checkUuid`
  takes the `~`. The new library replaces the old one only once it is complete, as today. Offline, the last library
  stays.
- The first sync after the update starts at 0 and replaces the library from the zip.
- `SearchFixtureTemplate` gets source, status, stars, usage and the number of versions, which the designer shows
  (section 12).

**Online,** `fixtures.php` gives the same fields, one row per fixture with its best version, and all versions of a
fixture on request.

**The image of the Spark** fills its library with the same sync (from 0) instead of downloading the zip.

**The zip stays, frozen**, for devices which aren't updated yet, until the statistics (section 7) and the access log of
the zip show that none of them are left.

## 7. Registration and usage statistics

**The sync is the registration**, there is no call of its own. The device sends:

| What                                                                         | Why                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Hardware identifier (hashed)                                                 | Tells devices apart, links a device to its account |
| Edition (Spark, community); for a Spark its model, SKU and hardware revision | Which hardware is out there                        |
| Raspberry Pi model, architecture, operating system                           | Which platforms to keep supporting                 |
| Version and build number of Rocket Show, update branch (stable, test)        | Which versions are still in use                    |
| Language of the web app                                                      | Which translations matter                          |
| Number of compositions, sets, designer projects and fixtures in the projects | How a device is used                               |
| The uuids of the profiles its projects use                                   | The usage of the versions (section 11)             |
| The name of the device, only while it is linked to an account                | "My devices" of the account (section 8)            |
| The cursor of the library                                                    | Section 6                                          |

**Never sent, or not stored:** the IP address, the names and the content of files, compositions and projects, a
location.

**The hardware identifier:** the serial of a Spark, else the serial of the Raspberry Pi board
(`/sys/firmware/devicetree/base/serial-number`), else `/etc/machine-id`, else a random id which the device keeps in its
base path. It is sent as a SHA-256 with a fixed salt; a Spark can still be found by hashing its serial.

**The statistics**, for admins only (`stats.php`, later a page): active devices by version (last seen within 7, 30 and
90 days), editions and platforms, the AI requests and their cost per day, the most used fixtures.

## 8. The account on the device

**Online** (`spark/show-designer-api`):

- `device-link.php`: email and password in the body (like `login.php`), the hardware identifier and the name of the
  device. Answers with a token for this device only, stored as a hash, valid only with the same hardware identifier.
  The password is never stored on the device.
- `device-unlink.php`: from the device, or from "My devices" online.
- `getUserId()` also takes the token of a device (`Authorization: Device <token>` and the hardware identifier), so the
  AI and the votes work for a linked device without changes of their own.

**The online designer:** "My devices" in the menu of the user: name, version, last online, number of compositions, and
"Unlink".

**The device** (`rocketshow`):

- A new tab "Account" in the settings: log in (and a link to register on rocketshow.net), the account it is linked to,
  log out (which unlinks it online as well).
- `/api/account` (status, login, logout), for the admin only.
- The token is kept in a file of its own, not in `Settings` (which `GET /api/system/settings` returns) and not in a
  backup: a backup restored on another device mustn't arrive logged in.

## 9. The AI on the device

- **The backend of the device forwards** `/api/ai-looks` (status and request) and `/api/ai-fixtures` to the API of the
  online designer, with the token of the device, waiting up to 5 minutes. Without a link it answers that the device
  isn't linked.
- **nginx of the Spark:** `proxy_read_timeout 300s` and `client_max_body_size 33m` for these paths; the multipart limit of
  Spring takes a manual of 32 MB.
- **The designer:** a new input `aiAccount` (`designer`: its own login, as online; `host`: the host is logged in). With
  `host`, a refused request says "Link this device with your account in Settings → Account" instead of showing the
  login of the designer. Rocket Show sets `aiLooks` and the new `aiFixtures` once the device is linked.
- **The limits** of the AI count per account, online and on all of its devices together. `ai_request.device_id` tells
  where a request came from.

## 10. AI fixture profiles

**What the user gives:**

| Input                    | How                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| A manual (PDF)           | Handed to Claude as a document: up to 32 MB and 600 pages. Scanned manuals work as well, Claude also sees each page       |
| A link                   | The web fetch tool of Anthropic loads it. Anthropic fetches it, not the server: it never requests an address a user typed |
| A manufacturer and model | Web search finds the manual, web fetch reads it ($10 per 1,000 searches on top of the tokens)                             |
| The DMX mode (optional)  | Fewer modes, fewer mistakes, less cost                                                                                    |

**How it goes** (`ai-fixture.php`, with what `ai-looks.php` has: the settings, the limits, `ai_request`):

1. **Look in the library first**, by manufacturer and model and by the hash of the PDF. Whoever asks second gets the
   profile at once, for free.
2. **Ask Claude** (the model of the looks, `claude-opus-5-5`, with the fallbacks on). It always works from a manual,
   never from memory: when it finds none, it says so instead of guessing.
3. **The answer is OFL JSON**, the format the designer, Rocket Show and OFL read. The designer uses all of the
   capabilities of OFL (`models/fixture-capability.ts`). Not as a structured output: the schema of OFL is much larger
   than the one of the looks, which Anthropic already refused as too large a grammar (`ai/ai.php`). Along with it come
   the page of the manual each channel comes from, and what the AI isn't sure about.
4. **Checked by code**, never fixed silently: the JSON schema of OFL (a fixed version), the ranges of each channel cover
   0–255 without gaps or overlaps, a mode lists only channels which exist, the number of channels matches the name of a
   mode ("8-channel"), fine channels, wheel slots, the pixel keys of a matrix. The errors go back to the AI, for up to two
   rounds of repair.
5. **Stored as a new, unconfirmed version** and added to the project.

**The review in the designer:** the channels of each mode with the page of the manual they come from, and what the AI
wasn't sure about. Maintenance (reset, lamp on and off) and strobe stand out: the fixture pool has buttons for reset and
lamp, and a wrong range could fire during a show.

**Improve:** from a version and the comments of its bad votes, or an instruction ("channel 6 is the strobe"), the AI
makes a new version with the old one as its parent. That is how the versions of a fixture grow.

**The cost:** $4 per million tokens in, $20 out. A manual of 40 pages and the answer come to roughly $0.30–1 per new
profile (an estimate, to measure on real manuals). The profiles count against a daily limit of their own
(`ai_request.feature`).

**The designer:** "Create profile with AI" in the fixture pool next to "Create fixture from profile file", the dialog
with the inputs, the review, a popover with the versions of a fixture. A project changes to another version with the
existing "exchange profile".

## 11. Versions, votes and ranking

- **Votes:** good or bad, with an optional "what is wrong", in the fixture pool. Online when logged in, on a device when
  it is linked. Only accounts vote, which keeps out spam. Devices without an account still count for the usage.
- **Usage:** the number of different online projects and devices which use a version: counted when a project is saved
  online and with each sync, from the profiles the projects use. Not the clicks on "add". Devices not seen for 90 days
  stop counting.
- **Stars:** 1 + 4 × the lower bound of Wilson (95 %) of good / (good + bad). One good vote isn't five stars, a version
  without votes is "not rated yet".
- **The order:** stars, then usage, then OFL before AI, then the newer one. The best version of a fixture is the first
  one which isn't hidden; the search shows it.
- **Hidden:** an admin hides a version (junk, abuse). It disappears from the search, a project which uses it keeps its
  copy.

## 12. How profiles are marked

The same online and on the devices:

| Badge                               | When                                       |
| ----------------------------------- | ------------------------------------------ |
| Open Fixture Library                | The version comes from OFL                 |
| AI-generated · not confirmed yet    | Generated, no or not enough good votes yet |
| AI-generated · confirmed by N users | Generated, with good votes                 |

Next to it the stars and the usage. The popover of a generated version: made by AI from this manual (with the link), may
contain mistakes, test it with the fixture before a show, and mark it good or bad.

## 13. Plan

Each phase can be released on its own.

| Phase                          | spark | rocketshow | show-designer      | ofl-import        |
| ------------------------------ | ----- | ---------- | ------------------ | ----------------- |
| 1. Database and OFL import     | ✔     |            |                    | ✔ (move, archive) |
| 2. Sync of the library         | ✔     | ✔          | ✔ (badges, fields) |                   |
| 3. Registration and statistics | ✔     | ✔          |                    |                   |
| 4. The account on the device   | ✔     | ✔          | ✔ (My devices)     |                   |
| 5. The AI on the device        | ✔     | ✔          | ✔ (`aiAccount`)    |                   |
| 6. AI fixture profiles         | ✔     |            | ✔                  |                   |
| 7. Votes and ranking           | ✔     | ✔          | ✔                  |                   |

- Rocket Show takes the designer as a package (`@rocketshow/designer`): a change of the designer is released before
  Rocket Show uses it.
- Phase 6 works online first, so it can go along with phases 3 to 5.
- The zip goes once phase 2 is out and no device which still needs it is left (section 6).

## 14. Open questions

1. **The OFL import:** moved into `spark/show-designer-api` and the repository archived (_proposed_), or rewritten in
   place?
2. **Manuals:** keep the uploaded PDFs, private, so that a version can be improved later and a mistake traced, or only
   their hash and link?
3. **Statistics:** always sent, or a switch "Send usage statistics" in the settings, on by default? The version and the
   registration come with the sync either way.
4. **Votes:** only from accounts (_proposed_)?
5. **Ember**, which takes the same engine: should it register, sync the library and log in the same way?

## 15. More ideas

- **"There is a better version":** a hint in a project which uses a version ranked lower than the best one, or with bad
  votes, with the exchange in one click.
- **Back to OFL:** offer a confirmed version to the Open Fixture Library.

# The fixture library, AI profiles and devices

The online designer searches its fixture profiles in its database, filled from the Open Fixture Library (OFL). The
devices download a zip of the library instead and never see the database. This document plans one library for both,
which grows with fixture profiles the AI generates from a manual, keeps every version of them and ranks them by usage
and votes. Devices register themselves with each sync, which tells which versions of Rocket Show are still in use, and
can be logged in to an account of the online designer, so that the AI features work on a device as well.

Status: plan, 13 November 2026, with the decisions taken on the first draft the same day and the changes of a review of
it: every version of a profile has a uuid of its own, which a project holds with its copy, the votes count per mode,
states take the place of the stars, and a manual is limited by its size. Nothing of it is implemented. It touches four
repositories: `Rocket-Show/show-designer` (this one), `Rocket-Show/spark` (the API and the database of the online
designer, the image of the Spark), `Rocket-Show/rocketshow` (the backend and the web app of the devices) and
`Rocket-Show/show-designer-ofl-import`, which moves into spark. Ember (`Rocket-Show/ember`) takes part through the
online designer or a designer app (section 13).

## 1. Decisions

| Topic                  | Decision                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The library            | **One library**, the database of the online designer, for the online designer and the devices                                                                                                                                                                                                                                     |
| The zip                | **`fixtures.zip` goes.** Devices take the profiles directly from the database, by a sync; no zip is built                                                                                                                                                                                                                         |
| Registration           | **A device registers with each sync**: its version, its hardware, a few counts. Usage statistics, active versions                                                                                                                                                                                                                 |
| Unconfirmed profiles   | **Shown online and on the devices alike**, clearly marked, with a popover which explains what that means                                                                                                                                                                                                                          |
| An account on a device | **A login in the settings of Rocket Show.** A device which is online and logged in has the AI features                                                                                                                                                                                                                            |
| Devices and accounts   | **Remembered online** by a device identifier: account, name, last online, version, counts. The identifier is a pseudonym, and personal data once the device is linked to an account (section 7)                                                                                                                                   |
| AI profiles            | **The AI generates fixture profiles** from a manual (PDF), a link to one, or a manufacturer and a model                                                                                                                                                                                                                           |
| Versions               | **Every profile is kept** as a version of its fixture, ranked by its state (confirmed, open, a problem), then by usage (section 11)                                                                                                                                                                                               |
| The uuid of a profile  | **Every version has a uuid of its own, which never names another profile** (`<manufacturer>/<fixture-key>~<version id>`), the versions of OFL as well. A project holds it with its copy: usage, votes and the hint of a better version go by it. The plain `<manufacturer>/<fixture-key>` names a fixture, no version (section 4) |
| Votes                  | **Users mark a mode of a version good or bad**, only from a logged-in account: online, or on a device linked to one. A vote counts for every version which has the mode unchanged                                                                                                                                                 |
| Statistics             | **Always sent** with the sync, no switch to turn them off. The privacy policy says what is sent                                                                                                                                                                                                                                   |
| Manuals                | **Kept**, privately: the PDFs uploaded and what was read from a link, to improve a version and trace a mistake                                                                                                                                                                                                                    |
| The OFL import         | **Moves into `spark/show-designer-api`** as a command line script; `show-designer-ofl-import` is archived                                                                                                                                                                                                                         |
| Ember                  | **Only through the online designer or a new designer app** (section 13): the stick itself never goes online, and a Rocket Show device doesn't talk to it                                                                                                                                                                          |

The uuid of a profile, the votes per mode and the states come from the review. The numbers marked _proposed_ are to
confirm.

## 2. Today

- **The online library** is the table `fixture` (uuid `<manufacturer>/<fixture-key>`, name, manufacturer, main category,
  the OFL JSON in `object`) and `manufacturer` of `spark/show-designer-database/model.sql`.
  `spark/show-designer-api/fixtures.php` searches it, `fixture.php` returns one profile.
- **The OFL import** (`show-designer-ofl-import/index.js`, unchanged since 2019) writes an SQL file which starts with
  `DELETE FROM fixture; DELETE FROM manufacturer;`, then inserts all of OFL again. It would delete every generated
  profile, and it breaks on a name with a `'` (only the JSON is escaped).
- **The devices** download `https://www.rocketshow.net/designer/downloads/fixtures.zip` once a week and on "Update
  profiles" (`rocketshow/.../lighting/designer/DefaultFixtureService.java`), unzipped into
  `<manufacturer>/<fixture>.json`. The check runs at boot and holds it up until the download ends
  (`RocketShowApplication.java`). The image of the Spark downloads it while it is built (`spark/raspbian-spark.sh`). The
  zip on the server is of 9 September 2024, with 580 profiles.
- **A show plays from its project:** the designer copies every profile a project uses into `project.fixtureProfiles`,
  and the engine of Rocket Show reads them from there, not from the library. A project keeps working when the library
  changes. The copy is found by its uuid, and the first one loaded stays (`fixture.service.ts`, `getProfileByUuid`): the
  uuid of a copy doesn't tell which version of the profile it is.
- **Profiles from a file:** the designer already adds an OFL JSON file to a project ("Create fixture from profile file",
  `fixture-pool-create-from-file`). It gets the uuid `<manufacturerKey>/<fixtureKey>` of the file, which may be the one
  of a profile of the library, and is marked `createdFromFile`.
- **The identity of a device:** a Spark has a serial in `/provision/device-information.conf`
  (`DefaultDeviceInformationService`). A community installation has no identifier.
- **The login of a device** is a local admin password and API keys. `GET /api/system/settings` returns all of
  `Settings`.
- **The AI looks** are online only (`configService.aiLooks`, `spark/show-designer-api/ai-looks.php`): the designer talks
  to the backend `restUrl` points to, which is the Java backend on a device, and that one has no AI.
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

| Table                  | Holds                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixture`              | One row per real fixture: manufacturer, fixture key, name, main category, its best version, a key to find the same fixture under another spelling (`match_key`), the fixture it was merged into                                                                                                                                                                                                   |
| `fixture_version`      | Every profile: uuid, the OFL JSON and its hash, the source (`ofl`, `ai`, `user`), how it was generated (the manual, the manufacturer and model asked for, the DMX mode), parent version, created by (user, device), AI request, its state, its confirmations and its usage as last worked out (section 11), hidden, retired (gone from OFL), the value of the change counter when it last changed |
| `fixture_version_mode` | Every mode of a version: its name, its state, and the hash of what it does (its channel list, and the channels and wheels it uses)                                                                                                                                                                                                                                                                |
| `fixture_manual`       | A manual a version was made from: its SHA-256, size and pages, the file, the link it came from, who gave it (section 10)                                                                                                                                                                                                                                                                          |
| `fixture_vote`         | One vote per account, fixture and hash of a mode: good or bad, the version and the mode it was given on, an optional comment, can be changed                                                                                                                                                                                                                                                      |
| `fixture_usage`        | Which version an online project or a device uses, when that was last seen, and whether it counts for the ranking (section 11)                                                                                                                                                                                                                                                                     |
| `device`               | The kind (`rocketshow`, `ember`), the hashed device identifier, what the device reports (sections 7 and 13), first and last seen, the linked account, the hash of its token                                                                                                                                                                                                                       |
| `library_counter`      | One row: the change counter of the library (section 6)                                                                                                                                                                                                                                                                                                                                            |
| `ai_request` (exists)  | Two more columns: `feature` (`looks`, `fixture`) and `device_id`                                                                                                                                                                                                                                                                                                                                  |

**The uuids of the profiles.** Every version has a uuid of its own, `<manufacturer>/<fixture-key>~<version id>`, which
the server makes when it stores the version: the versions of OFL as well, the current one included. OFL keys are made of
lowercase letters, digits and dashes, so `~` never clashes with one. The uuid of a version never changes and never names
another profile: a new version of OFL is a new version with a new uuid, and the one before stays what it was. The
current version of OFL of a fixture is its newest version of the source `ofl`. A new manufacturer (one OFL doesn't know)
gets a row in `manufacturer`.

The key in a uuid is the one the fixture had when the version was stored. After a merge, or once a fixture took the key
of OFL (section 5), it isn't the key of the fixture anymore: the fixture of a version is on its row and comes with the
sync (section 6), and is never read out of the uuid.

**The plain uuid.** `<manufacturer>/<fixture-key>`, the uuid of a profile until now, names a fixture and no version. The
library doesn't hand it out anymore. It stays where it is: on the copies of the projects made before this, in the files
of the frozen zip (section 6) and on a profile from a file.

**The version of a copy.** The designer finds the copies of a project by their uuid, and loads a profile from the
library only when the project has no copy with that uuid (`getProfileByUuid`, `loadProfileByUuid`). That stays, and with
a uuid per version it is right: the library hands out the uuid of the version with every profile (`fixtures.php`, the
search of a device), and the designer keeps it as today, on the copy in `project.fixtureProfiles` and on the fixtures
which use it (`profileUuid`). Two versions of a fixture are two copies, side by side: a project changes to another
version fixture by fixture, and a newer version is never taken for the copy the project already has. Usage, votes and
the hint of a better version go by the uuid of the copy.

A copy with a plain uuid is one of a project older than this (the OFL version of the day the fixture was added) or a
profile from a file. It counts for no version, can't be voted on and gets no hint of a better version. Exchanged for the
profile of the library ("exchange profile"), its fixtures have a version. The designer doesn't hash such a copy to find
its version: it reads a profile into its own model, so the JSON of a copy isn't the JSON of the library anymore.

A profile from a file keeps the uuid `<manufacturerKey>/<fixtureKey>` of its file, and the designer refuses a file with
a `~` in one of the two keys. So it is never taken for a version of the library, and it doesn't stand in the way of the
profile the library has under the same keys anymore, which comes with the uuid of its version.

**One fixture, one row.** A generated profile mustn't become a second fixture next to the one the library has, under
another spelling ("ADJ" for `american-dj`). So:

- **The keys are made by the server,** not by the AI: the manufacturer is one of the list (the dialog offers it, "a new
  manufacturer" is a choice of its own), the fixture key is made from the name.
- **`match_key`** is the name in lowercase without anything but letters and digits, and without the name of the
  manufacturer in front. A new profile whose manufacturer and `match_key` the library has becomes a version of that
  fixture.
- **An admin merges** two fixtures which are the same: the versions move to the one which stays, the other one points to
  it (`merged_into`), so that an import or a lookup under its key finds the one which stays.

## 5. The OFL import

- **It updates instead of replacing:** a fixture new in OFL gets a fixture and a version, a fixture whose JSON changed
  gets a new version with a uuid of its own (compared by hash), a fixture gone from OFL is marked retired. It never
  deletes, and never touches a version which doesn't come from OFL.
- **It finds a fixture the library already has:** a fixture new in OFL whose manufacturer and `match_key` a fixture made
  from generated profiles has becomes a version of that one, which takes the key of OFL, and is listed for an admin to
  look at.
- **It writes the modes** of each version with their hashes (`fixture_version_mode`), so that a vote on a mode which a
  new version of OFL leaves alone stays (section 11).
- **It escapes everything** it writes, or uses prepared statements.
- **Where it lives** (decided): a command line script in `spark/show-designer-api`, with the same code for the database
  as the API, which can run on a schedule on the server. It reads a checkout of OFL, as the Node script does today.
- **The old repository:** `show-designer-ofl-import` gets a pointer to the script in its README and is then archived (a
  setting of the repository on GitHub, for an owner).

## 6. The sync of the library (instead of `fixtures.zip`)

**The API.** `POST library-sync.php`. The device sends its registration (section 7) and its cursor, the value of the
change counter it got last (0 the first time). The answer:

- `cursor`: the new one, and `more`, when there is another page.
- `manufacturers` changed since the cursor.
- `versions`: what changed since the cursor about any version (its uuid, its fixture, name, category, source, state,
  confirmations, usage, best version of its fixture, hidden, retired, and its modes with their hashes and states). This
  part is small.
- `profiles`: the JSON of the versions new since the cursor only. A profile never changes: a change is a new version
  with a new uuid (section 4).

Pages of a few hundred versions, gzipped. The first sync is about as large as the zip of today (1.5 MB), the next ones a
few KB. A change counter, not a time, so that the clocks of the devices don't matter.

**The change counter** is one row (`library_counter`). Whatever changes a version takes the lock of the library
(`GET_LOCK`, as the AI requests do in `ai/ai.php`), raises the counter, writes its value onto the row it changes,
commits and gives the lock back. So a value is never visible before a lower one: without the lock, a change which
commits late with a lower value would be missed by every device whose cursor is already past it. Reading needs no lock.

**What raises it:** a new version, a version hidden or retired, an import, and the job which works out the states every
night (section 11), for the versions whose shown values changed only. A vote or a usage alone doesn't, so the devices
don't load a version again for every vote.

**The device** (`DefaultFixtureService`):

- Syncs in the background: once after boot, then daily while it is online, and on "Update profiles". Boot doesn't wait
  for it anymore.
- Keeps one file per version, named by its uuid (`<manufacturer>/<fixture-key>~<id>.json`, where the zip had
  `<manufacturer>/<fixture-key>.json`), and a `library.json` with what the search needs (the uuid and the fixture of
  each version, source, state, confirmations, usage, hidden, the modes with their hashes and states). `checkUuid` takes
  the `~`. The new library replaces the old one only once it is complete, as today. Offline, the last library stays.
- The first sync after the update starts at 0 and replaces the library from the zip.
- `SearchFixtureTemplate` carries the uuid of the best version of a fixture, and gets the source, state, confirmations,
  usage and the number of versions, which the designer shows (section 12). The uuid stays on the copy of the project
  (section 4).

**Online,** `fixtures.php` gives the same fields, one row per fixture with its best version, and all versions of a
fixture on request.

**The online designer and a designer app** use the same sync for the library they cache to work offline (planned for
Ember, section 13): without a registration of their own, with the cursor in their storage.

**The image of the Spark** fills its library with the same sync (from 0) instead of downloading the zip.

**The zip stays, frozen**, for devices which aren't updated yet, until the statistics (section 7) and the access log of
the zip show that none of them are left.

## 7. Registration and usage statistics

**The sync is the registration**, there is no call of its own. The device sends:

| What                                                                         | Why                                                                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Device identifier (hashed)                                                   | Tells devices apart, links a device to its account                                                  |
| Edition (Spark, community); for a Spark its model, SKU and hardware revision | Which hardware is out there                                                                         |
| Raspberry Pi model, architecture, operating system                           | Which platforms to keep supporting                                                                  |
| Version and build number of Rocket Show, update branch (stable, test)        | Which versions are still in use                                                                     |
| Language of the web app                                                      | Which translations matter                                                                           |
| Number of compositions, sets, designer projects and fixtures in the projects | How a device is used                                                                                |
| The uuids of the profiles its projects use                                   | The usage of the versions (section 11); a plain uuid counts for its fixture, in the statistics only |
| The name of the device, only while it is linked to an account                | "My devices" of the account (section 8)                                                             |
| The cursor of the library                                                    | Section 6                                                                                           |

**Never sent, or not stored:** the IP address, the names and the content of files, compositions and projects, a
location.

**Always sent** (decided): there is no switch to turn the statistics off, they come with the sync of the library. The
privacy policy of rocketshow.net (`spark/website/privacy.php`) says what a device sends and why, and the settings of
Rocket Show point to it.

**The device identifier:** the serial of a Spark, else a random id which the device makes at its first start and keeps
in its base path. Not the serial of the Raspberry Pi board or `/etc/machine-id`: the salt of the hash is in the open
source code, so the hash of a board serial can be turned back by trying all of them, and a random id says nothing about
the hardware. A community installation set up anew is a new device, and the old one stops counting after 90 days. It is
sent as a SHA-256 with a fixed salt; a Spark can still be found by hashing its serial.

**What it is:** a pseudonym as long as the device isn't linked, and personal data once it is, with what the device
reports. The privacy policy says so. Whether statistics which can't be turned off need more than that is to check
(section 15).

**Not trusted:** the sync of a device which isn't linked has no login, so anyone can send one with any identifier. It
counts for the statistics, not for the ranking (section 11).

**The statistics**, for admins only (`stats.php`, later a page): active devices by version (last seen within 7, 30 and
90 days), editions and platforms, the AI requests and their cost per day, the most used fixtures.

## 8. The account on the device

**Online** (`spark/show-designer-api`):

- `device-link.php`: email and password in the body (like `login.php`), the device identifier and the name of the
  device. Answers with a token for this device only, stored as a hash, valid only with the same device identifier. The
  password is never stored on the device.
- `device-unlink.php`: from the device, or from "My devices" online.
- `getUserId()` also takes the token of a device (`Authorization: Device <token>` and the device identifier), so the AI
  and the votes work for a linked device without changes of their own.

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
- **nginx of the Spark:** `proxy_read_timeout 300s` and `client_max_body_size 33m` for these paths; the multipart limit
  of Spring takes a manual of 32 MB.
- **The designer:** a new input `aiAccount` (`designer`: its own login, as online; `host`: the host is logged in). With
  `host`, a refused request says "Link this device with your account in Settings → Account" instead of showing the login
  of the designer. Rocket Show sets `aiLooks` and the new `aiFixtures` once the device is linked.
- **The limits** of the AI count per account, online and on all of its devices together. `ai_request.device_id` tells
  where a request came from.

## 10. AI fixture profiles

**What the user gives:**

| Input                    | How                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A manual (PDF)           | Handed to Claude as a document: up to 32 MB and 600 pages for the API, less for the limit below. Scanned manuals work as well, Claude also sees each page                                   |
| A link                   | The web fetch tool of Anthropic loads it. Anthropic fetches it, not the server: it never requests an address a user typed                                                                   |
| A manufacturer and model | Web search finds the manual, web fetch reads it ($10 per 1,000 searches on top of the tokens). The manufacturer is chosen from the list of the library, or "a new manufacturer" (section 4) |
| The DMX mode (optional)  | Fewer modes, fewer mistakes, less cost                                                                                                                                                      |

**How it goes** (`ai-fixture.php`, with what `ai-looks.php` has: the settings, the limits, `ai_request`):

1. **Look in the library first**, by manufacturer and `match_key` (section 4) and by the hash of the PDF. The dialog
   shows the versions found, with their modes and the state of each: the user takes one, at once and for free, or says
   that a mode is missing or wrong, which is "Improve" below.
2. **Check the size.** The token counting of the API says what the request costs before it is sent, for free. A manual
   above the limit (`fixtureMaxInputTokens`: 400,000 tokens, roughly 150 pages, _proposed_) is refused, and the dialog
   asks for the pages with the DMX chart only (section 15). For a link or a search, web fetch gets the same limit
   (`max_content_tokens`) and a number of uses (`max_uses`).
3. **Ask Claude** (the model of the looks, `claude-opus-5-5`, with the fallbacks on). It always works from a manual,
   never from memory: when it finds none, it says so instead of guessing. The manual is marked for the cache
   (`cache_control` on the document).
4. **The answer is OFL JSON**, the format the designer, Rocket Show and OFL read. The designer uses all of the
   capabilities of OFL (`models/fixture-capability.ts`). Not as a structured output: the schema of OFL is much larger
   than the one of the looks, which Anthropic already refused as too large a grammar (`ai/ai.php`). Along with it come,
   for each channel, the page of the manual and its row there, quoted word for word, and what the AI isn't sure about.
   The AI doesn't choose the keys of the manufacturer and the fixture (section 4).
5. **Checked by code**, never fixed silently: the JSON schema of OFL (a fixed version), the ranges of each channel cover
   0–255 without gaps or overlaps, a mode lists only channels which exist, the number of channels matches the name of a
   mode ("8-channel"), fine channels, wheel slots, the pixel keys of a matrix. The errors go back to the AI, for up to
   two rounds of repair. A round is one more turn of the same conversation, so the manual is read from the cache, at a
   twentieth of the price.
6. **The quotes are looked up:** where the PDF has text, the code looks for the quote of each channel on the page it
   names. A channel whose quote isn't there is "not verified" in the review, not an error: the text of a PDF isn't
   always what the page shows. A scanned manual has no text, so all of its channels are "not verified".
7. **Stored as a new, unconfirmed version** and added to the project: as a version of the fixture the library has under
   this manufacturer and `match_key`, else as a new fixture.

**The review in the designer:** the channels of each mode with the page of the manual they come from, the quoted row,
"not verified" where the quote wasn't found, and what the AI wasn't sure about. Maintenance (reset, lamp on and off) and
strobe stand out: the fixture pool has buttons for reset and lamp, and a wrong range could fire during a show.

**Reset and lamp ask first.** For a profile from the AI or from a user, the buttons of the fixture pool show the
channel, the range and the quoted row the first time, and ask. The answer is kept with the copy of the project, so it
asks once per project and profile.

**The manuals are kept** (decided), privately, in `fixture_manual`:

- **An uploaded PDF** is stored once, named by its SHA-256, in a directory the web server doesn't serve (like
  `ai-config.php`). The lookup of step 1 finds it by its hash.
- **A link, or a manufacturer and model:** the links the AI read, and what web fetch returned. Whether that is the PDF
  itself is to check; if not, the text it read.
- **Never handed to other users:** a manual belongs to its manufacturer. The popover of a version links to the public
  address of its manual when there is one, else it names the file.

**Improve:** from a version and the comments of its bad votes, or an instruction ("channel 6 is the strobe", "the
12-channel mode is missing"), the AI reads the same manual again and makes a new version with the old one as its parent.
That is how the versions of a fixture grow. The AI writes the modes it was asked about only; the server puts them into
the JSON of the parent. The other modes stay the same byte for byte, and with them their hashes and their votes (section
11).

**From a user:** "Offer to the library" on a profile created from a file, for a logged-in account. It goes through the
checks of step 5 and becomes an unconfirmed version with the source `user`, and the fixtures of the project are
exchanged for it, so that they count for it and can be voted on. That is how a mistake of the AI is corrected by hand,
without another request.

**The cost:** $4 per million tokens in, $20 out. A manual of 40 pages and the answer come to roughly $0.30–1 per new
profile (an estimate, to measure on real manuals), a manual at the limit to roughly $2. The profiles have limits of
their own (`ai_request.feature`), by tokens and not by requests alone, as one request costs between a few cents and a
few dollars: `fixtureRequestsPerUserPerDay` (5, _proposed_) and a number of tokens per day for all users, counted from
the tokens `ai_request` already holds.

**The cache:** it is written at 1.25 times the price of the input and lasts 5 minutes from the start of a request. An
answer takes up to 4 minutes, so whether a round of repair still finds it is to measure; if not, the cache of one hour
(written at twice the price) is the one to use.

**The designer:** "Create profile with AI" in the fixture pool next to "Create fixture from profile file", the dialog
with the inputs, the review, a popover with the versions of a fixture. A project changes to another version with the
existing "exchange profile".

## 11. Versions, votes and ranking

- **Votes:** good or bad, with an optional "what is wrong", in the fixture pool, for the mode the fixture is used in
  (`modeShortName` of the fixture). Only from a logged-in account (decided): online when logged in, on a device when it
  is linked. That keeps out spam. A copy with a plain uuid can't be voted on (section 4).
- **A vote counts for a mode, not for a version.** A profile is right or wrong mode by mode, and nobody tests the modes
  they don't use. The server keeps a hash of what each mode of a version does (`fixture_version_mode`): its channel
  list, and the channels and wheels it uses. A vote counts for its fixture and that hash, so for every version which has
  the mode unchanged. A version which corrects one mode keeps the confirmations of the others, and doesn't start below
  the version it corrects. One vote per account, fixture and mode.
- **The state of a mode:** _confirmed_ with good votes of at least 2 accounts and more good votes than bad ones, a
  _problem_ with at least 2 bad votes and more bad ones than good ones, else _open_ (the numbers _proposed_). The vote
  of whoever generated or uploaded the mode is shown, but isn't one of the 2.
- **The state of a version:** a problem when one of its modes is one; confirmed when at least one mode is confirmed and
  none is a problem; else open. Its confirmations are the accounts with a good vote on one of its modes.
- **Usage:** the number of different online projects and devices which use a version, by the uuid of their copy: counted
  when a project is saved online and with each sync. Not the clicks on "add". Devices not seen for 90 days stop
  counting. For the ranking, only the projects of an account and the linked devices count (`fixture_usage`): the sync of
  a device which isn't linked can be made up (section 7). The statistics count all of them, and a copy with a plain uuid
  for its fixture.
- **The order** of the versions of a fixture: the confirmed ones (most good votes less bad ones first), then the current
  version of OFL (section 4) while it is open, then the other open ones, then the problems. Within these, by usage, then
  the newer one. The best version of a fixture is the first one which isn't hidden; the search shows it. So a version of
  OFL nobody voted on stays ahead of a generated one with a single vote.
- **No stars.** A fixture gets a few votes at most. The usual rating for that (the lower bound of Wilson) gives 1.8
  stars for one good vote and 3.3 for five of five, and needs 27 votes without a bad one for 4.5: nearly every profile
  would look bad. "Confirmed by 3 users" says what is known.
- **Worked out every night:** a job works out the states, the confirmations, the usage and the best version, and raises
  the change counter for the versions whose shown values changed (section 6). Whoever votes sees their own vote at once.
- **"There is a better version":** when a project is opened online, and on a device after a sync, the designer compares
  the version of each copy with the library. The fixture pool marks a fixture whose mode is a problem, whose version is
  hidden, or whose mode has other channels in the best version of the fixture. The mark opens the existing "exchange
  profile", whose report says what is carried over and what is lost. The better version has a uuid of its own, so the
  exchange loads it next to the copy it replaces, also when both are versions of OFL. No mark when the best version has
  the mode unchanged (the same hash): nothing would change. Without it a correction never reaches a project, which plays
  from its own copy.
- **Hidden:** an admin hides a version (junk, abuse). It disappears from the search, a project which uses it keeps its
  copy and is told (above).

## 12. How profiles are marked

The same online and on the devices: where a profile comes from, and what is known about it.

| Badge                  | When                                      |
| ---------------------- | ----------------------------------------- |
| Open Fixture Library   | The version comes from OFL                |
| AI-generated           | Generated from a manual                   |
| From a user            | Offered from a profile file               |
| · not confirmed yet    | Open, for a version from the AI or a user |
| · confirmed by N users | Confirmed (section 11)                    |
| · N reported problems  | A problem (section 11)                    |

Next to it the usage. Where a mode is chosen, each mode shows its own state. The popover of a generated version: made by
AI from this manual (with the link), may contain mistakes, test it with the fixture before a show, and mark it good or
bad.

## 13. Ember

Ember (`Rocket-Show/ember`, its `concept.md`) is a USB stick which plays the shows compiled in the designer. It has no
Wi-Fi, no Bluetooth and no app of its own, so it never reaches the internet itself.

**Decided:** everything of the stick goes only through the online designer or a new designer app, never through a Rocket
Show device. "The designer" in the table below is either of them: the app does what the online designer does, with the
same API. The online designer talks to the stick over Web Serial (Chrome, Edge, Firefox) or writes a show file onto its
drive (any browser). Over Web Serial it reads `INFO` (`firmware/docs/serial.md` there): the firmware version, the
behaviour version of the engine, the show formats and feature bits it plays, its setlist, its last error, the longest
frame it worked out and the serial number of its chip.

| Topic                | For Ember                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The library          | Nothing on the stick: a show carries what it needs, compiled. The designer caches the library for working offline with the same sync as the devices (section 6): what the search needs of every version, the JSON of the best version of each fixture, the others loaded when online                                                                                                                              |
| Registration         | The designer registers a stick when it is connected over Web Serial and the designer is online: kind `ember`, the serial of the chip (hashed), firmware version, behaviour version of the engine, show formats, the number of entries, the last error, the longest frame, the profiles of the show on it. "Last online" is when a designer last saw it. A stick only ever filled by dropping a file stays unknown |
| Account              | No login on the stick. The designer links a stick it registers to the account it is logged in with, so it shows up in "My devices"                                                                                                                                                                                                                                                                                |
| AI                   | In the designer, with its own login: nothing on the stick                                                                                                                                                                                                                                                                                                                                                         |
| Unconfirmed profiles | Marked in the designer as everywhere. The stick plays without a laptop, so copying a show which uses a version not confirmed yet warns once: test it with the fixture first                                                                                                                                                                                                                                       |
| Votes                | In the designer, e.g. after trying the show live through the stick                                                                                                                                                                                                                                                                                                                                                |
| Statistics           | The firmware and engine versions in use say which shows the sticks out there can play, and when a firmware update is worth offering. The question of the Ember concept, who connects (band, church, installation, home) and how to count it without a tracker, goes to the same API with the registration                                                                                                         |

This needs what the Ember concept builds in the designer first: the connection to the stick and the offline cache of the
library.

## 14. Plan

Each phase can be released on its own.

| Phase                                              | spark | rocketshow | show-designer                                    | ofl-import        |
| -------------------------------------------------- | ----- | ---------- | ------------------------------------------------ | ----------------- |
| 1. Database and OFL import                         | ✔     |            |                                                  | ✔ (move, archive) |
| 2. Sync of the library                             | ✔     | ✔          | ✔ (badges, fields, no `~` in the keys of a file) |                   |
| 3. Registration and statistics                     | ✔     | ✔          |                                                  |                   |
| 4. The account on the device                       | ✔     | ✔          | ✔ (My devices)                                   |                   |
| 5. The AI on the device                            | ✔     | ✔          | ✔ (`aiAccount`)                                  |                   |
| 6. AI fixture profiles                             | ✔     |            | ✔                                                |                   |
| 7. Votes, ranking and the hint of a better version | ✔     | ✔          | ✔                                                |                   |
| 8. Ember through the designer and its app          | ✔     |            | ✔                                                |                   |

- Rocket Show takes the designer as a package (`@rocketshow/designer`): a change of the designer is released before
  Rocket Show uses it.
- Phase 6 works online first, so it can go along with phases 3 to 5.
- Phase 1 already gives every version its uuid and writes the modes with their hashes and the `match_key`. A profile
  added to a project comes with the uuid of its version from then on online (`fixtures.php` hands it out, the designer
  keeps a uuid as it is), and from phase 2 on on a device: votes and usage are only worth something for the copies which
  have one.
- Phase 8 follows the connection to the stick and the offline cache of the Ember concept, in the online designer and in
  the designer app; the firmware already answers `INFO`.
- The zip goes once phase 2 is out and no device which still needs it is left (section 6).

## 15. Open questions

The questions of the first draft are answered in section 1. The review left these:

- **A PDF library in PHP on the hosting:** the lookup of the quotes (section 10, step 6) needs the text of each page.
  Whether a library in plain PHP reads the manuals well enough is to try on real ones. Without it, the review still
  shows the quotes, and every channel is "not verified".
- **The pages of a manual above the limit:** the server cuts them out of the PDF (the same library question), or the
  user uploads those pages only.
- **Statistics without a switch:** what the law asks for a device identifier which is always sent and can be linked to
  an account (the Swiss data protection act, the GDPR and the rules on reading from a device in the EU), beyond the
  privacy policy. To check with somebody qualified before phase 3.
- **The numbers marked _proposed_:** 2 votes for a state, 400,000 tokens for a manual, 5 profiles per user and day.

## 16. More ideas

- **Back to OFL:** offer a confirmed version to the Open Fixture Library.

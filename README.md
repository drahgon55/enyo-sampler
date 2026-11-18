# enyo-sampler

One page linking to every Enyo 2.7 sample, across all three libraries.

`enyojs/sampler` was the original of this: a repo that pulled enyo, layout and
onyx together by git submodule and gave you one page to browse their samples
from. It was last touched in 2015, is wired to Enyo 2.5, and cannot be used.
This is the same idea rebuilt for the ES-module forks — minus the submodules,
which are what made the original so brittle.

## What is here

`index.html`, and nothing else. It links to each library's own sample index:

| library | samples | index |
| --- | ---: | --- |
| [enyo](https://github.com/drahgon55/enyo) | 33 | `enyo/samples/index.html` |
| [layout](https://github.com/drahgon55/layout) | 23 | `layout/samples/index.html` |
| [onyx](https://github.com/drahgon55/onyx) | 22 | `onyx/samples/index.html` |

78 samples in all, ported from the `2.5.1-release` tag of each upstream
repository — the last tag that still had them, before 2.6 deleted every
`samples/` folder.

**The samples themselves live in the library they demonstrate**, which is where
upstream had them and where they belong: a sample is documentation for its
library, and it should move, break and get fixed along with it. This repo
deliberately holds none of them. It is a table of contents, so it stays useful
no matter what any library does to its own set, and nothing here has to be
updated when a library gains a sample.

That also means this repo is not self-contained and is not meant to be. It
links sideways out of itself, to sibling checkouts, by relative path.

## Running it

Clone the forks next to each other, all on their `esm` branches:

```
some-directory/
  enyo/
  layout/
  onyx/
  enyo-ilib/      # only the two onyx i18n samples need this
  enyo-sampler/   # this repo
```

Then serve **the directory that holds them**, not any one of them:

```bash
python3 layout/test-layout/serve.py 8000 /path/to/some-directory
```

and open <http://localhost:8000/enyo-sampler/index.html>.

The root matters because the pages resolve bare specifiers (`enyo/src/...`,
`onyx/src/...`) through an import map that assumes the checkouts are siblings
under one origin. Point the server inside a single repository and nothing
resolves. `index.html` checks the three links when it loads and tells you which
checkout is missing rather than letting you click into a 404.

`serve.py` lives in the layout fork and disables caching. Use it rather than
`python3 -m http.server`: the latter lets the browser cache ES modules, and a
query string on the page URL does not bust them, so a reload can silently
re-run stale code and report a pass for a change that is not there.

## Why the forks exist

Enyo 2.7 was never released as ES modules. These forks convert each library to
native ES modules with no bundler and no build step, so a browser can load the
framework directly through an import map. Each fork's `MIGRATION.md` documents
its conversion, and each `samples/README.md` documents what porting that
library's samples turned up — including several latent bugs that only became
visible once the code ran under a module's strict mode.

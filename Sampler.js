/**
* The sampler shell: one screen that lists all 78 samples and runs the
* selected one beside the list.
*
* It is built out of the three libraries it demonstrates, which is the point
* -- a sampler whose own chrome is a `Panels` under a `CollapsingArranger`,
* with `FittableRows`, an `enyo/Scroller` and onyx's toolbars, items and
* inputs, is itself the eighty-first sample. So the responsive behaviour is
* not hand-written CSS: wide, the list and the sample sit side by side; under
* 800px -- `Panels.isScreenNarrow()`, the same threshold as layout's own media
* query -- the list collapses and the sample slides over it, with a Back
* button `reflow()` reveals. That is `PanelsFlickrSample` doing master/detail,
* pointed at samples instead of photographs.
*
* **The sample runs in an iframe, and that is deliberate.** Rendering a
* sample's kind straight into a panel would be the showier choice and it would
* not survive contact with these samples:
*
* - They are whole-page apps. Most are `enyo-fit` and assume they own the
*   viewport; several measure it (every `List` and `Fittable` here does).
* - Their stylesheets are not scoped. layout's samples each bring their own,
*   and `.sample`-ish selectors from 23 of them in one document would collide
*   with each other and with this shell.
* - They leave things behind: `Signals` listeners, `Animator`s, jobs, body
*   classes, global drag handlers. An iframe tears all of that down for free
*   when its `src` changes; `destroy()` on a kind does not.
* - One sample throwing takes down its frame and nothing else.
*
* And because each library already has a `sample.html?s=<Name>` host page that
* validates the name, links the right per-sample stylesheet and reports its
* own failures, pointing a frame at that page reuses all of it rather than
* reimplementing it here. The standalone URLs keep working, and they are what
* the Open alone link hands you.
*
* @module enyo-sampler/Sampler
*/

import kind from 'enyo/src/kind.js';
import Scroller from 'enyo/src/Scroller/Scroller.js';

import FittableRows from 'layout/src/FittableRows.js';
import FittableColumns from 'layout/src/FittableColumns.js';
import Panels from 'layout/src/Panels/Panels.js';
import CollapsingArranger from 'layout/src/CollapsingArranger.js';
import CarouselArranger from 'layout/src/CarouselArranger.js';

import Button from 'onyx/src/Button/Button.js';
import GroupboxHeader from 'onyx/src/GroupboxHeader/GroupboxHeader.js';
import Input from 'onyx/src/Input/Input.js';
import InputDecorator from 'onyx/src/InputDecorator.js';
import Item from 'onyx/src/Item/Item.js';
import Spinner from 'onyx/src/Spinner/Spinner.js';

import Source from './Source.js';

/**
* The sample the page opens on when the URL names none.
*
* Something has to be running the moment the page loads -- an empty stage
* beside a list is just the old menu with extra steps -- and of the 78 this is
* the one that shows the most framework at once: seven panels and nine
* arrangers, switched from a picker.
*
* @private
*/
var DEFAULT_SAMPLE = {lib: 'layout', name: 'PanelsSample'};

/**
* A row in the list.
*
* `onyx/Item` already highlights itself while held; what it has no notion of
* is *staying* marked, which is what a list driving a detail view needs. The
* class is enyo's own `enyo-selected`, the one `DataRepeater` applies, so the
* colour comes from onyx's stylesheet rather than from ours.
*
* @class SampleItem
* @extends module:onyx/Item~Item
* @private
*/
var SampleItem = kind({
	name: 'sampler.SampleItem',
	kind: Item,
	classes: 'sampler-item',
	published: {
		selected: false
	},

	/**
	* @private
	*/
	selectedChanged: function () {
		this.addRemoveClass('enyo-selected', this.selected);
	}
});

/**
* @class Sampler
* @extends module:layout/Panels~Panels
* @public
*/
export default kind({

	/**
	* @private
	*/
	name: 'sampler.Sampler',

	/**
	* @private
	*/
	kind: Panels,

	/**
	* @private
	*/
	classes: 'enyo-fit enyo-unselectable sampler',

	/**
	* @private
	*/
	arrangerKind: CollapsingArranger,

	/**
	* `Panels` is draggable by default, which here means a drag anywhere the
	* sample does not claim -- the toolbar, the gap beside a button -- slides
	* the whole shell sideways. Every move between the two panels is a button
	* or a row tap, so the gesture only ever fires by accident.
	*
	* Turning it off at the top also settles it for the frame: a drag that
	* starts on the sample cannot slide the list out from under it.
	*
	* @private
	*/
	draggable: false,

	/**
	* The list panel is wide enough to read labels in and no wider; the sample
	* gets the rest. `CollapsingArranger` hands the remaining width to the last
	* panel, so this is the only width the shell has to state.
	*
	* @private
	*/
	realtimeFit: true,

	/**
	* Supplied by the host page: the output of `manifests.js`, one entry per
	* library.
	*
	* @private
	*/
	libraries: null,

	/**
	* Tracks what `reflow()` last decided, so the wide/narrow switch runs once
	* per change rather than on every resize event. `null` rather than `false`
	* so the first reflow always counts as a change.
	*
	* @private
	*/
	narrow: null,

	/**
	* @private
	*/
	components: [
		{name: 'listPanel', kind: FittableRows, classes: 'enyo-fit sampler-list-panel', components: [
			{classes: 'onyx onyx-toolbar sampler-head', components: [
				{classes: 'sampler-head-row', components: [
					{content: 'Enyo 2.7', classes: 'sampler-brand'},
					{name: 'headCount', classes: 'sampler-head-count'}
				]},
				{kind: InputDecorator, classes: 'sampler-filter-box', components: [
					{name: 'filter', kind: Input, placeholder: 'Filter',
						oninput: 'applyFilter', onkeydown: 'filterKey'}
				]}
			]},
			// Default (native) scroll strategy on purpose: this is a nav list
			// that wants the wheel and the trackpad to behave exactly as they
			// do everywhere else in the browser.
			{name: 'scroller', kind: Scroller, fit: true, classes: 'sampler-scroller', components: [
				{name: 'list', classes: 'sampler-list'},
				{name: 'nothing', classes: 'sampler-nothing', showing: false,
					content: 'Nothing matches that.'}
			]}
		]},
		{name: 'detail', fit: true, kind: FittableRows, classes: 'enyo-fit sampler-detail', components: [
			// A FittableColumns wearing onyx's toolbar classes. onyx expects
			// exactly this pairing -- its stylesheet carries a
			// `.enyo-fittable-columns-layout.onyx-toolbar-inline > *` rule,
			// and `MoreToolbar` is built the same way -- and it is what lets
			// the title take the slack between the two buttons.
			{name: 'bar', kind: FittableColumns, classes: 'onyx onyx-toolbar sampler-bar', components: [
				{name: 'back', kind: Button, classes: 'sampler-back', content: 'Samples',
					showing: false, ontap: 'showList'},
				{name: 'barText', fit: true, classes: 'sampler-bar-text', components: [
					{name: 'barTitle', classes: 'sampler-bar-title'},
					{name: 'barBlurb', classes: 'sampler-bar-blurb'}
				]},
				// A real anchor, not a Button with a tap handler: middle-click,
				// cmd-click and Copy Link Address all work, and nothing has to
				// get past a popup blocker.
				{name: 'sourceToggle', kind: Button, classes: 'sampler-source-toggle',
					content: 'Source', ontap: 'toggleSource'},
				{name: 'open', tag: 'a', classes: 'onyx-button sampler-open',
					content: 'Open alone', attributes: {target: '_blank', rel: 'noopener'}}
			]},
			// A second Panels inside the first, which is what makes the source
			// slide rather than appear. `CarouselArranger` lays its panels out
			// in a row and moves along it, so the source comes in from the
			// right and goes back out the way it came -- the two directions
			// read as opposites, which is the whole point of a drawer.
			//
			// It is the arranger that needs its panels to declare a width
			// (`.sampler-card` does, in the stylesheet): panels are absolutely
			// positioned, so without one they would shrink to their content
			// and the carousel would have nothing to measure.
			//
			// The two obvious alternatives are worse here. `LeftRightArranger`
			// treats the panels as a wrapping ring and balances one on each
			// side, which with exactly two puts the source on the left and
			// lets you cycle forever. `CardSlideInArranger` always slides in
			// from the right, so going back looks like going on, and it hides
			// the panel it leaves -- which would mean display:none on a frame
			// with a live sample in it every time the source opens.
			{name: 'stage', fit: true, kind: Panels, classes: 'sampler-stage',
				arrangerKind: CarouselArranger, draggable: false,
				realtimeFit: true, components: [
				{name: 'sampleCard', classes: 'sampler-card', components: [
					// `allow` because two samples -- enyo's Fullscreen and
					// Video -- call requestFullscreen(), which a frame is
					// refused by default. Without it the shell would quietly
					// break samples that work on their own pages.
					{name: 'frame', tag: 'iframe', classes: 'sampler-frame',
						attributes: {title: 'The selected sample', frameborder: '0',
							allow: 'fullscreen', allowfullscreen: 'allowfullscreen'}},
					{name: 'spinner', kind: Spinner, classes: 'sampler-spinner', showing: false},
					{name: 'empty', classes: 'sampler-empty', showing: false}
				]},
				{name: 'sourceView', kind: Source, classes: 'sampler-card'}
			]}
		]}
	],

	/**
	* @method
	* @private
	*/
	create: kind.inherit(function (sup) {
		return function () {
			sup.apply(this, arguments);
			this.rows = [];
			this.sections = [];
			this.current = null;
			this.buildList();
			var n = this.rows.length;
			this.$.headCount.setContent(n + (n === 1 ? ' sample' : ' samples'));
			this.$.filter.setPlaceholder('Filter ' + n + ' samples');
			if (!n) {
				this.showEmptyStage();
			}
		};
	}),

	/**
	* @method
	* @private
	*/
	rendered: kind.inherit(function (sup) {
		return function () {
			sup.apply(this, arguments);
			if (this.started) {
				return;
			}
			this.started = true;

			// The frame is a bare `iframe` tag rather than a kind, so enyo's
			// dispatcher knows nothing about its `load`; listen on the node.
			var node = this.$.frame.hasNode();
			if (node) {
				node.addEventListener('load', this.bindSafely('frameLoaded'));
			}

			// Back and Forward walk the samples you have looked at.
			this._onHashChange = this.bindSafely('locationHashChanged');
			window.addEventListener('hashchange', this._onHashChange);

			// A reload restores what was typed in the filter, the way browsers
			// restore any form field -- but nothing has acted on it yet, so
			// without this the box would say one thing and the list show
			// another.
			if (this.$.filter.getValue()) {
				this.applyFilter();
			}

			if (this.rows.length) {
				if (!this.selectPath(location.hash.replace(/^#/, ''))) {
					if (!this.selectPath(DEFAULT_SAMPLE.lib + '/' + DEFAULT_SAMPLE.name)) {
						this.selectRow(this.rows[0]);
					}
				}
				// Narrow, the list is a drawer over the sample rather than a
				// column beside it -- so open on the sample, same as wide.
				if (Panels.isScreenNarrow()) {
					this.setIndexDirect(1);
				}
			}
		};
	}),

	/**
	* @method
	* @private
	*/
	destroy: kind.inherit(function (sup) {
		return function () {
			if (this._onHashChange) {
				window.removeEventListener('hashchange', this._onHashChange);
				this._onHashChange = null;
			}
			sup.apply(this, arguments);
		};
	}),

	/**
	* Switches the shell between its two shapes. `Panels` calls this on every
	* resize; the guard keeps the work to the crossings.
	*
	* @see module:layout/samples/PanelsFlickrSample
	* @method
	* @private
	*/
	reflow: kind.inherit(function (sup) {
		return function () {
			sup.apply(this, arguments);
			var narrow = Panels.isScreenNarrow();
			if (narrow === this.narrow) {
				return;
			}
			this.narrow = narrow;
			this.$.back.setShowing(narrow);
			// Four controls do not fit a phone's toolbar, and the title is
			// what loses. `Open alone` is the one to drop: what it buys you is
			// the sample with the shell out of the way, and at this width the
			// sample already has the whole screen.
			//
			// It has to be `setShowing`, not a `display: none` in the
			// stylesheet. `FittableLayout` decides what to measure from each
			// child's `showing` property rather than from its computed style
			// (`FittableLayout.js:175`), so a control hidden behind a media
			// query is still counted -- and the fitting child's width comes
			// out of a sum that includes a box that is not there. It did:
			// the title was handed 1837px inside a 375px bar, which pushed
			// every button after it off the screen.
			this.$.open.setShowing(!narrow);
			// Widening with the list collapsed would leave it off-screen with
			// nothing to bring it back, since Back is gone.
			if (!narrow && this.getIndex() !== 0) {
				this.setIndexDirect(0);
			}
			this.$.detail.resize();
		};
	}),

	// -- the list ----------------------------------------------------------

	/**
	* Builds a section per library out of the manifests. Every row carries the
	* manifest entry it came from, so nothing downstream has to look an index
	* back up.
	*
	* @private
	*/
	buildList: function () {
		var libs = this.libraries || [];
		for (var i = 0; i < libs.length; i++) {
			var lib = libs[i];
			var section = {id: lib.id, rows: [], missing: null};

			section.header = this.$.list.createComponent({
				kind: GroupboxHeader,
				classes: 'sampler-section',
				components: [
					{content: lib.id, classes: 'sampler-section-name'},
					// Each library keeps its own annotated index -- the full
					// list with every blurb spelled out. The rows here are
					// labels only, so that page is still worth having.
					{tag: 'a', classes: 'sampler-section-link',
						attributes: {href: '../' + lib.id + '/samples/index.html'},
						content: lib.error ? 'missing' : 'index'}
				]
			}, {owner: this});

			if (lib.error) {
				section.missing = this.$.list.createComponent({
					classes: 'sampler-missing',
					content: 'No ' + lib.id + '/samples under the served root.'
				}, {owner: this});
			}

			for (var j = 0; j < lib.samples.length; j++) {
				var entry = lib.samples[j];
				var row = this.$.list.createComponent({
					kind: SampleItem,
					content: entry.label,
					// The blurb is the row's tooltip rather than a second
					// line: 78 two-line rows are not a list you can scan.
					attributes: {title: entry.blurb || ''},
					ontap: 'rowTapped',
					lib: lib.id,
					entry: entry
				}, {owner: this});
				row.haystack = [entry.label, entry.name, lib.id, entry.blurb || '']
					.join(' ').toLowerCase();
				section.rows.push(row);
				this.rows.push(row);
			}

			this.sections.push(section);
		}
	},

	/**
	* @private
	*/
	rowTapped: function (sender) {
		this.selectRow(sender);
		return true;
	},

	/**
	* @private
	*/
	findRow: function (libId, name) {
		for (var i = 0; i < this.rows.length; i++) {
			if (this.rows[i].lib === libId && this.rows[i].entry.name === name) {
				return this.rows[i];
			}
		}
		return null;
	},

	/**
	* @private
	*/
	visibleRows: function () {
		var out = [];
		for (var i = 0; i < this.rows.length; i++) {
			if (this.rows[i].getShowing()) {
				out.push(this.rows[i]);
			}
		}
		return out;
	},

	// -- selection ---------------------------------------------------------

	/**
	* Points the frame at a row's sample.
	*
	* @param {module:onyx/Item~Item} row - A row built by `buildList()`.
	* @param {Boolean|String} [reveal] - Scroll the row into view: `true` moves
	*	the list as little as will do it, `'top'` puts the row at the top. Set
	*	when the selection did not come from tapping the row itself.
	* @private
	*/
	selectRow: function (row, reveal) {
		if (!row) {
			return false;
		}
		var url = '../' + row.lib + '/samples/sample.html?s=' +
			encodeURIComponent(row.entry.name);

		if (this.current !== row) {
			for (var i = 0; i < this.rows.length; i++) {
				this.rows[i].setSelected(this.rows[i] === row);
			}
			this.current = row;
			this.$.barTitle.setContent(row.entry.label);
			this.$.barBlurb.setContent(row.entry.blurb || '');
			this.$.open.setAttribute('href', url);
			this.$.spinner.show();
			this.showSample();
			this.load(url);
			this.setPath(row.lib + '/' + row.entry.name);
		}

		if (reveal) {
			this.reveal(row, reveal === 'top');
		}
		if (Panels.isScreenNarrow()) {
			this.setIndex(1);
		}
		return true;
	},

	/**
	* Scrolls a row into view, if it is not already, on the next turn rather
	* than now.
	*
	* The wait is because laying the panels out is not finished when `rendered`
	* runs -- `CollapsingArranger` sizes the last panel afterwards, and the
	* resize that follows puts the scroller back to its remembered position.
	* Scrolling in the same turn is simply undone.
	*
	* Neither `scrollIntoView()` nor `scrollToControl()` would do here.
	* `scrollIntoView()` is the DOM's own, which moves every scrollable
	* ancestor and in an `enyo-fit` shell can take the whole page with it.
	* `scrollToControl()` moves only this scroller, but it always scrolls, and
	* it puts the row flush against the top -- which is exactly where the
	* sticky section header is, so the row you asked for ends up underneath
	* it. Hence the header's height as a margin.
	*
	* @param {module:onyx/Item~Item} row - The row to show.
	* @param {Boolean} [toTop] - Put the row at the top of the list rather than
	*	moving as little as possible. Arriving at a sample from a link should
	*	land on it with its neighbours below; stepping through with the arrow
	*	keys should not make the list jump at every press.
	* @private
	*/
	reveal: function (row, toTop) {
		this.startJob('reveal', function () {
			var node = row.hasNode();
			var listNode = this.$.list.hasNode();
			var scroller = this.$.scroller;
			var scrollerNode = scroller.hasNode();
			if (!node || !listNode || !scrollerNode) {
				return;
			}

			// Measured against the list, not against the viewport: this runs
			// one tick after `rendered`, when the row is in the document but
			// the panel has not finished laying out, so where the scroller
			// *sits on screen* is still moving. Where a row sits inside the
			// list is not -- it is the same number before and after the
			// toolbar above takes its height.
			var offset = node.getBoundingClientRect().top -
				listNode.getBoundingClientRect().top;
			var header = this.sections.length && this.sections[0].header.hasNode();
			var margin = header ? header.offsetHeight : 0;
			var top = scroller.getScrollTop();

			if (toTop || offset < top + margin) {
				scroller.setScrollTop(Math.max(0, offset - margin));
			} else if (offset + node.offsetHeight > top + scrollerNode.clientHeight) {
				scroller.setScrollTop(offset + node.offsetHeight - scrollerNode.clientHeight);
			}
		}, 1);
	},

	/**
	* @param {String} path - `<library>/<SampleName>`.
	* @private
	*/
	selectPath: function (path) {
		var parts = /^([a-z-]+)\/([A-Za-z0-9]+)$/.exec(path || '');
		return parts ? this.selectRow(this.findRow(parts[1], parts[2]), 'top') : false;
	},

	/**
	* Points the frame at a sample. Replacing the frame's document is the
	* teardown: the old sample, and everything it hung off its window, goes
	* with it.
	*
	* `location.replace()` rather than the obvious `src`, because **an iframe
	* navigation is a session-history entry**. Assigning `src` pushes one, so
	* the browser's Back button walks the frames you have loaded instead of
	* the samples you have visited -- you press Back, the address bar still
	* reads the sample you are on, and the frame shows the previous one.
	* `replace()` writes over the current entry instead, which leaves Back and
	* Forward to the hash, where this page puts the sample you chose.
	*
	* @private
	*/
	load: function (url) {
		var node = this.$.frame.hasNode();
		// Before the frame is in the document there is no window to replace
		// in; `src` is right then, and pushes nothing because the frame has
		// no entry of its own yet.
		if (node && node.contentWindow) {
			node.contentWindow.location.replace(url);
		} else {
			this.$.frame.setAttribute('src', url);
		}
	},

	/**
	* @private
	*/
	frameLoaded: function () {
		this.$.spinner.hide();
	},

	/**
	* @private
	*/
	showList: function () {
		this.setIndex(0);
		return true;
	},

	// -- the source card ---------------------------------------------------

	/**
	* Slides the source card in, or back out if it is already in. The source
	* is read on the way in rather than when the sample is chosen, so a run
	* through the list costs nothing until the button is pressed.
	*
	* @private
	*/
	toggleSource: function () {
		if (this.$.stage.getIndex() === 1) {
			this.showSample();
		} else if (this.current) {
			this.$.sourceView.load(this.current.lib, this.current.entry.name);
			this.$.stage.setIndex(1);
			// The button says what the next press gives you, not where you are.
			this.$.sourceToggle.setContent('Sample');
		}
		return true;
	},

	/**
	* Back to the running sample. Choosing another sample calls this too:
	* clicking a row asks to see that sample, not its source.
	*
	* @private
	*/
	showSample: function () {
		if (this.$.stage.getIndex() !== 0) {
			this.$.stage.setIndex(0);
		}
		this.$.sourceToggle.setContent('Source');
	},

	// -- the URL -----------------------------------------------------------

	/**
	* @private
	*/
	setPath: function (path) {
		this.path = path;
		if (location.hash.replace(/^#/, '') !== path) {
			location.hash = path;
		}
	},

	/**
	* @private
	*/
	locationHashChanged: function () {
		var path = location.hash.replace(/^#/, '');
		if (path !== this.path) {
			this.selectPath(path);
		}
	},

	// -- the filter --------------------------------------------------------

	/**
	* Hides the rows that do not match every word typed, and any section left
	* with nothing in it. Matching is over the label, the module name, the
	* library name and the blurb, so the blurbs stay searchable even though
	* they are not on the rows.
	*
	* @private
	*/
	applyFilter: function () {
		var terms = this.$.filter.getValue().toLowerCase().split(/\s+/)
			.filter(function (t) { return t.length; });
		var shown = 0;

		for (var i = 0; i < this.sections.length; i++) {
			var section = this.sections[i];
			var hits = 0;
			for (var j = 0; j < section.rows.length; j++) {
				var row = section.rows[j];
				var match = terms.every(function (t) {
					return row.haystack.indexOf(t) >= 0;
				});
				row.setShowing(match);
				if (match) {
					hits++;
				}
			}
			shown += hits;
			section.header.setShowing(hits > 0 || !terms.length);
			if (section.missing) {
				section.missing.setShowing(!terms.length);
			}
		}

		this.$.nothing.setShowing(!shown && terms.length > 0);
	},

	/**
	* Enter and the arrow keys, so a sample can be reached without letting go
	* of the keyboard: type two or three letters, press Return.
	*
	* @private
	*/
	filterKey: function (sender, event) {
		if (event.keyCode === 27) {			// Escape, back to all 78
			this.$.filter.setValue('');
			this.applyFilter();
			if (this.current) {
				this.reveal(this.current, true);
			}
			event.preventDefault();
			return true;
		}

		var visible = this.visibleRows();
		if (!visible.length) {
			return;
		}
		var at = visible.indexOf(this.current);
		var want;

		if (event.keyCode === 13) {			// Return
			want = visible[at >= 0 ? at : 0];
		} else if (event.keyCode === 40) {	// Down
			want = visible[at < 0 ? 0 : Math.min(visible.length - 1, at + 1)];
		} else if (event.keyCode === 38) {	// Up
			want = visible[at < 0 ? visible.length - 1 : Math.max(0, at - 1)];
		} else {
			return;
		}

		event.preventDefault();
		this.selectRow(want, true);
		return true;
	},

	// -- nothing to show ---------------------------------------------------

	/**
	* What you get when not one manifest could be loaded, which in practice
	* means the server is rooted inside a single repository instead of the
	* directory that holds them all. The old version of this page checked its
	* three links with `fetch` to say this; now the failed imports say it, and
	* they say which libraries.
	*
	* @private
	*/
	showEmptyStage: function () {
		this.$.frame.hide();
		this.$.bar.hide();
		this.$.empty.setContent(
			'No sample manifests. The checkouts -- enyo, layout, onyx -- have ' +
			'to sit side by side under the served root, and the server has to ' +
			'be rooted at the directory that holds them, not inside one of ' +
			'them: python3 layout/test-layout/serve.py 8000 /path/that/holds/them'
		);
		this.$.empty.show();
	}
});

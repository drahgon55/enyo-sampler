/**
* The source panel: the second card in the detail side of the sampler.
*
* It shows the code behind the sample on screen -- the kind the sample
* declares and the components it is built from -- so that reading a sample and
* copying it are the same gesture. It deliberately does not show the shell's
* own Panels, Scroller or arrangers: that is the sampler's furniture, not the
* thing being sampled.
*
* What it shows is worked out from the sample's path rather than listed
* anywhere, so nothing has to be maintained per sample and nothing can fall out
* of date:
*
*   `<lib>/samples/<Name>.js`   the sample itself -- always
*   `./<helper>.js`             every relative import that module makes, so
*                               `ListBasicSample` offers `NameGenerator.js`
*                               and the Flickr samples offer `FlickrFallback.js`
*   `<lib>/samples/<Name>.css`  its stylesheet, when it has one -- enyo's and
*                               layout's samples usually do, onyx's share one
*
* Each is fetched from the sibling checkout it lives in, which is already how
* the frame beside it reaches the sample, so the source on screen is read from
* the same file the running sample was loaded from.
*
* @module sampler/Source
*/

import kind from 'enyo/src/kind.js';
import Scroller from 'enyo/src/Scroller/Scroller.js';

import FittableColumns from 'layout/src/FittableColumns.js';
import FittableRows from 'layout/src/FittableRows.js';

import Button from 'onyx/src/Button/Button.js';

import highlight from './highlight.js';

/**
* Relative imports in a sample module. Anchored to `from` so it cannot match
* the word inside a string or a comment that happens to look like one.
*
* @private
*/
var LOCAL_IMPORT = /from\s+'\.\/([A-Za-z0-9_.-]+\.js)'/g;

/**
* Fetches a file, or resolves to `null` if it is not there. A missing
* stylesheet is the ordinary case rather than an error, so this never rejects.
*
* @private
*/
function get (url) {
	return fetch(url).then(function (res) {
		return res.ok ? res.text() : null;
	}, function () {
		return null;
	});
}

export default kind({

	/**
	* @private
	*/
	name: 'sampler.Source',

	/**
	* @private
	*/
	kind: FittableRows,

	/**
	* @private
	*/
	classes: 'sampler-source',

	/**
	* @private
	*/
	components: [
		{name: 'bar', kind: FittableColumns, classes: 'onyx onyx-toolbar sampler-source-bar', components: [
			// The file buttons are built in `showFiles`, because which files a
			// sample has is only known once it has been read.
			{name: 'files', fit: true, classes: 'sampler-files'},
			{name: 'copy', kind: Button, classes: 'sampler-copy', content: 'Copy',
				ontap: 'copyTapped'}
		]},
		{name: 'scroller', kind: Scroller, fit: true, classes: 'sampler-code-scroller', components: [
			{name: 'code', tag: 'pre', classes: 'sampler-code', allowHtml: true}
		]}
	],

	/**
	* @method
	* @private
	*/
	create: kind.inherit(function (sup) {
		return function () {
			sup.apply(this, arguments);
			this.files = [];
			this.buttons = [];
			this.index = 0;
			// Bumped on every `load`. A fetch that comes back after the user
			// has moved on belongs to an older token and is dropped, so a slow
			// response cannot overwrite a newer sample's source.
			this.token = 0;
		};
	}),

	/**
	* Reads a sample's source and shows it. Safe to call again before an
	* earlier call has finished.
	*
	* @param {String} lib - `enyo`, `layout` or `onyx`
	* @param {String} name - the sample's module name, e.g. `PickerSample`
	* @public
	*/
	load: function (lib, name) {
		if (this.lib === lib && this.name === name && this.files.length) {
			return;					// already showing this one
		}
		this.lib = lib;
		this.name = name;

		var token = ++this.token;
		var base = '../' + lib + '/samples/';
		var self = this;

		this.showFiles([]);
		this.$.code.setContent('reading ' + name + '.js…');

		get(base + name + '.js').then(function (js) {
			if (token !== self.token) { return; }
			if (js === null) {
				self.$.code.setContent('Could not read ' + base + name + '.js');
				return;
			}

			var helpers = [];
			var match;
			LOCAL_IMPORT.lastIndex = 0;
			while ((match = LOCAL_IMPORT.exec(js))) {
				if (helpers.indexOf(match[1]) < 0) { helpers.push(match[1]); }
			}

			return Promise.all([
				Promise.all(helpers.map(function (h) { return get(base + h); })),
				get(base + name + '.css')
			]).then(function (rest) {
				if (token !== self.token) { return; }
				var files = [{label: name + '.js', text: js}];
				helpers.forEach(function (h, i) {
					if (rest[0][i] !== null) { files.push({label: h, text: rest[0][i]}); }
				});
				if (rest[1] !== null) {
					files.push({label: name + '.css', text: rest[1]});
				}
				self.showFiles(files);
			});
		});
	},

	/**
	* Rebuilds the row of file buttons and shows the first file.
	*
	* @private
	*/
	showFiles: function (files) {
		this.files = files;
		this.buttons.forEach(function (b) { b.destroy(); });
		this.buttons = [];

		for (var i = 0; i < files.length; i++) {
			this.buttons.push(this.$.files.createComponent({
				kind: Button,
				classes: 'sampler-file',
				content: files[i].label,
				index: i,
				ontap: 'fileTapped'
			}, {owner: this}));
		}
		// The row stays even for a single file: it is the only thing naming
		// what is on screen and what Copy would put on the clipboard, and it is
		// the fitting child of the bar, so hiding it lets Copy slide left.
		this.$.copy.setShowing(files.length > 0);
		this.$.files.render();

		if (files.length) { this.showIndex(0); }
	},

	/**
	* @private
	*/
	fileTapped: function (sender) {
		this.showIndex(sender.index);
		return true;
	},

	/**
	* @private
	*/
	showIndex: function (i) {
		var file = this.files[i];
		if (!file) { return; }
		this.index = i;
		this.buttons.forEach(function (b, n) {
			b.addRemoveClass('sampler-file-on', n === i);
		});
		this.$.code.setContent(highlight(file.text));
		// A new file starts at its own top, not where the last one was left.
		this.$.scroller.setScrollTop(0);
	},

	/**
	* Puts the file on the clipboard.
	*
	* Two paths, in this order for a reason. `document.execCommand('copy')` is
	* the deprecated one, but it is gated only on a live user gesture, so it
	* still works where the Clipboard API is refused -- and it is refused more
	* often than you would think: `clipboard-write` is a permission, and an
	* embedded or policy-restricted browser can simply deny it. It also has to
	* run synchronously inside the tap, because by the time a promise callback
	* runs the gesture has expired, which is why it cannot be the fallback.
	*
	* If both are refused the text is selected instead, so the keyboard can
	* finish the job and the button says so.
	*
	* @private
	*/
	copyTapped: function () {
		var file = this.files[this.index];
		var self = this;
		if (!file) { return true; }

		var done = function (word) {
			self.$.copy.setContent(word);
			self.startJob('uncopy', function () {
				this.$.copy.setContent('Copy');
			}, 1400);
		};

		if (this.copyBySelection(file.text)) {
			done('Copied');
		} else if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(file.text).then(function () {
				done('Copied');
			}, function () {
				self.selectCode();
				done('Press \u2318C');
			});
		} else {
			this.selectCode();
			done('Press \u2318C');
		}
		return true;
	},

	/**
	* Copies through a throwaway textarea rather than by selecting the code on
	* screen: the selection has to be in a focusable, selectable element, and
	* doing it out of sight means the reader's own selection is not hijacked
	* and nothing flashes.
	*
	* @private
	*/
	copyBySelection: function (text) {
		var ok = false;
		var ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', 'readonly');
		// Off-screen rather than hidden: `display: none` cannot be selected.
		ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
		document.body.appendChild(ta);
		try {
			ta.select();
			ta.setSelectionRange(0, text.length);
			ok = document.execCommand('copy');
		} catch (e) {
			ok = false;
		}
		document.body.removeChild(ta);
		return ok;
	},

	/**
	* @private
	*/
	selectCode: function () {
		var node = this.$.code.hasNode();
		if (!node || !window.getSelection) { return; }
		var range = document.createRange();
		range.selectNodeContents(node);
		var sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}
});

/**
* Loads the three libraries' sample manifests.
*
* Each fork keeps a `samples/samples.js` -- a plain data module exporting
* `[{name, label, blurb, css?}]` -- which its own `index.html` renders as a
* menu and its own `sample.html` uses to validate `?s=`. All three have the
* same shape, so the sampler can read them directly instead of keeping its own
* copy of the list. That is the whole reason the counts on this page cannot go
* stale: there is no second list to forget to update.
*
* The imports are relative, and they point *outside* this repository at
* sibling checkouts. That is deliberate -- the samples belong to the library
* they demonstrate -- but it means a missing checkout is the ordinary failure
* here, not an exceptional one. So each import is caught on its own: one
* library going missing costs you that library's samples and nothing else.
*
* @module enyo-sampler/manifests
*/

/**
* The libraries, in the order they are stacked in the list. `blurb` is this
* page's own one-line summary of the library; the per-sample blurbs come from
* the manifests.
*
* @private
*/
var LIBRARIES = [
	{
		id: 'enyo',
		blurb: 'Controls, inputs, repeaters and data lists, scrollers, popups, gesture, media, animation, Ajax.'
	},
	{
		id: 'layout',
		blurb: 'Panels and the arrangers, Fittables, the List family, Slideable, ImageView and PanZoomView.'
	},
	{
		id: 'onyx',
		blurb: 'The widget set: buttons, inputs, menus, pickers, popups, toolbars, sliders, tooltips.'
	}
];

/**
* Reads all three manifests, in parallel, never rejecting.
*
* @return {Promise<Array>} One entry per library, in display order. A library
*	whose manifest could not be loaded comes back with an empty `samples` array
*	and an `error` string instead.
* @public
*/
export default function loadManifests () {
	return Promise.all(LIBRARIES.map(function (lib) {
		// A template literal rather than a bare specifier: this resolves
		// against *this module's* URL, so it reaches the sibling checkout
		// without needing an import-map entry of its own.
		return import(`../${lib.id}/samples/samples.js`).then(
			function (mod) {
				return {id: lib.id, blurb: lib.blurb, samples: mod.default};
			},
			function (err) {
				return {
					id: lib.id,
					blurb: lib.blurb,
					samples: [],
					error: String(err && err.message || err)
				};
			}
		);
	}));
}

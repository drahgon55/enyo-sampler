/**
* A small syntax highlighter for the source panel.
*
* Deliberately hand-written rather than pulled in: these forks have no bundler
* and no build step, and a highlighting library would be the one dependency on
* the page that is not enyo, layout or onyx. It is about eighty lines because
* it only has to read the samples, which are plain ES modules and plain CSS.
*
* It is a character scanner, not a stack of regular expressions, so strings and
* comments cannot be mis-split by a `//` inside a string or a quote inside a
* comment -- the usual way a small highlighter mangles a file.
*
* The one thing it does not do is tell a regular-expression literal from
* division: `/` is only special when it begins a comment. A regex therefore
* renders as plain punctuation with its contents highlighted as if they were
* code, which is wrong but harmless and never leaks into the rest of the line.
* Across all 78 samples there are exactly two regex literals -- the `replace`
* calls in `ImageCarouselSample` and `ListPulldownSample` -- and neither
* contains a `//` or a `/*`, which are the only sequences that would.
*
* CSS goes through the same scanner. It has no keywords in common with JS, but
* comments, strings, numbers and `property:` all land correctly, which is most
* of what a stylesheet is.
*
* @module sampler/highlight
*/

/**
* Enough of ES2015 to cover what the samples use. `kind` is in here because in
* these libraries it is effectively a declaration keyword, and reads like one.
*
* @private
*/
var KEYWORDS = {};
('import from export default const let var function return new this kind ' +
 'if else for while do switch case break continue typeof instanceof ' +
 'null true false undefined delete in of try catch finally throw ' +
 'class extends super async await yield void').split(' ').forEach(function (w) {
	KEYWORDS[w] = true;
});

/**
* @private
*/
function esc (s) {
	return s.replace(/[&<>]/g, function (c) {
		return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
	});
}

/**
* @private
*/
function isWordStart (c) {
	// `-` and `@` are in here for CSS, where `-webkit-box-sizing` and `@media`
	// are single words. In JS that means `a-b` scans as one word rather than
	// three tokens -- which can only ever mis-classify a word, never mis-split
	// a string or a comment, and neither case is highlighted anyway.
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
		c === '_' || c === '$' || c === '-' || c === '@';
}

/**
* @private
*/
function isWord (c) {
	return isWordStart(c) || (c >= '0' && c <= '9');
}

/**
* Turns source text into HTML, with every token the scanner recognises wrapped
* in a `tok-` span. The output is HTML-escaped, so it is safe to hand to a
* control with `allowHtml`.
*
* @param {String} src - the file's text
* @returns {String} HTML
* @public
*/
export default function highlight (src) {
	var out = [];
	var i = 0;
	var n = src.length;

	function push (cls, text) {
		out.push('<span class="tok-' + cls + '">' + esc(text) + '</span>');
	}

	while (i < n) {
		var c = src.charAt(i);
		var j;

		// Comments. Checked before anything else, so a `//` cannot be read as
		// two divisions, and `/*` cannot swallow the file from inside a string.
		if (c === '/' && src.charAt(i + 1) === '/') {
			j = src.indexOf('\n', i);
			if (j < 0) { j = n; }
			push('comment', src.slice(i, j));
			i = j;
			continue;
		}
		if (c === '/' && src.charAt(i + 1) === '*') {
			j = src.indexOf('*/', i + 2);
			j = j < 0 ? n : j + 2;
			push('comment', src.slice(i, j));
			i = j;
			continue;
		}

		// Strings, including template literals. A backslash always takes the
		// next character with it, which is the whole of the escaping rule that
		// matters here.
		if (c === '"' || c === '\'' || c === '`') {
			j = i + 1;
			while (j < n) {
				var d = src.charAt(j);
				if (d === '\\') { j += 2; continue; }
				j++;
				if (d === c) { break; }
			}
			push('string', src.slice(i, Math.min(j, n)));
			i = Math.min(j, n);
			continue;
		}

		if (c >= '0' && c <= '9') {
			j = i;
			while (j < n && /[0-9a-fxA-FX.%]/.test(src.charAt(j))) { j++; }
			push('number', src.slice(i, j));
			i = j;
			continue;
		}

		if (isWordStart(c)) {
			j = i;
			while (j < n && isWord(src.charAt(j))) { j++; }
			var word = src.slice(i, j);
			if (KEYWORDS[word]) {
				push('kw', word);
			} else {
				// A word followed by a colon is a property name -- which in
				// enyo means it is a component's configuration, the part of a
				// sample anyone reading this actually came for. In CSS it is
				// the declaration name, and lands the same way.
				var k = j;
				while (k < n && (src.charAt(k) === ' ' || src.charAt(k) === '\t')) { k++; }
				if (src.charAt(k) === ':') {
					push('prop', word);
				} else {
					out.push(esc(word));
				}
			}
			i = j;
			continue;
		}

		out.push(esc(c));
		i++;
	}

	return out.join('');
}

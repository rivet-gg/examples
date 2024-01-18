import hljs from 'highlight.js';
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

export interface ErrorResponse {
	code: number;
	response: object;
}

export function formatCode<T extends Object>(res: T) {
	let highlightedCode = hljs.highlight(JSON.stringify(res, undefined, '\t'), {
		language: 'json'
	}).value;

	return html`<code class="theme1">${unsafeHTML(highlightedCode)}</code>`;
}

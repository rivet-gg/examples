import styles from '../styles/chat.scss';
import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

declare global {
	interface Window {
		RivetNative: any;
	}
}

// Add window "onload" handler
window.addEventListener('load', () => {
	let myApp = document.createElement('my-app');
	document.body.append(myApp);
});

// Need to create iOS- and Android-specific client IDs to be able to use custom redirect URI

interface OAuthConfig {
    url: string,
    callbackUrl: string
}

function getGoogleOAuth(): OAuthConfig {
    // Both of these work, but the iOS legacy method works on Android too
	// if (window.RivetNative.core.platform === 'apple') {
		return {
			url:
				'https://accounts.google.com/o/oauth2/v2/auth' +
				'?client_id=' +
				encodeURIComponent(
					'686291406375-m2t7rns0pmuce0jm0l3ghheajglkehgs.apps.googleusercontent.com'
				) +
				'&redirect_uri=' +
				encodeURIComponent('game.rivet.test-game:/') +
				'&response_type=code' +
				'&scope=email%20profile',
			callbackUrl: 'game.rivet.test-game'
		};
	// } else if (window.RivetNative.core.platform === 'google') {
	// 	return {
	// 		url:
	// 			'https://accounts.google.com/o/oauth2/v2/auth' +
	// 			'?client_id=' +
	// 			encodeURIComponent(
	// 				'686291406375-s31j2s1grtact8326nuaqenr9fk0jidf.apps.googleusercontent.com'
	// 			) +
	// 			'&redirect_uri=' +
	// 			encodeURIComponent('https://rivet.gg') +
	// 			'&response_type=code' +
	// 			'&scope=email%20profile',
	// 		callbackUrl: 'https://rivet.gg'
	// 	};
	// } else {
	// 	throw new Error('Unknown platform');
	// }
}

function getGitHubOAuth(): OAuthConfig {
	return {
		url:
			'https://github.com/login/oauth/authorize' +
			'?client_id=47cdc7dc0913472d536e' +
			'&redirect_uri=game.rivet.test-game://oauth-callback',
		callbackUrl: 'game.rivet.test-game'
	};
}

/*
	This is a basic custom HTML element powered by the "lit" library.
	Our test game's environment exists within this class.
*/
@customElement('my-app')
export default class MyApp extends LitElement {
	static styles = unsafeCSS(styles);

	@property({ type: Boolean })
	hasRivetNative: boolean = !!window.RivetNative;

	@property({ type: String })
	shareText: string = '';

	@property({ type: String })
	presentRatingMessage: string = '';

	@property({ type: Object })
	oauthResponse: any;

	@property({ type: Object })
	oauthConfig: OAuthConfig = { url: '', callbackUrl: '' }

	@property({ type: Object })
	signInWithAppleResponse: any;

	@property({ type: Object })
	interstitialAdResponse: any;

	@property({ type: Object })
	rewardAdResponse: any;

	@property({ type: Object })
	loadError: any = null;

	onPresentOAuth() {
		window.RivetNative.authentication
			.presentOAuth(this.oauthConfig)
			.then(x => {
				console.log('OAuth response', x);
				this.oauthResponse = x;
			})
			.catch(x => {
				console.log('OAuth error', x);
				this.oauthResponse = { error: x };
			});
	}

	onPresentSignInWithApple() {
		window.RivetNative.authentication
			.presentSignInWithApple({ scopes: ['full_name', 'email'] })
			.then(x => (this.signInWithAppleResponse = x))
			.catch(x => (this.signInWithAppleResponse = { error: x }));
	}

	onShowInterstitial() {
		window.RivetNative.adMob
			.showInterstitial('interstitial')
			.then(x => (this.interstitialAdResponse = x))
			.catch(x => (this.interstitialAdResponse = { error: x }));
	}

	onShowReward() {
		window.RivetNative.adMob
			.showReward('reward')
			.then(x => (this.rewardAdResponse = x))
			.catch(x => (this.rewardAdResponse = { error: x }));
	}

	endpointOverlay(): string | null {
		if (!this.hasRivetNative) {
			return 'You must be using a Rivet Native application.';
		} else {
			return null;
		}
	}

	render() {
		if (this.loadError) {
			return html`<div id="base">
				<div id="error">
					<h2>Error</h2>
					<p>${this.loadError}</p>
				</div>
			</div>`;
		}

		console.log('native', window.RivetNative);

		return html`<div id="base">
			<div id="center">
				<h1 id="title">Native API</h1>
				<p>These APIs will only work from within an applciation bundled with Rivet Native.</p>

				${this.renderHaptic()} ${this.renderShareContent()} ${this.renderPresentRating()}
				${this.renderOAuth()} ${this.renderSignInWithApple()} ${this.renderBannerAd()}
				${this.renderInterstitialAd()} ${this.renderRewardAd()}
			</div>
		</div> `;
	}

	renderHaptic() {
		return html`
			<endpoint-display .title=${'Haptics'} .overlay=${this.endpointOverlay()}>
				<div slot="description">Use haptics to create a more immersive game feedback.</div>
				<div slot="actions">
					<code>RivetNative.haptic.light()</code>
					<button @click=${() => window.RivetNative.haptic.light()}>Light</button>
					<code>RivetNative.haptic.medium()</code>
					<button @click=${() => window.RivetNative.haptic.medium()}>Medium</button>
					<code>RivetNative.haptic.heavy()</code>
					<button @click=${() => window.RivetNative.haptic.heavy()}>Heavy</button>
				</div>
			</endpoint-display>
		`;
	}

	renderShareContent() {
		return html`
			<endpoint-display .title=${'Share Content'} .overlay=${this.endpointOverlay()}>
				<div slot="description">Use share content to enable sharing game links and rich content.</div>
				<div slot="actions">
					<code>RivetNative.share.share({ text: ${JSON.stringify(this.shareText)} })</code>
					<input
						type="text"
						placeholder="Share text"
						@change=${(ev: InputEvent) =>
							(this.shareText = (ev.target as HTMLInputElement).value)}
					/>
					<button @click=${() => window.RivetNative.share.share({ text: this.shareText })}>
						Share Content
					</button>
				</div>
			</endpoint-display>
		`;
	}

	renderPresentRating() {
		return html`
			<endpoint-display .title=${'Present Rating'} .overlay=${this.endpointOverlay()}>
				<div slot="description">Use rating presents to increase ratings for the store listing.</div>
				<div slot="actions">
					<code
						>RivetNative.rate.present({ message: ${JSON.stringify(this.presentRatingMessage)}
						})</code
					>
					<input
						type="text"
						placeholder="Present rating message"
						@change=${(ev: InputEvent) =>
							(this.presentRatingMessage = (ev.target as HTMLInputElement).value)}
					/>
					<button
						@click=${() =>
							window.RivetNative.rate.present({ message: this.presentRatingMessage })}
					>
						Present Rating
					</button>
				</div>
			</endpoint-display>
		`;
	}

	renderOAuth() {
		return html`
			<endpoint-display
				.title=${'OAuth'}
				.overlay=${this.endpointOverlay()}
				.response=${this.oauthResponse}
			>
				<div slot="description">
					<p>Examples:</p>
					<ul>
						<li>
							<a
								href="https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid"
								target="_blank"
								>Google</a
							>
						</li>
						<li>
							<a
								href="https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps"
								target="_blank"
								>GitHub</a
							>
						</li>
					</ul>
				</div>
				<div slot="actions">
					<input
						type="text"
						placeholder="URL"
						.value=${this.oauthConfig.url}
						@change=${(ev: InputEvent) => {
							this.oauthConfig.url = (ev.target as HTMLInputElement).value;
                            this.requestUpdate("oauthConfig");
                        }}
					/>
					<input
						type="text"
						placeholder="Redirect URL"
						.value=${this.oauthConfig.callbackUrl}
						@change=${(ev: InputEvent) => {
							this.oauthConfig.callbackUrl = (ev.target as HTMLInputElement).value;
                            this.requestUpdate("oauthConfig");
                        }}
					/>
					<button @click=${() => (this.oauthConfig = getGoogleOAuth())}>Populate Google</button>
					<button @click=${() => (this.oauthConfig = getGitHubOAuth())}>Populate GitHub</button>
					<button @click=${this.onPresentOAuth.bind(this)}>Present</button>
				</div>
			</endpoint-display>
		`;
	}

	renderSignInWithApple() {
		return html`
			<endpoint-display
				.title=${'Sign In with Apple'}
				.overlay=${this.endpointOverlay()}
				.response=${this.signInWithAppleResponse}
			>
				<div slot="description">Apple only.</div>
				<div slot="actions">
					<code
						>RivetNative.authentication.presentSignInWithApple({ scopes: ["full_name", "email"]
						})</code
					>
					<button @click=${this.onPresentSignInWithApple.bind(this)}>Present</button>
				</div>
			</endpoint-display>
		`;
	}

	renderBannerAd() {
		return html`
			<endpoint-display .title=${'Banner Ad'} .overlay=${this.endpointOverlay()}>
				<div slot="description"></div>
				<div slot="actions">
					<button @click=${() => window.RivetNative.adMob.showBanner('banner')}>Show</button>
					<button @click=${() => window.RivetNative.adMob.hideBanner()}>Hide</button>
				</div>
			</endpoint-display>
		`;
	}

	renderInterstitialAd() {
		return html`
			<endpoint-display
				.title=${'Interstitial Ad'}
				.overlay=${this.endpointOverlay()}
				.response=${this.interstitialAdResponse}
			>
				<div slot="description"></div>
				<div slot="actions">
					<code>RivetNative.adMob.ShowInterstitial("Interstitial")</code>
					<button @click=${this.onShowInterstitial.bind(this)}>Show</button>
				</div>
			</endpoint-display>
		`;
	}

	renderRewardAd() {
		return html`
			<endpoint-display
				.title=${'Reward Ad'}
				.overlay=${this.endpointOverlay()}
				.response=${this.rewardAdResponse}
			>
				<div slot="description"></div>
				<div slot="actions">
					<code>RivetNative.adMob.showReward("reward")</code>
					<button @click=${this.onShowReward.bind(this)}>Show</button>
				</div>
			</endpoint-display>
		`;
	}
}

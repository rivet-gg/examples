import * as tileSandUrl from "./assets/tileSand1.png";
import * as tankBodyRedUrl from "./assets/tankBody_red_outline.png";
import * as tankBodyBlueUrl from "./assets/tankBody_blue_outline.png";
import * as tankBarrelRedUrl from "./assets/tankRed_barrel1_outline.png";
import * as tankBarrelBlueUrl from "./assets/tankBlue_barrel1_outline.png";
import * as bulletUrl from "./assets/shotRed.png";
import * as wallUrl from "./assets/barricadeWood.png";
import * as barrelUrl from "./assets/barrelBlack_top.png";
import * as explosionUrl from "./assets/explosion4.png";
import * as turretBodyUrl from "./assets/tankBody_dark_outline.png";
import * as turretBarrelUrl from "./assets/specialBarrel2_outline.png";

export class Assets {
	public scaleFactor = 1;

	public tileSand = this._load(tileSandUrl);
	public tankBodyRed = this._load(tankBodyRedUrl);
	public tankBodyBlue = this._load(tankBodyBlueUrl);
	public tankBarrelRed = this._load(tankBarrelRedUrl);
	public tankBarrelBlue = this._load(tankBarrelBlueUrl);
	public bullet = this._load(bulletUrl);
	public wall = this._load(wallUrl);
	public barrel = this._load(barrelUrl);
	public explosion = this._load(explosionUrl);
	public turretBody = this._load(turretBodyUrl);
	public turretBarrel = this._load(turretBarrelUrl);

	private _load(url: string): HTMLImageElement {
		const img = new Image();
		img.src = url;
		return img;
	}
}

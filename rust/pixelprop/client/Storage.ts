export class Storage {
    /* Utils */
    public static getItem(key: string, defaultValue: string): string {
        let value = localStorage.getItem(key);
        if (value == undefined) {
            return defaultValue;
        } else {
            return value;
        }
    }

    public static setItem(key: string, value: string) {
        localStorage.setItem(key, value);
    }

    /* Settings */
    public static get username(): string { return this.getItem("username", ""); }
    public static set username(value: string) { this.setItem("username", value); }

    public static get characterId(): string { return this.getItem("characterId", "basic"); }
    public static set characterId(value: string) { this.setItem("characterId", value); }

    public static get colorCorrectionEnabled(): boolean { return this.getItem("colorCorrectionEnabled", "true") === "true"; }
    public static set colorCorrectionEnabled(value: boolean) { this.setItem("colorCorrectionEnabled", value.toString()); }

    public static get bloomEffectEnabled(): boolean { return this.getItem("bloomEffectEnabled", "true") === "true"; }
    public static set bloomEffectEnabled(value: boolean) { this.setItem("bloomEffectEnabled", value.toString()); }

    public static get lensEffectEnabled(): boolean { return this.getItem("lensEffectEnabled", "true") === "true"; }
    public static set lensEffectEnabled(value: boolean) { this.setItem("lensEffectEnabled", value.toString()); }

}

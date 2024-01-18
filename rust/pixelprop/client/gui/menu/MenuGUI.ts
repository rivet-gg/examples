import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import measureText = require("text-width");
import {Utils} from "../../Utils";
import {int} from "../../types";
import {HomeMenu} from "./HomeMenu";
import {CustomizeMenu} from "./CustomizeMenu";
import {ShopMenu} from "./ShopMenu";
import {SettingsMenu} from "./SettingsMenu";
import {HelpMenu} from "./HelpMenu";

export class MenuGUI extends GUI.Rectangle {
    private static TAB_INDICATOR_NAME = "Tab Underline";

    public selectedTab: int = 0;
    public tabs = [
        { name: "Home", tabGUI: HomeMenu },
        { name: "Customize", tabGUI: CustomizeMenu },
        { name: "Shop", tabGUI: ShopMenu },
        { name: "Settings", tabGUI: SettingsMenu },
        { name: "Help", tabGUI: HelpMenu },
    ];

    private menuTabs: GUI.Container[] = [];
    private menuContentContainer: GUI.Container;
    public menuContent: GUI.Container; // The current content being displayed

    constructor() {
        super("Menu GUI");

        const logoWidth = 256;
        const logoHeight = 128;
        const contentWidth = 500;
        const contentHeight = 500;
        const adWidth = 300;
        const adHeight = 250;
        const tabWidth = adWidth;
        const spacing = 40;

        this.background = "rgba(0,0,0,0.75)";
        this.thickness = 0;
        this.fontFamily = Utils.fontFamily;

        /* Logo */
        const logo = new BABYLON.GUI.Image("Logo", "/img/logo-large.png");
        logo.width = logoWidth + "px";
        logo.height = logoHeight + "px";
        logo.top = -contentHeight / 2 + 4; // We add 4 to center with the double lines
        logo.zIndex = 100;
        // logo.shadowBlur = 50;
        // logo.shadowColor = "rgba(255,0,0,0.2)";
        Utils.flickerGUIItem(logo);
        this.addControl(logo);

        /* Center */
        const menuCenter = new GUI.Rectangle("Menu Center");
        menuCenter.width = 1;
        menuCenter.height = contentHeight + "px";
        menuCenter.thickness = 0;
        this.addControl(menuCenter);

        /* Fancy Lines */
        function addLine(verticalAlignment: number, width: number, left: number, top: number) {
            const line = new GUI.Rectangle("Fancy Line");
            line.width = width + "px";
            line.height = "4px";
            line.left = left + "px";
            line.top = top + "px";
            line.verticalAlignment = verticalAlignment;
            line.background = "white";
            line.thickness = 0;
            Utils.flickerGUIItem(line);
            menuCenter.addControl(line);
        }

        const fancyLineWidth = contentWidth + adWidth + tabWidth + spacing * 2;
        const logoGap = logoWidth + spacing;
        const topLineWidth = fancyLineWidth / 2 - logoGap / 2;

        addLine(GUI.Control.VERTICAL_ALIGNMENT_TOP, topLineWidth, -(topLineWidth + logoGap) / 2, 0);
        addLine(GUI.Control.VERTICAL_ALIGNMENT_TOP, topLineWidth, -(topLineWidth + logoGap) / 2, 8);
        addLine(GUI.Control.VERTICAL_ALIGNMENT_TOP, topLineWidth, (topLineWidth + logoGap) / 2, 0);
        addLine(GUI.Control.VERTICAL_ALIGNMENT_TOP, topLineWidth, (topLineWidth + logoGap) / 2, 8);

        addLine(GUI.Control.VERTICAL_ALIGNMENT_BOTTOM, fancyLineWidth, 0, 0);
        addLine(GUI.Control.VERTICAL_ALIGNMENT_BOTTOM, fancyLineWidth, 0, -8);

        /* Buttons */
        const menuTabs = new GUI.StackPanel("Menu Buttons");
        menuTabs.width = tabWidth + "px";
        menuTabs.left = -(tabWidth / 2 + contentWidth / 2 + spacing) + "px";
        menuCenter.addControl(menuTabs);

        for (let i = 0; i < this.tabs.length; i++) {
            const tabName = this.tabs[i].name;

            const tab = new GUI.Button("Menu Tab " + tabName);
            tab.height = "60px";
            tab.thickness = 0;
            tab.onPointerUpObservable.add(() => this.switchTab(i));
            tab.transformCenterX = 1;
            menuTabs.addControl(tab);

            const fontSize = 25;
            const tabText = new GUI.TextBlock("Tab Name", tabName);
            tabText.color = "white";
            tabText.textHorizontalAlignment = GUI.TextBlock.HORIZONTAL_ALIGNMENT_RIGHT;
            tabText.fontFamily = Utils.fontFamily;
            tabText.fontSize = fontSize;
            tab.addControl(tabText);

            const textWidth = measureText(tabName, { family: Utils.fontFamily, size: fontSize });
            const underlineWidth = textWidth * 1.0;
            // const underlineWidth = 30;
            const tabUnderline = new GUI.Rectangle(MenuGUI.TAB_INDICATOR_NAME);
            tabUnderline.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
            tabUnderline.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
            tabUnderline.width = underlineWidth + "px";
            tabUnderline.height = 4 + "px";
            tabUnderline.top = "-4px";
            tabUnderline.background = "white";
            tabUnderline.thickness = 0;
            tab.addControl(tabUnderline);

            this.menuTabs.push(tab);
        }

        /* Ad */
        const adContainer = new GUI.Rectangle("Ad Container");
        adContainer.width = adWidth + "px";
        adContainer.height = adHeight + "px";
        adContainer.left = (adWidth / 2 + contentWidth / 2 + spacing) + "px";
        // adContainer.transformCenterX = 0;
        adContainer.background = "green";
        adContainer.thickness = 2;
        // menuCenter.addControl(adContainer);

        /* Menu Content */
        this.menuContentContainer = new GUI.Container("Menu Content Container");
        this.menuContentContainer.background = "transparent";
        this.menuContentContainer.width = contentWidth + "px";
        this.menuContentContainer.paddingTop = this.menuContentContainer.paddingBottom = logoHeight / 2; // Don't overlap with logo
        this.menuContentContainer.zIndex = -10;
        menuCenter.addControl(this.menuContentContainer);

        const text = new GUI.TextBlock("Temp Add Text", "ADVERTISEMENT");
        adContainer.addControl(text);

        this.switchTab(0);
    }

    private switchTab(index: int) {
        this.selectedTab = index;
        const tab = this.tabs[index];

        // Set the state of the tabs
        for (let i = 0; i < this.menuTabs.length; i++) {
            const tab = this.menuTabs[i];
            const isActive = i == index;
            tab.alpha = isActive ? 1.0 : 0.3;
            const underline = tab.children.filter(c => c.name == MenuGUI.TAB_INDICATOR_NAME)[0] as GUI.Rectangle;
            underline.isVisible = isActive;
        }

        // Add the menu container
        if (this.menuContent) {
            this.menuContentContainer.removeControl(this.menuContent);
        }
        const newContent = new tab.tabGUI();
        this.menuContentContainer.addControl(newContent);
        this.menuContent = newContent;
    }
}

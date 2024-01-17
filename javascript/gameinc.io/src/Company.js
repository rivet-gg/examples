const { employeeProfiles, lawyerProfiles } = require("./profiles.js");
const { Employee } = require("./Employee");
const { Lawyer } = require("./Lawyer");
const config = require("./config");
const utils = require("./utils");

class Company {
    constructor(socket, name) {
        this.id = utils.generateID();
        this.socket = socket;
        this.name = name;
        this.money = 10000;
        this.games = [];
        this.lawsuits = [];
        this.disconnected = false;

        this.currentHiringType = undefined; // game or lawsuit
        this.currentHiringTarget = undefined; // Id of target
        this.currentHiringOptions = undefined; // List of options
        this.currentHiringOptions2 = undefined;
    }

    update(dt) {
        // Update all games
        for (let game of this.games) {
            game.update(dt)
        }

        // Update lawsuits if it's company A
        for (let lawsuit of this.lawsuits) {
            if (lawsuit.companyA === this || lawsuit.companyA.disconnected) {
                lawsuit.update(dt);
            }
        }
    }

    selectHiringOptions(type, target) {
        // Choose the options
        this.currentHiringType = type;
        this.currentHiringTarget = target;
        if (type == "game"){
            if (this.currentHiringOptions) return;
            const employeeList = this.getProfilesOfType(type);
            this.currentHiringOptions = [];
            this.chooseProfile(employeeList, this.currentHiringOptions);
            this.chooseProfile(employeeList, this.currentHiringOptions);
        } else {
            if (this.currentHiringOptions2) return;
            const employeeList = this.getProfilesOfType(type);
            this.currentHiringOptions2 = [];
            this.chooseProfile(employeeList, this.currentHiringOptions2);
            this.chooseProfile(employeeList, this.currentHiringOptions2);
        }
    }

    getProfilesOfType(type) {
        if (type === "game") {
            // Only employees which have a high enough level, cap money at 0 so negative income can hire still
            return employeeProfiles.filter(e => Math.max(this.money, 0) >= e.level.startRank);
        } else {
            return lawyerProfiles;
        }
    }

    chooseProfile(profileList, hiringList) {
        // Filter profile list
        profileList = profileList.filter(e1 => {
            return hiringList.findIndex(e2 => e1.id == e2.id) == -1;
        });

        // Find the total rarity
        let totalRarity = 0;
        for (let employee of profileList) {
            totalRarity += employee.rarity;
        }

        // Find the target employee
        let targetRarity = Math.random() * totalRarity;
        let countingRarity = 0;
        for (let employee of profileList) {
            countingRarity += employee.rarity;
            if (countingRarity >= targetRarity) {
                hiringList.push(employee);
                return;
            }
        }

        throw `Failed to find employee for rarity. (totalRarity=${totalRarity}, targetRarity=${targetRarity}, countingRarity=${countingRarity}, employeeList=${profileList.length} itmes)`;
    }

    hireWithIndex(index) {
        // Get the profile
        let profile;
        if (this.currentHiringType == "game") {
            if (!this.currentHiringOptions) return;
            if (index == -1) {
                profile = this.chooseProfile(this.getProfilesOfType(this.currentHiringType), this.currentHiringOptions);
                profile = this.currentHiringOptions[this.currentHiringOptions.length - 1];
            } else {
                profile = this.currentHiringOptions[index];
            }
        } else {
            if (!this.currentHiringOptions2) return;
            if (index == -1) {
                this.chooseProfile(this.getProfilesOfType(this.currentHiringType), this.currentHiringOptions2);
                profile = this.currentHiringOptions2[this.currentHiringOptions2.length - 1];
            } else {
                profile = this.currentHiringOptions2[index];
            }
        }

        if (!profile) return;

        // Append to the lists
        if (this.currentHiringType === "game") {
            const game = this.gameWithId(this.currentHiringTarget);
            if (!game) return;
            if (game.employees.length >= config.employeeLimits[game.quality]) return;
            game.employees.push(new Employee(game, profile));
            delete this.currentHiringOptions;
        } else {
            const lawsuit = this.lawsuitWithId(this.currentHiringTarget);
            if (!lawsuit) return;
            if ((lawsuit.companyA.id == this.id && lawsuit.lawyersA.length >= config.employeeLimits[lawsuit.size]) ||
                (lawsuit.companyB.id == this.id && lawsuit.lawyersB.length >= config.employeeLimits[lawsuit.size])) return;
            if (lawsuit.companyA.id == this.id){
                lawsuit.lawyersA.push(new Lawyer(lawsuit, this, profile));
            }
            else{
                lawsuit.lawyersB.push(new Lawyer(lawsuit, this, profile));
            }
            delete this.currentHiringOptions2;
        }

    }

    makeMoney() {
        this.money += 250;
    }

    gameWithId(id) {
        for (let game of this.games) {
            if (game.id === id) {
                return game;
            }
        }

        return undefined;
    }

    lawsuitWithId(id) {
        for (let lawsuit of this.lawsuits) {
            if (lawsuit.id === id) {
                return lawsuit;
            }
        }

        return undefined;
    }

    serializeLocal() {
        return {
            id: this.id,
            name: this.name,
            money: Math.floor(this.money),
            games: this.games.map(g => g.serializeLocal()),
            lawsuits: this.lawsuits.map(l => l.serializeLocal())
        };
    }

    serializeLeaderboard() {
        return {
            id: this.id,
            name: this.name,
            money: Math.floor(this.money),
            games: this.games.count
        };
    }

    serializeLawsuit() {
        return {
            id: this.id,
            name: this.name,
            money: this.money
        }
    }
}

module.exports = { Company };

const utils = require("./utils");
const config = require("./config");

class EmployeeProfile {
    constructor(profileConfig) {
        this.id = utils.generateID();
        this.name = profileConfig.name;
        this.salary = profileConfig.salary; // Salary per year
        this.workSpeed = profileConfig.workSpeed; // Lines of code per day
        this.hype = profileConfig.hype; // Number of followers
        this.rarity = profileConfig.rarity;
        this.levelId = profileConfig.levelId;
        this.level = config.levels[profileConfig.levelId];
    }

    serialize() {
        return {
            id: this.id,
            name: this.name,
            salary: Math.floor(this.salary),
            workSpeed: Math.floor(this.workSpeed),
            hype: this.hype,
            rarity: this.rarity,
            levelId: this.levelId
        };
    }
}

class Employee {
    constructor(game, profile) {
        this.id = utils.generateID();
        this.game = game;
        this.profile = profile;
    }

    update(dt) {
        // Apply the effects of the employee
        if (!this.game.isFinished) {
            // Charge the company
            this.game.company.money -= this.profile.salary * utils.yearsToSeconds * dt;

            // Write code
            this.game.linesOfCode += this.profile.workSpeed * dt;
        }
    }

    serializeLocal() {
        return {
            id: this.id,
            profile: this.profile.serialize()
        };
    }
}

module.exports = { EmployeeProfile, Employee };

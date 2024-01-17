const utils = require("./utils");

class LawyerProfile {
    constructor(config) {
        this.id = utils.generateID();
        this.name = config.name;
        this.salary = config.salary; // Salary per year
        this.workSpeed = config.workSpeed; // Work/s
        this.rarity = config.rarity;
    }

    serialize() {
        return {
            id: this.id,
            name: this.name,
            salary: Math.floor(this.salary),
            workSpeed: this.workSpeed,
            rarity: this.rarity
        };
    }
}

class Lawyer {
    constructor(lawsuit, company, profile) {
        this.id = utils.generateID();
        this.lawsuit = lawsuit;
        this.company = company;
        this.profile = profile;
    }

    update(dt) {
        // Apply the effects of the lawyer
        if (!this.lawsuit.isFinished) {
            // Charge the company
            this.company.money -= this.profile.salary * utils.yearsToSeconds * dt;

            // Determine which direction to work in
            let workDirection;
            if (this.company === this.lawsuit.companyA) {
                workDirection = 1;
            } else if (this.company === this.lawsuit.companyB) {
                workDirection = -1;
            } else {
                console.error("Invalid company for lawsuit.");
                return;
            }

            // Work on the lawsuit
            this.lawsuit.progress += this.profile.workSpeed * dt * workDirection;
        }
    }

    serializeLocal() {
        return {
            id: this.id,
            profile: this.profile.serialize()
        };
    }
}

module.exports = { LawyerProfile, Lawyer };

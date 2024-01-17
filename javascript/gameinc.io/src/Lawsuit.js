const utils = require("./utils");
const config = require("./config");

class Lawsuit { // TODO: Calculate reward
    constructor(size, companyA, companyB) {
        this.id = utils.generateID();
        this.startTime = Date.now();
        this.size = size;
        this.progress = 0;
        this.totalProgress = size + 1;
        this.completed = false;
        this.companyA = companyA;
        this.companyB = companyB;
        this.lawyersA = [];
        this.lawyersB = [];
        this.calculateReward();
    }

    get isFinished() { return this.winner !== 0; }

    get winner() {
        if (this.progress <= -this.totalProgress || this.companyA.money <= -config.debtLimit || this.companyA.disconnected) {
            return 1;
        } else if (this.progress >= this.totalProgress || this.companyB.money <= -config.debtLimit || this.companyB.disconnected) {
            return -1;
        } else {
            return 0;
        }
    }

    get winningCompany() {
        if (this.winner === 1) {
            return this.companyB;
        } else if (this.winner === -1) {
            return this.companyA;
        } else {
            return 0;
        }
    }

    get losingCompany() {
        if (this.winner === 1) {
            return this.companyA;
        } else if (this.winner === -1) {
            return this.companyB;
        } else {
            return 0;
        }
    }

    get maxLawyers() {
        return config.employeeLimits[this.size];
    }

    lawyerListForCompany(company) {
        return this.companyA === company ? this.lawyersA : this.lawyersB;
    }

    canHire(company) {
        return (this.lawyerListForCompany(company).length + 1) <= this.maxLawyers;
    }

    update(dt) {
        // Only update from Company A, since we don't want to update this twice
        if (!this.isFinished) {
            // Update the lawyers
            for (let lawyer of this.lawyersA) {
                lawyer.update(dt);
            }
            for (let lawyer of this.lawyersB) {
                lawyer.update(dt);
            }

            // Cap the progress
            this.progress = Math.sign(this.progress) * Math.min(Math.abs(this.progress), this.totalProgress);
        }

        // Determine revenue and decay if needed
        if (this.isFinished && !this.completed) {
            const winner = this.winningCompany;
            const loser = this.losingCompany;

            // Reward the cash; can't charge more than the max of the loser
            const finalReward = Math.max(Math.min(this.reward, loser.money + config.debtLimit), 0);
            winner.money += finalReward;
            loser.money -= finalReward;

            if (loser.money <= -config.debtLimit){
                loser.disconnected = true;
            }

            // Complete
            this.completed = true;
        }
    }

    calculateReward() {
        switch (this.size) {
            case 0:
                this.reward = 100000 + Math.floor(Math.random() * 900000);
                break;
            case 1:
                this.reward = 1000000 + Math.floor(Math.random() * 9000000);
                break;
            case 2:
                this.reward = 10000000 + Math.floor(Math.random() * 90000000);
                break;
        }
        //Limit Lawsuit size to the total money the player suing has
        if (this.reward > this.companyA.money){this.reward = this.companyA.money}
    }

    serializeLocal() {
        return {
            id: this.id,
            startTime: this.startTime,
            size: this.size,
            progress: this.progress,
            totalProgress: this.totalProgress,
            completed: this.completed,
            winner: this.winner,
            reward: this.reward,
            companyA: this.companyA.serializeLawsuit(),
            companyB: this.companyB.serializeLawsuit(),
            lawyersA: this.lawyersA.map(p => p.serializeLocal()),
            lawyersB: this.lawyersB.map(p => p.serializeLocal())
        }
    }
}

module.exports = { Lawsuit };

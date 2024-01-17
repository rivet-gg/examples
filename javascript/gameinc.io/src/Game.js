const utils = require("./utils");
const config = require("./config");

class Game {
    constructor(company, name, quality) {
        this.id = utils.generateID();
        this.startTime = Date.now();
        this.company = company;
        this.name = name;
        this.quality = quality;
        this.conversion = 0;
        this.rpm = 0;
        this.revenue = -1; // Revenue per year
        this.revenueDecay = -1; // Percent decrease per year
        this.linesOfCode = 0;
        this.calculateTotalLinesOfCode();
        this.employees = [];
    }

    get isFinished() { return this.linesOfCode >= this.totalLinesOfCode; }

    get maxEmployees() { return config.employeeLimits[this.quality]; }

    get canHire() { return !this.isFinished && (this.employees.length + 1) <= this.maxEmployees; }

    update(dt) {
        // Update the employees
        if (!this.isFinished) {
            for (let employee of this.employees) {
                employee.update(dt);
            }
        }

        // Cap the LOC
        if (this.linesOfCode > this.totalLinesOfCode) {
            this.linesOfCode = this.totalLinesOfCode;
        }

        // Determine revenue and decay if needed
        if (this.isFinished && this.revenue === -1) {
            this.calculateRevenueValues();
        }

        // If finished, reap profits
        if (this.isFinished) {
            this.company.money += this.revenue * utils.yearsToSeconds * dt;
            this.revenue = Math.max(this.revenue - this.revenue * this.revenueDecay * dt, 0);
        }
    }

    calculateTotalLinesOfCode() {
        switch (this.quality) {
            case 0:
                this.totalLinesOfCode = 500 + Math.floor(Math.random() * 2000);
                break;
            case 1:
                this.totalLinesOfCode = 5000 + Math.floor(Math.random() * 20000);
                break;
            case 2:
                this.totalLinesOfCode = 25000 + Math.floor(Math.random() * 150000);
                break;
        }
    }

    calculateRevenueValues() {
        let yearlyRevenue = 0;

        // Base value
        switch (this.quality) {
            case 0:
                yearlyRevenue += 500 + Math.random() * 8000;
                break;
            case 1:
                yearlyRevenue += 2000 + Math.random() * 40000;
                break;
            case 2:
                yearlyRevenue += 20000 + Math.random() * 500000;
        }

        // Calculate stats
        this.conversion = 0.1 + Math.pow(Math.random(), 1.3) * 0.5; // Between 10% and 50% of users use it
        this.rpm = (0.10 + Math.pow(Math.random(), 8) * 2.9); // Between $0.10 and $3.00 per million users

        // Value from influencers
        let totalFollowers = this.employees.reduce((a, b) => a + b.profile.hype, 0);
        totalFollowers *= this.conversion;
        yearlyRevenue += totalFollowers * this.rpm;

        this.revenue = Math.max(yearlyRevenue, 0);
        this.revenueDecay = 0.02 + Math.pow(Math.random(), 2) * 0.015; // Decay between 0.5% and 2% per year
    }

    serializeLocal() {
        return {
            id: this.id,
            startTime: this.startTime,
            name: this.name,
            quality: this.quality,
            conversion: this.conversion,
            rpm: this.rpm,
            revenue: Math.floor(this.revenue),
            revenueDecay: this.revenueDecay,
            totalLinesOfCode: this.totalLinesOfCode,
            linesOfCode: Math.floor(this.linesOfCode),
            employees: this.employees.map(p => p.serializeLocal())
        };
    }
}

module.exports = { Game };

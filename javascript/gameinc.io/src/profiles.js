const { EmployeeProfile } = require("./Employee");
const { LawyerProfile } = require("./Lawyer");
const config = require("./config");

const employeeProfiles = config.employees.map(p => new EmployeeProfile(p));

const lawyerProfiles = config.lawyers.map(p => new LawyerProfile(p));

module.exports = { employeeProfiles, lawyerProfiles };
